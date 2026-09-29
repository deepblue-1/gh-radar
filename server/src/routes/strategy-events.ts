import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StrategyEventRow } from "@gh-radar/shared";

import { requireAuth } from "../middleware/require-auth.js";
import { StrategyEventsQuery } from "../schemas/orders.js";
import { ValidationFailed } from "../errors.js";
import { listStrategyEvents } from "../services/dma-orders.js";

/**
 * Phase 25 D-07 — 하루치 주문로그(상따 전략 이벤트) **조회 전용** 라우트.
 *
 * - GET / : `?date=YYYY-MM-DD`(생략 = KST 오늘) 하루치 평면 목록 — bare array `StrategyEventRow[]`.
 *   작업대 「주문로그」 탭 마운트 복원 · 창 분리 페이지 과거일 이동이 쓴다. 오늘분 라이브는 relay
 *   `journal.events` 푸시가 같은 매퍼(`toStrategyEventRow`)로 이어 붙인다.
 *
 * 가시성은 RPC(`dma_strategy_events_for_user`) 조인 하나가 정본이다 — 주문 이벤트는 `dma_account_access` 계좌
 * 조인, 시세 이벤트(kind 1·2)는 그 게이트웨이 매핑 보유 사용자 전원. relay 푸시(WsFanout)와 같은 규칙이라
 * 새로고침 전후 목록이 갈리지 않는다. server 는 행을 거르지 않고 거를 근거도 갖지 않는다.
 *
 * ── 방어선 ──────────────────────────────────────────────────
 *   T-15-03  `requireAuth()` — 미인증 401
 *   T-19-01  RPC EXECUTE 는 service_role 전용(anon · authenticated 명시 REVOKE) — 브라우저가 PostgREST 로
 *            남의 `p_user_id` 를 넣어 직접 부를 수 없다(T-25-12)
 *   T-19-17  `p_user_id` = `req.userId`(requireAuth 확정값) 하나. 쿼리의 `user_id` 같은 값은 읽지 않는다
 *   T-25-17  `date` 는 zod 형식 + `resolveTradeDate` 실재 검사 → 400(500 방지)
 *   T-15-07  에러는 전부 `next(e)` — `errorHandler` 가 프로덕션에서 원문을 감춘다
 */

export const strategyEventsRouter: RouterT = Router();

// --- GET / — 하루치 주문로그 평면 목록 (D-07) ---
strategyEventsRouter.get("/", requireAuth(), async (req, res, next) => {
  try {
    const parsed = StrategyEventsQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw ValidationFailed(`${issue.path.join(".")}: ${issue.message}`);
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    // 사용자 id 는 인증이 확정한 값 하나만 넘긴다 (T-19-17). 가시성 필터는 RPC 조인.
    const rows: StrategyEventRow[] = await listStrategyEvents(supabase, req.userId!, parsed.data.date);
    // 코드베이스 규약: list 엔드포인트는 bare array.
    res.json(rows);
  } catch (e) {
    next(e);
  }
});
