import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SettlementView } from "@gh-radar/shared";

import { requireAuth } from "../middleware/require-auth.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { logger } from "../logger.js";
import { readSettlement } from "../services/settlement-budget.js";

/**
 * Phase 44 — 어드민 정산(`/admin/settlement`) 라우트.
 *
 * - GET /settlement : 계좌 4개의 예수금(D-03 · 계좌 메뉴와 같은 판정) · 거래 기록 · 정산 기록(`SettlementView`).
 *   RPC `admin_settlement_raw` 1회 ∥ relay 예수금 읽기 → relay 로 읽은 값은 RPC `settlement_record_reads` 로 DB 에 남긴다(D-04).
 *   기록이 실패해도 응답은 막지 않는다 — 방금 읽은 값으로 200 + 경고 로그 한 줄(다음 조회 때 다시 기록된다).
 *   기록은 응답 뒤로 미루지 않는다(Cloud Run 은 요청 밖 CPU 가 제한돼 기록이 사라질 수 있다).
 *
 * ── 방어선 ──────────────────────────────────────────────────
 *   T-15-03  `requireAuth()` — 미인증 401.
 *   D-18     `requireAdmin()` — DB role 을 매 요청 조회. admin 이 아니면 403 · RPC 0회 · relay 0회.
 *            관문은 `/settlement` 경로에만 건다 — 이 라우터는 adminRouter 앞에 마운트되므로(app.ts) 전체에 걸면 다른 어드민
 *            요청도 역할 조회를 한 번 더 한다.
 *   권한     정산 표 · RPC 는 service_role 전용(anon · authenticated 명시 REVOKE) — 이 라우터가 유일한 창구.
 *   T-15-07  에러는 전부 `next(e)` — `errorHandler` 가 프로덕션에서 원문을 감춘다. 경고 로그엔 계좌 키 · 오류 코드만(계좌번호 · 금액 없음).
 */

export const adminSettlementRouter: RouterT = Router();

adminSettlementRouter.use("/settlement", requireAuth(), requireAdmin());

adminSettlementRouter.get("/settlement", async (req, res, next) => {
  try {
    const { raw, accounts, reads, nowIso } = await readSettlement(req);
    if (reads.length > 0) {
      const supabase = req.app.locals.supabase as SupabaseClient;
      let code: string | null = null;
      let failed = false;
      try {
        const { error } = await supabase.rpc("settlement_record_reads", { p_reads: reads });
        if (error) {
          failed = true;
          code = (error as { code?: string }).code ?? null;
        }
      } catch {
        failed = true;
      }
      if (failed) {
        logger.warn(
          { settlement: { op: "record-reads", accounts: reads.map((r) => r.accKey), code } },
          "[admin] 정산 읽은 예수금 기록 실패 — 응답은 방금 읽은 값으로",
        );
      }
    }
    const body: SettlementView = { now: nowIso, accounts, ledger: raw.ledger, settles: raw.settles };
    res.json(body);
  } catch (e) {
    next(e);
  }
});
