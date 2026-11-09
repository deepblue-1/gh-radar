import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PushDevice } from "@gh-radar/shared";
import type { ZodError } from "zod";

import { requireAuth } from "../middleware/require-auth.js";
import {
  PushAccountNoParam,
  PushAccountToggleBody,
  PushDeviceHandoverBodySchema,
  PushDeviceKeyParam,
  PushDevicePatchBody,
  PushDeviceRegisterBodySchema,
} from "../schemas/push-devices.js";
import { NotFound, ValidationFailed } from "../errors.js";
import {
  deletePushDevice,
  disablePushDevice,
  handoverPushDevice,
  listPushAccountMutes,
  listPushDevices,
  registerPushDevice,
  setPushAccountEnabled,
} from "../services/push-devices.js";

/**
 * Phase 40 D-12 · D-13 · D-15 — 체결 앱 푸시 기기 API. 표(`dma_push_devices`)는 브라우저가 직접 읽지 않는다
 * (RLS 정책 0) — 앱의 토큰 등록과 웹의 기기 목록 · 끄기 · 지우기는 전부 이 라우트를 거친다.
 *
 * - GET    /           : 내 기기 목록 → `PushDevice[]`(bare array · token 없음)
 * - PUT    /:deviceKey : 「이 기기 체결 알림 켜기」 · 토큰 갱신(D-12 · D-15) → `PushDevice`(enabled = true)
 * - PATCH  /:deviceKey : body `{ enabled: false }` 만 — 끄기(D-13). 켜기는 권한이 있는 그 기기 앱의 PUT 로만 → `{ ok: true }`
 * - DELETE /:deviceKey : 지우기 — 웹 목록 · 앱 로그아웃 정리(D-15) 같은 경로 → `{ ok: true }`
 * - GET    /accounts            : 내 끈 계좌번호 → `string[]`(bare array · quick-261109-dz1 D-08)
 * - PUT    /accounts/:accountNo : body `{ enabled: boolean }` — 계좌 끄기 · 켜기(멱등 · 내 모든 기기 · D-01 · D-04 · D-08)
 *                                 → `{ ok: true }`. 가시성 판정 없음(남의 번호를 꺼도 자기 수신에만 영향)
 * - POST   /handover            : body `{ token, deviceKey | null }` — 앱 로그인 뒤 이 폰 정리(리뷰 WR-07 · D-15). 이 토큰 ·
 *                                 기기 키를 가진 「나 ∧ 이 기기 키」 밖의 행 삭제 → `{ ok: true, removed }`(0 도 정상)
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

// --- GET /accounts — 내 끈 계좌 (quick-261109-dz1 D-08) ---
// /:deviceKey 라우트보다 먼저 등록한다(D-08 라우트 순서 — 읽는 순서로도 분명하게).
pushDevicesRouter.get("/accounts", requireAuth(), async (req, res, next) => {
  try {
    const supabase = req.app.locals.supabase as SupabaseClient;
    const rows = await listPushAccountMutes(supabase, req.userId!);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// --- PUT /accounts/:accountNo — 계좌 끄기 · 켜기 (quick-261109-dz1 D-01 · D-04 · D-08) ---
pushDevicesRouter.put("/accounts/:accountNo", requireAuth(), async (req, res, next) => {
  try {
    const params = PushAccountNoParam.safeParse(req.params);
    if (!params.success) throw firstIssue(params.error);
    const body = PushAccountToggleBody.safeParse(req.body ?? {});
    if (!body.success) throw firstIssue(body.error);
    const supabase = req.app.locals.supabase as SupabaseClient;
    // 사용자 id 는 인증이 확정한 값 하나만 넘긴다 (T-19-17 · D-04 본인 행만).
    await setPushAccountEnabled(supabase, req.userId!, params.data.accountNo, body.data.enabled);
    // 바뀌었든 이미 그 상태였든 같은 응답(멱등).
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// --- POST /handover — 앱 로그인 뒤 이 폰 정리 (리뷰 WR-07 · D-15) ---
// 로그아웃 DELETE 가 실패했거나(오프라인 · 시간 초과) 세션 만료로 정리 없이 /login 에 튕겼을 때 남은 앞 사용자 행을 지운다.
pushDevicesRouter.post("/handover", requireAuth(), async (req, res, next) => {
  try {
    const body = PushDeviceHandoverBodySchema.safeParse(req.body ?? {});
    if (!body.success) throw firstIssue(body.error);
    const supabase = req.app.locals.supabase as SupabaseClient;
    // 사용자 id 는 인증이 확정한 값 하나만 넘긴다 (T-19-17).
    const removed = await handoverPushDevice(supabase, req.userId!, body.data.token, body.data.deviceKey);
    res.json({ ok: true, removed });
  } catch (e) {
    next(e);
  }
});

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

// --- GET / — 내 기기 목록 (D-13) ---
pushDevicesRouter.get("/", requireAuth(), async (req, res, next) => {
  try {
    const supabase = req.app.locals.supabase as SupabaseClient;
    const rows: PushDevice[] = await listPushDevices(supabase, req.userId!);
    // 코드베이스 규약: list 엔드포인트는 bare array.
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// --- PATCH /:deviceKey — 끄기만 (D-13 · 켜기는 그 기기 앱의 PUT) ---
pushDevicesRouter.patch("/:deviceKey", requireAuth(), async (req, res, next) => {
  try {
    const params = PushDeviceKeyParam.safeParse(req.params);
    if (!params.success) throw firstIssue(params.error);
    const body = PushDevicePatchBody.safeParse(req.body ?? {});
    if (!body.success) throw firstIssue(body.error);
    const supabase = req.app.locals.supabase as SupabaseClient;
    const ok = await disablePushDevice(supabase, req.userId!, params.data.deviceKey);
    // 남의 · 없는 키 — 있는지조차 구분해 주지 않는다(SC-4).
    if (!ok) throw NotFound();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// --- DELETE /:deviceKey — 지우기 (D-13 · D-15 로그아웃 정리도 같은 경로) ---
pushDevicesRouter.delete("/:deviceKey", requireAuth(), async (req, res, next) => {
  try {
    const params = PushDeviceKeyParam.safeParse(req.params);
    if (!params.success) throw firstIssue(params.error);
    const supabase = req.app.locals.supabase as SupabaseClient;
    const ok = await deletePushDevice(supabase, req.userId!, params.data.deviceKey);
    if (!ok) throw NotFound();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
