import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveAdminUsersOverview, type AdminUsersRaw } from "@gh-radar/shared";

import { requireAuth } from "../middleware/require-auth.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { ApiError } from "../errors.js";

/**
 * Phase 29 (D-07 · D-14) — 웹 Admin 의 서버 관문. 반영 경로 = webapp → **Express(admin 역할 검증)** → relay HTTP.
 * 브라우저는 Admin 표(app_users · dma_*)에 PostgREST 로 직접 쓰지 않는다 — 표는 전부 service_role 전용이다.
 *
 * - GET /users : 사용자 개요(`AdminUsersOverview`) — RPC `admin_users_raw` **1회** → shared `deriveAdminUsersOverview`.
 *   칩 판정 규칙은 shared 한 곳(relay planner 와 같은 diff)이고 server 는 파생만 부른다.
 *
 * ── 방어선 ──────────────────────────────────────────────────
 *   인증      `requireAuth()` — 미인증 · 만료 토큰 401 `UNAUTHENTICATED`
 *   역할      `requireAdmin()` — app_users role = admin 만(매 요청 DB 조회 · 강등 즉시 반영 D-04). 그 밖 403 `FORBIDDEN`
 *   권한      `admin_users_raw` · `app_users` 는 service_role 전용(anon · authenticated 명시 REVOKE) — 이 라우터가 유일한 창구
 *   오류      DB 오류는 `DB_ERROR` 고정 문구 — 원문(PostgREST code · message)은 errorHandler warn 로그에만(T-15-07)
 *   비밀      비밀번호 · 공유 비밀은 로그에 남지 않는다(logger redact)
 *
 * ★ Cloud Run → Supabase 왕복이 지연을 지배한다 — 개요 한 장 = 역할 조회 1회 + RPC 1회.
 */

export const adminRouter: RouterT = Router();

// 라우터 전체에 인증 → 역할. 개별 라우트에 다시 걸지 않는다(빠뜨린 라우트가 생기지 않게).
adminRouter.use(requireAuth(), requireAdmin());

/** `cause` 는 로그 전용(errorHandler warn) — 응답에는 고정 문구만. */
const DbError = (msg: string, cause?: unknown) => new ApiError(500, "DB_ERROR", msg, cause);

// --- GET /users — 사용자 개요 (D-14) ---
adminRouter.get("/users", async (req, res, next) => {
  try {
    const supabase = req.app.locals.supabase as SupabaseClient;
    const { data, error } = await supabase.rpc("admin_users_raw");
    if (error) throw DbError("사용자 목록 조회에 실패했습니다.", error);
    // RPC 는 늘 7키 객체를 준다(coalesce '[]'). 객체가 아니면 계약 위반 — 빈 목록으로 감추지 않는다.
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw DbError("사용자 목록 조회에 실패했습니다.");
    }
    res.json(deriveAdminUsersOverview(data as AdminUsersRaw));
  } catch (e) {
    next(e);
  }
});
