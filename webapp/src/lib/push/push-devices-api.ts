/**
 * `/api/push-devices` 클라이언트 (Phase 40 · D-12 · D-13 · D-15 — server 계약은 40-07).
 *
 * - `GET /` → `PushDevice[]` · `PUT /:deviceKey` `{platform, token, label}` → `PushDevice`(enabled = true) ·
 *   `PATCH /:deviceKey` `{enabled:false}` → `{ok:true}` · `DELETE /:deviceKey` → `{ok:true}` · 남의 · 없는 키는 404.
 * - quick-261109-dz1 계좌별 끄기: `GET /accounts` → 끈 계좌번호 `string[]` · `PUT /accounts/:accountNo` `{enabled}` →
 *   `{ok:true}`(멱등).
 * - 인증은 `authFetch` 하나(Bearer supabase access_token) — 새 인증 방식 없음. 사용자는 서버가 토큰에서 정한다.
 * - 응답 · 오류 어디에도 토큰을 로그로 남기지 않는다(T-19-14 동형).
 */

import type { PushDevice, PushDeviceRegisterBody } from "@gh-radar/shared";

import { ApiClientError } from "@/lib/api";
import { authFetch } from "@/lib/auth-fetch";
import { isNativeApp } from "@/lib/native/native-detect";
import { readPushDeviceKey } from "@/lib/push/device-key";

const BASE = "/api/push-devices";

function devicePath(deviceKey: string): string {
  return `${BASE}/${encodeURIComponent(deviceKey)}`;
}

/** 내 등록 기기 목록(토큰 없음). */
export function fetchPushDevices(): Promise<PushDevice[]> {
  return authFetch<PushDevice[]>(BASE);
}

/** 앱 「이 기기 매매 알림」 켜기 — 토큰 등록 + 켜짐(D-12 · D-14). 같은 키는 행 교체. */
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

/** quick-261109-dz1 D-08 — 내 끈 계좌번호(D-01 끈 계좌는 내 모든 기기에서 알림이 오지 않는다). */
export function fetchPushAccountMutes(): Promise<string[]> {
  return authFetch<string[]>(`${BASE}/accounts`);
}

/** quick-261109-dz1 D-01 · D-04 — 계좌 하나 켜기 · 끄기(본인 설정만 · 공유 계좌의 다른 사용자는 영향 없음). */
export function setPushAccountEnabled(accountNo: string, enabled: boolean): Promise<{ ok: true }> {
  return authFetch<{ ok: true }>(`${BASE}/accounts/${encodeURIComponent(accountNo)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

/** 로그아웃 정리를 기다리는 상한 — 넘으면 포기하고 로그아웃을 이어 간다. */
export const SIGN_OUT_UNREGISTER_TIMEOUT_MS = 3_000;

/**
 * 로그아웃 전 이 기기 행 지우기(D-15) — 같은 폰에 다른 계정이 로그인해도 앞 사람 체결이 가지 않게.
 * 앱이 아니거나 기기 키가 없으면 서버를 부르지 않는다. DELETE 가 `timeoutMs` 안에 안 끝나면 포기한다. throw 하지 않는다 —
 * 실패해도 로그아웃은 진행되고, 남은 행은 토큰 인계 규칙(같은 토큰 → 옛 사용자 행 교체)과 송신 410 정리가 지운다.
 * 404(이미 없음)는 정상 끝. 로그에는 키 · 토큰을 싣지 않는다.
 */
export async function unregisterThisDeviceBeforeSignOut(timeoutMs = SIGN_OUT_UNREGISTER_TIMEOUT_MS): Promise<void> {
  if (!isNativeApp()) return;
  const deviceKey = readPushDeviceKey();
  if (!deviceKey) return;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    const outcome = await Promise.race([
      deletePushDevice(deviceKey, { timeoutMs }).then(() => "done" as const),
      timedOut,
    ]);
    if (outcome === "timeout") console.warn("[gh-radar] push 로그아웃 정리 시간 초과 — 로그아웃은 계속");
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) return;
    const code = err instanceof ApiClientError ? err.code : err instanceof Error ? err.name : "unknown";
    console.warn("[gh-radar] push 로그아웃 정리 실패 — 로그아웃은 계속", code);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
