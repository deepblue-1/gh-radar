import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../logger";

/**
 * recover mode 의 결측 일자 감지.
 *
 * RESEARCH §3.1 SQL — 최근 N 영업일 중 row count < (활성 stocks × threshold) 인 일자.
 *
 * SQL strategy: Supabase JS client 의 .rpc 또는 raw select 로 N+1 쿼리 수행.
 *   1. active count = `SELECT COUNT(*) FROM stocks WHERE is_delisted = false`
 *   2. recent dates = `SELECT DISTINCT date FROM stock_daily_ohlcv WHERE date >= today - 20d ORDER BY date DESC LIMIT lookback`
 *   3. daily counts = `SELECT COUNT(*) FROM stock_daily_ohlcv WHERE date = X`
 *   4. filter: count < (active × threshold) → 결측 일자
 *
 * 본 구현은 raw select + 클라이언트측 비교 (Supabase JS 가 raw SQL 제한적이라 N+1 패턴).
 *
 * @param opts.lookback   영업일 수 (기본 10, RESEARCH §3.2)
 * @param opts.threshold  활성 비율 임계 (기본 0.9, RESEARCH §3.2)
 * @param opts.maxCalls   상한 (기본 20, RESEARCH §3.2 — calls 폭증 방지)
 * @returns 결측 일자 ISO string[] — descending, max `maxCalls` length
 */
export async function findMissingDates(
  supabase: SupabaseClient,
  opts: { lookback: number; threshold: number; maxCalls: number },
): Promise<string[]> {
  // Step 1: 활성 stocks 수
  const { count: activeCountRaw, error: activeErr } = await supabase
    .from("stocks")
    .select("code", { count: "exact", head: true })
    .eq("is_delisted", false);
  if (activeErr) {
    logger.error({ err: activeErr }, "findMissingDates: active count failed");
    throw activeErr;
  }
  const activeCount = activeCountRaw ?? 0;
  if (activeCount === 0) {
    logger.warn(
      "findMissingDates: active stocks count = 0 (백필 미실행?). 결측 검사 skip.",
    );
    return [];
  }
  const threshold = Math.floor(activeCount * opts.threshold);

  // Step 2: 최근 lookback 영업일 (DB 의 distinct date 기반 추론 — RESEARCH §3.3 옵션 A)
  // 20일 lookback 으로 시작 후 distinct date 가져옴 (휴장일 자연 skip)
  const today = new Date();
  const twentyDaysAgo = new Date(today);
  twentyDaysAgo.setDate(today.getDate() - 20);
  const sinceIso = twentyDaysAgo.toISOString().slice(0, 10);

  const { data: recentRows, error: recentErr } = await supabase
    .from("stock_daily_ohlcv")
    .select("date")
    .gte("date", sinceIso)
    .order("date", { ascending: false });
  if (recentErr) {
    logger.error(
      { err: recentErr },
      "findMissingDates: recent dates fetch failed",
    );
    throw recentErr;
  }

  // distinct date → 최근 lookback 개
  const seen = new Set<string>();
  const recentDates: string[] = [];
  for (const r of recentRows ?? []) {
    const d = (r as { date: string }).date;
    if (!seen.has(d)) {
      seen.add(d);
      recentDates.push(d);
      if (recentDates.length >= opts.lookback) break;
    }
  }

  if (recentDates.length === 0) {
    logger.warn(
      "findMissingDates: 최근 영업일 없음 (DB 비어있음). 결측 검사 skip.",
    );
    return [];
  }

  // Step 3: 각 일자별 row count (per-date count head:true)
  const missing: string[] = [];
  for (const date of recentDates) {
    const { count, error } = await supabase
      .from("stock_daily_ohlcv")
      .select("code", { count: "exact", head: true })
      .eq("date", date);
    if (error) {
      logger.error(
        { err: error, date },
        "findMissingDates: per-date count failed",
      );
      throw error;
    }
    const rowCount = count ?? 0;
    // row_count = 0 인 일자는 휴장 가능 — skip (RESEARCH §3.2 휴장일 처리)
    if (rowCount === 0) continue;
    if (rowCount < threshold) {
      missing.push(date);
    }
  }

  // Step 4: maxCalls 상한 적용
  const limited = missing.slice(0, opts.maxCalls);
  logger.info(
    {
      activeCount,
      threshold,
      recentDates: recentDates.length,
      missingFound: missing.length,
      returned: limited.length,
    },
    "findMissingDates complete",
  );
  return limited;
}
