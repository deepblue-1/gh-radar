import type { RequestHandler } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError, DmaUnmapped } from "../errors.js";

/**
 * quick-261009-c43 D-01 — 「DMA 매핑 사용자」 관문. 반드시 `requireAuth()` **뒤에** 체인한다
 * (`req.userId` 는 requireAuth 가 토큰 검증 뒤 싣는다). 소비처: 챗 라우트 전부(`routes/chat.ts`).
 *
 * 판정 원천: 상한가 보고서 RPC 게이트(`limitup_report_for_user` 안의 `EXISTS (… dma_visible_accounts(p_user_id))`,
 * Phase 28 D-10)와 **같은 함수** `dma_visible_accounts(p_user_id)` — 1행 이상이면 통과. Phase 29 D-21
 * 「AI 애널리스트는 DMA 연결 사용자 전용 · DMA_UNMAPPED 403 게이트 유지」 가 전제하던 게이트를 이 파일이 실제로 만든다.
 *   - 0행 · userId 없음 → 403 `DMA_UNMAPPED`(errors.ts 정본 — 상한가 보고서와 같은 문구).
 *   - RPC 오류 · 모양 위반 → 500 `DB_ERROR`(고정 문구 · 원문은 cause 로 errorHandler warn 로그에만).
 *     **권한 없음으로 위장하지 않는다** — DB 가 흔들릴 때 「DMA 미연결」 을 보면 원인을 엉뚱한 데서 찾는다(requireAdmin 과 같은 이유).
 *
 * T-19-17  RPC 에 넘기는 사용자는 requireAuth 가 확정한 `req.userId` 하나뿐이다(요청 본문 · 쿼리 값 금지).
 * T-19-01  `dma_visible_accounts` EXECUTE 는 service_role 전용 — `req.app.locals.supabase`(service role)로만 부른다.
 *
 * 웹 `DmaGate`(/chat) · 진입 버튼 숨김은 **표시 장치**다. 실제 차단은 여기다.
 * Cloud Run → Supabase 왕복 1회가 요청마다 더해지지만 수용한다 — 챗은 LLM 호출 지연이 지배한다.
 */
export function requireDmaMapped(): RequestHandler {
  return async (req, _res, next) => {
    try {
      const userId = req.userId;
      if (!userId) {
        next(DmaUnmapped());
        return;
      }

      const supabase = req.app.locals.supabase as SupabaseClient;
      const { data, error } = await supabase.rpc("dma_visible_accounts", { p_user_id: userId });
      if (error) {
        throw new ApiError(500, "DB_ERROR", "권한 확인에 실패했습니다.", {
          code: error.code,
          message: error.message,
          details: error.details ?? undefined,
          hint: error.hint ?? undefined,
        });
      }
      if (!Array.isArray(data)) {
        throw new ApiError(500, "DB_ERROR", "권한 확인에 실패했습니다.", {
          reason: "dma_visible_accounts 모양 위반",
          type: data === null ? "null" : typeof data,
        });
      }
      if (data.length === 0) {
        next(DmaUnmapped());
        return;
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}
