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
 *
 * 2026-11-12: 시가총액 상위 보통주(LARGE_CAP_COUNT)도 대상에 넣는다. 급등 목록에서 빠지고
 * 아무도 관심종목에 담지 않은 대형주(NAVER · 현대차 · 카카오 …)는 네이버 뉴스 수집이 통째로
 * 멈췄다. 이들은 cap 등급으로 장중 30분마다 한 번 순환한다(cadence.ts).
 */
export const LARGE_CAP_COUNT = 50;

/** 시총 정렬 후보를 넉넉히 읽는다 — ETF · 우선주 · 상장폐지를 걸러도 LARGE_CAP_COUNT 를 채우게. */
const LARGE_CAP_SCAN = LARGE_CAP_COUNT * 3;

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

  // 3. 시가총액 상위 후보 (순서 = 시총 내림차순)
  const { data: caps, error: e5 } = await supabase
    .from("stock_quotes")
    .select("code")
    .not("market_cap", "is", null)
    .order("market_cap", { ascending: false })
    .limit(LARGE_CAP_SCAN);
  if (e5) throw e5;
  const capCandidates = ((caps ?? []) as Array<{ code: string }>).map((r) => r.code);

  // 4. dedupe
  const codes = Array.from(
    new Set<string>([...movers.map((m) => m.code), ...watchCodes, ...capCandidates]),
  );
  if (codes.length === 0) return [];

  // 5. stocks 마스터 존재 검증 + name 조회 (FK 위반 사전 차단)
  const { data: masters, error: e4 } = await supabase
    .from("stocks")
    .select("code, name, security_type, is_delisted")
    .in("code", codes);
  if (e4) throw e4;
  const masterRows = (masters ?? []) as Array<{
    code: string;
    name: string;
    security_type: string | null;
    is_delisted: boolean | null;
  }>;
  return buildTargetRecords(
    movers,
    watchCodes,
    masterRows,
    pickLargeCaps(capCandidates, masterRows, LARGE_CAP_COUNT),
  );
}

/**
 * 순수: 시총 순 후보에서 상장 중인 보통주만 앞에서 n 개.
 * ETF(KODEX 200 등) · 우선주는 제외한다 — 종목명 검색이 본주 기사와 겹치거나 뜻이 없다.
 */
export function pickLargeCaps(
  capCandidates: string[],
  masters: Array<{ code: string; security_type?: string | null; is_delisted?: boolean | null }>,
  n: number,
): string[] {
  const ok = new Set(
    masters
      .filter((m) => m.security_type === "보통주" && m.is_delisted !== true)
      .map((m) => m.code),
  );
  const out: string[] = [];
  for (const c of capCandidates) {
    if (out.length >= n) break;
    if (ok.has(c) && !out.includes(c)) out.push(c);
  }
  return out;
}

/**
 * 순수 조립: movers(code, rank) ∪ watchCodes 를 stocks 마스터로 거른 TargetRecord[].
 *  - 같은 code 가 movers 에 여러 번 있으면 작은 rank 를 쓴다(null 은 무시).
 *  - watch 에만 있으면 rank null + watched true.
 *  - masters 에 없는 code 는 제외한다(FK 사전 차단 유지).
 *  - largeCaps 에만 있는 code 는 rank null · watched false · largeCapOnly true.
 *    movers · watch 에도 있으면 그쪽 등급을 따르고 largeCapOnly 를 달지 않는다.
 * 순서는 movers 등장 순서 → watch 등장 순서 → largeCaps 순서.
 */
export function buildTargetRecords(
  movers: Array<{ code: string; rank: number | null }>,
  watchCodes: string[],
  masters: Array<{ code: string; name: string }>,
  largeCaps: string[] = [],
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
  const capOnly = new Set<string>();
  for (const c of largeCaps) {
    if (!rankByCode.has(c)) {
      rankByCode.set(c, null);
      order.push(c);
      capOnly.add(c);
    }
  }

  const out: TargetRecord[] = [];
  for (const code of order) {
    const name = nameByCode.get(code);
    if (name === undefined) continue;
    const rec: TargetRecord = {
      code,
      name,
      rank: rankByCode.get(code) ?? null,
      watched: watched.has(code),
    };
    if (capOnly.has(code)) rec.largeCapOnly = true;
    out.push(rec);
  }
  return out;
}
