// workers/intraday-sync/src/pipeline/staleGuard.ts
//
// stale snapshot 감지 가드.
//
// 배경(2026-07-20 quick-260720-kbf): 키움 ka10027 은 휴장일/프리마켓에
// 직전 거래일 snapshot 을 그대로 반환한다. "응답 0행" 휴장일 가드는 이를
// 못 잡고, 오늘 날짜로 스탬핑한 가짜 상한가 행이 stock_daily_ohlcv 에 INSERT 된다.
// (044380 7/17 가짜 '상' 마커의 근본 원인)
//
// 해결: 이번 cycle 의 update 를 저장된 직전 거래일 데이터(close, change_rate)와
// 내용 비교. 표본이 충분(comparable >= 30)하고 일치율이 높으면(ratio >= 0.8)
// "직전 거래일 재방출" 로 판정하고 cycle 을 skip 한다.

import type { IntradayCloseUpdate } from "@gh-radar/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

/** 저장된 직전 거래일 행 (stale 비교용 최소 필드) */
export type PrevDayRow = {
  code: string;
  close: number | null;
  change_rate: number | null;
};

/**
 * 오탐 방지 하한: 이만큼 비교 가능한 쌍이 없으면 판정 보류(stale=false).
 * 장 초반 소수 종목만 응답하는 상황에서 실거래 데이터를 오판하지 않도록.
 */
export const MIN_COMPARABLE = 30;

/** 일치율 임계값: 비교 가능 쌍 중 이 비율 이상이 직전일과 동일하면 stale. */
export const MATCH_RATIO_THRESHOLD = 0.8;

/**
 * 등락률 비교 epsilon(strict <). |diff| == RATE_EPSILON 는 불일치.
 * DB numeric ↔ 키움 문자열 파싱 오차 흡수용 여유값.
 */
export const RATE_EPSILON = 0.005;

/**
 * 이번 cycle 의 close update 가 직전 거래일 저장 데이터의 단순 재방출인지 판정.
 *
 * 비교 가능 조건(둘 다 만족해야 comparable 카운트):
 *   update.price != null && update.changeRate != null &&
 *   prev.close != null && prev.change_rate != null
 * 매칭 조건:
 *   update.price === prev.close && |update.changeRate - prev.change_rate| < RATE_EPSILON
 *
 * stale = comparable >= MIN_COMPARABLE && ratio >= MATCH_RATIO_THRESHOLD
 */
export function detectStaleSnapshot(
  updates: IntradayCloseUpdate[],
  prevRows: PrevDayRow[],
): { stale: boolean; comparable: number; matched: number; ratio: number } {
  const prevByCode = new Map<string, PrevDayRow>();
  for (const row of prevRows) prevByCode.set(row.code, row);

  let comparable = 0;
  let matched = 0;
  for (const u of updates) {
    const prev = prevByCode.get(u.code);
    if (!prev) continue;
    const canCompare =
      u.price != null &&
      u.changeRate != null &&
      prev.close != null &&
      prev.change_rate != null;
    if (!canCompare) continue;
    comparable += 1;
    if (
      u.price === prev.close &&
      Math.abs((u.changeRate as number) - (prev.change_rate as number)) <
        RATE_EPSILON
    ) {
      matched += 1;
    }
  }

  const ratio = comparable > 0 ? matched / comparable : 0;
  const stale = comparable >= MIN_COMPARABLE && ratio >= MATCH_RATIO_THRESHOLD;
  return { stale, comparable, matched, ratio };
}

/** todayIso("YYYY-MM-DD") 에서 n 일 뺀 ISO date 문자열 (단순 하한, 시간대 무관). */
function isoDaysBefore(todayIso: string, days: number): string {
  const d = new Date(`${todayIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * stale 비교용 직전 거래일 행 조회.
 * sampleCodes 최대 100개(여기서 slice) × 직전 10일 범위에서 code 별 최신 1행만 채택.
 *
 * error 는 throw — 조용한 빈 결과는 comparable=0 으로 가드를 무력화하므로 fail-fast.
 * (빈 결과가 필요한 정상 상황은 첫 상장/데이터 없음뿐이며, 그 경우도 error 아닌 빈 배열)
 */
export async function fetchPrevDayRows(
  supabase: SupabaseClient,
  sampleCodes: string[],
  todayIso: string,
): Promise<PrevDayRow[]> {
  const sample = sampleCodes.slice(0, 100);
  if (sample.length === 0) return [];
  const tenDaysBefore = isoDaysBefore(todayIso, 10);
  const { data, error } = await supabase
    .from("stock_daily_ohlcv")
    .select("code, close, change_rate")
    .in("code", sample)
    .lt("date", todayIso)
    .gte("date", tenDaysBefore)
    .order("date", { ascending: false });
  if (error) throw error;

  // order desc 이므로 code 첫 등장이 최신 → Map 으로 code 별 최신 1행만.
  const latestByCode = new Map<string, PrevDayRow>();
  for (const row of (data ?? []) as PrevDayRow[]) {
    if (!latestByCode.has(row.code)) latestByCode.set(row.code, row);
  }
  return Array.from(latestByCode.values());
}
