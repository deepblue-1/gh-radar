import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAuth } from "../middleware/require-auth.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { ValidationFailed } from "../errors.js";
import { AdminPnlQuery } from "../schemas/pnl.js";
import { getAdminPnl } from "../services/pnl.js";

/**
 * Phase 36 D-17 ① — 일자별 매매손익 어드민(`/admin/pnl`) **조회 전용** 라우트.
 *
 * - GET /pnl?group=user|account&range=7|30|90|month : 전 계정(dma_user_id) 또는 전 계좌(account_no) 묶음의 `PnlReport`.
 *   기본 group user · range 30. 묶음 정렬(미상 맨 뒤 · KB → 교보 → 계좌번호)은 RPC 가 정한다.
 *
 * ── 방어선 ──────────────────────────────────────────────────
 *   T-15-03  `requireAuth()` — 미인증 401.
 *   D-17 ①   `requireAdmin()` — DB role 을 매 요청 조회(토큰 클레임 아님). admin 이 아니면 403 · RPC 0회.
 *   T-19-01  RPC(`dma_pnl_daily_for_admin`) EXECUTE 는 service_role 전용 — 브라우저가 PostgREST 로 직접 부를 수 없다.
 *   D-17     계정(dma_user_id) · 계좌 값을 그대로 싣는다 — 어드민 전용이라서다(이 라우터 밖으로 이 응답을 옮기지 말 것).
 *   입력     `group` · `range` 는 zod enum → 아니면 400(RPC 0회).
 *   T-15-07  에러는 전부 `next(e)` — `errorHandler` 가 프로덕션에서 원문을 감춘다.
 */

export const adminPnlRouter: RouterT = Router();

// 관문은 /pnl 경로에만 — adminRouter 의 전역 관문과 겹치면 역할 조회 왕복 +1(이 라우터는 adminRouter 앞에 마운트된다 · app.ts).
adminPnlRouter.use("/pnl", requireAuth(), requireAdmin());

adminPnlRouter.get("/pnl", async (req, res, next) => {
  try {
    const parsed = AdminPnlQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw ValidationFailed(`${issue.path.join(".")}: ${issue.message}`);
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    res.json(await getAdminPnl(supabase, parsed.data.group, parsed.data.range));
  } catch (e) {
    next(e);
  }
});
