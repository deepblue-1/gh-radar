/**
 * tick-api — 틱 전문 뷰어 과거 경로 조회 · 요청 변환 (Phase 37 D-03 · D-08 · D-15).
 *
 * ① 원천: server `GET /api/ticks/day?d=` · `GET /api/ticks/today` · `GET /api/ticks/open?isin=&d=&ex=` ·
 *   `POST /api/ticks/convert` · `POST /api/ticks/convert/cancel`(37-07). 게이트(DMA 매핑)는 server + RPC 가 한다.
 * ② 응답은 bare 객체다(envelope 언랩 없음) · 키는 RPC 반환 그대로 snake_case(`@gh-radar/shared` tick-api 계약).
 * ③ 401 · 403 `DMA_UNMAPPED` · 429 `TICK_CONVERT_CAPPED` · 502 `TICK_CONVERT_TRIGGER_FAILED` · 503 `TICK_CONVERT_UNAVAILABLE` 는
 *   `ApiClientError`(status · code)로 올라온다 — 화면이 게이트 · 상태 카드 문구로 바꾼다.
 * ④ 캐시하지 않는다 — open 은 서명 URL(수명 600초)을 싣고, 변환 상태는 폴링마다 새로 봐야 한다.
 * ⑤ 당일 바이트(37-19) — `fetchTickLive` 는 `GET /api/ticks/live`(37-15)를 **같은 Bearer**(authFetch 와 같은 세션 토큰 ·
 *   `resolveBaseUrl`)로 부르고, 본문(zstd 프레임 바이트)과 `TICK_LIVE_HEADERS` 6종을 읽는다. JSON 이 아니라서 apiFetch 를
 *   거치지 않는다. 오류를 throw 하지 않고 `status` 로 돌려준다 — 409 `{epoch}`(새 epoch 로 offset 0) · 503 미결선(D-22) ·
 *   502 · 0(네트워크) = 다음 주기 · 401/403 = 게이트. 폴링 규율은 `useTickLive` 가 진다.
 */

import {
  TICK_LIVE_HEADERS,
  type TickLiveMeta,
  type TickLiveState,
} from '@gh-radar/shared';
import type {
  TickCancelResponse,
  TickConvertBody,
  TickConvertResponse,
  TickDayResponse,
  TickExchange,
  TickOpenResponse,
  TickTodayResponse,
} from '@gh-radar/shared';

import { resolveBaseUrl } from '../api';
import { authFetch } from '../auth-fetch';
import { createClient } from '../supabase/client';

/** 하루 목록 — `d` 생략 = 격자가 있는 최근 날짜(server 정본). */
export function fetchTickDay(d?: string): Promise<TickDayResponse> {
  const query = d === undefined ? '' : `?d=${encodeURIComponent(d)}`;
  return authFetch<TickDayResponse>(`/api/ticks/day${query}`);
}

/** 오늘 목록(매집감지 등록 ∪ 고가 +15%) · `live` = 당일 경로 결선 여부. */
export function fetchTickToday(): Promise<TickTodayResponse> {
  return authFetch<TickTodayResponse>('/api/ticks/today');
}

/** 한 종목 열기 — 격자(서명 URL) 또는 요청 변환 상태. */
export function fetchTickOpen(q: { isin: string; d: string; ex: TickExchange }): Promise<TickOpenResponse> {
  const params = new URLSearchParams({ isin: q.isin, d: q.d, ex: q.ex });
  return authFetch<TickOpenResponse>(`/api/ticks/open?${params.toString()}`);
}

function postJson<T>(path: string, body: TickConvertBody): Promise<T> {
  return authFetch<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: 15_000,
  });
}

/** 요청 변환 — 같은 (날짜, 거래소) 동시 요청은 server 가 Job 하나로 합친다. */
export function postTickConvert(body: TickConvertBody): Promise<TickConvertResponse> {
  return postJson<TickConvertResponse>('/api/ticks/convert', body);
}

/** 요청 변환 취소 — 본인 pending 일 때만 cancelled true. */
export function postTickCancel(body: TickConvertBody): Promise<TickCancelResponse> {
  return postJson<TickCancelResponse>('/api/ticks/convert/cancel', body);
}

// ── 당일 바이트 경로(37-15 server ↔ 37-19 · D-05 · D-06) ──────────────────────────────

/** `fetchTickLive` 결과 — status 0 = 네트워크 실패 · 시간 초과(throw 없음). */
export interface TickLiveResult {
  status: number;
  /** 200 본문(zstd 프레임 바이트 · 비어 있을 수 있다). 그 밖은 빈 배열. */
  bytes: Uint8Array;
  /** 200 = 헤더 6종 · 409 = 본문 `{epoch}` 만 채운 값(epoch 가 없으면 null) · 그 밖 null. */
  meta: TickLiveMeta | null;
}

/** 한 요청 상한 — 하루치 첫 응답이 수 MB 라 넉넉히(server → tickgw 20초 + 전송). */
export const TICK_LIVE_TIMEOUT_MS = 30_000;

const EMPTY = new Uint8Array(0);
const LIVE_STATES: readonly TickLiveState[] = ['loading', 'ready', 'queued', 'delayed', 'blocked'];

/** 200 응답 헤더 → meta. epoch · offsetEnd 가 없거나 깨졌으면 null(계약 위반 — 호출자는 502 처럼 다룬다). */
export function tickLiveMetaOf(h: Headers): TickLiveMeta | null {
  const epoch = h.get(TICK_LIVE_HEADERS.epoch) ?? '';
  const end = Number(h.get(TICK_LIVE_HEADERS.offsetEnd) ?? '');
  if (epoch === '' || !Number.isSafeInteger(end) || end < 0) return null;
  const last = (h.get(TICK_LIVE_HEADERS.lastRecvNs) ?? '').trim();
  const rawState = h.get(TICK_LIVE_HEADERS.state) as TickLiveState | null;
  const queue = Number(h.get(TICK_LIVE_HEADERS.queue) ?? '0');
  return {
    epoch,
    offsetEnd: end,
    lastRecvNs: /^\d+$/.test(last) ? last : null,
    state: rawState !== null && LIVE_STATES.includes(rawState) ? rawState : 'ready',
    queue: Number.isFinite(queue) && queue > 0 ? Math.floor(queue) : 0,
    complete: h.get(TICK_LIVE_HEADERS.complete) === 'true',
  };
}

function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined;
}

/**
 * 당일 바이트 — `GET /api/ticks/live?isin&ex&epoch&offset`. `epoch` null = 처음(offset 0). 세션이 없으면 요청 없이 401.
 * 바이트는 풀지 않고 그대로 돌려준다(해제 · 세션 재생성은 `appendTickBytes`).
 */
export async function fetchTickLive(q: {
  isin: string;
  ex: TickExchange;
  epoch: string | null;
  offset: number;
}): Promise<TickLiveResult> {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  if (!session) return { status: 401, bytes: EMPTY, meta: null };

  const params = new URLSearchParams({ isin: q.isin, ex: q.ex, offset: String(q.offset) });
  if (q.epoch !== null) params.set('epoch', q.epoch);
  let url: string;
  try {
    url = new URL(`/api/ticks/live?${params.toString()}`, resolveBaseUrl()).toString();
  } catch {
    return { status: 0, bytes: EMPTY, meta: null };
  }
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: 'no-store',
      signal: timeoutSignal(TICK_LIVE_TIMEOUT_MS),
    });
    if (res.status === 200) {
      const meta = tickLiveMetaOf(res.headers);
      const bytes = new Uint8Array(await res.arrayBuffer());
      return meta === null ? { status: 502, bytes: EMPTY, meta: null } : { status: 200, bytes, meta };
    }
    if (res.status === 409) {
      const body = (await res.json().catch(() => null)) as { epoch?: unknown } | null;
      const epoch = typeof body?.epoch === 'string' && body.epoch !== '' ? body.epoch : null;
      return {
        status: 409,
        bytes: EMPTY,
        meta:
          epoch === null ? null : { epoch, offsetEnd: 0, lastRecvNs: null, state: 'loading', queue: 0, complete: false },
      };
    }
    return { status: res.status, bytes: EMPTY, meta: null };
  } catch {
    return { status: 0, bytes: EMPTY, meta: null };
  }
}
