/**
 * Phase 09.2 — 일봉 OHLCV fetch (webapp → Supabase 직접 호출).
 *
 * RESEARCH 단계의 webapp/src/app/mockups/shared/fetch-daily.ts 를 정식 promote.
 * 추가/변경:
 *   - AbortSignal 파라미터 (D-14 — 이전 요청 취소, Phase 6 패턴 승계)
 *   - 공유 타입은 @gh-radar/shared 의 DailyOhlcvRow / DailyOhlcvRangeKey 사용 (D-15)
 *   - Pitfall 7 (PostgREST 정렬 미명시 시 캔들 역순) 방어를 위해 .order('date', asc) 명시
 *   - Pitfall 10 (RLS authenticated 누락) 은 본 phase 의 마이그레이션
 *     20260515163000_fix_stock_daily_ohlcv_rls_authenticated.sql 에서 fix 완료 —
 *     anon + authenticated 양쪽 모두 SELECT 허용
 */

'use client';

import {
  DAILY_OHLCV_RANGES,
  type DailyOhlcvRangeKey,
  type DailyOhlcvRow,
} from '@gh-radar/shared';
import { createClient } from '@/lib/supabase/client';

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

/** range → 시작일 (calendar day 마진 — 휴장일/주말 흡수). */
const RANGE_TO_DAYS: Record<DailyOhlcvRangeKey, number> = {
  '1M': 60,
  '3M': 120,
  '6M': 220,
  '1Y': 400,
};

/**
 * range → ISO YYYY-MM-DD (today − margin days).
 * `today` 인자는 테스트에서 결정론적 검증을 위해 주입 가능.
 */
export function rangeToFromDate(
  range: DailyOhlcvRangeKey,
  today: Date = new Date(),
): string {
  const days = RANGE_TO_DAYS[range];
  const d = new Date(today);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * 종목 1개의 일봉 OHLCV 를 from~today 범위로 조회.
 *
 * - 시간 ASC 정렬 (lightweight-charts 가 ASC 가정 — Pitfall 7).
 * - AbortSignal 로 이전 요청 취소 가능. abort 시 Supabase 가 AbortError throw.
 */
export async function fetchDailyOhlcv(
  code: string,
  range: DailyOhlcvRangeKey,
  signal?: AbortSignal,
): Promise<DailyOhlcvRow[]> {
  const supabase = createClient();
  const from = rangeToFromDate(range);

  let query = supabase
    .from('stock_daily_ohlcv')
    .select(
      'date, open, high, low, close, volume, change_amount, change_rate',
    )
    .eq('code', code)
    .gte('date', from)
    .order('date', { ascending: true });

  if (signal) {
    query = query.abortSignal(signal);
  }

  const { data, error } = await query;
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

/** 외부 컴포넌트에서 토글 iterate 용 — packages/shared 의 readonly tuple 재export. */
export { DAILY_OHLCV_RANGES };
export type { DailyOhlcvRangeKey, DailyOhlcvRow };
