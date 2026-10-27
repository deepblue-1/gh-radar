import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAuth } from "../middleware/require-auth.js";
import { ValidationFailed } from "../errors.js";
import { PnlQuery } from "../schemas/pnl.js";
import { getMyPnl } from "../services/pnl.js";

/**
 * Phase 36 D-17 ② — /me 「손익」 탭 일자별 매매손익 **조회 전용** 라우트.
 *
 * - GET /?account=<계좌번호>&range=7|30|90|month : 고른 계좌 한 벌의 `PnlReport`(묶음 0~1개). 기본 range 30.
 *
 * ── 방어선 ──────────────────────────────────────────────────
 *   T-15-03  `requireAuth()` — 미인증 401.
 *   T-19-17  `p_user_id` = `req.userId`(requireAuth 확정값) 하나. 쿼리의 사용자 값은 읽지 않는다.
 *   D-17 ②   어드민 권한 분기 없음 — 가시성은 RPC 안의 `dma_visible_accounts` 조인(기존 계좌 접근 의미 그대로).
 *            보이지 않는 계좌는 403 이 아니라 200 `groups: []`(계좌 존재 여부를 흘리지 않는다).
 *   입력     `account` 1~12자 · `range` enum → 아니면 400(RPC 0회).
 *   T-15-07  에러는 전부 `next(e)` — `errorHandler` 가 프로덕션에서 원문을 감춘다.
 */

export const pnlRouter: RouterT = Router();

pnlRouter.get("/", requireAuth(), async (req, res, next) => {
  try {
    const parsed = PnlQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw ValidationFailed(`${issue.path.join(".")}: ${issue.message}`);
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    res.json(await getMyPnl(supabase, req.userId!, parsed.data.account, parsed.data.range));
  } catch (e) {
    next(e);
  }
});
