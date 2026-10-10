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
 *   - 시장가·IOC/FOK 를 만들지 않는다. 스키마에는 있지만 범위 밖이라 리터럴 유니온으로
 *     봉쇄한다 — `AccountDeclareMode` 와 같은 규율이다. (정정은 Phase 18 D-21 로 열렸다 —
 *     `order.modify` → `order_type` "M" + 원주문번호. 이 봉쇄 목록에 들지 않는다.)
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
  RelayKrxSession,
  RelayLcCrud,
  RelayLimitChaser,
  RelayLimitChaserInput,
  RelayLimitFeatureMember,
  RelayLimitFeatureMsg,
  RelayQueueProgressItem,
  RelayQueuedWindowMsg,
  RelayUserSettingsMsg,
  RelayUserSettingsValues,
  RelayQuote,
  RelayRateCrossItem,
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
import { AutoSellCommandReq } from "../generated/stock-dma/auto-sell-command-req.js";
import { ConfirmVIOrderReq } from "../generated/stock-dma/confirm-viorder-req.js";
import { DirectOrderReq } from "../generated/stock-dma/direct-order-req.js";
import { DisableStrategiesReq } from "../generated/stock-dma/disable-strategies-req.js";
import { Envelope } from "../generated/stock-dma/envelope.js";
import { SetLimitChaser } from "../generated/stock-dma/set-limit-chaser.js";
import { SetVITrigger } from "../generated/stock-dma/set-vitrigger.js";
import { GetAccountStateReq } from "../generated/stock-dma/get-account-state-req.js";
import { GetQuoteReq } from "../generated/stock-dma/get-quote-req.js";
import { GetStrategyReq } from "../generated/stock-dma/get-strategy-req.js";
import { HoldingState } from "../generated/stock-dma/holding-state.js";
import { UnfilledState } from "../generated/stock-dma/unfilled-state.js";
import { GetTradeTapeReq } from "../generated/stock-dma/get-trade-tape-req.js";
import { LivePing } from "../generated/stock-dma/live-ping.js";
import { LoginReq } from "../generated/stock-dma/login-req.js";
import { MemberDelta } from "../generated/stock-dma/member-delta.js";
import { QueueProgressItem } from "../generated/stock-dma/queue-progress-item.js";
import { RateCrossAlert } from "../generated/stock-dma/rate-cross-alert.js";
import type { LoginResp } from "../generated/stock-dma/login-resp.js";
import { SubscribeQuoteReq } from "../generated/stock-dma/subscribe-quote-req.js";
import { SymbolMasterItem } from "../generated/stock-dma/symbol-master-item.js";
import { TradeTapeEntry } from "../generated/stock-dma/trade-tape-entry.js";
import { VIOrderItem } from "../generated/stock-dma/viorder-item.js";
import { UpdateAccountNoReq } from "../generated/stock-dma/update-account-no-req.js";
import { UserSettings } from "../generated/stock-dma/user-settings.js";
import { JournalRecord as WireJournalRecord } from "../generated/stock-dma/journal-record.js";
import { ObserverAccount } from "../generated/stock-dma/observer-account.js";
import { ObserverLoginReq } from "../generated/stock-dma/observer-login-req.js";
import { AdminAccount as WireAdminAccount } from "../generated/stock-dma/admin-account.js";
import { AdminCommandReq } from "../generated/stock-dma/admin-command-req.js";
import { AdminUser as WireAdminUser } from "../generated/stock-dma/admin-user.js";
import { StrategyEvent as WireStrategyEvent } from "../generated/stock-dma/strategy-event.js";
import type {
  JournalBatchFrame,
  JournalRecord,
  ObserverAccountRow,
  ObserverLoginResult,
  StrategyContractViolation,
  StrategyEventRecord,
} from "../journal/types.js";
import type {
  AdminAccount,
  AdminCommandInput,
  AdminCommandResult,
  AdminSnapshotUser,
  AdminUsersSnapshot,
} from "../admin/types.js";
import { ADMIN_OP } from "../admin/types.js";
import { MIN_ENVELOPE_SIZE, logDroppedFrame } from "./codec.js";
import { MSG, INBOUND_MSG_TYPES, OUT_OF_SCOPE_INBOUND_MSG_TYPES } from "./msg-type.js";

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
/**
 * 등락률 돌파 above 집합 1프레임 원소 상한 (T-17-09).
 *
 * 서버는 임계−2%p 이탈 시 원소를 빼므로 집합이 무한히 자라지 않지만, 상한 없는 벡터 순회는
 * 깨진 버퍼 하나로 프로세스를 멈춘다(JS 런타임에 FlatBuffers Verifier 가 없다). 브라우저
 * 상한(`use-relay-socket.ts` 의 `MAX_RATE_CROSS`)도 같은 값이다.
 */
export const MAX_RATE_CROSS_ITEM_COUNT = 200;
/**
 * 관찰자 저널 배치(80) 1프레임 레코드 상한 (T-19-33).
 *
 * 게이트웨이 펌프는 배치를 **100건 / ≈32KB** 이하로 자른다(gh-trade 23-03 `kBatchMaxRecords`). 상한은
 * 그 5배 여유다 — 깨진 벡터 길이로 순회가 폭주하는 것만 막는다.
 */
export const MAX_JOURNAL_BATCH_RECORDS = 500;
/**
 * 관찰자 저널 배치(80) 1프레임 **전략 이벤트** 상한 (Phase 25 · T-25-04).
 *
 * 게이트웨이는 두 스트림 합계를 100건 / ≈32KB 로 자른다(G1 ⓐ). 상한은 저널 레코드와 같은 5배 여유다 —
 * 초과분은 버리지 않고 앞 N건만 쓴 뒤 `strategyCaughtUp` 을 거짓으로 내려 다음 배치 갭 판정이 since 로 다시 받는다.
 */
export const MAX_STRATEGY_BATCH_EVENTS = 500;
/** 전략 이벤트 `snap_qty` · `snap_cum` 원소 상한. 계약은 즉시 · 1초 · 3초 = 최대 3 — 여유를 둔 폭주 방어선. */
const MAX_STRATEGY_SNAP_COUNT = 16;
/**
 * 잔량진행률(83) 1프레임 항목 상한 (Phase 25 · T-25-27).
 *
 * 한 (isin, exchange) 의 대기 주문 전량이다 — 실사용은 계좌 수 × 전략 수라 한 자릿수~수십 건이다.
 * 상한은 깨진 벡터 길이로 순회가 폭주하는 것만 막는다(초과분은 앞 N건 · `takeCount` 경고).
 */
export const MAX_QUEUE_PROGRESS_ITEMS = 200;
/**
 * 상한가 특징(85) 창구 벡터 상한 (Phase 28). 서버는 매수 · 매도 각각 「이 분 B9 증분 상위 3」 을 싣는다 —
 * 상한은 깨진 벡터 길이로 순회가 폭주하는 것만 막는다(초과분은 앞 3건 · `takeCount` 경고).
 */
export const MAX_LIMIT_FEATURE_MEMBERS = 3;
/** 관찰자 로그인 응답(79) 계좌 매핑 상한 (T-19-33). users.toml 평탄화 행 수 — 실사용은 수십 행이다. */
export const MAX_OBSERVER_ACCOUNT_COUNT = 1024;
/** admin 유저 스냅샷(87) 유저당 계좌 벡터 상한 (Phase 29). 실사용은 한 자릿수 — 깨진 길이로 순회 폭주만 막는다. */
export const MAX_ADMIN_ACCOUNTS_PER_USER = 64;
/** admin 유저 스냅샷(87) 유저 벡터 상한 (Phase 29). users.toml 전체 — 실사용은 수십 명이다. */
export const MAX_ADMIN_USERS = 2000;

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
  skippedSymbolMasterItems = 0;
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

/**
 * `level` 기본값은 `warn` 이라 기존 호출부는 전부 무변경이다 (quick-260910-jce).
 *
 * ★ 카운터는 **나누지 않는다.** `droppedEnvelopes` 는 「이 프로세스가 지금까지 몇 프레임을
 *   버렸나」를 세는 단조 증가값이고 운영자가 재시작 간에 비교하는 숫자다. 둘로 쪼개면 기존
 *   WARNING 줄의 `droppedFrameCount` 가 **조용히 다른 모집단을 세기 시작해** Cloud Logging 에
 *   이미 쌓인 값과의 연속성이 끊긴다. 두 모집단은 `reason` 필드로 로그 쿼리에서 이미 분리된다 —
 *   새 상태를 만들 이유가 없다.
 */
function drop(
  reason: string,
  msgTypeHint: number | null,
  payload: Buffer,
  level: "warn" | "debug" = "warn",
): null {
  droppedEnvelopes += 1;
  logDroppedFrame({
    reason,
    msgTypeHint,
    payload,
    droppedFrameCount: droppedEnvelopes,
    level,
  });
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

const TRADE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" 이고 실제 달력 날짜인가 — Postgres `::date` 캐스트가 받는 형식만(WR-01). */
export function isValidTradeDate(s: string): boolean {
  if (!TRADE_DATE_PATTERN.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * 전략 이벤트 필수 키 계약 검사 (WR-01) — `dma_strategy_apply` 가 엄격 캐스트하는 키만 본다. 여기서 걸리는 이벤트를
 * 그대로 올리면 적용 RPC 가 배치 전체를 거부하고 기록기가 같은 배치를 영원히 재시도한다(`seq = 0` 은 `CHECK (seq > 0)`,
 * `trade_date ""` 는 `::date` 캐스트 실패). `gw_time_ms` 는 `toNum` 을 지나 늘 정수라 캐스트가 실패하지 않는다.
 */
export function strategyEventContractField(ev: StrategyEventRecord): StrategyContractViolation["field"] | null {
  if (!Number.isSafeInteger(ev.seq) || ev.seq <= 0) return "seq";
  if (!isValidTradeDate(ev.tradeDate)) return "trade_date";
  return null;
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

/**
 * `SubscribeQuoteReq.level` 바이트 (quick-260923-ge2 · gh-trade 회신 quick-260923-exo).
 * 0 = FULL(59+71+75 종전 그대로) · 1 = PRICE(59 만 · 가격 섹션 갱신 때만 · 키당 ≥100ms).
 * 서버는 1 만 PRICE 로 보고 그 밖 값은 FULL 로 접는다 — relay 도 1 외의 값을 만들지 않는다.
 */
export const QUOTE_LEVEL = { FULL: 0, PRICE: 1 } as const;
export type QuoteLevelByte = (typeof QUOTE_LEVEL)[keyof typeof QUOTE_LEVEL];

/**
 * 호가 구독/해제 (MsgType 29). `subscribe:false` 가 해제다.
 *
 * `level` 은 vtable 슬롯 10(말미 append · 기존 isin 4 / exchange 6 / subscribe 8 불변)이다.
 * 기본값 0 이라 FULL 프레임은 종전과 바이트가 같다 — flatbuffers `addFieldInt8` 은 기본값과
 * 같은 값을 싣지 않는다. 해제(`subscribe:false`) 는 level 과 무관하게 그 키를 놓으므로 호출부가
 * level 을 넘기지 않는다. 같은 연결·같은 키 재구독은 서버가 level 덮어쓰기로 처리한다(승격·강등).
 * 정본: fbs `SubscribeQuoteReq` 주석 · `tasks/gh-trade-price-only-quote-subscription-reply.md`.
 */
export function buildSubscribeQuoteReq(
  isin: string,
  exchange: RelayExchange,
  subscribe: boolean,
  level: QuoteLevelByte = QUOTE_LEVEL.FULL,
): Uint8Array {
  const b = new flatbuffers.Builder(128);
  const req = SubscribeQuoteReq.createSubscribeQuoteReq(
    b,
    b.createString(isin),
    b.createString(exchange),
    subscribe,
    level,
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
      /*
        ★ 드롭은 두 갈래다 — **버리는 동작은 같고 로그 레벨만 다르다** (quick-260910-jce).
          ⓐ 「왜 범위 밖인지 아는」 응답 대역(msg-type.ts 「하지 않는 것」)은 debug.
             거래원 푸시 74/75 가 25~55초마다 들어오는데, 이것을 정체불명과 같은 WARNING 으로
             쌓으면 진짜 이상 신호가 그 사이에 묻힌다.
          ⓑ 그 밖은 전부 warn 그대로다. **요청 대역이 수신 경로로 오는 것**(20·26·27·30·31)도
             여기 남는다 — 그 자체가 이상 신호이기 때문이다(INBOUND_MSG_TYPES 주석).
      */
      if (OUT_OF_SCOPE_INBOUND_MSG_TYPES.has(msgType)) {
        return drop("out-of-scope-msg-type", msgType, payload, "debug");
      }
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
    // KRX 정규장 종가. 오늘 종가가 아니면 서버가 `0` 을 보낸다 — **`0` 도 권위값**이라
    // 거르지 않는다. NXT 프레임에도 KRX 값이 실린다 (D-11). 벽시계 판정은 어디에도 없다.
    kc: toNum(q.krxClosePrice(), "krx_close_price"),
    // 버스트 상한가 — 서버 권위값 · 거래소별(이 프레임의 x) · 계산 없음. 부재(구 서버) = false (quick-261003-rc4).
    bul: q.burstUpperLimit(),
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
      // 서버 체결구분 원문. 아는 두 값만 통과시키고 **낯선 값은 `""`(미상)으로 좁힌다** —
      // 지어내면 매수/매도 색이 반대로 칠해진다. `""` 인 원소만 화면이 추정으로 폴백한다 (D-10).
      bs: fromWireBsCode(e.bsCode() ?? ""),
    });
  }

  return { t: "tape", i: isin, x: exchange, snap: isSnapshot, e: entries };
}

/**
 * `RateCrossAlert` 테이블 1건 → `RelayRateCrossItem`. **76 단건과 78 스냅샷 원소가
 * 같은 바이트**라 판정도 한 함수에만 둔다 — 두 벌이면 한쪽만 고쳐져 above 집합이
 * 조용히 어긋난다.
 *
 * `exchangeTime`(12자)·`serverTime`("HH:MM:SS")는 **해석하지 않고 원문**으로 넘긴다 (D-03).
 * `lastPrice`/`basePrice` 는 long 이라 `toNum` 경계를 반드시 통과시킨다(16-RESEARCH
 * Pitfall 3 — `JSON.stringify(bigint)` 는 TypeError 다). `changeRate`/`thresholdPct` 는
 * double % 이므로 그대로 넘긴다(내림하면 20.0 과 20.9 가 같아진다).
 *
 * @param index 78 스냅샷의 원소 번호. 드롭 로그에 어느 원소가 깨졌는지 남긴다.
 */
function readRateCrossItem(
  a: RateCrossAlert,
  msgType: number,
  index?: number,
): RelayRateCrossItem | null {
  const at = index === undefined ? {} : { index };
  const isin = a.isin() ?? "";
  const exchange = a.exchange() ?? "";
  if (!isValidIsin(isin)) return dropField("bad-isin", msgType, { isin, ...at });
  if (!isValidExchange(exchange)) {
    return dropField("bad-exchange", msgType, { isin, exchange, ...at });
  }

  return {
    isin,
    exchange,
    lastPrice: toNum(a.lastPrice(), "rate_cross_last_price"),
    changeRate: a.changeRate(),
    thresholdPct: a.thresholdPct(),
    basePrice: toNum(a.basePrice(), "rate_cross_base_price"),
    exchangeTime: a.exchangeTime() ?? "",
    serverTime: a.serverTime() ?? "",
  };
}

/**
 * 등락률 돌파 알림 1건 (76 — `rate_cross_alert` 슬롯).
 *
 * ⚠️ 요청 짝도 snapshot 플래그도 없는 **Broadcast** 다 — 로그인 전 연결에도 온다. 그래서
 *    이 파서는 세션 소유자를 모르고, 소유자 판정(팬아웃 여부)은 hub 의 몫이다 (T-17-07).
 */
export function parseRateCrossAlert(env: Envelope): RelayRateCrossItem | null {
  const a = env.rateCrossAlert();
  if (a === null) {
    return dropField("slot-null", MSG.RateCrossAlert, { slot: "rate_cross_alert" });
  }
  return readRateCrossItem(a, MSG.RateCrossAlert);
}

/**
 * 등락률 돌파 above 집합 전량 (78 — `rate_cross_snapshot` 슬롯).
 *
 * **`[]` 와 `null` 은 다른 뜻이다.** `[]` 는 「돌파 없음」의 확정 정보(서버가 빈 벡터를
 * 보낸다)이고 `null` 만 파싱 실패다. 둘을 뭉개면 화면이 옛 집합을 계속 그린다.
 *
 * 원소 하나가 깨지면 **프레임 전체를 버린다** — `parseTradeTape` 와 같은 규율이다. 일부만
 * 내보내면 above 집합이 조용히 어긋나고, 그 어긋남은 「돌파했는데 목록에 없다」로만 드러난다.
 */
export function parseRateCrossSnapshot(env: Envelope): RelayRateCrossItem[] | null {
  const msgType = MSG.RateCrossSnapshot;
  const snap = env.rateCrossSnapshot();
  if (snap === null) return dropField("slot-null", msgType, { slot: "rate_cross_snapshot" });

  const n = takeCount(snap.itemsLength(), MAX_RATE_CROSS_ITEM_COUNT, "등락률 돌파 집합");
  const items: RelayRateCrossItem[] = [];
  const scratch = new RateCrossAlert();
  for (let i = 0; i < n; i += 1) {
    const a = snap.items(i, scratch);
    if (a === null) return dropField("item-null", msgType, { index: i });
    const item = readRateCrossItem(a, msgType, i);
    // 원소 파서가 이미 사유·카운터를 남겼다 — 여기서 다시 로그하지 않는다.
    if (item === null) return null;
    items.push(item);
  }
  return items;
}

/**
 * 예약·장전·시간외종가 발주 창 상태 (77 — `queued_window_state` 슬롯).
 *
 * ⚠️ 여섯 값 **전부 표시 힌트**다 — relay 도 브라우저도 **벽시계로 창을 판정하지 않는다**.
 *    fbs 주석(예약창 `[15:20,16:00)`)과 `docs/features/queued-order.md`(15:30 시작)의 시각이
 *    서로 엇갈린다. 엇갈리는 두 문서 대신 서버가 보내는 플래그 하나를 믿는 것이 계약이다.
 */
export function parseQueuedWindowState(env: Envelope): RelayQueuedWindowMsg | null {
  const q = env.queuedWindowState();
  if (q === null) {
    return dropField("slot-null", MSG.QueuedWindowState, { slot: "queued_window_state" });
  }
  return {
    t: "queued.window",
    open: q.open(),
    maxPieces: q.maxPieces(),
    preopenOpen: q.preopenOpen(),
    g2Open: q.g2Open(),
    g3Open: q.g3Open(),
    nxtPreopenOpen: q.nxtPreopenOpen(),
  };
}

/**
 * 사용자 설정 (84 — `user_settings` 슬롯 88 · Phase 27). 11값 + `present`(84 전용 — false 면 서버가 내장
 * 기본값을 실었다). 금액 3칸은 **만원** 그대로 옮긴다 — relay 는 단위를 바꾸지 않는다.
 */
export function parseUserSettings(env: Envelope): RelayUserSettingsMsg | null {
  const u = env.userSettings();
  if (u === null) {
    return dropField("slot-null", MSG.UserSettingsResp, { slot: "user_settings" });
  }
  return {
    t: "user.settings",
    present: u.present(),
    preBuyAmount: u.preBuyAmount(),
    addBuyAmount: u.addBuyAmount(),
    postBuyAmount: u.postBuyAmount(),
    postBuyMaxCount: u.postBuyMaxCount(),
    postBuyFloorQty: u.postBuyFloorQty(),
    postBuyReboundPct: u.postBuyReboundPct(),
    sellQtyTrackRatio: u.sellQtyTrackRatio(),
    autoSellPeriodSec: u.autoSellPeriodSec(),
    auctionSellRatioPct: u.auctionSellRatioPct(),
    autoSellRatioDefaultPct: u.autoSellRatioDefaultPct(),
    autoSellMethodDefault: u.autoSellMethodDefault(),
  };
}

/**
 * 잔량진행률 항목 1건의 **relay 내부** 형태 — 공개 칸(`RelayQueueProgressItem`) + 주문자.
 *
 * `dmaUserId` 는 hub 가 계좌 필터 뒤 **캐시 전에 지운다**(T-19-08 · T-25-25). 파서가 미리 지우지 않는
 * 이유: 파서는 수신 원문의 충실한 번역이고, 무엇을 내보낼지는 소유자를 아는 hub 가 정한다.
 */
export type QueueProgressWireItem = RelayQueueProgressItem & { dmaUserId: string };

/**
 * 잔량진행률 1프레임 (83) — 그 (isin, exchange) 의 대기 · 첫 체결 뒤 주문 **전량**.
 * `firstFilled` 항목은 서버가 네 값을 첫 체결 순간 값으로 고정해 전량 체결 · 취소 · 거부까지 싣는다.
 */
export type QueueProgressFrame = {
  isin: string;
  exchange: RelayExchange;
  /** `[]` = 그 종목 · 거래소의 해당 주문이 모두 사라졌다(G1 ⓕ) — 파싱 실패(`null`)와 다른 뜻이다. */
  items: QueueProgressWireItem[];
};

/**
 * 잔량진행률 (83 — `queue_progress` 슬롯 · Phase 25). **total** — 예외 없이 값 또는 `null`.
 *
 * - 슬롯 null · 종목/거래소 형식 이상 → `dropField` 후 `null`(그 프레임 전체를 모른다).
 * - 항목 수는 `takeCount(MAX_QUEUE_PROGRESS_ITEMS)`.
 * - 계좌 형식 이상(빈 값 · 12자 초과) 항목은 **건너뛰고** 프레임당 경고 1줄(건수 · 마스킹 표본)만 남긴다.
 *   진행률은 seq 가 없는 전량 스냅샷이라 한 항목을 버려도 갭 루프가 생기지 않는다(관찰자 80 과 다르다) —
 *   그리고 계좌가 없는 항목은 hub 계좌 필터를 어차피 통과할 수 없다.
 * - 64비트 칸은 `toNum` 경계를 지난다(D-34). 값은 **계산하지 않는다** — 서버 진실 원본(T-25-28).
 */
export function parseQueueProgress(env: Envelope): QueueProgressFrame | null {
  const msgType = MSG.QueueProgress;
  const qp = env.queueProgress();
  if (qp === null) return dropField("slot-null", msgType, { slot: "queue_progress" });

  const isin = qp.isin() ?? "";
  const exchange = qp.exchange() ?? "";
  if (!isValidIsin(isin)) return dropField("bad-isin", msgType, { isin });
  if (!isValidExchange(exchange)) return dropField("bad-exchange", msgType, { isin, exchange });

  const n = takeCount(qp.itemsLength(), MAX_QUEUE_PROGRESS_ITEMS, "잔량진행률 항목");
  const items: QueueProgressWireItem[] = [];
  const scratch = new QueueProgressItem();
  let skipped = 0;
  let sampleAccount: string | null = null;
  for (let i = 0; i < n; i += 1) {
    const it = qp.items(i, scratch);
    if (it === null) {
      skipped += 1;
      continue;
    }
    const accountNo = it.accountNo() ?? "";
    if (!isValidAccountNo(accountNo)) {
      skipped += 1;
      sampleAccount ??= accountNo;
      continue;
    }
    items.push({
      accountNo,
      dmaUserId: it.dmaUserId() ?? "",
      orderNo: it.orderNo() ?? "",
      exchange: it.exchange() ?? "",
      isin: it.isin() ?? "",
      group: it.group(),
      expectedCum: toNum(it.expectedCum(), "queue_progress.expected_cum"),
      currentCum: toNum(it.currentCum(), "queue_progress.current_cum"),
      remainingVolume: toNum(it.remainingVolume(), "queue_progress.remaining_volume"),
      progressBp: it.progressBp(),
      // 슬롯 부재(옛 서버) = 생성 기본 false. 계산하지 않는다(T-25-28).
      firstFilled: it.firstFilled(),
    });
  }
  if (skipped > 0) {
    // 계좌번호 원문은 로그에 넣지 않는다(T-15-15) — 마스킹 표본과 길이만.
    logger.warn(
      {
        isin,
        exchange,
        skipped,
        sampleAccount: sampleAccount === null ? null : maskAccountNo(sampleAccount),
        sampleLen: sampleAccount?.length ?? null,
      },
      "[DMA] 잔량진행률 항목 스킵 — 계좌 형식 이상 (진행률 항목)",
    );
  }
  return { isin, exchange, items };
}

/**
 * 상한가 특징 (85 · `limit_feature` 슬롯 90 · Phase 28 — gh-trade Phase 27 · fbs 2404509b).
 *
 * - 슬롯 null · 종목/거래소 형식 이상 → `dropField` 후 `null`(그 프레임 전체를 모른다).
 * - 창구 벡터는 매수 · 매도 각각 `takeCount(MAX_LIMIT_FEATURE_MEMBERS)` — `MemberDelta` scratch 재사용.
 * - 64비트 칸은 전부 `toNum` 경계를 지난다(D-34). 값은 **계산하지 않는다** — 서버 진실 원본(D-19).
 * - 공개 시세 파생값이라 계좌 · 주문자 필드가 없다 — 계좌 스킵 로깅이 필요 없다.
 * - `list_shares` · `team_sim` 은 싣지 않는다(표시 자리 없음 — shared `RelayLimitFeatureMsg` JSDoc).
 * - fbs ea8d9171 — 85 말미 append 2필드(`lock_sell_krw` · `lock_cancel_krw`, 원), 구 서버 프레임은 FlatBuffers 기본값 0(quick-261006-ide).
 */
export function parseLimitFeature(env: Envelope): RelayLimitFeatureMsg | null {
  const msgType = MSG.LimitFeature;
  const lf = env.limitFeature();
  if (lf === null) return dropField("slot-null", msgType, { slot: "limit_feature" });

  const isin = lf.isin() ?? "";
  const exchange = lf.exchange() ?? "";
  if (!isValidIsin(isin)) return dropField("bad-isin", msgType, { isin });
  if (!isValidExchange(exchange)) return dropField("bad-exchange", msgType, { isin, exchange });

  const scratch = new MemberDelta();
  const members = (
    len: number,
    at: (i: number, o: MemberDelta) => MemberDelta | null,
  ): RelayLimitFeatureMember[] => {
    const n = takeCount(len, MAX_LIMIT_FEATURE_MEMBERS, "상한가 특징 창구");
    const out: RelayLimitFeatureMember[] = [];
    for (let i = 0; i < n; i += 1) {
      const m = at(i, scratch);
      if (m === null) continue;
      out.push({
        memberNo: m.memberNo() ?? "",
        dQty: toNum(m.dQty(), "limit_feature.d_qty"),
        dValue: toNum(m.dValue(), "limit_feature.d_value"),
        shareBp: m.shareBp(),
      });
    }
    return out;
  };

  return {
    t: "limit.feature",
    i: isin,
    x: exchange,
    gwTimeMs: toNum(lf.gwTimeMs(), "limit_feature.gw_time_ms"),
    featureSchema: lf.featureSchema(),
    upperPx: lf.upperPx(),
    lastPx: lf.lastPx(),
    rateBp: lf.rateBp(),
    basePx: lf.basePx(),
    qQty: toNum(lf.qQty(), "limit_feature.q_qty"),
    qKrw: toNum(lf.qKrw(), "limit_feature.q_krw"),
    wallKrwVisible: toNum(lf.wallKrwVisible(), "limit_feature.wall_krw_visible"),
    wallQtyHidden: toNum(lf.wallQtyHidden(), "limit_feature.wall_qty_hidden"),
    wallTruncated: lf.wallTruncated(),
    sellLed10s: toNum(lf.sellLed10s(), "limit_feature.sell_led_10s"),
    buyLed10s: toNum(lf.buyLed10s(), "limit_feature.buy_led_10s"),
    cancel10s: toNum(lf.cancel10s(), "limit_feature.cancel_10s"),
    new10s: toNum(lf.new10s(), "limit_feature.new_10s"),
    auctionFill10s: toNum(lf.auctionFill10s(), "limit_feature.auction_fill_10s"),
    drainS: lf.drainS(),
    lockState: lf.lockState(),
    lockElapsedS: lf.lockElapsedS(),
    burstUpperLimit: lf.burstUpperLimit(),
    auction: lf.auction(),
    // 매수 · 매도가 scratch 하나를 나눠 쓴다 — 원소는 읽는 즉시 평범한 객체로 복사되므로 안전하다.
    memberBuy: members(lf.memberBuyLength(), (i, o) => lf.memberBuy(i, o)),
    memberSell: members(lf.memberSellLength(), (i, o) => lf.memberSell(i, o)),
    memberDeltaPartial: lf.memberDeltaPartial(),
    modelState: lf.modelState(),
    modelSchemaVersion: lf.modelSchemaVersion(),
    pBreakBp: lf.pBreakBp(),
    pHorizonS: lf.pHorizonS(),
    lockSellKrw: toNum(lf.lockSellKrw(), "limit_feature.lock_sell_krw"),
    lockCancelKrw: toNum(lf.lockCancelKrw(), "limit_feature.lock_cancel_krw"),
  };
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
 * 주문유형 → 와이어 1자 ("N"=신규, "M"=정정, "C"=취소).
 *
 * 정정("M")은 Phase 18 D-21 에서 열렸다 — Phase 15 D-21 이 여기서 막아 두었던 것을 푼다.
 * 세 값 밖은 여전히 던진다. 타입(`OrderType`)이 1차 방어이고 이 런타임 검사가 2차다 —
 * 입력이 wss JSON 이라 타입만으로는 부족하다.
 */
export function toWireOrderType(orderType: OrderType): "N" | "M" | "C" {
  if (orderType !== "N" && orderType !== "M" && orderType !== "C") {
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

/** `buildDirectOrderReq` 입력. 전부 이미 계약 타입으로 좁혀진 값이다. */
export type DirectOrderInput = {
  /** 12자 ISIN. 단축코드를 산술 유도하지 않는다 (D-28) — server 가 `stocks.isin` 에서 채운다. */
  isin: string;
  accountNo: string;
  exchange: RelayExchange;
  market: OrderMarket;
  side: OrderSide;
  orderType: OrderType;
  /** `orderType:"C"`/`"M"` 일 때 필수. 신규는 생략하거나 빈 문자열. */
  orgOrderNo?: string;
  /** 주문수량. 취소는 미체결 잔량이며 **0 은 즉시 거부**다 (Pitfall 7). */
  qty: number;
  /**
   * 주문가(원). `0` 은 두 갈래만 허용된다 — 신규의 `krxSession` G2/G3 (Phase 18 D-23), 그리고
   * 취소(`orderType:"C"`) — 취소 가격은 원주문 가격의 사본이라 시간외종가 원주문이면 0 이다 (CR-01).
   */
  price: number;
  /**
   * 예약구간 조각 수 (Phase 18 D-22). 부재·0·1 은 **슬롯을 싣지 않는다**(부재 = 서버 기본값 1).
   * 1..64 범위 정책은 zod 한 곳이 정본이다 — 여기서는 정수·표현 범위만 본다.
   */
  pieceCount?: number;
  /** 시간외종가 세션 (Phase 18 D-23). 부재·`""` 는 **슬롯을 싣지 않는다**(서버 자동 판정). */
  krxSession?: RelayKrxSession | "";
};

/**
 * 시간외종가 세션 → 와이어 문자열. `toWireSide` 계열과 같은 **화이트리스트** 규율이다.
 *
 * `""`/부재는 `null`(= 슬롯 미송신)로 돌려준다. 그 밖의 값은 던진다 — 게이트웨이가 브로커 전에
 * 거부한다는 사실에 기대지 않는다(T-18-05). 오타 하나가 다른 세션으로 읽히는 경로를 여기서 끊는다.
 */
export function toWireKrxSession(krxSession: RelayKrxSession | "" | undefined): "G2" | "G3" | null {
  if (krxSession === undefined || krxSession === "") return null;
  if (krxSession !== "G2" && krxSession !== "G3") {
    throw new OrderBuildError("BAD_KRX_SESSION", `알 수 없는 시간외종가 세션: ${String(krxSession)}`);
  }
  return krxSession;
}

/**
 * 직접 주문 (MsgType 2). 신규("N")·정정("M")·취소("C") 셋이다 (D-21 — 정정은 Phase 18 에서 열림).
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
  const krxSession = toWireKrxSession(req.krxSession);

  if (!Number.isInteger(req.qty) || req.qty <= 0) {
    // 취소수량 0 을 전량취소로 오해하는 것이 이 phase 에서 가장 흔한 오주문 경로다.
    throw new OrderBuildError("BAD_QTY", "주문수량은 1 이상의 정수여야 합니다 (0 은 즉시 거부)");
  }
  // 가격 0 은 **두 갈래**로만 연다. 조립기는 모든 호출 경로의 마지막 관문이라 0 을 무조건 열지 않는다
  // — 무조건 `>= 0` 으로 열면 가격 0 인 지정가가 게이트웨이까지 가서 거부 왕복 5초를 태운다.
  //   ① 시간외종가(G2/G3) 서버 결정가 (Phase 18 D-23).
  //   ② 취소("C") — 취소 가격은 주문 조건이 아니라 원주문 가격의 사본이고, 게이트웨이는 취소를
  //      가격으로 판정하지 않는다. 시간외종가 `close_price_mode="zero"` 원주문은 가격 0 이다 (CR-01).
  // 정정("M")·세션 없는 신규는 여전히 1 이상이다. 음수·비정수는 어느 갈래에서도 거부다 — 반올림·절사하지 않는다.
  const priceFloor = orderType === "C" || krxSession !== null ? 0 : 1;
  if (!Number.isInteger(req.price) || req.price < priceFloor) {
    throw new OrderBuildError(
      "BAD_PRICE",
      orderType === "C"
        ? "취소 주문가격은 0 이상의 정수여야 합니다"
        : krxSession === null
          ? "주문가격은 1 이상의 정수여야 합니다"
          : "시간외종가 주문가격은 0 이상의 정수여야 합니다",
    );
  }
  // 조각 수: 비정수·음수는 거부(반올림 금지). 1 이하는 부재와 같다 — 슬롯을 싣지 않는다.
  let pieceCount: number | null = null;
  if (req.pieceCount !== undefined) {
    if (!Number.isInteger(req.pieceCount) || req.pieceCount < 0) {
      throw new OrderBuildError("BAD_PIECE_COUNT", `조각 수는 0 이상의 정수여야 합니다: ${req.pieceCount}`);
    }
    if (req.pieceCount > 1) pieceCount = toWireUint(req.pieceCount, "piece_count");
  }
  if (req.qty > MAX_INT32 || req.price > MAX_INT32) {
    // 한도가 아니라 int 표현 범위다 — 넘기면 조용히 감싸서 전혀 다른 주문이 나간다.
    throw new OrderBuildError("INT32_OVERFLOW", "주문가격·수량이 int 표현 범위를 넘었습니다");
  }

  const orgOrderNo = req.orgOrderNo ?? "";
  // 정정·취소는 원주문번호로 대상을 가리킨다. 빈 값이면 게이트웨이가 무엇을 고칠지/지울지
  // 모른다 — 보내지 않는다. 스키마가 이미 막지만 조립기가 **마지막 관문**이다.
  if ((orderType === "C" || orderType === "M") && orgOrderNo === "") {
    throw new OrderBuildError(
      "ORG_ORDER_NO_REQUIRED",
      orderType === "M" ? "정정 주문에는 원주문번호가 필요합니다" : "취소 주문에는 원주문번호가 필요합니다",
    );
  }

  const b = new flatbuffers.Builder(256);
  // 문자열은 테이블을 **열기 전에** 만든다 — FlatBuffers 는 테이블 조립 중 중첩 객체 생성을
  // 허용하지 않는다. 아래 전략 조립부와 같은 규율이다.
  //
  // ★ 위치 인자 `createDirectOrderReq` 를 쓰지 않는다 (T-16-05 와 같은 이유, 17-01 에서 전환).
  //   17-01 재동기화로 fbs 말미에 `piece_count`·`krx_session` 2슬롯이 붙자 그 생성 함수의
  //   인자 수가 11 → 13 으로 늘어 호출부가 깨졌다. 타입이 우연히 맞는 조합이었다면 **조용히**
  //   한 칸 밀린 채 실계좌 발주가 나갔을 것이다. 이름 있는 `addXxx` 는 그 실수를 구조적으로
  //   막고, 말미 append 에 대해 호출부를 불변으로 만든다.
  const stockCodeOffset = b.createString(req.isin); // `stock_code` 는 **ISIN 12자**다 (fbs 주석) — 단축코드가 아니다.
  const accountNoOffset = b.createString(req.accountNo);
  const sideOffset = b.createString(side);
  const orderConditionOffset = b.createString(ORDER_CONDITION);
  const marketOffset = b.createString(market);
  const exchangeOffset = b.createString(req.exchange);
  const orderTypeOffset = b.createString(orderType);
  // 신규는 빈 문자열이 계약이다. 생략하면 슬롯이 비어 구 서버가 다르게 읽을 수 있다.
  const orgOrderNoOffset = b.createString(orgOrderNo);
  // `krx_session` 도 테이블을 열기 **전에** 만든다. 값이 없으면 문자열 자체를 만들지 않는다 —
  // 빈 문자열을 버퍼에 남기면 슬롯을 안 실어도 바이트가 달라진다.
  const krxSessionOffset = krxSession === null ? null : b.createString(krxSession);

  DirectOrderReq.startDirectOrderReq(b);
  DirectOrderReq.addStockCode(b, stockCodeOffset);
  DirectOrderReq.addAccountNo(b, accountNoOffset);
  DirectOrderReq.addSide(b, sideOffset);
  DirectOrderReq.addPrice(b, req.price);
  DirectOrderReq.addQuantity(b, req.qty);
  DirectOrderReq.addOrderCondition(b, orderConditionOffset);
  DirectOrderReq.addMarket(b, marketOffset);
  DirectOrderReq.addExchange(b, exchangeOffset);
  DirectOrderReq.addOrderType(b, orderTypeOffset);
  DirectOrderReq.addOrgOrderNo(b, orgOrderNoOffset);
  // `piece_count`(24) · `krx_session`(26): **부재가 곧 기본값이다** (Phase 18 D-22/D-23) — 값이
  // 없을 때 0/"" 을 명시적으로 실으면 구 서버 호환과 기존 수동주문의 「바이트 무변경」이 깨진다.
  // 그래서 값이 있을 때만 호출하고, 없으면 호출 자체를 건너뛴다.
  if (pieceCount !== null) {
    DirectOrderReq.addPieceCount(b, pieceCount);
  }
  if (krxSessionOffset !== null) {
    DirectOrderReq.addKrxSession(b, krxSessionOffset);
  }
  const order = DirectOrderReq.endDirectOrderReq(b);

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
// 하나다 — `SetLimitChaser` 는 deprecated 8슬롯을 포함한 68슬롯 테이블(`startObject(68)`)이라 인자가 한 칸만
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
 * `buy3_schema` 클라 고정값. 신 클라 판정 정본(gh-trade D-24) — 입력으로 받지 않는다.
 * 브라우저가 0 을 보내 구 클라 경로(「선매수만 켠 등록」 + `buy_watch_side`)를 여는 것을
 * 구조적으로 막는다 (T-24-01).
 */
export const LC_FIXED_BUY3_SCHEMA = 1;
/**
 * `post_buy_auto` 를 싣는 요청만 `buy3_schema` 2 (gh-trade dcaa78b1 · quick-260929-vzy).
 * 서버는 2 이상일 때만 `post_buy_auto` 를 읽는다. 1 이면 서버 값을 유지한다(구 탭 재제출이
 * 자동을 지우지 않는다). 브라우저가 고르는 값이 아니다 — `cfg.postBuyAuto` 존재로만 파생된다.
 */
export const LC_POST_BUY_AUTO_BUY3_SCHEMA = 2;
/**
 * `extra_buy_burst_release` 를 싣는 요청만 `buy3_schema` 3 (gh-trade 3dabd6ff · 26b3493e · 합의 2026-10-03 ·
 * quick-261003-rc4). 서버는 3 이상일 때만 `extra_buy_burst_release` 를 읽고, 그 미만은 서버 값을 유지한다(구 탭 ·
 * 구 클라 재제출이 체크를 지우지 않는다). 3 은 `post_buy_auto` 도 읽히는 값(≥ 2)이라 **`postBuyAuto` 와
 * `extraBuyBurstRelease` 가 둘 다 있을 때만** 파생된다 — 자동 없이 3 을 보내면 서버가 자동을 부재 = false 로
 * 읽어 조용히 지운다(P-1 단조성).
 */
export const LC_BURST_RELEASE_BUY3_SCHEMA = 3;
/**
 * 자동매도 요청 4필드(`auto_sell_enabled` · `auto_sell_start_cond` · `auto_sell_ratio_pct` · `auto_sell_method`)를
 * 싣는 클라 — `buy3_schema` 4 (gh-trade §9-3 ④ schema 4 가드 · 2404509b · Phase 27). 서버는 4 이상일 때만 그 4필드를
 * 읽고, 그 미만은 그 키의 저장값을 유지한다(구 클라 「전부 OFF」 재제출이 자동매도만 켠 등록을 지우지 않게).
 * 4 는 `post_buy_auto`(≥ 2) · `extra_buy_burst_release`(≥ 3)도 읽히는 값이라 **그 둘과 4필드가 모두 있을 때만**
 * 파생된다(P-1 단조성).
 */
export const LC_AUTO_SELL_BUY3_SCHEMA = 4;
/**
 * `extra_buy_auto`(추가매수 ☐자동 · vtable 156)를 싣는 클라 — `buy3_schema` 5 (gh-trade 8c7d4c5c · quick-261010-ub8 ·
 * quick-261011-0yb). 서버는 5 이상일 때만 `extra_buy_auto` 를 읽고, 그 미만은 그 키의 저장값을 유지한다(구 탭 · 구 클라
 * 재제출이 C# 에서 켠 ☐자동을 지우지 않는다). 5 는 `post_buy_auto`(≥ 2) · `extra_buy_burst_release`(≥ 3) · 자동매도
 * 4필드(≥ 4)도 읽히는 값이라 **그 모두와 `extraBuyAuto` 가 있을 때만** 파생된다(P-1 단조성 — 하나라도 빠진 채 5 를
 * 보내면 서버가 그 필드를 부재 기본값으로 읽어 사람이 켠 설정을 지운다).
 */
export const LC_EXTRA_BUY_AUTO_BUY3_SCHEMA = 5;

/** 자동매도 요청 4필드 — relay `LcSetCfg` 에서는 선택(구 탭 관용), shared 입력 계약에서는 필수. */
type LcAutoSellReqKey = "autoSellEnabled" | "autoSellStartCond" | "autoSellRatioPct" | "autoSellMethod";

/**
 * relay 가 조립하는 cfg — `postBuyAuto` · `extraBuyBurstRelease` · 자동매도 4필드(구 탭 관용 ·
 * quick-260929-vzy · quick-261003-rc4 · Phase 27) · `extraBuyAuto`(quick-261011-0yb)만 선택. 존재 여부가 `buy3_schema`(1~5)를 정한다. shared 계약
 * `RelayLimitChaserInput` 에서는 전부 필수다(새 탭이 빠뜨리면 컴파일이 막는다) — 「shared 는 새 클라 계약, relay
 * 와이어는 구 탭 관용」 규약.
 */
export type LcSetCfg = Omit<
  RelayLimitChaserInput,
  "postBuyAuto" | "extraBuyBurstRelease" | LcAutoSellReqKey | "extraBuyAuto"
> & {
  postBuyAuto?: boolean;
  extraBuyBurstRelease?: boolean;
  extraBuyAuto?: boolean;
  autoSellEnabled?: boolean;
  autoSellStartCond?: number;
  autoSellRatioPct?: number;
  autoSellMethod?: number;
};

/**
 * `buy3_schema` 파생 — **필드 존재로만**(값 무관) 정한다. 브라우저가 고르는 값이 아니다(T-24-01 확장 · T-rc4-01).
 *   - `postBuyAuto` 없음 → 1 (`extraBuyBurstRelease` · 자동매도 4필드만 있어도 1 — 단조성 P-1 · 조립기가 경고를 남긴다)
 *   - `postBuyAuto` 있음 · `extraBuyBurstRelease` 없음 → 2
 *   - 둘 다 있음 · 자동매도 4필드 중 하나라도 없음 → 3
 *   - 둘 다 있음 · 자동매도 4필드 모두 있음 · `extraBuyAuto` 없음 → 4
 *   - 위 여섯 모두 + `extraBuyAuto` 있음 → 5 (`extraBuyAuto` 만 있고 앞 조건 미달이면 낮은 schema · 조립기 경고)
 */
export function lcBuy3SchemaOf(
  cfg: Pick<LcSetCfg, "postBuyAuto" | "extraBuyBurstRelease" | LcAutoSellReqKey | "extraBuyAuto">,
): number {
  if (cfg.postBuyAuto === undefined) return LC_FIXED_BUY3_SCHEMA;
  if (cfg.extraBuyBurstRelease === undefined) return LC_POST_BUY_AUTO_BUY3_SCHEMA;
  if (!hasAllAutoSellReqFields(cfg)) return LC_BURST_RELEASE_BUY3_SCHEMA;
  if (cfg.extraBuyAuto === undefined) return LC_AUTO_SELL_BUY3_SCHEMA;
  return LC_EXTRA_BUY_AUTO_BUY3_SCHEMA;
}

function hasAllAutoSellReqFields(cfg: Pick<LcSetCfg, LcAutoSellReqKey>): boolean {
  return (
    cfg.autoSellEnabled !== undefined &&
    cfg.autoSellStartCond !== undefined &&
    cfg.autoSellRatioPct !== undefined &&
    cfg.autoSellMethod !== undefined
  );
}

function hasAnyAutoSellReqField(cfg: Pick<LcSetCfg, LcAutoSellReqKey>): boolean {
  return (
    cfg.autoSellEnabled !== undefined ||
    cfg.autoSellStartCond !== undefined ||
    cfg.autoSellRatioPct !== undefined ||
    cfg.autoSellMethod !== undefined
  );
}

/**
 * 상따 설정 (MsgType 10). 응답은 60 에코다.
 *
 * ★ `market` 은 **호출부가 채워 넣는다** (WR-03 / D-28). `RelayLimitChaserInput` 에서 뺐기
 *   때문이다 — 브라우저가 시장을 실어 보내지 못하게 스키마에서 지웠고, `fanout.ts` 의
 *   `lc.set` 분기가 `symbols.lookup(cfg.isin)` 으로 푼 값을 여기로 넘긴다. 조립기가 기본값을
 *   두지 않는 것이 핵심이다: 기본값 `"K"` 를 두는 순간 코스닥 전략이 코스피로 등록된다.
 *
 * **클라 입력 28 + Phase 24 C→S 12 + relay 해석 1(`market`) + 클라 고정 4(sweep 3 ·
 * `buy3_schema`) = 45 필드 + 선택 6(`post_buy_auto` · `extra_buy_burst_release` · 자동매도 요청 4 — 파생 스키마가
 * 허락할 때만) = 최대 51 필드만** 채운다. 나머지는 건드리지 않는다:
 *   - **`buy_watch_side`** — **싣지 않는다**. 새 서버(buy3)는 감시대상을 읽지 않고, 슬롯이 있으면
 *     구 클라 흉내가 된다. 입력 계약(`RelayLimitChaserInput`)에서도 빠졌다(24-03).
 *   - **S→C 전용 11필드** (`sell_order_qty` · `sell_qty_track_baseline` · `sell_entry_latched` ·
 *     `cancel_qty_track_baseline` · `cancel_entry_latched` · `extra_buy_abandoned` ·
 *     `extra_buy_abandon_qty` · `post_buy_trigger_qty` · `post_buy_reentry_left` · `post_buy_phase` ·
 *     `post_buy_unlock_qty`) + 자동매도 에코 4필드(`auto_sell_state` · `auto_sell_sold_qty` ·
 *     `auto_sell_basis` · `auto_sell_basis_price` — vtable 148~154 · Phase 27)는 **싣지 않는다** — 서버가
 *     계산해 에코로만 내려주는 값이다. 실어 보내면
 *     서버는 무시하지만, 보내는 쪽 코드에 남아 있는 것만으로 "왕복하는 값"이라는 착각을
 *     만들고 에코-폼 비교가 오염된다 (Pitfall 6).
 *   - **deprecated 8슬롯** — flatc 가 접근자를 만들지 않는다. 존재 자체를 모른 채로 둔다.
 *
 * `buy3_schema` 는 입력 타입에 아예 없다. 1(`LC_FIXED_BUY3_SCHEMA`) · 2(`LC_POST_BUY_AUTO_BUY3_SCHEMA`) ·
 * 3(`LC_BURST_RELEASE_BUY3_SCHEMA`) · 4(`LC_AUTO_SELL_BUY3_SCHEMA`) · 5(`LC_EXTRA_BUY_AUTO_BUY3_SCHEMA`)이고
 * **`postBuyAuto` · `extraBuyBurstRelease` · 자동매도 4필드 · `extraBuyAuto` 존재로만 파생**된다(3 은 앞 둘 · 4 는 여섯
 * 모두 · 5 는 일곱 모두 · `lcBuy3SchemaOf` · gh-trade D-24 · dcaa78b1 · 26b3493e · 2404509b · 8c7d4c5c ·
 * quick-260929-vzy · quick-261003-rc4 · Phase 27 · quick-261011-0yb).
 * `extraBuyAuto` 가 있는데 schema 가 5 미만이면 그 필드를 싣지 않고(서버 값 유지) 경고를 남긴다.
 * `extraBuyBurstRelease` 만 있고 `postBuyAuto` 가 없으면 1 로 내리고 그 필드를 싣지 않으며 경고를 남긴다(PC-7).
 * 자동매도 4필드가 (일부라도) 있는데 schema 가 4 가 아니면 그 4필드를 싣지 않고(서버 값 유지) 경고를 남긴다.
 *
 * 고정 3(`sweepRecalcEnabled`/`sweepMinCount`/`sweepMinRate`)은 입력값과 무관하게 **relay 가
 * 못박는다**. WinForms 가 한 번도 다른 값을 보낸 적이 없어 서버의 Case3 경로가 실사용으로
 * 검증된 적이 없기 때문이다 — 브라우저가 열 수 있게 두면 미검증 발주 경로가 열린다.
 * 입력이 고정값과 다르면 조용히 덮지 않고 경고를 남긴다 (PC-7).
 *
 * @throws {OrderBuildError} ISIN·계좌번호·거래소 형식 위반, 단일문자 열거 밖 값, 수치 표현 범위 초과
 */
export function buildSetLimitChaserReq(
  cfg: LcSetCfg & { market: OrderMarket },
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

  const buy3Schema = lcBuy3SchemaOf(cfg);
  // `<` — schema 4(자동매도 동반)도 버스트 해제를 싣는다. `!==` 로 두면 schema 4 마다 거짓 경고가 남는다(27-01 Task 3).
  if (cfg.extraBuyBurstRelease !== undefined && buy3Schema < LC_BURST_RELEASE_BUY3_SCHEMA) {
    // P-1 — 3 은 post_buy_auto 동반일 때만. 자동 없이 3 을 보내면 서버가 자동을 부재 = false 로 지운다.
    // 거부(소켓 종료) 대신 안전 폴백: schema 1 · 버스트 필드 미적재(서버 값 유지).
    logger.warn(
      { isin, got: { extraBuyBurstRelease: cfg.extraBuyBurstRelease } },
      "[DMA] extraBuyBurstRelease 가 postBuyAuto 없이 왔다 — buy3_schema 1 로 내리고 미적재",
    );
  }
  // `<` — schema 5(☐추가매수 자동 동반)도 자동매도 4필드를 싣는다. `!==` 로 두면 schema 5 마다 거짓 경고가 남는다
  // (버스트 경고가 27-01 Task 3 에서 `<` 가 된 것과 같은 이유 · quick-261011-0yb).
  if (hasAnyAutoSellReqField(cfg) && buy3Schema < LC_AUTO_SELL_BUY3_SCHEMA) {
    // P-1 — 4 는 postBuyAuto · extraBuyBurstRelease 동반 + 4필드 모두일 때만. 하나라도 빠지면 낮은 schema 로 내리고
    // 자동매도 4필드는 싣지 않는다(서버가 저장값 유지). 값 · 계좌는 남기지 않는다 — 결손의 모양만.
    logger.warn(
      { isin, buy3Schema },
      "[DMA] 자동매도 요청 필드가 schema 4 조건을 못 채움 — 낮은 buy3_schema 로 내리고 자동매도 4필드 미적재",
    );
  }
  if (cfg.extraBuyAuto !== undefined && buy3Schema < LC_EXTRA_BUY_AUTO_BUY3_SCHEMA) {
    // P-1 — 5 는 postBuyAuto · extraBuyBurstRelease · 자동매도 4필드 동반일 때만. 하나라도 빠지면 낮은 schema 로 내리고
    // extra_buy_auto 는 싣지 않는다(서버가 저장값 유지). 값 · 계좌는 남기지 않는다 — 결손의 모양만.
    logger.warn(
      { isin, buy3Schema },
      "[DMA] extraBuyAuto 가 schema 5 조건을 못 채움 — 낮은 buy3_schema 로 내리고 extra_buy_auto 미적재",
    );
  }

  const b = new flatbuffers.Builder(512);
  // 문자열 5종을 테이블 열기 전에 만든다.
  const isinOff = b.createString(isin);
  const accountNoOff = b.createString(accountNo);
  const marketOff = b.createString(market);
  const crudOff = b.createString(crud);
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
  // buy_watch_side — 싣지 않는다(Phase 24 · buy3 서버는 읽지 않는다). 입력에서의 제거는 24-03.
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
  // cancel_entry_latched — S→C 전용.
  // buy_entry_latched — (deprecated) Phase 24 D-25 로 봉인. 접근자·빌더 없음.
  // === Phase 24 매수 3종 (gh-trade D-17 · D-24) ===
  // buy3_schema — 브라우저가 고를 수 없다(T-24-01 확장). `postBuyAuto` · `extraBuyBurstRelease` · 자동매도 4필드 ·
  // `extraBuyAuto` 존재로만 1/2/3/4/5 를 파생한다.
  SetLimitChaser.addBuy3Schema(b, buy3Schema);
  SetLimitChaser.addPreBuyEnabled(b, cfg.preBuyEnabled);
  SetLimitChaser.addExtraBuyEnabled(b, cfg.extraBuyEnabled);
  SetLimitChaser.addExtraBuyMinQty(b, toWireUint(cfg.extraBuyMinQty, "extraBuyMinQty"));
  SetLimitChaser.addExtraBuyMaxQty(b, toWireUint(cfg.extraBuyMaxQty, "extraBuyMaxQty"));
  SetLimitChaser.addExtraBuyOrderAmount(b, toWireUint(cfg.extraBuyOrderAmount, "extraBuyOrderAmount"));
  SetLimitChaser.addExtraBuyOrderQty(b, toWireUint(cfg.extraBuyOrderQty, "extraBuyOrderQty"));
  // extra_buy_abandoned — S→C 전용. 싣지 않는다.
  SetLimitChaser.addPostBuyEnabled(b, cfg.postBuyEnabled);
  SetLimitChaser.addPostBuyReboundPct(b, toWireUByte(cfg.postBuyReboundPct, "postBuyReboundPct"));
  SetLimitChaser.addPostBuyFloorQty(b, toWireUint(cfg.postBuyFloorQty, "postBuyFloorQty"));
  SetLimitChaser.addPostBuyReentry(b, toWireUByte(cfg.postBuyReentry, "postBuyReentry"));
  SetLimitChaser.addPostBuyOrderAmount(b, toWireUint(cfg.postBuyOrderAmount, "postBuyOrderAmount"));
  SetLimitChaser.addPostBuyOrderQty(b, toWireUint(cfg.postBuyOrderQty, "postBuyOrderQty"));
  // post_buy_trigger_qty — S→C 전용. 싣지 않는다.
  // post_buy_reentry_left — S→C 전용. 싣지 않는다.
  // post_buy_phase — S→C 전용. 싣지 않는다.
  // extra_buy_abandon_qty — S→C 전용(quick-260930-fi4). 싣지 않는다.
  // post_buy_unlock_qty — S→C 전용(quick-261002-fim). 싣지 않는다.
  // post_buy_auto — 양방향(quick-260929-vzy). 입력에 있을 때만 싣는다(= buy3_schema 2). false 는
  // FlatBuffers 기본값이라 버퍼에 쓰이지 않지만, 서버는 schema 2 에서 부재를 false 로 읽으므로 그걸로 된다.
  if (buy3Schema >= LC_POST_BUY_AUTO_BUY3_SCHEMA && cfg.postBuyAuto !== undefined) {
    SetLimitChaser.addPostBuyAuto(b, cfg.postBuyAuto);
  }
  // extra_buy_burst_release — 양방향(quick-261003-rc4 · vtable 138). schema 3 이상일 때 싣는다(`>=` — schema 4 에서도
  // 실어야 서버가 ☐버스트 시 해제를 부재 = false 로 지우지 않는다 · Phase 27 RESEARCH Pitfall 1). false 는 기본값이라
  // 버퍼에 쓰이지 않지만, 서버는 schema ≥ 3 에서 부재를 false 로 읽으므로 그걸로 된다.
  if (buy3Schema >= LC_BURST_RELEASE_BUY3_SCHEMA && cfg.extraBuyBurstRelease !== undefined) {
    SetLimitChaser.addExtraBuyBurstRelease(b, cfg.extraBuyBurstRelease);
  }
  // 자동매도 요청 4필드 — 양방향(Phase 27 · vtable 140~146). schema 4 일 때만 싣는다. false/0 은 기본값이라 버퍼에
  // 쓰이지 않지만 서버는 schema 4 에서 부재를 기본값으로 읽는다(`post_buy_auto` 와 같은 논리).
  const { autoSellEnabled, autoSellStartCond, autoSellRatioPct, autoSellMethod } = cfg;
  if (
    buy3Schema >= LC_AUTO_SELL_BUY3_SCHEMA &&
    autoSellEnabled !== undefined &&
    autoSellStartCond !== undefined &&
    autoSellRatioPct !== undefined &&
    autoSellMethod !== undefined
  ) {
    SetLimitChaser.addAutoSellEnabled(b, autoSellEnabled);
    SetLimitChaser.addAutoSellStartCond(b, toWireUByte(autoSellStartCond, "autoSellStartCond"));
    SetLimitChaser.addAutoSellRatioPct(b, toWireUByte(autoSellRatioPct, "autoSellRatioPct"));
    SetLimitChaser.addAutoSellMethod(b, toWireUByte(autoSellMethod, "autoSellMethod"));
  }
  // auto_sell_state · auto_sell_sold_qty · auto_sell_basis · auto_sell_basis_price — S→C 전용(vtable 148~154). 싣지 않는다.
  // extra_buy_auto — 양방향(추가매수 ☐자동 · vtable 156 · quick-261011-0yb). schema 5 일 때만 싣는다. false 는 기본값이라
  // 버퍼에 쓰이지 않지만 서버는 schema 5 에서 부재를 false 로 읽으므로 그걸로 된다.
  if (buy3Schema >= LC_EXTRA_BUY_AUTO_BUY3_SCHEMA && cfg.extraBuyAuto !== undefined) {
    SetLimitChaser.addExtraBuyAuto(b, cfg.extraBuyAuto);
  }
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

  if (!isValidExchange(cfg.exchange)) {
    throw new OrderBuildError("BAD_EXCHANGE", `알 수 없는 거래소: ${String(cfg.exchange)}`);
  }

  const b = new flatbuffers.Builder(128);
  const accountNoOff = b.createString(accountNo);
  const priceTypeOff = b.createString(VI_PRICE_TYPE);
  const exchangeOff = b.createString(cfg.exchange);

  SetVITrigger.startSetVITrigger(b);
  SetVITrigger.addAccountNo(b, accountNoOff);
  // number -> bigint 승격의 유일 지점. 정수 검사를 통과했으므로 여기서 던지지 않는다.
  SetVITrigger.addOrderAmountKrw(b, BigInt(cfg.orderAmountKrw));
  SetVITrigger.addCheckRate(b, cfg.checkRate);
  SetVITrigger.addPriceType(b, priceTypeOff);
  SetVITrigger.addRun(b, cfg.run);
  // VI 전략은 세션당 **거래소별 1건**이다 (D-06). 받아 두고 싣지 않으면 「값이 왕복한다」는
  // 착각이 생기고, 호출부가 NXT 를 지정해도 조용히 KRX 슬롯을 덮어쓴다.
  SetVITrigger.addExchange(b, exchangeOff);
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
 * 래치 점등 요청의 msg_type — **둘뿐**이다 (36/37). 매수 진입 래치는 Phase 24 에서 폐기됐다(번호 봉인).
 *
 * 타입으로 좁히는 이유: 본문 슬롯(`get_strategy_req`)을 공유하므로 엉뚱한 msg_type 을 넣어도
 * 조립은 성공한다. 잘못 나간 프레임의 대가가 「남의 전략이 무장된다」라서 컴파일 타임에 막는다.
 */
export type ArmLatchMsgType =
  | typeof MSG.ArmSellLatchReq
  | typeof MSG.ArmCancelLatchReq;

/**
 * 상따 진입 확인 래치 수동 점등 (MsgType 36/37, 17 D-04).
 *
 * 두 요청은 **본문 슬롯을 공유한다** — 서버가 전용 요청 테이블을 만들지 않고
 * `get_strategy_req{key}` 를 재사용했다(`GetMemberStatsReq(35)` 가 `get_quote_req` 를
 * 재사용한 선례). 응답도 전용 번호 없이 **기존 `SetLimitChaserResp(60)` 에코**로 오고,
 * 실패는 `ServerMessage(54)` 한글 사유로 온다 — 별도 ack 프레임이 없다.
 *
 * ⚠️ **`buildBareRequest` 를 쓰지 않는다.** 21 과 달리 36/37 은 이 슬롯을 **실제로 읽는다**.
 *    비워 보내면 서버가 「등록된 상따 전략이 없습니다」로 거부한다 (Pitfall 2). 요청이 나간
 *    것은 맞으므로 msg_type 만 세는 검증은 이 실패를 잡지 못한다.
 *
 * ⚠️ **요청은 토글이다.** 서버가 현재 래치값을 보고 켜거나 끈다 — 목표 상태를 지정하지 않는다.
 *
 * ★ 문자열은 테이블 빌더를 **열기 전에** 만든다. FlatBuffers 는 테이블 조립 중 중첩 생성을
 *   금지한다(Pitfall 1·2). 이름 있는 `start`/`add`/`end` 를 쓰는 것도 규율이다 — 위치 인자
 *   `create*` 는 fbs 말미 append 한 번에 인자가 한 칸씩 밀린다 (T-16-05).
 *
 * @throws {OrderBuildError} `key` 가 빈 문자열일 때 (C# `SendArmSellLatch` 동형 — 송신 취소)
 */
export function buildArmLatchReq(msgType: ArmLatchMsgType, key: string): Uint8Array {
  if (key === "") {
    throw new OrderBuildError(
      "STRATEGY_KEY_REQUIRED",
      "래치 점등에는 전략 키가 필요합니다 (빈 키는 서버가 「등록된 상따 전략이 없습니다」로 거부)",
    );
  }

  const b = new flatbuffers.Builder(128);
  const keyOff = b.createString(key);

  GetStrategyReq.startGetStrategyReq(b);
  GetStrategyReq.addKey(b, keyOff);
  const table = GetStrategyReq.endGetStrategyReq(b);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, msgType);
  Envelope.addGetStrategyReq(b, table);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/**
 * 본문 없는 요청 Envelope. 24/34 는 **요청 테이블 자체가 없어** `msg_type` 만 실어 보낸다.
 *
 * ⚠️ **21·36/37 에 쓰지 않는다** — 셋 다 `get_strategy_req` 슬롯을 실제로 읽는다
 *    (`buildGetVITriggerReq` 는 거래소를, `buildArmLatchReq` 는 전략 키를 싣는다).
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
 * VI 전략 조회 (MsgType 21, 17-05 / D-06). 응답은 61 이다.
 *
 * VI 전략은 서버가 **거래소별 1건**으로 관리하므로 조회도 거래소별이다. 거래소는 새 필드가
 * 아니라 `get_strategy_req.key` 슬롯의 **의미 확장**으로 실린다 — 서버
 * `Gateway::ProcessGetVITrigger` 가 그 문자열로 슬롯을 고르고, 빈 키·미상 값은 KRX 로 접는다
 * (`StockDMA.fbs:642-648`). 스키마도 vtable 도 바뀌지 않는다.
 *
 * ⚠️ **`buildBareRequest` 를 쓰지 않는다.** 비워 보내면 서버가 KRX 로 접으므로 NXT 슬롯은
 *    영원히 조회되지 않는다 — 그런데 msg_type 카운터는 정상으로 보인다 (36/37 이
 *    `buildArmLatchReq` 를 따로 두는 것과 같은 이유다).
 *
 * ★ 조립기에 **기본 거래소를 두지 않는다** — 호출부가 두 거래소를 명시로 순회한다.
 *
 * 전략이 없으면 서버는 **테이블 없는 빈 61** 을 보낸다(무응답 금지). 그 빈 응답에는 거래소가
 * 없으므로 Hub 가 **요청 거래소 FIFO** 로 귀속한다 (Pitfall 3).
 */
export function buildGetVITriggerReq(exchange: RelayExchange): Uint8Array {
  const b = new flatbuffers.Builder(128);
  // 문자열은 테이블을 열기 전에 만든다. 이름 있는 start/add/end 를 쓰는 것도 규율이다 (T-16-05).
  const keyOff = b.createString(exchange);

  GetStrategyReq.startGetStrategyReq(b);
  GetStrategyReq.addKey(b, keyOff);
  const table = GetStrategyReq.endGetStrategyReq(b);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.GetVITriggerReq);
  Envelope.addGetStrategyReq(b, table);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/** VI 주문 목록 조회 (MsgType 34). 응답 72 는 스냅샷이고 이후 73 이 편승 푸시된다. */
export function buildGetVIOrderListReq(): Uint8Array {
  return buildBareRequest(MSG.GetVIOrderListReq);
}

/**
 * 종목마스터 전량 조회 (MsgType 27, quick-260923-cqj). **요청 테이블이 없다 — 빈 Envelope**.
 *
 * 응답 57 은 **요청 연결에만** 분할 Notice 로 온다(24 와 같은 규약). 게이트웨이는 같은 연결의
 * 60초 안 재요청을 응답 없이 흡수하므로, 재시도 간격은 호출부(`GatewaySymbolMaster`)가 쥔다.
 */
export function buildGetSymbolMasterReq(): Uint8Array {
  return buildBareRequest(MSG.GetSymbolMasterReq);
}

/** `AutoSellCommandReq.action` 와이어 값 — `1` 바로시작(Start) · `2` 중지(Stop). 그 밖은 서버가 「action 불명」 으로 거부한다. */
export type AutoSellActionWire = 1 | 2;

/** `buildAutoSellCommandReq` 입력. 브라우저 `autosell.cmd` 의 `"start" | "stop"` 은 fanout 이 1/2 로 바꿔 넘긴다. */
export type AutoSellCommandInput = {
  isin: string;
  accountNo: string;
  exchange: RelayExchange;
  action: AutoSellActionWire;
};

/**
 * 자동매도 바로시작 / 중지 (MsgType 41 · Envelope 슬롯 86 · Phase 27 — gh-trade `limit-chaser.md` §9-3 「명령 41」).
 *
 * 응답 번호가 없다 — 성공은 그 키의 `SetLimitChaserResp(60)` 에코(상태 변화), 실패는 54 ERROR
 * source `"AutoSellCommand"` + isin · 계좌다. 그래서 호출부는 pending FIFO 에 넣지 않는다(`lc.arm` 선례).
 *
 * `isin` · `accountNo` 는 `buildSetLimitChaserReq` 와 **같은 폭으로 절단**한다 — 서버가 같은 `char[13]` 버퍼로
 * 전략 키를 만들므로, 다르게 자르면 그 키의 전략을 못 찾아 「등록된 상따 전략이 없습니다」 가 된다.
 *
 * ★ 문자열 3개는 테이블 빌더를 **열기 전에** 만든다 · 이름 있는 `start`/`add`/`end` 만 쓴다 (T-16-05).
 *
 * @throws {OrderBuildError} ISIN · 계좌번호 · 거래소 형식 위반 (문구에 계좌번호를 싣지 않는다 — T-16-45)
 * @throws {RangeError} `action` 이 1 · 2 가 아닐 때 — 서버 「action 불명」 까지 보내지 않는다
 */
export function buildAutoSellCommandReq(req: AutoSellCommandInput): Uint8Array {
  const isin = truncateToWire(req.isin, 12, "isin");
  const accountNo = truncateToWire(req.accountNo, MAX_ACCOUNT_NO_LEN, "accountNo");

  if (!isValidIsin(isin)) {
    throw new OrderBuildError("BAD_ISIN", `ISIN 형식 위반 (12자 필요, ${isin.length}자)`);
  }
  if (!isValidAccountNo(accountNo)) {
    throw new OrderBuildError("BAD_ACCOUNT_NO", "계좌번호 형식 위반");
  }
  if (!isValidExchange(req.exchange)) {
    throw new OrderBuildError("BAD_EXCHANGE", `알 수 없는 거래소: ${String(req.exchange)}`);
  }
  if (req.action !== 1 && req.action !== 2) {
    throw new RangeError(`자동매도 action 은 1(바로시작) · 2(중지)만 허용: ${String(req.action)}`);
  }

  const b = new flatbuffers.Builder(128);
  const isinOff = b.createString(isin);
  const accountNoOff = b.createString(accountNo);
  const exchangeOff = b.createString(req.exchange);

  AutoSellCommandReq.startAutoSellCommandReq(b);
  AutoSellCommandReq.addIsin(b, isinOff);
  AutoSellCommandReq.addAccountNo(b, accountNoOff);
  AutoSellCommandReq.addExchange(b, exchangeOff);
  AutoSellCommandReq.addAction(b, req.action);
  const table = AutoSellCommandReq.endAutoSellCommandReq(b);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.AutoSellCommandReq);
  Envelope.addAutoSellCommandReq(b, table);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/**
 * 사용자 설정 저장 (MsgType 42 · Envelope 슬롯 88 — 84 와 공유 · Phase 27 — gh-trade `limit-chaser.md` §9-3 「사용자 설정」).
 *
 * **11값 전체 교체**다(부분 갱신 아님). 서버는 범위 밖이 하나라도 있으면 요청 전체를 54 ERROR
 * source `"SetUserSettings"` 로 거부하고, 성공하면 같은 사용자 **전 세션**에 84 를 브로드캐스트한다 — relay 는
 * 성공을 지어내지 않는다(84 를 합성하지 않는다).
 *
 * `present` 는 **싣지 않는다** — 84 전용 필드이고 서버가 42 요청값을 읽지 않는다. 범위 정책(1~60 초 등)은
 * `USER_SETTINGS_RANGES`(zod) 한 곳에 있고, 여기서는 와이어 표현 범위만 본다(`toWireUint`/`toWireUByte` 규율).
 *
 * @throws {OrderBuildError} 값이 uint/ubyte 표현 범위를 벗어날 때
 */
export function buildSetUserSettingsReq(s: RelayUserSettingsValues): Uint8Array {
  const b = new flatbuffers.Builder(128);
  UserSettings.startUserSettings(b);
  UserSettings.addPreBuyAmount(b, toWireUint(s.preBuyAmount, "preBuyAmount"));
  UserSettings.addAddBuyAmount(b, toWireUint(s.addBuyAmount, "addBuyAmount"));
  UserSettings.addPostBuyAmount(b, toWireUint(s.postBuyAmount, "postBuyAmount"));
  UserSettings.addPostBuyMaxCount(b, toWireUByte(s.postBuyMaxCount, "postBuyMaxCount"));
  UserSettings.addPostBuyFloorQty(b, toWireUint(s.postBuyFloorQty, "postBuyFloorQty"));
  UserSettings.addPostBuyReboundPct(b, toWireUByte(s.postBuyReboundPct, "postBuyReboundPct"));
  UserSettings.addSellQtyTrackRatio(b, toWireUByte(s.sellQtyTrackRatio, "sellQtyTrackRatio"));
  UserSettings.addAutoSellPeriodSec(b, toWireUByte(s.autoSellPeriodSec, "autoSellPeriodSec"));
  UserSettings.addAuctionSellRatioPct(b, toWireUByte(s.auctionSellRatioPct, "auctionSellRatioPct"));
  UserSettings.addAutoSellRatioDefaultPct(b, toWireUByte(s.autoSellRatioDefaultPct, "autoSellRatioDefaultPct"));
  UserSettings.addAutoSellMethodDefault(b, toWireUByte(s.autoSellMethodDefault, "autoSellMethodDefault"));
  // present — 84 전용(서버가 42 요청값을 읽지 않는다). 싣지 않는다.
  const table = UserSettings.endUserSettings(b);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.SetUserSettingsReq);
  Envelope.addUserSettings(b, table);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/**
 * 사용자 설정 조회 (MsgType 43 · Phase 27 — gh-trade `limit-chaser.md` §9-3). **요청 테이블이 없다 — 빈 Envelope**
 * (24/27/34 선례). 응답 84 는 요청 연결로 온다. hub 가 세션 Ready 스냅샷 요청 끝에 보낸다.
 */
export function buildGetUserSettingsReq(): Uint8Array {
  return buildBareRequest(MSG.GetUserSettingsReq);
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
  /**
   * 시간외종가 구분 (`OrderResp.board`) — `"G2"`·`"G3"`·빈 값만 온다. 빈 값이 정상이다.
   * 정규화하지 않고 원문 그대로 흘린다 (D-08).
   */
  board: string;
  /**
   * 요청 종류 (`OrderResp.request_kind`) — `"New"`·`"Modify"`·`"Cancel"`. 구 서버는 "".
   *
   * **행위 단어의 원천이다.** `message` 문구가 아니라 이 값(과 `noticeType`)으로 판정한다 —
   * 804 정정·취소 거부에서 서버가 문구를 교체하므로 문구 비교는 조용히 틀린다 (T-17-04).
   */
  requestKind: string;
  /**
   * 요청 주체 (`OrderResp.requester`) — 지금은 `"Manual"` 뿐이다. 구 서버는 "".
   *
   * **표시 전용**이다. `dma_orders.origin` 은 `originKind`(원주문 주체)를 그대로 쓴다 —
   * 취소 요청자를 원주문 주체로 덮어쓰면 자동주문이 수동으로 둔갑한다 (D-08).
   */
  requester: string;
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
    // 아래 3필드는 **해석하지 않는다** (D-08). 빈 값은 구 서버의 정상 입력이라 경고도 남기지
    // 않는다 — 여기서 값을 지어내면 문구 파싱과 똑같은 실패를 다른 이름으로 되풀이한다.
    board: r.board() ?? "",
    requestKind: r.requestKind() ?? "",
    requester: r.requester() ?? "",
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
 * 수신 체결구분 정규화 (`TradeTapeEntry.bs_code`) — `"1"` 매도 · `"2"` 매수 · 그 밖 전부 `""`.
 *
 * **아는 두 값만 통과시킨다.** `fromWireMarket`/`fromWireCrud` 처럼 "그 외는 한쪽으로 접는"
 * 규약이 **아니다**: 시장·등록구분은 서버가 기본값을 갖지만 체결구분은 그렇지 않아, 낯선
 * 값을 한쪽으로 접으면 매수/매도 색이 **반대로** 칠해진다. 모르는 것은 모른다고 말하는
 * `""` 가 유일하게 안전한 방향이다 — 화면은 `""` 인 원소만 호가 비교 추정으로 폴백하고
 * 그때만 「추정」이라고 밝힌다 (D-10).
 */
export function fromWireBsCode(raw: string): "" | "1" | "2" {
  return raw === "1" || raw === "2" ? raw : "";
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
      // 아래 5필드는 **해석하지 않고 그대로 올린다** (D-07). 문구를 파싱하거나 대기/발사중을
      // 다시 계산하지 않는 것이 규율이고, 회색·취소 제외 판정의 근거는 `pendingCancelSent`
      // bool 하나다(gh-trade 교훈 24).
      orderTime: u.orderTime() ?? "",
      queuedStatus: u.queuedStatus() ?? "",
      pendingStatus: u.pendingStatus() ?? "",
      board: u.board() ?? "",
      pendingCancelSent: u.pendingCancelSent(),
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
 * **활성 68필드(59 + 자동매도 8 · Phase 27 + extraBuyAuto · quick-261011-0yb)를 전부 읽는다.** S→C 전용 16(`sellOrderQty` ·
 * `sellQtyTrackBaseline` · `sellEntryLatched` · `cancelQtyTrackBaseline` · `cancelEntryLatched` · `buy3Schema` ·
 * `extraBuyAbandoned` · `extraBuyAbandonQty` · `postBuyTriggerQty` · `postBuyReentryLeft` · `postBuyPhase` ·
 * `postBuyUnlockQty` · `autoSellState` · `autoSellSoldQty` · `autoSellBasis` · `autoSellBasisPrice`)는
 * 보내지 않지만 읽어서 표시한다 — (`buy3Schema` 는 relay 가 1~5 로 보내지만 에코 값은 서버 것을 읽는다)
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
      // gh-trade a3610261 로 슬롯 24 봉인 — 생성 접근자가 없다. buy3 서버 에코에는 원래 없어
      // 종전에도 "0" 이었다(Phase 24). 값 영향 0 — 상수로 채운다.
      buyWatchSide: "0",
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
      // S→C 전용 — 취소 진입 확인 래치 원값. `cancelQtyEnabled` 등 취소 3플래그와 달리
      // 무장(armed)과 **접지 않는다**. `&& enabled` 로 접으면 "취소 무장 OFF 인데 래치는
      // 살아 있음" 이라는 서버 진실이 화면에서 소멸한다 (D-05).
      cancelEntryLatched: t.cancelEntryLatched(),
      cancelQtyEnabled: t.cancelQtyEnabled(),
      cancelWatchQty: t.cancelWatchQty(),
      cancelTradeEnabled: t.cancelTradeEnabled(),
      cancelQtyTrackEnabled: t.cancelQtyTrackEnabled(),
      // S→C 전용 — 16-01 재동기화로 접근자가 생긴 필드다.
      cancelQtyTrackBaseline: t.cancelQtyTrackBaseline(),
      // === Phase 24 매수 3종 (gh-trade D-17 · D-24) ===
      // 서버 에코는 늘 1. 구 서버(필드 부재)는 0 — 판정은 UI 몫이다.
      buy3Schema: t.buy3Schema(),
      // 양방향 — 에코는 무장과 접힌 값(gh-trade D-03).
      preBuyEnabled: t.preBuyEnabled(),
      // 양방향 — 에코는 cfg ∧ 무장 ∧ !포기(gh-trade D-03 · D-08).
      extraBuyEnabled: t.extraBuyEnabled(),
      extraBuyMinQty: t.extraBuyMinQty(),
      extraBuyMaxQty: t.extraBuyMaxQty(),
      extraBuyOrderAmount: t.extraBuyOrderAmount(),
      extraBuyOrderQty: t.extraBuyOrderQty(),
      // S→C 전용 — 추가매수 포기(최대 초과 · 상한가 이탈 최소 미달).
      extraBuyAbandoned: t.extraBuyAbandoned(),
      // S→C 전용 — 포기 성립 틱의 매수1잔량(주, uint32 · quick-260930-fi4). 슬롯 부재(옛 서버) = 0.
      extraBuyAbandonQty: t.extraBuyAbandonQty(),
      // D-21 · gh-trade D-32 — 서버가 cfg ∧ 마스터 무장 ∧ 단계 ≠ 소진으로 이미 접어 보낸다.
      // relay 는 다시 접지 않는다.
      postBuyEnabled: t.postBuyEnabled(),
      postBuyReboundPct: t.postBuyReboundPct(),
      postBuyFloorQty: t.postBuyFloorQty(),
      // cfg 설정값 원값 — 잔여가 아니다(잔여는 postBuyReentryLeft).
      postBuyReentry: t.postBuyReentry(),
      postBuyOrderAmount: t.postBuyOrderAmount(),
      postBuyOrderQty: t.postBuyOrderQty(),
      // S→C 전용 — 발동잔량(주).
      postBuyTriggerQty: t.postBuyTriggerQty(),
      // S→C 전용 — 재진입 잔여(회).
      postBuyReentryLeft: t.postBuyReentryLeft(),
      // S→C 전용 — 0 꺼짐 / 1 감시 / 2 보유중 / 3 소진.
      postBuyPhase: t.postBuyPhase(),
      // 양방향 — 서버 런타임 값(자동 발화 뒤 false). 슬롯 부재(구서버) = false.
      postBuyAuto: t.postBuyAuto(),
      // S→C 전용 — 후매수 잠금 해제선(주, uint32 · quick-261002-fim). 슬롯 부재(미배포 서버) = 0. 계산하지 않는다.
      postBuyUnlockQty: t.postBuyUnlockQty(),
      // 양방향 — 추가매수 ☐버스트 시 해제(vtable 138 · quick-261003-rc4). 에코는 설정값. 슬롯 부재(구서버) = false.
      extraBuyBurstRelease: t.extraBuyBurstRelease(),
      // 양방향 — 추가매수 ☐자동(vtable 156 · quick-261011-0yb). 에코는 설정값. 슬롯 부재(구서버) = false.
      extraBuyAuto: t.extraBuyAuto(),
      // 자동매도 8필드(Phase 27 · vtable 140~154). 슬롯 부재(구서버) = false/0 — 계산하지 않는다.
      // 양방향 — ☐자동매도 · 시작조건 · 비율 · 방법.
      autoSellEnabled: t.autoSellEnabled(),
      autoSellStartCond: t.autoSellStartCond(),
      autoSellRatioPct: t.autoSellRatioPct(),
      autoSellMethod: t.autoSellMethod(),
      // S→C 전용 — 상태(0~4) · 누적 매도(주) · 기준 종류(1 상한가 · 2 매수가) · 기준가격(원).
      autoSellState: t.autoSellState(),
      autoSellSoldQty: t.autoSellSoldQty(),
      autoSellBasis: t.autoSellBasis(),
      autoSellBasisPrice: t.autoSellBasisPrice(),
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
      // 빈 값은 `"KRX"` 다 — 서버가 그렇게 정규화한 뒤 거래소별 슬롯에 넣는다 (D-06).
      exchange: fromWireExchange(t.exchange() ?? ""),
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
      // 빈 값은 `"KRX"` (D-06). R8 매칭 키가 ISIN+거래소라 같은 종목이 양쪽에서 발동하면 행이 둘이다.
      exchange: fromWireExchange(it.exchange() ?? ""),
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
      // VI 해제됨 (gh-trade quick-260923-jsv · 슬롯 36). 서버가 R8 해제 전문(또는 재기동 보정)으로 세운다 —
      // 해제 예정시각으로 클라가 추정하지 않는다. 구 서버는 슬롯이 없어 `false` 로 읽힌다.
      viReleased: it.viReleased(),
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
    // 빈 값은 `"KRX"` (D-06).
    exchange: fromWireExchange(n.exchange() ?? ""),
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

// ============================================================
// 종목마스터 (57) — quick-260923-cqj
// ============================================================
//
// Supabase `stocks` 에 아직 없는 당일 신규상장 종목의 이름·단축코드·시장을 채우는 **보조 원천**.
// 정본은 여전히 `stocks` 다(`store/symbols.ts`). 여기서는 프레임 1건을 좁히기만 하고, 분할
// 프레임의 조립·검증·교체는 `store/gateway-symbols.ts` 의 일이다.

/**
 * 57 한 프레임의 원소 상한 = 1,000. 서버 청크(`QuoteWire.h:64` `kSymbolMasterChunk` = 500)의
 * 2배다. 넘으면 **절단하지 않고 프레임째 버린다** — 부분 마스터는 total 검증을 깨뜨린다.
 */
export const MAX_SYMBOL_MASTER_FRAME_ITEMS = 1000;

/**
 * 57 `total_items` 상한 = 20,000. 서버 전수(약 4,500종목)의 4배 여유다. 깨진 버퍼가 만든
 * 거대한 값으로 조립 버퍼가 무한정 자라는 것을 막는다 (T-cqj-03).
 */
export const MAX_SYMBOL_MASTER_TOTAL_ITEMS = 20000;

/** 종목명 길이 상한(trim 후). 실제 최장 종목명은 수십 자다 — 넘으면 깨진 문자열로 본다. */
export const MAX_SYMBOL_NAME_LEN = 100;

/** 6자 단축코드 — 대문자 영숫자(신규 체계 `0010S0` 처럼 영문이 섞인다). */
const SYMBOL_CODE_PATTERN = /^[0-9A-Z]{6}$/;

/** 이름 속 제어문자(U+0000~U+001F, U+007F). 로그·렌더 오염을 막는다 (T-cqj-01). */
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;

/**
 * 게이트웨이 마스터의 `market_type` → 주문 시장 구분. **"0"→"K", "1"→"Q", 그 밖은 `null`.**
 *
 * 근거(gh-trade 서버 소스, 읽기 전용):
 *   - `QuoteWire.h:234` — 마스터 원소의 시장구분 어휘가 "0"/"1" 이다.
 *   - `MarketPublisher.cpp:948-949` — 시드 `{KOSPI,"0"},{KOSDAQ,"1"}`.
 *   - `MarketPublisher.cpp:636` — 당일 신규상장 행은 `(market == 'Q') ? "1" : "0"` 로 접는다.
 *
 * 잔여 위험(OQ-1): 게이트웨이가 'Q' 가 아닌 시장 문자를 전부 "0"(코스피)으로 접는다. 현재 피드는
 * 01S/01Q 두 채널뿐이라 수용한다. 그 밖의 값은 **지어내지 않고 `null`** 이고, `null` 은 주문·전략
 * 조립 게이트가 거부한다 (T-16-05) — 기본값으로 메우면 코스닥 주문이 코스피로 나간다.
 */
export function fromWireMasterMarketType(raw: string): OrderMarket | null {
  if (raw === "0") return "K";
  if (raw === "1") return "Q";
  return null;
}

/**
 * 57 원소 1건을 좁힌 결과. 표시·주문에 필요한 최소 필드 + NXT 거래가능 플래그(quick-260923-pq2 —
 * 웹앱 세그먼트 판정의 유일한 원천). `sec_group_id` 는 여전히 제외.
 */
export type GatewaySymbolRow = {
  isin: string;
  code: string;
  name: string;
  market: OrderMarket | null;
  /** NXT 거래가능 여부(서버가 NXT A0 수신으로 판정 · fbs D-12). */
  nxtTradable: boolean;
};

/** 57 프레임 1건을 좁힌 결과. */
export type ParsedSymbolMasterFrame = {
  seq: number;
  totalItems: number;
  isLast: boolean;
  /** 이 프레임에 실린 **원소 수(스킵 포함)**. 누적이 `total_items` 와 같아야 조립이 끝난다. */
  rawCount: number;
  rows: GatewaySymbolRow[];
  /** 형식 가드로 건너뛴 원소 수. */
  skipped: number;
};

/**
 * 형식 위반으로 건너뛴 **종목마스터 원소** 누적 수 (S-5). 계좌·전략 카운터와 따로 센다.
 */
let skippedSymbolMasterItems = 0;

/** 형식 위반으로 건너뛴 종목마스터 원소 누적 수. */
export function skippedSymbolMasterItemCount(): number {
  return skippedSymbolMasterItems;
}

/**
 * 종목마스터 분할 응답 1프레임 (57 — `symbol_master` 슬롯). total 하다 — throw 하지 않는다.
 *
 * 프레임 수준 위반(슬롯 없음·음수 seq/total·상한 초과)은 `dropField` 후 `null` 이다.
 * 원소 수준 위반은 그 원소만 건너뛰고 `rawCount` 에는 센다 — 누적 원소 수 검증이 서버의
 * `total_items` 와 맞아야 하기 때문이다. 원소마다 로그를 남기지 않는다(한 프레임 500건이
 * 쏟아질 수 있다). 프레임당 한 줄로 사유별 건수와 첫 샘플 ISIN 하나만 남긴다.
 */
export function parseSymbolMasterFrame(env: Envelope): ParsedSymbolMasterFrame | null {
  const msgType = MSG.SymbolMasterResp;
  try {
    const m = env.symbolMaster();
    if (m === null) return dropField("slot-null", msgType, { slot: "symbol_master" });

    const seq = m.seq();
    const totalItems = m.totalItems();
    const isLast = m.isLast();
    const length = m.itemsLength();
    if (seq < 0) return dropField("bad-seq", msgType, { seq });
    if (totalItems < 0 || totalItems > MAX_SYMBOL_MASTER_TOTAL_ITEMS) {
      return dropField("bad-total-items", msgType, {
        totalItems,
        max: MAX_SYMBOL_MASTER_TOTAL_ITEMS,
      });
    }
    if (length < 0 || length > MAX_SYMBOL_MASTER_FRAME_ITEMS) {
      return dropField("too-many-items", msgType, {
        seq,
        length,
        max: MAX_SYMBOL_MASTER_FRAME_ITEMS,
      });
    }

    const rows: GatewaySymbolRow[] = [];
    const reasons: Record<string, number> = {};
    let firstSkippedIsin: string | null = null;
    let skipped = 0;
    const skip = (reason: string, isin: string): void => {
      skipped += 1;
      reasons[reason] = (reasons[reason] ?? 0) + 1;
      if (firstSkippedIsin === null) firstSkippedIsin = isin;
    };

    const scratch = new SymbolMasterItem();
    for (let i = 0; i < length; i += 1) {
      const item = m.items(i, scratch);
      if (item === null) {
        skip("item-null", "");
        continue;
      }
      const isin = item.isin() ?? "";
      if (!isValidIsin(isin)) {
        skip("bad-isin", isin);
        continue;
      }
      const code = item.code() ?? "";
      if (!SYMBOL_CODE_PATTERN.test(code)) {
        skip("bad-code", isin);
        continue;
      }
      const rawName = item.name() ?? "";
      if (CONTROL_CHAR_PATTERN.test(rawName)) {
        skip("name-control-char", isin);
        continue;
      }
      const name = rawName.trim();
      if (name.length === 0 || name.length > MAX_SYMBOL_NAME_LEN) {
        skip("bad-name-length", isin);
        continue;
      }
      rows.push({
        isin,
        code,
        name,
        market: fromWireMasterMarketType(item.marketType() ?? ""),
        nxtTradable: item.nxtTradable(),
      });
    }

    if (skipped > 0) {
      skippedSymbolMasterItems += skipped;
      logger.warn(
        {
          seq,
          skipped,
          reasons,
          sampleIsin: firstSkippedIsin,
          skippedSymbolMasterItemCount: skippedSymbolMasterItems,
        },
        "[DMA] 종목마스터 원소 스킵 (형식 가드)",
      );
    }

    return { seq, totalItems, isLast, rawCount: length, rows, skipped };
  } catch (err) {
    // Verifier 가 없어 깨진 버퍼가 접근자에서 RangeError 를 낼 수 있다 — 프레임만 버린다.
    return dropField("parse-throw", msgType, { error: err instanceof Error ? err.message : String(err) });
  }
}

// ============================================================
// 관찰자 저널 (5 요청 / 79 로그인 응답 · 80 저널 배치) — Phase 19-09
// ============================================================
//
// gh-trade Phase 23 계약(8285a265)의 관찰자 전용 메시지 3종. 도메인 타입(`journal/types.ts`)으로의
// 매핑은 **여기 한 곳**이다 — 필드 이름·순서는 인계서 §2 와 1:1 이라 매핑은 이름 변환(snake → camel)과
// ulong(bigint) → number 변환(`toNum` — D-34 유일 경계)뿐이다. 관찰자·기록기는 생성 타입을 모른다.

/** 관찰자 로그인 요청 입력 — `JournalCodec.buildLoginReq` 와 같은 모양. */
export type ObserverLoginReqInput = {
  secret: string;
  /** 이미 받은 마지막 seq. 게이트웨이는 이 seq **초과**부터 보낸다(0 = 보관분 처음부터). */
  sinceSeq: number;
  /** relay 가 마지막으로 본 epoch. `""` = 모름. */
  epoch: string;
  client: string;
  /**
   * 전략 스트림의 마지막 수신 seq (Phase 25 · 같은 epoch · 별도 seq 공간). 0 = 보관분 처음부터.
   * 관찰자가 전략 기록기 epoch 와 주문 기록기 epoch 가 같을 때만 실제 값을 싣는다(RESEARCH Pitfall 3).
   */
  strategySinceSeq: number;
  /**
   * 관찰자 역할 (Phase 26 · gh-trade ed2e0240 · vtable 슬롯 14). 0 = journal(기본 · 생략 시 — 필드 없는 구 relay 와
   * 같다) · 1 = quote(시세 전용 관찰자 — 저널 없음) · 2 = admin(Phase 29 · gh-trade 92cdfbff — users.toml 관리 전용,
   * 4 · 44 만). 그 밖 값은 서버가 79 `success=false` 로 거부하므로 여기서 먼저 막는다.
   */
  role?: 0 | 1 | 2;
};

/**
 * 관찰자 로그인 요청 (MsgType 5 · `observer_login_req` 슬롯).
 *
 * `since_seq` 는 ulong 이라 `BigInt` 로 싣는다. 음수·비정수·안전 정수 초과는 **호출자 버그**라 throw 한다 —
 * 조용히 0 으로 접으면 게이트웨이가 보관분 전체를 재생하고, 잘라 실으면 엉뚱한 구간을 건너뛴다.
 * `role` 도 0 · 1 · 2 밖이면 호출자 버그라 throw 한다 — 서버가 거부할 로그인을 보내 재접속 루프를 돌지 않는다.
 * 비밀은 이 함수 밖으로 나가지 않는다 — **어떤 로그에도 싣지 않는다**(T-19-03 · throw 문구에도 없다).
 */
export function buildObserverLoginReq(input: ObserverLoginReqInput): Uint8Array {
  const { sinceSeq, strategySinceSeq } = input;
  if (!Number.isSafeInteger(sinceSeq) || sinceSeq < 0) {
    throw new RangeError(`관찰자 로그인 since_seq 가 0 이상의 안전 정수가 아니다: ${String(sinceSeq)}`);
  }
  if (!Number.isSafeInteger(strategySinceSeq) || strategySinceSeq < 0) {
    throw new RangeError(`관찰자 로그인 strategy_since_seq 가 0 이상의 안전 정수가 아니다: ${String(strategySinceSeq)}`);
  }
  const role = input.role ?? 0;
  if (role !== 0 && role !== 1 && role !== 2) {
    throw new RangeError(
      `관찰자 로그인 role 이 0(journal) · 1(quote) · 2(admin) 이 아니다: ${String(role)}`,
    );
  }
  const b = new flatbuffers.Builder(256);
  // 문자열은 테이블 조립 **전에** 만든다 (FlatBuffers 중첩 제약).
  const secret = b.createString(input.secret);
  const epoch = b.createString(input.epoch);
  const client = b.createString(input.client);
  const req = ObserverLoginReq.createObserverLoginReq(
    b,
    secret,
    BigInt(sinceSeq),
    epoch,
    client,
    BigInt(strategySinceSeq),
    role,
  );
  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.ObserverLoginReq);
  Envelope.addObserverLoginReq(b, req);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/**
 * 관찰자 로그인 응답 (79 · `observer_login_resp` 슬롯). total 하다 — throw 하지 않는다.
 *
 * 슬롯이 비거나 읽다가 깨지면 `null`(→ 코덱 `malformed` → 관찰자가 연결을 다시 세운다). 계좌 매핑은
 * `readAccountEntries` 와 같은 규율로 **형식 이상 항목만** 건너뛴다(`skipAccount` 계수) — 프레임을 버리면
 * 정상 매핑까지 사라진다. 계좌번호는 게이트웨이 정규화값 그대로다(재정규화 금지 — Pitfall 7).
 */
export function parseObserverLoginResp(env: Envelope): ObserverLoginResult | null {
  const msgType = MSG.ObserverLoginResp;
  try {
    const r = env.observerLoginResp();
    if (r === null) return dropField("slot-null", msgType, { slot: "observer_login_resp" });

    const n = takeCount(r.accountsLength(), MAX_OBSERVER_ACCOUNT_COUNT, "관찰자 계좌 매핑");
    const accounts: ObserverAccountRow[] = [];
    const scratch = new ObserverAccount();
    // 건너뛴 항목 수 — 매핑 관측값(`/healthz` `journal.mapping.skipped` · 19-REVIEW WR-04). 상한 초과분도 버린 것이다.
    let skippedAccounts = Math.max(r.accountsLength() - n, 0);
    for (let i = 0; i < n; i += 1) {
      const a = r.accounts(i, scratch);
      if (a === null) {
        skipAccount("entry-null", i, "");
        skippedAccounts += 1;
        continue;
      }
      const accountNo = a.accountNo() ?? "";
      if (!isValidAccountNo(accountNo)) {
        skipAccount("bad-account-no", i, accountNo);
        skippedAccounts += 1;
        continue;
      }
      accounts.push({
        dmaUserId: a.dmaUserId() ?? "",
        accountNo,
        name: a.name() ?? "",
        priority: a.priority(),
      });
    }

    return {
      success: r.success(),
      message: r.message() ?? "",
      broker: r.broker() ?? "",
      epoch: r.journalEpoch() ?? "",
      headSeq: toNum(r.headSeq(), "observer_login_resp.head_seq"),
      oldestSeq: toNum(r.oldestSeq(), "observer_login_resp.oldest_seq"),
      resync: r.resync(),
      accounts,
      skippedAccounts,
      // 구 게이트웨이(필드 없음)는 기본값 0 / 0 / false 로 읽힌다 = 「전략 저널 없음」(G1 ⓑ).
      strategyHeadSeq: toNum(r.strategyHeadSeq(), "observer_login_resp.strategy_head_seq"),
      strategyOldestSeq: toNum(r.strategyOldestSeq(), "observer_login_resp.strategy_oldest_seq"),
      strategyResync: r.strategyResync(),
      // 수락한 역할 에코(Phase 26 · ed2e0240). 거부 응답 · 구 게이트웨이(필드 없음)는 0 으로 읽힌다.
      role: r.role(),
    };
  } catch (err) {
    return dropField("parse-throw", msgType, { error: err instanceof Error ? err.name : "unknown" });
  }
}

// ============================================================
// Phase 29 — admin 관리 코덱 (44 조립 · 86/87 파싱 · gh-trade 92cdfbff · blob 03fc8cbe)
// ============================================================
//
// admin 연결(role 2) 전용이다. 계좌번호는 서버 정규화값 그대로 싣고 읽는다(재정규화 금지 — Pitfall 7).
// ulong(request_id · users_rev)은 bigint 그대로 둔다 — toNum 을 거치지 않는다(정밀도 손실 금지).
// 비밀번호 · 계좌번호는 어떤 로그 인자에도 싣지 않는다.

/** `AdminAccount` 테이블 조립 — 생성 빌더(start/add/end)로만. 문자열은 테이블 조립 **전에** 만든다. */
function buildWireAdminAccount(b: flatbuffers.Builder, a: AdminAccount): flatbuffers.Offset {
  const accountNo = b.createString(a.accountNo);
  const name = b.createString(a.name);
  const branchNo = b.createString(a.branchNo);
  const traderId = b.createString(a.traderId);
  WireAdminAccount.startAdminAccount(b);
  WireAdminAccount.addAccountNo(b, accountNo);
  WireAdminAccount.addName(b, name);
  WireAdminAccount.addBranchNo(b, branchNo);
  WireAdminAccount.addTraderId(b, traderId);
  WireAdminAccount.addPriority(b, a.priority);
  return WireAdminAccount.endAdminAccount(b);
}

/**
 * admin 관리 명령 (MsgType 44 · `admin_command_req` 슬롯 92 · C→S · Phase 29).
 *
 * - `password` 는 **op 1(UpsertUser) 일 때만** 싣는다. 그 밖 op 는 빈 문자열 — 호출자가 실수로 넘겨도 와이어에 나가지 않는다.
 * - `account` 는 주어질 때만 싣는다(op 1 신규 · op 3 · op 4).
 * - `requestId` 는 ulong 이라 0 이상 2^64 미만이어야 한다 — 벗어나면 호출자 버그라 throw 한다(값은 문구에 싣되 비밀은 없다).
 */
export function buildAdminCommandReq(input: AdminCommandInput): Uint8Array {
  const { requestId } = input;
  if (typeof requestId !== "bigint" || requestId < 0n || requestId >= 1n << 64n) {
    throw new RangeError(`admin request_id 가 ulong 범위가 아니다: ${String(requestId)}`);
  }
  const b = new flatbuffers.Builder(256);
  const userId = b.createString(input.userId);
  const password = b.createString(input.op === ADMIN_OP.UpsertUser ? (input.password ?? "") : "");
  const account = input.account !== undefined ? buildWireAdminAccount(b, input.account) : null;

  AdminCommandReq.startAdminCommandReq(b);
  AdminCommandReq.addRequestId(b, requestId);
  AdminCommandReq.addOp(b, input.op);
  AdminCommandReq.addUserId(b, userId);
  AdminCommandReq.addPassword(b, password);
  if (account !== null) AdminCommandReq.addAccount(b, account);
  const table = AdminCommandReq.endAdminCommandReq(b);

  Envelope.startEnvelope(b);
  Envelope.addMsgType(b, MSG.AdminCommandReq);
  Envelope.addAdminCommandReq(b, table);
  b.finish(Envelope.endEnvelope(b));
  return b.asUint8Array();
}

/**
 * admin 명령 응답 (86 · `admin_command_resp` 슬롯 94). total 하다 — throw 하지 않는다.
 * `message` 는 화면 표시용 한국어 그대로 · 분기는 `code`(D-23 ④).
 */
export function parseAdminCommandResp(env: Envelope): AdminCommandResult | null {
  const msgType = MSG.AdminCommandResp;
  try {
    const r = env.adminCommandResp();
    if (r === null) return dropField("slot-null", msgType, { slot: "admin_command_resp" });
    return {
      requestId: r.requestId(),
      ok: r.ok(),
      code: r.code(),
      message: r.message() ?? "",
      usersRev: r.usersRev(),
    };
  } catch (err) {
    return dropField("parse-throw", msgType, { error: err instanceof Error ? err.name : "unknown" });
  }
}

/**
 * users.toml 전체 스냅샷 (87 · `admin_users_snapshot` 슬롯 96). total 하다 — throw 하지 않는다.
 *
 * - 유저는 파일 순, 계좌는 priority 오름차순 — 서버 순서를 그대로 보존한다(정렬하지 않는다).
 * - 교보 계좌의 `branchNo` · `traderId` 빈 문자열은 그대로 둔다(D-23 ③).
 * - `request_id` 가 없다 — 86 직후 같은 연결 순서로 짝짓는다(29-08).
 * - 원소 null 은 건너뛴다(구조 이상 — 로그에는 인덱스만, 계좌번호 없음). 상한 초과는 앞 N건(`takeCount` 경고).
 */
export function parseAdminUsersSnapshot(env: Envelope): AdminUsersSnapshot | null {
  const msgType = MSG.AdminUsersSnapshot;
  try {
    const r = env.adminUsersSnapshot();
    if (r === null) return dropField("slot-null", msgType, { slot: "admin_users_snapshot" });

    const userScratch = new WireAdminUser();
    const accountScratch = new WireAdminAccount();
    const nUsers = takeCount(r.usersLength(), MAX_ADMIN_USERS, "admin 유저 스냅샷 유저");
    const users: AdminSnapshotUser[] = [];
    for (let i = 0; i < nUsers; i += 1) {
      const u = r.users(i, userScratch);
      if (u === null) {
        logger.warn({ msgType, index: i }, "[DMA] admin 유저 스냅샷 유저 항목 null — 건너뜀");
        continue;
      }
      const userId = u.userId() ?? "";
      const nAcc = takeCount(u.accountsLength(), MAX_ADMIN_ACCOUNTS_PER_USER, "admin 유저 스냅샷 계좌");
      const accounts: AdminAccount[] = [];
      for (let j = 0; j < nAcc; j += 1) {
        const a = u.accounts(j, accountScratch);
        if (a === null) {
          logger.warn({ msgType, index: i, accountIndex: j }, "[DMA] admin 유저 스냅샷 계좌 항목 null — 건너뜀");
          continue;
        }
        accounts.push({
          accountNo: a.accountNo() ?? "",
          name: a.name() ?? "",
          branchNo: a.branchNo() ?? "",
          traderId: a.traderId() ?? "",
          priority: a.priority(),
        });
      }
      users.push({ userId, accounts });
    }
    return { usersRev: r.usersRev(), users };
  } catch (err) {
    return dropField("parse-throw", msgType, { error: err instanceof Error ? err.name : "unknown" });
  }
}

/**
 * 저널 배치 (80 · `journal_batch` 슬롯). total 하다 — throw 하지 않는다.
 *
 * ★ **레코드는 하나도 버리지 않는다** (T-19-34). 기록기는 seq 연속성으로 누락을 판정하므로, 형식이 이상한
 *   레코드 하나를 여기서 건너뛰면 seq 갭 → 끊고 같은 since 로 재접속 → 같은 레코드 → 같은 갭의 **무한 루프**가
 *   된다. 계좌번호·ISIN 형식 이상은 경고만 남기고(프레임당 1줄 · 계좌는 `maskAccountNo`) 값은 게이트웨이 원문
 *   그대로 올린다 — `parseOrderResp` 의 「프레임은 살린다」 규율. 받아들일지는 DB 투영(CHECK · 포이즌 격리)이 정한다.
 *   로컬 거부(`local_reject` · 빈 주문번호)도 그대로 통과한다(D-02).
 *
 * 프레임 전체를 `null`(→ `malformed` → 재접속)로 돌리는 경우는 구조가 깨졌을 때뿐이다 — 슬롯 없음 · 레코드
 * 테이블 null · 읽기 예외. 상한 초과는 앞의 N건만 쓰고 `caughtUp` 을 거짓으로 내린다 — 잘린 뒤 구간은 다음
 * 배치의 갭 판정이 since 로 다시 받는다.
 *
 * Phase 25 — 같은 프레임의 두 번째 스트림 `strategy_events` 도 같은 규율이다: 원소 null 은 구조 파손(프레임
 * 전체 드롭), 형식 이상 계좌/ISIN 은 경고만(레코드를 버리지 않는다 — T-19-34 무한 갭 루프 방지 · RESEARCH
 * Pitfall 8), 상한(`MAX_STRATEGY_BATCH_EVENTS`) 초과는 앞 N건 + `strategyCaughtUp` 거짓. 구 게이트웨이 프레임은
 * 벡터가 없어 길이 0 이라 `strategyEvents: []` · `strategyHeadSeq: 0` · `strategyCaughtUp: false` 로 자연히 떨어진다.
 */
export function parseJournalBatch(env: Envelope): JournalBatchFrame | null {
  const msgType = MSG.JournalBatch;
  try {
    const r = env.journalBatch();
    if (r === null) return dropField("slot-null", msgType, { slot: "journal_batch" });

    const rawCount = r.recordsLength();
    const n = takeCount(rawCount, MAX_JOURNAL_BATCH_RECORDS, "저널 레코드");
    const records: JournalRecord[] = [];
    const scratch = new WireJournalRecord();
    let badAccount = 0;
    let badIsin = 0;
    let sampleAccount: string | null = null;
    let sampleSeq: number | null = null;
    for (let i = 0; i < n; i += 1) {
      const w = r.records(i, scratch);
      if (w === null) return dropField("record-null", msgType, { index: i, count: n });
      const rec: JournalRecord = {
        seq: toNum(w.seq(), "journal_record.seq"),
        tradeDate: w.tradeDate() ?? "",
        gwTimeMs: toNum(w.gwTimeMs(), "journal_record.gw_time_ms"),
        dmaUserId: w.dmaUserId() ?? "",
        accountNo: w.accountNo() ?? "",
        isin: w.isin() ?? "",
        side: w.side() ?? "",
        sideTrusted: w.sideTrusted(),
        orderNo: w.orderNo() ?? "",
        orgOrderNo: w.orgOrderNo() ?? "",
        noticeType: w.noticeType() ?? "",
        requestKind: w.requestKind() ?? "",
        requester: w.requester() ?? "",
        origin: w.origin() ?? "",
        exchange: w.exchange() ?? "",
        board: w.board() ?? "",
        orderPrice: w.orderPrice(),
        orderQty: w.orderQty(),
        execPrice: w.execPrice(),
        execQty: w.execQty(),
        resultCode: w.resultCode(),
        message: w.message() ?? "",
        localReject: w.localReject(),
      };
      if (!isValidAccountNo(rec.accountNo)) {
        badAccount += 1;
        if (sampleAccount === null) {
          sampleAccount = rec.accountNo;
          sampleSeq = rec.seq;
        }
      }
      if (!isValidIsin(rec.isin)) badIsin += 1;
      records.push(rec);
    }

    if (badAccount > 0 || badIsin > 0) {
      logger.warn(
        {
          msgType,
          records: records.length,
          badAccount,
          badIsin,
          sampleSeq,
          sampleAccountLen: sampleAccount?.length ?? null,
          sampleAccount: sampleAccount === null ? null : maskAccountNo(sampleAccount),
        },
        "[DMA] 저널 레코드 형식 이상 — 버리지 않고 그대로 올린다 (seq 갭 루프 방지)",
      );
    }

    const rawStrategyCount = r.strategyEventsLength();
    const nStrategy = takeCount(rawStrategyCount, MAX_STRATEGY_BATCH_EVENTS, "전략 이벤트");
    const strategyEvents: StrategyEventRecord[] = [];
    const strategyScratch = new WireStrategyEvent();
    let badStrategyAccount = 0;
    let badStrategyIsin = 0;
    let sampleStrategyAccount: string | null = null;
    let sampleStrategySeq: number | null = null;
    let strategyContractViolation: StrategyContractViolation | null = null;
    for (let i = 0; i < nStrategy; i += 1) {
      const w = r.strategyEvents(i, strategyScratch);
      if (w === null) return dropField("strategy-event-null", msgType, { index: i, count: nStrategy });
      const ev = readStrategyEvent(w);
      // 필수 키 계약 위반(WR-01) — 이 이벤트부터는 올리지 않는다. 프레임 전체를 malformed 로 버리면 주문 레코드까지
      // 재접속 루프에 갇히고, 위반 이벤트를 올리면 적용 RPC 가 영원히 거부한다. 관찰자가 이 표시로 전략 수신만 멈춘다.
      const badField = strategyEventContractField(ev);
      if (badField !== null) {
        strategyContractViolation = { seq: ev.seq, field: badField };
        logger.error(
          { msgType, index: i, seq: ev.seq, field: badField, accepted: strategyEvents.length },
          "[DMA] 전략 이벤트 필수 키 계약 위반 — 이 이벤트부터 올리지 않는다(앞 이벤트까지만 적재)",
        );
        break;
      }
      // 시세 이벤트(kind 1·2)는 계좌가 원래 "" 다 — 형식 이상으로 세지 않는다(G1 ⓔ).
      if (ev.accountNo !== "" && !isValidAccountNo(ev.accountNo)) {
        badStrategyAccount += 1;
        if (sampleStrategyAccount === null) {
          sampleStrategyAccount = ev.accountNo;
          sampleStrategySeq = ev.seq;
        }
      }
      if (!isValidIsin(ev.isin)) badStrategyIsin += 1;
      strategyEvents.push(ev);
    }

    if (badStrategyAccount > 0 || badStrategyIsin > 0) {
      logger.warn(
        {
          msgType,
          strategyEvents: strategyEvents.length,
          badAccount: badStrategyAccount,
          badIsin: badStrategyIsin,
          sampleSeq: sampleStrategySeq,
          sampleAccountLen: sampleStrategyAccount?.length ?? null,
          sampleAccount: sampleStrategyAccount === null ? null : maskAccountNo(sampleStrategyAccount),
        },
        "[DMA] 전략 이벤트 형식 이상 — 버리지 않고 그대로 올린다 (seq 갭 루프 방지)",
      );
    }

    return {
      records,
      headSeq: toNum(r.headSeq(), "journal_batch.head_seq"),
      // 잘렸으면 따라잡은 것이 아니다 — live 전이를 다음 배치로 미룬다.
      caughtUp: r.caughtUp() && n === rawCount,
      strategyEvents,
      strategyHeadSeq: toNum(r.strategyHeadSeq(), "journal_batch.strategy_head_seq"),
      strategyCaughtUp: r.strategyCaughtUp() && nStrategy === rawStrategyCount && strategyContractViolation === null,
      strategyContractViolation,
    };
  } catch (err) {
    return dropField("parse-throw", msgType, { error: err instanceof Error ? err.name : "unknown" });
  }
}

/**
 * 와이어 `StrategyEvent` 1건 → 도메인 레코드 (43필드 · 이름 변환 + 64비트 → number 만). 값 보정 0.
 *
 * 64비트 칸은 전부 `toNum`(D-34 유일 경계)을 지난다 — `gw_time_ms` 는 `long` 이고 저널은 `ulong` 이지만 경계
 * 뒤에서는 같은 number 다(G1 ⓒ). 문자열은 `?? ""`, 벡터는 `readNumVector`(상한 있는 순회 — 계약 길이는 0~3,
 * 상한은 깨진 벡터 길이로 순회가 폭주하는 것만 막는다).
 */
function readStrategyEvent(w: WireStrategyEvent): StrategyEventRecord {
  const snapQty = readNumVector(w.snapQtyLength(), (j) => w.snapQty(j), MAX_STRATEGY_SNAP_COUNT, "strategy_event.snap_qty");
  const snapCum = readNumVector(w.snapCumLength(), (j) => w.snapCum(j), MAX_STRATEGY_SNAP_COUNT, "strategy_event.snap_cum");
  return {
    seq: toNum(w.seq(), "strategy_event.seq"),
    tradeDate: w.tradeDate() ?? "",
    gwTimeMs: toNum(w.gwTimeMs(), "strategy_event.gw_time_ms"),
    kind: w.kind(),
    group: w.group(),
    exchange: w.exchange() ?? "",
    isin: w.isin() ?? "",
    cumVolume: toNum(w.cumVolume(), "strategy_event.cum_volume"),
    dmaUserId: w.dmaUserId() ?? "",
    accountNo: w.accountNo() ?? "",
    orderNo: w.orderNo() ?? "",
    price: w.price(),
    qty: w.qty(),
    orderCondition: w.orderCondition() ?? "",
    reasonCode: w.reasonCode() ?? "",
    condThreshold: toNum(w.condThreshold(), "strategy_event.cond_threshold"),
    condActual: toNum(w.condActual(), "strategy_event.cond_actual"),
    condMetric: w.condMetric(),
    evKind: w.evKind(),
    evPrice: w.evPrice(),
    evQtyBefore: toNum(w.evQtyBefore(), "strategy_event.ev_qty_before"),
    evQtyAfter: toNum(w.evQtyAfter(), "strategy_event.ev_qty_after"),
    evTradeQty: toNum(w.evTradeQty(), "strategy_event.ev_trade_qty"),
    limitBidQty: toNum(w.limitBidQty(), "strategy_event.limit_bid_qty"),
    bid1Price: w.bid1Price(),
    bid1Qty: toNum(w.bid1Qty(), "strategy_event.bid1_qty"),
    acceptLatencyUs: w.acceptLatencyUs(),
    immediateFillQty: toNum(w.immediateFillQty(), "strategy_event.immediate_fill_qty"),
    queueCase: w.queueCase(),
    baseCum: toNum(w.baseCum(), "strategy_event.base_cum"),
    aheadQty: toNum(w.aheadQty(), "strategy_event.ahead_qty"),
    expectedCum: toNum(w.expectedCum(), "strategy_event.expected_cum"),
    errorVolume: toNum(w.errorVolume(), "strategy_event.error_volume"),
    remainingVolume: toNum(w.remainingVolume(), "strategy_event.remaining_volume"),
    hasRemaining: w.hasRemaining(),
    cancelReason: w.cancelReason(),
    resultCode: w.resultCode(),
    message: w.message() ?? "",
    entryRound: w.entryRound(),
    snapQty,
    snapCum,
    askQtyAtLimit: toNum(w.askQtyAtLimit(), "strategy_event.ask_qty_at_limit"),
    openAtLimit: w.openAtLimit(),
  };
}
