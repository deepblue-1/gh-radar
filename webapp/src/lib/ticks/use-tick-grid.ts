'use client';

/**
 * useTickGrid — 틱 격자 다운로드 · zstd 해제 · 세션 생성 (Phase 37 D-00 · `use-limitup-grid` 동형).
 *
 * ① 원천: server `GET /api/ticks/open`(37-07)이 준 **서명 URL**(`grid.url` · 수명 600초)을 브라우저가 직접 받는다
 *   (Cloud Run 을 거치지 않는다). 객체는 `pcapns-rec+zstd/1` 바이트다.
 * ② 해제: `fetch → body.getReader()` 청크를 fzstd `Decompress.push` 로 흘리고 마지막에 `final` · 나온 조각을
 *   `concatBytes` 로 이어 `buildTickSession`. fzstd 는 이어붙인 zstd 프레임을 모두 푼다(2026-11-02 실측 — 스트리밍 ·
 *   한 번에 둘 다) — 그래서 Node 처럼 `splitZstdFrames` 를 거칠 필요가 없다.
 * ③ 진행률 = 받은 압축 바이트 / `grid.bytes`(0~1). 본문 길이를 모르면 null(무한 진행 바).
 * ④ 서명 URL 4xx(만료 · 거부) → `fetchTickOpen` 을 **한 번만** 다시 불러 새 URL 로 재시도 · 그래도 실패면 error —
 *   자동 재시도로 두드리지 않고 사람이 「다시 시도」(retry) 를 누른다.
 * ⑤ 모듈 캐시(페이지 수명): 키 `${d}|${ex}|${isin}` → 세션. 해제한 세션은 수 MB~수십 MB 라 최근 `MAX_TICK_SESSIONS`(2)개만
 *   남긴다. 같은 키를 동시에 여는 훅들은 진행 중 요청 하나를 나눠 쓴다(받기 1회).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Decompress } from 'fzstd';

import { concatBytes, type TickOpenResponse } from '@gh-radar/shared';

import { fetchTickOpen } from './tick-api';
import { buildTickSession, tickSessionKeyOf, type TickSession } from './tick-session';

export type TickGridStatus = 'idle' | 'loading' | 'ready' | 'error';

/** 세션을 남기는 최근 키 수 — 보는 종목 + 직전에 본 종목. */
export const MAX_TICK_SESSIONS = 2;

interface Inflight {
  promise: Promise<TickSession>;
  progress: number | null;
  listeners: Set<(p: number | null) => void>;
}

const sessions = new Map<string, TickSession>();
const inflight = new Map<string, Inflight>();

/** 테스트 전용 — 모듈 캐시 비우기. */
export function __resetTickGridCache(): void {
  sessions.clear();
  inflight.clear();
}

function remember(s: TickSession): void {
  sessions.delete(s.key);
  sessions.set(s.key, s);
  while (sessions.size > MAX_TICK_SESSIONS) sessions.delete(sessions.keys().next().value!);
}

function hitOf(key: string): TickSession | null {
  const s = sessions.get(key);
  if (s === undefined) return null;
  remember(s); // 최근 쓴 것으로 올린다
  return s;
}

export class TickGridLoadError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = 'TickGridLoadError';
  }
}

/** 응답 본문을 스트리밍으로 받아 zstd 해제 — 받은 압축 바이트를 `onBytes` 로 알린다. */
async function inflate(res: Response, onBytes: (received: number) => void): Promise<Uint8Array> {
  const out: Uint8Array[] = [];
  const dz = new Decompress((chunk) => {
    out.push(chunk);
  });
  if (res.body === null) {
    const all = new Uint8Array(await res.arrayBuffer());
    onBytes(all.length);
    dz.push(all, true);
    return concatBytes(out);
  }
  const reader = res.body.getReader();
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === undefined || value.length === 0) continue;
    received += value.length;
    dz.push(value);
    onBytes(received);
  }
  dz.push(new Uint8Array(0), true);
  return concatBytes(out);
}

async function load(open: TickOpenResponse, onProgress: (p: number | null) => void): Promise<TickSession> {
  let grid = open.grid;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (grid === null) throw new TickGridLoadError('격자 없음');
    const total = grid.bytes;
    const res = await fetch(grid.url);
    if (res.ok) {
      const bytes = await inflate(res, (n) => onProgress(total > 0 ? Math.min(1, n / total) : null));
      return buildTickSession(bytes, { date: open.date, ex: open.exchange, isin: open.isin });
    }
    // 4xx = 서명 만료 · 거부 — open 을 한 번만 다시 불러 새 URL 로.
    if (attempt === 0 && res.status >= 400 && res.status < 500) {
      const again = await fetchTickOpen({ isin: open.isin, d: open.date, ex: open.exchange });
      grid = again.grid;
      continue;
    }
    throw new TickGridLoadError(`격자 ${res.status}`, res.status);
  }
  throw new TickGridLoadError('격자 재발급 실패');
}

function loadSession(key: string, open: TickOpenResponse): Inflight {
  let entry = inflight.get(key);
  if (entry !== undefined) return entry;
  const listeners = new Set<(p: number | null) => void>();
  const e: Inflight = { promise: Promise.resolve(null as never), progress: null, listeners };
  e.promise = load(open, (p) => {
    e.progress = p;
    for (const l of listeners) l(p);
  }).then(
    (s) => {
      remember(s);
      inflight.delete(key);
      return s;
    },
    (err: unknown) => {
      inflight.delete(key);
      throw err;
    },
  );
  inflight.set(key, e);
  entry = e;
  return entry;
}

type State = { key: string | null; status: TickGridStatus; progress: number | null; session: TickSession | null };

export function useTickGrid(open: TickOpenResponse | null): {
  status: TickGridStatus;
  progress: number | null;
  session: TickSession | null;
  retry: () => void;
} {
  const key = open !== null && open.grid !== null ? tickSessionKeyOf(open.date, open.exchange, open.isin) : null;
  const [state, setState] = useState<State>(() => {
    const hit = key === null ? null : (sessions.get(key) ?? null);
    return hit ? { key, status: 'ready', progress: 1, session: hit } : { key, status: 'idle', progress: null, session: null };
  });
  const [attempt, setAttempt] = useState(0);
  // 같은 키의 open 응답은 identity 만 바뀐다(폴링 · 재렌더) — 키가 바뀔 때만 다시 받는다.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    if (key === null) {
      setState({ key: null, status: 'idle', progress: null, session: null });
      return;
    }
    const hit = hitOf(key);
    if (hit !== null) {
      setState({ key, status: 'ready', progress: 1, session: hit });
      return;
    }
    const o = openRef.current;
    if (o === null) return;
    let alive = true;
    const entry = loadSession(key, o);
    const onP = (p: number | null) => {
      if (alive) setState((s) => (s.key === key && s.status === 'loading' ? { ...s, progress: p } : s));
    };
    entry.listeners.add(onP);
    setState({ key, status: 'loading', progress: entry.progress, session: null });
    entry.promise.then(
      (s) => {
        if (alive) setState({ key, status: 'ready', progress: 1, session: s });
      },
      () => {
        if (alive) setState({ key, status: 'error', progress: null, session: null });
      },
    );
    return () => {
      alive = false;
      entry.listeners.delete(onP);
    };
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // 키가 바뀐 첫 렌더 — 이전 세션을 보이지 않는다.
  if (state.key !== key) {
    const hit = key === null ? null : (sessions.get(key) ?? null);
    if (hit) return { status: 'ready', progress: 1, session: hit, retry };
    return { status: key === null ? 'idle' : 'loading', progress: null, session: null, retry };
  }
  if (state.status === 'idle' && key !== null) return { status: 'loading', progress: null, session: null, retry };
  return { status: state.status, progress: state.progress, session: state.session, retry };
}
