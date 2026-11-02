/**
 * tick-api — 틱 전문 뷰어 과거 경로 조회 · 요청 변환 (Phase 37 D-03 · D-08 · D-15).
 *
 * ① 원천: server `GET /api/ticks/day?d=` · `GET /api/ticks/today` · `GET /api/ticks/open?isin=&d=&ex=` ·
 *   `POST /api/ticks/convert` · `POST /api/ticks/convert/cancel`(37-07). 게이트(DMA 매핑)는 server + RPC 가 한다.
 * ② 응답은 bare 객체다(envelope 언랩 없음) · 키는 RPC 반환 그대로 snake_case(`@gh-radar/shared` tick-api 계약).
 * ③ 401 · 403 `DMA_UNMAPPED` · 429 `TICK_CONVERT_CAPPED` · 502 `TICK_CONVERT_TRIGGER_FAILED` · 503 `TICK_CONVERT_UNAVAILABLE` 는
 *   `ApiClientError`(status · code)로 올라온다 — 화면이 게이트 · 상태 카드 문구로 바꾼다.
 * ④ 캐시하지 않는다 — open 은 서명 URL(수명 600초)을 싣고, 변환 상태는 폴링마다 새로 봐야 한다.
 */

import type {
  TickCancelResponse,
  TickConvertBody,
  TickConvertResponse,
  TickDayResponse,
  TickExchange,
  TickOpenResponse,
  TickTodayResponse,
} from '@gh-radar/shared';

import { authFetch } from '../auth-fetch';

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
