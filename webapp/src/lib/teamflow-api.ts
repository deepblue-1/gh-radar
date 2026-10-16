/**
 * teamflow-api — 팀 매집 보고서 조회 (Phase 33 D-05 · limitup-api 동형).
 *
 * ① 원천: server `GET /api/teamflow/report?d=` — server 가 DMA 매핑 게이트 RPC 1회로 하루 번들을 jsonb 로 내준다.
 *   브라우저는 Supabase 를 직접 읽지 않는다(표 limitup_team_flow 는 접근 규칙 0 · service_role 전용 — D-06).
 * ② 응답은 bare 객체다(envelope 언랩 없음). 행 키는 export 열 이름 그대로(snake_case · payload 중첩 포함).
 * ③ 401(세션 없음 · 만료)과 403 `DMA_UNMAPPED` 는 `ApiClientError` 로 올라온다 — 페이지가 본문을 `DmaGate` 로 바꾼다.
 * ④ `d` 생략 = 최신 보고서 날짜(server 정본). 형식 검사는 페이지(`parseYmdParam`)와 server zod 가 둘 다 한다.
 */

import type { TeamflowReportResponse } from '@gh-radar/shared';

import { authFetch } from './auth-fetch';

/**
 * 하루 번들(게이트 · 행 있는 날짜 · 그날 행 전부 + payload). 실측 하루 ≈ 487KB(행 ≈ 14.6KB × 34 · gzip ≈ 100KB)라
 * 기본 8초보다 넉넉한 15초를 준다(RESEARCH Pitfall 6).
 */
export function fetchTeamflowReport(d?: string): Promise<TeamflowReportResponse> {
  const query = d === undefined ? '' : `?d=${encodeURIComponent(d)}`;
  return authFetch<TeamflowReportResponse>(`/api/teamflow/report${query}`, { timeoutMs: 15_000 });
}
