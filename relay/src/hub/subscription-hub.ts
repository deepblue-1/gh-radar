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
 *   D-37  브라우저 재접속·다중 탭에서 **스냅샷 캐시가 즉시 응답**한다. 그래서 캐시는
 *         참조계수가 0 이 되어도 버리지 않는다 — 재접속 왕복 동안 살아 있어야 의미가 있다.
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
  RelayExchange,
  RelayOutbound,
  RelayQuote,
  RelayTape,
  RelayTapeEntry,
} from "@gh-radar/shared";

import { logger } from "../logger.js";
import type { TransportFrameEvent } from "../dma/dma-client.js";
import type { SessionReadyEvent } from "../dma/session.js";
import {
  MAX_TAPE_ENTRY_COUNT,
  buildGetQuoteReq,
  buildGetTradeTapeReq,
  buildSubscribeQuoteReq,
  parseQuoteState,
  parseServerMessage,
  parseTradeTape,
} from "../dma/envelope.js";
import { MSG } from "../dma/msg-type.js";

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

/** `/healthz` 용 요약. 식별자(userId·ISIN)를 담지 않는다. */
export type HubStats = {
  sessionCount: number;
  subscriptionCount: number;
  cachedQuoteCount: number;
};

export interface SubscriptionHub {
  on(event: "fanout", listener: (e: HubFanoutEvent) => void): this;
  emit(event: "fanout", e: HubFanoutEvent): boolean;
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

  /**
   * 세션이 사라졌을 때의 상태 폐기. **게이트웨이로 아무것도 보내지 않는다**(보낼 연결이 없다).
   * 프로세스 종료·테스트 정리용이며, 브라우저 소켓 종료 경로는 `unsubscribe` 를 쓴다.
   */
  detach(userId: string): void {
    this.#sessions.delete(userId);
    this.#clearCaches(userId);
    for (const key of [...this.#refs.keys()]) {
      if (key.startsWith(userPrefix(userId))) this.#refs.delete(key);
    }
    logger.info({ userId }, "[HUB] 세션 분리 — 구독·캐시 폐기");
  }

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

  /**
   * 그 사용자의 구독을 **전부** 해제한다. 세션이 준비돼 있으면 해제 프레임도 보낸다.
   *
   * 소켓 1개가 닫히는 정상 경로는 이 함수가 아니라 `unsubscribe` 를 그 소켓이 잡고 있던
   * 키마다 부르는 것이다(다른 탭의 구독을 끊으면 안 된다). 여기는 사용자 단위 정리
   * (프로세스 종료·강제 정리) 전용이다.
   */
  releaseAll(userId: string): void {
    const prefix = userPrefix(userId);
    const session = this.#sessions.get(userId);
    let released = 0;

    for (const key of [...this.#refs.keys()]) {
      if (!key.startsWith(prefix)) continue;
      this.#refs.delete(key);
      released += 1;
      const parts = this.#splitKey(key);
      if (parts === null) continue;
      if (session === undefined || !session.isReady) continue;
      session.send(buildSubscribeQuoteReq(parts.isin, parts.exchange, false));
    }

    this.#clearCaches(userId);
    logger.info({ userId, released }, "[HUB] 사용자 구독 전량 해제");
  }

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

  // ----------------------------------------------------------
  // 캐시 조회 (D-37)
  // ----------------------------------------------------------

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
      case MSG.ServerMessage: {
        // 해석하지 않고 그대로 흘린다 (D-36). 배치하지 않는다 — 드물고 즉시성이 중요하다.
        const msg = parseServerMessage(e.env);
        if (msg !== null) this.#fanout(userId, msg);
        return;
      }
      default:
        // 로그인 응답(50)은 세션이 처리하고, 계좌·주문(51/55/66/67)은 D-25 게이트 뒤 plan 소관이다.
        return;
    }
  }

  /** 시세는 **배치하지 않는다** — 업스트림 100ms 코얼레싱을 그대로 통과시킨다 (D-35). */
  #onQuote(userId: string, quote: RelayQuote): void {
    this.#quotes.set(subKey(userId, quote.i, quote.x), quote);
    this.#fanout(userId, quote);
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
    this.resubscribeAll(userId);
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
