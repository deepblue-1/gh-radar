/**
 * `/api/push-devices` 클라이언트 (Phase 40 · D-12 · D-13 · D-15 — server 계약은 40-07).
 *
 * - `GET /` → `PushDevice[]` · `PUT /:deviceKey` `{platform, token, label}` → `PushDevice`(enabled = true) ·
 *   `PATCH /:deviceKey` `{enabled:false}` → `{ok:true}` · `DELETE /:deviceKey` → `{ok:true}` · 남의 · 없는 키는 404.
 * - 인증은 `authFetch` 하나(Bearer supabase access_token) — 새 인증 방식 없음. 사용자는 서버가 토큰에서 정한다.
 * - 응답 · 오류 어디에도 토큰을 로그로 남기지 않는다(T-19-14 동형).
 */

import type { PushDevice, PushDeviceRegisterBody } from "@gh-radar/shared";

import { authFetch } from "@/lib/auth-fetch";

const BASE = "/api/push-devices";

function devicePath(deviceKey: string): string {
  return `${BASE}/${encodeURIComponent(deviceKey)}`;
}

/** 내 등록 기기 목록(토큰 없음). */
export function fetchPushDevices(): Promise<PushDevice[]> {
  return authFetch<PushDevice[]>(BASE);
}

/** 앱 「이 기기 체결 알림」 켜기 — 토큰 등록 + 켜짐(D-12 · D-14). 같은 키는 행 교체. */
export function registerThisPushDevice(deviceKey: string, body: PushDeviceRegisterBody): Promise<PushDevice> {
  return authFetch<PushDevice>(devicePath(deviceKey), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** 기기 끄기(D-13) — 행 · 토큰은 남는다(다시 켜는 건 그 기기 앱에서). */
export function disablePushDevice(deviceKey: string): Promise<{ ok: true }> {
  return authFetch<{ ok: true }>(devicePath(deviceKey), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: false }),
  });
}

/** 기기 지우기(D-13 · D-15) — 행과 토큰을 지운다. */
export function deletePushDevice(deviceKey: string, opts: { timeoutMs?: number } = {}): Promise<{ ok: true }> {
  return authFetch<{ ok: true }>(devicePath(deviceKey), {
    method: "DELETE",
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
  });
}
