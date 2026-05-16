import type pino from "pino";
import { loadConfig } from "../config";
import { createKrxClient } from "../krx/client";
import { fetchBydd } from "../krx/fetchBydd";
import { krxBdydToOhlcvRow } from "../pipeline/map";
import { upsertOhlcv } from "../pipeline/upsert";
import { findMissingDates } from "../pipeline/missingDates";
import { createSupabaseClient } from "../services/supabase";
import { withRetry } from "../retry";
import { isoToBasDd } from "./businessDay";
import { bootstrapStocks } from "./bootstrapStocks";

/**
 * runRecover — D-09 2차 잡 의 recover mode.
 *
 * RESEARCH §4.2 입력/출력/실패 정책:
 *   - 입력 env: 없음 (RECOVER_LOOKBACK/THRESHOLD/MAX_CALLS 만 — config 에서 로드)
 *   - 출력: { datesProcessed, totalRows }
 *   - 실패: best-effort — 일부 일자 실패해도 나머지 continue. 0 일자도 success.
 *
 * RESEARCH §3.4 시나리오 1~4 모두 idempotent UPSERT 로 안전.
 */
export async function runRecover(deps: {
  log: pino.Logger;
}): Promise<{ datesProcessed: number; totalRows: number }> {
  const { log } = deps;
  const config = loadConfig();

  const log2 = log.child({
    lookback: config.recoverLookback,
    threshold: config.recoverThreshold,
    maxCalls: config.recoverMaxCalls,
  });
  log2.info("runRecover start");

  const supabase = createSupabaseClient(config);
  const krx = createKrxClient(config);

  const missingDates = await findMissingDates(supabase, {
    lookback: config.recoverLookback,
    threshold: config.recoverThreshold,
    maxCalls: config.recoverMaxCalls,
  });

  if (missingDates.length === 0) {
    log2.info("no missing dates detected");
    return { datesProcessed: 0, totalRows: 0 };
  }

  log2.info({ missingDates }, "missing dates detected — recovery start");

  let datesProcessed = 0;
  let totalRows = 0;

  for (const iso of missingDates) {
    const basDd = isoToBasDd(iso);
    try {
      const krxRows = await withRetry(
        () => fetchBydd(krx, basDd),
        `fetchBydd ${basDd}`,
      );
      if (krxRows.length === 0) {
        log2.info(
          { basDd },
          "KRX returned 0 row — skip (non-trading or unrecoverable)",
        );
        continue;
      }

      // 2026-05-16: KRX stale 응답 가드 — OHLV=0 비율 50% 이상이면 per-day skip.
      // recover 도 다른 시점에 KRX 재호출 → daily/backfill 과 동일 위험.
      const zeroCount = krxRows.filter(
        (r) => Number(r.TDD_OPNPRC) === 0,
      ).length;
      if (zeroCount / krxRows.length > 0.5) {
        log2.warn(
          { basDd, zeroCount, total: krxRows.length },
          "KRX stale response (>50% OHLV=0) — skip upsert",
        );
        continue;
      }

      // T-09-03 옵션 B
      const boot = await withRetry(
        () => bootstrapStocks(supabase, krxRows),
        `bootstrap ${basDd}`,
      );
      if (boot.inserted > 0) {
        log2.info(
          { basDd, bootstrapped: boot.inserted },
          "stocks bootstrap inserted",
        );
      }

      const mapped = krxRows.map(krxBdydToOhlcvRow);
      const { count } = await withRetry(
        () => upsertOhlcv(supabase, mapped),
        `upsertOhlcv ${basDd}`,
      );
      totalRows += count;
      datesProcessed += 1;
      log2.info({ basDd, count }, "recover date complete");
    } catch (err) {
      // best-effort — log error + continue (per-date 격리)
      log2.error(
        { basDd, err: (err as Error).message },
        "recover date failed — continue",
      );
    }
  }

  log2.info({ datesProcessed, totalRows }, "runRecover complete");
  return { datesProcessed, totalRows };
}
