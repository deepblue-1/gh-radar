import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StrategyEventRow } from "@gh-radar/shared";

import { requireAuth } from "../middleware/require-auth.js";
import { OrderListQuery } from "../schemas/orders.js";
import { ValidationFailed } from "../errors.js";
import { listAccumSignals } from "../services/dma-orders.js";

/**
 * quick-261018-rfy D-03 — kind 16 매집감지(gh-trade Phase 34 AccumSignal) **조회 전용** 라우트.
 *
 * - GET / : `?date=YYYY-MM-DD`(생략 = KST 오늘) 그날 kind 16 을 isin 별 1행 — bare array `StrategyEventRow[]`.
 *   작업대 「매집」 패널이 마운트 · relay ready 전이마다 복원으로 부른다. 오늘분 라이브는 relay `journal.events`
 *   푸시(웹 리듀서 별도 목록 `accumSignalEvents`)가 같은 매퍼(`toStrategyEventRow`)로 이어 붙인다.
 *
 * 1행 고르기는 RPC(`dma_accum_signals_for_user_json`)가 정본이다 — 다른 분이면 최신 분, 같은 분이면
 * `dma_servers.is_quote_primary` 게이트웨이 행, 그 서버 행이 없으면 다른 서버 행(세 서버가 각자 넣는다).
 * 가시성도 RPC 안 SETOF 함수 조인 하나 — 시세 kind(16 포함)는 그 게이트웨이에 가시 계좌가 있는 사용자 전원.
 * server 는 행을 거르지 않고 거를 근거도 갖지 않는다.
 *
 * ── 방어선 ──────────────────────────────────────────────────
 *   T-15-03  `requireAuth()` — 미인증 401
 *   T-19-01  RPC EXECUTE 는 service_role 전용(anon · authenticated 명시 REVOKE) — 브라우저가 PostgREST 로
 *            남의 `p_user_id` 를 넣어 직접 부를 수 없다
 *   T-19-17  `p_user_id` = `req.userId`(requireAuth 확정값) 하나. 쿼리의 `user_id` 같은 값은 읽지 않는다
 *   T-25-17  `date` 는 zod 형식 + `resolveTradeDate` 실재 검사 → 400(500 방지)
 *   T-15-07  에러는 전부 `next(e)` — `errorHandler` 가 프로덕션에서 원문을 감춘다
 */

export const accumSignalsRouter: RouterT = Router();

// --- GET / — 그날 kind 16 isin 별 최신 1행 ---
accumSignalsRouter.get("/", requireAuth(), async (req, res, next) => {
  try {
    const parsed = OrderListQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw ValidationFailed(`${issue.path.join(".")}: ${issue.message}`);
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    // 사용자 id 는 인증이 확정한 값 하나만 넘긴다 (T-19-17). 가시성 · 1행 고르기는 RPC.
    const rows: StrategyEventRow[] = await listAccumSignals(supabase, req.userId!, parsed.data.date);
    // 코드베이스 규약: list 엔드포인트는 bare array.
    res.json(rows);
  } catch (e) {
    next(e);
  }
});
