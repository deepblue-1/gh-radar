/**
 * Phase 15 Plan 02 — RELAY-01. DMA `Envelope` 조립 + 안전 파싱 + 필드 상한 가드.
 *
 * 와이어 지식(FlatBuffers 스키마)을 아는 유일한 경계다. 상위 계층은 여기서 나온
 * `@gh-radar/shared` 계약 타입만 다루고 생성 코드를 직접 만지지 않는다.
 *
 * 결정 근거:
 *   D-31  JS 런타임에는 FlatBuffers Verifier 가 없다. 잘린 버퍼는 예외를 던지는 대신
 *         **조용히 깨진 값**을 반환한다(실측: 80B 프레임을 70B 로 자르면 문자열이
 *         잘린 채 나온다). 그래서 `try/catch` 는 필요조건이지 충분조건이 아니고,
 *         ① 최소 크기 ② msg_type 화이트리스트 + 슬롯 null ③ 필드 형식·길이 가드
 *         3단으로 쌓는다. 실패는 그 프레임만 버리고 연결은 유지한다.
 *   D-33  58/59 는 `quote_state`, 69/71 은 `trade_tape` 슬롯을 공유한다. 스냅샷/증분
 *         구분(`snap`)은 msg_type 이 정본이라 파서가 인자로 받는다.
 *   D-34  `long` → 생성 코드는 `bigint` 를 낸다. `JSON.stringify(bigint)` 는 TypeError
 *         이므로 `toNum` 이 **유일한 변환 경계**다. `change_sign` 원문 1자와
 *         `exchange_time`("HHMMSSuuuuuu")은 해석하지 않고 그대로 흘린다.
 *   T-15-07  깨진 벡터 길이가 UI 로 흘러가지 않도록 C# `Client.cs` 의 `TakeCount`
 *         동형 클램프를 이식한다.
 *   S-5   드롭·절단 경로에 카운터와 사유를 남긴다. 조용한 `return` 금지.
 *
 * 하지 않는 것:
 *   - 주문 빌더(MsgType 2/25)는 만들지 않는다. 15-17 이후 plan 소관이다. 계좌는
 *     **선언(3)/응답(55)/`LoginResp.accounts` 까지만** 다룬다 — 잔고·미체결(66/67)은
 *     여기 없다.
 *   - 계좌 **조회 왕복**을 만들지 않는다 (17 D-11). 허용 목록의 정본은
 *     `LoginResp.accounts` 이고, 선언 응답이 매번 현재 목록 전체를 돌려주므로
 *     별도 조회 모드를 쓸 이유가 없다. `AccountDeclareMode` 가 그것을 타입으로 막는다.
 *   - 짧게 온 호가 벡터를 10단으로 **채우지 않는다**. 게이트웨이가 보낸 것이 진실이고,
 *     상한 초과만 잘라낸다(C# 클라이언트와 동형).
 *   - 프레이밍은 다루지 않는다. `codec.ts` 가 완결된 페이로드만 넘겨준다.
 */
import * as flatbuffers from "flatbuffers";
import type {
  RelayAccount,
  RelayExchange,
  RelayQuote,
  RelayServerMsg,
  RelayTape,
  RelayTapeEntry,
} from "@gh-radar/shared";

import { logger } from "../logger.js";
import { AccountEntry } from "../generated/stock-dma/account-entry.js";
import { Envelope } from "../generated/stock-dma/envelope.js";
import { GetQuoteReq } from "../generated/stock-dma/get-quote-req.js";
import { GetTradeTapeReq } from "../generated/stock-dma/get-trade-tape-req.js";
import { LivePing } from "../generated/stock-dma/live-ping.js";
import { LoginReq } from "../generated/stock-dma/login-req.js";
import type { LoginResp } from "../generated/stock-dma/login-resp.js";
import { SubscribeQuoteReq } from "../generated/stock-dma/subscribe-quote-req.js";
import { TradeTapeEntry } from "../generated/stock-dma/trade-tape-entry.js";
import { UpdateAccountNoReq } from "../generated/stock-dma/update-account-no-req.js";
import { MIN_ENVELOPE_SIZE, logDroppedFrame } from "./codec.js";
import { MSG, INBOUND_MSG_TYPES } from "./msg-type.js";

// ============================================================
// 벡터 길이 상한 (C# Client.cs L59-70 이식)
// ============================================================

/** 호가 단계 수. 매도/매수 × 가격/잔량 4벡터에 각각 적용한다. */
export const MAX_ORDER_BOOK_DEPTH = 10;
/** 계좌 목록 상한 (소비측 방어). `LoginResp.accounts` 와 선언 응답 목록에 함께 쓴다. */
export const MAX_ACCOUNT_LIST_COUNT = 256;
/**
 * 서버 계좌번호 길이 상한 (C# `Session.cs` `MAX_ACCOUNT_NO_LEN` 동형).
 *
 * 15-03 은 이 값을 `session.ts` 에 두었다. 계좌번호 **형식 판정**은 와이어 경계의 일이라
 * 여기로 옮긴다 — 상한 상수 5종과 가드 함수가 한 파일에 모여야 다음 필드가 추가될 때
 * 두 곳을 고치는 실수가 나지 않는다.
 */
export const MAX_ACCOUNT_NO_LEN = 12;
/** 잔고 종목 상한. D-25 게이트 뒤 plan 이 쓴다. */
export const MAX_HOLDING_COUNT = 500;
/** 미체결 주문 상한. D-25 게이트 뒤 plan 이 쓴다. */
export const MAX_UNFILLED_COUNT = 1000;
/** 델타 삭제 표식 상한. D-25 게이트 뒤 plan 이 쓴다. */
export const MAX_REMOVED_ORDER_COUNT = 1000;
/** 체결 테이프 1프레임 원소 상한. */
export const MAX_TAPE_ENTRY_COUNT = 200;

/** 12자 ISIN — 앞 2자는 국가코드(영문), 나머지 10자는 영숫자. */
const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{10}$/;

/** `Number.MAX_SAFE_INTEGER` 의 bigint 사본. 매 호출마다 만들지 않는다. */
const SAFE_MAX = BigInt(Number.MAX_SAFE_INTEGER);

// ============================================================
// 드롭 카운터 (S-5)
// ============================================================

let droppedEnvelopes = 0;

/** 파싱 단계에서 버린 누적 프레임 수. */
export function droppedEnvelopeCount(): number {
  return droppedEnvelopes;
}

/**
 * 카운터 초기화 — 테스트 격리 전용. 운영 경로에서 호출하지 않는다.
 * 계좌 항목 스킵 카운터도 같은 격리 단위라 함께 되돌린다.
 */
export function resetDroppedEnvelopeCount(): void {
  droppedEnvelopes = 0;
  skippedAccountEntries = 0;
}

/**
 * 형식 위반으로 건너뛴 계좌 항목 누적 수 (S-5).
 *
 * 프레임 드롭과 구분해서 센다 — 계좌 항목 하나가 깨졌다고 프레임 전체를 버리면
 * 나머지 정상 계좌까지 사라져 "계좌가 없다"로 오진하기 때문이다.
 */
let skippedAccountEntries = 0;

/** 형식 위반으로 건너뛴 계좌 항목 누적 수. */
export function skippedAccountEntryCount(): number {
  return skippedAccountEntries;
}

/**
 * 계좌 항목 1건 스킵. **계좌번호 원문을 로그에 넣지 않는다** (T-15-15) —
 * 마스킹본과 길이만 남긴다.
 */
function skipAccount(reason: string, index: number, accountNo: string): void {
  skippedAccountEntries += 1;
  logger.warn(
    {
      reason,
      index,
      len: accountNo.length,
      accountNo: maskAccountNo(accountNo),
      skippedAccountEntryCount: skippedAccountEntries,
    },
    "[DMA] 계좌 항목 스킵 (형식 가드)",
  );
}

function drop(reason: string, msgTypeHint: number | null, payload: Buffer): null {
  droppedEnvelopes += 1;
  logDroppedFrame({ reason, msgTypeHint, payload, droppedFrameCount: droppedEnvelopes });
  return null;
}

/** 페이로드를 동반하지 않는 드롭(슬롯 null·형식 위반 등). 사유와 맥락만 남긴다. */
function dropField(reason: string, msgType: number, detail: Record<string, unknown>): null {
  droppedEnvelopes += 1;
  logger.warn(
    { reason, msgType, droppedFrameCount: droppedEnvelopes, ...detail },
    "[DMA] 프레임 드롭 (필드 가드)",
  );
  return null;
}

// ============================================================
// 값 가드 (가장 중요 — Verifier 부재 대응)
// ============================================================

/**
 * C# `TakeCount` 동형 — 음수(파손)는 0, 상한 초과는 앞의 N건.
 *
 * 어느 쪽이든 **경고를 남기고** 호출자는 계속 진행한다. 여기서 프레임을 통째로
 * 삼키면 화면이 서버를 무응답으로 오인한다 (C# 주석 12 WR-06).
 */
export function takeCount(n: number, max: number, label: string): number {
  if (!Number.isFinite(n) || n < 0) {
    logger.warn({ n, label }, "[DMA] 비정상 벡터 길이 — 0건으로 처리");
    return 0;
  }
  if (n > max) {
    logger.warn({ n, max, label }, "[DMA] 벡터 길이 상한 초과 — 절단");
    return max;
  }
  return n;
}

/**
 * `long` → `number` 변환의 **유일한** 경계 (D-34).
 *
 * `JSON.stringify(bigint)` 는 TypeError 라 와이어로 나가기 전 반드시 여기를 통과해야
 * 한다. 안전 정수 범위를 넘으면 조용히 정밀도를 잃는 대신 경고 + 클램프한다 —
 * 누적거래대금(`cum_value`)이 실제로 2^53 을 넘볼 수 있는 유일한 필드다.
 */
export function toNum(v: bigint, label: string): number {
  if (v > SAFE_MAX) {
    logger.warn({ label, value: v.toString() }, "[DMA] 안전 정수 범위 초과 — 상한 클램프");
    return Number.MAX_SAFE_INTEGER;
  }
  if (v < -SAFE_MAX) {
    logger.warn({ label, value: v.toString() }, "[DMA] 안전 정수 범위 미만 — 하한 클램프");
    return -Number.MAX_SAFE_INTEGER;
  }
  return Number(v);
}

/** 12자 ISIN 형식 가드. */
export function isValidIsin(s: string): boolean {
  return s.length === 12 && ISIN_PATTERN.test(s);
}

/** 거래소 화이트리스트 (D-04). */
export function isValidExchange(s: string): s is RelayExchange {
  return s === "KRX" || s === "NXT";
}

/** `change_sign` 은 A3 원문 **1자**다 (fbs 주석). 길이가 다르면 프레임이 깨진 것이다. */
export function isValidChangeSign(s: string): boolean {
  return s.length === 1;
}

/**
 * 계좌번호 형식 가드 — 1~`MAX_ACCOUNT_NO_LEN` 자 (fbs: "users.toml 표기 그대로, 최대 12자").
 *
 * 자릿수 이상의 패턴을 강제하지 않는다. 계좌번호 표기는 브로커·지점 규칙에 따라
 * 하이픈 유무가 갈리고, 여기서 좁게 잡으면 정상 계좌가 조용히 사라진다 — 그 결과는
 * "주문할 계좌가 없다"라는 더 나쁜 오진이다.
 */
export function isValidAccountNo(s: string): boolean {
  return s.length >= 1 && s.length <= MAX_ACCOUNT_NO_LEN;
}

/**
 * **로그 전용** 계좌번호 마스킹 — 뒤 4자리를 가린다 (UI-SPEC D2 / T-15-15).
 *
 * 화면(상태 프레임)에는 전체를 내린다. 트레이더가 계좌를 고르려면 전체가 보여야 하고,
 * 로그는 유출 시 피해가 크므로 반대다. 이 비대칭이 의도된 설계다.
 */
export function maskAccountNo(accountNo: string): string {
  if (accountNo.length <= 4) return "*".repeat(accountNo.length);
  return `${accountNo.slice(0, -4)}****`;
}

/** bigint 벡터를 상한 클램프하며 number 배열로 읽는다. */
function readNumVector(
  length: number,
  at: (i: number) => bigint | null,
  max: number,
  label: string,
): number[] {
  const n = takeCount(length, max, label);
  const out: number[] = new Array<number>(n);
  for (let i = 0; i < n; i += 1) {
    out[i] = toNum(at(i) ?? 0n, label);
  }
  return out;
}

// ============================================================
// 조립 (relay → 게이트웨이)
// ============================================================
//
// `Envelope` 에는 flatc 가 편의 생성 함수를 만들어 주지 않는다(deprecated 슬롯 2종
// 때문). 그래서 5종 빌더가 모두 `startEnvelope → addMsgType → add*(슬롯) → endEnvelope`
// 순서를 직접 밟는다. 일반 테이블(`LoginReq` 등)에는 `create*` 가 있으므로 그것을 쓴다.

/** 로그인 요청 (MsgType 1). 세션 수립의 첫 프레임이다. */
export function buildLoginReq(userId: string, password: string, broker: string): Uint8Array {
  const b = new flatbuffers.Builder(256);
  const req = LoginReq.createLoginReq(
    b,
    b.createString(userId),
    b.createString(password),
    b.createString(broker),
  );
  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.LoginReq);
  Envelope.addLoginReq(b, req);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/**
 * 계좌 선언 모드. **추가(1) 하나뿐이다** (17 D-11).
 *
 * 스키마에는 삭제·조회 모드도 있지만 relay 는 쓰지 않는다. 허용 목록의 정본은
 * `LoginResp.accounts` 이고 선언 응답이 매번 현재 목록 전체를 돌려주므로, 조회 왕복은
 * 부트 시간만 늘리고 얻는 정보가 없다. 삭제는 세션이 끝나면 서버가 정리한다.
 * 리터럴 유니온으로 좁혀 두면 다른 모드를 쓰려는 순간 타입 에러가 난다.
 */
export type AccountDeclareMode = "1";

/**
 * 계좌번호 선언 (MsgType 3). 응답은 55 이며 **현재 등록 목록 전체**를 돌려준다.
 *
 * 반환형이 `Buffer` 가 아니라 `Uint8Array` 인 것은 형제 빌더 5종·`DmaClient.send` 와
 * 같은 계약을 쓰기 위해서다 (`b.asUint8Array()` 의 원래 형).
 */
export function buildUpdateAccountNoReq(
  mode: AccountDeclareMode,
  accountNo: string,
): Uint8Array {
  const b = new flatbuffers.Builder(128);
  const req = UpdateAccountNoReq.createUpdateAccountNoReq(
    b,
    b.createString(mode),
    b.createString(accountNo),
  );
  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.UpdateAccountNoReq);
  Envelope.addUpdateAccountNoReq(b, req);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/** 30초 주기 핑 (MsgType 4). `ping_time` 은 UTC epoch 초다. */
export function buildLivePing(): Uint8Array {
  const b = new flatbuffers.Builder(64);
  const ping = LivePing.createLivePing(b, Math.floor(Date.now() / 1000));
  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.LivePing);
  Envelope.addLivePing(b, ping);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/** 호가 스냅샷 조회 (MsgType 28). 응답은 58 이다. */
export function buildGetQuoteReq(isin: string, exchange: RelayExchange): Uint8Array {
  const b = new flatbuffers.Builder(128);
  const req = GetQuoteReq.createGetQuoteReq(b, b.createString(isin), b.createString(exchange));
  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.GetQuoteReq);
  Envelope.addGetQuoteReq(b, req);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/** 호가 구독/해제 (MsgType 29). `subscribe:false` 가 해제다. */
export function buildSubscribeQuoteReq(
  isin: string,
  exchange: RelayExchange,
  subscribe: boolean,
): Uint8Array {
  const b = new flatbuffers.Builder(128);
  const req = SubscribeQuoteReq.createSubscribeQuoteReq(
    b,
    b.createString(isin),
    b.createString(exchange),
    subscribe,
  );
  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.SubscribeQuoteReq);
  Envelope.addSubscribeQuoteReq(b, req);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/** 체결 테이프 스냅샷 조회 (MsgType 32). 응답은 69 이고 이후 71 이 편승 푸시된다. */
export function buildGetTradeTapeReq(
  isin: string,
  exchange: RelayExchange,
  count: number,
): Uint8Array {
  const b = new flatbuffers.Builder(128);
  const req = GetTradeTapeReq.createGetTradeTapeReq(
    b,
    b.createString(isin),
    b.createString(exchange),
    count,
  );
  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.GetTradeTapeReq);
  Envelope.addGetTradeTapeReq(b, req);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

// ============================================================
// 파싱 (게이트웨이 → relay)
// ============================================================

/** `tryParseEnvelope` 결과. `env` 는 슬롯 접근자를 꺼내기 위한 핸들이다. */
export type ParsedEnvelope = {
  msgType: number;
  env: Envelope;
};

/**
 * 수신 페이로드의 **유일한** 파싱 진입점. total 하다 — 어떤 입력에도 throw 하지 않고
 * `null` 로 수렴한다.
 *
 * 1단(최소 크기)은 `codec.ts` 가 이미 걸렀지만 여기서도 다시 본다. 이 함수가 코덱을
 * 거치지 않은 경로(테스트·향후 다른 전송)에서도 안전해야 하기 때문이다.
 */
export function tryParseEnvelope(payload: Buffer): ParsedEnvelope | null {
  if (payload.length < MIN_ENVELOPE_SIZE) {
    return drop("min-envelope-size", null, payload);
  }
  try {
    // FrameReader 가 프레임을 복사해 넘겨주므로 뷰로 읽어도 안전하다(소유권 이전).
    const bb = new flatbuffers.ByteBuffer(
      new Uint8Array(payload.buffer, payload.byteOffset, payload.length),
    );
    const env = Envelope.getRootAsEnvelope(bb);
    const msgType = env.msgType();
    if (!INBOUND_MSG_TYPES.has(msgType)) {
      // 예외가 나지 않으므로 이 화이트리스트가 구조 레벨의 실질 방어선이다.
      return drop("unknown-msg-type", msgType, payload);
    }
    return { msgType, env };
  } catch {
    return drop("parse-throw", null, payload);
  }
}

/**
 * 호가 10단 (58 스냅샷 / 59 증분 — `quote_state` 슬롯 공유).
 *
 * @param isSnapshot 58 이면 true, 59 면 false. 본문 `is_snapshot` 도 같은 값을 담지만
 *                   슬롯을 공유하는 이상 msg_type 이 정본이다 (D-33).
 */
export function parseQuoteState(env: Envelope, isSnapshot: boolean): RelayQuote | null {
  const msgType = isSnapshot ? MSG.GetQuoteResp : MSG.QuoteUpdate;
  const q = env.quoteState();
  if (q === null) return dropField("slot-null", msgType, { slot: "quote_state" });

  const isin = q.isin() ?? "";
  const exchange = q.exchange() ?? "";
  if (!isValidIsin(isin)) return dropField("bad-isin", msgType, { isin });
  if (!isValidExchange(exchange)) return dropField("bad-exchange", msgType, { isin, exchange });

  const changeSign = q.changeSign() ?? "";
  if (!isValidChangeSign(changeSign)) {
    return dropField("bad-change-sign", msgType, { isin, changeSign });
  }

  return {
    t: "q",
    i: isin,
    x: exchange,
    snap: isSnapshot,
    p: toNum(q.lastPrice(), "last_price"),
    o: toNum(q.openPrice(), "open_price"),
    h: toNum(q.highPrice(), "high_price"),
    l: toNum(q.lowPrice(), "low_price"),
    c: toNum(q.change(), "change"),
    cs: changeSign,
    cr: q.changeRate(),
    v: toNum(q.cumVolume(), "cum_volume"),
    va: toNum(q.cumValue(), "cum_value"),
    ap: readNumVector(q.askPricesLength(), (i) => q.askPrices(i), MAX_ORDER_BOOK_DEPTH, "매도호가"),
    aq: readNumVector(q.askQtysLength(), (i) => q.askQtys(i), MAX_ORDER_BOOK_DEPTH, "매도잔량"),
    bp: readNumVector(q.bidPricesLength(), (i) => q.bidPrices(i), MAX_ORDER_BOOK_DEPTH, "매수호가"),
    bq: readNumVector(q.bidQtysLength(), (i) => q.bidQtys(i), MAX_ORDER_BOOK_DEPTH, "매수잔량"),
    ta: toNum(q.totalAskQty(), "total_ask_qty"),
    tb: toNum(q.totalBidQty(), "total_bid_qty"),
    ul: toNum(q.upperLimit(), "upper_limit"),
    ll: toNum(q.lowerLimit(), "lower_limit"),
    base: toNum(q.basePrice(), "base_price"),
    viu: toNum(q.viUpPrice(), "vi_up_price"),
    vid: toNum(q.viDownPrice(), "vi_down_price"),
    ls: toNum(q.listShares(), "list_shares"),
    // 해석하지 않고 원문 그대로 흘린다 — 신선도 판정의 원천 (D-34).
    et: q.exchangeTime() ?? "",
  };
}

/**
 * 체결 테이프 (69 스냅샷 / 71 증분 — `trade_tape` 슬롯 공유).
 *
 * 원소 하나라도 형식이 깨졌으면 프레임 전체를 버린다. 일부만 걸러 내보내면 브라우저의
 * 누적거래량이 조용히 어긋나기 때문이다.
 */
export function parseTradeTape(env: Envelope, isSnapshot: boolean): RelayTape | null {
  const msgType = isSnapshot ? MSG.TradeTapeResp : MSG.TradeTapePush;
  const tape = env.tradeTape();
  if (tape === null) return dropField("slot-null", msgType, { slot: "trade_tape" });

  const isin = tape.isin() ?? "";
  const exchange = tape.exchange() ?? "";
  if (!isValidIsin(isin)) return dropField("bad-isin", msgType, { isin });
  if (!isValidExchange(exchange)) return dropField("bad-exchange", msgType, { isin, exchange });

  const n = takeCount(tape.entriesLength(), MAX_TAPE_ENTRY_COUNT, "체결 테이프");
  const entries: RelayTapeEntry[] = [];
  const scratch = new TradeTapeEntry();
  for (let i = 0; i < n; i += 1) {
    const e = tape.entries(i, scratch);
    if (e === null) return dropField("entry-null", msgType, { isin, index: i });

    const changeSign = e.changeSign() ?? "";
    if (!isValidChangeSign(changeSign)) {
      return dropField("bad-change-sign", msgType, { isin, index: i, changeSign });
    }
    entries.push({
      t: e.tradeTime() ?? "",
      p: toNum(e.price(), "trade_price"),
      cs: changeSign,
      c: toNum(e.change(), "trade_change"),
      q: toNum(e.qty(), "trade_qty"),
      cv: toNum(e.cumVolume(), "trade_cum_volume"),
    });
  }

  return { t: "tape", i: isin, x: exchange, snap: isSnapshot, e: entries };
}

/**
 * 서버 통지 (54) — 해석 없이 그대로 흘린다 (D-36).
 *
 * `isin` 은 **비어 있는 것이 정상**이다(종목 미지정 = 브로드캐스트, fbs 주석).
 * 따라서 여기서는 ISIN 형식 가드를 걸지 않는다.
 */
export function parseServerMessage(env: Envelope): RelayServerMsg | null {
  const sm = env.serverMessage();
  if (sm === null) {
    return dropField("slot-null", MSG.ServerMessage, { slot: "server_message" });
  }
  return {
    t: "msg",
    lv: sm.level() ?? "",
    m: sm.message() ?? "",
    i: sm.isin() ?? "",
    a: sm.accountNo() ?? "",
    src: sm.source() ?? "",
    kind: sm.kind() ?? "",
  };
}

/** 로그인 응답 (50) 파싱 결과. */
export type ParsedLoginResp = {
  success: boolean;
  message: string;
  /**
   * 서버가 허용한 계좌 목록 (D-25 게이트 통과 — **실제 목록이 온다**).
   * 실패 응답과 mock 무인증 로그인은 빈 배열이다 (17 D-19).
   */
  accounts: RelayAccount[];
};

/** `LoginResp.accounts` 벡터 → `RelayAccount[]`. 슬롯을 이미 손에 쥔 쪽이 부른다. */
function readAccountEntries(lr: LoginResp): RelayAccount[] {
  const n = takeCount(lr.accountsLength(), MAX_ACCOUNT_LIST_COUNT, "계좌 목록");
  const out: RelayAccount[] = [];
  const scratch = new AccountEntry();
  for (let i = 0; i < n; i += 1) {
    const e = lr.accounts(i, scratch);
    if (e === null) {
      skipAccount("entry-null", i, "");
      continue;
    }
    const accountNo = e.accountNo() ?? "";
    if (!isValidAccountNo(accountNo)) {
      // 항목만 건너뛴다 — 프레임 전체를 버리면 정상 계좌까지 사라진다.
      skipAccount("bad-account-no", i, accountNo);
      continue;
    }
    out.push({ accountNo, name: e.name() ?? "" });
  }
  return out;
}

/**
 * 로그인 응답의 허용 계좌 목록만 꺼낸다 (50).
 *
 * 슬롯이 비면 빈 배열이다 — 호출자(세션)는 "계좌 0건"과 "프레임 파손"을 같게 다룬다.
 * 둘 다 선언할 것이 없고, 재시도해도 결과가 같기 때문이다 (17 D-12).
 */
export function parseLoginRespAccounts(env: Envelope): RelayAccount[] {
  const lr = env.loginResp();
  if (lr === null) {
    dropField("slot-null", MSG.LoginResp, { slot: "login_resp" });
    return [];
  }
  return readAccountEntries(lr);
}

/**
 * 계좌 선언 응답 (55) — 서버에 **현재 등록된 계좌번호 목록 전체**다.
 *
 * 선언 1건마다 이 응답이 한 번씩 오고, 매번 그 시점의 전체 목록을 담는다. 그래서
 * 세션은 "마지막 응답"이 아니라 "받은 목록의 누적"으로 대조한다.
 *
 * 슬롯이 비면 빈 배열이다 — `[]` 는 "아직 아무것도 등록되지 않았다"라는 정상 응답과
 * 형태가 같고, 어느 쪽이든 세션의 처리(계속 기다린다)가 동일하다.
 */
export function parseUpdateAccountNoResp(env: Envelope): string[] {
  const r = env.updateAccountNoResp();
  if (r === null) {
    dropField("slot-null", MSG.UpdateAccountNoResp, { slot: "update_account_no_resp" });
    return [];
  }
  const n = takeCount(r.accountListLength(), MAX_ACCOUNT_LIST_COUNT, "계좌 목록");
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const accountNo: string = r.accountList(i) ?? "";
    if (!isValidAccountNo(accountNo)) {
      skipAccount("bad-account-no", i, accountNo);
      continue;
    }
    out.push(accountNo);
  }
  return out;
}

/**
 * 로그인 응답 (50).
 *
 * `success`/`message` 에 더해 허용 계좌 목록까지 한 번에 읽는다 — 호출자가 슬롯을
 * 두 번 여는 대신 부트 시퀀스가 필요로 하는 것을 한 자리에서 받게 한다.
 */
export function parseLoginResp(env: Envelope): ParsedLoginResp | null {
  const lr = env.loginResp();
  if (lr === null) return dropField("slot-null", MSG.LoginResp, { slot: "login_resp" });
  return {
    success: lr.success(),
    message: lr.message() ?? "",
    accounts: readAccountEntries(lr),
  };
}
