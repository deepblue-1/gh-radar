'use client';

/**
 * 일 이동평균용 앞 거래일 종가 (Phase 42 D-11 · Q2 · RESEARCH Pattern 6 · Pitfall 8).
 *
 * - 기존 `daily-ohlcv-api.ts`(종목상세 일봉 차트)와 같은 브라우저 Supabase 직접 읽기 — 서버 · RPC 변경 없음.
 *   `stock_daily_ohlcv` SELECT 는 anon + authenticated 허용(20260515163000_fix_stock_daily_ohlcv_rls_authenticated.sql).
 * - **보는 날짜 앞 거래일만**(`.lt`) — 그날 행은 장중 intraday upsert 로 진행 중인 종가라 「앞 거래일」 이 아니다.
 * - 내림차순 + `limit(n)` 으로 가장 가까운 n 개만 받고 뒤집어 오름차순으로 돌려준다(정렬 명시 — PostgREST 기본 순서 없음).
 * - `close` 는 numeric(20,2) 라 문자열로 올 수 있어 `Number()` · 종가 0 이하 행(의미 없는 행)은 뺀다.
 * - **연속성(IN-04)** — 가장 가까운 종가 행과 보는 날짜 사이 평일이 `PREV_CLOSE_MAX_GAP_WEEKDAYS` 를 넘으면 앞 거래일 행이 빠진
 *   것(일봉 동기화 지연 · 실패)으로 보고 `[]` 를 돌려준다 → 일 이동평균은 「지난 거래일 종가가 모자라」 안내로 떨어진다(이틀 전 종가부터
 *   N − 1 개를 써서 틀린 선을 그리지 않는다). 거래소 휴장 달력이 없어 하루 이틀 빠진 것은 휴일과 구분하지 못한다(긴 공백만 잡는다).
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

/**
 * 가장 가까운 종가 행과 보는 날짜 사이에 허용하는 평일 수 — 설 · 추석 긴 연휴(평일 휴장 5일 안팎)보다 넉넉히 잡아 정상 공백으로
 * 본다. 이보다 길면 앞 거래일 행이 빠졌다(일봉 동기화 지연 · 실패).
 */
export const PREV_CLOSE_MAX_GAP_WEEKDAYS = 6;

/** ISO 날짜 a(그날 제외) ~ b(그날 제외) 사이 평일 수 — `limit` 을 넘으면 거기서 멈춘다. */
function weekdaysBetween(aIso: string, bIso: string, limit: number): number {
  const DAY = 86_400_000;
  const a = Date.parse(`${aIso}T00:00:00Z`);
  const b = Date.parse(`${bIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  let n = 0;
  for (let t = a + DAY; t < b && n <= limit; t += DAY) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) n += 1;
  }
  return n;
}

/**
 * 종목 `code` 의 `ymd` 앞 거래일 종가 최대 `n` 개(오름차순). 가장 가까운 행이 보는 날짜에서 평일
 * `PREV_CLOSE_MAX_GAP_WEEKDAYS` 넘게 떨어져 있으면 `[]`(앞 거래일 행 빠짐). abort 면 Supabase 가 AbortError 를 던진다.
 */
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
  const rows = (data as RawCloseRow[])
    .map((r) => ({ date: r.date, close: Number(r.close) }))
    .filter((r) => r.close > 0);
  // 내림차순 — 첫 행이 가장 가까운 앞 거래일 후보
  const gap = rows.length > 0 ? weekdaysBetween(rows[0]!.date, isoOf(ymd), PREV_CLOSE_MAX_GAP_WEEKDAYS) : 0;
  if (gap > PREV_CLOSE_MAX_GAP_WEEKDAYS) return [];
  return rows.map((r) => r.close).reverse();
}
