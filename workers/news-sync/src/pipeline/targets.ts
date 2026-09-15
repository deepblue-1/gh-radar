import type { SupabaseClient } from "@supabase/supabase-js";
import type { TargetRecord } from "./cadence.js";

/**
 * Phase 07 — news-sync 대상 종목 로드.
 * 합집합:
 *   1) 최신 scan_id 의 top_movers.code (Phase 06.1 스키마 — Pitfall: stock_code 가 아니라 code)
 *   2) watchlists.stock_code (전 유저 합산)
 * dedupe 후 stocks 마스터 존재하는 code + name 조회 (FK 위반 사전 차단).
 *
 * quick-260915-h3p: top_movers.rank 를 함께 읽는다 — 장시간 tiered 모드에서
 * hot 등급(rank ≤ 30 ∪ 관심종목) 판정에 쓴다(pipeline/cadence.ts).
 */
export async function loadTargets(
  supabase: SupabaseClient,
): Promise<TargetRecord[]> {
  // 1. 최신 scan_id 의 top_movers
  const { data: latestScan, error: e1 } = await supabase
    .from("top_movers")
    .select("scan_id")
    .order("scan_id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e1) throw e1;

  let movers: Array<{ code: string; rank: number | null }> = [];
  const scanId = (latestScan as { scan_id?: string } | null)?.scan_id;
  if (scanId) {
    const { data, error: e2 } = await supabase
      .from("top_movers")
      .select("code, rank")
      .eq("scan_id", scanId);
    if (e2) throw e2;
    movers = (data ?? []) as Array<{ code: string; rank: number | null }>;
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
  const codes = Array.from(
    new Set<string>([...movers.map((m) => m.code), ...watchCodes]),
  );
  if (codes.length === 0) return [];

  // 4. stocks 마스터 존재 검증 + name 조회 (FK 위반 사전 차단)
  const { data: masters, error: e4 } = await supabase
    .from("stocks")
    .select("code, name")
    .in("code", codes);
  if (e4) throw e4;
  return buildTargetRecords(
    movers,
    watchCodes,
    (masters ?? []) as Array<{ code: string; name: string }>,
  );
}

/**
 * 순수 조립: movers(code, rank) ∪ watchCodes 를 stocks 마스터로 거른 TargetRecord[].
 *  - 같은 code 가 movers 에 여러 번 있으면 작은 rank 를 쓴다(null 은 무시).
 *  - watch 에만 있으면 rank null + watched true.
 *  - masters 에 없는 code 는 제외한다(FK 사전 차단 유지).
 * 순서는 movers 등장 순서 → watch 등장 순서.
 */
export function buildTargetRecords(
  movers: Array<{ code: string; rank: number | null }>,
  watchCodes: string[],
  masters: Array<{ code: string; name: string }>,
): TargetRecord[] {
  const nameByCode = new Map(masters.map((m) => [m.code, m.name]));
  const watched = new Set(watchCodes);
  const rankByCode = new Map<string, number | null>();
  const order: string[] = [];

  for (const m of movers) {
    if (!rankByCode.has(m.code)) {
      rankByCode.set(m.code, m.rank ?? null);
      order.push(m.code);
      continue;
    }
    const prev = rankByCode.get(m.code) ?? null;
    if (m.rank !== null && m.rank !== undefined && (prev === null || m.rank < prev)) {
      rankByCode.set(m.code, m.rank);
    }
  }
  for (const c of watchCodes) {
    if (!rankByCode.has(c)) {
      rankByCode.set(c, null);
      order.push(c);
    }
  }

  const out: TargetRecord[] = [];
  for (const code of order) {
    const name = nameByCode.get(code);
    if (name === undefined) continue;
    out.push({
      code,
      name,
      rank: rankByCode.get(code) ?? null,
      watched: watched.has(code),
    });
  }
  return out;
}
