import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LaunchPlanResponse } from "@gh-radar/shared";

import { requireAuth } from "../middleware/require-auth.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { ValidationFailed } from "../errors.js";
import { LaunchMapQuery, LaunchOrdersQuery } from "../schemas/admin-launch.js";
import {
  getLaunchMap,
  getLaunchOrders,
  getLaunchPlanChanges,
  readLaunchPlanServers,
} from "../services/admin-launch.js";
import type { RelayAdminClient } from "../services/relay-admin-client.js";

/**
 * Phase 35 D-20 — 발사 경계 지도 어드민(`/admin/launch`) **조회 전용** 라우트.
 *
 * - GET /launch/orders?d=YYYYMMDD : 주문 내역 하루치(`LaunchOrdersResponse`). `d` 생략 = 최신 거래일.
 * - GET /launch/map?fire=q16|n0930&range=10d|20d|all : 경계 지도(`LaunchMapResponse`). 기본 q16 · 10d.
 * - GET /launch/plan : 서버별 현재 발사 계획 + 변경 이력(`LaunchPlanResponse` · 35-13 D-25) — relay 조회 ‖ 이력 RPC(Promise.all ·
 *                      relay 왕복 1 · Supabase 왕복 1).
 *
 * ── 방어선 ──────────────────────────────────────────────────
 *   T-15-03  `requireAuth()` — 미인증 401.
 *   D-20     `requireAdmin()` — DB role 을 매 요청 조회(토큰 클레임 아님). admin 이 아니면 403 · RPC 0회.
 *   T-19-01  RPC EXECUTE 는 service_role 전용 — 브라우저가 PostgREST 로 직접 부를 수 없다.
 *            표 `launch_pieces` · `launch_heads` 는 RLS 켬 · 정책 0 — 읽기 경로는 이 라우트 → RPC 뿐.
 *   D-02     계좌 · DMA 사용자 열을 그대로 싣는다 — 어드민 전용이라서다(이 라우터 밖으로 이 응답을 옮기지 말 것).
 *   입력     `d` 는 zod `^\d{8}$` + 실재 날짜 · `fire` · `range` 는 enum → 아니면 400(RPC 0회)
 *   T-15-07  에러는 전부 `next(e)` — `errorHandler` 가 프로덕션에서 원문을 감춘다
 *   D-25     GET /launch/plan · relay 실패(없음 · 못 닿음 · 비200 · 모양 위반)는 offline 200 — 웹이 대신 값으로 그린다.
 *            이력 RPC 실패만 500 DB_ERROR.
 */

export const adminLaunchRouter: RouterT = Router();

// 관문은 /launch 경로에만 — adminRouter 의 전역 관문과 겹치면 역할 조회 왕복 +1(이 라우터는 adminRouter 앞에 마운트된다 · app.ts).
adminLaunchRouter.use("/launch", requireAuth(), requireAdmin());

adminLaunchRouter.get("/launch/orders", async (req, res, next) => {
  try {
    const parsed = LaunchOrdersQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw ValidationFailed(`${issue.path.join(".")}: ${issue.message}`);
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    res.json(await getLaunchOrders(supabase, parsed.data.d));
  } catch (e) {
    next(e);
  }
});

adminLaunchRouter.get("/launch/map", async (req, res, next) => {
  try {
    const parsed = LaunchMapQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw ValidationFailed(`${issue.path.join(".")}: ${issue.message}`);
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    res.json(await getLaunchMap(supabase, parsed.data.fire, parsed.data.range));
  } catch (e) {
    next(e);
  }
});

adminLaunchRouter.get("/launch/plan", async (req, res, next) => {
  try {
    const supabase = req.app.locals.supabase as SupabaseClient;
    const [servers, changes] = await Promise.all([
      readLaunchPlanServers(req.app.locals.relayAdmin as RelayAdminClient | undefined, req.adminEmail!),
      getLaunchPlanChanges(supabase),
    ]);
    res.json({ servers, changes } satisfies LaunchPlanResponse);
  } catch (e) {
    next(e);
  }
});
