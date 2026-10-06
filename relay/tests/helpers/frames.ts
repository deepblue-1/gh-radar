/**
 * Phase 15 Plan 02 — RELAY-01. 테스트용 **응답 프레임** 빌더 (게이트웨이 → relay 방향).
 *
 * relay 는 응답을 만들지 않으므로 이 빌더들은 프로덕션 코드가 아니다. 그러나
 * `envelope.test.ts`(파서 단위 테스트)와 `fake-gateway.ts`(소켓 스텁)가 **같은**
 * 프레임을 필요로 하므로 한 곳에 둔다 — 두 벌이면 스키마가 바뀔 때 한쪽만 고쳐진다.
 *
 * 설계 규율: 모든 필드가 override 가능하다. 파서 가드를 시험하려면 **일부러 깨진**
 * 프레임(ISIN 11자, `change_sign` 0자, 호가 15단 등)을 만들 수 있어야 한다.
 *
 * 반환값은 Envelope 페이로드(Uint8Array)다. 길이 프레이밍은 `codec.frame()` 이 한다.
 */
import * as flatbuffers from "flatbuffers";

import { AccountEntry } from "../../src/generated/stock-dma/account-entry.js";
import { AccountState } from "../../src/generated/stock-dma/account-state.js";
import { DisableStrategiesResp } from "../../src/generated/stock-dma/disable-strategies-resp.js";
import { Envelope } from "../../src/generated/stock-dma/envelope.js";
import { HoldingState } from "../../src/generated/stock-dma/holding-state.js";
import { LimitChaserList } from "../../src/generated/stock-dma/limit-chaser-list.js";
import { MsgType } from "../../src/generated/stock-dma/msg-type.js";
import { UnfilledState } from "../../src/generated/stock-dma/unfilled-state.js";
import { LoginResp } from "../../src/generated/stock-dma/login-resp.js";
import { OrderResp } from "../../src/generated/stock-dma/order-resp.js";
import { SetLimitChaser } from "../../src/generated/stock-dma/set-limit-chaser.js";
import { SetVITrigger } from "../../src/generated/stock-dma/set-vitrigger.js";
import { UpdateAccountNoResp } from "../../src/generated/stock-dma/update-account-no-resp.js";
import { QuoteState } from "../../src/generated/stock-dma/quote-state.js";
import { ServerMessage } from "../../src/generated/stock-dma/server-message.js";
import { TradeTape } from "../../src/generated/stock-dma/trade-tape.js";
import { TradeTapeEntry } from "../../src/generated/stock-dma/trade-tape-entry.js";
import { VIOrderItem } from "../../src/generated/stock-dma/viorder-item.js";
import { VIOrderList } from "../../src/generated/stock-dma/viorder-list.js";
import { VIOrderNotice } from "../../src/generated/stock-dma/viorder-notice.js";
import { RateCrossAlert } from "../../src/generated/stock-dma/rate-cross-alert.js";
import { RateCrossSnapshot } from "../../src/generated/stock-dma/rate-cross-snapshot.js";
import { QueuedWindowState } from "../../src/generated/stock-dma/queued-window-state.js";
import { UserSettings } from "../../src/generated/stock-dma/user-settings.js";
import { SymbolMaster } from "../../src/generated/stock-dma/symbol-master.js";
import { SymbolMasterItem } from "../../src/generated/stock-dma/symbol-master-item.js";
import { JournalBatch } from "../../src/generated/stock-dma/journal-batch.js";
import { JournalRecord as WireJournalRecord } from "../../src/generated/stock-dma/journal-record.js";
import { ObserverAccount } from "../../src/generated/stock-dma/observer-account.js";
import { ObserverLoginResp } from "../../src/generated/stock-dma/observer-login-resp.js";
import { StrategyEvent as WireStrategyEvent } from "../../src/generated/stock-dma/strategy-event.js";
import { QueueProgress } from "../../src/generated/stock-dma/queue-progress.js";
import { QueueProgressItem } from "../../src/generated/stock-dma/queue-progress-item.js";
import { LimitFeature } from "../../src/generated/stock-dma/limit-feature.js";
import { MemberDelta } from "../../src/generated/stock-dma/member-delta.js";
import { AdminAccount } from "../../src/generated/stock-dma/admin-account.js";
import { AdminCommandResp } from "../../src/generated/stock-dma/admin-command-resp.js";
import { AdminUser } from "../../src/generated/stock-dma/admin-user.js";
import { AdminUsersSnapshot } from "../../src/generated/stock-dma/admin-users-snapshot.js";
import { MSG } from "../../src/dma/msg-type.js";
import type { JournalRecord, StrategyEventRecord } from "../../src/journal/types.js";

/** 테스트 전반이 쓰는 정상 ISIN (삼성전자). */
export const SAMPLE_ISIN = "KR7005930003";

/** `msg_type` 만 담은 최소 Envelope. 화이트리스트 밖 번호를 주입할 때 쓴다. */
export function buildBareEnvelope(msgType: number): Uint8Array {
  const b = new flatbuffers.Builder(64);
  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, msgType);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

export type FakeQuoteInput = {
  isin?: string;
  exchange?: string;
  snapshot?: boolean;
  lastPrice?: bigint;
  openPrice?: bigint;
  highPrice?: bigint;
  lowPrice?: bigint;
  change?: bigint;
  changeSign?: string;
  changeRate?: number;
  cumVolume?: bigint;
  cumValue?: bigint;
  askPrices?: bigint[];
  askQtys?: bigint[];
  bidPrices?: bigint[];
  bidQtys?: bigint[];
  totalAskQty?: bigint;
  totalBidQty?: bigint;
  upperLimit?: bigint;
  lowerLimit?: bigint;
  basePrice?: bigint;
  viUpPrice?: bigint;
  viDownPrice?: bigint;
  listShares?: bigint;
  exchangeTime?: string;
  /**
   * KRX 정규장 종가 (`QuoteState.krx_close_price`, 슬롯 60). 오늘 종가가 아니면 서버가
   * `0` 을 보낸다 — **`0` 도 권위값**이라 파서가 거르지 않는다 (D-11). 기본값 `0` 은
   * 「아직 종가가 없다」는 정상 입력이지 미지정 마커가 아니다.
   */
  krxClosePrice?: bigint;
  /**
   * 버스트 상한가 (`QuoteState.burst_upper_limit` · gh-trade 3dabd6ff · quick-261003-rc4). 서버 판정 · 거래소별.
   * 기본 `false` — 구 서버(필드 부재)와 같다.
   */
  burstUpperLimit?: boolean;
};

const TEN = (base: bigint, step: bigint): bigint[] =>
  Array.from({ length: 10 }, (_, i) => base + step * BigInt(i));

/** 호가 프레임 (`quote_state` 슬롯). `snapshot` 이 msg_type 58/59 를 가른다. */
export function buildQuoteStateFrame(input: FakeQuoteInput = {}): Uint8Array {
  const snapshot = input.snapshot ?? true;
  const b = new flatbuffers.Builder(1024);

  const isin = b.createString(input.isin ?? SAMPLE_ISIN);
  const exchange = b.createString(input.exchange ?? "KRX");
  const changeSign = b.createString(input.changeSign ?? "2");
  const exchangeTime = b.createString(input.exchangeTime ?? "093015123456");
  const ask = QuoteState.createAskPricesVector(b, input.askPrices ?? TEN(71000n, 100n));
  const askQ = QuoteState.createAskQtysVector(b, input.askQtys ?? TEN(100n, 10n));
  const bid = QuoteState.createBidPricesVector(b, input.bidPrices ?? TEN(70900n, -100n));
  const bidQ = QuoteState.createBidQtysVector(b, input.bidQtys ?? TEN(200n, 10n));

  QuoteState.startQuoteState(b);
  QuoteState.addIsin(b, isin);
  QuoteState.addExchange(b, exchange);
  QuoteState.addLastPrice(b, input.lastPrice ?? 70950n);
  QuoteState.addOpenPrice(b, input.openPrice ?? 70000n);
  QuoteState.addHighPrice(b, input.highPrice ?? 71500n);
  QuoteState.addLowPrice(b, input.lowPrice ?? 69800n);
  QuoteState.addChange(b, input.change ?? 950n);
  QuoteState.addChangeSign(b, changeSign);
  QuoteState.addChangeRate(b, input.changeRate ?? 1.36);
  QuoteState.addCumVolume(b, input.cumVolume ?? 12_345_678n);
  QuoteState.addCumValue(b, input.cumValue ?? 876_543_210_000n);
  QuoteState.addAskPrices(b, ask);
  QuoteState.addAskQtys(b, askQ);
  QuoteState.addBidPrices(b, bid);
  QuoteState.addBidQtys(b, bidQ);
  QuoteState.addTotalAskQty(b, input.totalAskQty ?? 55_000n);
  QuoteState.addTotalBidQty(b, input.totalBidQty ?? 61_000n);
  QuoteState.addUpperLimit(b, input.upperLimit ?? 91_000n);
  QuoteState.addLowerLimit(b, input.lowerLimit ?? 49_000n);
  QuoteState.addBasePrice(b, input.basePrice ?? 70_000n);
  QuoteState.addViUpPrice(b, input.viUpPrice ?? 77_000n);
  QuoteState.addViDownPrice(b, input.viDownPrice ?? 63_000n);
  QuoteState.addListShares(b, input.listShares ?? 5_969_782_550n);
  QuoteState.addExchangeTime(b, exchangeTime);
  QuoteState.addIsSnapshot(b, snapshot);
  QuoteState.addKrxClosePrice(b, input.krxClosePrice ?? 0n);
  QuoteState.addBurstUpperLimit(b, input.burstUpperLimit ?? false);
  const quote = QuoteState.endQuoteState(b);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, snapshot ? MSG.GetQuoteResp : MSG.QuoteUpdate);
  Envelope.addQuoteState(b, quote);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

export type FakeTapeEntryInput = {
  tradeTime?: string;
  price?: bigint;
  changeSign?: string;
  change?: bigint;
  qty?: bigint;
  cumVolume?: bigint;
  /**
   * 서버 체결구분 (`TradeTapeEntry.bs_code`, 슬롯 16) — `"1"` 매도 · `"2"` 매수.
   * 그 밖(빈 값·낯선 코드)은 파서가 `""`(미상)으로 좁히고 **프레임은 살린다** (D-10).
   */
  bsCode?: string;
};

export type FakeTapeInput = {
  isin?: string;
  exchange?: string;
  snapshot?: boolean;
  entries?: FakeTapeEntryInput[];
};

/** 체결 테이프 프레임 (`trade_tape` 슬롯). `snapshot` 이 msg_type 69/71 을 가른다. */
export function buildTradeTapeFrame(input: FakeTapeInput = {}): Uint8Array {
  const snapshot = input.snapshot ?? true;
  const rows = input.entries ?? [{}, {}];
  const b = new flatbuffers.Builder(1024);

  const isin = b.createString(input.isin ?? SAMPLE_ISIN);
  const exchange = b.createString(input.exchange ?? "KRX");

  // 위치 인자 `createTradeTapeEntry` 를 쓰지 않는다 (T-16-05 / 17-01). 재동기화로 말미에
  // `bs_code` 가 붙자 인자 수가 7 → 8 로 늘어 이 호출부가 깨졌다 — 이름 있는 `addXxx` 는
  // 말미 append 에 대해 호출부를 불변으로 만든다.
  const offsets = rows.map((row, i) => {
    // 문자열은 테이블을 열기 **전에** 전부 만든다 (16-RESEARCH Pitfall 2 — `startXxx()`
    // 이후의 `createString` 은 릴리스 빌드에서 조용히 깨진 버퍼를 만든다).
    const tradeTime = b.createString(row.tradeTime ?? `09301512345${i}`);
    const changeSign = b.createString(row.changeSign ?? "2");
    const bsCode = b.createString(row.bsCode ?? "");
    TradeTapeEntry.startTradeTapeEntry(b);
    TradeTapeEntry.addTradeTime(b, tradeTime);
    TradeTapeEntry.addPrice(b, row.price ?? 70_900n + BigInt(i) * 50n);
    TradeTapeEntry.addChangeSign(b, changeSign);
    TradeTapeEntry.addChange(b, row.change ?? 900n);
    TradeTapeEntry.addQty(b, row.qty ?? 10n + BigInt(i));
    TradeTapeEntry.addCumVolume(b, row.cumVolume ?? 12_345_600n + BigInt(i));
    TradeTapeEntry.addBsCode(b, bsCode);
    return TradeTapeEntry.endTradeTapeEntry(b);
  });
  const entries = TradeTape.createEntriesVector(b, offsets);

  const tape = TradeTape.createTradeTape(b, isin, exchange, entries, snapshot);
  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, snapshot ? MSG.TradeTapeResp : MSG.TradeTapePush);
  Envelope.addTradeTape(b, tape);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

export type FakeServerMessageInput = {
  level?: string;
  message?: string;
  isin?: string;
  accountNo?: string;
  source?: string;
  kind?: string;
};

/** 서버 통지 프레임 (54). `isin` 이 비면 브로드캐스트다 — 정상 입력이다. */
export function buildServerMessageFrame(input: FakeServerMessageInput = {}): Uint8Array {
  const b = new flatbuffers.Builder(256);
  const sm = ServerMessage.createServerMessage(
    b,
    b.createString(input.level ?? "INFO"),
    b.createString(input.message ?? "세션에 참여했습니다"),
    b.createString(input.isin ?? ""),
    b.createString(input.accountNo ?? ""),
    b.createString(input.source ?? "System"),
    b.createString(input.kind ?? "SessionJoin"),
  );
  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.ServerMessage);
  Envelope.addServerMessage(b, sm);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/** 허용 계좌 1건 (`LoginResp.accounts` 원소). */
export type FakeAccount = { accountNo: string; name?: string };

/**
 * 테스트 전반의 기본 허용 계좌 1건.
 *
 * 기본값을 **비우지 않는** 이유: D-25 게이트 통과 후 계좌 0건은 정상 부트가 아니라
 * 세션 실패다 (17 D-12). 기본 게이트웨이가 0건을 주면 "정상 부트"를 다루는 모든
 * 테스트가 실패 경로로 새어 무엇을 검증하는지 알 수 없게 된다.
 */
export const SAMPLE_ACCOUNTS: FakeAccount[] = [{ accountNo: "1234567801", name: "위탁종합" }];

export type FakeLoginRespInput = {
  success?: boolean;
  message?: string;
  /**
   * 허용 계좌 목록. 생략하면 성공 응답은 `SAMPLE_ACCOUNTS`, **실패 응답은 빈 벡터**다
   * (17 D-19 — 거부된 로그인에는 계좌를 싣지 않는다). `[]` 를 명시하면 성공 응답도
   * 계좌 0건으로 만들 수 있다.
   */
  accounts?: FakeAccount[];
};

/**
 * 로그인 응답 프레임 (50).
 *
 * `accounts` 벡터를 채운다 — gh-trade 17 재동기화(D-25) 이후의 정본 스키마다.
 * `accounts: []` 로 mock 무인증 게이트웨이(빈 벡터)를 그대로 재현할 수 있다.
 */
export function buildLoginRespFrame(input: FakeLoginRespInput = {}): Uint8Array {
  const b = new flatbuffers.Builder(256);
  const success = input.success ?? true;
  const rows = input.accounts ?? (success ? SAMPLE_ACCOUNTS : []);
  const message = b.createString(input.message ?? "");
  // 문자열은 테이블 조립 **전에** 전부 만들어 둔다 (FlatBuffers 중첩 제약).
  const entries = rows.map((a) =>
    AccountEntry.createAccountEntry(b, b.createString(a.accountNo), b.createString(a.name ?? "")),
  );
  const accounts = LoginResp.createAccountsVector(b, entries);

  LoginResp.startLoginResp(b);
  LoginResp.addSuccess(b, success);
  LoginResp.addMessage(b, message);
  LoginResp.addAccounts(b, accounts);
  const resp = LoginResp.endLoginResp(b);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.LoginResp);
  Envelope.addLoginResp(b, resp);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

export type FakeOrderRespInput = {
  isin?: string;
  side?: string;
  orderNo?: string;
  resultCode?: number;
  price?: number;
  quantity?: number;
  message?: string;
  /** "A"=접수 "E"=체결 "C"=취소확인 "M"=정정확인 "R"=거부. 구 서버를 흉내 내려면 `""`. */
  noticeType?: string;
  orgOrderNo?: string;
  origin?: string;
  exchange?: string;
  /** 시간외종가 구분 (`board`) — `"G2"`·`"G3"`·빈 값. 구 서버를 흉내 내려면 생략한다. */
  board?: string;
  /** 요청 종류 (`request_kind`) — `"New"`·`"Modify"`·`"Cancel"`. 행위 단어의 원천이다. */
  requestKind?: string;
  /** 요청 주체 (`requester`) — `"Manual"`. **표시 전용**이다 (D-08). */
  requester?: string;
};

/**
 * 주문 통보 프레임 (51).
 *
 * 접수·체결·취소확인·거부가 **전부 이 하나**로 온다. `TradeExecution(53)` 은 서버에
 * 생성 경로가 없어 테스트에서도 만들지 않는다 (fbs L221-228 / `Server.cpp` L307).
 *
 * 위치 인자 `createOrderResp` 를 쓰지 않는다 (T-16-05 / 17-01). 재동기화로 말미에
 * `board`·`request_kind`·`requester` 3슬롯이 붙자 인자 수가 12 → 15 로 늘어 이 호출부가
 * 깨졌다 — 이름 있는 `addXxx` 는 말미 append 에 대해 호출부를 불변으로 만든다.
 *
 * 신규 3필드의 기본값은 `""` 다 — **구 서버 프레임이 기본**이라야 회귀 테스트가
 * 「오늘 서버」가 아니라 「어제 서버」를 재현한다.
 */
export function buildOrderRespFrame(input: FakeOrderRespInput = {}): Uint8Array {
  const b = new flatbuffers.Builder(512);
  // 문자열은 테이블을 열기 **전에** 전부 만든다 (FlatBuffers 중첩 제약).
  const stockCode = b.createString(input.isin ?? SAMPLE_ISIN);
  const side = b.createString(input.side ?? "B");
  const orderNo = b.createString(input.orderNo ?? "0000012345");
  const message = b.createString(input.message ?? "정상처리");
  const noticeType = b.createString(input.noticeType ?? "A");
  const orgOrderNo = b.createString(input.orgOrderNo ?? "");
  const origin = b.createString(input.origin ?? "Manual");
  const exchange = b.createString(input.exchange ?? "KRX");
  const board = b.createString(input.board ?? "");
  const requestKind = b.createString(input.requestKind ?? "");
  const requester = b.createString(input.requester ?? "");

  OrderResp.startOrderResp(b);
  OrderResp.addStockCode(b, stockCode);
  OrderResp.addSide(b, side);
  OrderResp.addOrderNo(b, orderNo);
  OrderResp.addResultCode(b, input.resultCode ?? 0);
  OrderResp.addPrice(b, input.price ?? 70_000);
  OrderResp.addQuantity(b, input.quantity ?? 10);
  OrderResp.addMessage(b, message);
  OrderResp.addNoticeType(b, noticeType);
  OrderResp.addOrgOrderNo(b, orgOrderNo);
  OrderResp.addOrigin(b, origin);
  OrderResp.addExchange(b, exchange);
  OrderResp.addBoard(b, board);
  OrderResp.addRequestKind(b, requestKind);
  OrderResp.addRequester(b, requester);
  const resp = OrderResp.endOrderResp(b);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.OrderResp);
  Envelope.addOrderResp(b, resp);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/** 잔고 1건 (`HoldingState` 원소). */
export type FakeHolding = {
  isin?: string;
  stockQty?: number;
  sellableQty?: number;
  avgPrice?: number;
};

/** 미체결 1건 (`UnfilledState` 원소). */
export type FakeUnfilled = {
  orderNo?: string;
  orgOrderNo?: string;
  isin?: string;
  side?: string;
  price?: number;
  orderQty?: number;
  filledQty?: number;
  unfilledQty?: number;
  exchange?: string;
  /** 주문시각 `"HHMMSS"`. 미체결 그리드 '시간' 열의 유일한 원천 (16-01 재동기화로 추가). */
  orderTime?: string;
  /** 예약주문 상태 문구 (`queued_status`). **파서는 해석하지 않는다** (D-07). */
  queuedStatus?: string;
  /** 접수대기 상태 문구 (`pending_status`). 문구 비교 금지 — 판정은 bool 하나다 (D-14). */
  pendingStatus?: string;
  /** 시간외종가 구분 (`board`) — 서버는 `"G2"`·`"G3"`·빈 값만 보낸다. */
  board?: string;
  /** 취소 요청을 증권사에 이미 보냈는가 (`pending_cancel_sent`). 회색·버튼숨김의 유일한 근거. */
  pendingCancelSent?: boolean;
};

export type FakeAccountStateInput = {
  accountNo?: string;
  snapshot?: boolean;
  holdings?: FakeHolding[];
  unfilled?: FakeUnfilled[];
  removedOrderNos?: string[];
  serverTime?: string;
  /**
   * 본문 `is_snapshot` 을 msg_type 과 **어긋나게** 만들 때만 쓴다. 기본값은 `snapshot`
   * 과 같다 — 정상 게이트웨이는 둘을 일치시킨다 (D-33 대조 테스트용 탈출구).
   */
  bodyIsSnapshot?: boolean;
};

/** 테스트 전반이 쓰는 기본 계좌번호. `SAMPLE_ACCOUNTS[0]` 과 같은 값이다. */
export const SAMPLE_ACCOUNT_NO = "1234567801";

/**
 * 계좌 상태 프레임 (66 스냅샷 / 67 델타 — `account_state` 슬롯 공유).
 *
 * `snapshot` 이 msg_type 을 가른다. 벡터 상한 클램프를 시험할 수 있게 길이 제한을 두지
 * 않는다 — 600건짜리 잔고를 만들어 파서가 500 으로 자르는지 볼 수 있어야 한다.
 */
export function buildAccountStateFrame(input: FakeAccountStateInput = {}): Uint8Array {
  const snapshot = input.snapshot ?? true;
  const holdings = input.holdings ?? [];
  const unfilled = input.unfilled ?? [];
  const removed = input.removedOrderNos ?? [];
  const b = new flatbuffers.Builder(2048);

  // 문자열·중첩 테이블은 부모 테이블을 열기 **전에** 전부 만든다 (FlatBuffers 중첩 제약).
  const accountNo = b.createString(input.accountNo ?? SAMPLE_ACCOUNT_NO);
  const serverTime = b.createString(input.serverTime ?? "20260906093015");

  const holdingOffsets = holdings.map((h) =>
    HoldingState.createHoldingState(
      b,
      b.createString(h.isin ?? SAMPLE_ISIN),
      h.stockQty ?? 10,
      h.sellableQty ?? 10,
      h.avgPrice ?? 70_000,
    ),
  );
  const holdingsVec = AccountState.createHoldingsVector(b, holdingOffsets);

  // 위치 인자 `createUnfilledState` 를 쓰지 않는다 (T-16-05 / 17-01). 재동기화로 말미에
  // `queued_status`·`pending_status`·`board`·`pending_cancel_sent` 4슬롯이 붙자 인자 수가
  // 11 → 15 로 늘어 이 호출부가 깨졌다 — 이름 있는 `addXxx` 는 말미 append 에 대해
  // 호출부를 불변으로 만든다.
  const unfilledOffsets = unfilled.map((u, i) => {
    // 문자열은 테이블을 열기 **전에** 전부 만든다 (Pitfall 2).
    const orderNo = b.createString(u.orderNo ?? `ORD${String(i).padStart(7, "0")}`);
    const orgOrderNo = b.createString(u.orgOrderNo ?? "");
    const isin = b.createString(u.isin ?? SAMPLE_ISIN);
    const side = b.createString(u.side ?? "B");
    const exchange = b.createString(u.exchange ?? "KRX");
    const orderTime = b.createString(u.orderTime ?? "093015");
    const queuedStatus = b.createString(u.queuedStatus ?? "");
    const pendingStatus = b.createString(u.pendingStatus ?? "");
    const board = b.createString(u.board ?? "");
    UnfilledState.startUnfilledState(b);
    UnfilledState.addOrderNo(b, orderNo);
    UnfilledState.addOrgOrderNo(b, orgOrderNo);
    UnfilledState.addIsin(b, isin);
    UnfilledState.addSide(b, side);
    UnfilledState.addPrice(b, u.price ?? 70_000);
    UnfilledState.addOrderQty(b, u.orderQty ?? 10);
    UnfilledState.addFilledQty(b, u.filledQty ?? 0);
    UnfilledState.addUnfilledQty(b, u.unfilledQty ?? 10);
    UnfilledState.addExchange(b, exchange);
    UnfilledState.addOrderTime(b, orderTime);
    UnfilledState.addQueuedStatus(b, queuedStatus);
    UnfilledState.addPendingStatus(b, pendingStatus);
    UnfilledState.addBoard(b, board);
    UnfilledState.addPendingCancelSent(b, u.pendingCancelSent ?? false);
    return UnfilledState.endUnfilledState(b);
  });
  const unfilledVec = AccountState.createUnfilledVector(b, unfilledOffsets);

  const removedVec = AccountState.createRemovedOrderNosVector(
    b,
    removed.map((no) => b.createString(no)),
  );

  const state = AccountState.createAccountState(
    b,
    accountNo,
    holdingsVec,
    unfilledVec,
    removedVec,
    input.bodyIsSnapshot ?? snapshot,
    serverTime,
  );

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, snapshot ? MSG.GetAccountStateResp : MSG.AccountStateDelta);
  Envelope.addAccountState(b, state);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/**
 * 계좌 선언 응답 프레임 (55).
 *
 * 서버는 선언 1건마다 **그 시점의 등록 목록 전체**를 돌려준다 — 목록을 통째로 받는
 * 이 형태가 계약이다 (C# `Session.cs` 대조 로직의 전제).
 */
export function buildUpdateAccountNoRespFrame(accountList: string[]): Uint8Array {
  const b = new flatbuffers.Builder(256);
  const list = UpdateAccountNoResp.createAccountListVector(
    b,
    accountList.map((a) => b.createString(a)),
  );
  const resp = UpdateAccountNoResp.createUpdateAccountNoResp(b, list);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.UpdateAccountNoResp);
  Envelope.addUpdateAccountNoResp(b, resp);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

// ---------------------------------------------------------------------------
// 전략 계열 (Phase 16) — 상따 · VI
// ---------------------------------------------------------------------------

/**
 * 전략 계열 `msg_type` 상수.
 *
 * `src/dma/msg-type.ts` 의 `MSG` 는 relay 의 **수신 화이트리스트**이고 전략 번호 확장은
 * 16-04 소관이다. 그 전까지 이 헬퍼가 `60` 같은 숫자 리터럴을 들고 있으면 스키마가
 * 바뀔 때 조용히 어긋나므로, **생성 enum(`stock-dma/msg-type.ts`)을 정본으로** 삼아
 * 필요한 값만 이름 붙여 둔다. 리터럴이 한 개도 없으므로 flatc 재생성이 곧 갱신이다.
 */
export const STRATEGY_MSG = {
  // 요청 (relay → 게이트웨이)
  SetLimitChaserReq: MsgType.SetLimitChaserReq,
  SetVITriggerReq: MsgType.SetVITriggerReq,
  DisableStrategiesReq: MsgType.DisableStrategiesReq,
  GetVITriggerReq: MsgType.GetVITriggerReq,
  GetLimitChaserListReq: MsgType.GetLimitChaserListReq,
  ConfirmVIOrderReq: MsgType.ConfirmVIOrderReq,
  GetVIOrderListReq: MsgType.GetVIOrderListReq,
  // 응답 · 푸시 (게이트웨이 → relay)
  VIOrderNotice: MsgType.VIOrderNotice,
  SetLimitChaserResp: MsgType.SetLimitChaserResp,
  SetVITriggerResp: MsgType.SetVITriggerResp,
  GetLimitChaserListResp: MsgType.GetLimitChaserListResp,
  DisableStrategiesResp: MsgType.DisableStrategiesResp,
  GetVIOrderListResp: MsgType.GetVIOrderListResp,
  VIOrderListPush: MsgType.VIOrderListPush,
} as const;

/**
 * 상따 전략 1건. **활성 67 필드 전부** override 가능하다(Phase 24: 39 − 1 + 17 · quick-260929-vzy +1 `postBuyAuto` ·
 * quick-260930-fi4 +1 `extraBuyAbandonQty` · quick-261002-fim +1 `postBuyUnlockQty` ·
 * quick-261003-rc4 +1 `extraBuyBurstRelease` · Phase 27 +8 자동매도).
 * (37 → 39: 17-01 재동기화로 `cancel_entry_latched` · `buy_entry_latched` 가 합류했다.)
 *
 * deprecated 8종(`client_key` · `sell_min_cum_volume` · `sell_cum_volume_enabled` ·
 * `a3_buy4_enabled` · `smart_sell` · `origin_ord_qty` · `buy_price_break_enabled` ·
 * `sell_price_break_enabled`)은 flatc 가 접근자를 만들지 않아 여기에도 없다 —
 * 보내지도 읽지도 않는다.
 *
 * **S→C 전용 16필드**(`sellOrderQty` · `sellQtyTrackBaseline` · `sellEntryLatched` ·
 * `cancelQtyTrackBaseline` · `cancelEntryLatched` · Phase 24 의 `buy3Schema` · `extraBuyAbandoned` ·
 * `postBuyTriggerQty` · `postBuyReentryLeft` · `postBuyPhase` · quick-260930-fi4 의 `extraBuyAbandonQty` ·
 * quick-261002-fim 의 `postBuyUnlockQty` · Phase 27 의 `autoSellState` · `autoSellSoldQty` · `autoSellBasis` ·
 * `autoSellBasisPrice`)도 주입할 수 있다. 서버가 계산해 에코로만 내려주는 값이라,
 * "에코가 화면에 그대로 뜨는가"를 검증하려면 테스트가 직접 심을 수 있어야 한다.
 */
export type FakeLimitChaserInput = {
  isin?: string;
  accountNo?: string;
  /** 첫 글자만 파싱된다. `"Q"`=KOSDAQ, 그 외=KOSPI. */
  market?: string;
  /** 첫 글자만 파싱된다. `"D"`=삭제, 그 외=`"C"` upsert. */
  crud?: string;
  buyOrderPrice?: number;
  buyOrderQty?: number;
  buyWatchPrice?: number;
  buyWatchQty?: number;
  buyMinTradeQty?: number;
  // buy_watch_side(슬롯 24)는 gh-trade a3610261 로 봉인돼 빌더가 없다 — 입력도 두지 않는다.
  buyTradeQtyEnabled?: boolean;
  buyEnabled?: boolean;
  sellOrderPrice?: number;
  /** **S→C 전용** — 서버가 Set 시점 `매도가능×비율/100` 을 스냅샷해 내려준다. */
  sellOrderQty?: number;
  sellWatchPrice?: number;
  sellWatchQty?: number;
  sellMinTradeQty?: number;
  sellEnabled?: boolean;
  sellTradeQtyEnabled?: boolean;
  sweepWatchPrice?: number;
  sweepEnabled?: boolean;
  sweepMinTickCount?: number;
  sweepRecalcEnabled?: boolean;
  sweepMinCount?: number;
  /** BasisPoints (2950 = 29.5%). */
  sweepMinRate?: number;
  exchange?: string;
  /** 매도비율 % (서버 검증 1~100). */
  sellOrderRatio?: number;
  sellQtyTrackEnabled?: boolean;
  /** 잔량추적 비율 % (서버 검증 1~90 — 100 은 거부). */
  sellQtyTrackRatio?: number;
  /** **S→C 전용** — 현재 기준선(주). */
  sellQtyTrackBaseline?: number;
  /** 단위 **만원**. 0 이면 "서버가 모름" 이라 클라는 금액 칸을 건드리지 않는다. */
  buyOrderAmount?: number;
  /** **S→C 전용** — 매도 진입 확인 래치 원값(무장과 접지 않는다). */
  sellEntryLatched?: boolean;
  cancelQtyEnabled?: boolean;
  cancelWatchQty?: number;
  cancelTradeEnabled?: boolean;
  cancelQtyTrackEnabled?: boolean;
  /** **S→C 전용** — 취소 잔량추적 기준선(주). 16-01 재동기화로 접근자가 생겼다. */
  cancelQtyTrackBaseline?: number;
  /** **S→C 전용** — 취소 진입 확인 래치 원값(무장과 접지 않는다). 17-01 재동기화 산물. */
  cancelEntryLatched?: boolean;
  // === Phase 24 매수 3종 (gh-trade D-17 · D-24) ===
  /** **S→C 전용** — 서버 에코는 늘 1(기본 1). 구 서버 흉내는 0 을 넘긴다. */
  buy3Schema?: number;
  preBuyEnabled?: boolean;
  extraBuyEnabled?: boolean;
  extraBuyMinQty?: number;
  extraBuyMaxQty?: number;
  /** 단위 만원. */
  extraBuyOrderAmount?: number;
  extraBuyOrderQty?: number;
  /** **S→C 전용** — 추가매수 포기. */
  extraBuyAbandoned?: boolean;
  postBuyEnabled?: boolean;
  postBuyReboundPct?: number;
  postBuyFloorQty?: number;
  postBuyReentry?: number;
  /** 단위 만원. */
  postBuyOrderAmount?: number;
  postBuyOrderQty?: number;
  /** **S→C 전용** — 발동잔량(주). */
  postBuyTriggerQty?: number;
  /** **S→C 전용** — 재진입 잔여(회). */
  postBuyReentryLeft?: number;
  /** **S→C 전용** — 0 꺼짐 / 1 감시 / 2 보유중 / 3 소진. */
  postBuyPhase?: number;
  /** 후매수 ☐자동 — 양방향(quick-260929-vzy). 서버 에코는 늘 싣는다(부재 기본 false). */
  postBuyAuto?: boolean;
  /** **S→C 전용** — 추가매수 포기 성립 틱의 매수1잔량(주, vtable 134). 기본 0 = 포기 아님 · 옛 서버. */
  extraBuyAbandonQty?: number;
  /** **S→C 전용** — 후매수 잠금 해제선(주, vtable 136). 기본 0 = 잠금 아님 · 미배포 서버. */
  postBuyUnlockQty?: number;
  /** 추가매수 ☐버스트 시 해제 — 양방향(vtable 138 · quick-261003-rc4). 서버 에코는 설정값(부재 기본 false). */
  extraBuyBurstRelease?: boolean;
  // === Phase 27 자동매도 8필드 (gh-trade 2404509b · vtable 140~154) ===
  /** ☐자동매도 — 양방향(vtable 140). 부재 기본 false. */
  autoSellEnabled?: boolean;
  /** 시작조건 0~9 — 양방향(vtable 142). */
  autoSellStartCond?: number;
  /** 비율 % 1~50 — 양방향(vtable 144). */
  autoSellRatioPct?: number;
  /** 방법 1 매도1호가 · 2 매수1호가 · 3 양쪽 — 양방향(vtable 146). */
  autoSellMethod?: number;
  /** **S→C 전용** — 상태 0 없음 · 1 대기 · 2 감시 · 3 매도중 · 4 완료(vtable 148). */
  autoSellState?: number;
  /** **S→C 전용** — 누적 매도수량(주, vtable 150). */
  autoSellSoldQty?: number;
  /** **S→C 전용** — 기준 종류 1 상한가 · 2 매수가 · 0 미정(vtable 152). */
  autoSellBasis?: number;
  /** **S→C 전용** — 기준가격(원, vtable 154). */
  autoSellBasisPrice?: number;
};

/**
 * 상따 에코 기본값.
 *
 * **숫자 기본값을 전부 서로 다르게 둔 것은 의도다** (T-16-05). 값이 겹치면 빌더가
 * 필드를 한 칸 밀려 조립해도 파서 테스트가 그대로 통과해 **거짓 green** 이 된다.
 * 가격 5칸을 71,000 / 71,100 / 71,200 / 71,300 / 71,400 으로 어긋나게 두면 어느 칸이
 * 어디로 갔는지 실패 메시지에서 눈으로 읽힌다.
 *
 * `buyOrderAmount`(100만원) 과 `buyOrderQty`(14) 는 서로 맞물려 있다 —
 * `floor(100 × 10000 / 71000) = 14`. 매수수량 산출식 왕복을 기본 픽스처만으로 검산할 수
 * 있다(역산 금지 규율의 대조군).
 *
 * 불리언은 **전부 false** 다. 게이트 하나만 켜서 그 효과를 단정하는 테스트가 기본형이라,
 * 기본값이 켜져 있으면 무엇 때문에 켜졌는지 구분되지 않는다.
 */
const LIMIT_CHASER_DEFAULTS = {
  market: "K",
  crud: "C",
  exchange: "KRX",
  buyOrderPrice: 71_000,
  buyOrderQty: 14,
  buyWatchPrice: 71_100,
  buyWatchQty: 10_000,
  buyMinTradeQty: 30_000,
  sellOrderPrice: 71_200,
  sellOrderQty: 7,
  sellWatchPrice: 71_300,
  sellWatchQty: 10,
  sellMinTradeQty: 30_500,
  sweepWatchPrice: 71_400,
  sweepMinTickCount: 3,
  sweepMinCount: 5,
  sweepMinRate: 2_950,
  sellOrderRatio: 60,
  sellQtyTrackRatio: 50,
  sellQtyTrackBaseline: 120,
  buyOrderAmount: 100,
  cancelWatchQty: 25,
  cancelQtyTrackBaseline: 130,
} as const;

/**
 * `SetLimitChaser` 테이블 1건을 조립하고 offset 을 돌려준다 (60 단건과 64 목록이 공유).
 *
 * **생성 코드의 `createSetLimitChaser` 위치 인자 함수를 쓰지 않는다** (RESEARCH Pitfall 1):
 * deprecated 8 슬롯은 접근자가 없어 인자 목록에서 빠지는데, 그 결과 인자가 한 칸 밀려도
 * 타입이 같아 **컴파일이 통과한다**. `addXxx` 개별 호출은 필드 이름이 인자에 붙어 있어
 * 그런 침묵 오조립이 구조적으로 불가능하다.
 *
 * 문자열은 테이블 빌더를 **열기 전에** 전부 만든다 (FlatBuffers 중첩 제약 — Pitfall 2).
 */
function emitSetLimitChaser(
  b: flatbuffers.Builder,
  input: FakeLimitChaserInput,
): flatbuffers.Offset {
  const d = LIMIT_CHASER_DEFAULTS;
  const isin = b.createString(input.isin ?? SAMPLE_ISIN);
  const accountNo = b.createString(input.accountNo ?? SAMPLE_ACCOUNT_NO);
  const market = b.createString(input.market ?? d.market);
  const crud = b.createString(input.crud ?? d.crud);
  const exchange = b.createString(input.exchange ?? d.exchange);

  SetLimitChaser.startSetLimitChaser(b);
  SetLimitChaser.addIsin(b, isin);
  SetLimitChaser.addAccountNo(b, accountNo);
  SetLimitChaser.addMarket(b, market);
  SetLimitChaser.addCrud(b, crud);
  SetLimitChaser.addBuyOrderPrice(b, input.buyOrderPrice ?? d.buyOrderPrice);
  SetLimitChaser.addBuyOrderQty(b, input.buyOrderQty ?? d.buyOrderQty);
  SetLimitChaser.addBuyWatchPrice(b, input.buyWatchPrice ?? d.buyWatchPrice);
  SetLimitChaser.addBuyWatchQty(b, input.buyWatchQty ?? d.buyWatchQty);
  SetLimitChaser.addBuyMinTradeQty(b, input.buyMinTradeQty ?? d.buyMinTradeQty);
  SetLimitChaser.addBuyTradeQtyEnabled(b, input.buyTradeQtyEnabled ?? false);
  SetLimitChaser.addBuyEnabled(b, input.buyEnabled ?? false);
  SetLimitChaser.addSellOrderPrice(b, input.sellOrderPrice ?? d.sellOrderPrice);
  SetLimitChaser.addSellOrderQty(b, input.sellOrderQty ?? d.sellOrderQty);
  SetLimitChaser.addSellWatchPrice(b, input.sellWatchPrice ?? d.sellWatchPrice);
  SetLimitChaser.addSellWatchQty(b, input.sellWatchQty ?? d.sellWatchQty);
  SetLimitChaser.addSellMinTradeQty(b, input.sellMinTradeQty ?? d.sellMinTradeQty);
  SetLimitChaser.addSellEnabled(b, input.sellEnabled ?? false);
  SetLimitChaser.addSellTradeQtyEnabled(b, input.sellTradeQtyEnabled ?? false);
  SetLimitChaser.addSweepWatchPrice(b, input.sweepWatchPrice ?? d.sweepWatchPrice);
  SetLimitChaser.addSweepEnabled(b, input.sweepEnabled ?? false);
  SetLimitChaser.addSweepMinTickCount(b, input.sweepMinTickCount ?? d.sweepMinTickCount);
  SetLimitChaser.addSweepRecalcEnabled(b, input.sweepRecalcEnabled ?? false);
  SetLimitChaser.addSweepMinCount(b, input.sweepMinCount ?? d.sweepMinCount);
  SetLimitChaser.addSweepMinRate(b, input.sweepMinRate ?? d.sweepMinRate);
  SetLimitChaser.addExchange(b, exchange);
  SetLimitChaser.addSellOrderRatio(b, input.sellOrderRatio ?? d.sellOrderRatio);
  SetLimitChaser.addSellQtyTrackEnabled(b, input.sellQtyTrackEnabled ?? false);
  SetLimitChaser.addSellQtyTrackRatio(b, input.sellQtyTrackRatio ?? d.sellQtyTrackRatio);
  SetLimitChaser.addSellQtyTrackBaseline(b, input.sellQtyTrackBaseline ?? d.sellQtyTrackBaseline);
  SetLimitChaser.addBuyOrderAmount(b, input.buyOrderAmount ?? d.buyOrderAmount);
  SetLimitChaser.addSellEntryLatched(b, input.sellEntryLatched ?? false);
  SetLimitChaser.addCancelQtyEnabled(b, input.cancelQtyEnabled ?? false);
  SetLimitChaser.addCancelWatchQty(b, input.cancelWatchQty ?? d.cancelWatchQty);
  SetLimitChaser.addCancelTradeEnabled(b, input.cancelTradeEnabled ?? false);
  SetLimitChaser.addCancelQtyTrackEnabled(b, input.cancelQtyTrackEnabled ?? false);
  SetLimitChaser.addCancelQtyTrackBaseline(
    b,
    input.cancelQtyTrackBaseline ?? d.cancelQtyTrackBaseline,
  );
  SetLimitChaser.addCancelEntryLatched(b, input.cancelEntryLatched ?? false);
  // buy_entry_latched — Phase 24 D-25 로 봉인(deprecated). 빌더가 없다.
  // === Phase 24 매수 3종 — 서버 흉내이므로 S→C 전용까지 싣는다 ===
  SetLimitChaser.addBuy3Schema(b, input.buy3Schema ?? 1);
  SetLimitChaser.addPreBuyEnabled(b, input.preBuyEnabled ?? false);
  SetLimitChaser.addExtraBuyEnabled(b, input.extraBuyEnabled ?? false);
  SetLimitChaser.addExtraBuyMinQty(b, input.extraBuyMinQty ?? 0);
  SetLimitChaser.addExtraBuyMaxQty(b, input.extraBuyMaxQty ?? 0);
  SetLimitChaser.addExtraBuyOrderAmount(b, input.extraBuyOrderAmount ?? 0);
  SetLimitChaser.addExtraBuyOrderQty(b, input.extraBuyOrderQty ?? 0);
  SetLimitChaser.addExtraBuyAbandoned(b, input.extraBuyAbandoned ?? false);
  SetLimitChaser.addPostBuyEnabled(b, input.postBuyEnabled ?? false);
  SetLimitChaser.addPostBuyReboundPct(b, input.postBuyReboundPct ?? 0);
  SetLimitChaser.addPostBuyFloorQty(b, input.postBuyFloorQty ?? 0);
  SetLimitChaser.addPostBuyReentry(b, input.postBuyReentry ?? 0);
  SetLimitChaser.addPostBuyOrderAmount(b, input.postBuyOrderAmount ?? 0);
  SetLimitChaser.addPostBuyOrderQty(b, input.postBuyOrderQty ?? 0);
  SetLimitChaser.addPostBuyTriggerQty(b, input.postBuyTriggerQty ?? 0);
  SetLimitChaser.addPostBuyReentryLeft(b, input.postBuyReentryLeft ?? 0);
  SetLimitChaser.addPostBuyPhase(b, input.postBuyPhase ?? 0);
  SetLimitChaser.addPostBuyAuto(b, input.postBuyAuto ?? false);
  SetLimitChaser.addExtraBuyAbandonQty(b, input.extraBuyAbandonQty ?? 0);
  SetLimitChaser.addPostBuyUnlockQty(b, input.postBuyUnlockQty ?? 0);
  SetLimitChaser.addExtraBuyBurstRelease(b, input.extraBuyBurstRelease ?? false);
  SetLimitChaser.addAutoSellEnabled(b, input.autoSellEnabled ?? false);
  SetLimitChaser.addAutoSellStartCond(b, input.autoSellStartCond ?? 0);
  SetLimitChaser.addAutoSellRatioPct(b, input.autoSellRatioPct ?? 0);
  SetLimitChaser.addAutoSellMethod(b, input.autoSellMethod ?? 0);
  SetLimitChaser.addAutoSellState(b, input.autoSellState ?? 0);
  SetLimitChaser.addAutoSellSoldQty(b, input.autoSellSoldQty ?? 0);
  SetLimitChaser.addAutoSellBasis(b, input.autoSellBasis ?? 0);
  SetLimitChaser.addAutoSellBasisPrice(b, input.autoSellBasisPrice ?? 0);
  return SetLimitChaser.endSetLimitChaser(b);
}

/**
 * 상따 Set 에코 프레임 (60 — `set_limit_chaser` 슬롯).
 *
 * 서버는 「거부」를 응답 코드로 주지 않는다. 등록 성공은 **이 에코의 수신**이고,
 * 부분 거부는 **눕혀진 값**(예: `buyEnabled:false`)으로 온다. 그 두 경우를 테스트가
 * 직접 만들 수 있어야 하므로 56 필드가 전부 열려 있다.
 */
export function buildSetLimitChaserRespFrame(input: FakeLimitChaserInput = {}): Uint8Array {
  const b = new flatbuffers.Builder(1024);
  const cfg = emitSetLimitChaser(b, input);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, STRATEGY_MSG.SetLimitChaserResp);
  Envelope.addSetLimitChaser(b, cfg);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/**
 * 상따 목록 응답 프레임 (64 — `limit_chaser_list` 슬롯).
 *
 * **0건도 「길이 0 벡터」로 정상 응답한다**(서버의 무응답 금지 규약). 슬롯 자체를 비우면
 * 웹이 "아직 안 왔다"와 "없다"를 구분할 수 없으므로, 빈 목록도 벡터를 만들어 넣는다.
 */
export function buildLimitChaserListRespFrame(items: FakeLimitChaserInput[] = []): Uint8Array {
  const b = new flatbuffers.Builder(2048);
  // 중첩 테이블은 부모를 열기 전에 전부 만든다 (FlatBuffers 중첩 제약).
  const offsets = items.map((item) => emitSetLimitChaser(b, item));
  const vec = LimitChaserList.createItemsVector(b, offsets);

  LimitChaserList.startLimitChaserList(b);
  LimitChaserList.addItems(b, vec);
  const list = LimitChaserList.endLimitChaserList(b);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, STRATEGY_MSG.GetLimitChaserListResp);
  Envelope.addLimitChaserList(b, list);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/** VI 트리거 설정 1건. */
export type FakeViTriggerInput = {
  accountNo?: string;
  /** **원 단위 bigint.** UI 는 만원으로 입력받아 ×10,000 해서 넣는다. */
  orderAmountKrw?: bigint;
  /** 정수 % (25 = 25% 이상). */
  checkRate?: number;
  /** 첫 글자만 파싱된다. `"L"`=하한가, 그 외=`"U"` 상한가. */
  priceType?: string;
  run?: boolean;
  /**
   * 거래소 (17-05 / D-06). **생략하면 슬롯 자체를 싣지 않는다** — 구 서버의 와이어가
   * 그 모습이고, 파서가 `fromWireExchange("")` 로 `"KRX"` 로 정규화하는 경로가 그때 탄다.
   * 빈 문자열(`""`)을 명시로 넣는 것과 슬롯 부재를 **둘 다** 시험할 수 있어야 한다.
   */
  exchange?: string;
};

/**
 * VI 트리거 응답 프레임 (61 — `set_vi_trigger` 슬롯).
 *
 * **`input === null` 이면 테이블 없는 빈 Envelope 를 만든다.** 서버는 `GetVITriggerReq(21)`
 * 에 전략이 없어도 반드시 61 을 돌려주고(무응답 금지), 그 「없음」의 표현이 바로
 * 빈 슬롯이다. 웹은 이것을 **미등록**으로 읽어야 하며 입력값은 그대로 두고 `run` 만
 * 내린다 — 빈 61 을 "값 0" 으로 오독하면 사용자가 입력한 금액이 지워진다.
 */
export function buildSetVITriggerRespFrame(input: FakeViTriggerInput | null = {}): Uint8Array {
  const b = new flatbuffers.Builder(256);

  if (input === null) {
    Envelope.startEnvelope(b);
    Envelope.addMsgType(b, STRATEGY_MSG.SetVITriggerResp);
    b.finish(Envelope.endEnvelope(b));
    return b.asUint8Array();
  }

  const accountNo = b.createString(input.accountNo ?? SAMPLE_ACCOUNT_NO);
  const priceType = b.createString(input.priceType ?? "U");
  // 문자열은 테이블을 열기 **전에** 만든다 (FlatBuffers 중첩 생성 금지 — Pitfall 1).
  const exchange = input.exchange === undefined ? null : b.createString(input.exchange);

  SetVITrigger.startSetVITrigger(b);
  SetVITrigger.addAccountNo(b, accountNo);
  SetVITrigger.addOrderAmountKrw(b, input.orderAmountKrw ?? 5_000_000n);
  SetVITrigger.addCheckRate(b, input.checkRate ?? 25);
  SetVITrigger.addPriceType(b, priceType);
  SetVITrigger.addRun(b, input.run ?? false);
  if (exchange !== null) SetVITrigger.addExchange(b, exchange);
  const cfg = SetVITrigger.endSetVITrigger(b);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, STRATEGY_MSG.SetVITriggerResp);
  Envelope.addSetViTrigger(b, cfg);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/**
 * VI 주문 상태. `Accepted ∧ filledQty>0` 이 부분체결이며 별도 상태값이 아니다.
 */
export type FakeViOrderState =
  | "Pending"
  | "Accepted"
  | "Cancelling"
  | "Cancelled"
  | "Filled"
  | "Rejected";

/** VI 주문 1건 (`VIOrderItem` 원소). 15 필드 전부 override 가능하다. */
export type FakeViOrderItemInput = {
  isin?: string;
  /** 첫 글자만 파싱된다. `"K"`/`"Q"` — 취소 `DirectOrderReq.market` 의 원천. */
  market?: string;
  accountNo?: string;
  /** **기본 `""` = 접수 전(Pending)** — 확인 체크를 걸 수 없는 상태다. */
  orderNo?: string;
  orderQty?: number;
  orderPrice?: number;
  triggerPrice?: number;
  basePrice?: number;
  /** `"HHMMSSuuu"` 9자. */
  viEndTime?: string;
  /** epoch ms **bigint**. */
  deadline110Ms?: bigint;
  /** epoch ms **bigint**. */
  deadline119Ms?: bigint;
  confirmed?: boolean;
  /** **서버 계산값** — 클라가 다시 계산하지 않는다. */
  confirmLocked?: boolean;
  /**
   * 상태 문자열. `FakeViOrderState` 6종이 정상값이지만 **임의 문자열도 받는다** —
   * 파서의 「알 수 없는 상태」 가드를 시험하려면 스키마 밖 값을 일부러 넣을 수 있어야
   * 한다(이 파일의 설계 규율). 교집합 표기는 6개 리터럴의 자동완성을 유지하면서
   * 확장만 허용하는 관용구다.
   */
  state?: FakeViOrderState | (string & {});
  filledQty?: number;
  /**
   * 거래소 (17-05 / D-06). 생략하면 슬롯을 싣지 않는다(구 서버 와이어 = `"KRX"` 정규화).
   * R8 매칭 키가 ISIN+거래소라 같은 종목이 양쪽에서 발동하면 **행이 둘**이다.
   */
  exchange?: string;
  /**
   * VI 해제됨 (quick-260923-jsv 서버 · 슬롯 36). 생략하면 슬롯을 싣지 않는다(구 서버 와이어 = `false`).
   */
  viReleased?: boolean;
};

/**
 * `VIOrderItem` 테이블 1건을 조립하고 offset 을 돌려준다.
 *
 * 데드라인 기본값을 **호출 시각 기준 상대값**(+110초/+119초)으로 두는 이유: 고정 epoch
 * 리터럴을 쓰면 언제 돌려도 이미 지난 시각이라 카운트다운이 늘 「만료」로 렌더된다.
 * 만료 경로를 시험하는 테스트는 과거 시각을 명시로 넣는다.
 */
function emitViOrderItem(
  b: flatbuffers.Builder,
  input: FakeViOrderItemInput,
  now: number,
): flatbuffers.Offset {
  const isin = b.createString(input.isin ?? SAMPLE_ISIN);
  const market = b.createString(input.market ?? "K");
  const accountNo = b.createString(input.accountNo ?? SAMPLE_ACCOUNT_NO);
  const orderNo = b.createString(input.orderNo ?? "");
  const viEndTime = b.createString(input.viEndTime ?? "093215000");
  const state = b.createString(input.state ?? "Pending");
  const exchange = input.exchange === undefined ? null : b.createString(input.exchange);

  VIOrderItem.startVIOrderItem(b);
  VIOrderItem.addIsin(b, isin);
  VIOrderItem.addMarket(b, market);
  VIOrderItem.addAccountNo(b, accountNo);
  VIOrderItem.addOrderNo(b, orderNo);
  VIOrderItem.addOrderQty(b, input.orderQty ?? 51);
  VIOrderItem.addOrderPrice(b, input.orderPrice ?? 91_000);
  VIOrderItem.addTriggerPrice(b, input.triggerPrice ?? 87_500);
  VIOrderItem.addBasePrice(b, input.basePrice ?? 70_000);
  VIOrderItem.addViEndTime(b, viEndTime);
  VIOrderItem.addDeadline110Ms(b, input.deadline110Ms ?? BigInt(now + 110_000));
  VIOrderItem.addDeadline119Ms(b, input.deadline119Ms ?? BigInt(now + 119_000));
  VIOrderItem.addConfirmed(b, input.confirmed ?? false);
  VIOrderItem.addConfirmLocked(b, input.confirmLocked ?? false);
  VIOrderItem.addState(b, state);
  VIOrderItem.addFilledQty(b, input.filledQty ?? 0);
  if (exchange !== null) VIOrderItem.addExchange(b, exchange);
  if (input.viReleased !== undefined) VIOrderItem.addViReleased(b, input.viReleased);
  return VIOrderItem.endVIOrderItem(b);
}

/**
 * VI 주문 목록 프레임 (72 스냅샷 / 73 푸시 — `vi_order_list` 슬롯 공유).
 *
 * `isSnapshot=true` 는 **전량 교체**, `false` 는 **항목별 upsert** 다. 64 와 마찬가지로
 * 0건도 길이 0 벡터로 만든다 — 확인 철회로 목록이 비는 경로가 정상 상태다.
 */
export function buildViOrderListFrame(
  items: FakeViOrderItemInput[] = [],
  isSnapshot = true,
): Uint8Array {
  const b = new flatbuffers.Builder(2048);
  const now = Date.now();
  const offsets = items.map((item) => emitViOrderItem(b, item, now));
  const vec = VIOrderList.createItemsVector(b, offsets);

  VIOrderList.startVIOrderList(b);
  VIOrderList.addIsSnapshot(b, isSnapshot);
  VIOrderList.addItems(b, vec);
  const list = VIOrderList.endVIOrderList(b);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(
    b,
    isSnapshot ? STRATEGY_MSG.GetVIOrderListResp : STRATEGY_MSG.VIOrderListPush,
  );
  Envelope.addViOrderList(b, list);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/** VI 발동 통보 1건 (`vi_order_notice` 슬롯). */
export type FakeViOrderNoticeInput = {
  isin?: string;
  accountNo?: string;
  triggerPrice?: number;
  basePrice?: number;
  /** 전일대비 정수 % 계열 값. */
  changeRate?: number;
  orderPrice?: number;
  orderQty?: number;
  /** 첫 글자만 파싱된다. `"K"`/`"Q"`. */
  market?: string;
  /** 같은 VI 안에서의 발주 순번(ubyte). */
  orderSeq?: number;
  /** `"HHMMSSuuu"` 9자. 클라가 −10초에 마감 알림을 띄우는 근거다. */
  viEndTime?: string;
  /** 발주 거래소 (17-05 / D-06). 생략하면 슬롯을 싣지 않는다(= `"KRX"` 정규화). */
  exchange?: string;
};

/** VI 발동 통보 프레임 (56). */
export function buildViOrderNoticeFrame(input: FakeViOrderNoticeInput = {}): Uint8Array {
  const b = new flatbuffers.Builder(512);
  const isin = b.createString(input.isin ?? SAMPLE_ISIN);
  const accountNo = b.createString(input.accountNo ?? SAMPLE_ACCOUNT_NO);
  const market = b.createString(input.market ?? "K");
  const viEndTime = b.createString(input.viEndTime ?? "093215000");
  const exchange = input.exchange === undefined ? null : b.createString(input.exchange);

  VIOrderNotice.startVIOrderNotice(b);
  VIOrderNotice.addIsin(b, isin);
  VIOrderNotice.addAccountNo(b, accountNo);
  VIOrderNotice.addTriggerPrice(b, input.triggerPrice ?? 87_500);
  VIOrderNotice.addBasePrice(b, input.basePrice ?? 70_000);
  VIOrderNotice.addChangeRate(b, input.changeRate ?? 25);
  VIOrderNotice.addOrderPrice(b, input.orderPrice ?? 91_000);
  VIOrderNotice.addOrderQty(b, input.orderQty ?? 51);
  VIOrderNotice.addMarket(b, market);
  VIOrderNotice.addOrderSeq(b, input.orderSeq ?? 1);
  VIOrderNotice.addViEndTime(b, viEndTime);
  if (exchange !== null) VIOrderNotice.addExchange(b, exchange);
  const notice = VIOrderNotice.endVIOrderNotice(b);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, STRATEGY_MSG.VIOrderNotice);
  Envelope.addViOrderNotice(b, notice);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/** 전략 일괄 비활성 집계 (`disable_strategies_resp` 슬롯). */
export type FakeDisableStrategiesInput = {
  disabledCount?: number;
  viDisabled?: boolean;
};

/**
 * 전략 일괄 비활성 응답 프레임 (65).
 *
 * 서버는 키별 60/61 에코를 **먼저** 보낸 뒤 이 집계를 요청 연결에만 보낸다. 즉 웹이 65 를
 * 받은 시점에는 이미 모든 행이 꺼져 있다 — 65 는 **완료 신호**일 뿐 상태의 근거가 아니다.
 * 등록된 전략이 없어도 `disabledCount:0` 으로 정상 응답한다(무응답 금지).
 */
export function buildDisableStrategiesRespFrame(
  input: FakeDisableStrategiesInput = {},
): Uint8Array {
  const b = new flatbuffers.Builder(128);

  DisableStrategiesResp.startDisableStrategiesResp(b);
  DisableStrategiesResp.addDisabledCount(b, input.disabledCount ?? 0);
  DisableStrategiesResp.addViDisabled(b, input.viDisabled ?? false);
  const resp = DisableStrategiesResp.endDisableStrategiesResp(b);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, STRATEGY_MSG.DisableStrategiesResp);
  Envelope.addDisableStrategiesResp(b, resp);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

// ============================================================
// 신규 푸시 3종 (17-03) — 76 `RateCrossAlert`
// ============================================================

/**
 * 등락률 돌파 알림 1건 (`RateCrossAlert`, 슬롯 4~18).
 *
 * 76 단건과 78 스냅샷 원소는 **같은 테이블**이다 — 빌더도 하나만 둔다(두 벌이면 한쪽만
 * 고쳐진다). 기본값은 「KRX 에서 삼성전자가 20% 를 넘었다」는 정상 입력이다.
 */
export type FakeRateCrossInput = {
  isin?: string;
  exchange?: string;
  lastPrice?: bigint;
  /** **double %** 다 — 내림하지 않는다. */
  changeRate?: number;
  thresholdPct?: number;
  basePrice?: bigint;
  /** 거래소 체결시각 `"HHMMSSuuuuuu"` 12자 원문. */
  exchangeTime?: string;
  /** 서버 시각 `"HH:MM:SS"`. */
  serverTime?: string;
};

/**
 * `RateCrossAlert` 테이블 1건을 만들어 offset 을 돌려준다 (76 과 78 이 함께 쓴다).
 *
 * 문자열은 테이블을 열기 **전에** 전부 `createString` 한다 (16-RESEARCH Pitfall 2 —
 * `startXxx()` 이후의 `createString` 은 릴리스 빌드에서 조용히 깨진 버퍼를 만든다).
 */
export function buildRateCrossAlertTable(
  b: flatbuffers.Builder,
  input: FakeRateCrossInput = {},
): flatbuffers.Offset {
  const isin = b.createString(input.isin ?? SAMPLE_ISIN);
  const exchange = b.createString(input.exchange ?? "KRX");
  const exchangeTime = b.createString(input.exchangeTime ?? "093015123456");
  const serverTime = b.createString(input.serverTime ?? "09:30:15");

  RateCrossAlert.startRateCrossAlert(b);
  RateCrossAlert.addIsin(b, isin);
  RateCrossAlert.addExchange(b, exchange);
  RateCrossAlert.addLastPrice(b, input.lastPrice ?? 84_000n);
  RateCrossAlert.addChangeRate(b, input.changeRate ?? 20.57);
  RateCrossAlert.addThresholdPct(b, input.thresholdPct ?? 20);
  RateCrossAlert.addBasePrice(b, input.basePrice ?? 70_000n);
  RateCrossAlert.addExchangeTime(b, exchangeTime);
  RateCrossAlert.addServerTime(b, serverTime);
  return RateCrossAlert.endRateCrossAlert(b);
}

/** 등락률 돌파 알림 프레임 (76). 요청 짝이 없는 **Broadcast** 라 로그인 전에도 온다. */
export function buildRateCrossAlertFrame(input: FakeRateCrossInput = {}): Uint8Array {
  const b = new flatbuffers.Builder(256);
  const alert = buildRateCrossAlertTable(b, input);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.RateCrossAlert);
  Envelope.addRateCrossAlert(b, alert);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

// ============================================================
// 신규 푸시 3종 (17-03) — 78 `RateCrossSnapshot` · 77 `QueuedWindowState`
// ============================================================

/**
 * 등락률 돌파 above 집합 전량 프레임 (78).
 *
 * **빈 벡터도 정상 입력이다** — 「돌파 없음」의 확정 정보이고 서버가 로그인 직후 그 연결에만
 * 1프레임 보낸다. 기본값을 1건으로 두지 않는 이유가 그것이다(빈 집합을 만들 수 있어야 한다).
 *
 * ⚠️ 벡터는 원소 N개를 **각각 끝낸 뒤에** `createItemsVector` 로 묶는다 (Pitfall 2 — 테이블이
 *    열려 있는 동안 다른 테이블·문자열을 만들면 릴리스 빌드에서 조용히 깨진 버퍼가 된다).
 */
export function buildRateCrossSnapshotFrame(items: FakeRateCrossInput[] = []): Uint8Array {
  const b = new flatbuffers.Builder(1024);

  const offsets = items.map((item) => buildRateCrossAlertTable(b, item));
  const vector = RateCrossSnapshot.createItemsVector(b, offsets);

  RateCrossSnapshot.startRateCrossSnapshot(b);
  RateCrossSnapshot.addItems(b, vector);
  const snap = RateCrossSnapshot.endRateCrossSnapshot(b);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.RateCrossSnapshot);
  Envelope.addRateCrossSnapshot(b, snap);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/**
 * 예약·장전·시간외종가 발주 창 상태 (77).
 *
 * 여섯 값 **전부 표시 힌트**다 — relay 도 브라우저도 벽시계로 창을 판정하지 않는다
 * (fbs 주석과 `docs/features/queued-order.md` 의 시각이 엇갈린다).
 */
export type FakeQueuedWindowInput = {
  open?: boolean;
  maxPieces?: number;
  preopenOpen?: boolean;
  g2Open?: boolean;
  g3Open?: boolean;
  nxtPreopenOpen?: boolean;
};

/** 예약창 상태 프레임 (77). 기본값은 「전부 닫힘 · 조각 5개」다. */
export function buildQueuedWindowStateFrame(input: FakeQueuedWindowInput = {}): Uint8Array {
  const b = new flatbuffers.Builder(128);

  QueuedWindowState.startQueuedWindowState(b);
  QueuedWindowState.addOpen(b, input.open ?? false);
  QueuedWindowState.addMaxPieces(b, input.maxPieces ?? 5);
  QueuedWindowState.addPreopenOpen(b, input.preopenOpen ?? false);
  QueuedWindowState.addG2Open(b, input.g2Open ?? false);
  QueuedWindowState.addG3Open(b, input.g3Open ?? false);
  QueuedWindowState.addNxtPreopenOpen(b, input.nxtPreopenOpen ?? false);
  const state = QueuedWindowState.endQueuedWindowState(b);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.QueuedWindowState);
  Envelope.addQueuedWindowState(b, state);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/**
 * 사용자 설정 (84 · Phase 27). 11값 + `present`(84 전용). 금액 3칸은 **만원**.
 */
export type FakeUserSettingsInput = {
  preBuyAmount?: number;
  addBuyAmount?: number;
  postBuyAmount?: number;
  postBuyMaxCount?: number;
  postBuyFloorQty?: number;
  postBuyReboundPct?: number;
  sellQtyTrackRatio?: number;
  autoSellPeriodSec?: number;
  auctionSellRatioPct?: number;
  autoSellRatioDefaultPct?: number;
  autoSellMethodDefault?: number;
  present?: boolean;
};

/**
 * 사용자 설정 프레임 (84). 기본값은 **서버 내장 기본값**(4000 · 4000 · 4000 · 3 · 100000 · 30 · 55 · 3 · 20 · 10 · 3)
 * 에 `present` false(= 서버 저장값 없음)다. 이름 있는 `add*` 빌더로 조립한다(위치 인자 `createUserSettings` 금지 —
 * 칸이 밀려도 컴파일이 못 잡는다).
 */
export function buildUserSettingsFrame(input: FakeUserSettingsInput = {}): Uint8Array {
  const b = new flatbuffers.Builder(128);

  UserSettings.startUserSettings(b);
  UserSettings.addPreBuyAmount(b, input.preBuyAmount ?? 4000);
  UserSettings.addAddBuyAmount(b, input.addBuyAmount ?? 4000);
  UserSettings.addPostBuyAmount(b, input.postBuyAmount ?? 4000);
  UserSettings.addPostBuyMaxCount(b, input.postBuyMaxCount ?? 3);
  UserSettings.addPostBuyFloorQty(b, input.postBuyFloorQty ?? 100000);
  UserSettings.addPostBuyReboundPct(b, input.postBuyReboundPct ?? 30);
  UserSettings.addSellQtyTrackRatio(b, input.sellQtyTrackRatio ?? 55);
  UserSettings.addAutoSellPeriodSec(b, input.autoSellPeriodSec ?? 3);
  UserSettings.addAuctionSellRatioPct(b, input.auctionSellRatioPct ?? 20);
  UserSettings.addAutoSellRatioDefaultPct(b, input.autoSellRatioDefaultPct ?? 10);
  UserSettings.addAutoSellMethodDefault(b, input.autoSellMethodDefault ?? 3);
  UserSettings.addPresent(b, input.present ?? false);
  const settings = UserSettings.endUserSettings(b);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.UserSettingsResp);
  Envelope.addUserSettings(b, settings);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

// ============================================================
// 종목마스터 (57) — quick-260923-cqj
// ============================================================

/** 57 원소 1건. 모든 필드를 덮어쓸 수 있다 — 형식 가드를 시험하려면 깨진 원소가 필요하다. */
export type FakeSymbolMasterItem = {
  isin?: string;
  code?: string;
  name?: string;
  /** 게이트웨이 어휘 "0"(코스피) / "1"(코스닥). */
  marketType?: string;
  secGroupId?: string;
  nxtTradable?: boolean;
};

export type FakeSymbolMasterFrameInput = {
  items?: FakeSymbolMasterItem[];
  seq?: number;
  totalItems?: number;
  isLast?: boolean;
};

/**
 * 종목마스터 분할 응답 1프레임 (57 — `symbol_master` 슬롯).
 *
 * ⚠️ 문자열은 원소 테이블을 **열기 전에** 만들고, 원소 테이블은 각각 끝낸 뒤 `createItemsVector`
 *    로 묶는다 (Pitfall 2).
 */
export function buildSymbolMasterFrame(input: FakeSymbolMasterFrameInput = {}): Uint8Array {
  const items = input.items ?? [];
  const b = new flatbuffers.Builder(1024);

  const offsets = items.map((item) => {
    const code = b.createString(item.code ?? "005930");
    const name = b.createString(item.name ?? "삼성전자");
    const isin = b.createString(item.isin ?? SAMPLE_ISIN);
    const marketType = b.createString(item.marketType ?? "0");
    const secGroupId = b.createString(item.secGroupId ?? "ST");
    SymbolMasterItem.startSymbolMasterItem(b);
    SymbolMasterItem.addCode(b, code);
    SymbolMasterItem.addName(b, name);
    SymbolMasterItem.addIsin(b, isin);
    SymbolMasterItem.addMarketType(b, marketType);
    SymbolMasterItem.addSecGroupId(b, secGroupId);
    SymbolMasterItem.addNxtTradable(b, item.nxtTradable ?? false);
    return SymbolMasterItem.endSymbolMasterItem(b);
  });
  const vector = SymbolMaster.createItemsVector(b, offsets);

  SymbolMaster.startSymbolMaster(b);
  SymbolMaster.addItems(b, vector);
  SymbolMaster.addSeq(b, input.seq ?? 0);
  SymbolMaster.addTotalItems(b, input.totalItems ?? items.length);
  SymbolMaster.addIsLast(b, input.isLast ?? true);
  const master = SymbolMaster.endSymbolMaster(b);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.SymbolMasterResp);
  Envelope.addSymbolMaster(b, master);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/**
 * 서버 규약대로 분할한 57 프레임 배열 — seq 0부터, total_items 는 전 프레임 동일, is_last 는
 * 마지막 프레임만 true. 0건이면 is_last 프레임 1건이다 (`QuoteWire.cpp:463-537`).
 */
export function buildSymbolMasterFrames(
  items: FakeSymbolMasterItem[],
  chunkSize = 500,
): Uint8Array[] {
  if (items.length === 0) {
    return [buildSymbolMasterFrame({ items: [], seq: 0, totalItems: 0, isLast: true })];
  }
  const frames: Uint8Array[] = [];
  for (let from = 0, seq = 0; from < items.length; from += chunkSize, seq += 1) {
    frames.push(
      buildSymbolMasterFrame({
        items: items.slice(from, from + chunkSize),
        seq,
        totalItems: items.length,
        isLast: from + chunkSize >= items.length,
      }),
    );
  }
  return frames;
}

// ============================================================
// 관찰자 저널 (79 로그인 응답 · 80 저널 배치) — Phase 19-09
// ============================================================

/** 관찰자 로그인 응답 계좌 매핑 1행. */
export type FakeObserverAccountInput = { dmaUserId?: string; accountNo?: string; name?: string; priority?: number };

export type FakeObserverLoginRespInput = {
  success?: boolean;
  message?: string;
  broker?: string;
  epoch?: string;
  headSeq?: number | bigint;
  oldestSeq?: number | bigint;
  resync?: boolean;
  /** 생략하면 성공은 `SAMPLE_ACCOUNT_NO` 1행, 실패는 빈 벡터(게이트웨이 규약). */
  accounts?: FakeObserverAccountInput[];
  /** 전략 스트림 head · oldest · resync (Phase 25). 기본 0 / 0 / false = 전략 저널 없음(G1 ⓑ). */
  strategyHeadSeq?: number | bigint;
  strategyOldestSeq?: number | bigint;
  strategyResync?: boolean;
  /** 수락한 역할 에코 (Phase 26 · ed2e0240). 기본 0 = journal · 1 = quote · 거부 응답은 0(게이트웨이 규약). */
  role?: number;
};

/**
 * 관찰자 로그인 응답 프레임 (79 · `observer_login_resp` 슬롯). 실계좌·실서버 값 리터럴 금지(D-27) —
 * 계좌 기본값은 `SAMPLE_ACCOUNT_NO` 다.
 */
export function buildObserverLoginRespFrame(input: FakeObserverLoginRespInput = {}): Uint8Array {
  const b = new flatbuffers.Builder(512);
  const success = input.success ?? true;
  const rows = input.accounts ?? (success ? [{}] : []);
  // 문자열·원소는 테이블 조립 **전에** 전부 만든다 (FlatBuffers 중첩 제약).
  const message = b.createString(input.message ?? "");
  const broker = b.createString(input.broker ?? "KB");
  const epoch = b.createString(input.epoch ?? "ep-1");
  const entries = rows.map((a) =>
    ObserverAccount.createObserverAccount(
      b,
      b.createString(a.dmaUserId ?? "dma-user-1"),
      b.createString(a.accountNo ?? SAMPLE_ACCOUNT_NO),
      b.createString(a.name ?? "위탁종합"),
      a.priority ?? 0,
    ),
  );
  const accounts = ObserverLoginResp.createAccountsVector(b, entries);
  const resp = ObserverLoginResp.createObserverLoginResp(
    b,
    success,
    message,
    broker,
    epoch,
    BigInt(input.headSeq ?? 0),
    BigInt(input.oldestSeq ?? 0),
    input.resync ?? false,
    accounts,
    BigInt(input.strategyHeadSeq ?? 0),
    BigInt(input.strategyOldestSeq ?? 0),
    input.strategyResync ?? false,
    input.role ?? 0,
  );
  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.ObserverLoginResp);
  Envelope.addObserverLoginResp(b, resp);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/** 저널 레코드 입력 — `seq` 만 필수이고 나머지는 정상 신규 접수(A) 기본값으로 채운다. */
export type FakeJournalRecordInput = Partial<JournalRecord> & { seq: number };

/** `FakeJournalRecordInput` → 23필드 완성본. 테스트가 기대값을 같은 함수로 만든다(두 벌 금지). */
export function fakeJournalRecord(input: FakeJournalRecordInput): JournalRecord {
  return {
    tradeDate: "2026-09-28",
    gwTimeMs: 1_790_000_000_000 + input.seq,
    dmaUserId: "dma-user-1",
    accountNo: SAMPLE_ACCOUNT_NO,
    isin: SAMPLE_ISIN,
    side: "B",
    sideTrusted: true,
    orderNo: `00000${input.seq}`,
    orgOrderNo: "",
    noticeType: "A",
    requestKind: "New",
    requester: "Manual",
    origin: "Manual",
    exchange: "KRX",
    board: "G2",
    orderPrice: 70_000,
    orderQty: 10,
    execPrice: 0,
    execQty: 0,
    resultCode: 0,
    message: "",
    localReject: false,
    ...input,
  };
}

/** 전략 이벤트 입력 — `seq` 만 필수이고 나머지는 기획서 12451 선매수 BuyOrder 값으로 채운다 (Phase 25). */
export type FakeStrategyEventInput = Partial<StrategyEventRecord> & { seq: number };

/** 12451 선매수 BuyOrder 전송 시각 — 2026-09-29 09:45:02.861 KST. */
const SAMPLE_BUY_ORDER_MS = Date.parse("2026-09-29T09:45:02.861+09:00");

/**
 * `FakeStrategyEventInput` → 43필드 완성본. 기본값은 기획서 하루 흐름의 12451 선매수 BuyOrder(3) 다 —
 * 오늘 게이트웨이가 실제로 내는 유일한 종류(G1 (e)). 계좌는 `SAMPLE_ACCOUNT_NO`(가짜 값 · D-27).
 */
export function fakeStrategyEventRecord(input: FakeStrategyEventInput): StrategyEventRecord {
  return {
    tradeDate: "2026-09-29",
    gwTimeMs: SAMPLE_BUY_ORDER_MS,
    kind: 3,
    group: 1,
    exchange: "KRX",
    isin: SAMPLE_ISIN,
    cumVolume: 861_800,
    dmaUserId: "dma-user-1",
    accountNo: SAMPLE_ACCOUNT_NO,
    orderNo: "12451",
    price: 12_350,
    qty: 300,
    orderCondition: "",
    reasonCode: "PreBuy B6Buy3 매물소진(매도1호가==감시가 && 잔량<=감시수량)",
    condThreshold: 50_000,
    condActual: 38_200,
    condMetric: 1,
    evKind: 1,
    evPrice: 12_350,
    evQtyBefore: 52_100,
    evQtyAfter: 38_200,
    evTradeQty: 0,
    limitBidQty: 0,
    bid1Price: 0,
    bid1Qty: 0,
    acceptLatencyUs: 18_000,
    immediateFillQty: 0,
    queueCase: 0,
    baseCum: 0,
    aheadQty: 0,
    expectedCum: 0,
    errorVolume: 0,
    remainingVolume: 0,
    hasRemaining: false,
    cancelReason: 0,
    resultCode: 0,
    message: "",
    entryRound: 0,
    snapQty: [],
    snapCum: [],
    askQtyAtLimit: 0,
    openAtLimit: false,
    ...input,
  };
}

export type FakeJournalBatchInput = {
  records?: FakeJournalRecordInput[];
  /** 생략하면 마지막 레코드 seq(없으면 0). */
  headSeq?: number | bigint;
  /** 생략하면 `true`. */
  caughtUp?: boolean;
  /** 전략 이벤트(Phase 25). 생략하면 빈 벡터(한쪽 0건 = 빈 벡터 · G1 ⓐ). */
  strategyEvents?: FakeStrategyEventInput[];
  /** 생략하면 마지막 전략 seq(없으면 0). */
  strategyHeadSeq?: number | bigint;
  /** 생략하면 `true`. */
  strategyCaughtUp?: boolean;
  /** true 면 전략 세 필드를 아예 쓰지 않는다 = 구 게이트웨이 프레임(필드 부재). */
  omitStrategy?: boolean;
};

/** 저널 배치 프레임 (80 · `journal_batch` 슬롯). 레코드 순서는 입력 그대로다(게이트웨이는 seq 오름차순). */
export function buildJournalBatchFrame(input: FakeJournalBatchInput = {}): Uint8Array {
  const recs = (input.records ?? []).map(fakeJournalRecord);
  const b = new flatbuffers.Builder(1024);
  const offsets = recs.map((r) => {
    // 문자열을 먼저 만든다 (FlatBuffers 중첩 제약).
    const tradeDate = b.createString(r.tradeDate);
    const dmaUserId = b.createString(r.dmaUserId);
    const accountNo = b.createString(r.accountNo);
    const isin = b.createString(r.isin);
    const side = b.createString(r.side);
    const orderNo = b.createString(r.orderNo);
    const orgOrderNo = b.createString(r.orgOrderNo);
    const noticeType = b.createString(r.noticeType);
    const requestKind = b.createString(r.requestKind);
    const requester = b.createString(r.requester);
    const origin = b.createString(r.origin);
    const exchange = b.createString(r.exchange);
    const board = b.createString(r.board);
    const message = b.createString(r.message);
    return WireJournalRecord.createJournalRecord(
      b,
      BigInt(r.seq),
      tradeDate,
      BigInt(r.gwTimeMs),
      dmaUserId,
      accountNo,
      isin,
      side,
      r.sideTrusted,
      orderNo,
      orgOrderNo,
      noticeType,
      requestKind,
      requester,
      origin,
      exchange,
      board,
      r.orderPrice,
      r.orderQty,
      r.execPrice,
      r.execQty,
      r.resultCode,
      message,
      r.localReject,
    );
  });
  const records = JournalBatch.createRecordsVector(b, offsets);
  const head = input.headSeq ?? recs[recs.length - 1]?.seq ?? 0;
  if (input.omitStrategy === true) {
    // 구 게이트웨이 — 전략 슬롯(10/12/14)을 쓰지 않는다.
    JournalBatch.startJournalBatch(b);
    JournalBatch.addRecords(b, records);
    JournalBatch.addHeadSeq(b, BigInt(head));
    JournalBatch.addCaughtUp(b, input.caughtUp ?? true);
    const legacy = JournalBatch.endJournalBatch(b);
    Envelope.startEnvelope(b);
    Envelope.addMsgType(b, MSG.JournalBatch);
    Envelope.addJournalBatch(b, legacy);
    b.finish(Envelope.endEnvelope(b));
    return b.asUint8Array();
  }
  const evs = (input.strategyEvents ?? []).map(fakeStrategyEventRecord);
  const strategyEvents = JournalBatch.createStrategyEventsVector(
    b,
    evs.map((e) => buildStrategyEvent(b, e)),
  );
  const strategyHead = input.strategyHeadSeq ?? evs[evs.length - 1]?.seq ?? 0;
  const batch = JournalBatch.createJournalBatch(
    b,
    records,
    BigInt(head),
    input.caughtUp ?? true,
    strategyEvents,
    BigInt(strategyHead),
    input.strategyCaughtUp ?? true,
  );
  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.JournalBatch);
  Envelope.addJournalBatch(b, batch);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/** 전략 이벤트 1건을 빌더에 조립한다 (문자열 · 벡터를 테이블 조립 **전에** 만든다 — FlatBuffers 중첩 제약). */
function buildStrategyEvent(b: flatbuffers.Builder, e: StrategyEventRecord): flatbuffers.Offset {
  const tradeDate = b.createString(e.tradeDate);
  const exchange = b.createString(e.exchange);
  const isin = b.createString(e.isin);
  const dmaUserId = b.createString(e.dmaUserId);
  const accountNo = b.createString(e.accountNo);
  const orderNo = b.createString(e.orderNo);
  const orderCondition = b.createString(e.orderCondition);
  const reasonCode = b.createString(e.reasonCode);
  const message = b.createString(e.message);
  const snapQty = WireStrategyEvent.createSnapQtyVector(b, e.snapQty.map((v) => BigInt(v)));
  const snapCum = WireStrategyEvent.createSnapCumVector(b, e.snapCum.map((v) => BigInt(v)));
  return WireStrategyEvent.createStrategyEvent(
    b,
    BigInt(e.seq),
    tradeDate,
    BigInt(e.gwTimeMs),
    e.kind,
    e.group,
    exchange,
    isin,
    BigInt(e.cumVolume),
    dmaUserId,
    accountNo,
    orderNo,
    e.price,
    e.qty,
    orderCondition,
    reasonCode,
    BigInt(e.condThreshold),
    BigInt(e.condActual),
    e.condMetric,
    e.evKind,
    e.evPrice,
    BigInt(e.evQtyBefore),
    BigInt(e.evQtyAfter),
    BigInt(e.evTradeQty),
    BigInt(e.limitBidQty),
    e.bid1Price,
    BigInt(e.bid1Qty),
    e.acceptLatencyUs,
    BigInt(e.immediateFillQty),
    e.queueCase,
    BigInt(e.baseCum),
    BigInt(e.aheadQty),
    BigInt(e.expectedCum),
    BigInt(e.errorVolume),
    BigInt(e.remainingVolume),
    e.hasRemaining,
    e.cancelReason,
    e.resultCode,
    message,
    e.entryRound,
    snapQty,
    snapCum,
    BigInt(e.askQtyAtLimit),
    e.openAtLimit,
  );
}

// ============================================================
// 잔량진행률 (83 `QueueProgress`) — Phase 25-06
// ============================================================

/**
 * 진행률 항목 1건. **모든 필드가 선택**이다 — 계좌 빈 항목 · 남의 계좌 항목 · 모르는 group 을
 * 만들 수 있어야 파서 가드와 hub 계좌 필터를 시험할 수 있다.
 * 계좌 기본값은 `SAMPLE_ACCOUNT_NO`, 종목 · 거래소 기본값은 프레임의 값이다.
 */
export type FakeQueueProgressItemInput = {
  accountNo?: string;
  /** 게이트웨이 원문의 주문자 — relay 는 hub 에서 캐시 전에 지운다(T-19-08). */
  dmaUserId?: string;
  orderNo?: string;
  exchange?: string;
  isin?: string;
  group?: number;
  expectedCum?: number;
  currentCum?: number;
  remainingVolume?: number;
  progressBp?: number;
  /** 첫 체결(슬롯 24). 주지 않으면 false — 기본값이라 버퍼에 쓰이지 않아 옛 서버 프레임과 같다. */
  firstFilled?: boolean;
};

/** 83 프레임 입력. 종목 · 거래소 기본값은 `SAMPLE_ISIN` · `"KRX"`, 항목 기본값은 빈 벡터(= 대기 주문 전부 사라짐). */
export type FakeQueueProgressInput = {
  isin?: string;
  exchange?: string;
  items?: FakeQueueProgressItemInput[];
};

/** 잔량진행률 프레임 (83 · `queue_progress` 슬롯). 항목 순서는 입력 그대로다. */
export function buildQueueProgressFrame(input: FakeQueueProgressInput = {}): Uint8Array {
  const frameIsin = input.isin ?? SAMPLE_ISIN;
  const frameExchange = input.exchange ?? "KRX";
  const b = new flatbuffers.Builder(1024);
  const offsets = (input.items ?? []).map((it) => {
    // 문자열을 먼저 만든다 (FlatBuffers 중첩 제약).
    const accountNo = b.createString(it.accountNo ?? SAMPLE_ACCOUNT_NO);
    const dmaUserId = b.createString(it.dmaUserId ?? "dma-user-1");
    const orderNo = b.createString(it.orderNo ?? "12453");
    const exchange = b.createString(it.exchange ?? frameExchange);
    const isin = b.createString(it.isin ?? frameIsin);
    return QueueProgressItem.createQueueProgressItem(
      b,
      accountNo,
      dmaUserId,
      orderNo,
      exchange,
      isin,
      it.group ?? 1,
      BigInt(it.expectedCum ?? 1_100_000),
      BigInt(it.currentCum ?? 1_088_000),
      BigInt(it.remainingVolume ?? 12_000),
      it.progressBp ?? 8800,
      it.firstFilled ?? false,
    );
  });
  const items = QueueProgress.createItemsVector(b, offsets);
  const isin = b.createString(frameIsin);
  const exchange = b.createString(frameExchange);
  const progress = QueueProgress.createQueueProgress(b, isin, exchange, items);

  Envelope.startEnvelope(b);
  // `MSG.QueueProgress` 가 아니라 생성 enum 을 쓴다 — 화이트리스트 밖 번호로도 프레임을 만들 수 있어야
  // 「83 은 INBOUND 에 있다」 단언이 이 빌더에 기대지 않는다.
  Envelope.addMsgType(b, MsgType.QueueProgress);
  Envelope.addQueueProgress(b, progress);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

// ============================================================
// 상한가 특징 (85) — Phase 28 28-01
// ============================================================

/** 85 창구 1건(`MemberDelta`). 64비트 칸은 와이어 그대로 bigint 로 받는다. */
export type FakeLimitFeatureMemberInput = {
  memberNo?: string;
  dQty?: bigint;
  dValue?: bigint;
  shareBp?: number;
};

/**
 * 85 `LimitFeature` 입력(34필드 선택). 기본값 = **잠김 시나리오**(lock 1 · 43초째 · 대기 17.3억 · 소진 ∞ ·
 * 누적 매도 6.0억 · 취소 4.6억(위험도 35%) · 매수 창구 00050 · 매도 창구 00002) — e2e P28-1 이 「상한가 · 잠김 43초」 ·
 * 누적 행 「매도 6.0억 | 취소 4.6억 | 위험도 35%」 · title 첫 줄 「잠김 43초째 · 대기 17.3억 · 소진 —」 을 단언하는 근거다.
 * 실서버 값이 아니다. `lockSellKrw` · `lockCancelKrw` 에 0n 을 주면 구 서버 프레임(필드 부재 → 기본값 0)과 같다.
 */
export type FakeLimitFeatureInput = {
  isin?: string;
  exchange?: string;
  gwTimeMs?: bigint;
  featureSchema?: number;
  upperPx?: number;
  lastPx?: number;
  rateBp?: number;
  basePx?: number;
  listShares?: bigint;
  qQty?: bigint;
  qKrw?: bigint;
  wallKrwVisible?: bigint;
  wallQtyHidden?: bigint;
  wallTruncated?: boolean;
  sellLed10s?: bigint;
  buyLed10s?: bigint;
  cancel10s?: bigint;
  new10s?: bigint;
  auctionFill10s?: bigint;
  drainS?: number;
  lockState?: number;
  lockElapsedS?: number;
  burstUpperLimit?: boolean;
  auction?: boolean;
  memberBuy?: FakeLimitFeatureMemberInput[];
  memberSell?: FakeLimitFeatureMemberInput[];
  memberDeltaPartial?: boolean;
  modelState?: number;
  modelSchemaVersion?: number;
  pBreakBp?: number;
  pHorizonS?: number;
  /** fbs ea8d9171 말미 append — 이번 잠김 누적 매도 주도 상한가 체결 금액(원). */
  lockSellKrw?: bigint;
  /** fbs ea8d9171 말미 append — 같은 창 상한가 매수잔량 취소 금액(원, 하한). */
  lockCancelKrw?: bigint;
};

/** 기본 매수 창구(잠김 시나리오). */
export const FAKE_LIMIT_FEATURE_MEMBER_BUY: FakeLimitFeatureMemberInput[] = [
  { memberNo: "00050", dQty: 52_000n, dValue: 676_000_000n, shareBp: 7407 },
];
/** 기본 매도 창구(잠김 시나리오). */
export const FAKE_LIMIT_FEATURE_MEMBER_SELL: FakeLimitFeatureMemberInput[] = [
  { memberNo: "00002", dQty: 18_000n, dValue: 234_000_000n, shareBp: 10000 },
];

/**
 * 상한가 특징 프레임 (85 · `limit_feature` 슬롯 90). 이름 있는 `add*` 빌더로 조립한다(위치 인자
 * `createLimitFeature` · `createMemberDelta` 금지 — 칸이 밀려도 컴파일이 못 잡는다). 문자열 · 벡터는 테이블을 열기
 * **전에** 전부 만든다(16-RESEARCH Pitfall 2).
 */
export function buildLimitFeatureFrame(input: FakeLimitFeatureInput = {}): Uint8Array {
  const b = new flatbuffers.Builder(1024);

  const member = (m: FakeLimitFeatureMemberInput): flatbuffers.Offset => {
    const memberNo = b.createString(m.memberNo ?? "00050");
    MemberDelta.startMemberDelta(b);
    MemberDelta.addMemberNo(b, memberNo);
    MemberDelta.addDQty(b, m.dQty ?? 0n);
    MemberDelta.addDValue(b, m.dValue ?? 0n);
    MemberDelta.addShareBp(b, m.shareBp ?? 0);
    return MemberDelta.endMemberDelta(b);
  };
  const buyOffsets = (input.memberBuy ?? FAKE_LIMIT_FEATURE_MEMBER_BUY).map(member);
  const sellOffsets = (input.memberSell ?? FAKE_LIMIT_FEATURE_MEMBER_SELL).map(member);
  const memberBuy = LimitFeature.createMemberBuyVector(b, buyOffsets);
  const memberSell = LimitFeature.createMemberSellVector(b, sellOffsets);
  const isin = b.createString(input.isin ?? SAMPLE_ISIN);
  const exchange = b.createString(input.exchange ?? "KRX");

  LimitFeature.startLimitFeature(b);
  LimitFeature.addIsin(b, isin);
  LimitFeature.addExchange(b, exchange);
  // 장중 고정 시각(2026-10-05 10:35:30 KST) — 테스트 결정성.
  LimitFeature.addGwTimeMs(b, input.gwTimeMs ?? 1_791_164_130_000n);
  LimitFeature.addFeatureSchema(b, input.featureSchema ?? 1);
  LimitFeature.addUpperPx(b, input.upperPx ?? 13000);
  LimitFeature.addLastPx(b, input.lastPx ?? 13000);
  LimitFeature.addRateBp(b, input.rateBp ?? 3000);
  LimitFeature.addBasePx(b, input.basePx ?? 10000);
  LimitFeature.addListShares(b, input.listShares ?? 25_000_000n);
  LimitFeature.addQQty(b, input.qQty ?? 133_077n);
  LimitFeature.addQKrw(b, input.qKrw ?? 1_730_000_000n);
  LimitFeature.addWallKrwVisible(b, input.wallKrwVisible ?? 0n);
  LimitFeature.addWallQtyHidden(b, input.wallQtyHidden ?? 0n);
  LimitFeature.addWallTruncated(b, input.wallTruncated ?? false);
  LimitFeature.addSellLed10s(b, input.sellLed10s ?? 3_700n);
  LimitFeature.addBuyLed10s(b, input.buyLed10s ?? 6_300n);
  LimitFeature.addCancel10s(b, input.cancel10s ?? 2_300n);
  LimitFeature.addNew10s(b, input.new10s ?? 12_400n);
  LimitFeature.addAuctionFill10s(b, input.auctionFill10s ?? 0n);
  LimitFeature.addDrainS(b, input.drainS ?? -1);
  LimitFeature.addLockState(b, input.lockState ?? 1);
  LimitFeature.addLockElapsedS(b, input.lockElapsedS ?? 43);
  LimitFeature.addBurstUpperLimit(b, input.burstUpperLimit ?? false);
  LimitFeature.addAuction(b, input.auction ?? false);
  LimitFeature.addMemberBuy(b, memberBuy);
  LimitFeature.addMemberSell(b, memberSell);
  LimitFeature.addMemberDeltaPartial(b, input.memberDeltaPartial ?? false);
  LimitFeature.addModelState(b, input.modelState ?? 0);
  LimitFeature.addModelSchemaVersion(b, input.modelSchemaVersion ?? 0);
  LimitFeature.addPBreakBp(b, input.pBreakBp ?? -1);
  LimitFeature.addPHorizonS(b, input.pHorizonS ?? 0);
  LimitFeature.addLockSellKrw(b, input.lockSellKrw ?? 600_000_000n);
  LimitFeature.addLockCancelKrw(b, input.lockCancelKrw ?? 460_000_000n);
  const feature = LimitFeature.endLimitFeature(b);

  Envelope.startEnvelope(b);
  // 생성 enum 을 쓴다 — 「85 는 INBOUND 에 있다」 단언이 이 빌더에 기대지 않게(buildQueueProgressFrame 과 같은 규율).
  Envelope.addMsgType(b, MsgType.LimitFeature);
  Envelope.addLimitFeature(b, feature);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

// ============================================================
// admin 관리 (86 · 87) — Phase 29 · gh-trade 92cdfbff · blob 03fc8cbe
// ============================================================
//
// 실계좌 · 실서버 값 리터럴 금지(D-27) — 계좌 기본값은 `SAMPLE_ACCOUNT_NO`, 지점 · 취급자는 KB 형식(5자 · 6자) 가짜 값이다.
// 교보 서버 계좌를 흉내 내려면 `branchNo: ""` · `traderId: ""` 를 넘긴다(D-23 ③).

/** `AdminAccount` 1행 입력. 생략 필드는 KB 형식 가짜 값. */
export type FakeAdminAccountInput = {
  accountNo?: string;
  name?: string;
  branchNo?: string;
  traderId?: string;
  priority?: number;
};

/** 86 입력. 기본 = 성공(code 0) · rev 1. */
export type FakeAdminCommandRespInput = {
  requestId?: bigint;
  ok?: boolean;
  code?: number;
  message?: string;
  usersRev?: bigint;
};

/** 87 유저 1명 입력. */
export type FakeAdminUserInput = { userId?: string; accounts?: FakeAdminAccountInput[] };

/** 87 입력. 기본 = rev 1 · 유저 1명(계좌 1개). */
export type FakeAdminUsersSnapshotInput = {
  usersRev?: bigint;
  users?: FakeAdminUserInput[];
};

/** `AdminAccount` 테이블 조립 — 생성 빌더(start/add/end)로만. 문자열은 테이블 조립 **전에** 만든다. */
function buildFakeAdminAccount(b: flatbuffers.Builder, a: FakeAdminAccountInput): flatbuffers.Offset {
  const accountNo = b.createString(a.accountNo ?? SAMPLE_ACCOUNT_NO);
  const name = b.createString(a.name ?? "위탁종합");
  const branchNo = b.createString(a.branchNo ?? "00000");
  const traderId = b.createString(a.traderId ?? "000000");
  AdminAccount.startAdminAccount(b);
  AdminAccount.addAccountNo(b, accountNo);
  AdminAccount.addName(b, name);
  AdminAccount.addBranchNo(b, branchNo);
  AdminAccount.addTraderId(b, traderId);
  AdminAccount.addPriority(b, a.priority ?? 0);
  return AdminAccount.endAdminAccount(b);
}

/** admin 명령 응답 프레임 (86 · `admin_command_resp` 슬롯 94). */
export function buildAdminCommandRespFrame(input: FakeAdminCommandRespInput = {}): Uint8Array {
  const b = new flatbuffers.Builder(256);
  const message = b.createString(input.message ?? "");
  AdminCommandResp.startAdminCommandResp(b);
  AdminCommandResp.addRequestId(b, input.requestId ?? 1n);
  AdminCommandResp.addOk(b, input.ok ?? (input.code ?? 0) === 0);
  AdminCommandResp.addCode(b, input.code ?? 0);
  AdminCommandResp.addMessage(b, message);
  AdminCommandResp.addUsersRev(b, input.usersRev ?? 1n);
  const resp = AdminCommandResp.endAdminCommandResp(b);

  Envelope.startEnvelope(b);
  // 생성 enum 을 쓴다 — 「86 은 INBOUND 에 있다」 단언이 이 빌더에 기대지 않게.
  Envelope.addMsgType(b, MsgType.AdminCommandResp);
  Envelope.addAdminCommandResp(b, resp);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/** users.toml 전체 스냅샷 프레임 (87 · `admin_users_snapshot` 슬롯 96). request_id 없음 · 비밀번호 없음. */
export function buildAdminUsersSnapshotFrame(input: FakeAdminUsersSnapshotInput = {}): Uint8Array {
  const b = new flatbuffers.Builder(512);
  const users = input.users ?? [{}];
  // 원소 · 벡터는 바깥 테이블 조립 **전에** 전부 만든다 (FlatBuffers 중첩 제약).
  const userOffsets = users.map((u) => {
    const userId = b.createString(u.userId ?? "dma-user-1");
    const accs = (u.accounts ?? [{}]).map((a) => buildFakeAdminAccount(b, a));
    const accounts = AdminUser.createAccountsVector(b, accs);
    AdminUser.startAdminUser(b);
    AdminUser.addUserId(b, userId);
    AdminUser.addAccounts(b, accounts);
    return AdminUser.endAdminUser(b);
  });
  const usersVec = AdminUsersSnapshot.createUsersVector(b, userOffsets);
  AdminUsersSnapshot.startAdminUsersSnapshot(b);
  AdminUsersSnapshot.addUsersRev(b, input.usersRev ?? 1n);
  AdminUsersSnapshot.addUsers(b, usersVec);
  const snap = AdminUsersSnapshot.endAdminUsersSnapshot(b);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MsgType.AdminUsersSnapshot);
  Envelope.addAdminUsersSnapshot(b, snap);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}
