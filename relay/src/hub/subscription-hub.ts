/**
 * Phase 15 Plan 04 — RELAY-01. 종목 구독 참조계수 + 스냅샷 캐시 + Ready 재구독.
 *
 * gh-radar 에 선례가 없는 모듈이라 15-RESEARCH §Pattern 5 가 설계 정본이다.
 * "누가 무엇을 보고 있는가"를 아는 **유일한 객체**이며, 브라우저 소켓 수(탭)와
 * 게이트웨이 구독 수를 분리한다 — 탭 3개가 같은 종목을 봐도 KB 방향 구독은 1개다.
 *
 * 결정 근거:
 *   D-13  키에 **userId 를 포함한다**. 세션이 사용자별이므로 구독도 사용자별이다.
 *         전역 키를 쓰면 A 사용자의 해제가 B 세션의 구독을 끊는다.
 *   D-33  0→1 전이에서 `GetQuoteReq(28)` → `SubscribeQuoteReq(29, true)` →
 *         `GetTradeTapeReq(32)`. 1→0 에서 `SubscribeQuoteReq(29, false)`.
 *         체결 테이프는 **별도 구독이 없다**(시세 구독 편승) — 해제 프레임도 없다.
 *   level (quick-260923-ge2) — `SubscribeQuoteReq.level` 은 FULL(0, 59+71+75) / PRICE(1, 59 만).
 *         참조계수는 키당 `{full, price}` 두 칸이고 업스트림 level = full ≥1 ? FULL : PRICE 다.
 *           · 0→1 PRICE            = 28 → 29(level=1). 32 없음(71 이 오지 않는다).
 *           · 0→1 FULL             = 28 → 29(level=0) → 32 (종전 D-33 그대로).
 *           · PRICE→FULL 승격      = 28 → 29(level=0) → 32 를 **다시** 보낸다 — 서버는 구독 직후
 *                                    스냅샷이 없고 같은 키 재구독을 level 덮어쓰기로 처리한다.
 *           · FULL→PRICE 강등      = 29(level=1) 1건.
 *           · 마지막 소비자 이탈   = 29(subscribe=false) 1건 (level 무관 해제).
 *           · `resubscribeAll`     = 키마다 실효 level 로 되건다.
 *         모르는 level 은 FULL 로 접는다 — 더 가벼운 경로로 열화시키지 않는다(서버 규칙과 동형).
 *         75 거래원도 FULL 전용이다. 출처: gh-trade 회신 `tasks/gh-trade-price-only-quote-subscription-reply.md`
 *         (quick-260923-exo) · fbs `SubscribeQuoteReq` 주석.
 *   D-35  시세는 **추가 코얼레싱을 하지 않는다**(업스트림 100ms 를 그대로 통과).
 *         체결 테이프만 200ms 배치로 묶는다. 배치 타이머는 키마다가 아니라
 *         **사용자(세션) 단위 1개**다 — 종목 10개를 보면 타이머 10개가 도는 구조를 만들지 않는다.
 *   D-36  `ServerMessage(54)` 는 해석하지 않고 그대로 흘린다.
 *   D-23  계좌 상태(잔고·미체결)는 **종목 구독과 무관**하다. 세션 `ready` 마다
 *         `GetAccountStateReq(25)`{account_no:""} 를 1회 보내 전 계좌 스냅샷(66)을 받고,
 *         이후 델타(67)를 반영한다. 참조계수 경로에 얹지 않는 이유가 이것이다 —
 *         아무 종목도 구독하지 않은 사용자도 자기 잔고는 봐야 한다.
 *   D-37  브라우저 재접속·다중 탭에서 **스냅샷 캐시가 즉시 응답**한다. 그래서 캐시는
 *         참조계수가 0 이 되어도 버리지 않는다 — 재접속 왕복 동안 살아 있어야 의미가 있다.
 *   D-12  전략(상따 전수 · VI 설정 · VI 주문 추적)도 **세션 단위 캐시**를 여기 둔다.
 *         사용자당 DMA 세션이 1개이므로 「그 사용자의 전략이 지금 무엇인가」를 아는 객체도
 *         하나여야 한다. 캐시가 있어야 새 탭이 붙자마자 **종목 구독 없이** 전략을 본다 —
 *         계좌 캐시(D-23/D-37)와 같은 이유이고 같은 4점 세트(맵 · 프리페치 · case · 폐기)다.
 *   D-13  전략 재조회는 **재접속(`ready`) 시에만** 일어난다. 주기 타이머·수동 새로고침
 *         진입점을 만들지 않는다 — 사용자 조작에 대한 60/61 에코는 Notice(유실 없음)라
 *         재조회로 메울 것이 없고, 폴링은 게이트웨이 왕복을 사용자 수에 비례시킨다.
 *   Pitfall 4  재구독 트리거는 세션의 `ready` 이벤트 **하나뿐**이다. 재구독 경로를 두 벌
 *              만들면 "재접속 후 새로고침해야 시세가 나온다" 증상이 생긴다.
 *   T-15-02  팬아웃은 `{userId, msg}` 로만 나간다. 전역(사용자 무관) 브로드캐스트
 *            경로를 **만들지 않는 것**이 타인 체결·잔고 유출의 구조적 방어다.
 *   S-5      구독 실패·이중 해제·세션 부재는 전부 사유와 함께 로그를 남긴다.
 *
 * 캐시에 담는 형태는 **이미 Number 로 좁혀진 wire JSON**(`RelayQuote`/`RelayTapeEntry`)이다.
 * 게이트웨이의 64비트 정수 변환은 `envelope.ts` 파서가 한 번만 하고, 여기서는 매 push 마다
 * 재변환하지 않는다 (D-34).
 *
 * 하지 않는 것:
 *   - 소켓을 모른다. 어떤 소켓에 보낼지는 `ws/fanout.ts` 가 `userId` 로 정한다.
 *   - 세션을 만들거나 닫지 않는다. 그것은 `SessionManager` 소관이다.
 *   - 구독 요청을 큐잉하지 않는다. Ready 이전 구독은 참조계수에만 남고 `ready` 가 복원한다.
 */
import { EventEmitter } from "node:events";

import type {
  RelayAccountState,
  RelayExchange,
  RelayLimitChaser,
  RelayOrderMsg,
  RelayOutbound,
  RelayQueuedWindowMsg,
  RelayQuote,
  RelayRateCrossItem,
  RelaySubLevel,
  RelayTape,
  RelayTapeEntry,
  RelayViNoticeMsg,
  RelayViOrderItem,
  RelayViTrigger,
} from "@gh-radar/shared";

import { logger } from "../logger.js";
import type { TransportFrameEvent } from "../dma/dma-client.js";
import type { SessionReadyEvent } from "../dma/session.js";
import {
  MAX_TAPE_ENTRY_COUNT,
  QUOTE_LEVEL,
  buildGetAccountStateReq,
  buildGetLimitChaserListReq,
  buildGetQuoteReq,
  buildGetTradeTapeReq,
  buildGetVIOrderListReq,
  buildGetVITriggerReq,
  buildSubscribeQuoteReq,
  maskAccountNo,
  parseAccountState,
  parseDisableStrategiesResp,
  parseLimitChaserEcho,
  parseLimitChaserList,
  parseOrderResp,
  parseQueuedWindowState,
  parseQuoteState,
  parseRateCrossAlert,
  parseRateCrossSnapshot,
  parseServerMessage,
  parseSymbolMasterFrame,
  parseTradeTape,
  parseViOrderList,
  parseViOrderNotice,
  parseViTrigger,
  type ParsedOrderResp,
  type ParsedSymbolMasterFrame,
  type QuoteLevelByte,
} from "../dma/envelope.js";
import { MSG } from "../dma/msg-type.js";
import type { SymbolLookup } from "../store/symbols.js";

// ============================================================
// 상수 정본
// ============================================================

/**
 * 체결 테이프 배치 주기(ms) = 200 (D-35).
 * 시세(호가)는 여기를 타지 않는다 — 업스트림 코얼레싱을 그대로 통과시킨다.
 */
export const TAPE_BATCH_MS = 200;

/**
 * 체결 테이프 링버퍼 상한(건). 파서 상한(`MAX_TAPE_ENTRY_COUNT` = 200건)과 **같은 값**을
 * 참조한다 — 두 곳에 수치를 따로 적으면 한쪽만 고쳐진다 (IN-01).
 * 브라우저 훅(`use-relay-socket.ts` 의 `MAX_TAPE`)도 같은 값이다.
 */
export const TAPE_RING_SIZE = MAX_TAPE_ENTRY_COUNT;

/** `GetTradeTapeReq(32)` 로 요청하는 초기 체결 건수. 링버퍼 상한과 같다. */
export const TAPE_REQUEST_COUNT = TAPE_RING_SIZE;

// ============================================================
// 계약
// ============================================================

/**
 * Hub 가 세션에 요구하는 최소 표면. `DmaSession` 이 그대로 만족한다.
 *
 * 구체 클래스가 아니라 이 인터페이스에 의존하는 이유는 테스트가 소켓 없이 프레임을
 * 주입할 수 있어야 하기 때문이다 — 세션 상태기계 자체는 15-03 이 이미 증명했다.
 */
export interface HubSession {
  /** gh-radar 사용자 id. 팬아웃 대상 선택의 유일한 기준이다 (T-15-02). */
  readonly userId: string;
  /** 운용 준비 여부. false 면 구독 프레임을 보내지 않는다. */
  readonly isReady: boolean;
  /** 게이트웨이 요청 프레임 송신. */
  send(payload: Uint8Array): boolean;
  on(event: "frame", listener: (e: TransportFrameEvent) => void): unknown;
  on(event: "ready", listener: (e: SessionReadyEvent) => void): unknown;
}

/**
 * 게이트웨이 종목마스터 보조 원천(quick-260923-cqj)이 hub 에 요구하는 표면.
 * `GatewaySymbolMaster` 가 구조적으로 만족한다 — 테스트는 스텁을 넣을 수 있다.
 */
export interface HubSymbolMasterFeed {
  /** 세션 Ready. relay 전체 1일 1회 게이팅은 피드가 쥔다(사용자별 재조회가 아니다). */
  onSessionReady(session: HubSession): void;
  /** 57 한 프레임(파싱 실패는 `null`)과 그 프레임이 온 세션의 userId. */
  onFrame(userId: string, frame: ParsedSymbolMasterFrame | null): void;
}

/** 팬아웃 1건. **대상은 언제나 특정 userId 하나**다 (T-15-02). */
export type HubFanoutEvent = { userId: string; msg: RelayOutbound };

/**
 * 주문 통보 1건 (`OrderResp(51)`), **파싱된 원문 그대로**.
 *
 * 브라우저로 나가는 `{t:"order"}` 팬아웃과 **별도**로 낸다. 팬아웃은 계약 타입(`RelayOrderMsg`)
 * 이라 상관에 필요한 값(`sideTrusted` 등)이 빠져 있기 때문이다. 이 이벤트는 order-handler 의
 * rid 즉시응답 상관 전용이고, `{t:"order"}` 팬아웃은 브라우저 토스트·전략 로그 표면 전용이다
 * (Phase 19 D-01·D-03 — 기록은 관찰자 기록기 단독). 팬아웃이 먼저이고 이 이벤트가 나중이다.
 */
export type HubOrderEvent = { userId: string; notice: ParsedOrderResp };

/** `/healthz` 용 요약. 식별자(userId·ISIN)를 담지 않는다. */
export type HubStats = {
  sessionCount: number;
  subscriptionCount: number;
  cachedQuoteCount: number;
  /** 캐시된 계좌 상태 **개수**. 계좌번호는 담지 않는다. */
  cachedAccountCount: number;
  /** 캐시된 상따 전략 **개수**. ISIN·계좌번호는 담지 않는다 (D-12). */
  cachedLimitChaserCount: number;
  /** VI 전략을 **조회한 적이 있는** 사용자 수. 미등록(`null`)도 1로 센다. */
  cachedViTriggerCount: number;
  /** 캐시된 VI 주문 추적 **개수**. */
  cachedViOrderCount: number;
  /** 캐시된 등락률 돌파 above 원소 **개수**. ISIN 은 담지 않는다 (17-03). */
  cachedRateCrossCount: number;
  /**
   * `#onFrame` 의 `default:` 도달 누적 수 (T-17-10).
   * **운영에서도 0 이어야 한다** — 0 이 아니면 받아 줄 case 없는 번호가 유입되고 있다.
   */
  unhandledFrameCount: number;
};

export interface SubscriptionHub {
  on(event: "fanout", listener: (e: HubFanoutEvent) => void): this;
  on(event: "order", listener: (e: HubOrderEvent) => void): this;
  emit(event: "fanout", e: HubFanoutEvent): boolean;
  emit(event: "order", e: HubOrderEvent): boolean;
}

/** 플러시 대기 중인 체결 배치 1건. */
type PendingTape = {
  isin: string;
  exchange: RelayExchange;
  /** true 면 전량 교체(69 스냅샷)로 나간다. */
  snap: boolean;
  entries: RelayTapeEntry[];
};

/** 키당 level 별 참조계수 (quick-260923-ge2). */
type SubRefs = { full: number; price: number };

function totalRefs(refs: SubRefs): number {
  return refs.full + refs.price;
}

/** 업스트림 실효 level — FULL 소비자가 하나라도 있으면 FULL. */
function effectiveLevel(refs: SubRefs): RelaySubLevel {
  return refs.full > 0 ? "full" : "price";
}

/** `"price"` 만 PRICE 바이트다. 그 밖은 전부 FULL — 모르는 값을 가벼운 경로로 열화시키지 않는다. */
function levelByte(level: RelaySubLevel): QuoteLevelByte {
  return level === "price" ? QUOTE_LEVEL.PRICE : QUOTE_LEVEL.FULL;
}

/** 구독 키. **userId 를 포함한다** — 사용자 간 구독 교차를 구조적으로 막는다 (D-13). */
function subKey(userId: string, isin: string, exchange: RelayExchange): string {
  return `${userId}|${isin}|${exchange}`;
}

/** 키 접두어. 특정 사용자의 키만 훑을 때 쓴다. */
function userPrefix(userId: string): string {
  return `${userId}|`;
}

/**
 * 상따 캐시 키. **`item.key` 를 그대로 쓴다** — 재조립하지 않는다.
 *
 * 전략 키(`ISIN:계좌:거래소`)의 조립 지점은 `envelope.ts` 의 `strategyKey()` 하나뿐이다.
 * 여기서 다시 만들면 12자 절단·거래소 정규화 중 한쪽만 반영돼 키가 갈리고, 갈린 키는
 * 「에코가 영원히 매칭되지 않는다」라는 조용한 실패가 된다.
 */
function lcKey(userId: string, item: RelayLimitChaser): string {
  return `${userId}|${item.key}`;
}

/**
 * 등락률 돌파 above 집합 캐시 키 (17-03 · quick-260926-rcc).
 *
 * 키는 **ISIN 하나**다 — 거래소를 넣지 않는다. gh-trade quick-260923-cfo 결정 A 로 서버 상태가
 * ISIN 당 1개이고, 76 의 exchange 는 발화 체결의 거래소 · 78 원소의 exchange 는 above 구간을
 * 연 거래소(KRX 접속매매 세션이 닫힌 시간의 NXT 접속매매도 판정하므로 NXT 일 수 있다)다.
 * 그래서 **뒤에 온 76 이 거래소째 덮는다**. 거래소를 키에 두면 KRX 행 뒤 NXT 재돌파가 다음
 * 78 까지 두 원소로 남는다. 브라우저 리듀서 `upsertRateCross` · 스트립 `breakoutKey` 가 같은 축이다.
 * 앞에 `userId` 를 붙이는 것은 `subKey` 와 같은 규율이다 (T-17-08).
 */
function rateCrossKey(userId: string, isin: string): string {
  return `${userId}|${isin}`;
}

/**
 * 등락률 돌파 목록 정렬 — **`exchangeTime` 내림차순 · 동률이면 `isin` 오름차순** (사본 정렬).
 *
 * 사용자 결정 2026-09-22 — 최신 돌파가 맨 위. 서버 78 원순서(오름차순)와 무관하게 relay 가
 * 내리는 순서는 이 헬퍼 한 곳이 정한다 (인증 직후 스냅샷 `getRateCrossItems` · 78 팬아웃).
 * 웹 리듀서 `sortRateCross`(webapp `use-relay-socket.ts`)가 같은 축이다 — 한쪽만 바꾸면 76/78
 * 경로의 순서가 갈린다 (D-14).
 *
 * `exchangeTime` 은 above 구간을 **연** 시각이라, 같은 구간 안의 76 갱신은 자리를 지키고
 * 이탈 후 재돌파(새 구간)만 맨 위로 오른다. 캐시(`#rateCrossItems`)는 정렬하지 않는다.
 */
function sortRateCrossNewestFirst(items: readonly RelayRateCrossItem[]): RelayRateCrossItem[] {
  return [...items].sort((a, b) =>
    a.exchangeTime === b.exchangeTime
      ? a.isin.localeCompare(b.isin)
      : b.exchangeTime.localeCompare(a.exchangeTime),
  );
}

/**
 * VI 주문 캐시 키. 정본은 `orderNo` 지만 **접수 전에는 그 값이 `""`** 라 키가 되지 못한다
 * (파서가 `""` 를 보존하는 이유 — 빈 주문번호로는 확인 체크를 열 수 없다).
 *
 * 그 한 경우에만 `viPendingKey` 복합키로 대신한다.
 *
 * ⚠️ **주문번호가 있는 행의 키에는 거래소를 덧붙이지 않는다** (17-05 / T-17-18). 주문번호는
 *    이미 유일하고, 여기에 거래소를 더하면 72 스냅샷과 73 델타가 서로 다른 거래소 표기를
 *    실어 올 때 키가 갈려 **같은 주문이 두 줄로** 남는다. 거래소가 필요한 곳은 주문번호가
 *    아직 없는 대체 키뿐이다.
 */
function viOrderKey(userId: string, item: RelayViOrderItem): string {
  if (item.orderNo !== "") return `${userId}|${item.orderNo}`;
  return viPendingKey(userId, item);
}

/**
 * 접수 전 항목의 자리표시 키. 주문번호가 붙는 순간 이 키를 **지우고** 주문번호 키로 옮긴다 —
 * 지우지 않으면 같은 주문이 「접수 전」과 「접수됨」 두 줄로 남는다.
 *
 * **거래소가 키의 일부다** (17-05 / D-06). R8 해제·연장 전문 매칭이 ISIN+거래소라 같은 종목이
 * KRX·NXT 양쪽에서 발동할 수 있고, 그 두 발동은 ISIN·계좌·발동가가 모두 같을 수 있다.
 * 거래소를 빼면 두 행이 한 줄로 겹쳐 **한쪽 주문이 화면에서 사라진다**.
 */
function viPendingKey(userId: string, item: RelayViOrderItem): string {
  return `${userId}|@${item.isin}:${item.accountNo}:${item.triggerPrice}:${item.exchange}`;
}

/**
 * VI 전략 캐시 키 (17-05 / D-06). 서버가 **거래소별 1건**으로 관리하므로 캐시도 거래소별이다.
 *
 * `userId` 만으로 키를 잡으면 NXT 응답이 KRX 행을 덮어 「KRX 에 등록했는데 NXT 설정이 보인다」가
 * 된다. 앞에 `userId` 를 붙이는 규율은 `subKey` 와 같다 (T-16-02).
 */
function viTriggerKey(userId: string, exchange: RelayExchange): string {
  return `${userId}|${exchange}`;
}

/**
 * Ready 프리페치가 VI 전략을 조회하는 거래소 (17-05 / D-06).
 *
 * **순서가 곧 FIFO 귀속 순서**다 — 빈 61 에는 거래소가 없어 요청 순서가 유일한 근거이므로,
 * 여기 순서와 `#pendingViGets` 에 넣는 순서가 어긋나면 두 칸이 통째로 바뀐다.
 */
const VI_PREFETCH_EXCHANGES: readonly RelayExchange[] = ["KRX", "NXT"];

/**
 * 이름 없는(`undefined`·`""`) 행에만 종목명(과 선택적으로 단축코드)을 채운다 (`refreshNames` 전용).
 *
 * 기존 보강(`#enrichNames` 등)을 재사용하지 않는 이유: 그쪽은 이미 이름이 있는 행도 덮어쓰고
 * 미해석 로그를 남긴다. 여기서는 「이번에 새로 풀린 행」만 골라야 재방송 대상이 정확하다.
 * 바뀌지 않으면 **같은 참조**를 돌려준다 — 호출부가 참조 비교로 변경을 판정한다.
 */
function fillMissingName<T extends { isin: string; name?: string; code?: string }>(
  symbols: SymbolLookup,
  row: T,
  withCode: boolean,
): T {
  if (row.name !== undefined && row.name !== "") return row;
  const info = symbols.lookup(row.isin);
  if (info === undefined) return row;
  return withCode ? { ...row, name: info.name, code: info.code } : { ...row, name: info.name };
}

/**
 * 구독 참조계수 + 스냅샷 캐시의 단일 정본.
 *
 * 사용법: 세션을 얻은 직후 `attach(session)` → 브라우저 `sub`/`unsub` 마다
 * `subscribe`/`unsubscribe` → `"fanout"` 이벤트를 그 userId 의 소켓 집합에만 전송.
 */
export class SubscriptionHub extends EventEmitter {
  /** userId → 세션. 세션이 교체되면 여기가 정본이고 옛 리스너는 침묵한다. */
  readonly #sessions = new Map<string, HubSession>();
  /** `${userId}|${isin}|${exchange}` → level 별 참조계수 (quick-260923-ge2). */
  readonly #refs = new Map<string, SubRefs>();
  /** 스냅샷 캐시 — 이미 Number 로 좁혀진 wire JSON 이다 (D-34/D-37). */
  readonly #quotes = new Map<string, RelayQuote>();
  /** 체결 링버퍼 (키당 최근 `TAPE_RING_SIZE` 건). */
  readonly #tapes = new Map<string, RelayTapeEntry[]>();
  /** userId → (키 → 플러시 대기 배치). */
  readonly #pending = new Map<string, Map<string, PendingTape>>();
  /** userId → 배치 타이머 1개 (키 단위로 만들지 않는다 — D-35). */
  readonly #flushTimers = new Map<string, NodeJS.Timeout>();
  /**
   * `${userId}|${accountNo}` → **누적 반영된 전량 스냅샷** (D-23/D-37).
   *
   * 델타(67)를 받아도 여기에는 항상 `snap:true` 인 전량 뷰를 둔다 — 새 탭이 붙었을 때
   * 그대로 1프레임으로 내려보낼 수 있어야 하기 때문이다. 와이어로 나가는 델타는
   * 가공하지 않고 원본 그대로 흘린다(브라우저가 같은 병합을 한다).
   */
  readonly #accountStates = new Map<string, RelayAccountState>();
  /**
   * `${userId}|${item.key}` → 상따 전략 1건 (D-12).
   *
   * **정본은 게이트웨이**이고 여기는 그 뷰다 — 60 에코와 64 목록이 같은 바이트라
   * 두 경로가 같은 맵을 채운다. `crud === "D"` 는 삭제이므로 여기서 지운다(Pitfall 7:
   * 「삭제됨」은 스위치가 아니라 이 값으로 판정한다).
   *
   * 이 캐시가 여기 있어야 새 탭이 붙자마자 **종목 구독 없이** 목록을 그린다.
   */
  readonly #limitChasers = new Map<string, RelayLimitChaser>();
  /**
   * `userId` 집합 — **게이트웨이 64(목록 전량)를 이 세션에서 받았는가** (18-26 / GC-IN-02).
   *
   * `#viTriggers` 의 3상태와 같은 규율이다. 캐시가 비어 있다는 것만으로는 「등록 전략 없음」
   * (64 가 빈 목록으로 왔다)과 「아직 모름」(콜드 세션 · 세션 교체 직후 64 전)을 가를 수
   * 없다. 둘을 뭉개면 인증 경로가 빈 캐시를 `lc.snap []` 으로 내려 「모름」을 「없음」으로
   * 말하고, 브라우저는 그 거짓 확정 위에서 포커스 보류를 판정한다.
   *
   * **60 에코는 기록하지 않는다** — 에코는 1건만 말할 뿐 목록 전체를 말하지 않는다. 모르면
   * `lc.snap` 을 지어내지 않고, 곧 오는 64 팬아웃이 그 연결의 첫 `lc.snap` 이 된다.
   * 세션 교체(`#clearCaches`)·`closeAll` 이 캐시와 **같이** 지운다.
   */
  readonly #limitChaserKnown = new Set<string>();
  /**
   * `${userId}|${exchange}` → VI 전략 (17-05 / D-06).
   *
   * 서버는 VI 전략을 **세션당 거래소별 1건**(KRX 1 + NXT 1)으로 관리한다. 한 칸으로 두면
   * 나중에 온 거래소의 답이 앞 칸을 덮어, KRX 에 등록한 사용자가 NXT 의 「미등록」을 본다.
   *
   * **`null` 을 명시로 저장한다.** 「조회했더니 미등록」(`null`)과 「아직 조회한 적 없음」
   * (키 부재 = `getViTrigger` 가 `undefined`)은 다른 상태다. 둘을 뭉개면 인증 직후
   * 팬아웃이 「미등록」을 지어내 보내고, 브라우저가 사용자가 입력한 금액을 지운다.
   * **거래소마다 독립으로** 이 3상태를 판정한다.
   */
  readonly #viTriggers = new Map<string, RelayViTrigger | null>();
  /**
   * `userId` → **보낸 21 요청의 거래소 FIFO** (17-05 / D-06 / Pitfall 3 — C# `_pendingViGets`).
   *
   * 미등록 응답(빈 61)에는 본문이 없어 **거래소가 실리지 않는다**. 요청 순서가 그 응답을
   * 귀속할 유일한 근거다. 규약 4개(C# `Client.cs:2187-2214`, `:3038`):
   *   (a) 본문 없음 → head 를 **꺼내** 귀속한다. 큐가 비면 귀속 실패 — 캐시를 고치지 않는다.
   *   (b) 본문 있고 거래소 == head → 내 요청의 답이므로 head 를 버린다.
   *   (c) 본문 있고 거래소 != head → 팬아웃 에코(Set/Disable/푸시)다 — 큐를 건드리지 않는다.
   *   (d) 세션 교체·재로그인 → **비운다**. 남기면 다음 세션의 빈 응답이 옛 거래소로 귀속된다.
   *
   * ⚠️ 상따 `lc.arm`·`lc.set` 은 이 큐에 넣지 않는다 — 그 응답은 본문에 키가 있는 60 에코라
   *    귀속이 필요 없고, 넣으면 head 를 아무도 꺼내지 않아 다음 빈 61 이 옛 값으로 귀속된다.
   */
  readonly #pendingViGets = new Map<string, RelayExchange[]>();
  /**
   * `${userId}|${orderNo}` (접수 전은 `viPendingKey`) → VI 주문 추적 1건.
   *
   * 72 는 전량 교체, 73 은 항목 upsert 다 — 계좌 상태의 `snap` 규약과 동형이다.
   * `confirm_locked` 되돌림 같은 단건 변경도 73 한 경로로 온다.
   */
  readonly #viOrders = new Map<string, RelayViOrderItem>();
  /**
   * `${userId}|${isin}:${exchange}` → 등락률 돌파 above 집합 1원소 (17-03 / D-03).
   *
   * 키에 거래소가 들어가는 이유는 **같은 종목이 양쪽 거래소에서 돌파하면 원소가 둘**이기
   * 때문이다. 키 앞의 `userId` 는 `#quotes`/`#limitChasers` 와 같은 규율 — 사용자 간
   * above 집합 교차를 구조적으로 막는다 (T-17-08).
   *
   * ⚠️ **서버 above 집합을 그대로 보관한다.** 하루 1회 알림 규칙과 임계−2%p 이탈 삭제는
   *    클라(Phase 18) 몫이다 — relay 가 집합을 가공하면 서버 재무장 폭과 갈린다 (D-03).
   */
  readonly #rateCrossItems = new Map<string, RelayRateCrossItem>();
  /**
   * `userId` → 예약·장전·시간외종가 발주 창 상태 **최신 1건** (17-03 / D-03).
   *
   * 키 부재(= `getQueuedWindow` 가 `undefined`)는 「77 을 아직 못 받았다」이고 `open:false`
   * 와 **다른 상태**다. `#viTriggers` 의 3상태 규율과 같은 이유로 뭉개지 않는다.
   */
  readonly #queuedWindows = new Map<string, RelayQueuedWindowMsg>();
  /**
   * `#onFrame` 의 `default:` 도달 누적 수 (17-03 / T-17-10).
   *
   * 「조용히 떨어지는 프레임 0」을 **측정 가능한 값**으로 만든다. `envelope.ts` 의 드롭
   * 카운터와 나누는 이유: 저쪽은 「화이트리스트 밖이라 파서 전에 버렸다」이고 이쪽은
   * 「화이트리스트는 통과했는데 받아 줄 case 가 없다」 — 후자만이 PC-12 위반이다.
   */
  #unhandledFrames = 0;
  /**
   * ISIN → 종목명·단축코드. 게이트웨이가 이름을 주지 않으므로 여기서 채운다.
   * 없으면(주입 안 함/미스) 필드를 비워 두고 UI 가 ISIN 원문으로 폴백한다.
   */
  readonly #symbols: SymbolLookup | undefined;
  /** 게이트웨이 종목마스터 보조 원천(27/57). 없으면 57 은 명시 case 에서 버려진다. */
  readonly #symbolMaster: HubSymbolMasterFeed | undefined;

  constructor(opts?: { symbols?: SymbolLookup; symbolMaster?: HubSymbolMasterFeed }) {
    super();
    this.#symbols = opts?.symbols;
    this.#symbolMaster = opts?.symbolMaster;
  }

  // ----------------------------------------------------------
  // 세션 결선
  // ----------------------------------------------------------

  /**
   * 세션을 Hub 에 연결한다. **멱등**이다 — 같은 세션으로 여러 번 불러도 리스너는 1벌이다
   * (탭이 늘 때마다 `attach` 가 호출되므로 이 성질이 필수다).
   *
   * 세션 **객체가 바뀐 경우**(회선 실패 후 재생성)에는 옛 캐시를 버린다. 옛 세션의
   * 업스트림 구독은 그 TCP 와 함께 사라졌고, 참조계수는 "브라우저가 여전히 보고 있다"는
   * 사실이므로 남긴다 — 새 세션의 `ready` 가 전량 재구독으로 복원한다 (Pitfall 4).
   */
  attach(session: HubSession): void {
    const userId = session.userId;
    const prev = this.#sessions.get(userId);
    if (prev === session) return;

    if (prev !== undefined) {
      logger.info(
        { userId, subscriptions: this.#countKeys(userId) },
        "[HUB] 세션 교체 — 캐시 폐기, 참조계수 유지 (ready 에서 전량 재구독)",
      );
      this.#clearCaches(userId);
    }

    this.#sessions.set(userId, session);
    // 옛 세션의 리스너는 떼지 않고 **정본 대조로 침묵시킨다** (15-03 generation 규율 동형).
    session.on("frame", (e) => this.#onFrame(userId, session, e));
    session.on("ready", () => this.#onReady(userId, session));
    logger.info({ userId }, "[HUB] 세션 결선");
  }

  // ⚠️ `detach(userId)` 가 여기 있었다 — **삭제됐다** (R2-IN-02). 호출자가 `relay/src` ·
  //    `relay/tests` 어디에도 없었고, 세션 상태를 파괴하는 공개 메서드가 남아 있으면
  //    「정리하려면 이것을 부르면 된다」는 오해를 만든다. 실제로는 **부르면 안 됐다** —
  //    `#sessions` 에서 지우기만 하고 `attach` 가 건 `session.on("frame"/"ready")` 는
  //    떼지 않아, 그 세션이 살아 있는 한 리스너가 계속 쌓인다.
  //    프로세스 종료 경로의 정본은 `closeAll()` 이고, 소켓 1개가 닫히는 경로는
  //    `unsubscribe` 를 그 소켓이 잡고 있던 키마다 부르는 것이다.

  // ----------------------------------------------------------
  // 구독 참조계수 (D-33)
  // ----------------------------------------------------------

  /**
   * 참조계수 +1 (level 별). **0→1** 과 **PRICE→FULL 승격**에서만 게이트웨이로 구독 프레임이 나간다.
   * `level` 생략은 FULL — 기존 호출부는 종전과 같다.
   */
  subscribe(
    userId: string,
    isin: string,
    exchange: RelayExchange,
    level: RelaySubLevel = "full",
  ): void {
    const key = subKey(userId, isin, exchange);
    let refs = this.#refs.get(key);
    if (refs === undefined) {
      refs = { full: 0, price: 0 };
      this.#refs.set(key, refs);
    }
    const prevTotal = totalRefs(refs);
    const prevLevel = prevTotal > 0 ? effectiveLevel(refs) : undefined;
    refs[level] += 1;
    const nextLevel = effectiveLevel(refs);

    if (prevTotal === 0) {
      this.#sendSubscribe(userId, isin, exchange, nextLevel);
      return;
    }
    if (prevLevel === "price" && nextLevel === "full") {
      logger.info(
        { userId, isin, exchange, level: nextLevel, refs: { ...refs } },
        "[HUB] PRICE→FULL 승격 — 스냅샷+구독+체결 재송신",
      );
      this.#sendSubscribe(userId, isin, exchange, "full");
      return;
    }
    logger.info(
      { userId, isin, exchange, level: nextLevel, refs: { ...refs }, refCount: totalRefs(refs) },
      "[HUB] 이미 구독 중 — 게이트웨이로 다시 보내지 않는다 (탭 공유)",
    );
  }

  /**
   * 참조계수 -1 (level 별). **합계 1→0** 에서 `subscribe:false`, **FULL→PRICE 강등**에서
   * 29(level=1) 1건이 나간다. 잡지 않은 level 의 해제는 무시한다.
   */
  unsubscribe(
    userId: string,
    isin: string,
    exchange: RelayExchange,
    level: RelaySubLevel = "full",
  ): void {
    const key = subKey(userId, isin, exchange);
    const refs = this.#refs.get(key);
    if (refs === undefined || refs[level] <= 0) {
      // 조용히 넘기지 않는다 — 참조계수 누수·이중 해제는 여기서만 보인다 (S-5).
      logger.warn({ userId, isin, exchange, level }, "[HUB] 참조계수 없는 해제 — 무시");
      return;
    }

    const prevLevel = effectiveLevel(refs);
    refs[level] -= 1;
    const total = totalRefs(refs);
    if (total > 0) {
      const nextLevel = effectiveLevel(refs);
      if (nextLevel === prevLevel) {
        logger.info(
          { userId, isin, exchange, level: nextLevel, refs: { ...refs }, refCount: total },
          "[HUB] 탭 1개 해제 — 구독 유지",
        );
        return;
      }
      // FULL→PRICE 강등 — 서버는 같은 키 재구독을 level 덮어쓰기로 처리한다.
      const session = this.#sessions.get(userId);
      if (session === undefined || !session.isReady) {
        logger.info(
          { userId, isin, exchange, level: nextLevel, hasSession: session !== undefined },
          "[HUB] FULL→PRICE 강등 — 세션이 준비되지 않아 기록만 (ready 가 실효 level 로 복원)",
        );
        return;
      }
      session.send(buildSubscribeQuoteReq(isin, exchange, true, QUOTE_LEVEL.PRICE));
      logger.info(
        { userId, isin, exchange, level: nextLevel, refs: { ...refs } },
        "[HUB] FULL→PRICE 강등 — 29(level=1) 1건",
      );
      return;
    }

    this.#refs.delete(key);
    // 캐시는 남긴다 — 재접속·재구독에서 즉시 응답해야 한다 (D-37).
    const session = this.#sessions.get(userId);
    if (session === undefined || !session.isReady) {
      logger.info(
        { userId, isin, exchange, hasSession: session !== undefined },
        "[HUB] 마지막 구독 해제 — 세션이 준비되지 않아 해제 프레임 생략",
      );
      return;
    }
    session.send(buildSubscribeQuoteReq(isin, exchange, false));
    logger.info({ userId, isin, exchange }, "[HUB] 마지막 구독 해제 — 업스트림 구독 해제");
  }

  // ⚠️ `releaseAll(userId)` 가 여기 있었다 — **삭제됐다** (R2-IN-02). `detach` 와 같은
  //    이유다: 호출자 0건인데 그 사용자의 구독·캐시를 통째로 버리는 공개 메서드였다.
  //    다른 탭이 여전히 보고 있어도 구독이 끊기므로 부르는 순간이 곧 사고다.
  //    소켓 1개가 닫히는 정상 경로는 `unsubscribe` 를 그 소켓이 잡고 있던 키마다 부르는
  //    것이고, 사용자 단위 정리가 정말 필요해지면 그때 「무엇을 보존하는가」를 정해
  //    다시 만든다 — 쓰이지 않는 채로 미리 놓아두지 않는다.

  /**
   * 세션 `ready` 에서 **Hub 가 소유한 키 집합**을 순회해 전량 재구독한다 (Pitfall 4).
   * 브라우저 상태에 의존하지 않는 것이 핵심이다 — 브라우저는 아무것도 다시 보내지 않는다.
   */
  resubscribeAll(userId: string): void {
    const prefix = userPrefix(userId);
    let count = 0;
    for (const [key, refs] of this.#refs.entries()) {
      if (!key.startsWith(prefix)) continue;
      const parts = this.#splitKey(key);
      if (parts === null) continue;
      // 키마다 **실효 level** 로 되건다 (quick-260923-ge2).
      this.#sendSubscribe(userId, parts.isin, parts.exchange, effectiveLevel(refs));
      count += 1;
    }
    logger.info({ userId, count }, "[HUB] Ready — 보유 구독 전량 재구독");
  }

  /**
   * 전 계좌 상태 스냅샷을 1회 요청한다 (D-23). `account_no` 를 **빈 문자열**로 보내면
   * 계좌당 1프레임으로 66 이 돌아온다 — 계좌를 하나씩 도는 왕복을 만들지 않는다.
   *
   * 트리거는 `ready` **하나뿐**이다(재구독과 같은 자리 — Pitfall 4). 브라우저가 탭을
   * 열 때마다 다시 요청하지 않는 이유는 캐시가 즉시 응답하기 때문이고, 그 편이
   * 게이트웨이 왕복을 사용자 수에 비례시키지 않는다.
   */
  requestAccountState(userId: string): void {
    const session = this.#sessions.get(userId);
    if (session === undefined || !session.isReady) {
      logger.warn(
        { userId, hasSession: session !== undefined },
        "[HUB] 계좌 상태 요청 생략 — 세션이 준비되지 않았다",
      );
      return;
    }
    session.send(buildGetAccountStateReq(""));
    logger.info({ userId }, "[HUB] Ready — 전 계좌 상태 스냅샷 요청");
  }

  /**
   * 전략 스냅샷 3종을 요청한다 (D-12) — 24(상따 목록) · 21(VI 설정) · 34(VI 주문 목록).
   *
   * **21 만 2회다** (17-05 / D-06): VI 전략은 서버가 거래소별 1건으로 관리하므로 KRX·NXT
   * 각각을 조회해야 한다. 24·34 는 거래소 축이 없어 1회 그대로다.
   *
   * 보낸 거래소를 **보낸 순서대로** `#pendingViGets` 에 넣는다 — 거래소를 담지 않는 빈 61 을
   * 귀속할 유일한 근거다. 넣기 전에 옛 큐를 비운다: 새 Ready 는 새 연결이고, 옛 요청의
   * 응답은 영영 오지 않는다 (규칙 (d)).
   *
   * 순서는 계약이 아니지만 목록 → 설정 → 추적 순으로 두면 로그가 화면 구성 순서와 같이 읽힌다.
   *
   * **트리거는 `ready` 하나뿐이다** (`requestAccountState` 와 같은 자리 — Pitfall 4).
   * D-13 에 따라 주기 재조회 타이머도, 브라우저가 부를 수 있는 수동 재조회 진입점도
   * 만들지 않는다 — 사용자 조작에 대한 60/61 에코는 Notice 라 유실되지 않으므로 메울 것이
   * 없고, 폴링은 게이트웨이 왕복을 탭 수에 비례시킨다.
   */
  requestStrategySnapshot(userId: string): void {
    const session = this.#sessions.get(userId);
    if (session === undefined || !session.isReady) {
      logger.warn(
        { userId, hasSession: session !== undefined },
        "[HUB] 전략 스냅샷 요청 생략 — 세션이 준비되지 않았다",
      );
      return;
    }
    session.send(buildGetLimitChaserListReq());

    // 옛 큐는 여기서 끝난다 — 이 Ready 이전에 보낸 21 의 응답은 이제 오지 않는다.
    const queue: RelayExchange[] = [];
    this.#pendingViGets.set(userId, queue);
    for (const exchange of VI_PREFETCH_EXCHANGES) {
      // 보내지 못한 요청은 큐에 넣지 않는다 — 넣으면 오지 않을 응답이 head 를 영원히 막고,
      // 그 뒤의 빈 61 이 한 칸씩 밀려 엉뚱한 거래소로 귀속된다 (C# `SendGetVITrigger` 동형).
      if (session.send(buildGetVITriggerReq(exchange))) queue.push(exchange);
    }

    session.send(buildGetVIOrderListReq());
    logger.info(
      { userId, viExchanges: [...queue] },
      "[HUB] Ready — 전략 스냅샷 요청 (21 은 거래소별 2회)",
    );
  }

  // ----------------------------------------------------------
  // 캐시 조회 (D-37)
  // ----------------------------------------------------------

  /**
   * 그 사용자의 계좌 상태 전량(누적 반영된 스냅샷) 복사본.
   *
   * 새 wss 연결이 붙었을 때 게이트웨이 왕복 없이 즉시 잔고·미체결을 그리는 데 쓴다.
   * 반환 프레임은 전부 `snap:true` 다 — 받는 쪽이 전량 교체로 처리해야 한다.
   */
  getAccountStates(userId: string): RelayAccountState[] {
    const prefix = userPrefix(userId);
    const out: RelayAccountState[] = [];
    for (const [key, state] of this.#accountStates) {
      if (key.startsWith(prefix)) out.push(state);
    }
    return out;
  }

  /**
   * 그 사용자의 상따 전략 전량 복사본 (D-12).
   *
   * 새 wss 연결이 붙었을 때 `{t:"lc.snap"}` 1프레임으로 목록을 복원하는 데 쓴다 —
   * 게이트웨이 왕복도, 종목 구독도 필요 없다.
   */
  getLimitChasers(userId: string): RelayLimitChaser[] {
    const prefix = userPrefix(userId);
    const out: RelayLimitChaser[] = [];
    for (const [key, item] of this.#limitChasers) {
      if (key.startsWith(prefix)) out.push(item);
    }
    return out;
  }

  /**
   * 이 세션에서 게이트웨이 64(상따 목록 전량)를 받았는가 (18-26 / GC-IN-02).
   *
   * `true` 면 `getLimitChasers` 가 **확정 목록**이다(빈 배열 = 등록 전략 없음). `false` 면
   * 캐시는 「모름」이고 — 60 에코로 몇 건 들어 있어도 전체가 아니다 — 인증 경로는
   * `lc.snap` 을 보내지 않는다. `getViTrigger` 의 `undefined` 와 같은 자리다.
   */
  hasLimitChaserList(userId: string): boolean {
    return this.#limitChaserKnown.has(userId);
  }

  /**
   * 그 사용자의 **그 거래소** VI 전략 (17-05 / D-06).
   *
   * **반환값 3종을 구분해야 한다**: `RelayViTrigger` = 등록됨, `null` = 조회 결과 미등록,
   * `undefined` = **아직 모른다**(그 거래소의 61 을 한 번도 못 받았다). `undefined` 일 때는
   * 프레임을 내리지 않는다 — 지어낸 「미등록」을 보내면 브라우저가 사용자가 입력 중인 금액을
   * 지운다. 판정은 **거래소마다 독립**이다(KRX 는 알고 NXT 는 모르는 상태가 정상이다).
   */
  getViTrigger(userId: string, exchange: RelayExchange): RelayViTrigger | null | undefined {
    return this.#viTriggers.get(viTriggerKey(userId, exchange));
  }

  /** 그 사용자의 VI 주문 추적 전량 복사본. `{t:"vi.list", snap:true}` 재생에 쓴다. */
  getViOrders(userId: string): RelayViOrderItem[] {
    const prefix = userPrefix(userId);
    const out: RelayViOrderItem[] = [];
    for (const [key, item] of this.#viOrders) {
      if (key.startsWith(prefix)) out.push(item);
    }
    return out;
  }

  /**
   * 그 사용자의 등락률 돌파 above 집합 복사본 (17-03 / D-03).
   *
   * 정렬은 `sortRateCrossNewestFirst`(**`exchangeTime` 내림차순 · 동률이면 `isin` 오름차순**)다 —
   * 사용자 결정 2026-09-22 — 최신 돌파가 맨 위. 서버 78 원순서(오름차순)와 무관하게 relay 가
   * 내리는 순서는 이 헬퍼 한 곳이 정한다(78 팬아웃도 같은 헬퍼).
   */
  getRateCrossItems(userId: string): RelayRateCrossItem[] {
    const prefix = userPrefix(userId);
    const out: RelayRateCrossItem[] = [];
    for (const [key, item] of this.#rateCrossItems) {
      // 인증 직후 스냅샷(`fanout.ts`)이 이 반환값을 그대로 내린다 — 76/78 팬아웃과 같은 보강을
      // **사본에만** 얹는다(D-30). 캐시는 서버 원본 그대로다.
      if (key.startsWith(prefix)) out.push(this.#enrichRateCross(item));
    }
    return sortRateCrossNewestFirst(out);
  }

  /**
   * 그 사용자의 예약·장전·시간외종가 발주 창 상태 (17-03 / D-03).
   *
   * **`undefined` 는 「77 을 아직 못 받았다」**이고 `getViTrigger` 의 3상태 규율과 같은
   * 이유로 뭉개지 않는다 — 지어낸 창 상태를 내리면 브라우저가 거짓 라벨을 그린다.
   */
  getQueuedWindow(userId: string): RelayQueuedWindowMsg | undefined {
    return this.#queuedWindows.get(userId);
  }

  /** 마지막 호가 스냅샷. 있으면 브라우저에 즉시 내려 깜빡임을 없앤다. */
  getSnapshot(userId: string, isin: string, exchange: RelayExchange): RelayQuote | undefined {
    return this.#quotes.get(subKey(userId, isin, exchange));
  }

  /** 최근 체결 링버퍼의 복사본. 재접속 직후 테이프를 즉시 채우는 데 쓴다. */
  getTape(userId: string, isin: string, exchange: RelayExchange): RelayTapeEntry[] | undefined {
    const ring = this.#tapes.get(subKey(userId, isin, exchange));
    return ring === undefined ? undefined : [...ring];
  }

  /**
   * 보조 종목마스터 교체 뒤 **이름 없던 캐시 행**을 풀어 영향받은 사용자에게만 다시 내린다
   * (quick-260923-cqj D-08). `GatewaySymbolMaster` 의 `"updated"` 가 부른다(`index.ts`).
   *
   * 왜 필요한가: 상장 첫날 아침 첫 Ready 에서 relay 는 66(계좌)·64(상따)·72(VI)와 27 을 한꺼번에
   * 요청하고, 27 은 publisher 명령 큐를 거쳐 약 10프레임으로 오므로 66/64 가 마스터 조립보다
   * **먼저** 도착한다. 그때 캐시된 행은 이름 없이 팬아웃되고, 거래가 없는 잔고 행은 델타도 오지
   * 않아 계속 ISIN 으로 남는다. 다음 푸시를 기다리는 것으로는 부족하다.
   *
   * 새 프레임 계약은 만들지 않는다 — 브라우저가 이미 부작용 없이 처리하는 기존 모양만 쓴다:
   *   - 계좌: 캐시의 `snap:true` 전량 뷰(66 재수신과 같다).
   *   - 상따: `lc.snap` — **64 를 이미 받은 사용자에게만**(18-26 — 「모름」을 「없음」으로 말하지
   *     않는다). ⚠️ 합성 `{t:"lc"}` 단건은 보내지 않는다 — webapp 리듀서가 그 프레임마다
   *     `lastLimitChaserEcho`(「서버가 답했다」의 유일한 증거)를 갱신하기 때문이다.
   *   - VI 주문: `vi.list` `snap:false` 로 바뀐 항목만(73 과 같다).
   *
   * 대상이 아닌 것: 등락률 돌파(76/78)는 팬아웃 시점과 getter 에서 이미 보강하고, VI 발동
   * 통보(56)·시세는 일회성이라 캐시가 없다.
   *
   * 멱등이다 — 이름 있는 행은 건드리지 않으므로 곧바로 다시 불러도 팬아웃 0건이고, 평소
   * (Supabase 가 이미 다 풀었을 때)에는 재방송도 로그도 없다.
   */
  refreshNames(): void {
    const symbols = this.#symbols;
    if (symbols === undefined) return;
    const userOf = (key: string): string => key.slice(0, key.indexOf("|"));

    // (a) 계좌 — 잔고·미체결 행에 name+code (`#enrichNames` 와 같은 필드 구성).
    let accounts = 0;
    for (const [key, state] of this.#accountStates) {
      let changed = false;
      const fill = <T extends { isin: string; name?: string; code?: string }>(row: T): T => {
        const next = fillMissingName(symbols, row, true);
        if (next !== row) changed = true;
        return next;
      };
      const hold = state.hold.map(fill);
      const unf = state.unf.map(fill);
      if (!changed) continue;
      const next: RelayAccountState = { ...state, hold, unf };
      this.#accountStates.set(key, next);
      this.#fanout(userOf(key), next);
      accounts += 1;
    }

    // (b) 상따 — name+code (`#enrichLimitChaser` 와 같다). 바뀐 사용자만 lc.snap.
    const lcUsers = new Set<string>();
    for (const [key, item] of this.#limitChasers) {
      const next = fillMissingName(symbols, item, true);
      if (next === item) continue;
      this.#limitChasers.set(key, next);
      lcUsers.add(userOf(key));
    }
    let limitChaserUsers = 0;
    for (const userId of lcUsers) {
      // 합성 `lc` 단건 금지 — webapp lastLimitChaserEcho 가 서버 응답 증거라서.
      if (!this.hasLimitChaserList(userId)) continue;
      this.#fanout(userId, { t: "lc.snap", items: this.getLimitChasers(userId) });
      limitChaserUsers += 1;
    }

    // (c) VI 주문 — name 만 (`#enrichViOrder` 와 같다). 바뀐 항목만 snap:false.
    const viByUser = new Map<string, RelayViOrderItem[]>();
    for (const [key, item] of this.#viOrders) {
      const next = fillMissingName(symbols, item, false);
      if (next === item) continue;
      this.#viOrders.set(key, next);
      const userId = userOf(key);
      const list = viByUser.get(userId) ?? [];
      list.push(next);
      viByUser.set(userId, list);
    }
    let viOrders = 0;
    for (const [userId, items] of viByUser) {
      this.#fanout(userId, { t: "vi.list", snap: false, items });
      viOrders += items.length;
    }

    if (accounts + limitChaserUsers + viOrders > 0) {
      logger.info(
        { accounts, limitChaserUsers, viOrders },
        "[HUB] 보조 종목마스터 반영 — 이름 없던 캐시 행 재방송",
      );
    }
  }

  /**
   * `#onFrame` 의 `default:` 에 떨어진 프레임 누적 수 (T-17-10).
   *
   * **0 이 아니면 화이트리스트와 명시 `case` 가 갈렸다는 뜻이다** — 넓힌 번호를 받아 줄
   * case 가 없어 프레임이 조용히 사라지고 있다. 회귀 테스트가 이 값을 읽는다.
   */
  unhandledFrameCount(): number {
    return this.#unhandledFrames;
  }

  /** 현재 참조계수 — level 합계(진단·테스트용). */
  refCount(userId: string, isin: string, exchange: RelayExchange): number {
    const refs = this.#refs.get(subKey(userId, isin, exchange));
    return refs === undefined ? 0 : totalRefs(refs);
  }

  /** 업스트림 실효 level(진단·테스트용). 구독이 없으면 undefined (quick-260923-ge2). */
  subscriptionLevel(
    userId: string,
    isin: string,
    exchange: RelayExchange,
  ): RelaySubLevel | undefined {
    const refs = this.#refs.get(subKey(userId, isin, exchange));
    return refs === undefined || totalRefs(refs) === 0 ? undefined : effectiveLevel(refs);
  }

  /** `/healthz` 요약. 식별자를 담지 않는다. */
  stats(): HubStats {
    return {
      sessionCount: this.#sessions.size,
      subscriptionCount: this.#refs.size,
      cachedQuoteCount: this.#quotes.size,
      cachedAccountCount: this.#accountStates.size,
      cachedLimitChaserCount: this.#limitChasers.size,
      cachedViTriggerCount: this.#viTriggers.size,
      cachedViOrderCount: this.#viOrders.size,
      cachedRateCrossCount: this.#rateCrossItems.size,
      unhandledFrameCount: this.#unhandledFrames,
    };
  }

  /** 프로세스 종료용 — 대기 중인 배치 타이머를 전부 끄고 상태를 비운다. */
  closeAll(): void {
    for (const timer of this.#flushTimers.values()) clearTimeout(timer);
    this.#flushTimers.clear();
    this.#pending.clear();
    this.#sessions.clear();
    this.#refs.clear();
    this.#quotes.clear();
    this.#tapes.clear();
    this.#accountStates.clear();
    this.#limitChasers.clear();
    this.#limitChaserKnown.clear();
    this.#viTriggers.clear();
    this.#pendingViGets.clear();
    this.#viOrders.clear();
    this.#rateCrossItems.clear();
    this.#queuedWindows.clear();
  }

  // ----------------------------------------------------------
  // 내부 — 프레임 수신
  // ----------------------------------------------------------

  #onFrame(userId: string, session: HubSession, e: TransportFrameEvent): void {
    // 세션이 교체됐다면 옛 리스너는 아무것도 보고하지 않는다 (15-03 generation 규율 동형).
    if (this.#sessions.get(userId) !== session) return;

    switch (e.msgType) {
      case MSG.GetQuoteResp:
      case MSG.QuoteUpdate: {
        const quote = parseQuoteState(e.env, e.msgType === MSG.GetQuoteResp);
        // null 이면 파서가 이미 사유·카운터를 남겼다 — 여기서 다시 로그하지 않는다.
        if (quote !== null) this.#onQuote(userId, quote);
        return;
      }
      case MSG.TradeTapeResp:
      case MSG.TradeTapePush: {
        const tape = parseTradeTape(e.env, e.msgType === MSG.TradeTapeResp);
        if (tape !== null) this.#onTape(userId, tape);
        return;
      }
      case MSG.OrderResp: {
        const notice = parseOrderResp(e.env);
        if (notice !== null) this.#onOrderNotice(userId, notice);
        return;
      }
      case MSG.OrderConfirm:
      case MSG.TradeExecution: {
        // **서버에 이 두 테이블을 만드는 경로가 없다.** 체결도 51 의 `notice_type:"E"` 로
        // 온다 (fbs L221-228 / `Server.cpp` L307). 온다면 그 자체가 이상 신호이므로
        // 기록만 남기고 흘리지 않는다 — 가격·수량이 없는 프레임을 `{t:"order"}` 로
        // 지어내면 화면에 "0주 @0" 이 뜨고, 그것을 보고 "안 나갔다"로 읽으면
        // 이미 접수된 주문을 다시 낸다.
        logger.warn({ userId, msgType: e.msgType }, "[HUB] 생성 경로 없는 주문 프레임 — 무시");
        return;
      }
      case MSG.GetAccountStateResp:
      case MSG.AccountStateDelta: {
        const state = parseAccountState(e.env, e.msgType === MSG.GetAccountStateResp);
        if (state !== null) this.#onAccountState(userId, state);
        return;
      }
      case MSG.ServerMessage: {
        // 해석하지 않고 그대로 흘린다 (D-36). 배치하지 않는다 — 드물고 즉시성이 중요하다.
        //
        // 전략(상따/VI) 거부도 이 프레임으로 온다. 그 주인 판정 —
        // `src === "Account" ∧ i === ""` 만 VI 몫(Pitfall 9) — 은 **브라우저의 한 함수**가
        // 한다. relay 는 `lv`/`src`/`i` 를 온전히 전달하기만 하면 되고, 계약
        // (`RelayServerMsg`)에 셋 다 이미 실려 있다. 여기서 미리 갈라 놓으면 판정이 두 벌이 된다.
        const msg = parseServerMessage(e.env);
        if (msg !== null) this.#fanout(userId, msg);
        return;
      }
      case MSG.SetLimitChaserResp: {
        const item = parseLimitChaserEcho(e.env);
        if (item !== null) this.#onLimitChaserEcho(userId, item);
        return;
      }
      case MSG.GetLimitChaserListResp: {
        // `[]` 는 정상이다(등록 0건) — `null` 만 파싱 실패다.
        const items = parseLimitChaserList(e.env);
        if (items !== null) this.#onLimitChaserList(userId, items);
        return;
      }
      case MSG.SetVITriggerResp: {
        // `null` 은 파싱 실패, `{ok:true, cfg:null}` 은 **미등록**이다 — 뭉개지 않는다.
        const parsed = parseViTrigger(e.env);
        if (parsed !== null) this.#onViTrigger(userId, parsed.cfg);
        return;
      }
      case MSG.GetVIOrderListResp:
      case MSG.VIOrderListPush: {
        // 72/73 은 슬롯 하나를 공유하고 스냅샷 구분은 msg_type 이 정본이다 (D-33).
        const list = parseViOrderList(e.env, e.msgType === MSG.GetVIOrderListResp);
        if (list !== null) this.#onViOrderList(userId, list.snap, list.items);
        return;
      }
      case MSG.DisableStrategiesResp: {
        // **완료 신호일 뿐이다 — 여기서 캐시를 고치지 않는다.** 서버가 키별 60/61 에코를
        // 먼저 보낸 뒤 이 집계를 보내므로 도착 시점에는 이미 캐시가 갱신돼 있다. 이 숫자로
        // 상태를 만들면 에코와 두 벌이 갈리고, 65 가 유실되면 화면이 되살아난다.
        const resp = parseDisableStrategiesResp(e.env);
        if (resp !== null) {
          this.#fanout(userId, {
            t: "strategies.disabled",
            count: resp.count,
            viDisabled: resp.viDisabled,
          });
        }
        return;
      }
      case MSG.RateCrossAlert: {
        // 화이트리스트를 넓힌 것과 **같은 커밋**에 있는 명시 case 다 (PC-12 — Pitfall 1).
        // 76 은 요청 짝이 없는 Broadcast 라 **로그인 전 연결에도** 온다.
        const item = parseRateCrossAlert(e.env);
        if (item !== null) this.#onRateCrossAlert(userId, session, item);
        return;
      }
      case MSG.RateCrossSnapshot: {
        // `[]` 는 정상이다(돌파 없음) — `null` 만 파싱 실패다. 둘을 뭉개면 「돌파 없음」이라는
        // 확정 정보가 사라지고 브라우저가 옛 집합을 계속 그린다.
        const items = parseRateCrossSnapshot(e.env);
        if (items !== null) this.#onRateCrossSnapshot(userId, session, items);
        return;
      }
      case MSG.QueuedWindowState: {
        const state = parseQueuedWindowState(e.env);
        if (state !== null) this.#onQueuedWindow(userId, session, state);
        return;
      }
      case MSG.VIOrderNotice: {
        // 「주문이 이미 나갔다」는 알림이다. 캐시에 넣지 않는다 — 추적 목록의 정본은 72/73 이고,
        // 이 통보에는 주문번호·상태가 없어 같은 행을 만들 수 없다.
        const notice = parseViOrderNotice(e.env);
        if (notice !== null) this.#fanout(userId, this.#enrichViNotice(notice));
        return;
      }
      case MSG.SymbolMasterResp:
        // 브라우저로 흘리지 않는다 — 공개 마스터이고 relay 이름 해석의 보조 원천이다(D-07).
        // 화이트리스트와 **같은 커밋**의 명시 case 다(PC-12). 피드가 주입되지 않아도 여기서
        // 끝나므로 `default:` 계수는 오르지 않는다. 요청 세션 판정은 피드가 userId 로 한다.
        this.#symbolMaster?.onFrame(userId, parseSymbolMasterFrame(e.env));
        return;
      case MSG.LoginResp:
      case MSG.UpdateAccountNoResp:
        // **세션(`DmaSession`)이 처리하는 프레임이다.** Hub 는 아무것도 하지 않는 것이 맞다 —
        // 그러나 그 사실을 `default:` 에 맡기지 않고 명시 case 로 적는다. 그래야 아래 계수기가
        // 「아무도 안 받은 프레임」만 세고, 그 값이 곧 PC-12 위반 여부가 된다 (T-17-10).
        return;
      case MSG.ObserverLoginResp:
      case MSG.JournalBatch:
        // **관찰자 연결 전용 프레임이다**(19-09 — 화이트리스트와 같은 커밋의 명시 case · PC-12).
        // 게이트웨이는 둘을 요청 연결(관찰자 소켓)에만 Notice 로 보내므로 사용자 세션에 올 일이 없다.
        // 오면 게이트웨이 라우팅 이상이라 warn 을 남기고 버린다 — `default:` 에 맡기면 계수기가
        // 이 의도된 무시를 함께 세어 진짜 PC-12 위반을 가린다(17-03).
        logger.warn({ userId, msgType: e.msgType }, "[HUB] 사용자 세션에 관찰자 전용 프레임 — 무시");
        return;
      default:
        // 16-04 가 화이트리스트를 19종으로, 17-03 이 22종으로 넓힌 뒤에도 **여기로 조용히
        // 떨어지는 프레임은 0**이다 (PC-12 — 넓힌 만큼 명시 case 로 받는 것이 조건이었다).
        //
        // ★ 그 「0」이 주석이 아니라 **실행되는 게이트**가 되도록 도달 횟수를 센다 (T-17-10).
        //   화이트리스트만 넓히고 명시 case 를 빠뜨리면 이 값이 0 을 넘고, 회귀 테스트가
        //   그 순간 깨진다. 로그는 debug 그대로라 프로덕션 볼륨은 늘지 않는다.
        this.#unhandledFrames += 1;
        logger.debug(
          { userId, msgType: e.msgType, unhandledFrameCount: this.#unhandledFrames },
          "[HUB] 명시 case 없는 프레임 — default 도달 (PC-12 게이트)",
        );
        return;
    }
  }

  /**
   * 등락률 돌파 알림 1건 (76) — above 집합 **upsert** 다.
   *
   * ⚠️ **캐시가 먼저이고 팬아웃이 나중이다.** 76 은 요청 짝 없는 Broadcast 라 로그인 전
   *    연결에도 오고, 그때 세션은 아직 Ready 가 아니다. Ready 이전 프레임을 버리면 인증
   *    직후 스냅샷이 그 사이에 열린 돌파를 모른 채로 나가고, 반대로 팬아웃하면 소유자
   *    판정이 끝나기 전의 프레임을 브라우저에 흘리게 된다 (T-17-07). 그래서 **보관은
   *    언제나, 전달은 Ready 뒤에만** 한다.
   *
   * ⚠️ 하루 1회 알림 규칙과 임계−2%p 이탈 삭제는 **여기서 하지 않는다** — 서버 above 집합을
   *    그대로 보관하는 것이 계약이고, 표시 규칙은 Phase 18 클라 몫이다 (D-03).
   */
  #onRateCrossAlert(userId: string, session: HubSession, item: RelayRateCrossItem): void {
    this.#rateCrossItems.set(rateCrossKey(userId, item.isin), item);
    if (!session.isReady) {
      logger.debug(
        { userId, isin: item.isin, exchange: item.exchange },
        "[HUB] Ready 이전 돌파 알림 — 캐시만 (인증 직후 스냅샷이 내려보낸다)",
      );
      return;
    }
    // 보강은 **팬아웃 페이로드에만** 얹는다(D-30). 캐시(`#rateCrossItems`)에는 위에서 서버 원본을
    // 넣었다 — 「서버 집합을 그대로 보관」 규율(D-03/D-14)을 보강이 바꾸지 않는다.
    this.#fanout(userId, { t: "rate.cross", item: this.#enrichRateCross(item) });
  }

  /**
   * 등락률 돌파 above 집합 전량 (78) — **전량 교체**다.
   *
   * 그 사용자의 원소를 전부 지우고 새로 넣는다. 병합(upsert)으로 처리하면 서버가 이미
   * 뺀 종목이 캐시에 영원히 남는다 — 76 upsert 로 들어왔다가 임계−2%p 아래로 이탈한
   * 종목이 정확히 그것이다. **빈 벡터도 그대로 적용한다**: 「돌파 없음」은 확정 정보이고,
   * 무시하면 로그인 전에 쌓인 옛 집합이 새 세션까지 따라온다.
   */
  #onRateCrossSnapshot(userId: string, session: HubSession, items: RelayRateCrossItem[]): void {
    const prefix = userPrefix(userId);
    for (const key of [...this.#rateCrossItems.keys()]) {
      if (key.startsWith(prefix)) this.#rateCrossItems.delete(key);
    }
    for (const item of items) {
      this.#rateCrossItems.set(rateCrossKey(userId, item.isin), item);
    }
    logger.info({ userId, count: items.length }, "[HUB] 돌파 집합 스냅샷 수신 — 전량 교체");
    if (!session.isReady) return;
    // 전량 교체는 위에서 서버 원본으로 끝났다. 보강은 팬아웃 사본에만 (D-30 / D-27).
    // 순서는 사용자 결정 2026-09-22 — 최신 돌파가 맨 위(`sortRateCrossNewestFirst`).
    //
    // 페이로드는 원 배열이 아니라 **캐시 getter 에서** 만든다(quick-260926-rcc). 인증 직후
    // 스냅샷(`fanout.ts`)과 78 팬아웃이 한 원천이면 서버가 같은 ISIN 을 두 번 보내는 계약
    // 위반에도 브라우저는 ISIN 당 1원소(뒤 원소가 이긴다)를 받고 두 경로가 갈리지 않는다.
    this.#fanout(userId, { t: "rate.cross.snap", items: this.getRateCrossItems(userId) });
  }

  /**
   * 돌파 항목에 종목명·단축코드를 채운다 (Phase 18 D-30 — 게이트웨이는 주지 않는다).
   *
   * `#enrichViOrder` 와 같은 규율이다 — 맵에 없으면 **필드를 비워 둔 원본 객체를 그대로** 돌려준다.
   * ISIN 을 이름 자리에 넣으면 UI 가 "이름이 없다"와 "이름이 ISIN 이다"를 구분하지 못한다.
   * 원본을 변형하지 않고 사본을 만든다 — 캐시에 든 서버 원본이 보강으로 오염되지 않게.
   */
  #enrichRateCross(item: RelayRateCrossItem): RelayRateCrossItem {
    const info = this.#symbols?.lookup(item.isin);
    return info === undefined ? item : { ...item, name: info.name, code: info.code };
  }

  /**
   * 예약·장전·시간외종가 발주 창 상태 (77) — **최신 1건만** 보관한다.
   *
   * 서버가 로그인 직후 1프레임 + 창 마스크 전이마다 보내므로, 여기 남는 값은 언제나
   * 「서버가 마지막으로 말한 창 상태」다. 키 부재(`getQueuedWindow` 가 `undefined`)는
   * 「아직 못 받았다」이고 `open:false` 와 다른 상태다 — 뭉개면 인증 직후 팬아웃이
   * 지어낸 「닫힘」을 보내고 브라우저가 거짓 라벨을 그린다 (`getViTrigger` 와 같은 규율).
   */
  #onQueuedWindow(userId: string, session: HubSession, state: RelayQueuedWindowMsg): void {
    this.#queuedWindows.set(userId, state);
    if (!session.isReady) return;
    this.#fanout(userId, state);
  }

  /** 시세는 **배치하지 않는다** — 업스트림 100ms 코얼레싱을 그대로 통과시킨다 (D-35). */
  #onQuote(userId: string, quote: RelayQuote): void {
    this.#quotes.set(subKey(userId, quote.i, quote.x), quote);
    this.#fanout(userId, quote);
  }

  /**
   * 주문 통보 (51) — 접수·체결·취소확인·거부가 전부 이 하나로 온다.
   *
   * **그 주문자에게만** 간다 (T-15-02). 전역 브로드캐스트 경로가 없다는 것이 타인 체결
   * 유출의 구조적 방어이고, 여기서 `#fanout` 말고 다른 전송 수단을 쓰지 않는 것이 그 규율이다.
   *
   * 와이어 계약(`RelayOrderMsg`)에 `side` 를 싣지 않는 것은 의도다 — 취소·정정 통보의
   * 매매구분은 믿을 수 없으므로(Pitfall 8) 애초에 내려보내지 않고, UI 는 `nt` 로
   * "취소"/"정정" 을 고른다. `sideTrusted` 는 relay 내부 소비자(order-handler 의 rid 즉시응답
   * 상관)를 위한 값이라 `"order"` 이벤트에만 실린다.
   */
  #onOrderNotice(userId: string, notice: ParsedOrderResp): void {
    const msg: RelayOrderMsg = {
      t: "order",
      no: notice.orderNo,
      nt: notice.noticeType,
      rc: notice.resultCode,
      msg: notice.message,
      org: notice.orgOrderNo,
      p: notice.price,
      q: notice.quantity,
      x: notice.exchange,
      // 구 서버는 세 필드를 비워 보낸다. 빈 값은 **키째 생략**한다 — 브라우저 계약이 셋을
      // optional 로 둔 이유이고, 빈 문자열을 실어 보내면 "서버가 `""` 라고 말했다"와
      // "서버가 말하지 않았다"가 구분되지 않는다 (D-08).
      ...(notice.board === "" ? {} : { bd: notice.board }),
      ...(notice.requestKind === "" ? {} : { rk: notice.requestKind }),
      ...(notice.requester === "" ? {} : { rq: notice.requester }),
    };
    // 화면이 먼저다 — 브라우저 `{t:"order"}` 토스트·전략 로그 표면 (Phase 19 D-03).
    this.#fanout(userId, msg);
    // **감사 사본** (D-24 · Open Q7 유지). relay 사용자 세션 경로는 DB 에 쓰지 않으므로
    // (Phase 19 D-01) 이 한 줄이 relay 쪽에서 브로커 주문번호와 대조할 수 있는 흔적이다.
    // 계좌번호·비밀번호·DMA user_id 는 싣지 않는다 (D-19 승계). 51 통보에 계좌번호 필드는
    // 애초에 없고, 여기 `userId` 는 Supabase 사용자 식별자다.
    logger.info(
      {
        userId,
        orderNo: notice.orderNo,
        noticeType: notice.noticeType,
        resultCode: notice.resultCode,
        origin: notice.originKind,
      },
      "[HUB] 주문 통보 수신(감사 사본)",
    );
    this.emit("order", { userId, notice });
  }

  /**
   * 계좌 상태 (66 스냅샷 / 67 델타). **배치하지 않는다** — 잔고·미체결은 초당 수십 건이
   * 오는 값이 아니고, 체결 직후의 잔량 변화는 즉시 보여야 취소 판단이 가능하다.
   *
   * 와이어로는 **받은 그대로**(스냅샷은 snap:true, 델타는 snap:false) 흘리고, 캐시에만
   * 병합된 전량 뷰를 둔다. 이 비대칭이 의도된 설계다 — 브라우저가 이미 같은 병합 규약
   * (`snap:false` = 키 upsert + 0행/`rm` 제거)을 구현하므로, 델타를 여기서 전량으로 부풀려
   * 보내면 프레임이 커지기만 하고 얻는 것이 없다. 삭제(0 행)를 여기서 걸러 버리지 않는
   * 것도 같은 이유다 — 그 신호가 사라지면 브라우저가 사라진 종목을 계속 그린다.
   */
  #onAccountState(userId: string, rawState: RelayAccountState): void {
    // 이름 보강은 **캐시와 와이어 이전**에 한 번만 한다. 캐시만 채우면 라이브 프레임에
    // 이름이 없고, 와이어만 채우면 재접속 캐시 재생에 이름이 없다 — 둘이 갈리면
    // "새로고침하면 이름이 사라진다" 가 된다.
    const state = this.#enrichNames(rawState);
    const key = `${userId}|${state.a}`;
    this.#accountStates.set(key, this.#mergeAccountState(key, state));
    logger.info(
      {
        userId,
        accountNo: maskAccountNo(state.a),
        snap: state.snap,
        holdings: state.hold.length,
        unfilled: state.unf.length,
        removed: state.rm.length,
      },
      "[HUB] 계좌 상태 수신",
    );
    this.#fanout(userId, state);
  }

  /**
   * 상따 설정 에코 (60) — 반영의 **유일한 증거**다.
   *
   * `crud === "D"` 는 삭제이고 캐시에서 지운다 (Pitfall 7: 매수·매도 스위치 두 개만 보고
   * 판정하면 서버 진실과 갈린다 — 취소 게이트가 켜져 있으면 둘 다 꺼도 전략이 남는다).
   *
   * **삭제도 프레임으로 내린다.** 캐시에서만 지우고 침묵하면 이미 열려 있는 탭의 목록에
   * 사라진 전략이 그대로 남고, 사용자가 그것을 보고 「아직 살아 있다」로 읽는다.
   */
  #onLimitChaserEcho(userId: string, raw: RelayLimitChaser): void {
    // 보강은 **캐시에 넣기 전**이다. 캐시가 곧 `getLimitChasers` → `lc.snap`(재접속 복원)
    // 의 원천이므로, 여기서 붙이지 않으면 「지금 화면」과 「새로 연 탭」의 이름이 갈린다.
    //
    // 삭제(`crud:"D"`) 프레임에도 붙인다 — 캐시에서는 지우지만 프레임은 그대로 내리므로
    // (아래 규율), 이름이 있어야 UI 가 「무엇이 사라졌는지」를 말할 수 있다. 붙이는 비용은
    // 맵 조회 1회이고 분기를 하나 줄인다(`#enrichNames` 의 톰스톤 행과 같은 판단).
    const item = this.#enrichLimitChaser(raw);
    const key = lcKey(userId, item);
    if (item.crud === "D") this.#limitChasers.delete(key);
    else this.#limitChasers.set(key, item);
    logger.info(
      { userId, crud: item.crud, cached: this.#limitChasers.size },
      "[HUB] 상따 에코 수신",
    );
    this.#fanout(userId, { t: "lc", item });
  }

  /**
   * 상따 전략 1건에 종목명·단축코드를 채운다 (게이트웨이는 주지 않는다 — 갭 4).
   *
   * `#enrichViOrder`·`#enrichNames` 와 **같은 규율**이다: 맵에 없으면 **필드를 비워 둔다**.
   * ISIN 을 이름 자리에 넣으면 UI 가 "이름이 없다"와 "이름이 ISIN 이다"를 구분하지 못한다.
   *
   * 미해석 건수 로그는 **남기지 않는다.** `#enrichNames` 가 건수를 세는 이유는 잔고·미체결이
   * 계좌당 수십 행이라 「전량 미스 = 맵이 비었다」를 그 비율로만 알 수 있기 때문인데, 상따는
   * 한 프레임에 1건(60)이거나 소수(64)라 같은 판정을 못 한다. 맵 적재 실패는 이미 잔고 경로의
   * `[SYM]` 로그가 말하므로, 여기서 종목당 한 줄씩 더 쌓는 것은 신호가 아니라 소음이다.
   */
  #enrichLimitChaser(item: RelayLimitChaser): RelayLimitChaser {
    const info = this.#symbols?.lookup(item.isin);
    return info === undefined ? item : { ...item, name: info.name, code: info.code };
  }

  /**
   * 상따 전량 스냅샷 (64) — **전량 교체**다.
   *
   * 그 사용자의 엔트리를 전부 지우고 새로 넣는다. 병합(upsert)으로 처리하면 게이트웨이에서
   * 사라진 전략이 캐시에 영원히 남는다 — 다른 클라이언트(WinForms)가 지운 전략이 그것이다.
   */
  #onLimitChaserList(userId: string, raw: RelayLimitChaser[]): void {
    // 전량 교체 규율은 그대로다 — 보강만 앞에 얹는다. 캐시와 팬아웃이 **같은 배열**을
    // 쓰므로 두 경로의 이름이 갈릴 수 없다.
    const items = raw.map((item) => this.#enrichLimitChaser(item));
    const prefix = userPrefix(userId);
    for (const key of [...this.#limitChasers.keys()]) {
      if (key.startsWith(prefix)) this.#limitChasers.delete(key);
    }
    for (const item of items) this.#limitChasers.set(lcKey(userId, item), item);
    // 「받았음」 은 캐시 교체와 **같은 자리**에서, 팬아웃 **전에** 기록한다 — 팬아웃 도중
    // 인증하는 연결이 「모름」 을 보고 스냅샷을 빠뜨리는 틈을 두지 않는다 (18-26).
    this.#limitChaserKnown.add(userId);
    logger.info({ userId, count: items.length }, "[HUB] 상따 목록 스냅샷 수신 — 전량 교체");
    this.#fanout(userId, { t: "lc.snap", items });
  }

  /**
   * VI 전략 에코 (61). `cfg === null` 은 **미등록**이며 그 사실도 캐시에 명시로 남긴다 —
   * 「조회했더니 없다」와 「아직 조회한 적 없다」를 구분하기 위해서다.
   *
   * **귀속(어느 거래소의 답인가)이 이 함수의 핵심이다** (17-05 / D-06 / Pitfall 3).
   * 등록본은 **본문의 `cfg.exchange` 가 정본**이고(서버 `BuildVITriggerEcho` 가 반드시 싣는다),
   * 미등록은 본문 자체가 없어 `#pendingViGets` FIFO 의 head 로만 귀속된다. FIFO 가 비어
   * 귀속할 수 없으면 **캐시를 고치지 않는다** — 지어낸 거래소로 귀속하면 사용자가 입력 중인
   * 금액이 엉뚱한 칸에서 지워진다 (T-17-16). 서버 진실을 relay 가 재계산하지 않는 규율이다.
   *
   * ⚠️ 15:40 서버 자동 비활성화의 `run=false` 는 Broadcast 라 유실될 수 있다 (Pitfall 19).
   *    D-13 이 주기 재조회를 금지하므로 여기서 메우지 않는다 — 브라우저가 장 마감 표시로
   *    오해를 막는다.
   */
  #onViTrigger(userId: string, cfg: RelayViTrigger | null): void {
    const queue = this.#pendingViGets.get(userId);
    let exchange: RelayExchange;

    if (cfg === null) {
      // (a) 본문 없음 → head 를 꺼내 귀속한다.
      const head = queue?.shift();
      if (head === undefined) {
        // 귀속 실패. 어느 칸의 답인지 모르는 「미등록」은 **아무 칸에도 쓰지 않는다** —
        // 팬아웃도 하지 않는다(거래소 없는 `vi` 프레임은 계약에 없다).
        logger.warn(
          { userId },
          "[HUB] 거래소를 담지 않은 빈 61 인데 요청 FIFO 가 비었다 — 귀속 불가, 캐시 무변경",
        );
        return;
      }
      exchange = head;
    } else {
      exchange = cfg.exchange;
      // (b) 본문의 거래소 == head → 내 21 의 답이므로 head 를 버린다.
      // (c) 다르면 팬아웃 에코(Set/Disable/푸시)다 — 큐를 건드리지 않는다. 꺼내면 뒤이어 올
      //     빈 61 이 한 칸 밀려 엉뚱한 거래소로 귀속된다.
      if (queue !== undefined && queue[0] === exchange) queue.shift();
    }

    this.#viTriggers.set(viTriggerKey(userId, exchange), cfg);
    logger.info(
      { userId, exchange, registered: cfg !== null, run: cfg?.run ?? false },
      "[HUB] VI 전략 수신",
    );
    // 프레임은 **거래소별**이다 (D-06). `cfg === null`(미등록)일 때도 `x` 가 실린다 —
    // 어느 거래소가 미등록인지 말해야 브라우저가 두 칸을 구분한다.
    this.#fanout(userId, { t: "vi", x: exchange, cfg });
  }

  /**
   * VI 주문 추적 (72 스냅샷 / 73 증분).
   *
   * 스냅샷은 전량 교체, 증분은 **항목별 upsert** 다 — 계좌 상태의 `snap` 규약과 동형이고,
   * `confirm_locked` 되돌림 같은 단건 변경도 73 한 경로로 온다. 73 을 교체로 처리하면
   * 단건 푸시가 나머지 행을 통째로 지운다.
   *
   * 와이어로는 **받은 그대로**(snap 값 유지) 흘리고 캐시에만 병합된 뷰를 둔다.
   */
  #onViOrderList(userId: string, snap: boolean, rawItems: RelayViOrderItem[]): void {
    const items = rawItems.map((item) => this.#enrichViOrder(item));
    if (snap) {
      const prefix = userPrefix(userId);
      for (const key of [...this.#viOrders.keys()]) {
        if (key.startsWith(prefix)) this.#viOrders.delete(key);
      }
    }
    for (const item of items) {
      const key = viOrderKey(userId, item);
      // 접수되며 주문번호가 붙었으면 자리표시 행을 걷어낸다 — 안 그러면 같은 주문이 두 줄이다.
      const pending = viPendingKey(userId, item);
      if (key !== pending) this.#viOrders.delete(pending);
      this.#viOrders.set(key, item);
    }
    logger.info(
      { userId, snap, received: items.length, cached: this.#viOrders.size },
      "[HUB] VI 주문 목록 수신",
    );
    this.#fanout(userId, { t: "vi.list", snap, items });
  }

  /**
   * VI 주문 행에 종목명을 채운다. `#enrichNames`(계좌 계열)와 같은 규율이다 —
   * 맵에 없으면 **필드를 비워 둔다**. ISIN 을 이름 자리에 넣으면 UI 가 "이름이 없다"와
   * "이름이 ISIN 이다"를 구분하지 못한다.
   */
  #enrichViOrder(item: RelayViOrderItem): RelayViOrderItem {
    const info = this.#symbols?.lookup(item.isin);
    return info === undefined ? item : { ...item, name: info.name };
  }

  /** VI 발동 통보(56)의 종목명 보강. 파서는 이 값을 모른다(게이트웨이가 주지 않는다). */
  #enrichViNotice(notice: RelayViNoticeMsg): RelayViNoticeMsg {
    const info = this.#symbols?.lookup(notice.isin);
    return info === undefined ? notice : { ...notice, name: info.name };
  }

  /**
   * 잔고·미체결 행에 종목명·단축코드를 채운다 (게이트웨이는 주지 않는다).
   *
   * 맵에 없는 ISIN 은 **필드를 비워 둔다** — 빈 문자열이나 ISIN 을 이름 자리에 넣지
   * 않는다. UI 가 "이름이 없다"와 "이름이 ISIN 이다"를 구분할 수 있어야, 취소 버튼을
   * 열지 말지(단축코드가 있어야 취소가 나간다)를 스스로 판단한다.
   *
   * 델타(`snap:false`)에도 똑같이 건다. 델타로만 등장하는 종목이 있기 때문이다.
   * 0 수량 톰스톤 행에도 굳이 이름을 붙이는데, 그 행은 삭제 신호로만 쓰이고 사라지므로
   * 해가 없고 분기를 하나 줄인다.
   */
  #enrichNames(state: RelayAccountState): RelayAccountState {
    const symbols = this.#symbols;
    if (symbols === undefined) return state;

    let hit = 0;
    const decorate = <T extends { isin: string }>(row: T): T => {
      const info = symbols.lookup(row.isin);
      if (info === undefined) return row;
      hit += 1;
      return { ...row, name: info.name, code: info.code };
    };

    const hold = state.hold.map(decorate);
    const unf = state.unf.map(decorate);
    const total = state.hold.length + state.unf.length;
    if (hit < total) {
      // 미스는 정상일 수 있다(신규 상장 직후 등). 다만 전량 미스는 맵이 비었다는 뜻이라
      // 원인을 찾을 수 있게 남긴다 — ISIN 은 식별자가 아니므로 건수만 센다.
      logger.info({ resolved: hit, total }, "[SYM] 일부 ISIN 을 종목명으로 풀지 못했다");
    }
    return { ...state, hold, unf };
  }

  /**
   * 캐시 병합 — **기계적**이다. 스냅샷은 전량 교체, 델타는 키 upsert + 0행/`rm` 제거.
   *
   * **서버가 0/0 원소를 지우므로 델타의 0 행이 곧 삭제 신호다** (gh-trade quick-260906-e8b).
   * `AccountManager` 는 보유수량 0·매도가능수량 0 인 잔고를 맵에서 제거하고, 그 사실을
   * `HoldingState{stock_qty:0, sellable_qty:0, avg_price:0}` **톰스톤 행**으로 알린다 —
   * 잔고에는 `removed_order_nos` 같은 삭제 표식이 없다(그 벡터는 미체결 전용이다).
   * 미체결도 같은 규칙을 함께 쓴다: `rm` 이 정규 경로지만 `unfilled_qty == 0` 행도 삭제로 읽는다.
   *
   * 스냅샷에서 0 행을 **거르는** 것은 구버전 게이트웨이 호환이다 — quick-260906-e8b 배포
   * 이전 바이너리는 스냅샷(66)에 0 잔고를 섞어 보낸다.
   *
   * 브라우저(`use-relay-socket.ts` 의 `mergeAccount`)가 **한 글자도 다르지 않은** 규칙을
   * 적용한다. 한쪽만 고치면 새 탭과 기존 탭이 다른 화면을 본다.
   */
  #mergeAccountState(key: string, next: RelayAccountState): RelayAccountState {
    if (next.snap) {
      return {
        ...next,
        snap: true,
        hold: next.hold.filter((h) => h.qty !== 0),
        unf: next.unf.filter((u) => u.unfilledQty !== 0),
        rm: [],
      };
    }

    const prev = this.#accountStates.get(key);
    const holdings = new Map((prev?.hold ?? []).map((h) => [h.isin, h]));
    for (const h of next.hold) {
      if (h.qty === 0) holdings.delete(h.isin);
      else holdings.set(h.isin, h);
    }

    const unfilled = new Map((prev?.unf ?? []).map((u) => [u.orderNo, u]));
    for (const u of next.unf) {
      if (u.unfilledQty === 0) unfilled.delete(u.orderNo);
      else unfilled.set(u.orderNo, u);
    }
    // 삭제 표식은 upsert **뒤에** 적용한다. 같은 프레임이 한 주문을 갱신하면서 동시에
    // 지우라고 말하는 경우, 최종 상태는 "없음"이어야 한다.
    for (const orderNo of next.rm) unfilled.delete(orderNo);

    return {
      t: "acct",
      a: next.a,
      snap: true,
      hold: [...holdings.values()],
      unf: [...unfilled.values()],
      rm: [],
      st: next.st,
    };
  }

  /** 체결은 링버퍼에 쌓고 200ms 배치로 내보낸다 (D-35). */
  #onTape(userId: string, tape: RelayTape): void {
    const key = subKey(userId, tape.i, tape.x);

    // 스냅샷(69)은 전량 교체, 증분(71)은 뒤에 이어붙임 — 계약 그대로다.
    const ring = tape.snap ? [] : (this.#tapes.get(key) ?? []);
    ring.push(...tape.e);
    if (ring.length > TAPE_RING_SIZE) ring.splice(0, ring.length - TAPE_RING_SIZE);
    this.#tapes.set(key, ring);

    let perUser = this.#pending.get(userId);
    if (perUser === undefined) {
      perUser = new Map<string, PendingTape>();
      this.#pending.set(userId, perUser);
    }
    const current = perUser.get(key);
    if (current === undefined || tape.snap) {
      // 스냅샷은 앞서 쌓인 증분을 무효화한다 — 전량 교체로 승격한다.
      perUser.set(key, { isin: tape.i, exchange: tape.x, snap: tape.snap, entries: [...tape.e] });
    } else {
      current.entries.push(...tape.e);
    }

    this.#armFlush(userId);
  }

  #armFlush(userId: string): void {
    if (this.#flushTimers.has(userId)) return; // 세션 단위 타이머 1개 (D-35)
    const timer = setTimeout(() => {
      this.#flushTimers.delete(userId);
      this.#flush(userId);
    }, TAPE_BATCH_MS);
    this.#flushTimers.set(userId, timer);
  }

  #flush(userId: string): void {
    const perUser = this.#pending.get(userId);
    if (perUser === undefined || perUser.size === 0) return;
    for (const pending of perUser.values()) {
      if (pending.entries.length === 0) continue;
      this.#fanout(userId, {
        t: "tape",
        i: pending.isin,
        x: pending.exchange,
        snap: pending.snap,
        e: pending.entries,
      });
    }
    perUser.clear();
  }

  // ----------------------------------------------------------
  // 내부 — 송신·정리
  // ----------------------------------------------------------

  /**
   * 0→1 전이(와 PRICE→FULL 승격·ready 재구독)의 프레임 (D-33 · quick-260923-ge2).
   * FULL 3프레임 = 스냅샷 28 → 구독 29(level=0) → 체결 테이프 32.
   * PRICE 2프레임 = 스냅샷 28 → 구독 29(level=1) — 71 이 오지 않으므로 69 스냅샷도 요청하지 않는다.
   * 순서가 계약이다.
   */
  #sendSubscribe(
    userId: string,
    isin: string,
    exchange: RelayExchange,
    level: RelaySubLevel,
  ): void {
    const session = this.#sessions.get(userId);
    if (session === undefined) {
      logger.warn(
        { userId, isin, exchange, level },
        "[HUB] 세션 없이 구독 — 참조계수만 기록 (세션 결선 후 ready 가 복원한다)",
      );
      return;
    }
    if (!session.isReady) {
      logger.info(
        { userId, isin, exchange, level },
        "[HUB] Ready 이전 구독 — 참조계수만 기록 (ready 에서 전량 재구독)",
      );
      return;
    }
    session.send(buildGetQuoteReq(isin, exchange));
    session.send(buildSubscribeQuoteReq(isin, exchange, true, levelByte(level)));
    if (level === "full") {
      session.send(buildGetTradeTapeReq(isin, exchange, TAPE_REQUEST_COUNT));
      logger.info(
        { userId, isin, exchange, level },
        "[HUB] 신규 구독 — 스냅샷+구독(FULL)+체결 요청 송신",
      );
      return;
    }
    logger.info(
      { userId, isin, exchange, level },
      "[HUB] 신규 구독 — 스냅샷+구독(PRICE) 요청 송신 (체결 테이프 없음)",
    );
  }

  #onReady(userId: string, session: HubSession): void {
    if (this.#sessions.get(userId) !== session) return;
    // 재구독·계좌 재요청·전략 재요청은 **같은 트리거 한 자리**에서만 일어난다 (Pitfall 4).
    // 경로를 두 벌 만들면 "재접속 후 잔고만 안 나온다"·"재접속 후 전략만 안 나온다"가 생긴다.
    // D-13: 이 세 줄 말고 사용자별 재조회를 거는 곳은 없다 — 주기 타이머도, 브라우저가 부를 수
    // 있는 수동 새로고침 진입점도 만들지 않는다.
    this.resubscribeAll(userId);
    this.requestAccountState(userId);
    this.requestStrategySnapshot(userId);
    // 4번째 줄은 사용자별 재조회가 **아니다** — 게이트웨이 종목마스터(27)의 relay 전체 1일 1회
    // 요청이고, 게이팅(이번 master-day 에 성공했는가·진행 중인가)은 피드가 쥔다(quick-260923-cqj D-02).
    this.#symbolMaster?.onSessionReady(session);
  }

  /** **대상은 언제나 userId 하나**다. 전역 브로드캐스트 경로를 만들지 않는다 (T-15-02). */
  #fanout(userId: string, msg: RelayOutbound): void {
    this.emit("fanout", { userId, msg });
  }

  #clearCaches(userId: string): void {
    const prefix = userPrefix(userId);
    for (const key of [...this.#quotes.keys()]) {
      if (key.startsWith(prefix)) this.#quotes.delete(key);
    }
    for (const key of [...this.#tapes.keys()]) {
      if (key.startsWith(prefix)) this.#tapes.delete(key);
    }
    for (const key of [...this.#accountStates.keys()]) {
      if (key.startsWith(prefix)) this.#accountStates.delete(key);
    }
    // 전략 3맵도 **반드시** 여기서 버린다 (D-12). 빠뜨리면 재로그인·세션 교체 후에도 옛
    // 전략이 캐시에 남아, 인증 직후 스냅샷 팬아웃이 이미 사라진 전략을 화면에 그린다.
    for (const key of [...this.#limitChasers.keys()]) {
      if (key.startsWith(prefix)) this.#limitChasers.delete(key);
    }
    // 「64 받았음」 도 같이 지운다 (18-26) — 남기면 새 세션의 64 가 오기 전 인증한 연결이
    // 방금 비운 캐시를 확정 목록(`lc.snap []`)으로 받는다. 이 사용자 것만 지운다(T-18-110).
    this.#limitChaserKnown.delete(userId);
    // VI 설정은 **거래소별**이라 두 칸을 다 지운다 (17-05 / D-06) — 지우면 `getViTrigger` 가
    // 다시 `undefined`(모름)가 되고, 새 세션의 61 이 도착할 때까지 아무 프레임도 내리지 않는다.
    for (const key of [...this.#viTriggers.keys()]) {
      if (key.startsWith(prefix)) this.#viTriggers.delete(key);
    }
    // 21 요청 FIFO 도 **반드시** 비운다 (규칙 (d) — C# `Client.cs:3038` 동형). 끊기면 아직
    // 답을 못 받은 조회는 영영 오지 않는다. 남겨 두면 다음 세션의 빈 61 이 옛 거래소로
    // 귀속돼 엉뚱한 칸이 「미등록」으로 내려간다.
    this.#pendingViGets.delete(userId);
    for (const key of [...this.#viOrders.keys()]) {
      if (key.startsWith(prefix)) this.#viOrders.delete(key);
    }
    // above 집합도 버린다. 서버가 재로그인마다 78 전량을 다시 주므로 옛 집합을 남길 이유가
    // 없고, 남기면 이미 이탈한 종목이 새 세션의 첫 스냅샷에 섞인다.
    for (const key of [...this.#rateCrossItems.keys()]) {
      if (key.startsWith(prefix)) this.#rateCrossItems.delete(key);
    }
    // 예약창도 버린다 — 키가 userId 자체이므로 지우면 `getQueuedWindow` 가 다시
    // `undefined`(모름)가 되고, 새 세션의 77 이 올 때까지 아무 프레임도 내리지 않는다.
    this.#queuedWindows.delete(userId);
    const timer = this.#flushTimers.get(userId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.#flushTimers.delete(userId);
    }
    this.#pending.delete(userId);
  }

  #countKeys(userId: string): number {
    const prefix = userPrefix(userId);
    let n = 0;
    for (const key of this.#refs.keys()) if (key.startsWith(prefix)) n += 1;
    return n;
  }

  /**
   * 키를 되돌려 읽는다. userId(Supabase uuid)·ISIN(12자 영숫자)·거래소 어디에도
   * `|` 가 들어갈 수 없으므로 분해가 모호하지 않다.
   */
  #splitKey(key: string): { isin: string; exchange: RelayExchange } | null {
    const parts = key.split("|");
    if (parts.length !== 3) {
      logger.warn({ segments: parts.length }, "[HUB] 구독 키 분해 실패 — 무시");
      return null;
    }
    const isin = parts[1] ?? "";
    const exchange = parts[2] ?? "";
    if (exchange !== "KRX" && exchange !== "NXT") {
      logger.warn({ exchange }, "[HUB] 알 수 없는 거래소 키 — 무시");
      return null;
    }
    return { isin, exchange };
  }
}
