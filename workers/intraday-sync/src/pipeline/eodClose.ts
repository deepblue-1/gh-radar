// workers/intraday-sync/src/pipeline/eodClose.ts
//
// EOD 공식 종가 패스 (D-fh2-02, 2026-08-20).
//
// 15:35~15:55 사이클(marketWindow.isEodClosePass)에서 1회 실행되어, ka10027 을
// **stex_tp="1"(KRX 전용)** 로 다시 조회해 당일 stock_daily_ohlcv 종가를 KRX 공식값으로 확정한다.
//
// 왜 필요한가: 장중 STEP1 은 stex_tp="3"(통합) 이라 NXT 체결가가 섞인다. 정규장 창 제한
// (D-fh2-01)으로 15:31 이후 오염 쓰기는 막았지만, 그것만으로는 "15:30 시점의 마지막 통합 스냅샷"이
// 종가로 남는다. 15:20~15:30 동시호가로 확정되는 KRX 공식 종가와 일치한다는 보장이 없으므로
// 마감 직후 KRX 전용 값으로 한 번 덮어써야 일봉이 공식값과 정합한다.

import type { AxiosInstance } from "axios";
import type { SupabaseClient } from "@supabase/supabase-js";
import type pino from "pino";
import type { IntradayCloseUpdate } from "@gh-radar/shared";
import { fetchKa10027 } from "../kiwoom/fetchRanking";
import { ka10027RowToCloseUpdate } from "./map";
import { intradayUpsertClose } from "./upsertClose";
import { withRetry } from "../retry";

export type EodClosePassDeps = {
  supabase: SupabaseClient;
  kiwoom: AxiosInstance;
  accessToken: string;
  dateIso: string;
  hardCap: number;
  log: pino.Logger;
};

/**
 * ka10027 stex_tp="1" sweep → intraday_upsert_close.
 *
 * STEP1 과 동일하게 sort_tp "1"(상승+보합) + "3"(하락+보합) 을 병합해야 전 종목을 덮는다.
 *
 * **stock_quotes 와 top_movers 는 절대 건드리지 않는다.**
 *   15:35 이후 화면에 보이는 현재가는 NXT 애프터마켓 값을 그대로 유지해야 한다(D-fh2-01).
 *   여기서 표시 계층까지 KRX 종가로 덮으면 "장 끝나고 NXT 에서 움직이는데 화면은 멈춤" 회귀가 된다.
 *   일봉(공식 기록)과 현재가(실시간 표시)는 의도적으로 서로 다른 소스를 본다.
 *
 * volume 도 KRX 전용 거래량으로 덮인다 — 공식 일봉 관례(KRX 거래량)와 일치하므로 의도된 동작이다.
 */
export async function runEodClosePass(
  deps: EodClosePassDeps,
): Promise<{ count: number }> {
  const { supabase, kiwoom, accessToken, dateIso, hardCap, log } = deps;

  const upRows = await withRetry(
    () => fetchKa10027(kiwoom, accessToken, "1", hardCap, "1"),
    "EOD fetchKa10027(sort_tp=1, stex_tp=1)",
  );
  const downRows = await withRetry(
    () => fetchKa10027(kiwoom, accessToken, "3", hardCap, "1"),
    "EOD fetchKa10027(sort_tp=3, stex_tp=1)",
  );
  const rows = [...upRows, ...downRows];

  if (rows.length === 0) {
    log.warn(
      { upRows: upRows.length, downRows: downRows.length },
      "EOD 패스 ka10027(KRX 전용) 0 row — 종가 확정 skip",
    );
    return { count: 0 };
  }

  // 매핑 + dedupe — 개별 row 실패는 카운트만 하고 skip (STEP1 관례 동일).
  const dedupeMap = new Map<string, IntradayCloseUpdate>();
  let mapErrors = 0;
  for (const row of rows) {
    try {
      const u = ka10027RowToCloseUpdate(row, dateIso);
      dedupeMap.set(u.code, u); // 마지막 row 가 승 (보합 중복은 동일값이라 무해)
    } catch {
      mapErrors += 1;
    }
  }
  const updates = Array.from(dedupeMap.values());

  log.info(
    {
      upRows: upRows.length,
      downRows: downRows.length,
      mapped: updates.length,
      mapErrors,
    },
    "EOD 패스 ka10027(KRX 전용) fetched + deduped",
  );

  if (updates.length === 0) {
    log.warn({ mapErrors }, "EOD 패스 매핑 결과 0 row — 종가 확정 skip");
    return { count: 0 };
  }

  const { count } = await withRetry(
    () => intradayUpsertClose(supabase, updates),
    "EOD intradayUpsertClose",
  );
  log.info({ count }, "EOD 공식 종가 확정 완료 (stock_daily_ohlcv only)");
  return { count };
}
