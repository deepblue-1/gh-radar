'use client';

/**
 * useTickLive — 당일 종목 바이트 경로 (Phase 37 D-05 · D-06 · D-18 · D-22 · 37-15 `GET /api/ticks/live`).
 *
 * ① `enabled` false(today 응답 live=false · 오늘이 아님)면 요청을 한 번도 보내지 않는다(D-22).
 * ② 하루치(D-05): offset 0 · epoch 없이 시작 → 응답 바이트를 모으며 `X-Tick-State` 가 loading/queued 인 동안 `loadingMs`(2초)
 *   뒤 `X-Tick-Offset-End` 부터 이어 받는다(카드 「하루치 받는 중 · 대기 k건」 = `meta.queue`). 그 밖 상태가 오면 모은 바이트로
 *   `appendTickBytes(null, …)` → 세션(status ready).
 * ③ 증분(D-06): `document.visibilityState === 'visible'` ∧ `atEnd`(커서가 끝 틱 — 뷰어가 알린다)일 때만 `pollMs`(5초)마다
 *   offset = 마지막 offsetEnd. 바이트가 오면 `appendTickBytes` 로 세션을 다시 만든다(열린 주문 재분류 — Pitfall 9).
 *   - 과거 틱을 보면 멈춘다(요청 0). 멈추기 직전에 떠 있던 요청이 가져온 레코드는 `newCount`(「새 틱 n건」).
 *   - `goEnd()` = 즉시 1회(+ `newCount` 0) · 뷰어가 커서를 끝으로 옮기면 `atEnd` 가 true 로 돌아와 폴링이 이어진다.
 *   - 탭이 숨으면 멈추고, 다시 보이면 즉시 1회.
 * ④ 409 `{epoch}` → 새 epoch 로 offset 0 부터 즉시 다시 받는다. 받는 동안은 이전 세션을 그대로 보이고, 하루치가 다 오면 세션을
 *   바꾸고 `generation` 을 올린다(뷰어 key — 새 세션은 끝 틱에서 연다).
 * ⑤ 상태 delayed · blocked 는 `meta.state` 로 머리에 알릴 뿐 간격은 그대로다. 오류(502 · 500 · 0 네트워크)는 `errors` 를 세고
 *   다음 주기(`pollMs`)까지 기다린다 — 재시도로 두드리지 않고 간격을 줄이지 않는다. 503 = 미결선(status unavailable) ·
 *   401/403 = 게이트(status unauthenticated/unmapped) — 멈춘다.
 * ⑥ `stop()` = 받는 중 카드 「취소」 — 이후 요청 0.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { concatBytes, dayStartNs, type TickExchange, type TickLiveMeta } from '@gh-radar/shared';

import { fetchTickLive, type TickLiveResult } from './tick-api';
import { appendTickBytes, type TickSession } from './tick-session';

/** 증분 폴링 간격 — 5초(D-06 「5~10초」 안 · RESEARCH Pattern 12). 오류 뒤 간격도 같다. */
export const TICK_LIVE_POLL_MS = 5_000;
/** 하루치 받는 중(loading · queued) 이어 받기 간격. */
export const TICK_LIVE_LOADING_MS = 2_000;
/** 연속 오류가 이 수 이상이면 머리에 「당일 자료를 받지 못하고 있어요」. */
export const TICK_LIVE_FAILING_AFTER = 3;

export type TickLiveStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'unauthenticated' | 'unmapped';

export interface TickLiveView {
  status: TickLiveStatus;
  /** 마지막 응답 헤더(409 뒤에는 새 epoch 만 채운 값). */
  meta: TickLiveMeta | null;
  session: TickSession | null;
  /** epoch 가 바뀌어 세션을 통째로 바꾼 횟수 — 뷰어 key 에 붙인다. */
  generation: number;
  /** 커서가 끝이 아닐 때 붙은 레코드 수(「새 틱 n건」). */
  newCount: number;
  /** 연속 오류 수(502 · 500 · 0 등) — 성공하면 0. */
  errors: number;
}

export interface UseTickLiveOptions {
  isin: string | null;
  ex: TickExchange;
  /** 오늘 `YYYYMMDD` — 세션 키 · 08:00 기준. */
  date: string | null;
  enabled: boolean;
  /** 커서가 끝 틱인가(뷰어가 알린다 · 세션 전에는 의미 없음). 기본 true. */
  atEnd?: boolean;
  pollMs?: number;
  loadingMs?: number;
}

/**
 * 하루치 받기 진행(0~1) — (마지막 수신 − 08:00) / (지금 − 08:00). 헤더에 전체 크기가 없어서 시각으로 잰다.
 * 아직 수신이 없거나 08:00 전이면 null(불확정 진행 바).
 */
export function liveProgressOf(meta: TickLiveMeta | null, date: string, nowMs: number): number | null {
  if (meta === null || meta.lastRecvNs === null) return null;
  const startMs = Number(dayStartNs(date, '0800') / 1_000_000n);
  const lastMs = Number(BigInt(meta.lastRecvNs) / 1_000_000n);
  if (nowMs <= startMs) return null;
  return Math.min(1, Math.max(0, (lastMs - startMs) / (nowMs - startMs)));
}

const IDLE: TickLiveView = { status: 'idle', meta: null, session: null, generation: 0, newCount: 0, errors: 0 };

interface Ctl {
  stopped: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  epoch: string | null;
  offset: number;
  /** 하루치(첫 · epoch 교체 뒤) 받는 동안 모은 zstd 바이트. */
  pending: Uint8Array[];
  /** epoch 가 바뀌어 하루치를 다시 받는 중(이전 세션은 그대로 보인다). */
  refetching: boolean;
  session: TickSession | null;
  meta: TickLiveMeta | null;
  generation: number;
  errors: number;
  newCount: number;
  /** 연속 409 — 비정상 루프면 즉시 대신 `pollMs` 로. */
  conflicts: number;
  /** 다음 주기를 다시 잡는다(가시성 · 끝 복귀 · goEnd 가 부른다). */
  resume: (now: boolean) => void;
}

const EMPTY = new Uint8Array(0);

export function useTickLive({
  isin,
  ex,
  date,
  enabled,
  atEnd = true,
  pollMs = TICK_LIVE_POLL_MS,
  loadingMs = TICK_LIVE_LOADING_MS,
}: UseTickLiveOptions): TickLiveView & { goEnd: () => void; stop: () => void } {
  const [view, setView] = useState<TickLiveView>(IDLE);
  const ctlRef = useRef<Ctl | null>(null);
  const atEndRef = useRef(atEnd);
  const publishRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled || isin === null || date === null) {
      setView(IDLE);
      return;
    }
    const key = { date, ex, isin };
    const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const c: Ctl = {
      stopped: false,
      timer: null,
      running: false,
      epoch: null,
      offset: 0,
      pending: [],
      refetching: false,
      session: null,
      meta: null,
      generation: 0,
      errors: 0,
      newCount: 0,
      conflicts: 0,
      resume: () => {},
    };
    ctlRef.current = c;

    const filling = () => c.session === null || c.refetching;
    /** 증분 단계에서 커서가 과거면 멈춘다(하루치 받는 동안은 커서와 무관). */
    const paused = () => !filling() && !atEndRef.current;

    const publish = (status?: TickLiveStatus) =>
      setView({
        status: status ?? (c.session === null ? 'loading' : 'ready'),
        meta: c.meta,
        session: c.session,
        generation: c.generation,
        newCount: c.newCount,
        errors: c.errors,
      });
    publishRef.current = () => publish();

    const clear = () => {
      if (c.timer !== null) clearTimeout(c.timer);
      c.timer = null;
    };
    const halt = (status: TickLiveStatus) => {
      c.stopped = true;
      clear();
      publish(status);
    };
    const schedule = (ms: number) => {
      if (c.stopped || c.timer !== null || hidden() || paused()) return;
      c.timer = setTimeout(() => void tick(), ms);
    };

    const handle = (r: TickLiveResult) => {
      if (r.status === 200 && r.meta !== null) {
        const m = r.meta;
        c.errors = 0;
        c.conflicts = 0;
        c.meta = m;
        c.epoch = m.epoch;
        c.offset = m.offsetEnd;
        if (filling()) {
          if (r.bytes.length > 0) c.pending.push(r.bytes);
          if (m.state === 'loading' || m.state === 'queued') {
            publish();
            return schedule(loadingMs);
          }
          c.session = appendTickBytes(null, concatBytes(c.pending), key);
          c.pending = [];
          if (c.refetching) {
            c.refetching = false;
            c.generation += 1;
          }
          c.newCount = 0;
          publish();
          return schedule(pollMs);
        }
        if (r.bytes.length > 0) {
          const before = c.session!.index.n;
          c.session = appendTickBytes(c.session, r.bytes, key);
          if (!atEndRef.current) c.newCount += c.session.index.n - before;
        }
        publish();
        return schedule(pollMs);
      }
      if (r.status === 409) {
        // 새 epoch(캐시 엔트리 교체 · tickgw 재기동) — offset 0 부터 하루치를 다시. 이전 세션은 다 받을 때까지 그대로.
        c.conflicts += 1;
        c.epoch = r.meta?.epoch ?? null;
        c.offset = 0;
        c.pending = [];
        if (c.session !== null) c.refetching = true;
        publish();
        return schedule(c.conflicts > 1 ? pollMs : 0);
      }
      if (r.status === 503) return halt('unavailable');
      if (r.status === 401) return halt('unauthenticated');
      if (r.status === 403) return halt('unmapped');
      c.errors += 1;
      publish();
      schedule(pollMs);
    };

    async function tick() {
      c.timer = null;
      if (c.stopped || c.running) return;
      c.running = true;
      let r: TickLiveResult;
      try {
        r = await fetchTickLive({ isin: isin!, ex, epoch: c.epoch, offset: c.offset });
      } catch {
        r = { status: 0, bytes: EMPTY, meta: null };
      } finally {
        c.running = false;
      }
      if (c.stopped) return;
      handle(r);
    }

    c.resume = (now: boolean) => {
      if (c.stopped || c.running) return;
      if (now) {
        clear();
        void tick();
      } else {
        schedule(filling() ? loadingMs : pollMs);
      }
    };

    const onVisibility = () => {
      if (hidden()) clear();
      else if (c.timer === null && !paused()) c.resume(true);
    };

    publish('loading');
    void tick();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      c.stopped = true;
      clear();
      document.removeEventListener('visibilitychange', onVisibility);
      if (ctlRef.current === c) ctlRef.current = null;
    };
  }, [enabled, isin, ex, date, pollMs, loadingMs]);

  // 커서가 끝으로 돌아오면 새 틱 수를 비우고 다음 주기를 잡는다 · 과거로 가면 잡힌 주기를 걷는다.
  useEffect(() => {
    atEndRef.current = atEnd;
    const c = ctlRef.current;
    if (c === null || c.stopped || c.session === null || c.refetching) return;
    if (atEnd) {
      if (c.newCount !== 0) {
        c.newCount = 0;
        publishRef.current();
      }
      c.resume(false);
    } else if (c.timer !== null) {
      clearTimeout(c.timer);
      c.timer = null;
    }
  }, [atEnd]);

  const goEnd = useCallback(() => {
    const c = ctlRef.current;
    if (c === null || c.stopped) return;
    c.newCount = 0;
    publishRef.current();
    c.resume(true);
  }, []);

  const stop = useCallback(() => {
    const c = ctlRef.current;
    if (c === null) return;
    c.stopped = true;
    if (c.timer !== null) clearTimeout(c.timer);
    c.timer = null;
  }, []);

  return { ...view, goEnd, stop };
}
