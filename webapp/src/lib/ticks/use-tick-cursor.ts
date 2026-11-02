'use client';

/**
 * useTickCursor — 틱 뷰어 커서 · 표시 순서 · 점프 · URL `t` (Phase 37 D-00 · D-18).
 *
 * ① 커서 정본 = 레코드 색인 `rec`. 자리 `pos` 는 표시 순서(기본 거래소순 · 수신순)에서의 위치다 — 순서를 바꿔도 같은 틱에 머문다.
 * ② 초기 커서: `initialT`(URL `t`) → `parseTickTime` → 수신순 `lowerBoundRecv`(그 시각 이후 첫 틱) · 없으면 08:00 이후 첫 틱.
 *   모두 그보다 이르면 마지막 틱.
 * ③ 커서가 바뀌면 250ms 스로틀로 `history.replaceState` — router 를 거치지 않는다(히스토리 안 쌓임 · 리렌더 최소).
 *   처음 커서(열기 직후)는 쓰지 않는다 — 열기만 해서 URL 이 바뀌지 않게.
 * recv_ns 는 BigInt 그대로 다룬다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { fmtTickTime, lowerBoundRecv, parseTickTime } from '@gh-radar/shared';

import type { TickSession } from './tick-session';
import { tickUrlOf, type TickUrlState } from './tick-url';

export type TickOrderMode = 'exchange' | 'recv';
export const PLAY_SPEEDS = [1, 10, 'max'] as const;
export type TickPlaySpeed = (typeof PLAY_SPEEDS)[number];

/** URL `t` 갱신 스로틀(ms). */
export const TICK_URL_THROTTLE_MS = 250;

export interface TickCursor {
  rec: number;
  pos: number;
  mode: TickOrderMode;
  setMode: (m: TickOrderMode) => void;
  step: (delta: number) => void;
  jumpTo: (hms: string) => boolean;
  jumpToRec: (rec: number) => void;
  seekNs: (ns: bigint) => void;
  playing: boolean;
  speed: TickPlaySpeed;
  togglePlay: () => void;
  setSpeed: (s: TickPlaySpeed) => void;
}

/** 수신순 lower_bound(≥ ns) → rec. 모두 이르면 마지막 · 빈 세션이면 -1. */
export function recAtNs(session: TickSession, ns: bigint): number {
  const n = session.recvOrder.length;
  if (n === 0) return -1;
  const p = Math.min(n - 1, lowerBoundRecv(session.index.recvNs, session.recvOrder, ns));
  return session.recvOrder[p]!;
}

/** 열기 직후 커서 — `t` 가 있으면 그 시각 이후 첫 틱, 없으면 08:00 이후 첫 틱. */
export function initialRecOf(session: TickSession, initialT: string | null): number {
  const ns = initialT === null ? null : parseTickTime(initialT, session.date);
  return recAtNs(session, ns ?? session.dayStartNs);
}

export function useTickCursor(
  session: TickSession,
  { initialT, urlState }: { initialT: string | null; urlState: Omit<TickUrlState, 't'> },
): TickCursor {
  const [rec, setRec] = useState(() => initialRecOf(session, initialT));
  const [mode, setMode] = useState<TickOrderMode>('exchange');
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<TickPlaySpeed>(1);

  const order = mode === 'exchange' ? session.exOrder : session.recvOrder;
  const posOf = mode === 'exchange' ? session.exPos : session.recvPos;
  const pos = rec < 0 ? -1 : posOf[rec]!;

  const step = useCallback(
    (delta: number) => {
      setRec((r) => {
        if (r < 0 || order.length === 0) return r;
        const p = Math.max(0, Math.min(order.length - 1, posOf[r]! + delta));
        return order[p]!;
      });
    },
    [order, posOf],
  );

  const jumpToRec = useCallback(
    (r: number) => {
      if (r >= 0 && r < session.index.n) setRec(r);
    },
    [session],
  );

  const seekNs = useCallback(
    (ns: bigint) => {
      const r = recAtNs(session, ns);
      if (r >= 0) setRec(r);
    },
    [session],
  );

  const jumpTo = useCallback(
    (hms: string) => {
      const ns = parseTickTime(hms.trim(), session.date);
      if (ns === null) return false;
      seekNs(ns);
      return true;
    },
    [session, seekNs],
  );

  const togglePlay = useCallback(() => setPlaying((p) => !p), []);

  // URL `t` — 250ms 스로틀 replaceState(첫 커서는 쓰지 않는다).
  const urlRef = useRef(urlState);
  useEffect(() => {
    urlRef.current = urlState;
  });
  const firstRec = useRef(rec);
  const lastWrite = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recRef = useRef(rec);
  useEffect(() => {
    recRef.current = rec;
    if (rec < 0 || (rec === firstRec.current && lastWrite.current === 0)) return;
    const write = () => {
      timer.current = null;
      lastWrite.current = Date.now();
      const r = recRef.current;
      const t = fmtTickTime(session.index.recvNs[r]!);
      window.history.replaceState(null, '', tickUrlOf({ ...urlRef.current, t }));
    };
    const wait = TICK_URL_THROTTLE_MS - (Date.now() - lastWrite.current);
    if (wait <= 0) write();
    else if (timer.current === null) timer.current = setTimeout(write, wait);
  }, [rec, session]);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return { rec, pos, mode, setMode, step, jumpTo, jumpToRec, seekNs, playing, speed, togglePlay, setSpeed };
}
