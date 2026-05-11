import type { SupabaseClient } from "@supabase/supabase-js";
import type { BdydTrdRow } from "@gh-radar/shared";
import { logger } from "../logger";

/**
 * T-09-03 옵션 B — FK orphan 회피.
 *
 * KRX bydd_trd 응답에는 폐지종목 history 가 포함될 수 있는데, 해당 code 가
 * stocks 마스터에 없으면 stock_daily_ohlcv FK 위반.
 *
 * 본 함수는 응답의 unique code 를 stocks 에 is_delisted=true 로 신규 등록.
 * - ON CONFLICT (code) DO NOTHING → 기존 활성 종목 미변경 (master-sync 쓰기 경쟁 회피)
 * - 신규 등록 행은 is_delisted=true — master-sync 가 다음 실행 시 활성 여부 재평가
 *
 * 호출 시점: fetchBydd 직후 + upsertOhlcv 직전.
 */
export async function bootstrapStocks(
  supabase: SupabaseClient,
  rows: BdydTrdRow[],
): Promise<{ inserted: number }> {
  if (rows.length === 0) return { inserted: 0 };

  // dedup by code
  const codeMap = new Map<
    string,
    { code: string; name: string; market: "KOSPI" | "KOSDAQ" }
  >();
  for (const r of rows) {
    if (!r.ISU_SRT_CD) continue;
    if (codeMap.has(r.ISU_SRT_CD)) continue;
    codeMap.set(r.ISU_SRT_CD, {
      code: r.ISU_SRT_CD,
      name: r.ISU_NM ?? r.ISU_SRT_CD,
      market: r.market,
    });
  }

  if (codeMap.size === 0) return { inserted: 0 };

  const now = new Date().toISOString();
  const payload = [...codeMap.values()].map((s) => ({
    code: s.code,
    name: s.name,
    market: s.market,
    security_type: "보통주", // stocks 테이블 default 와 일치 (Plan 06.1 스키마)
    security_group: "주권", // stocks 테이블 default
    is_delisted: true, // 신규 등록은 일단 delisted — master-sync 가 활성 종목 재평가
    updated_at: now,
  }));

  // upsert with ignoreDuplicates=true → INSERT ... ON CONFLICT DO NOTHING
  const { error, count } = await supabase
    .from("stocks")
    .upsert(payload, {
      onConflict: "code",
      ignoreDuplicates: true,
      count: "exact",
    });

  if (error) {
    logger.error(
      { err: error, attempted: payload.length },
      "bootstrapStocks failed",
    );
    throw error;
  }

  const inserted = count ?? 0;
  logger.info(
    { attempted: payload.length, inserted },
    "bootstrapStocks complete",
  );
  return { inserted };
}
