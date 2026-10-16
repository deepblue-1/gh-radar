import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAuth } from "../middleware/require-auth.js";
import { TeamflowReportQuery } from "../schemas/teamflow-report.js";
import { ValidationFailed } from "../errors.js";
import { getTeamflowReport } from "../services/teamflow-report.js";

/**
 * Phase 33 D-05 — 팀 매집 보고서(`/analytics/teamflow`) **조회 전용** 라우트.
 *
 * - GET /report?d=YYYYMMDD : 하루 번들(`TeamflowReportResponse`). `d` 생략 = 최신 보고서 날짜.
 *
 * ── 방어선 ──────────────────────────────────────────────────
 *   T-15-03  `requireAuth()` — 미인증 401. 미들웨어는 이것 하나다 — DMA 매핑 미들웨어를 겹치지 않는다
 *            (게이트는 RPC 안 · 왕복 1회 · D-05).
 *   T-19-01  RPC EXECUTE 는 service_role 전용 — 브라우저가 PostgREST 로 남의 `p_user_id` 를 넣어 부를 수 없다
 *   T-19-17  `p_user_id` = `req.userId`(requireAuth 확정값) 하나. 쿼리의 `user_id` 같은 값은 읽지 않는다
 *   D-05     게이트는 RPC(`dma_visible_accounts`)다 — 미매핑 403 `DMA_UNMAPPED`. 웹의 `DmaGate` 는 표시 장치이지 권한 장치가 아니다.
 *            표 `limitup_team_flow` 는 접근 규칙 0 · anon/authenticated 권한 0 — 읽기 경로는 이 라우트 → RPC 뿐(D-06).
 *   입력     `d` 는 zod `^\d{8}$` + 실재 날짜 → 아니면 400(RPC 0회)
 *   T-15-07  에러는 전부 `next(e)` — `errorHandler` 가 프로덕션에서 원문을 감춘다
 */

export const teamflowRouter: RouterT = Router();

teamflowRouter.get("/report", requireAuth(), async (req, res, next) => {
  try {
    const parsed = TeamflowReportQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw ValidationFailed(`${issue.path.join(".")}: ${issue.message}`);
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    res.json(await getTeamflowReport(supabase, req.userId!, parsed.data.d));
  } catch (e) {
    next(e);
  }
});
