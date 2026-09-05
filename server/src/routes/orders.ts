import { Router, type Router as RouterT } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateOrderResponse, DmaOrderRow } from "@gh-radar/shared";

import { requireAuth } from "../middleware/require-auth.js";
import { OrderPostBody, OrderListQuery } from "../schemas/orders.js";
import { ApiError, DmaNotAllowed, RelayNotConfigured, ValidationFailed } from "../errors.js";
import { logger } from "../logger.js";
import type { RelayClient } from "../services/relay-client.js";
import {
  insertOrderRequest,
  isDmaAllowed,
  listTodayOrders,
  patchFromRelayResult,
  resolveIsinAndMarket,
  updateOrderResult,
} from "../services/dma-orders.js";

/**
 * Phase 15 Plan 17 — DMA 주문 REST (RELAY-02, D-08 / D-12 / D-20 / D-22 / D-24).
 *
 * - POST /  : 인증 → allowlist → 형식 → 종목키 → 감사 → 릴레이 → 결과 기록
 * - GET  /  : 하루치 주문 목록 (새로고침 복원, bare array)
 *
 * **브라우저와 relay 사이의 유일한 쓰기 경로**다. 공인 노출면을 443/wss 하나로 유지하기
 * 위해 브라우저 → VM 직결을 만들지 않는다 (D-08). wss 에 주문 경로를 두지 않는 이유도
 * 같다 — 감사·rate-limit·`requireAuth` 를 두 벌 구현하게 된다.
 *
 * 라우터는 얇게 두고 조회·기록은 `services/dma-orders.ts`, relay 왕복과 응답 3분류는
 * `services/relay-client.ts` 가 맡는다 (`chat.ts` 규약).
 *
 * ── 방어선 배치 ────────────────────────────────────────────────
 *   T-15-03  `requireAuth()` — 두 라우트 모두. 미인증 401
 *   T-15-01  ① allowlist = `dma_credentials` 행 존재(403)
 *            ② `accountNo ∈ 세션 계좌 목록` **최종 판정은 relay**(403 을 그대로 전달)
 *            ③ GET 은 `WHERE user_id` 명시 필터
 *   T-15-50  종목 키를 바디에서 받지 않고 `stocks` 에서 조회해 채운다
 *   T-15-48  relay 202(`ORDER_TIMEOUT`)를 실패로 단정하지 않는다
 *   T-15-07  에러는 전부 `next(e)` — `errorHandler` 가 프로덕션에서 원문을 감춘다
 */

/**
 * 라우트 전용 rate-limit — 전역 `/api`(200/60s) 위에 얹는다 (S-2).
 *
 * 목적이 **비용이 아니라 오주문 방어**라 챗(20/60s)보다 촘촘하게 잡되, 호가를 보며
 * 분할 주문을 내는 정상 사용(연타)은 막지 않는 30/60s 로 둔다.
 *
 * 키는 IP 가 아니라 **사용자**다 — 오주문은 계정 단위 사건이고, 같은 사무실·같은 모바일
 * 캐리어 NAT 뒤의 두 사용자가 서로의 한도를 갉아먹으면 안 된다. `requireAuth()` **뒤**에
 * 두어야 `req.userId` 가 채워져 있으므로 미들웨어 순서를 바꾸지 말 것 — 순서가 뒤집히면
 * 조용히 전원이 IP 한도를 공유하게 된다(그래서 fallback 에 그 사실을 남긴다).
 */
const ordersRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? ipKeyGenerator(req.ip ?? "", 64),
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "주문 요청이 너무 잦아요. 잠시 후 다시 시도해주세요.",
      },
    });
  },
});

export const ordersRouter: RouterT = Router();

// --- POST / — 주문 접수 ---
ordersRouter.post("/", requireAuth(), ordersRateLimit, async (req, res, next) => {
  const userId = req.userId!;
  let orderRowId: string | null = null;
  const supabase = req.app.locals.supabase as SupabaseClient;

  try {
    // ① relay 미설정 = 주문 기능이 꺼져 있다. 503 (설정 부재), 런타임 도달 실패는 502.
    const relayClient = req.app.locals.relayClient as RelayClient | undefined;
    if (!relayClient) throw RelayNotConfigured();

    // ② 형식만 본다 — 금액·수량 상한 없음 (D-20).
    const parsed = OrderPostBody.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw ValidationFailed(`${issue.path.join(".")}: ${issue.message}`);
    }
    const body = parsed.data;

    // ③ allowlist (D-12) — `dma_credentials` 매핑 행이 있는가. 암호문은 읽지 않는다.
    if (!(await isDmaAllowed(supabase, userId))) throw DmaNotAllowed();

    // ④ 종목 키는 **서버가 채운다** (D-28 / T-15-50). 브라우저 입력을 믿지 않는다.
    const { isin, market } = await resolveIsinAndMarket(supabase, body.code);

    // ⑤ relay 를 부르기 **전에** 감사 기록을 남긴다. 반환 id 가 relay 상관의 1순위 키다.
    orderRowId = await insertOrderRequest(supabase, userId, {
      accountNo: body.accountNo,
      isin,
      code: body.code,
      exchange: body.exchange,
      market,
      side: body.side,
      orderType: body.orderType,
      orgOrderNo: body.orgOrderNo,
      qty: body.qty,
      price: body.price,
    });

    // ⑥ 릴레이. 계좌 소유권의 **최종 판정은 relay** 가 세션 계좌 목록으로 한다
    //    (T-15-01) — 여기서 브라우저가 준 계좌 목록으로 2차 검증을 흉내 내면 더 약한
    //    검사가 하나 늘 뿐이다. 서버는 형식만 보고 relay 403 을 그대로 전달한다.
    const result: CreateOrderResponse = await relayClient.postOrder({
      userId,
      orderRowId,
      isin,
      exchange: body.exchange,
      market,
      side: body.side,
      orderType: body.orderType,
      orgOrderNo: body.orgOrderNo,
      qty: body.qty,
      price: body.price,
      accountNo: body.accountNo,
    });

    // ⑦ 결과 기록 후 응답. 기록 실패는 사용자 응답을 바꾸지 않는다(주문은 이미 나갔다).
    await updateOrderResult(supabase, userId, orderRowId, patchFromRelayResult(result));
    res.json(result);
  } catch (e) {
    if (orderRowId) await recordFailure(supabase, userId, orderRowId, e);
    next(e);
  }
});

/**
 * 감사 기록 마무리 — relay 왕복이 결과 없이 끝났을 때 요청 행을 `requested` 로
 * 방치하지 않는다. 그대로 두면 오늘 주문 목록에 **영원히 접수 중인 주문**이 남는다.
 *
 * 두 갈래뿐이고, 그 구분이 이 함수의 존재 이유다:
 *   `ORDER_TIMEOUT`  → `timeout`  = **결과를 모른다.** 나갔을 수도 있다
 *   그 외            → `rejected` = 보내기 전에 끝났다(형식·권한·세션·연결 실패)
 * 둘을 합치면 사용자는 "안 나간 주문"과 "모르는 주문"을 구별할 수 없게 되고, 그것이
 * 곧 재주문으로 인한 중복 체결이다 (Pitfall 9).
 */
async function recordFailure(
  supabase: SupabaseClient,
  userId: string,
  orderRowId: string,
  err: unknown,
): Promise<void> {
  const code = err instanceof ApiError ? err.code : "INTERNAL_ERROR";
  const timedOut = code === "ORDER_TIMEOUT";
  try {
    await updateOrderResult(supabase, userId, orderRowId, {
      status: timedOut ? "timeout" : "rejected",
      message: err instanceof ApiError ? err.message : undefined,
    });
  } catch (dbErr) {
    // 조용히 삼키지 않는다 — 감사 기록 결손은 사후 추적 불가로 이어진다 (S-5).
    logger.error({ err: dbErr, orderRowId, code }, "[orders] 주문 결과 기록 실패");
  }
}

// --- GET / — 하루치 주문 목록 (D-24) ---
ordersRouter.get("/", requireAuth(), async (req, res, next) => {
  try {
    const parsed = OrderListQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw ValidationFailed(`${issue.path.join(".")}: ${issue.message}`);
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    // `WHERE user_id` 명시 필터는 서비스 계층이 건다 (T-15-01).
    const data: DmaOrderRow[] = await listTodayOrders(
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
