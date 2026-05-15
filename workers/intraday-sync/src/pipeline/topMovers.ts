import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntradayCloseUpdate } from "@gh-radar/shared";
import { logger } from "../logger";

/**
 * top_movers 재구성 — 매 cycle 등락률 상위 100 추출 + stale cleanup (DELETE + INSERT).
 *
 * ka10027 응답이 sort_tp=1 (상승률 내림차순) — 별도 정렬 불필요.
 * 음의 등락률 종목 제외 (changeRate > 0) — top "movers" 정의상 상승 종목만.
 *
 * **eligibleCodes 화이트리스트** — stocks 마스터의 security_group 이 일반 주식 계열
 *   ('주권','외국주권','주식예탁증권','부동산투자회사','투자회사','사회간접자본투융자회사')
 *   인 종목만 통과. ETF/ETN/ELW 는 master-sync 가 `/etp/*` endpoint 로 정확히 등록하므로
 *   security_group='ETF'/'ETN'/'ELW' 로 식별 → 화이트리스트에서 자동 제외. (이전 ETN
 *   prefix `/^[567]/` 휴리스틱은 master-sync ETP 통합 후 불필요 — security_group 기반이
 *   더 견고하고 ETF 까지 커버.)
 *
 * stale cleanup 패턴 (D-21): top_movers 는 매 cycle 재구성 — 누적 X.
 * stock_quotes 는 누적 (D-20) — 다른 정책.
 *
 * top_movers schema (20260415120000_split_stocks_master_quotes_movers.sql):
 *   - code text PRIMARY KEY
 *   - name text NOT NULL  → IntradayCloseUpdate.name (옵셔널) fallback code
 *   - market text NOT NULL CHECK (KOSPI|KOSDAQ) → marketMap, fallback KOSPI
 *   - rank int (nullable)
 *   - ranked_at, scan_id, updated_at
 *
 * DELETE pattern: `.neq("code", "")` — `code` 가 PK NOT NULL 이므로 항상 매칭 → 전체 삭제.
 * (PLAN 원안 `.gte("rank", 0)` 는 rank=NULL 회피 + 전체 매칭 보장 X)
 */
const TOP_N = 100;

export async function rebuildTopMovers(
  supabase: SupabaseClient,
  step1Updates: IntradayCloseUpdate[],
  marketMap: Map<string, "KOSPI" | "KOSDAQ">,
  eligibleCodes: Set<string>,
): Promise<{ count: number }> {
  // 1. 상위 100 추출 (이미 등락률 내림차순) + 화이트리스트 필터
  const top = step1Updates
    .filter((u) => u.changeRate !== null && u.changeRate > 0)
    .filter((u) => eligibleCodes.has(u.code))
    .slice(0, TOP_N);

  if (top.length === 0) {
    logger.info("rebuildTopMovers — no positive movers");
  }

  const now = new Date().toISOString();
  const rows = top.map((u, idx) => ({
    code: u.code,
    name: u.name ?? u.code,
    market: marketMap.get(u.code) ?? ("KOSPI" as const),
    rank: idx + 1,
    ranked_at: now,
    updated_at: now,
  }));

  // 2. DELETE 기존 row (stale cleanup) — neq("code", "") 로 전체 row 매칭
  const { error: delErr } = await supabase.from("top_movers").delete().neq("code", "");
  if (delErr) {
    logger.error({ err: delErr }, "rebuildTopMovers DELETE failed");
    throw delErr;
  }

  // 3. INSERT 새 60 row
  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("top_movers").insert(rows);
    if (insErr) {
      logger.error(
        { err: insErr, count: rows.length },
        "rebuildTopMovers INSERT failed",
      );
      throw insErr;
    }
  }

  return { count: rows.length };
}
