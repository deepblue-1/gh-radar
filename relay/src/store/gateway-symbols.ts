/**
 * quick-260923-cqj — 게이트웨이 종목마스터(27 → 57)를 **보조 이름 원천**으로 쓴다.
 *
 * 왜 필요한가: relay 는 이름·단축코드·시장을 Supabase `stocks` 에서 푼다(`store/symbols.ts`).
 * `stocks` 는 master-sync 가 KRX OpenAPI 로 채우는데, KRX 는 전 영업일 데이터를 다음 영업일
 * 08:00 에 공개한다. 그래서 **상장 당일 종목은 `stocks` 에 없다** — 2026-09-23 상장 첫날
 * KR70010S0000(0010S0)이 `/trading` 카드 머리·사이드바에 ISIN 원문으로 보였다. 같은 시각
 * gh-trade WinForms 는 마스터 57 로 이름을 보여줬다. 이 모듈이 그 57 을 relay 에서도 받는다.
 * 정본은 여전히 `stocks` 이고, `SymbolMap.lookup` 은 **미스일 때만** 여기를 본다(D-01).
 *
 * gh-trade 서버 소스로 확정한 사실(읽기 전용 저장소):
 *   - 27 은 **로그인된 세션**이 필요하다(`Gateway::ProcessGetSymbolMaster` 의 `if (!conn.session) return;`).
 *     요청 테이블이 없다 — Envelope 에 msg_type 만 싣는다.
 *   - 같은 연결의 27 이 큐에 있거나 **60초 안에** 다시 오면 **응답 없이 흡수**된다
 *     (`MarketPublisher.h:121` `kMasterReqMinIntervalMs`).
 *   - 프레임당 500종목(`kSymbolMasterChunk`), seq 는 0부터, total_items 는 전 프레임 동일,
 *     is_last 는 마지막 프레임만 true. 0종목이어도 is_last 프레임 1건이 온다.
 *   - 응답은 **요청한 연결 하나에만** Notice 로 간다. 요청 없는 57 푸시는 없다.
 *   - 당일 신규상장은 KRX A0 배치(05:40 / 06:20 / 07:00)가 올 때 publisher 사본에 추가된다.
 *
 * 설계 결정:
 *   D-01  Supabase 행 단위 우선. 이 맵은 미스만 채운다. 원소마다 `source:"gateway"` 를 붙인다
 *         — `dma_orders.stock_code` FK 가드(`stocksCodeOf`)가 이 표식을 본다(D-06).
 *   D-02  요청은 relay 전체에서 **동시에 하나**, 사용자와 무관하다. 트리거는 세션 Ready(hub),
 *         07:30 경계 타이머, 실패 뒤 재시도 타이머다.
 *   D-03  master-day 경계는 07:30 KST(마지막 A0 배치 07:00 + 30분). 성공 키는 **완료 시각**으로
 *         매긴다 — 07:00~07:30 에 시작한 요청도 마지막 배치를 이미 포함한다.
 *   D-04  seq 연속·total 동일·is_last 도착·누적 원소 수 == total 네 조건을 모두 통과해야 새 Map 을
 *         **한 번에** 교체한다. 빈 결과로는 기존 맵을 지우지 않는다. 30초 안에 is_last 가 안 오면
 *         실패다. 실패하면 5분 backoff(게이트웨이 60초 흡수 창 밖), 하루 시도 상한 5회. 모든 실패
 *         갈래는 사유를 담은 `[SYM-GW]` 로그를 남긴다(무로그 fail-safe 금지).
 *
 * 하지 않는 것:
 *   - 57 의 이름·코드는 브라우저로 흘리지 않는다. 예외는 NXT 거래가능 ISIN 집합(`nxt.snap`,
 *     quick-260923-pq2) 하나 — fanout 이 `nxtTradableIsins()` 와 `updated` 로 읽는다.
 *   - 개별 ISIN 을 지연 조회하지 않는다. 요청 수는 사용자 수와 무관하다.
 *   - throw 하지 않는다. 이름은 표시용이라 relay 기동·주문 경로를 막을 이유가 없다.
 */
import { EventEmitter } from "node:events";

import { logger } from "../logger.js";
import { buildGetSymbolMasterReq, type ParsedSymbolMasterFrame } from "../dma/envelope.js";
import { msUntilKst, type SymbolInfo, type SymbolLookup } from "./symbols.js";

/**
 * 27 을 실어 보낼 세션의 최소 표면. `HubSession` 과 `DmaSession` 이 둘 다 구조적으로 만족한다.
 */
export type MasterRequestSession = {
  readonly userId: string;
  readonly isReady: boolean;
  send(payload: Uint8Array): boolean;
};

/**
 * master-day 경계 = 07:30 KST. 당일 신규상장이 실리는 KRX A0 배치의 마지막(07:00)
 * 뒤 30분이다 — 세 배치(05:40/06:20/07:00) 중 어디에 처음 실리든 덮는다(OQ-2).
 */
export const MASTER_DAY_START_HOUR_KST = 7;
export const MASTER_DAY_START_MINUTE_KST = 30;

/** 57 분할 프레임 수 상한. 서버 전수 약 4,500 / 500 = 약 10프레임의 10배다 (T-cqj-03). */
export const MAX_MASTER_FRAMES = 100;

/** 요청 뒤 is_last 까지의 상한(ms). 약 10프레임 · 수백 KB 라 정상이면 수 초 안에 끝난다. */
export const MASTER_REQUEST_TIMEOUT_MS = 30_000;

/**
 * 실패 뒤 다음 시도까지의 간격(ms) = 5분. 게이트웨이는 같은 연결의 27 을 **60초 안에** 다시
 * 받으면 응답 없이 흡수한다(`kMasterReqMinIntervalMs`) — 그 창 안에서 두드리면 응답 없는
 * 요청이 타임아웃으로 또 실패할 뿐이다. 5분은 그 창 밖이고, 게이트웨이 부하도 무시할 만하다.
 */
export const MASTER_RETRY_BACKOFF_MS = 300_000;

/** master-day 당 시도(송신) 상한. 넘으면 다음 07:30 경계까지 멈춘다 (T-cqj-04). */
export const MAX_MASTER_ATTEMPTS_PER_DAY = 5;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MASTER_DAY_OFFSET_MS =
  (MASTER_DAY_START_HOUR_KST * 60 + MASTER_DAY_START_MINUTE_KST) * 60 * 1000;

/**
 * master-day 키 = (now − 07:30) 의 KST 날짜 `"YYYY-MM-DD"`.
 * 07:29 KST 는 전날 키, 07:30 KST 부터 오늘 키다.
 */
export function masterDayKey(now: number): string {
  return new Date(now + KST_OFFSET_MS - MASTER_DAY_OFFSET_MS).toISOString().slice(0, 10);
}

type Inflight = {
  userId: string;
  startedAt: number;
  nextSeq: number;
  totalItems: number | null;
  rawCount: number;
  skipped: number;
  frames: number;
  rows: Map<string, SymbolInfo>;
  /** NXT 거래가능 ISIN — 57 원순서. */
  nxt: string[];
};

type RequestReason = "ready" | "day-boundary" | "retry";

export type GatewaySymbolMasterOptions = {
  /**
   * 경계·재시도 타이머가 27 을 실어 보낼 Ready 세션을 고른다(`SessionManager.firstReady`).
   * 인자는 **피하고 싶은** userId(직전 실패 세션)다. 없으면 타이머 트리거는 아무것도 보내지 않는다.
   */
  pickSession?: (avoidUserId?: string) => MasterRequestSession | undefined;
  /** 벽시계 주입구. 미지정 시 `Date.now`. */
  now?: () => number;
  /** 미지정 시 `MASTER_REQUEST_TIMEOUT_MS`. */
  requestTimeoutMs?: number;
  /** 미지정 시 `MASTER_RETRY_BACKOFF_MS`. */
  retryBackoffMs?: number;
};

/**
 * 게이트웨이 종목마스터 보조 맵. `SymbolMap` 의 `fallback` 으로 결선된다.
 *
 * 이벤트: `"updated"` `{ count }` — 교체가 끝난 뒤 1회. hub 가 이름 없던 캐시 행을 재방송한다.
 *
 * 수명: `start()` 가 07:30 경계 타이머를 걸고, `close()` 가 경계·타임아웃·재시도 타이머를 모두
 * 지운다. 모든 타이머는 `unref` — 이 모듈 때문에 프로세스 종료가 늦어지지 않는다.
 */
export class GatewaySymbolMaster extends EventEmitter implements SymbolLookup {
  #byIsin = new Map<string, SymbolInfo>();
  /**
   * NXT 거래가능 ISIN 집합(quick-260923-pq2). **적재 전엔 `null`(모름)** — `false` 로 지어내지
   * 않는다(T-16-05). `#byIsin` 과 같은 적재 단위로 원자 교체된다.
   */
  #nxtTradableIsins: readonly string[] | null = null;
  #loadedDayKey: string | null = null;
  #loadedAt: Date | null = null;
  #inflight: Inflight | null = null;
  /** 이 시각 전에는 어떤 트리거도 27 을 보내지 않는다(실패 뒤 backoff). */
  #retryNotBefore = 0;
  #attempts: { dayKey: string; count: number } = { dayKey: "", count: 0 };
  /** 상한 도달 error 로그를 그 master-day 에 한 번만 남기기 위한 표식. */
  #capLoggedDayKey: string | null = null;
  #lastFailedUserId: string | undefined = undefined;
  #boundaryTimer: NodeJS.Timeout | null = null;
  #timeoutTimer: NodeJS.Timeout | null = null;
  #retryTimer: NodeJS.Timeout | null = null;
  readonly #pickSession: (avoidUserId?: string) => MasterRequestSession | undefined;
  readonly #now: () => number;
  readonly #requestTimeoutMs: number;
  readonly #retryBackoffMs: number;

  constructor(opts: GatewaySymbolMasterOptions = {}) {
    super();
    this.#pickSession = opts.pickSession ?? (() => undefined);
    this.#now = opts.now ?? (() => Date.now());
    this.#requestTimeoutMs = opts.requestTimeoutMs ?? MASTER_REQUEST_TIMEOUT_MS;
    this.#retryBackoffMs = opts.retryBackoffMs ?? MASTER_RETRY_BACKOFF_MS;
  }

  /** 다음 07:30 KST 경계 타이머를 건다. 이미 걸려 있으면 다시 건다. */
  start(): void {
    this.#armBoundary();
  }

  /** 경계·타임아웃·재시도 타이머를 모두 지우고 진행 중 요청을 버린다. 맵은 그대로 둔다. */
  close(): void {
    for (const timer of [this.#boundaryTimer, this.#timeoutTimer, this.#retryTimer]) {
      if (timer !== null) clearTimeout(timer);
    }
    this.#boundaryTimer = null;
    this.#timeoutTimer = null;
    this.#retryTimer = null;
    this.#inflight = null;
  }

  /** 보조 맵만 본다. Supabase 우선순위는 `SymbolMap.lookup` 이 쥔다(D-01). */
  lookup(isin: string): SymbolInfo | undefined {
    return this.#byIsin.get(isin);
  }

  /**
   * NXT 거래가능 ISIN 집합(57 원순서). 적재 전엔 `null`(모름). 반환 배열은 보관 중인 참조다 —
   * 호출부가 바꾸지 않는다(fanout 은 전송용으로 한 번 복사한다).
   */
  nxtTradableIsins(): readonly string[] | null {
    return this.#nxtTradableIsins;
  }

  /** 운영 요약. 식별자를 담지 않는다. */
  stats(): {
    symbolCount: number;
    nxtTradableCount: number;
    loadedAt: string | null;
    dayKey: string | null;
    inflight: boolean;
  } {
    return {
      symbolCount: this.#byIsin.size,
      nxtTradableCount: this.#nxtTradableIsins?.length ?? 0,
      loadedAt: this.#loadedAt === null ? null : this.#loadedAt.toISOString(),
      dayKey: this.#loadedDayKey,
      inflight: this.#inflight !== null,
    };
  }

  /**
   * 세션이 Ready 가 됐다(hub `#onReady` 의 4번째 줄). 이번 master-day 에 아직 성공한 적이 없고,
   * 진행 중인 요청도 backoff 도 없고, 오늘 시도 상한 전일 때만 이 세션으로 27 을 보낸다 —
   * 사용자 N명이 Ready 가 돼도 1건이다.
   */
  onSessionReady(session: MasterRequestSession): void {
    this.#tryRequest(session, "ready");
  }

  /**
   * 57 한 프레임. `frame === null` 은 파서가 이미 사유를 남긴 파싱 실패다.
   * 요청 세션이 아닌 userId 의 프레임과 요청 없이 온 프레임은 조립하지 않는다.
   */
  onFrame(userId: string, frame: ParsedSymbolMasterFrame | null): void {
    const inflight = this.#inflight;
    if (inflight === null) {
      logger.warn({ userId }, "[SYM-GW] 요청 없는 57 — 무시");
      return;
    }
    if (userId !== inflight.userId) {
      logger.debug(
        { userId, requestUserId: inflight.userId },
        "[SYM-GW] 요청 세션이 아닌 57 — 조립하지 않는다",
      );
      return;
    }
    if (frame === null) return this.#fail("parse");
    if (frame.seq !== inflight.nextSeq || frame.seq > MAX_MASTER_FRAMES) {
      return this.#fail("seq-gap", { expectedSeq: inflight.nextSeq, seq: frame.seq });
    }
    if (inflight.totalItems === null) {
      inflight.totalItems = frame.totalItems;
    } else if (inflight.totalItems !== frame.totalItems) {
      return this.#fail("total-changed", {
        totalItems: inflight.totalItems,
        frameTotalItems: frame.totalItems,
      });
    }
    const total = inflight.totalItems;
    if (inflight.rawCount + frame.rawCount > total) {
      return this.#fail("overflow", { totalItems: total, incoming: frame.rawCount });
    }

    inflight.nextSeq += 1;
    inflight.frames += 1;
    inflight.rawCount += frame.rawCount;
    inflight.skipped += frame.skipped;
    for (const row of frame.rows) {
      inflight.rows.set(row.isin, {
        code: row.code,
        name: row.name,
        market: row.market,
        source: "gateway",
      });
      // NXT 플래그는 SymbolInfo 에 넣지 않는다(A-1) — 별도 ISIN 집합으로만 보관한다.
      if (row.nxtTradable) inflight.nxt.push(row.isin);
    }

    if (!frame.isLast) return;
    if (inflight.rawCount !== total) {
      return this.#fail("count-mismatch", { totalItems: total });
    }
    if (inflight.rows.size === 0) {
      return this.#fail("empty — 기존 맵 유지");
    }

    // 원자 교체 — 새 Map 을 다 만든 뒤 한 번에 바꾼다. 조립 도중의 조회는 옛 맵을 본다.
    const now = this.#now();
    this.#clearTimeoutTimer();
    this.#byIsin = inflight.rows;
    this.#nxtTradableIsins = inflight.nxt;
    // 성공 키는 **완료 시각**으로 매긴다(D-03).
    this.#loadedDayKey = masterDayKey(now);
    this.#loadedAt = new Date(now);
    this.#inflight = null;
    const count = this.#byIsin.size;
    logger.info(
      {
        count,
        nxtTradableCount: inflight.nxt.length,
        skipped: inflight.skipped,
        frames: inflight.frames,
        elapsedMs: now - inflight.startedAt,
        dayKey: this.#loadedDayKey,
      },
      "[SYM-GW] 게이트웨이 종목마스터 적재",
    );
    this.emit("updated", { count });
  }

  /**
   * 요청 경로는 이 함수 하나다 — Ready · 07:30 경계 · 재시도가 모두 여기로 온다.
   * due = 진행 중 없음 ∧ 이번 master-day 미적재 ∧ backoff 지남 ∧ 오늘 시도 < 상한 ∧ Ready 세션.
   */
  #tryRequest(session: MasterRequestSession | undefined, reason: RequestReason): void {
    if (this.#inflight !== null) return;
    const now = this.#now();
    const dayKey = masterDayKey(now);
    if (this.#loadedDayKey === dayKey) return;
    if (now < this.#retryNotBefore) return;

    if (this.#attempts.dayKey !== dayKey) this.#attempts = { dayKey, count: 0 };
    if (this.#attempts.count >= MAX_MASTER_ATTEMPTS_PER_DAY) {
      if (this.#capLoggedDayKey !== dayKey) {
        this.#capLoggedDayKey = dayKey;
        logger.error(
          { dayKey, attempts: this.#attempts.count, reason },
          "[SYM-GW] 오늘 재시도 상한 도달 — 다음 07:30 경계까지 중단",
        );
      }
      return;
    }

    if (session === undefined || !session.isReady) {
      // Ready 이벤트는 언제나 Ready 세션을 싣는다 — 여기 오는 것은 타이머 트리거다.
      if (reason !== "ready") {
        logger.info(
          { dayKey, reason },
          reason === "day-boundary"
            ? "[SYM-GW] 경계 도달 — Ready 세션 없음, 첫 Ready 에서 요청"
            : "[SYM-GW] 재시도 — Ready 세션 없음, 첫 Ready 에서 요청",
        );
      }
      return;
    }

    this.#attempts.count += 1;
    const attempt = this.#attempts.count;
    if (!session.send(buildGetSymbolMasterReq())) {
      this.#fail("send-false", { attempt }, session.userId);
      return;
    }
    this.#inflight = {
      userId: session.userId,
      startedAt: now,
      nextSeq: 0,
      totalItems: null,
      rawCount: 0,
      skipped: 0,
      frames: 0,
      rows: new Map(),
      nxt: [],
    };
    this.#clearTimeoutTimer();
    this.#timeoutTimer = setTimeout(() => {
      this.#timeoutTimer = null;
      if (this.#inflight !== null) this.#fail("timeout", { timeoutMs: this.#requestTimeoutMs });
    }, this.#requestTimeoutMs);
    this.#timeoutTimer.unref?.();
    logger.info(
      { userId: session.userId, dayKey, reason, attempt },
      "[SYM-GW] 게이트웨이 종목마스터 요청",
    );
  }

  /**
   * 요청 실패. 옛 맵은 건드리지 않는다. backoff 를 세우고 재시도 타이머를 다시 건다 —
   * 재시도는 가능하면 **다른** Ready 세션으로 간다(`pickSession(직전 실패 userId)`).
   */
  #fail(reason: string, detail: Record<string, unknown> = {}, failedUserId?: string): void {
    const inflight = this.#inflight;
    this.#inflight = null;
    this.#clearTimeoutTimer();
    const now = this.#now();
    this.#retryNotBefore = now + this.#retryBackoffMs;
    this.#lastFailedUserId = failedUserId ?? inflight?.userId;
    logger.warn(
      {
        reason,
        userId: this.#lastFailedUserId,
        dayKey: masterDayKey(now),
        frames: inflight?.frames ?? 0,
        rawCount: inflight?.rawCount ?? 0,
        keptCount: this.#byIsin.size,
        retryInMs: this.#retryBackoffMs,
        ...detail,
      },
      "[SYM-GW] 게이트웨이 종목마스터 요청 실패 — 기존 맵 유지",
    );

    if (this.#retryTimer !== null) clearTimeout(this.#retryTimer);
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = null;
      this.#tryRequest(this.#pickSession(this.#lastFailedUserId), "retry");
    }, this.#retryBackoffMs);
    this.#retryTimer.unref?.();
  }

  #armBoundary(): void {
    if (this.#boundaryTimer !== null) clearTimeout(this.#boundaryTimer);
    const delay = msUntilKst(MASTER_DAY_START_HOUR_KST, MASTER_DAY_START_MINUTE_KST, this.#now());
    this.#boundaryTimer = setTimeout(() => {
      this.#boundaryTimer = null;
      this.#tryRequest(this.#pickSession(), "day-boundary");
      this.#armBoundary();
    }, delay);
    this.#boundaryTimer.unref?.();
  }

  #clearTimeoutTimer(): void {
    if (this.#timeoutTimer !== null) {
      clearTimeout(this.#timeoutTimer);
      this.#timeoutTimer = null;
    }
  }
}
