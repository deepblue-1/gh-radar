import type { SupabaseClient } from "@supabase/supabase-js";
import type { JournalOrderDbRow, JournalOrderRow } from "@gh-radar/shared";
import { kstDateIso, toJournalOrderRow } from "@gh-radar/shared";

import { ApiError } from "../errors.js";

/**
 * Phase 19 D-05 — 「오늘 주문」 **조회 전용** 서비스. 새 계좌 기준 테이블(`dma_account_orders`)만
 * 읽는다. 구 `dma_orders` 는 동결됐고 여기서 조회하지 않는다.
 *
 * 서비스롤 `SupabaseClient` 를 인자로 받는 순수 함수 모듈(`chat-history.ts` 규약).
 *
 * ── 방어선 (Phase 19 기준) ──────────────────────────────────
 *   D-06     가시성 필터는 RPC `dma_journal_orders_for_user` 안의 조인
 *            (`user_id → dma_credentials.dma_user_id → dma_account_access → 계좌`)이 정본이다.
 *            server 는 행을 거르지 않고, 거를 근거(계좌 매핑)도 갖지 않는다.
 *   T-19-17  이 함수는 **인증된 `userId` 하나만** RPC 에 넘긴다 — 라우트가 `requireAuth` 로 확정한
 *            `req.userId` 다. 쿼리·바디에서 사용자 id 를 받지 않는다.
 *   T-19-01  조회 RPC 의 EXECUTE 는 service_role 전용이다(anon·authenticated 명시 REVOKE). 브라우저가
 *            PostgREST 로 남의 `p_user_id` 를 넣어 직접 부를 수 없다.
 *   T-19-08  응답에 주문자(`dma_user_id`)가 없다 — RPC 가 공개 컬럼 25종만 내고, 공유 매퍼
 *            `toJournalOrderRow` 가 그 컬럼만 옮긴다.
 *
 * (구 T-15-01 「`WHERE user_id` 명시 필터가 서버 경로의 실제 방어선」 은 `dma_orders` 시절의 사실이다.
 *  새 테이블에는 `user_id` 가 없다 — 행은 사용자가 아니라 계좌 기준이다.)
 *
 * ★ Cloud Run → Supabase 왕복이 지연을 지배하므로 한 요청 = RPC **1회**다. 종목 단축코드도 RPC 가
 *   `stocks` 조인으로 채워 온다.
 *
 * ★ **쓰기 함수가 없다.** 저널 행은 relay 관찰자 기록기(19-05)만 `dma_journal_apply` 로 쓴다.
 */

const DbError = (msg: string) => new ApiError(500, "DB_ERROR", msg);

/**
 * 하루치 주문 목록 (새로고침 후 복원). 기본값은 **KST 오늘**이다 — 저널 행의 `trade_date` 가
 * 게이트웨이 KST 거래일이라 UTC 구간 변환이 필요 없다.
 */
export async function listTodayOrders(
  supabase: SupabaseClient,
  userId: string,
  date?: string,
): Promise<JournalOrderRow[]> {
  const tradeDate = resolveTradeDate(date);
  const { data, error } = await supabase.rpc("dma_journal_orders_for_user", {
    p_user_id: userId,
    p_trade_date: tradeDate,
  });
  if (error) throw DbError("주문 목록 조회에 실패했습니다.");
  return ((data ?? []) as JournalOrderDbRow[]).map(toJournalOrderRow);
}

/**
 * `YYYY-MM-DD`(KST) 검증 → 그대로 거래일. 형식은 zod 가 이미 봤지만 `2026-13-45` 같은
 * **형식은 맞고 날짜가 아닌 값**은 여기서만 걸린다(그대로 RPC 로 넘기면 Postgres 가 `date` 캐스트를
 * 거부해 400 이어야 할 요청이 500 이 된다). `2026-02-30` 처럼 JS `Date` 가 조용히 3월로 넘기는 값도
 * KST 로 다시 내린 날짜가 입력과 달라 400 이다.
 */
export function resolveTradeDate(date?: string): string {
  const day = date ?? kstDateIso();
  const start = new Date(`${day}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime()) || kstDateIso(start) !== day) {
    throw new ApiError(400, "VALIDATION_FAILED", "date: 올바른 날짜가 아닙니다.");
  }
  return day;
}
