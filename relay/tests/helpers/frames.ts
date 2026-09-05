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

import { Envelope } from "../../src/generated/stock-dma/envelope.js";
import { LoginResp } from "../../src/generated/stock-dma/login-resp.js";
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

export type FakeLoginRespInput = {
  success?: boolean;
  message?: string;
};

/**
 * 로그인 응답 프레임 (50).
 *
 * 허용 계좌 벡터는 채우지 않는다 — 현행 게이트웨이(mock 무인증)가 빈 벡터를 돌려주는
 * 상태를 그대로 재현한다 (D-25).
 */
export function buildLoginRespFrame(input: FakeLoginRespInput = {}): Uint8Array {
  const b = new flatbuffers.Builder(256);
  const message = b.createString(input.message ?? "");
  LoginResp.startLoginResp(b);
  LoginResp.addSuccess(b, input.success ?? true);
  LoginResp.addMessage(b, message);
  const resp = LoginResp.endLoginResp(b);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.LoginResp);
  Envelope.addLoginResp(b, resp);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}
