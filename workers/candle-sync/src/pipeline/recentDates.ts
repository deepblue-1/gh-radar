import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../logger";

/**
 * stock_daily_ohlcv 에 적재된 최근 distinct 거래일 N 개 (내림차순).
 *
 * D-fh2-03 (2026-08-20): recover 의 강제 재적재 대상 일자를 뽑는다.
 *   findMissingDates 는 "row count < 활성 종목 × 0.9" 로 결측을 판정하는데,
 *   intraday-sync 가 매 영업일 전 종목 row 를 미리 만들어 두기 때문에 이 조건이
 *   구조적으로 영영 참이 되지 않는다 → recover 의 KRX overlay 가 한 번도 작동한 적이 없었다.
 *   결측 판정과 무관하게 최근 N 영업일을 KRX 공식값으로 덮어써 그 결함을 보완한다.
 *
 * 조회 패턴은 missingDates.ts Step 2 와 동일 — 20일 창에서 date 를 내림차순으로 받아
 * 클라이언트측 Set dedupe (Supabase JS v2 는 raw DISTINCT 를 지원하지 않는다).
 *
 * error 는 로그 후 throw — 호출부(recover.ts)가 fail-open 책임을 진다.
 */
export async function fetchRecentTradingDates(
  supabase: SupabaseClient,
  n: number,
): Promise<string[]> {
  // 0 이하 = 강제 재적재 비활성 (킬 스위치). 불필요한 쿼리도 쏘지 않는다.
  if (n <= 0) return [];

  const today = new Date();
  const twentyDaysAgo = new Date(today);
  twentyDaysAgo.setDate(today.getDate() - 20);
  const sinceIso = twentyDaysAgo.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("stock_daily_ohlcv")
    .select("date")
    .gte("date", sinceIso)
    .order("date", { ascending: false });
  if (error) {
    logger.error({ err: error, sinceIso }, "fetchRecentTradingDates 조회 실패");
    throw error;
  }

  const seen = new Set<string>();
  const dates: string[] = [];
  for (const r of data ?? []) {
    const d = (r as { date: string }).date;
    if (seen.has(d)) continue;
    seen.add(d);
    dates.push(d);
    if (dates.length >= n) break;
  }

  logger.info({ sinceIso, requested: n, found: dates }, "fetchRecentTradingDates complete");
  return dates;
}
