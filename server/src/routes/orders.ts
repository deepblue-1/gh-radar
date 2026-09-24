import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { JournalOrderRow } from "@gh-radar/shared";

import { requireAuth } from "../middleware/require-auth.js";
import { OrderListQuery } from "../schemas/orders.js";
import { ValidationFailed } from "../errors.js";
import { listTodayOrders } from "../services/dma-orders.js";

/**
 * Phase 16 Plan 16 — DMA 주문 **조회 전용** 라우트 (D-02 / D-24).
 * Phase 19 D-05 — 원천이 계좌 기준 저널 테이블(`dma_account_orders`)로 바뀌었다. 경로·쿼리·
 * bare array 규약은 그대로다.
 *
 * - GET / : 하루치 주문 목록 (새로고침 복원, bare array — `JournalOrderRow[]`)
 *
 * ★ **주문 접수는 여기에 없다.** 신규·취소는 relay 의 wss(`order.new`/`order.cancel`)
 * 하나로만 나간다 (D-02 — 16-08 이 핸들러를, 16-10 이 브라우저 호출부를 옮겼다).
 * 15-17 이 두었던 `POST /` 는 이 plan 에서 제거했다.
 *
 * 왜 지웠는가 — 두 경로를 공존시키면 같은 `dma_orders` 행을 REST 와 wss 가 서로 다른
 * 셀렉터로 다투게 되고, 그 순간 화면의 주문 상태가 갈린다. 접수 경로가 하나면 감사·계좌
 * 화이트리스트·타임아웃 규율도 한 벌만 존재한다 (T-16-11 — 공격면 자체를 없앤다).
 *
 * 함께 사라진 것:
 *   - `ordersRateLimit`(30/60s) — **POST 에만** 걸려 있었다(GET 은 `requireAuth()` 뿐).
 *     새 경로의 상한은 연결당 토큰 버킷(16-07)이 담당한다.
 *   - `RelayClient` 결선 · `services/relay-client.ts` · `RELAY_INTERNAL_URL`/
 *     `ORDER_TIMEOUT_MS` env — server 는 이제 relay 를 부르지 않는다.
 *
 * ── 이 라우트에 남는 방어선 ──────────────────────────────────
 *   T-15-03  `requireAuth()` — 미인증 401
 *   T-19-01  조회 RPC(`dma_journal_orders_for_user`) EXECUTE 는 service_role 전용 — 브라우저가
 *            PostgREST 로 직접 부를 수 없다. 가시성 필터는 RPC 안의 조인이 정본(D-06)
 *   T-19-17  `p_user_id` = `req.userId`(requireAuth 확정값) 하나. 쿼리의 `user_id` 같은 값은
 *            읽지 않는다
 *   T-15-07  에러는 전부 `next(e)` — `errorHandler` 가 프로덕션에서 원문을 감춘다
 */

export const ordersRouter: RouterT = Router();

// --- GET / — 하루치 주문 목록 (D-24) ---
ordersRouter.get("/", requireAuth(), async (req, res, next) => {
  try {
    const parsed = OrderListQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw ValidationFailed(`${issue.path.join(".")}: ${issue.message}`);
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    // 사용자 id 는 인증이 확정한 값 하나만 넘긴다 (T-19-17). 가시성 필터는 RPC 조인 (D-06).
    const data: JournalOrderRow[] = await listTodayOrders(
      supabase,
      req.userId!,
      parsed.data.date,
    );
    // 코드베이스 규약: list 엔드포인트는 bare array (scanner/themes/news/chat 동일).
    res.json(data);
  } catch (e) {
    next(e);
  }
});
