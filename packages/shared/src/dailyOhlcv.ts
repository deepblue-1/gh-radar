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

/** 차트 기간 토글 키 — 사용자 요청 (2026-05-16) 으로 1Y/2Y/3Y/5Y 로 확장 */
export type DailyOhlcvRangeKey = '1Y' | '2Y' | '3Y' | '5Y';

/** UI 토글 컴포넌트가 iterate 할 수 있는 readonly tuple. */
export const DAILY_OHLCV_RANGES: readonly DailyOhlcvRangeKey[] = [
  '1Y',
  '2Y',
  '3Y',
  '5Y',
] as const;

/**
 * 차트 timeframe — 일봉(D) / 주봉(W) / 월봉(M).
 * 데이터는 항상 일봉으로 fetch 후 클라이언트 aggregate 로 W/M 파생.
 */
export type DailyOhlcvTimeframe = 'D' | 'W' | 'M';

/** UI 토글용 readonly tuple. */
export const DAILY_OHLCV_TIMEFRAMES: readonly DailyOhlcvTimeframe[] = [
  'D',
  'W',
  'M',
] as const;

/** 사용자 표시 라벨. */
export const TIMEFRAME_LABELS: Record<DailyOhlcvTimeframe, string> = {
  D: '일봉',
  W: '주봉',
  M: '월봉',
};
