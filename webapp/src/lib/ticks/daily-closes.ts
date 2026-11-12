'use client';

/**
 * 일 이동평균용 앞 거래일 종가 (Phase 42 D-11 · Q2 · RESEARCH Pattern 6 · Pitfall 8).
 *
 * - 기존 `daily-ohlcv-api.ts`(종목상세 일봉 차트)와 같은 브라우저 Supabase 직접 읽기 — 서버 · RPC 변경 없음.
 *   `stock_daily_ohlcv` SELECT 는 anon + authenticated 허용(20260515163000_fix_stock_daily_ohlcv_rls_authenticated.sql).
 * - **보는 날짜 앞 거래일만**(`.lt`) — 그날 행은 장중 intraday upsert 로 진행 중인 종가라 「앞 거래일」 이 아니다.
 * - 내림차순 + `limit(n)` 으로 가장 가까운 n 개만 받고 뒤집어 오름차순으로 돌려준다(정렬 명시 — PostgREST 기본 순서 없음).
 * - `close` 는 numeric(20,2) 라 문자열로 올 수 있어 `Number()` · 종가 0 이하 행(의미 없는 행)은 뺀다.
 * - 이 파일은 `daily-ohlcv-api.ts` 와 같은 예외로 클라이언트 지시문을 둔다(브라우저 Supabase 클라이언트).
 */

import { createClient } from '@/lib/supabase/client';

interface RawCloseRow {
  date: string;
  close: number | string;
}

/** 'YYYYMMDD'(TickSession.date) → 'YYYY-MM-DD'. */
function isoOf(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

/** 종목 `code` 의 `ymd` 앞 거래일 종가 최대 `n` 개(오름차순). abort 면 Supabase 가 AbortError 를 던진다. */
export async function fetchPrevCloses(
  code: string,
  ymd: string,
  n: number,
  signal?: AbortSignal,
): Promise<number[]> {
  let query = createClient()
    .from('stock_daily_ohlcv')
    .select('date, close')
    .eq('code', code)
    .lt('date', isoOf(ymd))
    .order('date', { ascending: false })
    .limit(n);
  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;
  if (error) throw error;
  if (!data) return [];
  return (data as RawCloseRow[])
    .map((r) => Number(r.close))
    .filter((c) => c > 0)
    .reverse();
}
