import type { SupabaseClient } from "@supabase/supabase-js";
import type { PushDevice, PushDeviceRegisterBody } from "@gh-radar/shared";

import { ApiError } from "../errors.js";

/**
 * Phase 40 D-12 · D-13 · D-15 — 체결 푸시 기기 서비스. 40-01 RPC 를 감싸는 순수 함수 모듈
 * (서비스롤 `SupabaseClient` 를 인자로 받는다 — `dma-orders.ts` 규약).
 *
 * ── 방어선 ──────────────────────────────────────────────────
 *   T-19-01  기기 RPC EXECUTE 는 service_role 전용(anon · authenticated 명시 REVOKE) — 브라우저가 PostgREST 로
 *            남의 `p_user_id` 를 넣어 직접 부를 수 없다. 표는 RLS 켜짐 · 정책 0.
 *   T-19-17  모든 함수는 **인증된 `userId` 하나만** `p_user_id` 로 넘긴다(라우트의 `req.userId`).
 *   SC-4     소유권은 RPC 의 `WHERE user_id = p_user_id` 가 정본 — 남의 · 없는 키는 false 로 돌아오고 라우트가 404.
 *   T-19-14  응답 원소는 shared `PushDevice` 공개 키 6개만 옮긴다 — RPC 가 혹시 다른 키(token 등)를 실어도 새지 않는다.
 *            토큰 · 사용자 id 는 로그 · 에러 원인(cause)에 싣지 않는다.
 *
 * ★ 한 요청 = RPC 1회(Cloud Run → Supabase 왕복이 지연을 지배).
 */

/** `cause` 는 로그 전용 — 응답에는 고정 문구만(T-15-07). */
const DbError = (msg: string, cause?: unknown) => new ApiError(500, "DB_ERROR", msg, cause);

/** RPC 원소 → 공개 키 6개만(T-19-14). 모양이 어긋나면 null. */
function toPushDevice(v: unknown): PushDevice | null {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (
    typeof o.deviceKey !== "string" ||
    (o.platform !== "ios" && o.platform !== "android") ||
    typeof o.label !== "string" ||
    typeof o.enabled !== "boolean" ||
    typeof o.lastSeenAt !== "string" ||
    typeof o.createdAt !== "string"
  ) {
    return null;
  }
  return {
    deviceKey: o.deviceKey,
    platform: o.platform,
    label: o.label,
    enabled: o.enabled,
    lastSeenAt: o.lastSeenAt,
    createdAt: o.createdAt,
  };
}

/**
 * D-12 · D-15 — 「이 기기 체결 알림 켜기」 · 토큰 갱신. 같은 (사용자, 기기 키) 행을 enabled = true 로 교체하고,
 * 같은 토큰을 가진 다른 행(다른 계정 · 같은 사용자 옛 기기 키)은 RPC 가 지운다(토큰 인계).
 */
export async function registerPushDevice(
  supabase: SupabaseClient,
  userId: string,
  deviceKey: string,
  body: PushDeviceRegisterBody,
): Promise<PushDevice> {
  const { data, error } = await supabase.rpc("dma_push_device_upsert", {
    p_user_id: userId,
    p_device_key: deviceKey,
    p_platform: body.platform,
    p_token: body.token,
    p_label: body.label,
  });
  if (error) {
    // PostgREST 메시지에 값이 섞일 수 있어 토큰을 가린 뒤에만 로그 원인으로 남긴다(T-19-14).
    const message = String(error.message ?? "").split(body.token).join("[token]");
    throw DbError("기기 등록에 실패했습니다.", { code: error.code, message });
  }
  const row = toPushDevice(data);
  // RPC 는 늘 기기 원소 하나를 준다. 아니면 계약 위반 — 성공으로 감추지 않는다.
  if (!row) {
    throw DbError("기기 등록에 실패했습니다.", { reason: "dma_push_device_upsert 모양 위반", type: typeof data });
  }
  return row;
}

/** D-13 — 내 기기 목록(last_seen_at DESC · RPC 순서 유지). */
export async function listPushDevices(supabase: SupabaseClient, userId: string): Promise<PushDevice[]> {
  const { data, error } = await supabase.rpc("dma_push_devices_for_user", { p_user_id: userId });
  if (error) throw DbError("기기 목록 조회에 실패했습니다.", { code: error.code, message: error.message });
  // RPC 는 늘 배열을 준다(coalesce '[]'). 배열이 아니거나 원소 모양이 어긋나면 계약 위반 — 빈 목록으로 감추지 않는다.
  if (!Array.isArray(data)) {
    throw DbError("기기 목록 조회에 실패했습니다.", { reason: "dma_push_devices_for_user 모양 위반", type: typeof data });
  }
  const rows = data.map(toPushDevice);
  if (rows.some((r) => r === null)) {
    throw DbError("기기 목록 조회에 실패했습니다.", { reason: "dma_push_devices_for_user 원소 모양 위반" });
  }
  return rows as PushDevice[];
}

/** boolean RPC 공통 — true = 그 사용자의 그 키 행이 있었다 · false = 남의 · 없는 키(라우트가 404). */
async function callOwnedDeviceRpc(
  supabase: SupabaseClient,
  fn: "dma_push_device_disable" | "dma_push_device_delete",
  userId: string,
  deviceKey: string,
  failMsg: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc(fn, { p_user_id: userId, p_device_key: deviceKey });
  if (error) throw DbError(failMsg, { code: error.code, message: error.message });
  if (typeof data !== "boolean") throw DbError(failMsg, { reason: `${fn} 모양 위반`, type: typeof data });
  return data;
}

/** D-13 — 끄기(enabled = false · 토큰은 남긴다). 켜기는 그 기기 앱의 `registerPushDevice` 로만. */
export function disablePushDevice(supabase: SupabaseClient, userId: string, deviceKey: string): Promise<boolean> {
  return callOwnedDeviceRpc(supabase, "dma_push_device_disable", userId, deviceKey, "기기 끄기에 실패했습니다.");
}

/** D-13 · D-15 — 지우기(웹 목록의 지우기 · 앱 로그아웃 정리가 같은 경로). */
export function deletePushDevice(supabase: SupabaseClient, userId: string, deviceKey: string): Promise<boolean> {
  return callOwnedDeviceRpc(supabase, "dma_push_device_delete", userId, deviceKey, "기기 지우기에 실패했습니다.");
}
