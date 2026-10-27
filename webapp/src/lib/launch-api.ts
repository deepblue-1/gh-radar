/**
 * launch-api — 발사 경계 지도 어드민 조회 (Phase 35 · LAUNCH-05/06 · accum-api 꼴).
 *
 * ① 원천: server `GET /api/admin/launch/orders?d=` · `GET /api/admin/launch/map?fire=&range=`(35-05). server 가 어드민 관문
 *   (requireAuth → requireAdmin) 뒤에서 RPC 1회로 jsonb 를 내준다. 브라우저는 Supabase 를 직접 읽지 않는다
 *   (launch_pieces · launch_heads 는 정책 0 · service_role 전용).
 * ② 계약 = shared `LaunchOrdersResponse` · `LaunchMapResponse` 한 벌(lessons 2026-06-10) — server 도 같은 타입으로
 *   응답을 싣는다. 행 키는 DB 열 이름 그대로(snake_case). 봉투 언랩 없음.
 * ③ 캐시 없음. 같은 키 **진행 중** 요청만 하나로 합친다 — 개발 서버 StrictMode 의 effect 이중 실행이 같은 날을 두 번
 *   부르지 않게(끝나면 바로 지운다 · 실패도 지운다 → 「다시 시도」 = 새 요청).
 */

import type { LaunchFire, LaunchMapResponse, LaunchOrdersResponse, LaunchRange } from '@gh-radar/shared';

import { authFetch } from './auth-fetch';

const inflight = new Map<string, Promise<unknown>>();

function joined<T>(path: string): Promise<T> {
  const running = inflight.get(path);
  if (running !== undefined) return running as Promise<T>;
  const p = authFetch<T>(path).finally(() => {
    if (inflight.get(path) === p) inflight.delete(path);
  });
  inflight.set(path, p);
  return p;
}

/** 주문 내역 하루치. `d` 생략 = 최신 발사 날짜(server · RPC 정본). */
export function fetchLaunchOrders(d?: string): Promise<LaunchOrdersResponse> {
  const query = d === undefined ? '' : `?d=${encodeURIComponent(d)}`;
  return joined<LaunchOrdersResponse>(`/api/admin/launch/orders${query}`);
}

/** 경계 지도 — 발사 기준 × 범위(35-08 지도 탭이 쓴다). */
export function fetchLaunchMap(fire: LaunchFire, range: LaunchRange): Promise<LaunchMapResponse> {
  const query = `?fire=${encodeURIComponent(fire)}&range=${encodeURIComponent(range)}`;
  return joined<LaunchMapResponse>(`/api/admin/launch/map${query}`);
}
