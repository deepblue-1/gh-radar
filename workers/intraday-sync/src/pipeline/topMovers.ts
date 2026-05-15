import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntradayCloseUpdate } from "@gh-radar/shared";
import { logger } from "../logger";

/**
 * top_movers 재구성 — 매 cycle 등락률 상위 60 추출 + stale cleanup (DELETE + INSERT).
 *
 * ka10027 응답이 sort_tp=1 (상승률 내림차순) — 별도 정렬 불필요.
 * 음의 등락률 종목 제외 (changeRate > 0) — top "movers" 정의상 상승 종목만.
 * ETN (5/6/7xxxxx prefix) 제외 — 일반 주식만 노출. KRX master-sync 가 ETF/ETN 미수집이라
 *   bootstrapStocks 가 ETN 을 `security_group="주권"` placeholder 로 잘못 등록하는 한,
 *   security_group 화이트리스트로는 거를 수 없음. 코드 prefix 가 가장 확정적 식별자.
 *   (한국 ETN: 5xxxxx ~ 7xxxxx, 일반 주식: 0~4xxxxx. ETF 는 일반 주식과 코드 패턴 동일 →
 *   별도 master-sync 보강 필요, 추후 phase 처리.)
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

const ETN_PREFIX_RE = /^[567]/;

export async function rebuildTopMovers(
  supabase: SupabaseClient,
  step1Updates: IntradayCloseUpdate[],
  marketMap: Map<string, "KOSPI" | "KOSDAQ">,
): Promise<{ count: number }> {
  // 1. 상위 60 추출 (이미 등락률 내림차순) + ETN 제외
  const top = step1Updates
    .filter((u) => u.changeRate !== null && u.changeRate > 0)
    .filter((u) => !ETN_PREFIX_RE.test(u.code))
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
