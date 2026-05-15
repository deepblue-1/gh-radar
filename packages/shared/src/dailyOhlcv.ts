/**
 * Phase 09.2 — webapp + server 가 공유하는 일봉 OHLCV row 타입.
 *
 * Supabase `stock_daily_ohlcv` (Phase 9 D-03 스키마) 의 부분 projection —
 * trade_amount 는 차트 v1 미사용으로 제외. webapp/src/lib/daily-ohlcv-api.ts 의
 * fetchDailyOhlcv 반환 + StockDailyChart 입력 타입.
 */
export interface DailyOhlcvRow {
  /** ISO YYYY-MM-DD */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** 전일대비 (절대값) — 신규 상장일 등에서 null */
  changeAmount: number | null;
  /** 등락률 % — 신규 상장일 등에서 null */
  changeRate: number | null;
}

/** 차트 기간 토글 키 — D-04 / D-05 */
export type DailyOhlcvRangeKey = '1M' | '3M' | '6M' | '1Y';

/** UI 토글 컴포넌트가 iterate 할 수 있는 readonly tuple. */
export const DAILY_OHLCV_RANGES: readonly DailyOhlcvRangeKey[] = [
  '1M',
  '3M',
  '6M',
  '1Y',
] as const;
