/**
 * Phase 09.2 — 일봉 OHLCV fetch (webapp → Supabase 직접 호출).
 *
 * RESEARCH 단계의 shared/fetch-daily.ts (삭제됨, Plan 03 정리) 를 정식 promote.
 * 추가/변경:
 *   - AbortSignal 파라미터 (D-14 — 이전 요청 취소, Phase 6 패턴 승계)
 *   - 공유 타입은 @gh-radar/shared 의 DailyOhlcvRow / DailyOhlcvRangeKey 사용 (D-15)
 *   - Pitfall 7 (PostgREST 정렬 미명시 시 캔들 역순) 방어를 위해 .order('date', asc) 명시
 *   - Pitfall 10 (RLS authenticated 누락) 은 본 phase 의 마이그레이션
 *     20260515163000_fix_stock_daily_ohlcv_rls_authenticated.sql 에서 fix 완료 —
 *     anon + authenticated 양쪽 모두 SELECT 허용
 *
 * 2026-05-16 사용자 요청 갱신:
 *   - range = 1Y/2Y/3Y/5Y (기존 1M/3M/6M/1Y 폐기)
 *   - 클라이언트 주봉/월봉 aggregate 함수 추가 (aggregateToWeekly/Monthly)
 */

'use client';

import {
  DAILY_OHLCV_RANGES,
  type DailyOhlcvRangeKey,
  type DailyOhlcvRow,
  type DailyOhlcvTimeframe,
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
  '1Y': 400,
  '2Y': 800,
  '3Y': 1200,
  '5Y': 2000,
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

  /**
   * 2026-05-16 사용자 보고 (079190 케스피온): 거래정지 기간 (2026-04-09 ~ 04-30) 의 row 가
   * open/high/low=0, close=마지막정상가, volume=0 으로 저장되어 차트에서 동일하게 표시.
   * KRX 가 거래정지 종목에 OHLV=0, close=직전종가 패턴으로 응답하기 때문 (ingestion 이 그대로 적재).
   * 차트 표시 단계에서 비정상 row 제외 — open === 0 은 정상 종목엔 절대 발생 안 함.
   */
  return (data as RawRow[])
    .filter((r) => Number(r.open) > 0)
    .map((r) => ({
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

/** ISO YYYY-MM-DD 의 월요일 (KST 기준 주 시작) ISO 반환. */
function isoWeekKey(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** ISO YYYY-MM-DD → 'YYYY-MM-01' (월 시작 anchor). */
function isoMonthKey(dateIso: string): string {
  return `${dateIso.slice(0, 7)}-01`;
}

/**
 * 일봉 rows 를 bucket(주/월) 으로 묶어 OHLCV 합산.
 * - open = bucket 첫 거래일의 open
 * - close = bucket 마지막 거래일의 close
 * - high = bucket 내 max
 * - low = bucket 내 min
 * - volume = bucket 합
 * - changeAmount/changeRate = null (의미 다름 — UI 에서 미사용)
 *
 * rows 는 ASC 정렬 가정. 반환값도 ASC.
 */
function bucketRows(
  rows: DailyOhlcvRow[],
  bucketKey: (date: string) => string,
): DailyOhlcvRow[] {
  if (rows.length === 0) return [];
  const buckets = new Map<string, DailyOhlcvRow[]>();
  for (const r of rows) {
    const key = bucketKey(r.date);
    const list = buckets.get(key);
    if (list) list.push(r);
    else buckets.set(key, [r]);
  }
  const keys = Array.from(buckets.keys()).sort();
  return keys.map((key) => {
    const group = buckets.get(key)!;
    const first = group[0];
    const last = group[group.length - 1];
    return {
      date: key,
      open: first.open,
      high: Math.max(...group.map((g) => g.high)),
      low: Math.min(...group.map((g) => g.low)),
      close: last.close,
      volume: group.reduce((sum, g) => sum + g.volume, 0),
      changeAmount: null,
      changeRate: null,
    };
  });
}

/** 일봉 → 주봉 (월요일 anchor). */
export function aggregateToWeekly(rows: DailyOhlcvRow[]): DailyOhlcvRow[] {
  return bucketRows(rows, isoWeekKey);
}

/** 일봉 → 월봉 (해당 월 1일 anchor). */
export function aggregateToMonthly(rows: DailyOhlcvRow[]): DailyOhlcvRow[] {
  return bucketRows(rows, isoMonthKey);
}

/** timeframe 별 변환 dispatcher. */
export function aggregateByTimeframe(
  rows: DailyOhlcvRow[],
  timeframe: DailyOhlcvTimeframe,
): DailyOhlcvRow[] {
  if (timeframe === 'W') return aggregateToWeekly(rows);
  if (timeframe === 'M') return aggregateToMonthly(rows);
  return rows;
}

/** 외부 컴포넌트에서 토글 iterate 용 — packages/shared 의 readonly tuple 재export. */
export { DAILY_OHLCV_RANGES };
export type { DailyOhlcvRangeKey, DailyOhlcvRow };
