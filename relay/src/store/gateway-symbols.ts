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
 *         **한 번에** 교체한다. 빈 결과로는 기존 맵을 지우지 않는다. 모든 실패 갈래는 사유를 담은
 *         `[SYM-GW]` 로그를 남긴다(무로그 fail-safe 금지).
 *
 * 하지 않는 것:
 *   - 57 을 브라우저로 흘리지 않는다(공개 마스터 — relay 이름 해석에만 쓴다).
 *   - 개별 ISIN 을 지연 조회하지 않는다. 요청 수는 사용자 수와 무관하다.
 *   - throw 하지 않는다. 이름은 표시용이라 relay 기동·주문 경로를 막을 이유가 없다.
 */
import { EventEmitter } from "node:events";

import { logger } from "../logger.js";
import { buildGetSymbolMasterReq, type ParsedSymbolMasterFrame } from "../dma/envelope.js";
import type { SymbolInfo, SymbolLookup } from "./symbols.js";

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
};

export type GatewaySymbolMasterOptions = {
  /** 벽시계 주입구. 미지정 시 `Date.now`. */
  now?: () => number;
};

/**
 * 게이트웨이 종목마스터 보조 맵. `SymbolMap` 의 `fallback` 으로 결선된다.
 *
 * 이벤트: `"updated"` `{ count }` — 교체가 끝난 뒤 1회. hub 가 이름 없던 캐시 행을 재방송한다.
 */
export class GatewaySymbolMaster extends EventEmitter implements SymbolLookup {
  #byIsin = new Map<string, SymbolInfo>();
  #loadedDayKey: string | null = null;
  #loadedAt: Date | null = null;
  #inflight: Inflight | null = null;
  readonly #now: () => number;

  constructor(opts: GatewaySymbolMasterOptions = {}) {
    super();
    this.#now = opts.now ?? (() => Date.now());
  }

  /** 보조 맵만 본다. Supabase 우선순위는 `SymbolMap.lookup` 이 쥔다(D-01). */
  lookup(isin: string): SymbolInfo | undefined {
    return this.#byIsin.get(isin);
  }

  /** 운영 요약. 식별자를 담지 않는다. */
  stats(): { symbolCount: number; loadedAt: string | null; dayKey: string | null; inflight: boolean } {
    return {
      symbolCount: this.#byIsin.size,
      loadedAt: this.#loadedAt === null ? null : this.#loadedAt.toISOString(),
      dayKey: this.#loadedDayKey,
      inflight: this.#inflight !== null,
    };
  }

  /**
   * 세션이 Ready 가 됐다(hub `#onReady` 의 4번째 줄). 이번 master-day 에 아직 성공한 적이 없고
   * 진행 중인 요청도 없을 때만 이 세션으로 27 을 보낸다 — 사용자 N명이 Ready 가 돼도 1건이다.
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
    this.#byIsin = inflight.rows;
    this.#loadedDayKey = masterDayKey(now);
    this.#loadedAt = new Date(now);
    this.#inflight = null;
    const count = this.#byIsin.size;
    logger.info(
      {
        count,
        skipped: inflight.skipped,
        frames: inflight.frames,
        elapsedMs: now - inflight.startedAt,
        dayKey: this.#loadedDayKey,
      },
      "[SYM-GW] 게이트웨이 종목마스터 적재",
    );
    this.emit("updated", { count });
  }

  #tryRequest(session: MasterRequestSession | undefined, reason: "ready"): void {
    if (session === undefined || !session.isReady) return;
    if (this.#inflight !== null) return;
    const now = this.#now();
    const dayKey = masterDayKey(now);
    if (this.#loadedDayKey === dayKey) return;

    if (!session.send(buildGetSymbolMasterReq())) {
      logger.warn(
        { userId: session.userId, dayKey, reason },
        "[SYM-GW] 게이트웨이 종목마스터 요청 송신 실패 (send-false)",
      );
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
    };
    logger.info({ userId: session.userId, dayKey, reason }, "[SYM-GW] 게이트웨이 종목마스터 요청");
  }

  /** 조립 실패. 옛 맵은 건드리지 않는다. */
  #fail(reason: string, detail: Record<string, unknown> = {}): void {
    const inflight = this.#inflight;
    this.#inflight = null;
    logger.warn(
      {
        reason,
        userId: inflight?.userId,
        dayKey: masterDayKey(this.#now()),
        frames: inflight?.frames ?? 0,
        rawCount: inflight?.rawCount ?? 0,
        keptCount: this.#byIsin.size,
        ...detail,
      },
      "[SYM-GW] 게이트웨이 종목마스터 조립 실패 — 기존 맵 유지",
    );
  }
}
