'use client';

/**
 * useTickLive — 당일 종목 바이트 경로 (Phase 37 D-05 · D-18 · D-22 · 37-15 `GET /api/ticks/live`).
 *
 * ① `enabled` false(today 응답 live=false · 오늘이 아님)면 요청을 한 번도 보내지 않는다(D-22).
 * ② 하루치(D-05): offset 0 · epoch 없이 시작 → 응답 바이트를 모으며 `X-Tick-State` 가 loading/queued 인 동안 2초 뒤
 *   `X-Tick-Offset-End` 부터 이어 받는다(카드 「하루치 받는 중 · 대기 k건」 = `meta.queue`). 그 밖 상태가 오면 모은 바이트로
 *   `appendTickBytes(null, …)` → 세션(status ready).
 * ③ 503 = 미결선(status unavailable — 「당일 자료 준비 중」) · 401/403 = 게이트(status unauthenticated/unmapped) — 멈춘다.
 *   그 밖 오류(502 · 0)는 `pollMs` 뒤 다시 본다(간격을 줄이지 않는다).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { concatBytes, dayStartNs, type TickExchange, type TickLiveMeta } from '@gh-radar/shared';

import { fetchTickLive, type TickLiveResult } from './tick-api';
import { appendTickBytes, type TickSession } from './tick-session';

/** 증분 폴링 간격 — 5초(D-06 「5~10초」 안 · RESEARCH Pattern 12). */
export const TICK_LIVE_POLL_MS = 5_000;
/** 하루치 받는 중(loading · queued) 이어 받기 간격. */
export const TICK_LIVE_LOADING_MS = 2_000;

export type TickLiveStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'unauthenticated' | 'unmapped';

export interface TickLiveView {
  status: TickLiveStatus;
  /** 마지막 성공 응답의 헤더(409 뒤에는 새 epoch 만 채운 값). */
  meta: TickLiveMeta | null;
  session: TickSession | null;
  /** 커서가 끝이 아닐 때 붙은 레코드 수(「새 틱 n건」). */
  newCount: number;
  /** 연속 오류 수(502 · 0 · 500 등) — 성공하면 0. */
  errors: number;
}

export interface UseTickLiveOptions {
  isin: string | null;
  ex: TickExchange;
  /** 오늘 `YYYYMMDD` — 세션 키 · 08:00 기준. */
  date: string | null;
  enabled: boolean;
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

const IDLE: TickLiveView = { status: 'idle', meta: null, session: null, newCount: 0, errors: 0 };

interface Ctl {
  stopped: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  epoch: string | null;
  offset: number;
  /** 하루치 받는 동안 모은 zstd 바이트. */
  pending: Uint8Array[];
  session: TickSession | null;
  meta: TickLiveMeta | null;
  errors: number;
  newCount: number;
}

export function useTickLive({
  isin,
  ex,
  date,
  enabled,
  pollMs = TICK_LIVE_POLL_MS,
  loadingMs = TICK_LIVE_LOADING_MS,
}: UseTickLiveOptions): TickLiveView & { stop: () => void } {
  const [view, setView] = useState<TickLiveView>(IDLE);
  const ctlRef = useRef<Ctl | null>(null);

  useEffect(() => {
    if (!enabled || isin === null || date === null) {
      setView(IDLE);
      return;
    }
    const c: Ctl = {
      stopped: false,
      timer: null,
      running: false,
      epoch: null,
      offset: 0,
      pending: [],
      session: null,
      meta: null,
      errors: 0,
      newCount: 0,
    };
    ctlRef.current = c;
    const key = { date, ex, isin };

    const publish = (status?: TickLiveStatus) =>
      setView({
        status: status ?? (c.session === null ? 'loading' : 'ready'),
        meta: c.meta,
        session: c.session,
        newCount: c.newCount,
        errors: c.errors,
      });

    const halt = (status: TickLiveStatus) => {
      c.stopped = true;
      if (c.timer !== null) clearTimeout(c.timer);
      c.timer = null;
      publish(status);
    };

    const schedule = (ms: number) => {
      if (c.stopped || c.timer !== null) return;
      c.timer = setTimeout(() => void tick(), ms);
    };

    const handle = (r: TickLiveResult) => {
      if (r.status === 200 && r.meta !== null) {
        const m = r.meta;
        c.errors = 0;
        c.meta = m;
        c.epoch = m.epoch;
        c.offset = m.offsetEnd;
        if (c.session === null) {
          if (r.bytes.length > 0) c.pending.push(r.bytes);
          if (m.state === 'loading' || m.state === 'queued') {
            publish();
            return schedule(loadingMs);
          }
          c.session = appendTickBytes(null, concatBytes(c.pending), key);
          c.pending = [];
          publish();
          return;
        }
        if (r.bytes.length > 0) c.session = appendTickBytes(c.session, r.bytes, key);
        publish();
        return;
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
        r = { status: 0, bytes: new Uint8Array(0), meta: null };
      } finally {
        c.running = false;
      }
      if (c.stopped) return;
      handle(r);
    }

    publish('loading');
    void tick();
    return () => {
      c.stopped = true;
      if (c.timer !== null) clearTimeout(c.timer);
      c.timer = null;
      if (ctlRef.current === c) ctlRef.current = null;
    };
  }, [enabled, isin, ex, date, pollMs, loadingMs]);

  const stop = useCallback(() => {
    const c = ctlRef.current;
    if (c === null) return;
    c.stopped = true;
    if (c.timer !== null) clearTimeout(c.timer);
    c.timer = null;
  }, []);

  return { ...view, stop };
}
