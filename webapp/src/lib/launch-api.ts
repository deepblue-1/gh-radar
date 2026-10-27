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
 * ④ 쓰기(`saveLaunchPlan`)는 합치지 않는다 — 누를 때마다 요청 1건. relay 를 거치므로 브라우저 상한은 admin 쓰기와 같은
 *   `RELAY_TIMEOUT_MS`(server 의 relay 쓰기 상한 15초보다 길게).
 */

import type {
  LaunchFire,
  LaunchMapResponse,
  LaunchOrdersResponse,
  LaunchMarket,
  LaunchPlanResponse,
  LaunchPlanSaveBody,
  LaunchPlanSaveResponse,
  LaunchRange,
} from '@gh-radar/shared';

import { RELAY_TIMEOUT_MS } from './admin-api';
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

/**
 * 발사 계획 한 칸 저장(35-13 `PUT /api/admin/launch/plan/:gateway/:fire/:market` · D-27).
 *
 * relay 가 실패해도 server 는 200 이다 — 화면은 `result.outcome` · `code` 로만 가른다(문장 대조 없음). 응답 `plan` 은
 * 저장 뒤 다시 읽은 값이라 웹은 지도도 계획도 다시 부르지 않는다. `change === null` = 이력 기록 실패(이력을 늘리지 않는다).
 * 순서 · 범위 검사는 server 가 하지 않는다 — 부르기 전에 `validateLaunchPlanDraft` 로 막는다(편집 칸).
 */
export function saveLaunchPlan(
  gateway: string,
  fire: LaunchFire,
  market: LaunchMarket,
  offsets: readonly number[],
): Promise<LaunchPlanSaveResponse> {
  const path = `/api/admin/launch/plan/${encodeURIComponent(gateway)}/${encodeURIComponent(fire)}/${encodeURIComponent(market)}`;
  const body: LaunchPlanSaveBody = { offsets_us: [...offsets] };
  return authFetch<LaunchPlanSaveResponse>(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: RELAY_TIMEOUT_MS,
  });
}
