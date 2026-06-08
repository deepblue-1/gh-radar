// workers/intraday-sync/src/pipeline/hotSet.ts
//
// STEP 2 hot set 산출. RESEARCH §11 + D-11.
//   hot set = (STEP1 top N) ∪ (watchlists.stock_code unique 전체)
//
// ka10027 응답(sort_tp=1, 상승+보합)의 순서에 의존하지 않도록 changeRate 내림차순 명시
// 정렬 후 slice(0, N). null changeRate 는 정렬 비교에서 가장 낮은 값으로 취급(후순위).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntradayCloseUpdate } from "@gh-radar/shared";

export async function computeHotSet(
  supabase: SupabaseClient,
  step1Updates: IntradayCloseUpdate[],
  topN: number,
): Promise<string[]> {
  // 1. STEP1 응답을 changeRate 내림차순 정렬 → top N 선정.
  //    키움 응답 순서에 의존하지 않도록 명시 정렬(견고).
  const sorted = [...step1Updates].sort((a, b) => {
    const ar = a.changeRate ?? -Infinity;
    const br = b.changeRate ?? -Infinity;
    return br - ar;
  });
  const topMovers = sorted.slice(0, topN).map((u) => u.code);

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
