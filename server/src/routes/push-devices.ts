import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ZodError } from "zod";

import { requireAuth } from "../middleware/require-auth.js";
import { PushDeviceKeyParam, PushDeviceRegisterBodySchema } from "../schemas/push-devices.js";
import { ValidationFailed } from "../errors.js";
import { registerPushDevice } from "../services/push-devices.js";

/**
 * Phase 40 D-12 · D-13 · D-15 — 체결 앱 푸시 기기 API. 표(`dma_push_devices`)는 브라우저가 직접 읽지 않는다
 * (RLS 정책 0) — 앱의 토큰 등록과 웹의 기기 목록 · 끄기 · 지우기는 전부 이 라우트를 거친다.
 *
 * - PUT    /:deviceKey : 「이 기기 체결 알림 켜기」 · 토큰 갱신(D-12 · D-15) → `PushDevice`(enabled = true)
 *
 * ── 방어선 ──────────────────────────────────────────────────
 *   T-15-03  `requireAuth()` — 미인증 401
 *   T-19-01  기기 RPC EXECUTE 는 service_role 전용 — 브라우저가 PostgREST 로 직접 부를 수 없다
 *   T-19-17  `p_user_id` = `req.userId`(requireAuth 확정값) 하나. 쿼리 · body 의 사용자 값은 읽지 않는다
 *            (body 는 `.strict()` 라 `user_id` 같은 키가 오면 400)
 *   SC-4     남의 · 없는 deviceKey 는 RPC 가 false → 404(소유권 판정은 RPC 의 `user_id` 조건이 정본)
 *   zod      deviceKey(소문자 UUID) · body 형식 위반 → 400 · RPC 호출 0
 *   T-19-14  토큰은 로그 · 응답에 없다 — 응답은 서비스가 공개 키만 옮긴 `PushDevice`
 *   T-15-07  에러는 전부 `next(e)` — `errorHandler` 가 프로덕션에서 원문을 감춘다
 */

export const pushDevicesRouter: RouterT = Router();

/** 첫 zod 이슈를 `path: message` 400 으로(값은 싣지 않는다 — 토큰이 메시지로 새지 않게). */
function firstIssue(err: ZodError) {
  const issue = err.issues[0];
  return ValidationFailed(`${issue.path.join(".")}: ${issue.message}`);
}

// --- PUT /:deviceKey — 이 기기 체결 알림 켜기 · 토큰 갱신 (D-12 · D-15) ---
pushDevicesRouter.put("/:deviceKey", requireAuth(), async (req, res, next) => {
  try {
    const params = PushDeviceKeyParam.safeParse(req.params);
    if (!params.success) throw firstIssue(params.error);
    const body = PushDeviceRegisterBodySchema.safeParse(req.body ?? {});
    if (!body.success) throw firstIssue(body.error);
    const supabase = req.app.locals.supabase as SupabaseClient;
    // 사용자 id 는 인증이 확정한 값 하나만 넘긴다 (T-19-17).
    const row = await registerPushDevice(supabase, req.userId!, params.data.deviceKey, body.data);
    res.json(row);
  } catch (e) {
    next(e);
  }
});
