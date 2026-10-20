/**
 * accum-api — 매집감지 보고서 조회 (Phase 34 D-06 · teamflow-api 동형).
 *
 * ① 원천: server `GET /api/accum/report?d=`(목록 · 평평한 열만) · `GET /api/accum/report/:date/:isin`(한 종목 상세 · payload).
 *   server 가 DMA 매핑 게이트 RPC 1회로 jsonb 를 내준다. 브라우저는 Supabase 를 직접 읽지 않는다
 *   (표 limitup_accum_flow 는 접근 규칙 0 · service_role 전용).
 * ② 응답은 bare 객체다(envelope 언랩 없음). 행 키는 export 열 이름 그대로(snake_case).
 * ③ 401(세션 없음 · 만료)과 403 `DMA_UNMAPPED` 는 `ApiClientError` 로 올라온다 — 페이지/상세가 `DmaGate` 로 바꾼다.
 * ④ 상세는 행을 펼칠 때만 부른다(지연 로드 · D-06). 캐시 = `lib/query-cache.ts`(키 `accum-detail:{date}:{isin}` ·
 *   만료 없음 — 그날 행은 재적재 전까지 불변). 로그인 사용자가 바뀌면 AuthProvider 가 query-cache 를 비우므로 사용자별
 *   데이터가 섞이지 않는다(query-cache 머리 주석). 같은 키 진행 중 요청은 하나로 합친다. 실패는 캐시하지 않는다
 *   (「다시 시도」 = 재요청).
 */

import type { AccumDetailResponse, AccumReportResponse } from '@gh-radar/shared';

import { authFetch } from './auth-fetch';
import { readQueryCache, writeQueryCache } from './query-cache';

/** 하루 목록 — 평평한 열만이라 작다(기본 타임아웃). `d` 생략 = 최신 보고서 날짜(server 정본). */
export function fetchAccumReport(d?: string): Promise<AccumReportResponse> {
  const query = d === undefined ? '' : `?d=${encodeURIComponent(d)}`;
  return authFetch<AccumReportResponse>(`/api/accum/report${query}`);
}

/** 상세 캐시 키 — `accum-detail:{date}:{isin}`. */
export const accumDetailCacheKey = (date: string, isin: string): string => `accum-detail:${date}:${isin}`;

/** 같은 키 진행 중 요청 — 빠른 열고 닫기 · 두 번 마운트가 요청을 하나로 합친다. */
const inflight = new Map<string, Promise<AccumDetailResponse>>();

/**
 * 한 종목 상세(평평한 열 + payload · 행 ≤ ~224KB json). 캐시에 있으면 요청 없이 그 값으로 resolve 한다.
 * `access === true` 응답만 캐시한다(row: null 포함 — 재적재 전까지 같은 답). 타임아웃 15초.
 */
export function fetchAccumDetail(date: string, isin: string): Promise<AccumDetailResponse> {
  const key = accumDetailCacheKey(date, isin);
  const hit = readQueryCache<AccumDetailResponse>(key, Number.POSITIVE_INFINITY);
  if (hit !== undefined) return Promise.resolve(hit);
  const running = inflight.get(key);
  if (running !== undefined) return running;
  const p = authFetch<AccumDetailResponse>(
    `/api/accum/report/${encodeURIComponent(date)}/${encodeURIComponent(isin)}`,
    { timeoutMs: 15_000 },
  )
    .then((resp) => {
      if (resp.access === true) writeQueryCache(key, resp);
      return resp;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}
