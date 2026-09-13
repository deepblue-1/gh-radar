/**
 * Phase 13 Plan 04 — 홈 급등 테마 API 래퍼 (HOME-01).
 *
 * server `GET /api/home` (Plan 03) 을 apiFetch 로 소비 — 읽기 전용 객체 계약
 * `{ snapshot, index }` (배열 아님, limitUp 선례 mirror). 파라미터 조합:
 * - 무필터: 최신 스냅샷 (오늘 최신 :30 슬롯)
 * - `date=YYYY-MM-DD`: 해당 거래일의 최신 슬롯
 * - `capturedAt=ISO`: 정확한 시점 스냅샷 (date 보다 우선 — server 책임)
 *
 * changeRate 는 server 가 payload 를 verbatim 서빙(실시간 시세 재조인 없음, T-13-03) —
 * 과거 슬롯이 오늘 시세로 오염되지 않는다.
 */

import type { HomeSnapshotResponse } from '@gh-radar/shared';

import { apiFetch } from './api';

/** 홈 스냅샷 조회 파라미터 — 둘 다 optional, capturedAt 이 date 보다 우선(server). */
export interface FetchHomeParams {
  /** 거래일 (YYYY-MM-DD). 지정 시 해당 날짜의 최신 슬롯. */
  date?: string;
  /** 정확한 시점 (ISO timestamptz). 지정 시 date 무시하고 해당 슬롯. */
  capturedAt?: string;
  /**
   * 증분 index — 이미 가진 최신 capturedAt. 주면 응답 index 는 그보다 새 슬롯만 담는다
   * (전체 index ≈175KB 를 폴링마다 다시 받지 않기 위함). 병합은 호출부 책임.
   */
  indexSince?: string;
}

/**
 * `/api/home` 호출 — 현재 스냅샷 + 네비게이션 인덱스.
 * @param params date/capturedAt (미지정 시 최신 스냅샷). signal 은 외부 abort 연결용.
 */
export function fetchHome(
  params: FetchHomeParams = {},
  signal?: AbortSignal,
): Promise<HomeSnapshotResponse> {
  const search = new URLSearchParams();
  if (params.capturedAt) search.set('capturedAt', params.capturedAt);
  else if (params.date) search.set('date', params.date);
  if (params.indexSince) search.set('indexSince', params.indexSince);

  const qs = search.toString();
  const path = qs ? `/api/home?${qs}` : '/api/home';
  return apiFetch<HomeSnapshotResponse>(path, signal ? { signal } : undefined);
}
