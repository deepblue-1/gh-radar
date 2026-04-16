/**
 * Phase 06.2 Plan 06 Task 1 — Watchlist API (Supabase 직접 CRUD).
 *
 * 설계:
 * - Scanner 는 Express `/api/scanner` 경유 (서버 집계 + `X-Last-Updated-At` 헤더),
 *   Watchlist 는 Supabase PostgREST 직접 (RLS `auth.uid() = user_id` 가 자동 필터).
 * - `fetchWatchlist` 는 `watchlists → stocks!inner → stock_quotes` embedded resource
 *   JOIN 으로 필요한 필드만 한 번에 가져온다. (RESEARCH §Pattern 9)
 * - `stock:stocks!inner` 로 stocks 마스터 누락 row 는 제외 — FK CASCADE 로 실제 발생
 *   여지는 없지만 race 방어 (T-06.2-25).
 * - `.order("added_at", { ascending: false })` 기본 정렬 — UI v1 고정 (position 컬럼은
 *   후속 드래그 리오더 대비 확보).
 *
 * 보안:
 * - RLS 정책 `auth_select_own_watchlists` (auth.uid() = user_id) 이 DB 레벨에서 본인 row
 *   만 반환. 클라이언트 쿼리가 `user_id` 필터를 명시하지 않아도 안전 (T-06.2-24).
 * - addWatchlistItem / removeWatchlistItem 은 `user_id` 파라미터를 명시해 RLS WITH CHECK
 *   일관성 보장. 50-limit 은 BEFORE INSERT trigger (SQLSTATE P0001) 가 집행 — Plan 07
 *   ⭐ 토글이 소비.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface WatchlistRow {
  stockCode: string;
  addedAt: string;
  position: number | null;
  stock: {
    code: string;
    name: string;
    market: 'KOSPI' | 'KOSDAQ';
    kosdaqSegment: string | null;
  };
  quote: {
    price: number;
    changeAmount: number;
    changeRate: number;
    tradeAmount: number;
    updatedAt: string;
  } | null;
}

interface RawStock {
  code: string;
  name: string;
  market: 'KOSPI' | 'KOSDAQ';
  kosdaq_segment: string | null;
}

interface RawQuote {
  price: number | string;
  change_amount: number | string;
  change_rate: number | string;
  trade_amount: number | string;
  updated_at: string;
}

interface RawWatchlistRow {
  stock_code: string;
  added_at: string;
  position: number | null;
  stock: RawStock;
  quote: RawQuote | null;
}

/**
 * 로그인 사용자의 관심종목을 added_at DESC 순으로 조회한다.
 *
 * RLS 가 자동으로 `auth.uid() = user_id` 필터링 — 클라이언트에서 user_id 전달 불필요.
 * 반환 타입은 `{ data, error }` 로 Supabase 규약과 동일 — 에러 처리 책임은 호출자에.
 */
export async function fetchWatchlist(
  supabase: SupabaseClient,
): Promise<{ data: WatchlistRow[] | null; error: Error | null }> {
  const { data, error } = await supabase
    .from('watchlists')
    .select(
      `
      stock_code,
      added_at,
      position,
      stock:stocks!inner (
        code,
        name,
        market,
        kosdaq_segment
      ),
      quote:stock_quotes (
        price,
        change_amount,
        change_rate,
        trade_amount,
        updated_at
      )
      `,
    )
    .order('added_at', { ascending: false });

  if (error) return { data: null, error };
  if (!data) return { data: null, error: null };

  const mapped: WatchlistRow[] = (data as unknown as RawWatchlistRow[]).map(
    (row) => ({
      stockCode: row.stock_code,
      addedAt: row.added_at,
      position: row.position,
      stock: {
        code: row.stock.code,
        name: row.stock.name,
        market: row.stock.market,
        kosdaqSegment: row.stock.kosdaq_segment,
      },
      quote: row.quote
        ? {
            price: Number(row.quote.price),
            changeAmount: Number(row.quote.change_amount),
            changeRate: Number(row.quote.change_rate),
            tradeAmount: Number(row.quote.trade_amount),
            updatedAt: row.quote.updated_at,
          }
        : null,
    }),
  );

  return { data: mapped, error: null };
}

/**
 * 관심종목 추가. user_id 는 WITH CHECK 일관성 위해 명시 전달.
 * 50-limit 위반 시 Supabase 가 PostgreSQL SQLSTATE `P0001` (watchlist_limit_exceeded) 반환.
 */
export async function addWatchlistItem(
  supabase: SupabaseClient,
  userId: string,
  stockCode: string,
) {
  return supabase
    .from('watchlists')
    .insert({ user_id: userId, stock_code: stockCode });
}

/** 관심종목 해제. PK `(user_id, stock_code)` 로 단일 row 매칭. */
export async function removeWatchlistItem(
  supabase: SupabaseClient,
  userId: string,
  stockCode: string,
) {
  return supabase
    .from('watchlists')
    .delete()
    .eq('user_id', userId)
    .eq('stock_code', stockCode);
}
