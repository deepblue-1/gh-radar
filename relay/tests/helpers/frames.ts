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
import { MSG } from "../../src/dma/msg-type.js";

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

  const offsets = rows.map((row, i) => {
    const tradeTime = b.createString(row.tradeTime ?? `09301512345${i}`);
    const changeSign = b.createString(row.changeSign ?? "2");
    return TradeTapeEntry.createTradeTapeEntry(
      b,
      tradeTime,
      row.price ?? 70_900n + BigInt(i) * 50n,
      changeSign,
      row.change ?? 900n,
      row.qty ?? 10n + BigInt(i),
      row.cumVolume ?? 12_345_600n + BigInt(i),
    );
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
};

/**
 * 주문 통보 프레임 (51).
 *
 * 접수·체결·취소확인·거부가 **전부 이 하나**로 온다. `TradeExecution(53)` 은 서버에
 * 생성 경로가 없어 테스트에서도 만들지 않는다 (fbs L221-228 / `Server.cpp` L307).
 *
 * `createOrderResp` 위치 인자에 deprecated `slot_id` 는 들어가지 않는다 — flatc 가
 * 접근자를 만들지 않으므로 인자 목록에서도 빠진다.
 */
export function buildOrderRespFrame(input: FakeOrderRespInput = {}): Uint8Array {
  const b = new flatbuffers.Builder(512);
  const resp = OrderResp.createOrderResp(
    b,
    b.createString(input.isin ?? SAMPLE_ISIN),
    b.createString(input.side ?? "B"),
    b.createString(input.orderNo ?? "0000012345"),
    input.resultCode ?? 0,
    input.price ?? 70_000,
    input.quantity ?? 10,
    b.createString(input.message ?? "정상처리"),
    b.createString(input.noticeType ?? "A"),
    b.createString(input.orgOrderNo ?? ""),
    b.createString(input.origin ?? "Manual"),
    b.createString(input.exchange ?? "KRX"),
  );

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

  const unfilledOffsets = unfilled.map((u, i) =>
    UnfilledState.createUnfilledState(
      b,
      b.createString(u.orderNo ?? `ORD${String(i).padStart(7, "0")}`),
      b.createString(u.orgOrderNo ?? ""),
      b.createString(u.isin ?? SAMPLE_ISIN),
      b.createString(u.side ?? "B"),
      u.price ?? 70_000,
      u.orderQty ?? 10,
      u.filledQty ?? 0,
      u.unfilledQty ?? 10,
      b.createString(u.exchange ?? "KRX"),
      b.createString(u.orderTime ?? "093015"),
    ),
  );
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
 * 상따 전략 1건. **활성 37 필드 전부** override 가능하다.
 *
 * deprecated 8종(`client_key` · `sell_min_cum_volume` · `sell_cum_volume_enabled` ·
 * `a3_buy4_enabled` · `smart_sell` · `origin_ord_qty` · `buy_price_break_enabled` ·
 * `sell_price_break_enabled`)은 flatc 가 접근자를 만들지 않아 여기에도 없다 —
 * 보내지도 읽지도 않는다.
 *
 * **S→C 전용 4필드**(`sellOrderQty` · `sellQtyTrackBaseline` · `sellEntryLatched` ·
 * `cancelQtyTrackBaseline`)도 주입할 수 있다. 서버가 계산해 에코로만 내려주는 값이라,
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
  /** 첫 글자만 파싱된다. `"1"`=매수호가, 그 외=매도호가. */
  buyWatchSide?: string;
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
  buyWatchSide: "0",
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
  const buyWatchSide = b.createString(input.buyWatchSide ?? d.buyWatchSide);
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
  SetLimitChaser.addBuyWatchSide(b, buyWatchSide);
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
  return SetLimitChaser.endSetLimitChaser(b);
}

/**
 * 상따 Set 에코 프레임 (60 — `set_limit_chaser` 슬롯).
 *
 * 서버는 「거부」를 응답 코드로 주지 않는다. 등록 성공은 **이 에코의 수신**이고,
 * 부분 거부는 **눕혀진 값**(예: `buyEnabled:false`)으로 온다. 그 두 경우를 테스트가
 * 직접 만들 수 있어야 하므로 37 필드가 전부 열려 있다.
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

  SetVITrigger.startSetVITrigger(b);
  SetVITrigger.addAccountNo(b, accountNo);
  SetVITrigger.addOrderAmountKrw(b, input.orderAmountKrw ?? 5_000_000n);
  SetVITrigger.addCheckRate(b, input.checkRate ?? 25);
  SetVITrigger.addPriceType(b, priceType);
  SetVITrigger.addRun(b, input.run ?? false);
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
};

/** VI 발동 통보 프레임 (56). */
export function buildViOrderNoticeFrame(input: FakeViOrderNoticeInput = {}): Uint8Array {
  const b = new flatbuffers.Builder(512);
  const isin = b.createString(input.isin ?? SAMPLE_ISIN);
  const accountNo = b.createString(input.accountNo ?? SAMPLE_ACCOUNT_NO);
  const market = b.createString(input.market ?? "K");
  const viEndTime = b.createString(input.viEndTime ?? "093215000");

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
