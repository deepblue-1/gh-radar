import type { SupabaseClient } from "@supabase/supabase-js";

export interface NewsTarget {
  code: string;
  name: string;
}

/**
 * Phase 07 — news-sync 대상 종목 로드.
 * 합집합:
 *   1) 최신 scan_id 의 top_movers.code (Phase 06.1 스키마 — Pitfall: stock_code 가 아니라 code)
 *   2) watchlists.stock_code (전 유저 합산)
 * dedupe 후 stocks 마스터 존재하는 code + name 조회 (FK 위반 사전 차단).
 */
export async function loadTargets(
  supabase: SupabaseClient,
): Promise<NewsTarget[]> {
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
    moverCodes = ((movers ?? []) as Array<{ code: string }>).map(
      (r) => r.code,
    );
  }

  // 2. watchlists (전 유저 stock_code 수집)
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

  // 4. stocks 마스터 존재 검증 + name 조회 (FK 위반 사전 차단)
  const { data: masters, error: e4 } = await supabase
    .from("stocks")
    .select("code, name")
    .in("code", codes);
  if (e4) throw e4;
  return ((masters ?? []) as Array<{ code: string; name: string }>).map(
    (r) => ({ code: r.code, name: r.name }),
  );
}
