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
import { Envelope } from "../../src/generated/stock-dma/envelope.js";
import { HoldingState } from "../../src/generated/stock-dma/holding-state.js";
import { UnfilledState } from "../../src/generated/stock-dma/unfilled-state.js";
import { LoginResp } from "../../src/generated/stock-dma/login-resp.js";
import { OrderResp } from "../../src/generated/stock-dma/order-resp.js";
import { UpdateAccountNoResp } from "../../src/generated/stock-dma/update-account-no-resp.js";
import { QuoteState } from "../../src/generated/stock-dma/quote-state.js";
import { ServerMessage } from "../../src/generated/stock-dma/server-message.js";
import { TradeTape } from "../../src/generated/stock-dma/trade-tape.js";
import { TradeTapeEntry } from "../../src/generated/stock-dma/trade-tape-entry.js";
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
