// workers/intraday-sync/src/pipeline/hotSet.ts
//
// STEP 2 hot set 산출. RESEARCH §11 + D-11.
//   hot set = (STEP1 top N) ∪ (watchlists.stock_code unique 전체)
//
// ka10027 응답이 sort_tp=1 (상승률 내림차순) 이므로 추가 정렬 불필요 → slice(0, N).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntradayCloseUpdate } from "@gh-radar/shared";

export async function computeHotSet(
  supabase: SupabaseClient,
  step1Updates: IntradayCloseUpdate[],
  topN: number,
): Promise<string[]> {
  // 1. STEP1 응답에서 top N (이미 등락률 내림차순)
  const topMovers = step1Updates.slice(0, topN).map((u) => u.code);

  // 2. watchlists 전체 unique stock_code
  const { data: watchlistRows, error } = await supabase
    .from("watchlists")
    .select("stock_code");

  if (error) throw error;

  const watchlistCodes = (watchlistRows ?? []).map(
    (r: { stock_code: string }) => r.stock_code,
  );

  // 3. 합집합 (Set 중복 제거)
  const union = new Set<string>([...topMovers, ...watchlistCodes]);

  return Array.from(union);
}
