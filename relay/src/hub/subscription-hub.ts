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
  RelayQuote,
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
  parseQuoteState,
  parseServerMessage,
  parseTradeTape,
  parseViOrderList,
  parseViOrderNotice,
  parseViTrigger,
  type ParsedOrderResp,
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

/** 팬아웃 1건. **대상은 언제나 특정 userId 하나**다 (T-15-02). */
export type HubFanoutEvent = { userId: string; msg: RelayOutbound };

/**
 * 주문 통보 1건 (`OrderResp(51)`), **파싱된 원문 그대로**.
 *
 * 브라우저로 나가는 `{t:"order"}` 팬아웃과 **별도**로 낸다. 팬아웃은 계약 타입(`RelayOrderMsg`)
 * 이라 상관에 필요한 값(`sideTrusted` 등)이 빠져 있고, 주문 라우트는 HTTP 응답을 만들기 위해
 * 원문이 필요하기 때문이다. 팬아웃이 먼저이고 이 이벤트가 나중이다 — 화면이 DB 보다 앞선다.
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
 * VI 주문 캐시 키. 정본은 `orderNo` 지만 **접수 전에는 그 값이 `""`** 라 키가 되지 못한다
 * (파서가 `""` 를 보존하는 이유 — 빈 주문번호로는 확인 체크를 열 수 없다).
 *
 * 그 한 경우에만 `@ISIN:계좌:발동가` 복합키로 대신한다. 같은 종목·계좌의 한 VI 발동은
 * 1건이므로 이 조합이 유일하고, 접수 전 항목이 73 푸시마다 새 행으로 쌓이지 않는다.
 * `@` 접두어는 주문번호와 섞이지 않게 하는 표식이다.
 */
function viOrderKey(userId: string, item: RelayViOrderItem): string {
  if (item.orderNo !== "") return `${userId}|${item.orderNo}`;
  return viPendingKey(userId, item);
}

/**
 * 접수 전 항목의 자리표시 키. 주문번호가 붙는 순간 이 키를 **지우고** 주문번호 키로 옮긴다 —
 * 지우지 않으면 같은 주문이 「접수 전」과 「접수됨」 두 줄로 남는다.
 */
function viPendingKey(userId: string, item: RelayViOrderItem): string {
  return `${userId}|@${item.isin}:${item.accountNo}:${item.triggerPrice}`;
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
  /** `${userId}|${isin}|${exchange}` → 참조계수. */
  readonly #refs = new Map<string, number>();
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
   * `userId` → VI 전략 (계좌당 1건이 아니라 **세션당 1건**이다 — 서버가 그렇게 준다).
   *
   * **`null` 을 명시로 저장한다.** 「조회했더니 미등록」(`null`)과 「아직 조회한 적 없음」
   * (키 부재 = `getViTrigger` 가 `undefined`)은 다른 상태다. 둘을 뭉개면 인증 직후
   * 팬아웃이 「미등록」을 지어내 보내고, 브라우저가 사용자가 입력한 금액을 지운다.
   */
  readonly #viTriggers = new Map<string, RelayViTrigger | null>();
  /**
   * `${userId}|${orderNo}` (접수 전은 `viPendingKey`) → VI 주문 추적 1건.
   *
   * 72 는 전량 교체, 73 은 항목 upsert 다 — 계좌 상태의 `snap` 규약과 동형이다.
   * `confirm_locked` 되돌림 같은 단건 변경도 73 한 경로로 온다.
   */
  readonly #viOrders = new Map<string, RelayViOrderItem>();
  /**
   * ISIN → 종목명·단축코드. 게이트웨이가 이름을 주지 않으므로 여기서 채운다.
   * 없으면(주입 안 함/미스) 필드를 비워 두고 UI 가 ISIN 원문으로 폴백한다.
   */
  readonly #symbols: SymbolLookup | undefined;

  constructor(opts?: { symbols?: SymbolLookup }) {
    super();
    this.#symbols = opts?.symbols;
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

  /** 참조계수 +1. **0→1 에서만** 게이트웨이로 구독 프레임이 나간다. */
  subscribe(userId: string, isin: string, exchange: RelayExchange): void {
    const key = subKey(userId, isin, exchange);
    const next = (this.#refs.get(key) ?? 0) + 1;
    this.#refs.set(key, next);

    if (next > 1) {
      logger.info(
        { userId, isin, exchange, refCount: next },
        "[HUB] 이미 구독 중 — 게이트웨이로 다시 보내지 않는다 (탭 공유)",
      );
      return;
    }
    this.#sendSubscribe(userId, isin, exchange);
  }

  /** 참조계수 -1. **1→0 에서만** `subscribe:false` 가 나간다. */
  unsubscribe(userId: string, isin: string, exchange: RelayExchange): void {
    const key = subKey(userId, isin, exchange);
    const current = this.#refs.get(key);
    if (current === undefined || current <= 0) {
      // 조용히 넘기지 않는다 — 참조계수 누수·이중 해제는 여기서만 보인다 (S-5).
      logger.warn({ userId, isin, exchange }, "[HUB] 참조계수 없는 해제 — 무시");
      return;
    }

    const next = current - 1;
    if (next > 0) {
      this.#refs.set(key, next);
      logger.info({ userId, isin, exchange, refCount: next }, "[HUB] 탭 1개 해제 — 구독 유지");
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
    for (const key of this.#refs.keys()) {
      if (!key.startsWith(prefix)) continue;
      const parts = this.#splitKey(key);
      if (parts === null) continue;
      this.#sendSubscribe(userId, parts.isin, parts.exchange);
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
   * 전략 스냅샷 3종을 1회 요청한다 (D-12) — 24(상따 목록) · 21(VI 설정) · 34(VI 주문 목록).
   *
   * 셋 다 요청 본문이 없는 빈 Envelope 다. 순서는 계약이 아니지만 목록 → 설정 → 추적 순으로
   * 두면 로그가 화면 구성 순서와 같이 읽힌다.
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
    session.send(buildGetVITriggerReq());
    session.send(buildGetVIOrderListReq());
    logger.info({ userId }, "[HUB] Ready — 전략 스냅샷 3종 요청");
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
   * 그 사용자의 VI 전략.
   *
   * **반환값 3종을 구분해야 한다**: `RelayViTrigger` = 등록됨, `null` = 조회 결과 미등록,
   * `undefined` = **아직 모른다**(61 을 한 번도 못 받았다). `undefined` 일 때는 프레임을
   * 내리지 않는다 — 지어낸 「미등록」을 보내면 브라우저가 사용자가 입력 중인 금액을 지운다.
   */
  getViTrigger(userId: string): RelayViTrigger | null | undefined {
    return this.#viTriggers.get(userId);
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

  /** 마지막 호가 스냅샷. 있으면 브라우저에 즉시 내려 깜빡임을 없앤다. */
  getSnapshot(userId: string, isin: string, exchange: RelayExchange): RelayQuote | undefined {
    return this.#quotes.get(subKey(userId, isin, exchange));
  }

  /** 최근 체결 링버퍼의 복사본. 재접속 직후 테이프를 즉시 채우는 데 쓴다. */
  getTape(userId: string, isin: string, exchange: RelayExchange): RelayTapeEntry[] | undefined {
    const ring = this.#tapes.get(subKey(userId, isin, exchange));
    return ring === undefined ? undefined : [...ring];
  }

  /** 현재 참조계수(진단·테스트용). */
  refCount(userId: string, isin: string, exchange: RelayExchange): number {
    return this.#refs.get(subKey(userId, isin, exchange)) ?? 0;
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
    this.#viTriggers.clear();
    this.#viOrders.clear();
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
      case MSG.VIOrderNotice: {
        // 「주문이 이미 나갔다」는 알림이다. 캐시에 넣지 않는다 — 추적 목록의 정본은 72/73 이고,
        // 이 통보에는 주문번호·상태가 없어 같은 행을 만들 수 없다.
        const notice = parseViOrderNotice(e.env);
        if (notice !== null) this.#fanout(userId, this.#enrichViNotice(notice));
        return;
      }
      default:
        // 로그인 응답(50)·계좌 선언 응답(55)은 세션이 처리한다.
        // 16-04 가 화이트리스트를 19종으로 넓힌 뒤에도 **여기로 조용히 떨어지는 프레임은 0**이다
        // (PC-12 — 넓힌 만큼 명시 case 로 받는 것이 조건이었다).
        return;
    }
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
   * "취소"/"정정" 을 고른다. `sideTrusted` 는 relay 내부 소비자를 위한 값이라
   * `"order"` 이벤트에만 실린다.
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
    };
    // 화면이 먼저다. DB 기록(비동기 큐)은 이 이벤트를 받는 쪽이 건다.
    this.#fanout(userId, msg);
    // **두 번째 감사 사본** (D-24). `dma_orders` 에 붙지 못한 통보 — 좁히기 실패·연결 종료
    // 후 도착·행 생성 실패 — 라도 이 한 줄이 있으면 브로커 주문번호와 대조할 수 있다.
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
    logger.info({ userId, count: items.length }, "[HUB] 상따 목록 스냅샷 수신 — 전량 교체");
    this.#fanout(userId, { t: "lc.snap", items });
  }

  /**
   * VI 전략 에코 (61). `cfg === null` 은 **미등록**이며 그 사실도 캐시에 명시로 남긴다 —
   * 「조회했더니 없다」와 「아직 조회한 적 없다」를 구분하기 위해서다.
   *
   * ⚠️ 15:40 서버 자동 비활성화의 `run=false` 는 Broadcast 라 유실될 수 있다 (Pitfall 19).
   *    D-13 이 주기 재조회를 금지하므로 여기서 메우지 않는다 — 브라우저가 장 마감 표시로
   *    오해를 막는다.
   */
  #onViTrigger(userId: string, cfg: RelayViTrigger | null): void {
    this.#viTriggers.set(userId, cfg);
    logger.info({ userId, registered: cfg !== null, run: cfg?.run ?? false }, "[HUB] VI 전략 수신");
    this.#fanout(userId, { t: "vi", cfg });
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

  /** 0→1 전이의 3프레임 (D-33). 순서가 계약이다 — 스냅샷 → 구독 → 체결 테이프. */
  #sendSubscribe(userId: string, isin: string, exchange: RelayExchange): void {
    const session = this.#sessions.get(userId);
    if (session === undefined) {
      logger.warn(
        { userId, isin, exchange },
        "[HUB] 세션 없이 구독 — 참조계수만 기록 (세션 결선 후 ready 가 복원한다)",
      );
      return;
    }
    if (!session.isReady) {
      logger.info(
        { userId, isin, exchange },
        "[HUB] Ready 이전 구독 — 참조계수만 기록 (ready 에서 전량 재구독)",
      );
      return;
    }
    session.send(buildGetQuoteReq(isin, exchange));
    session.send(buildSubscribeQuoteReq(isin, exchange, true));
    session.send(buildGetTradeTapeReq(isin, exchange, TAPE_REQUEST_COUNT));
    logger.info({ userId, isin, exchange }, "[HUB] 신규 구독 — 스냅샷+구독+체결 요청 송신");
  }

  #onReady(userId: string, session: HubSession): void {
    if (this.#sessions.get(userId) !== session) return;
    // 재구독·계좌 재요청·전략 재요청은 **같은 트리거 한 자리**에서만 일어난다 (Pitfall 4).
    // 경로를 두 벌 만들면 "재접속 후 잔고만 안 나온다"·"재접속 후 전략만 안 나온다"가 생긴다.
    // D-13: 이 세 줄 말고 재조회를 거는 곳은 없다 — 주기 타이머도, 브라우저가 부를 수 있는
    // 수동 새로고침 진입점도 만들지 않는다.
    this.resubscribeAll(userId);
    this.requestAccountState(userId);
    this.requestStrategySnapshot(userId);
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
    // VI 설정은 키가 userId 자체다 — 지우면 `getViTrigger` 가 다시 `undefined`(모름)가 되고,
    // 새 세션의 61 이 도착할 때까지 아무 프레임도 내리지 않는다.
    this.#viTriggers.delete(userId);
    for (const key of [...this.#viOrders.keys()]) {
      if (key.startsWith(prefix)) this.#viOrders.delete(key);
    }
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
