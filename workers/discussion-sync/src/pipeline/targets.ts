import type { SupabaseClient } from "@supabase/supabase-js";

export interface DiscussionTarget {
  code: string;
  name: string;
}

/**
 * Phase 08 — discussion-sync 대상 종목 로드.
 * 합집합 (Phase 7 news-sync 패턴 1:1 복제):
 *   1) 최신 scan_id 의 top_movers.code
 *   2) watchlists.stock_code (전 유저 합산)
 * dedupe 후 stocks 마스터 존재하는 code + name 조회 (FK 위반 사전 차단).
 */
export async function loadTargets(
  supabase: SupabaseClient,
): Promise<DiscussionTarget[]> {
  // 1. 최신 scan_id 의 top_movers
  const { data: latestScan, error: e1 } = await supabase
    .from("top_movers")
    .select("scan_id")
    .order("scan_id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e1) throw e1;

  let moverCodes: string[] = [];
  const scanId = (latestScan as { scan_id?: string } | null)?.scan_id;
  if (scanId) {
    const { data: movers, error: e2 } = await supabase
      .from("top_movers")
      .select("code")
      .eq("scan_id", scanId);
    if (e2) throw e2;
    moverCodes = ((movers ?? []) as Array<{ code: string }>).map((r) => r.code);
  }

  // 2. watchlists
  const { data: watch, error: e3 } = await supabase
    .from("watchlists")
    .select("stock_code");
  if (e3) throw e3;
  const watchCodes = ((watch ?? []) as Array<{ stock_code: string }>).map(
    (r) => r.stock_code,
  );

  // 3. dedupe
  const codes = Array.from(new Set<string>([...moverCodes, ...watchCodes]));
  if (codes.length === 0) return [];

  // 4. stocks 마스터 FK 검증
  const { data: masters, error: e4 } = await supabase
    .from("stocks")
    .select("code, name")
    .in("code", codes);
  if (e4) throw e4;
  return ((masters ?? []) as Array<{ code: string; name: string }>).map((r) => ({
    code: r.code,
    name: r.name,
  }));
}
