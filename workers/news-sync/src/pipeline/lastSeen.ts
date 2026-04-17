import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Phase 07 (R7) — 종목별 MAX(published_at) 사전 로드.
 *
 * 반환: Map<stock_code, iso_string>.
 * 미존재 종목은 Map 에 없음 → collectStockNews 가 null 로 폴백 → 7일 firstCutoff 사용.
 *
 * 실무 기준: codes ≤ ~200. in(codes) 로 전체 published_at 조회 후 JS 에서 reduce.
 * news_articles(stock_code, published_at DESC) 인덱스 활용 (20260417120100 migration).
 */
export async function loadLastSeenMap(
  supabase: SupabaseClient,
  codes: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (codes.length === 0) return out;

  const { data, error } = await supabase
    .from("news_articles")
    .select("stock_code, published_at")
    .in("stock_code", codes)
    .order("published_at", { ascending: false });
  if (error) throw error;

  for (const row of (data ?? []) as Array<{
    stock_code: string;
    published_at: string;
  }>) {
    if (!out.has(row.stock_code)) out.set(row.stock_code, row.published_at);
  }
  return out;
}
