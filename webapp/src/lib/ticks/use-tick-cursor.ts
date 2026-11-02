'use client';

/**
 * useTickCursor — 틱 뷰어 커서 · 표시 순서 · 점프 · URL `t` (Phase 37 D-00 · D-18).
 *
 * ① 커서 정본 = 레코드 색인 `rec`. 자리 `pos` 는 표시 순서(기본 거래소순 · 수신순)에서의 위치다 — 순서를 바꿔도 같은 틱에 머문다.
 * ② 초기 커서: `initialT`(URL `t`) → `parseTickTime` → 수신순 `lowerBoundRecv`(그 시각 이후 첫 틱) · 없으면 08:00 이후 첫 틱
 *   (당일 `live` 는 끝 틱 — D-18). 모두 그보다 이르면 마지막 틱.
 * ③ 키: `←` `→` 한 행 · `Shift+←/→` 10행 · `Space` 재생/정지(입력창 포커스 중엔 가로채지 않는다). 재생 1× = 실제 수신 간격(2초 상한) ·
 *   10× = 그 1/10 · 최대 = 프레임마다 한 틱 · 끝에서 정지.
 * ④ 커서가 바뀌면 250ms 스로틀로 `history.replaceState` — router 를 거치지 않는다(히스토리 안 쌓임 · 리렌더 최소).
 *   처음 커서(열기 직후)는 쓰지 않는다 — 열기만 해서 URL 이 바뀌지 않게. 당일(`live`)에서 끝 틱이면 `t` 를 지운다
 *   (`t` 없음 = 당일 끝 틱 — 새로고침하면 그때의 끝에서 연다).
 * ⑤ 당일(`live` · 37-19 · D-06 · D-18): 세션이 바뀌었을 때(증분) 커서가 이전 세션의 끝이었으면 새 끝으로 따라간다 — 과거 틱을
 *   보고 있으면 제자리(rec 는 이어붙여도 그대로다). `atEnd` = 표시 순서의 마지막 자리 · `goEnd()` = 끝 틱으로.
 * recv_ns 는 BigInt 그대로 다룬다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { fmtTickTime, lowerBoundRecv, parseTickTime } from '@gh-radar/shared';

import type { TickSession } from './tick-session';
import { tickUrlOf, type TickUrlState } from './tick-url';

export type TickOrderMode = 'exchange' | 'recv';
export const PLAY_SPEEDS = [1, 10, 'max'] as const;
export type TickPlaySpeed = (typeof PLAY_SPEEDS)[number];

/** 재생 1× 에서 다음 틱까지 기다리는 최대 시간(ms) — 수신 간격이 길면 2초로 자른다. */
export const PLAY_MAX_GAP_MS = 2_000;

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
  /** 커서가 표시 순서의 끝 틱인가(빈 세션이면 true). */
  atEnd: boolean;
  /** 끝 틱으로. */
  goEnd: () => void;
}

/** 글자 입력 중인 요소(input · textarea · select · contenteditable) — 키를 가로채지 않는다. */
function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const ce = t.getAttribute('contenteditable');
  if (ce !== null && ce !== 'false') return true;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}

/** Space 로 스스로 동작하는 요소(버튼 · 링크) — Space 는 그 요소에 맡긴다. */
function isActivatable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.tagName === 'BUTTON' || t.tagName === 'A' || t.getAttribute('role') === 'button';
}

/** 수신순 lower_bound(≥ ns) → rec. 모두 이르면 마지막 · 빈 세션이면 -1. */
export function recAtNs(session: TickSession, ns: bigint): number {
  const n = session.recvOrder.length;
  if (n === 0) return -1;
  const p = Math.min(n - 1, lowerBoundRecv(session.index.recvNs, session.recvOrder, ns));
  return session.recvOrder[p]!;
}

/** 표시 순서의 끝 틱 rec(빈 세션이면 -1). */
export function endRecOf(session: TickSession, mode: TickOrderMode = 'exchange'): number {
  const order = mode === 'exchange' ? session.exOrder : session.recvOrder;
  return order.length === 0 ? -1 : order[order.length - 1]!;
}

/** 열기 직후 커서 — `t` 가 있으면 그 시각 이후 첫 틱, 없으면 08:00 이후 첫 틱(`live` 면 끝 틱 — D-18). */
export function initialRecOf(session: TickSession, initialT: string | null, live = false): number {
  const ns = initialT === null ? null : parseTickTime(initialT, session.date);
  if (ns === null && live) return endRecOf(session);
  return recAtNs(session, ns ?? session.dayStartNs);
}

export function useTickCursor(
  session: TickSession,
  { initialT, urlState, live = false }: { initialT: string | null; urlState: Omit<TickUrlState, 't'>; live?: boolean },
): TickCursor {
  const [rec, setRec] = useState(() => initialRecOf(session, initialT, live));
  const [mode, setMode] = useState<TickOrderMode>('exchange');
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<TickPlaySpeed>(1);

  // 당일 증분 — 세션이 바뀌면(머리 주석 ⑤) 이전 끝이었을 때만 새 끝으로. 렌더 중 이전 값 비교(React 권장 꼴).
  const [seen, setSeen] = useState(session);
  if (seen !== session) {
    setSeen(session);
    if (live) {
      const prevOrder = mode === 'exchange' ? seen.exOrder : seen.recvOrder;
      const prevPos = mode === 'exchange' ? seen.exPos : seen.recvPos;
      const wasEnd = rec < 0 || rec >= prevPos.length || prevPos[rec] === prevOrder.length - 1;
      const next = endRecOf(session, mode);
      if (wasEnd && next !== rec) setRec(next);
    }
  }

  const order = mode === 'exchange' ? session.exOrder : session.recvOrder;
  const posOf = mode === 'exchange' ? session.exPos : session.recvPos;
  const pos = rec < 0 || rec >= posOf.length ? -1 : posOf[rec]!;
  const atEnd = order.length === 0 || pos === order.length - 1;

  const goEnd = useCallback(() => {
    const r = endRecOf(session, mode);
    if (r >= 0) setRec(r);
  }, [session, mode]);

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

  // 키 — ← → 한 행 · Shift 10행 · Space 재생/정지. 입력창 · 버튼(Space 는 버튼 자체 동작) · 수정자 키는 가로채지 않는다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const n = e.shiftKey ? 10 : 1;
        step(e.key === 'ArrowRight' ? n : -n);
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        if (isActivatable(e.target)) return;
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, togglePlay]);

  // 재생 — 1× = 다음 틱까지 실제 수신 간격(2초 상한) · 10× = 그 1/10 · 최대 = 프레임마다 한 틱 · 끝에 닿으면 정지.
  useEffect(() => {
    if (!playing || rec < 0) return;
    const p = posOf[rec]!;
    if (p >= order.length - 1) {
      setPlaying(false);
      return;
    }
    const next = order[p + 1]!;
    if (speed === 'max') {
      const id = requestAnimationFrame(() => setRec(next));
      return () => cancelAnimationFrame(id);
    }
    const gapMs = Number(session.index.recvNs[next]! - session.index.recvNs[rec]!) / 1e6;
    const delay = Math.max(0, Math.min(PLAY_MAX_GAP_MS, gapMs)) / (speed === 10 ? 10 : 1);
    const id = setTimeout(() => setRec(next), delay);
    return () => clearTimeout(id);
  }, [playing, rec, speed, order, posOf, session]);

  // URL `t` — 250ms 스로틀 replaceState(첫 커서는 쓰지 않는다).
  const urlRef = useRef(urlState);
  const modeRef = useRef(mode);
  useEffect(() => {
    urlRef.current = urlState;
    modeRef.current = mode;
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
      if (live && r === endRecOf(session, modeRef.current)) {
        // 당일 끝 틱 = `t` 없음(머리 주석 ④) — 이미 없으면 쓰지 않는다(증분마다 replaceState 하지 않게).
        if (new URL(window.location.href).searchParams.has('t')) {
          window.history.replaceState(null, '', tickUrlOf({ ...urlRef.current }));
        }
        return;
      }
      const t = fmtTickTime(session.index.recvNs[r]!);
      window.history.replaceState(null, '', tickUrlOf({ ...urlRef.current, t }));
    };
    const wait = TICK_URL_THROTTLE_MS - (Date.now() - lastWrite.current);
    if (wait <= 0) write();
    else if (timer.current === null) timer.current = setTimeout(write, wait);
  }, [rec, session, live]);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return {
    rec,
    pos,
    mode,
    setMode,
    step,
    jumpTo,
    jumpToRec,
    seekNs,
    playing,
    speed,
    togglePlay,
    setSpeed,
    atEnd,
    goEnd,
  };
}
