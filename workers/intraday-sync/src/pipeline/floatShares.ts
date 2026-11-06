// workers/intraday-sync/src/pipeline/floatShares.ts
//
// quick 261106-ldl — 키움 ka10001 유통주식수(flo_stk · dstr_stk · dstr_rt) → stock_float 행. 순수 함수만.
//
// 단위 미확인: 키움이 주식수를 주로 주는지 천주로 주는지 확정 못 했다(키움은 Cloud Run 고정 IP 경유라 로컬 실측 불가).
// 정규화 규칙: 행마다 flo_stk 를 stocks.listing_shares(KRX LIST_SHRS, 주 단위)와 비교해 ×1 · ×1000 중
//   로그 비율 거리가 가까운 배수를 고르고 dstr_stk 에 같은 배수를 쓴다. listing_shares 가 없는 행은 run 다수결 배수.
// 스모크: floatSync.ts 가 run 마다 배수 표(votes · multiplier · disagree)와 raw 표본 1행을 로그로 남긴다.

import type { KiwoomKa10001Row } from "@gh-radar/shared";

export type UnitMultiplier = 1 | 1000;

/** 정리: trim → 앞 부호 제거 → 콤마 제거 → Number. */
function cleanNumber(s: string | undefined | null): number {
  if (s === undefined || s === null) return NaN;
  const t = s.trim().replace(/^[+-]/, "").replace(/,/g, "");
  if (t === "") return NaN;
  return Number(t);
}

/** 주식수 문자열 → 양수 또는 null(빈 값 · 0 · 비숫자). */
export function parseKiwoomCount(s: string | undefined | null): number | null {
  const n = cleanNumber(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 비율(%) 문자열 → 0 < r ≤ 100 이면 r, 아니면 null. */
export function parseKiwoomRate(s: string | undefined | null): number | null {
  const n = cleanNumber(s);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
}

/** ×1 · ×1000 중 |ln(flo×m / listingShares)| 가 작은 쪽(동률이면 1). */
export function pickUnitMultiplier(flo: number, listingShares: number): UnitMultiplier {
  const d1 = Math.abs(Math.log(flo / listingShares));
  const d1000 = Math.abs(Math.log((flo * 1000) / listingShares));
  return d1000 < d1 ? 1000 : 1;
}

/** 응답에서 남기는 최소 필드(전체 응답을 들고 다니지 않는다). */
export type FloatRaw = {
  code: string;
  flo: number | null;
  dstr: number | null;
  rate: number | null;
  listingShares: number | null;
};

/** 키는 요청한 universe code(응답 stk_cd 는 접미사가 붙을 수 있다). */
export function toFloatRaw(
  code: string,
  row: Pick<KiwoomKa10001Row, "flo_stk" | "dstr_stk" | "dstr_rt">,
  listingShares: number | null,
): FloatRaw {
  return {
    code,
    flo: parseKiwoomCount(row.flo_stk),
    dstr: parseKiwoomCount(row.dstr_stk),
    rate: parseKiwoomRate(row.dstr_rt),
    listingShares: listingShares !== null && listingShares > 0 ? listingShares : null,
  };
}

export type RunMultiplierDecision = {
  multiplier: UnitMultiplier | null;
  votes: { 1: number; 1000: number };
  /** 다수결과 다른 배수를 고른 행 수(다수결이 없으면 소수 쪽 표 수). */
  disagree: number;
};

/** flo 와 listingShares 가 둘 다 있는 행마다 투표. 표 0개 또는 동률이면 null. */
export function decideRunMultiplier(raws: FloatRaw[]): RunMultiplierDecision {
  const votes = { 1: 0, 1000: 0 };
  for (const r of raws) {
    if (r.flo !== null && r.listingShares !== null) {
      votes[pickUnitMultiplier(r.flo, r.listingShares)] += 1;
    }
  }
  let multiplier: UnitMultiplier | null = null;
  if (votes[1000] > votes[1]) multiplier = 1000;
  else if (votes[1] > votes[1000]) multiplier = 1;
  const disagree = Math.min(votes[1], votes[1000]);
  return { multiplier, votes, disagree };
}

/** stock_float 행 — 키는 마이그레이션 열 이름과 같다. */
export type StockFloatRow = {
  code: string;
  float_shares: number | null;
  float_rate: number | null;
  listed_shares: number | null;
  as_of: string;
  updated_at: string;
};

export function toStockFloatRow(
  raw: FloatRaw,
  runMultiplier: UnitMultiplier | null,
  asOf: string,
  updatedAtIso: string,
): StockFloatRow {
  const m =
    raw.flo !== null && raw.listingShares !== null
      ? pickUnitMultiplier(raw.flo, raw.listingShares)
      : runMultiplier;
  let listed: number | null = null;
  let floatShares: number | null = null;
  let floatRate: number | null = null;
  if (m !== null) {
    listed = raw.flo !== null ? Math.round(raw.flo * m) : null;
    floatShares = raw.dstr !== null ? Math.round(raw.dstr * m) : null;
    if (floatShares !== null) {
      if (raw.rate !== null) floatRate = raw.rate;
      else if (listed !== null) floatRate = Math.round((floatShares / listed) * 10000) / 100;
    }
  }
  return {
    code: raw.code,
    float_shares: floatShares,
    float_rate: floatRate,
    listed_shares: listed,
    as_of: asOf,
    updated_at: updatedAtIso,
  };
}
