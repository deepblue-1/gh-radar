/**
 * Phase 09.2 RESEARCH — mockup 공통 데이터 fetch 헬퍼.
 *
 * Phase 06.2 watchlist-api.ts 패턴 mirror — webapp → Supabase PostgREST 직접 호출.
 * stock_daily_ohlcv RLS 가 anon SELECT 를 자동 허용 (Phase 9 D-03).
 *
 * 본 헬퍼는 RESEARCH 단계의 mockup 전용. PLAN 단계에서 정식 daily-ohlcv-api.ts 모듈로
 * 승격할 예정 (CONTEXT D-13).
 */

'use client';

import { createClient } from '@/lib/supabase/client';

export interface DailyOhlcvRow {
  /** YYYY-MM-DD */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  changeAmount: number | null;
  changeRate: number | null;
}

interface RawRow {
  date: string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume: number | string;
  change_amount: number | string | null;
  change_rate: number | string | null;
}

export type RangeKey = '1M' | '3M' | '6M' | '1Y';

/**
 * Range → 시작일 (calendar day 기준 보수적 마진 적용).
 * 1M: 22 영업일 ≈ 32 calendar day → 60일 마진 (휴장일/주말 흡수)
 * 3M: 65 영업일 ≈ 95 calendar day → 120일
 * 6M: 130 영업일 ≈ 195 calendar day → 220일
 * 1Y: 252 영업일 ≈ 365 calendar day → 400일
 */
export function rangeToFromDate(range: RangeKey, today: Date = new Date()): string {
  const days: Record<RangeKey, number> = { '1M': 60, '3M': 120, '6M': 220, '1Y': 400 };
  const d = new Date(today);
  d.setDate(d.getDate() - days[range]);
  return d.toISOString().slice(0, 10);
}

/**
 * 005930 005930 ... 같은 종목 1개의 일봉 OHLCV 를 from~today 범위로 조회.
 * 실제 production daily-ohlcv-api.ts 는 AbortSignal + 에러 envelope 추가 예정.
 */
export async function fetchDailyOhlcv(
  code: string,
  range: RangeKey = '1M',
): Promise<DailyOhlcvRow[]> {
  const supabase = createClient();
  const from = rangeToFromDate(range);

  const { data, error } = await supabase
    .from('stock_daily_ohlcv')
    .select('date, open, high, low, close, volume, change_amount, change_rate')
    .eq('code', code)
    .gte('date', from)
    .order('date', { ascending: true });

  if (error) throw error;
  if (!data) return [];

  return (data as RawRow[]).map((r) => ({
    date: r.date,
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
    changeAmount: r.change_amount === null ? null : Number(r.change_amount),
    changeRate: r.change_rate === null ? null : Number(r.change_rate),
  }));
}
