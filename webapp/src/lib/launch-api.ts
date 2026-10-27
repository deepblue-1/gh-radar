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

import type {
  LaunchFire,
  LaunchMapResponse,
  LaunchOrdersResponse,
  LaunchPlanResponse,
  LaunchRange,
} from '@gh-radar/shared';

import { ApiClientError } from './api';
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

/** 발사 계획 조회 결과 — `absent` = server 가 이 라우트를 모른다(404). */
export type LaunchPlanFetch = { kind: 'ready'; resp: LaunchPlanResponse } | { kind: 'absent' };

/**
 * 서버별 다음 발사 계획 + 조합별 최근 이력(35-13 `GET /api/admin/launch/plan` · D-25 · D-29).
 *
 * 404 = gh-radar server 가 이 라우트를 모름 = 배포 전(D-35) — 화면에서 계획 기능을 숨긴다(`{ kind: 'absent' }`).
 * 그 밖 오류(5xx · 네트워크 · 타임아웃)는 그대로 throw — 지도 탭이 「대신 값」 경로로 접는다.
 */
export function fetchLaunchPlan(): Promise<LaunchPlanFetch> {
  return joined<LaunchPlanResponse>('/api/admin/launch/plan').then(
    (resp): LaunchPlanFetch => ({ kind: 'ready', resp }),
    (e: unknown): LaunchPlanFetch => {
      if (e instanceof ApiClientError && e.status === 404) return { kind: 'absent' };
      throw e;
    },
  );
}
