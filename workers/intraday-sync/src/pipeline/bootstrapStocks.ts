import type { SupabaseClient } from "@supabase/supabase-js";
import type { KiwoomKa10027Row } from "@gh-radar/shared";
import { logger } from "../logger";
import { stripAlSuffix } from "./map";

/**
 * intraday-sync 의 FK orphan 회피. RESEARCH §3.4 + candle-sync mirror.
 *
 * ka10027 응답의 활성 종목 ~1,898 + ka10001 hot set ~250 은 stocks 마스터에 존재 가정.
 * 신규 상장 종목이 master-sync 08:10 전에 키움에 등장하면 FK 위반 → 본 함수가 is_delisted=false 로 신규 등록.
 * master-sync 가 다음 실행 시 정확 정보로 갱신.
 *
 * ON CONFLICT (code) DO NOTHING — master-sync 와 쓰기 경쟁 회피.
 */
export async function bootstrapMissingStocks(
  supabase: SupabaseClient,
  rows: KiwoomKa10027Row[],
): Promise<{ inserted: number }> {
  if (rows.length === 0) return { inserted: 0 };

  const codeMap = new Map<string, { code: string; name: string }>();
  for (const r of rows) {
    const code = stripAlSuffix(r.stk_cd);
    if (!/^\d{6}$/.test(code)) continue;
    if (codeMap.has(code)) continue;
    codeMap.set(code, { code, name: r.stk_nm ?? code });
  }
  if (codeMap.size === 0) return { inserted: 0 };

  const now = new Date().toISOString();
  const payload = [...codeMap.values()].map((s) => ({
    code: s.code,
    name: s.name,
    market: "KOSPI" as const, // 신규 등록 placeholder — master-sync 가 정확 시장 보강
    security_type: "보통주",
    security_group: "주권",
    is_delisted: false, // intraday-sync 는 활성 종목만 응답 받음 (candle-sync 의 is_delisted=true 와 차이)
    updated_at: now,
  }));

  const { error, count } = await supabase
    .from("stocks")
    .upsert(payload, { onConflict: "code", ignoreDuplicates: true, count: "exact" });

  if (error) {
    logger.error({ err: error, attempted: payload.length }, "bootstrapMissingStocks failed");
    throw error;
  }

  const inserted = count ?? 0;
  logger.info({ attempted: payload.length, inserted }, "bootstrapMissingStocks complete");
  return { inserted };
}
