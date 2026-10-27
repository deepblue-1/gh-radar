import type { SupabaseClient } from "@supabase/supabase-js";
import { kstDateIso, pnlRangeOf, type PnlGroupBy, type PnlRange, type PnlReport } from "@gh-radar/shared";

import { ApiError } from "../errors.js";

/**
 * Phase 36 D-17 ~ D-19 — 일자별 매매손익 **조회 전용** 서비스.
 *
 * 서비스롤 `SupabaseClient` 를 인자로 받는 순수 함수 모듈(`accum-report.ts` 규약 — 헬퍼는 공용화하지 않고 복제).
 *
 * ── 방어선 ──────────────────────────────────────────────────
 *   T-19-17  /me 는 인증된 `userId` 하나만 RPC 에 넘긴다(라우트가 requireAuth 로 확정한 값). 가시성은 RPC 안의
 *            `dma_visible_accounts` 조인이 정본 — 남의 계좌는 `groups: []`.
 *   D-17 ①   어드민은 전 계정 · 전 계좌 — 라우트 관문(requireAuth → requireAdmin)이 정본. 묶음 · 정렬(미상 맨 뒤 · KB → 교보)은 RPC 가 한다.
 *   T-19-01  RPC EXECUTE 는 service_role 전용(anon · authenticated 명시 REVOKE — 20261027210100).
 *   T-15-07  DB 오류 원문은 응답에 싣지 않는다(고정 문구 DB_ERROR). 원문은 `cause` 로 실어 errorHandler 가 warn 로그에만 남긴다.
 *
 * ★ Cloud Run → Supabase 왕복이 지연을 지배하므로 요청 하나 = RPC **1회**(묶음 × 일자 × 종목이 jsonb 한 덩이).
 *   응답은 RPC jsonb 그대로(shared `PnlReport` 키 = RPC 키) — 매퍼가 없다.
 * ★ 기간은 shared `pnlRangeOf(range, kstDateIso())` — 화면 캡션과 같은 계산(KST 오늘 포함).
 */

const DbError = (msg: string, cause: unknown) => new ApiError(500, "DB_ERROR", msg, cause);

/** PostgREST 오류에서 로그에 남길 필드만 — 객체 통째로 싣지 않는다. */
const causeOf = (e: { message?: string; code?: string; details?: string | null; hint?: string | null }) => ({
  code: e.code,
  message: e.message,
  details: e.details ?? undefined,
  hint: e.hint ?? undefined,
});
/** 응답 모양 위반 — 무엇이 왔는지(타입)만. */
const shapeCause = (what: string, v: unknown) => ({
  reason: `${what} 모양 위반`,
  type: Array.isArray(v) ? "array" : v === null ? "null" : typeof v,
});

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const FAIL = "매매손익 조회에 실패했습니다.";

/** RPC 결과 모양 검사 — 화면이 `groups.map` 을 바로 돈다. 배열이 아니면 렌더 예외 대신 500. */
function asReport(fn: string, data: unknown): PnlReport {
  if (!isObject(data)) throw DbError(FAIL, shapeCause(fn, data));
  if (!Array.isArray(data.groups)) throw DbError(FAIL, shapeCause(`${fn}.groups`, data.groups));
  return data as unknown as PnlReport;
}

/** /me 손익 탭 — 그 사용자가 볼 수 있는 계좌 한 벌(0~1 묶음). */
export async function getMyPnl(
  supabase: SupabaseClient,
  userId: string,
  accountNo: string,
  range: PnlRange,
): Promise<PnlReport> {
  const { from, to } = pnlRangeOf(range, kstDateIso());
  const { data, error } = await supabase.rpc("dma_pnl_daily_for_user", {
    p_user_id: userId,
    p_account_no: accountNo,
    p_from: from,
    p_to: to,
  });
  if (error) throw DbError(FAIL, causeOf(error));
  return asReport("dma_pnl_daily_for_user", data);
}

/** /admin/pnl — 전 계정(group=user) 또는 전 계좌(group=account) 묶음. */
export async function getAdminPnl(
  supabase: SupabaseClient,
  group: PnlGroupBy,
  range: PnlRange,
): Promise<PnlReport> {
  const { from, to } = pnlRangeOf(range, kstDateIso());
  const { data, error } = await supabase.rpc("dma_pnl_daily_for_admin", {
    p_from: from,
    p_to: to,
    p_group: group,
  });
  if (error) throw DbError(FAIL, causeOf(error));
  return asReport("dma_pnl_daily_for_admin", data);
}
