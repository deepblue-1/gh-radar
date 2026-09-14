import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntradayCloseUpdate, IntradayOhlcUpdate } from "@gh-radar/shared";
import { limitUpPrice } from "@gh-radar/shared";
import { logger } from "../logger";

const CHUNK = 1000;

/** 전일종가 = 현재가 − 전일대비. 비정상(≤0·NaN)이면 현재가로 폴백. */
function prevCloseOf(u: IntradayCloseUpdate): number {
  const prev = u.price - (u.changeAmount ?? 0);
  return Number.isFinite(prev) && prev > 0 ? prev : u.price;
}

/** 하한가 = ceil(전일종가 × 0.7 / tick) × tick — tick 은 target 가격대 기준(limitUpPrice 와 같은 7구간). */
function limitDownPrice(prevClose: number): number {
  const tgt = prevClose * 0.7;
  const unit =
    tgt < 2000 ? 1 : tgt < 5000 ? 5 : tgt < 20000 ? 10 : tgt < 50000 ? 50 : tgt < 200000 ? 100 : tgt < 500000 ? 500 : 1000;
  return Math.ceil(tgt / unit) * unit;
}

/**
 * STEP1 stock_quotes UPSERT — 1,898 row × 6 컬럼. RESEARCH §3.3.1 + Pattern 3.
 *
 * D-20: 활성 1,898 종목 매분 누적 UPSERT (onConflict: code).
 * D-21: stale cleanup 없음 (top_movers 와 의도적 차이) — 비활성 종목 마지막 가격 유지.
 *
 * payload 컬럼: code/price/change_amount/change_rate/volume/trade_amount/updated_at
 *   - open/high/low/upper_limit/lower_limit/market_cap 의도적 omit (STEP2 가 정확값 UPSERT, §3.3.3)
 *   - name/market 컬럼은 stock_quotes 에 존재하지 않음 — stocks 마스터 + top_movers 가 보유.
 *     market Map 인자는 top_movers 재구성에서만 사용 (호출자 책임).
 */
export async function upsertQuotesStep1(
  supabase: SupabaseClient,
  updates: IntradayCloseUpdate[],
): Promise<{ count: number }> {
  if (updates.length === 0) return { count: 0 };

  const now = new Date().toISOString();
  const rows = updates.map((u) => ({
    code: u.code,
    price: u.price,
    change_amount: u.changeAmount,
    change_rate: u.changeRate,
    volume: u.volume,
    trade_amount: u.tradeAmount,
    // upper_limit/lower_limit — ka10027 응답에는 없어 전일종가(price − 전일대비)로 계산한다.
    // 가격제한폭 ±30% 를 호가단위로 절사/절상(RPC limit_up_price 와 동형). STEP2(ka10001 hot set)
    // 가 이어서 upl_pric/lst_pric 정확값으로 덮는다. 예전 price×1.3 임시값은 매분 전 종목을
    // 덮어써 상한가 근접도(price/upper)를 ≈0.77 로 고정시켰다(260915 실측, 2,779행).
    upper_limit: limitUpPrice(prevCloseOf(u)),
    lower_limit: limitDownPrice(prevCloseOf(u)),
    updated_at: now,
  }));

  let total = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("stock_quotes")
      .upsert(chunk, { onConflict: "code" });
    if (error) {
      logger.error(
        { err: error, chunkStart: i, chunkSize: chunk.length },
        "upsertQuotesStep1 chunk failed",
      );
      throw error;
    }
    total += chunk.length;
  }
  return { count: total };
}

/**
 * STEP2 stock_quotes UPDATE (UPSERT 아님) — ~250 row × 6 다른 컬럼. RESEARCH §3.3.2.
 *
 * 중요 (2026-05-15 first cycle): Supabase `upsert` 는 `INSERT ... ON CONFLICT DO UPDATE`
 *   로 변환되어 신규 row INSERT 시도 단계에서 NOT NULL 제약 (price/upper_limit/lower_limit)
 *   을 평가 → 페이로드에 price 없으면 violation. STEP2 가 STEP1 매분 갱신 컬럼 (price/change/
 *   volume/trade_amount) 을 덮어쓰지 않으려면 INSERT 분기 자체를 피해야 함.
 *   해결: UPSERT → 종목별 UPDATE 직렬 호출 (~250 종목, 수십 ms). UPDATE 는 NOT NULL 제약을
 *   매개로 평가하지 않으므로 STEP1 컬럼 유지 + STEP2 컬럼만 갱신.
 *
 * payload 컬럼: open/high/low/upper_limit/lower_limit/market_cap/updated_at
 *   - price/change/volume/trade_amount 의도적 omit (STEP1 매분 갱신 컬럼 보호)
 */
export async function upsertQuotesStep2(
  supabase: SupabaseClient,
  updates: IntradayOhlcUpdate[],
): Promise<{ count: number }> {
  if (updates.length === 0) return { count: 0 };

  const now = new Date().toISOString();
  let updated = 0;
  for (const u of updates) {
    const { error } = await supabase
      .from("stock_quotes")
      .update({
        open: u.open,
        high: u.high,
        low: u.low,
        upper_limit: u.upperLimit,
        lower_limit: u.lowerLimit,
        market_cap: u.marketCap,
        updated_at: now,
      })
      .eq("code", u.code);
    if (error) {
      logger.error({ err: error, code: u.code }, "upsertQuotesStep2 update failed");
      throw error;
    }
    updated += 1;
  }
  return { count: updated };
}
