import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAuth } from "../middleware/require-auth.js";
import { LimitupGridUrlsQuery, LimitupReportQuery } from "../schemas/limitup-report.js";
import { ValidationFailed } from "../errors.js";
import { getLimitupGridUrls, getLimitupReport } from "../services/limitup-report.js";

/**
 * Phase 28 D-10 · D-15 — 상한가 보고서(`/analytics/limitup`) **조회 전용** 라우트.
 * 기존 `/api/stocks/:code/limit-up`(`routes/limitUp.ts` · 상한가 다음날 이력)과 다른 기능이다 — 파일 · 라우터 이름으로 구분.
 *
 * - GET /report?d=YYYYMMDD    : 보고서 한 장(`LimitupReportResponse`). `d` 생략 = 최신 적재 날짜.
 * - GET /grid-urls?d=YYYYMMDD : 그날 격자 단기 서명 URL(`LimitupGridUrlsResponse` · 600초). `d` 필수.
 *
 * ── 방어선 ──────────────────────────────────────────────────
 *   T-15-03  `requireAuth()` — 미인증 401
 *   T-19-01  RPC EXECUTE 는 service_role 전용 — 브라우저가 PostgREST 로 남의 `p_user_id` 를 넣어 부를 수 없다
 *   T-19-17  `p_user_id` = `req.userId`(requireAuth 확정값) 하나. 쿼리의 `user_id` 같은 값은 읽지 않는다
 *   D-10     게이트는 이 라우트 + RPC(`dma_visible_accounts`)다 — 미매핑 403 `DMA_UNMAPPED`.
 *            웹의 `DmaGate` 는 표시 장치이지 권한 장치가 아니다. 격자 버킷은 비공개 · 서명 URL 은 인증 뒤에만.
 *   입력     `d` 는 zod `^\d{8}$` + 실재 날짜 → 아니면 400(RPC 0회)
 *   T-15-07  에러는 전부 `next(e)` — `errorHandler` 가 프로덕션에서 원문을 감춘다
 */

export const limitupRouter: RouterT = Router();

limitupRouter.get("/report", requireAuth(), async (req, res, next) => {
  try {
    const parsed = LimitupReportQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw ValidationFailed(`${issue.path.join(".")}: ${issue.message}`);
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    res.json(await getLimitupReport(supabase, req.userId!, parsed.data.d));
  } catch (e) {
    next(e);
  }
});

limitupRouter.get("/grid-urls", requireAuth(), async (req, res, next) => {
  try {
    const parsed = LimitupGridUrlsQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw ValidationFailed(`${issue.path.join(".")}: ${issue.message}`);
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    res.json(await getLimitupGridUrls(supabase, req.userId!, parsed.data.d));
  } catch (e) {
    next(e);
  }
});
