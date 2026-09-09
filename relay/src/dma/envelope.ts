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
 *   - 계좌 **조회 왕복**을 만들지 않는다 (17 D-11). 허용 목록의 정본은
 *     `LoginResp.accounts` 이고, 선언 응답이 매번 현재 목록 전체를 돌려주므로
 *     별도 조회 모드를 쓸 이유가 없다. `AccountDeclareMode` 가 그것을 타입으로 막는다.
 *   - 짧게 온 호가 벡터를 10단으로 **채우지 않는다**. 게이트웨이가 보낸 것이 진실이고,
 *     상한 초과만 잘라낸다(C# 클라이언트와 동형).
 *   - 프레이밍은 다루지 않는다. `codec.ts` 가 완결된 페이로드만 넘겨준다.
 *   - 주문 **정책**을 판단하지 않는다 (D-20). 금액·수량 한도는 어디에도 없고, 여기서
 *     막는 것은 게이트웨이가 반드시 거부하는 형식 위반뿐이다(수량 0·ISIN 길이 등).
 *   - 계좌 상태(66/67)를 **병합하지 않는다**. 스냅샷/델타 합성은 Hub 의 일이고 여기는
 *     프레임 1건을 계약 타입으로 좁힐 뿐이다.
 *   - 정정(`order_type` "M")·시장가·IOC/FOK 를 만들지 않는다 (D-21). 스키마에는 있지만
 *     v1 범위 밖이라 리터럴 유니온으로 봉쇄한다 — `AccountDeclareMode` 와 같은 규율이다.
 */
import * as flatbuffers from "flatbuffers";
import { MAX_VI_ORDER_AMOUNT_KRW, ORDER_CONDITION_NORMAL } from "@gh-radar/shared";
import type {
  OrderMarket,
  OrderSide,
  OrderType,
  RelayAccount,
  RelayAccountState,
  RelayExchange,
  RelayHolding,
  RelayLcCrud,
  RelayLcWatchSide,
  RelayLimitChaser,
  RelayLimitChaserInput,
  RelayQuote,
  RelayServerMsg,
  RelayTape,
  RelayTapeEntry,
  RelayUnfilled,
  RelayViNoticeMsg,
  RelayViOrderItem,
  RelayViOrderState,
  RelayViTrigger,
} from "@gh-radar/shared";

import { logger } from "../logger.js";
import { AccountEntry } from "../generated/stock-dma/account-entry.js";
import { ConfirmVIOrderReq } from "../generated/stock-dma/confirm-viorder-req.js";
import { DirectOrderReq } from "../generated/stock-dma/direct-order-req.js";
import { DisableStrategiesReq } from "../generated/stock-dma/disable-strategies-req.js";
import { Envelope } from "../generated/stock-dma/envelope.js";
import { SetLimitChaser } from "../generated/stock-dma/set-limit-chaser.js";
import { SetVITrigger } from "../generated/stock-dma/set-vitrigger.js";
import { GetAccountStateReq } from "../generated/stock-dma/get-account-state-req.js";
import { GetQuoteReq } from "../generated/stock-dma/get-quote-req.js";
import { HoldingState } from "../generated/stock-dma/holding-state.js";
import { UnfilledState } from "../generated/stock-dma/unfilled-state.js";
import { GetTradeTapeReq } from "../generated/stock-dma/get-trade-tape-req.js";
import { LivePing } from "../generated/stock-dma/live-ping.js";
import { LoginReq } from "../generated/stock-dma/login-req.js";
import type { LoginResp } from "../generated/stock-dma/login-resp.js";
import { SubscribeQuoteReq } from "../generated/stock-dma/subscribe-quote-req.js";
import { TradeTapeEntry } from "../generated/stock-dma/trade-tape-entry.js";
import { VIOrderItem } from "../generated/stock-dma/viorder-item.js";
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
/** 잔고 종목 상한 (C# `MAX_HOLDING_COUNT`). `AccountState.holdings` 에 적용한다. */
export const MAX_HOLDING_COUNT = 500;
/** 미체결 주문 상한 (C# `MAX_UNFILLED_COUNT`). `AccountState.unfilled` 에 적용한다. */
export const MAX_UNFILLED_COUNT = 1000;
/** 델타 삭제 표식 상한 (C# `MAX_REMOVED_ORDER_COUNT`). `removed_order_nos` 에 적용한다. */
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
 * 계좌·전략 항목 스킵 카운터도 같은 격리 단위라 함께 되돌린다.
 */
export function resetDroppedEnvelopeCount(): void {
  droppedEnvelopes = 0;
  skippedAccountEntries = 0;
  skippedAccountStateItems = 0;
  skippedStrategyItems = 0;
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

// ============================================================
// 주문 (2 요청 / 51 통보)
// ============================================================

/**
 * 주문 조립 거부. **게이트웨이로 나가기 전에** 던진다.
 *
 * 여기서 막는 것은 "정책"이 아니라 게이트웨이가 반드시 거부하거나 **엉뚱하게 해석**할
 * 입력이다(D-20 — 금액·수량 한도는 어디에도 없다). 라우트가 `code` 를 그대로 400 응답에
 * 실어 server 가 사용자에게 이유를 말할 수 있게 한다 (S-1).
 */
export class OrderBuildError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "OrderBuildError";
  }
}

/**
 * `int` 필드의 표현 한계 (2^31-1).
 *
 * **주문 한도가 아니다.** `DirectOrderReq.price`/`quantity` 는 fbs 상 `int` 라서 이 값을
 * 넘기면 조용히 감싸(wrap) 전혀 다른 수량으로 주문이 나간다 — 한도 정책(D-20 에서 두지
 * 않기로 한 것)이 아니라 **와이어 표현 가능 범위**의 문제다. 그래서 여기서만 막는다.
 */
const MAX_INT32 = 2_147_483_647;

/**
 * 주문조건 — **"0"(보통) 고정** (D-21). 시장가·IOC("1")·FOK("2")는 v1 범위 밖이다.
 *
 * 값을 두 곳에 적지 않으려고 `@gh-radar/shared` 상수를 그대로 좁혀 받는다. 타입을 `"0"`
 * 으로 명시해 두면 shared 쪽이 바뀌는 순간 여기서 타입 에러가 난다.
 */
export const ORDER_CONDITION: "0" = ORDER_CONDITION_NORMAL;

/**
 * 매매구분 → 와이어 1자. **단일 문자 필드 변환은 전부 이 계열 함수 3종에서만** 한다 (D-21).
 *
 * 서버는 이 필드들의 **첫 글자만** 읽는다. 그래서 호출부마다 문자열을 지어내면
 * "Kospi" 를 넘긴 순간 `market="K"` 로 읽히는 식의 우연한 성공이 섞이고, 어느 날
 * "KOSDAQ" 이 `K` 로 읽혀 **엉뚱한 시장으로 주문이 나간다** (Pitfall 7).
 */
export function toWireSide(side: OrderSide): "B" | "S" {
  if (side !== "B" && side !== "S") {
    throw new OrderBuildError("BAD_SIDE", `알 수 없는 매매구분: ${String(side)}`);
  }
  return side;
}

/** 시장구분 → 와이어 1자 ("K"=KOSPI, "Q"=KOSDAQ). `toWireSide` 주석 참조. */
export function toWireMarket(market: OrderMarket): "K" | "Q" {
  if (market !== "K" && market !== "Q") {
    throw new OrderBuildError("BAD_MARKET", `알 수 없는 시장구분: ${String(market)}`);
  }
  return market;
}

/**
 * 주문유형 → 와이어 1자 ("N"=신규, "C"=취소). 정정("M")은 **여기서 막는다** (D-21).
 *
 * 스키마는 "M" 을 알지만 relay 는 만들지 않는다. 타입(`OrderType`)이 1차 방어이고
 * 이 런타임 검사가 2차다 — 입력이 HTTP JSON 이라 타입만으로는 부족하다.
 */
export function toWireOrderType(orderType: OrderType): "N" | "C" {
  if (orderType !== "N" && orderType !== "C") {
    throw new OrderBuildError("BAD_ORDER_TYPE", `알 수 없는 주문유형: ${String(orderType)}`);
  }
  return orderType;
}

/**
 * 상따 등록구분 → 와이어 1자 ("C"=upsert, "D"=삭제). `toWireSide` 주석의 규율을 따른다.
 *
 * 서버는 **첫 글자만** 보고 `'D'` 가 아니면 전부 upsert 로 처리한다. 그래서 오타 하나가
 * "삭제하려던 전략이 되살아나는" 결과로 조용히 이어진다 — 열거 밖 값은 여기서 던진다.
 */
export function toWireCrud(crud: RelayLcCrud): "C" | "D" {
  if (crud !== "C" && crud !== "D") {
    throw new OrderBuildError("BAD_CRUD", `알 수 없는 등록구분: ${String(crud)}`);
  }
  return crud;
}

/**
 * 매수 감시 기준호가 → 와이어 1자 ("1"=매수호가, 그 외=매도호가). `toWireSide` 주석 참조.
 *
 * 서버가 `'1'` 만 매수호가로 보고 나머지를 전부 매도호가로 접으므로, 빈 문자열이 흘러가면
 * **감시 기준이 반대쪽 호가로 뒤바뀐 채** 발주 게이트가 열린다.
 */
export function toWireWatchSide(side: RelayLcWatchSide): "0" | "1" {
  if (side !== "0" && side !== "1") {
    throw new OrderBuildError("BAD_WATCH_SIDE", `알 수 없는 감시 기준호가: ${String(side)}`);
  }
  return side;
}

/** `buildDirectOrderReq` 입력. 전부 이미 계약 타입으로 좁혀진 값이다. */
export type DirectOrderInput = {
  /** 12자 ISIN. 단축코드를 산술 유도하지 않는다 (D-28) — server 가 `stocks.isin` 에서 채운다. */
  isin: string;
  accountNo: string;
  exchange: RelayExchange;
  market: OrderMarket;
  side: OrderSide;
  orderType: OrderType;
  /** `orderType:"C"` 일 때 필수. 신규는 생략하거나 빈 문자열. */
  orgOrderNo?: string;
  /** 주문수량. 취소는 미체결 잔량이며 **0 은 즉시 거부**다 (Pitfall 7). */
  qty: number;
  price: number;
};

/**
 * 직접 주문 (MsgType 2). 신규("N")·취소("C") 둘뿐이다 (D-21).
 *
 * **수량 0 은 전량취소가 아니라 즉시 거부**다 (fbs `DirectOrderReq.quantity` 주석 / D-44).
 * 게이트웨이까지 보내서 거부를 받아 오는 대신 여기서 던진다 — 왕복 5초를 태우고 사용자에게
 * "거부"라고 말하는 것보다, 보내기 전에 이유를 정확히 말하는 편이 낫다.
 */
export function buildDirectOrderReq(req: DirectOrderInput): Uint8Array {
  if (!isValidIsin(req.isin)) {
    throw new OrderBuildError("BAD_ISIN", `ISIN 형식 위반 (12자 필요, ${req.isin.length}자)`);
  }
  if (!isValidAccountNo(req.accountNo)) {
    throw new OrderBuildError("BAD_ACCOUNT_NO", "계좌번호 형식 위반");
  }
  if (!isValidExchange(req.exchange)) {
    throw new OrderBuildError("BAD_EXCHANGE", `알 수 없는 거래소: ${String(req.exchange)}`);
  }

  const side = toWireSide(req.side);
  const market = toWireMarket(req.market);
  const orderType = toWireOrderType(req.orderType);

  if (!Number.isInteger(req.qty) || req.qty <= 0) {
    // 취소수량 0 을 전량취소로 오해하는 것이 이 phase 에서 가장 흔한 오주문 경로다.
    throw new OrderBuildError("BAD_QTY", "주문수량은 1 이상의 정수여야 합니다 (0 은 즉시 거부)");
  }
  if (!Number.isInteger(req.price) || req.price <= 0) {
    throw new OrderBuildError("BAD_PRICE", "주문가격은 1 이상의 정수여야 합니다");
  }
  if (req.qty > MAX_INT32 || req.price > MAX_INT32) {
    // 한도가 아니라 int 표현 범위다 — 넘기면 조용히 감싸서 전혀 다른 주문이 나간다.
    throw new OrderBuildError("INT32_OVERFLOW", "주문가격·수량이 int 표현 범위를 넘었습니다");
  }

  const orgOrderNo = req.orgOrderNo ?? "";
  if (orderType === "C" && orgOrderNo === "") {
    throw new OrderBuildError("ORG_ORDER_NO_REQUIRED", "취소 주문에는 원주문번호가 필요합니다");
  }

  const b = new flatbuffers.Builder(256);
  const order = DirectOrderReq.createDirectOrderReq(
    b,
    // 게이트웨이의 `stock_code` 는 **ISIN 12자**다 (fbs 주석) — 단축코드가 아니다.
    b.createString(req.isin),
    b.createString(req.accountNo),
    b.createString(side),
    req.price,
    req.qty,
    b.createString(ORDER_CONDITION),
    b.createString(market),
    b.createString(req.exchange),
    b.createString(orderType),
    // 신규는 빈 문자열이 계약이다. 생략하면 슬롯이 비어 구 서버가 다르게 읽을 수 있다.
    b.createString(orgOrderNo),
  );
  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.DirectOrderReq);
  Envelope.addDirectOrderReq(b, order);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

// ============================================================
// 전략 조립 (relay → 게이트웨이) — 16-04 / TRADE-03 / D-01
// ============================================================
//
// 모든 테이블을 `startXxx` + `addXxx` + `endXxx` **개별 호출**로 조립한다.
// flatc 가 만들어 준 위치 인자 생성 함수(`create*` — 37 인자를 순서로 받는다)를 쓰지 않는 이유는
// 하나다 — `SetLimitChaser` 는 deprecated 8슬롯을 포함한 45슬롯 테이블이라 인자가 한 칸만
// 밀려도 **타입이 우연히 맞아 컴파일된다**. bool 자리에 uint 가 들어가면 게이트가 뒤바뀐 채
// 실계좌 발주가 나간다 (T-16-05). 이름 있는 `addXxx` 는 그 실수를 구조적으로 막는다.
//
// 문자열은 테이블을 **열기 전에** `createString` 한다 — FlatBuffers 는 테이블 조립 중
// 중첩 객체 생성을 허용하지 않는다.

/** `uint` 필드의 와이어 표현 범위. 넘기면 조용히 감싸 전혀 다른 값이 된다. */
const MAX_UINT32 = 4_294_967_295;

/** `ubyte` 필드의 와이어 표현 범위. 256 을 보내면 서버는 0 으로 읽는다. */
const MAX_UBYTE = 255;

/**
 * `uint` 필드 가드. **정책 한도가 아니라 와이어 표현 범위**다 (`MAX_INT32` 주석과 같은 규율).
 *
 * 범위 정책(매도비율 1~100 · 잔량추적 1~90 등)은 `relay/src/ws/protocol.ts` 의 zod 스키마
 * 한 곳에만 둔다 — 두 곳에 적으면 언젠가 갈라지고, 갈라지면 어느 쪽이 정본인지 알 수 없다.
 */
function toWireUint(v: number, field: string): number {
  if (!Number.isInteger(v) || v < 0 || v > MAX_UINT32) {
    throw new OrderBuildError("UINT_RANGE", `${field} 가 uint 표현 범위를 벗어났습니다: ${v}`);
  }
  return v;
}

/** `ubyte` 필드 가드. `toWireUint` 와 같은 이유로 표현 범위만 본다. */
function toWireUByte(v: number, field: string): number {
  if (!Number.isInteger(v) || v < 0 || v > MAX_UBYTE) {
    throw new OrderBuildError("UBYTE_RANGE", `${field} 가 ubyte 표현 범위를 벗어났습니다: ${v}`);
  }
  return v;
}

/**
 * 서버가 12자 버퍼에 `strncpy(…, 12)` 하는 문자열을 **같은 폭으로 절단**한다.
 *
 * 절단하지 않고 13자를 보내면 서버의 전략 키(`ISIN:accountNo:exchange`)와 클라가 기억하는
 * 키가 어긋나 **에코가 영원히 매칭되지 않는다**. 조용한 실패이므로 절단 사실을 로그로 남긴다.
 */
function truncateToWire(s: string, max: number, field: string): string {
  if (s.length <= max) return s;
  logger.warn({ field, len: s.length, max }, "[DMA] 와이어 폭 초과 — 절단 (서버 strncpy 동형)");
  return s.slice(0, max);
}

/** `sweep_recalc_enabled` 클라 고정값 (WinForms `LimitChaserForm.Send()` 동형). */
export const LC_FIXED_SWEEP_RECALC_ENABLED = true;
/** `sweep_min_count` 클라 고정값. `0` 은 Case3 비활성이다. */
export const LC_FIXED_SWEEP_MIN_COUNT = 0;
/** `sweep_min_rate` 클라 고정값(BasisPoints). `0` 이라 단위 함정 자체를 만나지 않는다. */
export const LC_FIXED_SWEEP_MIN_RATE = 0;

/**
 * 상따 설정 (MsgType 10). 응답은 60 에코다.
 *
 * ★ `market` 은 **호출부가 채워 넣는다** (WR-03 / D-28). `RelayLimitChaserInput` 에서 뺐기
 *   때문이다 — 브라우저가 시장을 실어 보내지 못하게 스키마에서 지웠고, `fanout.ts` 의
 *   `lc.set` 분기가 `symbols.lookup(cfg.isin)` 으로 푼 값을 여기로 넘긴다. 조립기가 기본값을
 *   두지 않는 것이 핵심이다: 기본값 `"K"` 를 두는 순간 코스닥 전략이 코스피로 등록된다.
 *
 * **클라 입력 29 + relay 해석 1(`market`) + 클라 고정 3 = 33 필드만** 채운다. 나머지는
 * 건드리지 않는다:
 *   - **S→C 전용 4필드** (`sell_order_qty` · `sell_qty_track_baseline` · `sell_entry_latched` ·
 *     `cancel_qty_track_baseline`) — 서버가 계산해 에코로만 내려주는 값이다. 실어 보내면
 *     서버는 무시하지만, 보내는 쪽 코드에 남아 있는 것만으로 "왕복하는 값"이라는 착각을
 *     만들고 에코-폼 비교가 오염된다 (Pitfall 6).
 *   - **deprecated 8슬롯** — flatc 가 접근자를 만들지 않는다. 존재 자체를 모른 채로 둔다.
 *
 * 고정 3(`sweepRecalcEnabled`/`sweepMinCount`/`sweepMinRate`)은 입력값과 무관하게 **relay 가
 * 못박는다**. WinForms 가 한 번도 다른 값을 보낸 적이 없어 서버의 Case3 경로가 실사용으로
 * 검증된 적이 없기 때문이다 — 브라우저가 열 수 있게 두면 미검증 발주 경로가 열린다.
 * 입력이 고정값과 다르면 조용히 덮지 않고 경고를 남긴다 (PC-7).
 *
 * @throws {OrderBuildError} ISIN·계좌번호·거래소 형식 위반, 단일문자 열거 밖 값, 수치 표현 범위 초과
 */
export function buildSetLimitChaserReq(
  cfg: RelayLimitChaserInput & { market: OrderMarket },
): Uint8Array {
  // 서버와 같은 폭으로 먼저 자른다 — 자른 뒤의 값이 전략 키의 정본이다.
  const isin = truncateToWire(cfg.isin, 12, "isin");
  const accountNo = truncateToWire(cfg.accountNo, MAX_ACCOUNT_NO_LEN, "accountNo");

  if (!isValidIsin(isin)) {
    throw new OrderBuildError("BAD_ISIN", `ISIN 형식 위반 (12자 필요, ${isin.length}자)`);
  }
  if (!isValidAccountNo(accountNo)) {
    throw new OrderBuildError("BAD_ACCOUNT_NO", "계좌번호 형식 위반");
  }
  if (!isValidExchange(cfg.exchange)) {
    // 서버는 화이트리스트 밖 거래소를 **저장도 에코도 하지 않고** ERROR 통지만 보낸다.
    // 여기서 던져야 "보냈는데 아무 일도 안 일어남"이 되지 않는다.
    throw new OrderBuildError("BAD_EXCHANGE", `알 수 없는 거래소: ${String(cfg.exchange)}`);
  }

  const market = toWireMarket(cfg.market);
  const crud = toWireCrud(cfg.crud);
  const buyWatchSide = toWireWatchSide(cfg.buyWatchSide);

  if (
    cfg.sweepRecalcEnabled !== LC_FIXED_SWEEP_RECALC_ENABLED ||
    cfg.sweepMinCount !== LC_FIXED_SWEEP_MIN_COUNT ||
    cfg.sweepMinRate !== LC_FIXED_SWEEP_MIN_RATE
  ) {
    logger.warn(
      {
        isin,
        got: {
          sweepRecalcEnabled: cfg.sweepRecalcEnabled,
          sweepMinCount: cfg.sweepMinCount,
          sweepMinRate: cfg.sweepMinRate,
        },
      },
      "[DMA] sweep 고정 3필드가 입력과 다름 — 클라 고정값으로 덮어 송신",
    );
  }

  const b = new flatbuffers.Builder(512);
  // 문자열 6종을 테이블 열기 전에 만든다.
  const isinOff = b.createString(isin);
  const accountNoOff = b.createString(accountNo);
  const marketOff = b.createString(market);
  const crudOff = b.createString(crud);
  const buyWatchSideOff = b.createString(buyWatchSide);
  const exchangeOff = b.createString(cfg.exchange);

  SetLimitChaser.startSetLimitChaser(b);
  SetLimitChaser.addIsin(b, isinOff);
  SetLimitChaser.addAccountNo(b, accountNoOff);
  SetLimitChaser.addMarket(b, marketOff);
  SetLimitChaser.addCrud(b, crudOff);
  SetLimitChaser.addBuyOrderPrice(b, toWireUint(cfg.buyOrderPrice, "buyOrderPrice"));
  SetLimitChaser.addBuyOrderQty(b, toWireUint(cfg.buyOrderQty, "buyOrderQty"));
  SetLimitChaser.addBuyWatchPrice(b, toWireUint(cfg.buyWatchPrice, "buyWatchPrice"));
  SetLimitChaser.addBuyWatchQty(b, toWireUint(cfg.buyWatchQty, "buyWatchQty"));
  SetLimitChaser.addBuyMinTradeQty(b, toWireUint(cfg.buyMinTradeQty, "buyMinTradeQty"));
  SetLimitChaser.addBuyWatchSide(b, buyWatchSideOff);
  SetLimitChaser.addBuyTradeQtyEnabled(b, cfg.buyTradeQtyEnabled);
  SetLimitChaser.addBuyEnabled(b, cfg.buyEnabled);
  SetLimitChaser.addSellOrderPrice(b, toWireUint(cfg.sellOrderPrice, "sellOrderPrice"));
  // sell_order_qty — S→C 전용. 서버가 매도가능 x 비율로 스냅샷한다.
  SetLimitChaser.addSellWatchPrice(b, toWireUint(cfg.sellWatchPrice, "sellWatchPrice"));
  SetLimitChaser.addSellWatchQty(b, toWireUint(cfg.sellWatchQty, "sellWatchQty"));
  SetLimitChaser.addSellMinTradeQty(b, toWireUint(cfg.sellMinTradeQty, "sellMinTradeQty"));
  SetLimitChaser.addSellEnabled(b, cfg.sellEnabled);
  SetLimitChaser.addSellTradeQtyEnabled(b, cfg.sellTradeQtyEnabled);
  SetLimitChaser.addSweepWatchPrice(b, toWireUint(cfg.sweepWatchPrice, "sweepWatchPrice"));
  SetLimitChaser.addSweepEnabled(b, cfg.sweepEnabled);
  SetLimitChaser.addSweepMinTickCount(b, toWireUByte(cfg.sweepMinTickCount, "sweepMinTickCount"));
  SetLimitChaser.addSweepRecalcEnabled(b, LC_FIXED_SWEEP_RECALC_ENABLED);
  SetLimitChaser.addSweepMinCount(b, LC_FIXED_SWEEP_MIN_COUNT);
  SetLimitChaser.addSweepMinRate(b, LC_FIXED_SWEEP_MIN_RATE);
  SetLimitChaser.addExchange(b, exchangeOff);
  SetLimitChaser.addSellOrderRatio(b, toWireUByte(cfg.sellOrderRatio, "sellOrderRatio"));
  SetLimitChaser.addSellQtyTrackEnabled(b, cfg.sellQtyTrackEnabled);
  SetLimitChaser.addSellQtyTrackRatio(b, toWireUByte(cfg.sellQtyTrackRatio, "sellQtyTrackRatio"));
  // sell_qty_track_baseline — S→C 전용. 서버가 유지하는 래칫 기준선이다.
  SetLimitChaser.addBuyOrderAmount(b, toWireUint(cfg.buyOrderAmount, "buyOrderAmount"));
  // sell_entry_latched — S→C 전용. 매도 진입 확인 래치.
  SetLimitChaser.addCancelQtyEnabled(b, cfg.cancelQtyEnabled);
  SetLimitChaser.addCancelWatchQty(b, toWireUint(cfg.cancelWatchQty, "cancelWatchQty"));
  SetLimitChaser.addCancelTradeEnabled(b, cfg.cancelTradeEnabled);
  SetLimitChaser.addCancelQtyTrackEnabled(b, cfg.cancelQtyTrackEnabled);
  // cancel_qty_track_baseline — S→C 전용.
  const table = SetLimitChaser.endSetLimitChaser(b);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.SetLimitChaserReq);
  Envelope.addSetLimitChaser(b, table);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/**
 * `buildSetVITriggerReq` 입력. `priceType` 은 **받지 않는다** — 상한가("U") 고정이고
 * relay 가 채운다. 브라우저가 정할 수 있게 두면 하한가("L") 발주 경로가 열린다.
 */
export type ViTriggerInput = Omit<RelayViTrigger, "priceType">;

/** VI 가격유형 — 상한가 고정 (D-01). 스키마는 "L"(하한가)도 알지만 relay 는 만들지 않는다. */
export const VI_PRICE_TYPE: "U" = "U";

/**
 * VI 발동 감시 설정 (MsgType 11). 응답은 61 에코다.
 *
 * `order_amount_krw` 는 fbs 상 **`ulong`** 이라 생성 코드가 `bigint` 를 요구한다. 계약(D-34)은
 * `number` 이므로 여기가 승격의 유일한 지점이다 — `BigInt(1.5)` 는 RangeError 를 던지므로
 * 정수 여부를 먼저 본다.
 *
 * `check_rate` 는 **정수 %**(25 = 25%) 다. 상따의 `sweep_min_rate` 가 BasisPoints(2950 = 29.5%)
 * 인 것과 **단위가 다르다** (Pitfall 5) — 한쪽 값을 다른 쪽에 그대로 넣으면 100배 어긋난다.
 * 하락 감시를 막지 않으려고 음수를 허용하되 int 표현 범위는 지킨다.
 *
 * @throws {OrderBuildError} 계좌번호 형식 위반, **금액 상한 초과**, 금액·상승률 표현 범위 초과
 */
export function buildSetVITriggerReq(cfg: ViTriggerInput): Uint8Array {
  const accountNo = truncateToWire(cfg.accountNo, MAX_ACCOUNT_NO_LEN, "accountNo");
  if (!isValidAccountNo(accountNo)) {
    throw new OrderBuildError("BAD_ACCOUNT_NO", "계좌번호 형식 위반");
  }
  if (!Number.isInteger(cfg.orderAmountKrw) || cfg.orderAmountKrw < 0) {
    throw new OrderBuildError("BAD_ORDER_AMOUNT", `주문금액(원)은 0 이상의 정수여야 합니다: ${cfg.orderAmountKrw}`);
  }
  /*
    상한 검사 (WR-07). zod(`RelayViSetSchema`)가 먼저 막지만 **조립 단계가 모든 호출 경로의
    마지막 관문**이어야 한다 — `buildConfirmVIOrderReq` 의 빈 `orderNo` 검사가
    "`RelayViConfirmSchema` 에 이어지는 최후 방어선" 인 것과 같은 논리다. 스키마를 타지 않는
    내부 호출(테스트·후속 기능)이 생겨도 `ulong` 감김은 여기서 끝난다.
    ★ `Number.MAX_SAFE_INTEGER` 초과는 이 상한에 이미 포함된다 — 분기를 따로 만들지 않는다.
  */
  if (cfg.orderAmountKrw > MAX_VI_ORDER_AMOUNT_KRW) {
    throw new OrderBuildError(
      "BAD_ORDER_AMOUNT",
      `주문금액(원)이 상한 ${MAX_VI_ORDER_AMOUNT_KRW} 을 넘었습니다: ${cfg.orderAmountKrw}`,
    );
  }
  if (!Number.isInteger(cfg.checkRate) || Math.abs(cfg.checkRate) > MAX_INT32) {
    throw new OrderBuildError("BAD_CHECK_RATE", `발동 상승률이 int 표현 범위를 벗어났습니다: ${cfg.checkRate}`);
  }

  const b = new flatbuffers.Builder(128);
  const accountNoOff = b.createString(accountNo);
  const priceTypeOff = b.createString(VI_PRICE_TYPE);

  SetVITrigger.startSetVITrigger(b);
  SetVITrigger.addAccountNo(b, accountNoOff);
  // number -> bigint 승격의 유일 지점. 정수 검사를 통과했으므로 여기서 던지지 않는다.
  SetVITrigger.addOrderAmountKrw(b, BigInt(cfg.orderAmountKrw));
  SetVITrigger.addCheckRate(b, cfg.checkRate);
  SetVITrigger.addPriceType(b, priceTypeOff);
  SetVITrigger.addRun(b, cfg.run);
  const table = SetVITrigger.endSetVITrigger(b);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.SetVITriggerReq);
  Envelope.addSetViTrigger(b, table);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/** `buildConfirmVIOrderReq` 입력. 같은 메시지로 확인 on/off 를 모두 보낸다. */
export type ConfirmVIOrderInput = {
  /** 서버 주문번호. **빈 문자열은 접수 전(Pending)** 이라 확인 자체가 불가능하다. */
  orderNo: string;
  confirmed: boolean;
};

/**
 * VI 주문 확인 체크 (MsgType 33). 반영되면 서버가 **73 푸시로만** 알린다 — 별도 응답이 없다.
 *
 * `order_no` 가 비면 서버는 **응답 없이 드롭**한다. 보내고 기다리는 경로를 만들면 영원히 오지
 * 않는 응답을 기다리게 되므로 조립 전에 던진다 — `RelayViConfirmSchema` 에 이어지는 최후 방어선이다.
 *
 * @throws {OrderBuildError} `orderNo` 가 빈 문자열일 때
 */
export function buildConfirmVIOrderReq({ orderNo, confirmed }: ConfirmVIOrderInput): Uint8Array {
  if (orderNo === "") {
    throw new OrderBuildError(
      "ORDER_NO_REQUIRED",
      "VI 확인에는 주문번호가 필요합니다 (빈 값은 서버가 조용히 드롭)",
    );
  }

  const b = new flatbuffers.Builder(128);
  const orderNoOff = b.createString(orderNo);

  ConfirmVIOrderReq.startConfirmVIOrderReq(b);
  ConfirmVIOrderReq.addOrderNo(b, orderNoOff);
  ConfirmVIOrderReq.addConfirmed(b, confirmed);
  const table = ConfirmVIOrderReq.endConfirmVIOrderReq(b);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.ConfirmVIOrderReq);
  Envelope.addConfirmViOrderReq(b, table);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/** 전략 키(`ISIN:accountNo:exchange`) 길이 상한 — 서버 WR-09 와 같은 값이다(실제 최대 29B). */
export const MAX_STRATEGY_KEY_BYTES = 64;

/**
 * 전략 비활성화 (MsgType 14). `key` 가 `""` 면 세션의 상따 **전부 + VI** 다.
 *
 * **삭제가 아니라 발주 게이트만 내린다** — 등록은 유지된다. 서버는 키별 60/61 에코를 세션 전
 * 연결에 먼저 보낸 뒤 65 집계를 요청 연결에만 보내므로, 상태 갱신은 에코가 하고 65 는
 * 「완료 신호」로만 쓴다.
 *
 * 64바이트 상한을 relay 에서 먼저 던지는 이유는 왕복 절약이 아니라 로그 폭 봉쇄다 (T-16-06).
 * 문자열 길이가 아니라 **UTF-8 바이트**로 잰다 — 서버가 바이트로 자르기 때문이다.
 *
 * @throws {OrderBuildError} `key` 가 64바이트를 넘을 때
 */
export function buildDisableStrategiesReq(key = ""): Uint8Array {
  const bytes = Buffer.byteLength(key, "utf8");
  if (bytes > MAX_STRATEGY_KEY_BYTES) {
    throw new OrderBuildError(
      "KEY_TOO_LONG",
      `전략 키가 상한을 넘었습니다 (${bytes}B > ${MAX_STRATEGY_KEY_BYTES}B)`,
    );
  }

  const b = new flatbuffers.Builder(128);
  const keyOff = b.createString(key);

  DisableStrategiesReq.startDisableStrategiesReq(b);
  DisableStrategiesReq.addKey(b, keyOff);
  const table = DisableStrategiesReq.endDisableStrategiesReq(b);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.DisableStrategiesReq);
  Envelope.addDisableStrategiesReq(b, table);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/**
 * 본문 없는 요청 Envelope. 24/34 는 **요청 테이블 자체가 없고**, 21 은 `get_strategy_req` 를
 * 서버가 파싱하되 무시한다 — 셋 다 `msg_type` 만 실어 보내면 된다.
 */
function buildBareRequest(msgType: number, capacity = 64): Uint8Array {
  const b = new flatbuffers.Builder(capacity);
  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, msgType);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/** 상따 목록 조회 (MsgType 24). 응답 64 는 **요청 연결에만** 온다. */
export function buildGetLimitChaserListReq(): Uint8Array {
  return buildBareRequest(MSG.GetLimitChaserListReq);
}

/**
 * VI 전략 조회 (MsgType 21). 응답은 61 이다.
 *
 * 전략이 없으면 서버는 **테이블 없는 빈 61** 을 보낸다(무응답 금지). 웹은 그것을 「미등록」으로
 * 읽고 입력값은 그대로 둔 채 `run` 만 내린다.
 */
export function buildGetVITriggerReq(): Uint8Array {
  return buildBareRequest(MSG.GetVITriggerReq);
}

/** VI 주문 목록 조회 (MsgType 34). 응답 72 는 스냅샷이고 이후 73 이 편승 푸시된다. */
export function buildGetVIOrderListReq(): Uint8Array {
  return buildBareRequest(MSG.GetVIOrderListReq);
}

/** 주문 통보 (51) 파싱 결과. 값은 전부 **게이트웨이 원문**이고 해석하지 않는다. */
export type ParsedOrderResp = {
  orderNo: string;
  /**
   * 통보 종류 원문 1자 — "A"=접수 "E"=체결 "C"=취소확인 "M"=정정확인 "R"=거부.
   * **구 서버는 비워 보낸다**(fbs 주석). 빈 값을 오류로 다루지 않고 `resultCode` 로 판정한다.
   */
  noticeType: string;
  resultCode: number;
  message: string;
  /** ISIN. 상관(어느 주문의 통보인가) 판정의 키다. */
  isin: string;
  /** 매매구분 원문. `sideTrusted` 가 false 면 **읽지 말 것**. */
  side: string;
  /**
   * `side` 를 믿어도 되는가 (Pitfall 8).
   *
   * 취소·정정 통보에는 매매구분이 없다 — 요청 자체에 담기지 않아 브로커가 채울 값이 없고
   * MockBroker 는 "B" 를 남긴다. 그대로 그리면 **매도 취소가 "매수"로 표시**된다.
   * false 면 UI 는 매수/매도 대신 "취소"/"정정" 을 표기한다.
   */
  sideTrusted: boolean;
  /** 주문가격. 체결 통보(`noticeType:"E"`)에서는 체결가다 (서버 `useExecuted` 분기). */
  price: number;
  /** 주문수량. 체결 통보에서는 체결수량이다. */
  quantity: number;
  /** 원주문번호. 신규 통보는 "". */
  orgOrderNo: string;
  /** 거래소. 구 서버 미지정은 KRX 로 열화한다 (Phase 16 D-11). */
  exchange: RelayExchange;
  /** 발주 주체 원문 "Manual"/"LimitChaser"/"VITrigger". 구 서버는 "". */
  origin: string;
  /**
   * `origin` 을 `dma_orders.origin` 값으로 좁힌 것. 빈 값·미지의 값은 `"manual"` 이다.
   *
   * 원문과 정규화본을 **둘 다** 싣는다 — 감사 로그에는 서버가 실제로 보낸 문자열이 필요하고,
   * DB 에는 CHECK 제약을 통과하는 3종만 넣을 수 있다.
   */
  originKind: OrderOriginKind;
};

/** `dma_orders.origin` 값 3종 (RESEARCH A12). 와이어 원문을 좁힌 결과다. */
export type OrderOriginKind = "manual" | "limit_chaser" | "vi";

/**
 * 발주 주체 원문 → `dma_orders.origin` (RESEARCH A4 / T-16-05).
 *
 * **빈 값과 미지의 값은 전부 `"manual"`** 이다 — 모르는 출처를 지어내지 않는다. 구 서버는
 * 이 필드를 아예 채우지 않으므로 빈 문자열이 정상 입력이고, 그것을 오류로 다루면 통보 기록이
 * 통째로 사라진다. 자동주문을 수동으로 오분류해도 손실은 **표시·감사 영역에 그치고
 * 주문이 잘못 나가지는 않는다**(반대로 지어낸 값은 DB CHECK 제약에 걸려 행 자체를 잃는다).
 */
export function toOrderOrigin(raw: string): OrderOriginKind {
  switch (raw) {
    case "LimitChaser":
      return "limit_chaser";
    case "VITrigger":
      return "vi";
    case "Manual":
      return "manual";
    default:
      if (raw !== "") {
        // 빈 값은 구 서버의 정상 입력이라 로그하지 않는다. 비어 있지 않은 미지의 값은
        // 서버가 출처를 새로 추가했다는 신호이므로 반드시 남긴다 (S-2 무로그 fail-safe 금지).
        logger.warn({ raw }, "[DMA] 알 수 없는 발주 주체 — manual 로 기록");
      }
      return "manual";
  }
}

/**
 * 주문 통보 (51). **접수·체결·취소확인·거부가 전부 이 하나로 온다.**
 *
 * `TradeExecution(53)` 은 서버에 생성 경로가 없다 — 체결도 `notice_type:"E"` 로 51 에
 * 실려 온다 (gh-trade `Server.cpp` L307 주석 / fbs L221-228 명시). 그래서 여기가
 * 주문 통보의 유일한 파서다.
 *
 * ISIN 형식이 어긋나도 **프레임을 버리지 않는다.** 거부 통보는 가장 중요한 정보인데
 * 그것을 드롭하면 HTTP 요청이 5초를 기다렸다가 "결과 모름"으로 끝난다 — 사용자에게
 * 훨씬 나쁜 결과다. 형식 이상은 경고로 남기고 값은 그대로 올린다.
 */
export function parseOrderResp(env: Envelope): ParsedOrderResp | null {
  const r = env.orderResp();
  if (r === null) return dropField("slot-null", MSG.OrderResp, { slot: "order_resp" });

  const isin = r.stockCode() ?? "";
  if (!isValidIsin(isin)) {
    logger.warn(
      { msgType: MSG.OrderResp, len: isin.length },
      "[DMA] 주문 통보의 ISIN 형식 이상 — 프레임은 살린다 (거부 통보 유실 방지)",
    );
  }

  const noticeType = r.noticeType() ?? "";
  const origin = r.origin() ?? "";
  return {
    orderNo: r.orderNo() ?? "",
    noticeType,
    resultCode: r.resultCode(),
    message: r.message() ?? "",
    isin,
    side: r.side() ?? "",
    // 취소("C")·정정("M") 통보의 매매구분은 브로커가 채울 값이 없다 (Pitfall 8).
    sideTrusted: noticeType !== "C" && noticeType !== "M",
    price: r.price(),
    quantity: r.quantity(),
    orgOrderNo: r.orgOrderNo() ?? "",
    exchange: fromWireExchange(r.exchange() ?? ""),
    origin,
    originKind: toOrderOrigin(origin),
  };
}

// ============================================================
// 계좌 상태 (25 요청 / 66 스냅샷 · 67 델타 — `account_state` 슬롯 공유)
// ============================================================

/**
 * 형식 위반으로 건너뛴 **계좌 상태 항목**(잔고·미체결 행) 누적 수 (S-5).
 *
 * `skippedAccountEntryCount`(계좌 목록 항목)와 **따로** 센다. 둘을 섞으면
 * "계좌번호 형식 문제"와 "잔고 행 파손"을 구분할 수 없어, 실계통에서 어느 쪽을
 * 파야 하는지 알 수 없게 된다.
 */
let skippedAccountStateItems = 0;

/** 형식 위반으로 건너뛴 잔고·미체결 행 누적 수. */
export function skippedAccountStateItemCount(): number {
  return skippedAccountStateItems;
}

/** 잔고·미체결 행 1건 스킵. 계좌번호는 담지 않는다(행에 없다) — 사유와 위치만 남긴다. */
function skipAccountStateItem(reason: string, kind: string, index: number, detail: string): void {
  skippedAccountStateItems += 1;
  logger.warn(
    { reason, kind, index, detail, skippedAccountStateItemCount: skippedAccountStateItems },
    "[DMA] 계좌 상태 항목 스킵 (형식 가드)",
  );
}

/**
 * 수신 거래소 정규화 — C# `WireCodes.FromWireExchange` 동형.
 *
 * **"NXT" 만 NXT 로 읽고 나머지는 전부 KRX** 다. 구 서버는 이 필드를 채우지 않으므로
 * 빈 문자열이 정상 입력이고, 그것을 드롭 사유로 삼으면 미체결 목록이 통째로 사라진다
 * (Phase 16 D-12). 여기서만 관대하고, **송신** 방향은 화이트리스트로 좁힌다.
 */
export function fromWireExchange(raw: string): RelayExchange {
  return raw === "NXT" ? "NXT" : "KRX";
}

/**
 * 수신 매매구분 정규화. 서버는 단일 문자 필드의 **첫 글자만** 의미로 쓰므로 첫 글자로
 * 판정하고, "B"/"S" 가 아니면 `null` 이다 — 호출자가 그 행을 건너뛴다.
 *
 * 임의 기본값("B")으로 메우지 않는 것이 중요하다. 미체결 행의 매매구분은 그대로
 * 취소 주문의 `side` 가 되므로, 모르는 값을 매수로 지어내면 **반대 방향 주문**이 나간다.
 */
export function fromWireSide(raw: string): OrderSide | null {
  const c = raw.charAt(0);
  return c === "B" || c === "S" ? c : null;
}

/**
 * 수신 시장구분 정규화 — 서버는 **첫 글자만** 보고 `'Q'` 면 KOSDAQ, 그 외는 전부 KOSPI 다.
 *
 * 송신(`toWireMarket`)이 열거 밖 값을 던지는 것과 **비대칭인 것이 의도**다. 구 서버가
 * 채우지 않은 빈 문자열이 정상 입력이라 수신은 서버 규약을 그대로 흉내 내 관대하고,
 * 송신은 화이트리스트로 좁힌다.
 *
 * 이 판정을 웹앱으로 내보내지 않는다 (Phase 15 D-21 승계). `"K"`/`"Q"` 리터럴이 흩어지면
 * 언젠가 `"KOSDAQ"` 이 `'K'` 로 읽혀 **취소 주문이 엉뚱한 시장으로 나간다** (Pitfall 4).
 */
export function fromWireMarket(raw: string): OrderMarket {
  return raw.charAt(0) === "Q" ? "Q" : "K";
}

/**
 * 수신 등록구분 정규화 — 첫 글자가 `'D'` 면 삭제, 그 외는 전부 upsert(`'C'`)다.
 *
 * **`"D"` 는 반드시 계약에 실어 보낸다** (Pitfall 7 / D-08). 서버는
 * `!buy_enabled && !sell_enabled && !AnyCancelEnabled` 일 때만 `'D'` 로 정규화하므로,
 * **취소 게이트가 하나라도 켜져 있으면 매수·매도를 둘 다 꺼도 전략이 남는다**(살아 있는
 * 미체결을 지키는 등록이기 때문). 「삭제됨」을 두 스위치만 보고 판정하면 서버 진실과 갈린다.
 */
export function fromWireCrud(raw: string): RelayLcCrud {
  return raw.charAt(0) === "D" ? "D" : "C";
}

/**
 * 수신 매수 감시 기준호가 정규화 — 첫 글자 `'1'` 만 매수호가이고 그 외는 전부 매도호가다.
 *
 * 빈 문자열이 매도호가("0")로 접히는 것은 서버 기본값과 같다. 지어낸 기본값이 아니라
 * **서버 규약의 복제**이므로 감시 기준이 뒤집히지 않는다.
 */
export function fromWireWatchSide(raw: string): RelayLcWatchSide {
  return raw.charAt(0) === "1" ? "1" : "0";
}

/**
 * 계좌 상태 조회 요청 (MsgType 25). 응답은 66(스냅샷)이고 이후 67(델타)이 편승한다.
 *
 * `accountNo` 를 **빈 문자열로 보내면 전 계좌 스냅샷**이 온다 — 계좌당 1프레임이다
 * (D-23). 계좌를 하나씩 도는 왕복을 만들지 않는 이유가 이것이고, 그래서 기본값이 `""` 다.
 */
export function buildGetAccountStateReq(accountNo: string = ""): Uint8Array {
  const b = new flatbuffers.Builder(128);
  const req = GetAccountStateReq.createGetAccountStateReq(b, b.createString(accountNo));
  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.GetAccountStateReq);
  Envelope.addGetAccountStateReq(b, req);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/**
 * 계좌 상태 (66 스냅샷 / 67 델타 — `account_state` 슬롯 공유).
 *
 * @param isSnapshot 66 이면 true, 67 이면 false. 본문 `is_snapshot` 도 같은 값을 담지만
 *                   **msg_type 이 정본**이다 (D-33 — 58/59·69/71 과 같은 규약). 본문 값이
 *                   어긋나면 경고만 남기고 msg_type 을 따른다. msg_type 은 수신
 *                   화이트리스트를 통과한 값이라 더 신뢰할 수 있다.
 *
 * 잔고·미체결 값은 전부 **서버 계산본**이다. 여기서 재계산하지 않는다 (C# `Client.cs`
 * `HandleAccountState` 주석). 행 하나가 깨지면 그 행만 건너뛰고 프레임은 살린다 —
 * 프레임째 버리면 정상 잔고까지 사라져 "잔고가 없다"라는 더 나쁜 오진이 된다.
 */
export function parseAccountState(env: Envelope, isSnapshot: boolean): RelayAccountState | null {
  const msgType = isSnapshot ? MSG.GetAccountStateResp : MSG.AccountStateDelta;
  const st = env.accountState();
  if (st === null) return dropField("slot-null", msgType, { slot: "account_state" });

  const accountNo = st.accountNo() ?? "";
  if (!isValidAccountNo(accountNo)) {
    // 계좌번호가 키다. 키가 없으면 어느 계좌의 잔고인지 알 수 없어 쓸 수가 없다.
    return dropField("bad-account-no", msgType, { len: accountNo.length });
  }

  if (st.isSnapshot() !== isSnapshot) {
    logger.warn(
      { msgType, bodyIsSnapshot: st.isSnapshot(), accountNo: maskAccountNo(accountNo) },
      "[DMA] 계좌 상태 스냅샷 플래그 불일치 — msg_type 을 따른다 (D-33)",
    );
  }

  const hold: RelayHolding[] = [];
  const holdN = takeCount(st.holdingsLength(), MAX_HOLDING_COUNT, "잔고 목록");
  const holdScratch = new HoldingState();
  for (let i = 0; i < holdN; i += 1) {
    const h = st.holdings(i, holdScratch);
    if (h === null) {
      skipAccountStateItem("entry-null", "holding", i, "");
      continue;
    }
    const isin = h.isin() ?? "";
    if (!isValidIsin(isin)) {
      skipAccountStateItem("bad-isin", "holding", i, `len=${isin.length}`);
      continue;
    }
    hold.push({
      isin,
      qty: h.stockQty(),
      sellableQty: h.sellableQty(),
      // 평단가는 double 이다. 내림하지 않는다 — 화면 표기 반올림은 UI 몫이다.
      avgPrice: h.avgPrice(),
    });
  }

  const unf: RelayUnfilled[] = [];
  const unfN = takeCount(st.unfilledLength(), MAX_UNFILLED_COUNT, "미체결 목록");
  const unfScratch = new UnfilledState();
  for (let i = 0; i < unfN; i += 1) {
    const u = st.unfilled(i, unfScratch);
    if (u === null) {
      skipAccountStateItem("entry-null", "unfilled", i, "");
      continue;
    }
    const orderNo = u.orderNo() ?? "";
    if (orderNo === "") {
      // 주문번호가 없으면 취소의 `org_order_no` 를 채울 수 없어 행이 무의미하다.
      skipAccountStateItem("empty-order-no", "unfilled", i, "");
      continue;
    }
    const isin = u.isin() ?? "";
    if (!isValidIsin(isin)) {
      skipAccountStateItem("bad-isin", "unfilled", i, `len=${isin.length}`);
      continue;
    }
    const rawSide = u.side() ?? "";
    const side = fromWireSide(rawSide);
    if (side === null) {
      // 매매구분을 지어내지 않는다 — 취소 주문이 반대 방향으로 나갈 수 있다.
      skipAccountStateItem("bad-side", "unfilled", i, `raw=${rawSide}`);
      continue;
    }
    unf.push({
      orderNo,
      orgOrderNo: u.orgOrderNo() ?? "",
      isin,
      side,
      price: u.price(),
      orderQty: u.orderQty(),
      filledQty: u.filledQty(),
      // 취소 수량의 원천이다 (D-21 — 0 은 즉시 거부이므로 UI 가 버튼을 막는다).
      unfilledQty: u.unfilledQty(),
      exchange: fromWireExchange(u.exchange() ?? ""),
    });
  }

  const rm: string[] = [];
  const rmN = takeCount(st.removedOrderNosLength(), MAX_REMOVED_ORDER_COUNT, "삭제 표식");
  for (let i = 0; i < rmN; i += 1) {
    const removedOrderNo: string = st.removedOrderNos(i) ?? "";
    if (removedOrderNo === "") {
      skipAccountStateItem("empty-order-no", "removed", i, "");
      continue;
    }
    rm.push(removedOrderNo);
  }

  return {
    t: "acct",
    a: accountNo,
    snap: isSnapshot,
    hold,
    unf,
    rm,
    st: st.serverTime() ?? "",
  };
}

// ============================================================
// 전략 파싱 (게이트웨이 → relay) — 16-05 / TRADE-03 / D-01
// ============================================================
//
// 16-04 가 수신 화이트리스트를 19종으로 넓히며 통과시킨 응답 7종(56·60·61·64·65·72·73)의
// **내용**을 여기서 채운다. 화이트리스트만 넓히고 파서가 없으면 프레임은 Hub 의 `default:`
// 로 조용히 사라지고, 그 결과가 「서버가 거부했는데 화면은 반영됨」이다 (Pitfall 8).
//
// `parseAccountState` 의 규율 4개를 그대로 승계한다:
//   ① 슬롯 null → `dropField` 후 `null` 반환 (**throw 하지 않는다**)
//   ② 행 하나가 깨지면 그 행만 건너뛰고 프레임은 살린다 — 프레임째 버리면 정상 행까지 사라진다
//   ③ 벡터는 `takeCount` 로 상한 클램프 (T-16-06)
//   ④ bigint 는 `toNum` 한 곳만 통과한다 (D-34) — 계약에 64비트가 새면 팬아웃 루프가 죽는다
//
// 상위(Hub)는 실패를 **재로그하지 않는다** (S-2). 사유·카운터는 여기서만 남긴다.

/**
 * 상따 전략 목록 상한 (64). 종목당 1건이라 실사용은 두 자리다 — 파손 프레임 방어용 폭이다.
 */
export const MAX_LIMIT_CHASER_COUNT = 200;

/**
 * VI 주문 추적 목록 상한 (72/73). 하루치 발동을 담아도 남는 폭으로 둔다 — 상따와 달리
 * 종목당 1건 제약이 없어 발동 횟수만큼 쌓인다.
 */
export const MAX_VI_ORDER_COUNT = 500;

/**
 * 형식 위반으로 건너뛴 **전략 항목**(상따 목록·VI 주문 행) 누적 수 (S-5).
 *
 * 계좌 계열 카운터 2종과 **따로** 센다. 섞으면 "잔고 행 파손"과 "VI 주문 행 파손"을 구분할
 * 수 없어, 실계통에서 「가끔 목록이 비는」 현상의 출처를 영영 못 찾는다 (T-16-07).
 */
let skippedStrategyItems = 0;

/** 형식 위반으로 건너뛴 전략 항목 누적 수. */
export function skippedStrategyItemCount(): number {
  return skippedStrategyItems;
}

/** 전략 항목 1건 스킵. 계좌번호 원문은 담지 않는다 (T-15-15) — 사유·위치·길이만 남긴다. */
function skipStrategyItem(reason: string, kind: string, index: number, detail: string): void {
  skippedStrategyItems += 1;
  logger.warn(
    { reason, kind, index, detail, skippedStrategyItemCount: skippedStrategyItems },
    "[DMA] 전략 항목 스킵 (형식 가드)",
  );
}

/**
 * 전략 키 `${isin}:${accountNo}:${exchange}` — 서버 `LimitChaser::MakeKey` / C#
 * `WireCodes.StrategyKey()` 와 동형이다.
 *
 * **조립 지점은 이 함수 하나뿐이다.** 브라우저는 계약의 `key` 를 그대로 신뢰하고 다시 만들지
 * 않는다 — 두 곳에서 만들면 12자 절단·거래소 정규화 중 한쪽만 반영돼 키가 갈리고, 갈린 키는
 * 「에코가 영원히 매칭되지 않는다」라는 조용한 실패로 나타난다.
 */
export function strategyKey(isin: string, accountNo: string, exchange: RelayExchange): string {
  return `${isin}:${accountNo}:${exchange}`;
}

/** 항목 단위 읽기 결과. 실패 사유를 호출자에게 넘겨 드롭/스킵을 다르게 처리하게 한다. */
type ReadResult<T> = { ok: true; value: T } | { ok: false; reason: string; detail: string };

/**
 * `SetLimitChaser` 테이블 1건 → 계약 타입.
 *
 * 60 단건 에코와 64 목록 원소는 **같은 바이트**라 파서도 하나여야 한다 — 두 벌이면 한쪽만
 * 고쳐져 목록과 에코가 갈린다.
 *
 * **활성 37필드를 전부 읽는다.** S→C 전용 4(`sellOrderQty` · `sellQtyTrackBaseline` ·
 * `sellEntryLatched` · `cancelQtyTrackBaseline`)는 보내지 않지만 읽어서 표시한다 —
 * 「보내지 않는 것」과 「읽지 않는 것」은 다른 문제다 (Pitfall 6).
 *
 * 실패 사유만 돌려주고 로그는 남기지 않는다. 단건은 프레임 드롭, 목록은 항목 스킵으로
 * 카운터가 갈라져야 하기 때문이다.
 */
function readLimitChaser(t: SetLimitChaser): ReadResult<RelayLimitChaser> {
  const isin = t.isin() ?? "";
  if (!isValidIsin(isin)) {
    // ISIN 은 전략 키의 첫 마디다. 깨지면 어느 종목의 전략인지 알 수 없어 행이 무의미하다.
    return { ok: false, reason: "bad-isin", detail: `len=${isin.length}` };
  }
  const accountNo = t.accountNo() ?? "";
  if (!isValidAccountNo(accountNo)) {
    return { ok: false, reason: "bad-account-no", detail: `len=${accountNo.length}` };
  }
  // 빈 값은 "KRX" 다 — 서버가 그렇게 정규화한 **뒤에** 키를 만든다. 여기서 다르게 읽으면
  // 클라가 기억하는 키와 서버 키가 갈린다.
  const exchange = fromWireExchange(t.exchange() ?? "");

  return {
    ok: true,
    value: {
      isin,
      accountNo,
      market: fromWireMarket(t.market() ?? ""),
      // 삭제 신호다. 두 스위치가 아니라 이 값이 「삭제됨」의 정본이다 (Pitfall 7).
      crud: fromWireCrud(t.crud() ?? ""),
      buyOrderPrice: t.buyOrderPrice(),
      buyOrderQty: t.buyOrderQty(),
      buyWatchPrice: t.buyWatchPrice(),
      buyWatchQty: t.buyWatchQty(),
      buyMinTradeQty: t.buyMinTradeQty(),
      buyWatchSide: fromWireWatchSide(t.buyWatchSide() ?? ""),
      buyTradeQtyEnabled: t.buyTradeQtyEnabled(),
      // 에코의 게이트는 설정값이 아니라 **무장 상태**다(`cfg.buyEnabled && buyArmed`).
      // 여기서 해석하지 않고 그대로 올린다 — 문구 구분은 UI 몫이다 (Pitfall 10).
      buyEnabled: t.buyEnabled(),
      sellOrderPrice: t.sellOrderPrice(),
      // S→C 전용 — 서버가 Set 시점에 `매도가능수량 × sellOrderRatio / 100` 을 스냅샷한 값.
      sellOrderQty: t.sellOrderQty(),
      sellWatchPrice: t.sellWatchPrice(),
      sellWatchQty: t.sellWatchQty(),
      sellMinTradeQty: t.sellMinTradeQty(),
      sellEnabled: t.sellEnabled(),
      sellTradeQtyEnabled: t.sellTradeQtyEnabled(),
      sweepWatchPrice: t.sweepWatchPrice(),
      sweepEnabled: t.sweepEnabled(),
      sweepMinTickCount: t.sweepMinTickCount(),
      // 고정 3은 **서버가 되돌려준 값을 그대로 읽는다**. 송신만 못박고(16-04) 수신을 덮으면
      // 서버가 다른 값을 들고 있어도 화면이 영원히 모른다.
      sweepRecalcEnabled: t.sweepRecalcEnabled(),
      sweepMinCount: t.sweepMinCount(),
      // BasisPoints 다(2950 = 29.5%). `RelayViTrigger.checkRate` 의 정수 % 와 단위가 다르다.
      sweepMinRate: t.sweepMinRate(),
      exchange,
      sellOrderRatio: t.sellOrderRatio(),
      sellQtyTrackEnabled: t.sellQtyTrackEnabled(),
      sellQtyTrackRatio: t.sellQtyTrackRatio(),
      // S→C 전용 — 서버가 유지하는 래칫 기준선.
      sellQtyTrackBaseline: t.sellQtyTrackBaseline(),
      // 단위 **만원**. `0` 은 "서버가 모른다"는 뜻이라 UI 가 금액 칸을 건드리지 않는다
      // (수량 × 가격 역산도 금지 — 나머지 손실로 왕복이 깨진다, Pitfall 11).
      buyOrderAmount: t.buyOrderAmount(),
      // S→C 전용 — 매도 진입 확인 래치 원값.
      sellEntryLatched: t.sellEntryLatched(),
      cancelQtyEnabled: t.cancelQtyEnabled(),
      cancelWatchQty: t.cancelWatchQty(),
      cancelTradeEnabled: t.cancelTradeEnabled(),
      cancelQtyTrackEnabled: t.cancelQtyTrackEnabled(),
      // S→C 전용 — 16-01 재동기화로 접근자가 생긴 필드다.
      cancelQtyTrackBaseline: t.cancelQtyTrackBaseline(),
      key: strategyKey(isin, accountNo, exchange),
    },
  };
}

/**
 * 상따 설정 에코 (60 — `set_limit_chaser` 슬롯).
 *
 * **반영의 유일한 증거**다. 서버는 거부를 응답 코드로 주지 않으므로 에코가 오지 않으면
 * 거부(계좌·거래소)이고, 눕혀진 값으로 오면 부분 거부다 (Pitfall 8).
 *
 * `crud: "D"` 도 이 프레임으로 온다 — **삭제 판정은 스위치가 아니라 이 값**이다 (Pitfall 7).
 */
export function parseLimitChaserEcho(env: Envelope): RelayLimitChaser | null {
  const t = env.setLimitChaser();
  if (t === null) {
    return dropField("slot-null", MSG.SetLimitChaserResp, { slot: "set_limit_chaser" });
  }
  const r = readLimitChaser(t);
  if (!r.ok) {
    return dropField(r.reason, MSG.SetLimitChaserResp, {
      slot: "set_limit_chaser",
      detail: r.detail,
    });
  }
  return r.value;
}

/**
 * 상따 전략 전량 스냅샷 (64 — `limit_chaser_list` 슬롯).
 *
 * **0건은 빈 배열이지 `null` 이 아니다.** 서버는 등록이 없어도 길이 0 벡터로 정상 응답하므로
 * (무응답 금지), `null` 로 뭉개면 웹이 "아직 안 왔다"와 "없다"를 구분할 수 없다.
 *
 * 항목 하나가 깨지면 그 항목만 건너뛴다 — 프레임째 버리면 정상 전략까지 목록에서 사라지고,
 * 그것이 「전략이 없다」라는 더 나쁜 오진이 된다.
 */
export function parseLimitChaserList(env: Envelope): RelayLimitChaser[] | null {
  const list = env.limitChaserList();
  if (list === null) {
    return dropField("slot-null", MSG.GetLimitChaserListResp, { slot: "limit_chaser_list" });
  }
  const n = takeCount(list.itemsLength(), MAX_LIMIT_CHASER_COUNT, "limitChaserList");
  const out: RelayLimitChaser[] = [];
  const scratch = new SetLimitChaser();
  for (let i = 0; i < n; i += 1) {
    const t = list.items(i, scratch);
    if (t === null) {
      skipStrategyItem("entry-null", "limitChaser", i, "");
      continue;
    }
    const r = readLimitChaser(t);
    if (!r.ok) {
      skipStrategyItem(r.reason, "limitChaser", i, r.detail);
      continue;
    }
    out.push(r.value);
  }
  return out;
}

/**
 * `parseViTrigger` 결과 — **「미등록」과 「파싱 실패」를 절대 같은 값으로 뭉개지 않는다.**
 *
 * 함수가 `null` 을 돌려주면 파싱 실패(드롭 카운터가 오른다)이고, `{ ok: true, cfg: null }`
 * 이면 미등록이다. 둘을 하나로 합치면 서버가 「전략 없음」을 정상 응답한 것과 프레임이 깨진
 * 것이 구분되지 않아, UI 가 사용자 입력을 지워야 할지 그대로 둬야 할지 알 수 없다.
 */
export type ParsedViTrigger = {
  ok: true;
  /** `null` 은 **미등록**이다. 이때 UI 는 입력값을 그대로 두고 `run` 만 내린다. */
  cfg: RelayViTrigger | null;
};

/**
 * VI 전략 에코 (61 — `set_vi_trigger` 슬롯).
 *
 * **빈 61 은 파손이 아니라 「미등록」**이다. 서버는 `GetVITriggerReq(21)` 에 전략이 없어도
 * 반드시 61 을 돌려주고(무응답 금지), 그 「없음」의 표현이 빈 슬롯이다. 여기서 드롭 카운터를
 * 올리지 않는 이유가 그것이다 — 빈 61 을 "값 0" 으로 오독하면 사용자가 입력한 금액이 지워진다.
 */
export function parseViTrigger(env: Envelope): ParsedViTrigger | null {
  const t = env.setViTrigger();
  if (t === null) return { ok: true, cfg: null };

  const accountNo = t.accountNo() ?? "";
  if (!isValidAccountNo(accountNo)) {
    // 계좌번호가 키다. 없으면 어느 계좌의 VI 전략인지 알 수 없어 쓸 수가 없다.
    return dropField("bad-account-no", MSG.SetVITriggerResp, {
      slot: "set_vi_trigger",
      len: accountNo.length,
    });
  }

  const rawPriceType = t.priceType() ?? "";
  if (rawPriceType.charAt(0) === "L") {
    // 하한가 전략은 relay 가 만들지 않는다 (D-01) — 다른 클라이언트(WinForms)가 등록한 것이라
    // 계약에 표현할 방법이 없다. 프레임을 버리면 `run`·금액까지 잃으므로 상한가로 좁히고
    // 경고만 남긴다. 조용히 덮지 않는 것이 이 로그의 전부다 (PC-7).
    logger.warn(
      { msgType: MSG.SetVITriggerResp, rawPriceType },
      "[DMA] VI 가격유형이 하한가 — 계약 표현 밖이라 상한가로 좁힘",
    );
  }

  return {
    ok: true,
    cfg: {
      accountNo,
      // ulong → number 승격의 유일 지점 (D-34). 여기서 새면 팬아웃 루프가 TypeError 로 죽는다.
      orderAmountKrw: toNum(t.orderAmountKrw(), "orderAmountKrw"),
      // 정수 %(25 = 25%). 상따의 `sweepMinRate`(BasisPoints)와 단위가 다르다 (Pitfall 5).
      checkRate: t.checkRate(),
      priceType: VI_PRICE_TYPE,
      run: t.run(),
    },
  };
}

/** VI 주문 상태 화이트리스트 6종. 밖의 값은 **그 항목만** 버린다. */
const VI_ORDER_STATES: ReadonlySet<string> = new Set<string>([
  "Pending",
  "Accepted",
  "Cancelling",
  "Cancelled",
  "Filled",
  "Rejected",
]);

/** 상태 문자열 화이트리스트 가드. 부분체결은 상태가 아니라 `Accepted ∧ filledQty>0` 파생이다. */
function isViOrderState(s: string): s is RelayViOrderState {
  return VI_ORDER_STATES.has(s);
}

/**
 * VI 주문 추적 목록 (72 스냅샷 / 73 증분 — `vi_order_list` 슬롯 공유).
 *
 * @param isSnapshot 72 면 true, 73 이면 false. 본문 `is_snapshot` 도 같은 값을 담지만
 *                   **msg_type 이 정본**이다 (D-33 — 58/59 · 66/67 · 69/71 과 같은 규약).
 *
 * 0건도 정상이다(확인 철회로 목록이 비는 경로). 항목 하나가 깨지면 그 항목만 버리고 나머지는
 * 살린다 — 돈이 걸린 목록에서 한 행 때문에 전체가 사라지는 것이 가장 나쁜 결과다 (T-16-06).
 */
export function parseViOrderList(
  env: Envelope,
  isSnapshot: boolean,
): { snap: boolean; items: RelayViOrderItem[] } | null {
  const msgType = isSnapshot ? MSG.GetVIOrderListResp : MSG.VIOrderListPush;
  const list = env.viOrderList();
  if (list === null) return dropField("slot-null", msgType, { slot: "vi_order_list" });

  if (list.isSnapshot() !== isSnapshot) {
    logger.warn(
      { msgType, bodyIsSnapshot: list.isSnapshot() },
      "[DMA] VI 주문 목록 스냅샷 플래그 불일치 — msg_type 을 따른다 (D-33)",
    );
  }

  const n = takeCount(list.itemsLength(), MAX_VI_ORDER_COUNT, "VI 주문 목록");
  const items: RelayViOrderItem[] = [];
  const scratch = new VIOrderItem();
  for (let i = 0; i < n; i += 1) {
    const it = list.items(i, scratch);
    if (it === null) {
      skipStrategyItem("entry-null", "viOrder", i, "");
      continue;
    }
    const isin = it.isin() ?? "";
    if (!isValidIsin(isin)) {
      skipStrategyItem("bad-isin", "viOrder", i, `len=${isin.length}`);
      continue;
    }
    const accountNo = it.accountNo() ?? "";
    if (!isValidAccountNo(accountNo)) {
      // 취소 주문의 계좌 원천이다. 지어내면 **다른 계좌로 취소가 나간다**.
      skipStrategyItem("bad-account-no", "viOrder", i, `len=${accountNo.length}`);
      continue;
    }
    const state = it.state() ?? "";
    if (!isViOrderState(state)) {
      // 상태를 지어내지 않는다 — "Pending" 으로 메우면 열려선 안 될 행에 확인 체크가 열린다.
      skipStrategyItem("unknown-state", "viOrder", i, `state=${state}`);
      continue;
    }

    items.push({
      isin,
      market: fromWireMarket(it.market() ?? ""),
      accountNo,
      // `""` 를 **그대로 보존한다** — 접수 전(Pending)이라 확인 체크를 열 수 없다는 신호이고,
      // 빈 주문번호의 `vi.confirm` 은 서버가 응답 없이 드롭한다.
      orderNo: it.orderNo() ?? "",
      orderQty: it.orderQty(),
      orderPrice: it.orderPrice(),
      triggerPrice: it.triggerPrice(),
      basePrice: it.basePrice(),
      viEndTime: it.viEndTime() ?? "",
      // long → number (D-34). epoch ms 라 2^53 을 한참 밑돌지만 경계는 `toNum` 한 곳뿐이다.
      deadline110Ms: toNum(it.deadline110Ms(), "deadline110Ms"),
      deadline119Ms: toNum(it.deadline119Ms(), "deadline119Ms"),
      confirmed: it.confirmed(),
      // **서버 계산값이다. 클라가 다시 계산하지 않는다.**
      confirmLocked: it.confirmLocked(),
      state,
      filledQty: it.filledQty(),
    });
  }

  return { snap: isSnapshot, items };
}

/**
 * VI 발동 통보 (56 — `vi_order_notice` 슬롯). 발주 세션의 전 연결로 온다.
 *
 * 해석하지 않고 그대로 흘린다 — 전일대비 %는 `basePrice` 로 브라우저가 계산한다.
 * `name` 은 여기서 채우지 않는다(게이트웨이가 주는 값이 아니다). Hub 가 SymbolMap 으로 붙인다.
 */
export function parseViOrderNotice(env: Envelope): RelayViNoticeMsg | null {
  const n = env.viOrderNotice();
  if (n === null) return dropField("slot-null", MSG.VIOrderNotice, { slot: "vi_order_notice" });

  const isin = n.isin() ?? "";
  if (!isValidIsin(isin)) {
    // 프레임을 **버리지 않는다** (`parseOrderResp` 와 같은 규율). 이 통보는 "주문이 이미
    // 나갔다"는 알림이라, 형식 이상으로 통째로 삼키면 사용자가 발주 사실 자체를 모른다.
    logger.warn(
      { msgType: MSG.VIOrderNotice, len: isin.length },
      "[DMA] VI 통보의 ISIN 형식 이상 — 프레임은 살린다 (발주 사실 유실 방지)",
    );
  }

  return {
    t: "vi.notice",
    isin,
    accountNo: n.accountNo() ?? "",
    triggerPrice: n.triggerPrice(),
    basePrice: n.basePrice(),
    // 서버 판정에 쓴 상승률 — **정수 %**(내림)다.
    changeRate: n.changeRate(),
    orderPrice: n.orderPrice(),
    orderQty: n.orderQty(),
    // 취소 주문의 `market` 원천이다 — 리터럴을 웹앱에 흩뿌리지 않는다 (Pitfall 4).
    market: fromWireMarket(n.market() ?? ""),
    orderSeq: n.orderSeq(),
    viEndTime: n.viEndTime() ?? "",
  };
}

/**
 * 전략 일괄 비활성화 집계 (65 — `disable_strategies_resp` 슬롯).
 *
 * **완료 신호로만 쓴다.** 서버가 키별 60/61 에코를 세션 전 연결에 먼저 보낸 뒤 이 집계를
 * 요청 연결에만 보내므로, 이 프레임이 도착한 시점에는 이미 모든 행이 에코로 갱신돼 있다.
 * 여기 담긴 숫자로 화면 상태를 만들면 에코와 두 벌이 갈린다.
 *
 * 등록된 전략이 없어도 `count: 0` 으로 정상 응답한다(무응답 금지) — `0` 은 실패가 아니다.
 */
export function parseDisableStrategiesResp(
  env: Envelope,
): { count: number; viDisabled: boolean } | null {
  const r = env.disableStrategiesResp();
  if (r === null) {
    return dropField("slot-null", MSG.DisableStrategiesResp, { slot: "disable_strategies_resp" });
  }
  return { count: r.disabledCount(), viDisabled: r.viDisabled() };
}
