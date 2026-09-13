/**
 * stock_quotes / stocks 마스터 청크 IN 조인 헬퍼 (themes.ts 에서 추출 — comovement.ts 와 공유).
 *
 * codes 가 수백~수천 개로 늘면 단일 .in() 이 PostgREST URL 한계(414)로 통째 실패해
 * 빈 응답 회귀를 일으킨다 (2026-06-09 intraday-sync 강세장 회귀, commit 37afcde + tasks/lessons.md).
 * 테마/동조 후보는 종목 합집합이 수천 개일 수 있으므로 반드시 청크 분할 + error throw.
 */

import pLimit from "p-limit";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StockMasterRow, StockQuoteRow } from "../mappers/stock.js";

const QUOTE_COLS =
  "code,price,change_amount,change_rate,volume,trade_amount,open,high,low,market_cap,upper_limit,lower_limit,updated_at";
const MASTER_COLS = "code,name,market";

/** stock_quotes IN 청크 크기 (PostgREST URL 414 방지). */
export const QUOTE_CHUNK = 200;

/**
 * PostgREST 단일 응답 행 한계(Supabase db-max-rows, 기본 1000)에 대응하는 페이지 크기.
 * 한 청크가 매칭하는 결과 행이 1000 을 넘으면 응답이 통째로 잘려 그 너머가 조용히 사라진다.
 * `.range()` 로 끝까지 페이지네이션해 전수 수집한다.
 */
export const ROW_PAGE = 1000;

/**
 * 청크 쿼리 동시 실행 상한. 순차 await 는 청크 수만큼 왕복이 쌓여 /api/themes 가 2초였다
 * (쿼리 20여 회 × 약 80ms). 무제한 병렬은 요청 하나가 PostgREST 커넥션을 독점하므로 상한을 둔다.
 */
export const CHUNK_CONCURRENCY = 6;

/**
 * items 를 size 단위 청크로 나눠 fn 을 CHUNK_CONCURRENCY 병렬로 실행하고 청크 순서대로 결과를 모은다.
 * 하나라도 throw 하면 전체가 reject 된다 (부분 결과로 진행 금지 — 37afcde 교훈).
 */
export async function mapChunks<T, R>(
  items: T[],
  size: number,
  fn: (chunk: T[]) => Promise<R>,
): Promise<R[]> {
  const limit = pLimit(CHUNK_CONCURRENCY);
  const tasks: Promise<R>[] = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    tasks.push(limit(() => fn(chunk)));
  }
  return Promise.all(tasks);
}

/**
 * stock_quotes 를 code 청크(QUOTE_CHUNK)로 나눠 IN fetch → Map<code, quote>.
 * error 는 throw — 조용히 빈 결과로 진행하면 등락률이 전부 0/누락되어 정렬/표시가
 * silent 하게 깨진다 (37afcde 교훈: error 무시 금지).
 */
export async function fetchQuotesChunked(
  supabase: SupabaseClient,
  codes: string[],
): Promise<Map<string, StockQuoteRow>> {
  const pages = await mapChunks(codes, QUOTE_CHUNK, async (chunk) => {
    const { data, error } = await supabase
      .from("stock_quotes")
      .select(QUOTE_COLS)
      .in("code", chunk);
    if (error) throw error;
    return (data ?? []) as unknown as StockQuoteRow[];
  });
  const byCode = new Map<string, StockQuoteRow>();
  for (const q of pages.flat()) byCode.set(q.code, q);
  return byCode;
}

/**
 * stocks 마스터(name/market)를 code 청크로 나눠 IN fetch → Map<code, master>.
 * 상세 응답의 종목명/마켓 캐노니컬 소스.
 */
export async function fetchMastersChunked(
  supabase: SupabaseClient,
  codes: string[],
): Promise<Map<string, StockMasterRow>> {
  const pages = await mapChunks(codes, QUOTE_CHUNK, async (chunk) => {
    const { data, error } = await supabase
      .from("stocks")
      .select(MASTER_COLS)
      .in("code", chunk);
    if (error) throw error;
    return (data ?? []) as unknown as StockMasterRow[];
  });
  const byCode = new Map<string, StockMasterRow>();
  for (const m of pages.flat()) byCode.set(m.code, m);
  return byCode;
}
