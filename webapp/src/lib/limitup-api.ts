/**
 * limitup-api — 상한가 보고서 조회 (Phase 28 Plan 12 · D-10 · D-11).
 *
 * ① 원천: server `GET /api/limitup/report?d=` · `GET /api/limitup/grid-urls?d=`(28-10) — server 가 DMA 매핑 게이트 RPC
 *   1회로 보고서 한 장을 jsonb 로 내준다. 브라우저는 Supabase 를 직접 읽지 않는다(표 RLS 는 service_role 전용).
 * ② 응답은 bare 객체다(envelope 언랩 없음 — `orders-api.ts` 규약). 행 키는 export 열 이름 그대로(snake_case).
 * ③ 401(세션 없음 · 만료)과 403 `DMA_UNMAPPED` 는 `ApiClientError` 로 올라온다 — 페이지가 그 status 로 본문을
 *   `DmaGate` 로 바꾼다. 웹 게이트는 표시 장치일 뿐이고 실제 권한은 server + RPC 다.
 * ④ `d` 생략 = 최신 적재 날짜(server 정본). 형식 검사는 페이지(`parseYmdParam`)와 server zod 가 둘 다 한다.
 */

import type { LimitupGridUrlsResponse, LimitupReportResponse } from '@gh-radar/shared';

import { authFetch } from './auth-fetch';

/**
 * 보고서 한 장(게이트 · 적재 날짜 · 하루 묶음 · 어제 locks · 90일 지문). 실데이터 하루 ≈ 400KB(gzip ≈ 45KB)라
 * 기본 8초보다 넉넉한 15초를 준다 — RPC 한 번이 여러 표를 묶는다.
 */
export function fetchLimitupReport(d?: string): Promise<LimitupReportResponse> {
  const query = d === undefined ? '' : `?d=${encodeURIComponent(d)}`;
  return authFetch<LimitupReportResponse>(`/api/limitup/report${query}`, { timeoutMs: 15_000 });
}

/** 그날 종목별 격자 파일 단기 서명 URL(`urls[isin]`) — 28-13 사건 카드 레인이 쓴다. */
export function fetchLimitupGridUrls(d: string): Promise<LimitupGridUrlsResponse> {
  return authFetch<LimitupGridUrlsResponse>(`/api/limitup/grid-urls?d=${encodeURIComponent(d)}`);
}
