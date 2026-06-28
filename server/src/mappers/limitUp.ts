/**
 * Phase 12 — 상한가 사전계산 DB row 타입 + snake_case → camelCase 매핑 (LIMIT-01).
 *
 * limit_up_events / limit_up_stock_stats / limit_up_theme_stats
 * (snake_case, supabase/migrations/20260628120000_limit_up_tables.sql) 의 row 형태를
 * 정의하고, packages/shared 의 camelCase 계약 타입(LimitUpEvent/StockStats/ThemeStat)으로
 * 변환한다. PostgREST 가 numeric 컬럼을 문자열로 직렬화하므로 toNum 정규화가 필요하다
 * (comovement.ts mapper 톤 — numeric(text) → number).
 *
 * 정적 이력(시세 실시간 조인 없음) — 라우트는 limit_up_* 테이블만 SELECT 한다.
 */

import type {
  LimitUpEvent,
  LimitUpStockStats,
  LimitUpThemeStat,
} from "@gh-radar/shared";

/**
 * PostgREST numeric(text) → 유한 number, 없거나 비유한값이면 fallback.
 * (단일 NaN 이 통계/정렬을 오염시키는 회귀 방지 — comovement.ts toNum 선례 복제.)
 */
export function toNum(
  v: string | number | null | undefined,
  fallback = 0,
): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * numeric(text) → number | null 보존 매핑.
 * NULL 의미를 보존해야 하는 필드(turnover, win_rate, avg_open_ret 등)용 —
 * toNum 이 NULL 을 0 으로 접는 것과 의도적 차이 (webapp 이 null 을 "—"/숨김 처리).
 */
function toNumOrNull(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** limit_up_events 테이블 row (snake_case). 수익률/회전율 numeric → text. */
export type LimitUpEventRow = {
  code: string;
  date: string;
  is_jeomsang: boolean;
  next_open_ret: string | number | null;
  next_high_ret: string | number | null;
  next_low_ret: string | number | null;
  next_close_ret: string | number | null;
  trade_amount: string | number | null;
  turnover: string | number | null;
};

/** limit_up_stock_stats 테이블 row (snake_case). 히스토그램은 5 bucket_* 컬럼. */
export type LimitUpStockStatsRow = {
  code: string;
  total_events: string | number | null;
  resolved_events: string | number | null;
  win_count: string | number | null;
  win_rate: string | number | null;
  avg_open_ret: string | number | null;
  worst_low_ret: string | number | null;
  recent_wins: string | number | null;
  recent_losses: string | number | null;
  bucket_n10_n5: string | number | null;
  bucket_n5_0: string | number | null;
  bucket_0_p5: string | number | null;
  bucket_p5_p10: string | number | null;
  bucket_p10: string | number | null;
};

/** limit_up_theme_stats 테이블 row (snake_case). 테마명은 themes 조인으로 별도 전달. */
export type LimitUpThemeStatRow = {
  theme_id: string;
  sample_n: string | number | null;
  win_count: string | number | null;
  win_rate: string | number | null;
  avg_open_ret: string | number | null;
};

/**
 * limit_up_events row → LimitUpEvent.
 * next_*_ret 는 NULL 가능(다음날 부재 행은 마이그레이션이 적재 안 하나 방어적 보존),
 * turnover 는 listing_shares 미보유 시 NULL → webapp "—" (보존). trade_amount 는 0 fallback.
 */
export function mapEvent(row: LimitUpEventRow): LimitUpEvent {
  return {
    date: row.date,
    isJeomsang: Boolean(row.is_jeomsang),
    nextOpenRet: toNumOrNull(row.next_open_ret),
    nextHighRet: toNumOrNull(row.next_high_ret),
    nextLowRet: toNumOrNull(row.next_low_ret),
    nextCloseRet: toNumOrNull(row.next_close_ret),
    tradeAmount: toNum(row.trade_amount),
    turnover: toNumOrNull(row.turnover),
  };
}

/**
 * limit_up_stock_stats row → LimitUpStockStats.
 * 카운트 필드는 toNum(0 fallback), 비율/평균은 NULL 보존(toNumOrNull) —
 * win_rate NULL 은 그대로 통과(N≥3 게이팅은 webapp 이 resolvedEvents<3 시 숨김, D-09).
 * histogram = 5 bucket_* 컬럼을 [−10~−5, −5~0, 0~+5, +5~+10, +10%+] 순서로 조립.
 */
export function mapStats(row: LimitUpStockStatsRow): LimitUpStockStats {
  return {
    totalEvents: toNum(row.total_events),
    resolvedEvents: toNum(row.resolved_events),
    winCount: toNum(row.win_count),
    winRate: toNumOrNull(row.win_rate),
    avgOpenRet: toNumOrNull(row.avg_open_ret),
    worstLowRet: toNumOrNull(row.worst_low_ret),
    recentWins: toNum(row.recent_wins),
    recentLosses: toNum(row.recent_losses),
    histogram: [
      toNum(row.bucket_n10_n5),
      toNum(row.bucket_n5_0),
      toNum(row.bucket_0_p5),
      toNum(row.bucket_p5_p10),
      toNum(row.bucket_p10),
    ],
  };
}

/**
 * 종목에 이벤트가 0회인 경우의 zero stats 객체 (limit_up_stock_stats row 부재).
 * 빈 상태(대형주 등)에서 hero 가 항상 객체 형태를 유지하도록 한다 (webapp 빈 상태 처리).
 */
export function zeroStats(): LimitUpStockStats {
  return {
    totalEvents: 0,
    resolvedEvents: 0,
    winCount: 0,
    winRate: null,
    avgOpenRet: null,
    worstLowRet: null,
    recentWins: 0,
    recentLosses: 0,
    histogram: [0, 0, 0, 0, 0],
  };
}

/**
 * limit_up_theme_stats row + themes 조인 name → LimitUpThemeStat.
 * sample_n/win_count 카운트는 toNum, win_rate/avg_open_ret NULL 보존.
 */
export function mapTheme(
  row: LimitUpThemeStatRow,
  name: string,
): LimitUpThemeStat {
  return {
    themeId: row.theme_id,
    themeName: name,
    sampleN: toNum(row.sample_n),
    winRate: toNumOrNull(row.win_rate),
    avgOpenRet: toNumOrNull(row.avg_open_ret),
  };
}
