import type pino from "pino";
import { loadConfig } from "../config";
import { createKrxClient } from "../krx/client";
import { fetchBydd } from "../krx/fetchBydd";
import { krxBdydToOhlcvRow } from "../pipeline/map";
import { upsertOhlcv } from "../pipeline/upsert";
import { createSupabaseClient } from "../services/supabase";
import { withRetry } from "../retry";
import { todayBasDdKst, basDdToIso } from "./businessDay";
import { bootstrapStocks } from "./bootstrapStocks";

/**
 * runDaily — D-08 의 daily mode.
 *
 * RESEARCH §4.2 입력/출력/실패 정책:
 *   - 입력 env: 없음 (basDd = todayKstYYYYMMDD 자동)
 *   - 출력: { basDd, count }
 *   - 실패: 전체 실패 시 throw (Cloud Run Job exit 1 → alert)
 *
 * RESEARCH §4.3 분기:
 *   - OutBlock_1 = [] (평일 EOD 직후 — R1 가설): warn "KRX data not yet available" + 정상 종료
 *   - row count < minExpectedRows: throw (T-09-02 MIN_EXPECTED 가드)
 */
export async function runDaily(deps: {
  log: pino.Logger;
}): Promise<{ basDd: string; count: number }> {
  const { log } = deps;
  const config = loadConfig();
  const basDd = config.basDd ?? todayBasDdKst();
  const log2 = log.child({ basDd });

  log2.info("runDaily start");

  const supabase = createSupabaseClient(config);
  const krx = createKrxClient(config);

  const krxRows = await withRetry(() => fetchBydd(krx, basDd), "fetchBydd");
  log2.info({ krxRows: krxRows.length }, "KRX fetched");

  // RESEARCH §4.3: 빈 응답 분기
  if (krxRows.length === 0) {
    log2.warn("KRX data not yet available (휴장일 또는 미갱신)");
    return { basDd, count: 0 };
  }

  // RESEARCH §7 T-09-02: MIN_EXPECTED 가드 — 부분 응답 시 throw
  if (krxRows.length < config.minExpectedRows) {
    throw new Error(
      `KRX returned ${krxRows.length} rows (< ${config.minExpectedRows}) — partial response suspected. basDd=${basDd}`,
    );
  }

  // T-09-03 옵션 B: stocks bootstrap 먼저 (FK orphan 회피)
  const boot = await withRetry(
    () => bootstrapStocks(supabase, krxRows),
    "bootstrapStocks",
  );
  if (boot.inserted > 0) {
    log2.info(
      { bootstrapped: boot.inserted },
      "stocks bootstrap inserted (delisted/new codes)",
    );
  }

  // map + upsert
  // 2026-05-16: KRX stale 응답 가드 — open=0 row 는 적재하지 않음.
  // KRX bydd_trd 가 시점에 따라 일부 종목을 OHLV=0 으로 응답 (예: 토요일 호출 시 stale).
  // upsert 가 이를 그대로 적재하면 기존 정상 row 가 덮어써짐. mapping 후 filter 로 차단.
  const mapped = krxRows
    .map(krxBdydToOhlcvRow)
    .filter((r) => r.open > 0);
  const { count } = await withRetry(
    () => upsertOhlcv(supabase, mapped),
    "upsertOhlcv",
  );

  log2.info({ count, dateIso: basDdToIso(basDd) }, "runDaily complete");
  return { basDd, count };
}
