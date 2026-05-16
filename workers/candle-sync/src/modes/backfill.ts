import type pino from "pino";
import { loadConfig } from "../config";
import { createKrxClient } from "../krx/client";
import { fetchBydd } from "../krx/fetchBydd";
import { krxBdydToOhlcvRow } from "../pipeline/map";
import { upsertOhlcv } from "../pipeline/upsert";
import { createSupabaseClient } from "../services/supabase";
import { withRetry } from "../retry";
import { iterateBusinessDays, isoToBasDd } from "./businessDay";
import { bootstrapStocks } from "./bootstrapStocks";

/**
 * runBackfill — D-07/D-08 의 backfill mode.
 *
 * RESEARCH §4.2 입력/출력/실패 정책:
 *   - 입력 env: BACKFILL_FROM (YYYY-MM-DD), BACKFILL_TO (YYYY-MM-DD) — 둘 다 필수
 *   - 출력: { daysProcessed, totalRows, daysFailed }
 *   - 실패: per-day 격리 (try/catch 안에서 continue). 단 KRX 401 / MIN_EXPECTED 위반은 즉시 throw.
 *
 * 영업일 calendar: businessDay.iterateBusinessDays 평일만 yield. 실제 휴장(공휴일) 은
 *   KRX 빈응답으로 자연 skip (RESEARCH §3.3 옵션 C).
 */
export async function runBackfill(deps: {
  log: pino.Logger;
}): Promise<{ daysProcessed: number; totalRows: number; daysFailed: number }> {
  const { log } = deps;
  const config = loadConfig();

  if (!config.backfillFrom || !config.backfillTo) {
    throw new Error(
      "BACKFILL_FROM and BACKFILL_TO env required for MODE=backfill",
    );
  }

  const log2 = log.child({
    from: config.backfillFrom,
    to: config.backfillTo,
  });
  log2.info("runBackfill start");

  const supabase = createSupabaseClient(config);
  const krx = createKrxClient(config);

  let daysProcessed = 0;
  let totalRows = 0;
  let daysFailed = 0;

  for (const iso of iterateBusinessDays(
    config.backfillFrom,
    config.backfillTo,
  )) {
    const basDd = isoToBasDd(iso);
    try {
      const krxRows = await withRetry(
        () => fetchBydd(krx, basDd),
        `fetchBydd ${basDd}`,
      );

      if (krxRows.length === 0) {
        log2.info({ basDd }, "non-trading day (empty response) — skip");
        daysProcessed += 1;
        continue;
      }

      // MIN_EXPECTED 가드 — 부분 응답 의심 → throw (per-day 격리 우회, 전체 중단)
      if (krxRows.length < config.minExpectedRows) {
        throw new Error(
          `MIN_EXPECTED violation on ${basDd}: ${krxRows.length} rows (< ${config.minExpectedRows}). Backfill aborted.`,
        );
      }

      // 2026-05-16: KRX stale 응답 가드 — OHLV=0 비율 50% 이상이면 per-day skip.
      // 5/15 사례: 토요일 호출 시 KRX 가 가장 최근 거래일 데이터를 전 종목 OHLV=0
      // 으로 응답해 기존 정상 daily sync row 덮어쓸 위험. 평소 거래정지 비율은
      // 5~8% 라 50% threshold 충분히 안전. 거래정지 row 적재는 영향 없음.
      const zeroCount = krxRows.filter(
        (r) => Number(r.TDD_OPNPRC) === 0,
      ).length;
      if (zeroCount / krxRows.length > 0.5) {
        log2.warn(
          { basDd, zeroCount, total: krxRows.length },
          "KRX stale response (>50% OHLV=0) — skip upsert, keep existing",
        );
        daysProcessed += 1;
        continue;
      }

      // T-09-03 옵션 B: stocks bootstrap
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
      daysProcessed += 1;
      log2.info({ basDd, count }, "day complete");
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      // KRX 401 / MIN_EXPECTED 는 즉시 throw (per-day 격리 우회)
      if (message.includes("KRX 401") || message.includes("MIN_EXPECTED")) {
        throw err;
      }
      // 기타 일시 장애 — per-day 격리: log error + continue
      daysFailed += 1;
      log2.error({ basDd, err: message }, "day failed — continue");
    }
  }

  log2.info(
    { daysProcessed, totalRows, daysFailed },
    "runBackfill complete",
  );
  return { daysProcessed, totalRows, daysFailed };
}
