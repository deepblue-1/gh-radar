'use client';

/**
 * useLimitupGrid — 사건 카드 레인용 격자 파일 로더 (Phase 28 Plan 13 · D-11 · UI-SPEC ④-4 「격자 파일은 카드가 화면 가까이 올 때」).
 *
 * ① 원천: server `GET /api/limitup/grid-urls?d=`(28-10) 가 그날 종목별 **단기 서명 URL**(`expiresIn` 초)을 한 번에 준다.
 *   브라우저는 그 URL 로 Storage 비공개 버킷 `limitup-grid/grid/<D>/<isin>.json.gz` 를 직접 받는다(server 를 거치지 않는다).
 * ② 객체는 `contentType: application/gzip`(28-06 업로드 — `Content-Encoding` 없음)이라 브라우저가 풀지 않는다 →
 *   `DecompressionStream("gzip")` 로 직접 해제해 JSON 으로 읽는다(의존성 0 · Baseline 2023-05).
 * ③ 캐시는 모듈 수준(페이지 수명): 날짜 → 서명 URL 목록 Promise(**날짜당 1회** — 카드가 여럿이어도) ·
 *   (날짜, isin) → 해제한 격자. 진행 중 요청도 묶어 같은 격자를 두 번 받지 않는다.
 *   격자 하나가 해제하면 수 MB(coarse 2,340점 + 잠김 fine 창 × 24열)라, 최근에 쓴 날짜 `MAX_GRID_DATES`(2 — 보는 날짜 +
 *   직전에 본 날짜)만 남기고 그보다 오래된 날짜의 격자 · URL 목록은 버린다(WR-A04 — ‹ › 로 며칠을 오가도 힙이 쌓이지 않게).
 * ④ 서명 URL 이 만료되면(fetch 4xx) 그 날짜 URL 캐시를 비우고 grid-urls 를 **한 번만** 다시 받아 재시도한다.
 *   그래도 실패면 error — 자동 재시도로 두드리지 않고 사용자가 「다시 시도」(retry) 를 누른다.
 */

import { useCallback, useEffect, useState } from 'react';

import type { LimitupDate, LimitupGridFile, LimitupGridUrlsResponse } from '@gh-radar/shared';

import { fetchLimitupGridUrls } from './limitup-api';

export type LimitupGridStatus = 'idle' | 'loading' | 'ready' | 'error';

const urlCache = new Map<LimitupDate, Promise<LimitupGridUrlsResponse>>();
const gridCache = new Map<string, LimitupGridFile>();
const inflight = new Map<string, Promise<LimitupGridFile>>();

const keyOf = (date: LimitupDate, isin: string) => `${date}|${isin}`;

/** 격자를 남기는 최근 날짜 수(WR-A04) — 보는 날짜 + 직전에 본 날짜. */
export const MAX_GRID_DATES = 2;
/** 최근에 쓴 날짜(오래된 것 → 최근). 이 목록에서 빠진 날짜의 격자 · URL 목록은 캐시에 두지 않는다. */
const recentDates: LimitupDate[] = [];

/** 날짜를 최근 쓴 것으로 올리고, 상한을 넘긴 오래된 날짜의 격자 · URL 목록을 버린다. */
function touchDate(date: LimitupDate): void {
  const i = recentDates.indexOf(date);
  if (i >= 0) recentDates.splice(i, 1);
  recentDates.push(date);
  while (recentDates.length > MAX_GRID_DATES) {
    const drop = recentDates.shift()!;
    for (const k of [...gridCache.keys()]) if (k.startsWith(`${drop}|`)) gridCache.delete(k);
    urlCache.delete(drop);
  }
}

/** 테스트 전용 — 모듈 캐시 비우기. */
export function __resetLimitupGridCache(): void {
  urlCache.clear();
  gridCache.clear();
  inflight.clear();
  recentDates.length = 0;
}

function urlsOf(date: LimitupDate): Promise<LimitupGridUrlsResponse> {
  let p = urlCache.get(date);
  if (!p) {
    p = fetchLimitupGridUrls(date);
    urlCache.set(date, p);
    // 실패한 목록은 남기지 않는다 — 다음 시도가 다시 받는다.
    p.catch(() => {
      if (urlCache.get(date) === p) urlCache.delete(date);
    });
  }
  return p;
}

class GridLoadError extends Error {}

async function gunzipJson(res: Response): Promise<LimitupGridFile> {
  if (!res.body) throw new GridLoadError('격자 응답 본문 없음');
  const plain = res.body.pipeThrough(new DecompressionStream("gzip"));
  return (await new Response(plain).json()) as LimitupGridFile;
}

async function load(date: LimitupDate, isin: string): Promise<LimitupGridFile> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { urls } = await urlsOf(date);
    const url = urls[isin];
    if (!url) throw new GridLoadError('서명 URL 없음');
    const res = await fetch(url);
    if (res.ok) return gunzipJson(res);
    // 4xx = 서명 만료 · 거부 — 그 날짜 목록을 버리고 한 번만 다시 받는다.
    if (attempt === 0 && res.status >= 400 && res.status < 500) {
      urlCache.delete(date);
      continue;
    }
    throw new GridLoadError(`격자 ${res.status}`);
  }
  throw new GridLoadError('격자 재발급 실패');
}

function loadGrid(date: LimitupDate, isin: string): Promise<LimitupGridFile> {
  touchDate(date);
  const key = keyOf(date, isin);
  const hit = gridCache.get(key);
  if (hit) return Promise.resolve(hit);
  let p = inflight.get(key);
  if (!p) {
    p = load(date, isin).then(
      (g) => {
        // 받는 동안 날짜가 상한 밖으로 밀렸으면 캐시에 넣지 않는다 — 버린 날짜가 되살아나지 않게.
        if (recentDates.includes(date)) gridCache.set(key, g);
        inflight.delete(key);
        return g;
      },
      (err: unknown) => {
        inflight.delete(key);
        throw err;
      },
    );
    inflight.set(key, p);
  }
  return p;
}

type State = { key: string; status: LimitupGridStatus; grid: LimitupGridFile | null };

export function useLimitupGrid({
  date,
  isin,
  enabled,
}: {
  date: LimitupDate;
  isin: string;
  enabled: boolean;
}): { status: LimitupGridStatus; grid: LimitupGridFile | null; retry: () => void } {
  const key = keyOf(date, isin);
  const [state, setState] = useState<State>(() => {
    const hit = gridCache.get(key);
    return hit ? { key, status: 'ready', grid: hit } : { key, status: 'idle', grid: null };
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const hit = gridCache.get(key);
    if (hit) {
      touchDate(date);
      setState({ key, status: 'ready', grid: hit });
      return;
    }
    let alive = true;
    setState({ key, status: 'loading', grid: null });
    loadGrid(date, isin).then(
      (g) => {
        if (alive) setState({ key, status: 'ready', grid: g });
      },
      () => {
        if (alive) setState({ key, status: 'error', grid: null });
      },
    );
    return () => {
      alive = false;
    };
  }, [key, date, isin, enabled, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // 날짜 · 종목이 바뀐 첫 렌더 — 이전 상태를 보이지 않는다.
  if (state.key !== key) {
    const hit = gridCache.get(key);
    if (hit) return { status: 'ready', grid: hit, retry };
    return { status: enabled ? 'loading' : 'idle', grid: null, retry };
  }
  if (state.status === 'idle' && enabled) return { status: 'loading', grid: null, retry };
  return { status: state.status, grid: state.grid, retry };
}
