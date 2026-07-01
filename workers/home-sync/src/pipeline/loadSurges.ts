import type { SupabaseClient } from "@supabase/supabase-js";
import type { HomeSyncConfig } from "../config";

/**
 * Phase 13 Plan 02 Task 1 — 오늘의 급등 종목 + 종목명 + 종목별 top-K 뉴스 로드.
 *
 * 흐름 (server/src/lib/quoteJoin.ts 청크 패턴 계승):
 *   1. stock_quotes.change_rate >= surgeThreshold 필터 → change_rate desc → surgeMax cap.
 *   2. stocks 마스터에서 code→name/market 해석 (청크 IN, QUOTE_CHUNK).
 *   3. news_articles 를 code 청크로 나눠 published_at desc 로드 후 **앱 측에서 종목별 top-K**
 *      (newsPerStock) 만 유지 — 단일 .in() 은 PostgREST db-max-rows(1000) 에서 통째 truncation
 *      되어 정렬상 뒤쪽 종목의 뉴스가 조용히 사라진다 (D-07 / Pitfall 1).
 *
 * Claude 입력은 이 Surge[] 로부터 clusterSurges 가 구성한다 (번호 매긴 뉴스 인덱스).
 */

/** news_articles 행 (Claude 뉴스 인덱스 해석의 verbatim 소스). */
export interface NewsRow {
  id: string;
  stock_code: string;
  title: string;
  url: string;
  source: string | null;
  published_at: string;
}

/** 급등 종목 1건 — 코드/이름/등락률 + 종목별 top-K 뉴스. */
export interface Surge {
  code: string;
  name: string;
  changeRate: number;
  news: NewsRow[];
}

/** stock_quotes / stocks / news_articles 청크 IN 크기 (PostgREST URL 414 방지). */
const QUOTE_CHUNK = 200;

const NEWS_COLS = "id,stock_code,title,url,source,published_at";

export async function loadSurges(
  supabase: SupabaseClient,
  cfg: HomeSyncConfig,
): Promise<Surge[]> {
  // 1) 급등 종목 (change_rate >= threshold) — desc 정렬 + surgeMax cap.
  const { data: quoteRows, error: qErr } = await supabase
    .from("stock_quotes")
    .select("code,change_rate")
    .gte("change_rate", cfg.surgeThreshold);
  if (qErr) throw qErr;

  const surges = ((quoteRows ?? []) as Array<{ code: string; change_rate: number }>)
    .map((r) => ({ code: r.code, changeRate: Number(r.change_rate) }))
    .sort((a, b) => b.changeRate - a.changeRate)
    .slice(0, cfg.surgeMax);

  if (surges.length === 0) return [];

  const codes = surges.map((s) => s.code);

  // 2) 종목명 해석 (stocks 마스터, code 청크 IN).
  const nameByCode = new Map<string, string>();
  for (let i = 0; i < codes.length; i += QUOTE_CHUNK) {
    const chunk = codes.slice(i, i + QUOTE_CHUNK);
    const { data, error } = await supabase
      .from("stocks")
      .select("code,name,market")
      .in("code", chunk);
    if (error) throw error;
    for (const m of (data ?? []) as Array<{ code: string; name: string }>) {
      nameByCode.set(m.code, m.name);
    }
  }

  // 3) 종목별 top-K 뉴스 — code 청크로 fetch → 앱 측에서 종목별 newsPerStock 유지.
  //    (단일 .in() 1000-row truncation 회피, D-07 / Pitfall 1.)
  const newsByCode = new Map<string, NewsRow[]>();
  for (let i = 0; i < codes.length; i += QUOTE_CHUNK) {
    const chunk = codes.slice(i, i + QUOTE_CHUNK);
    const { data, error } = await supabase
      .from("news_articles")
      .select(NEWS_COLS)
      .in("stock_code", chunk)
      .order("published_at", { ascending: false });
    if (error) throw error;
    const chunkSet = new Set(chunk);
    for (const n of (data ?? []) as NewsRow[]) {
      // 청크 밖 종목은 무시 (mock/응답이 전체를 줄 수 있으므로 방어).
      if (!chunkSet.has(n.stock_code)) continue;
      const list = newsByCode.get(n.stock_code) ?? [];
      if (list.length < cfg.newsPerStock) {
        list.push(n);
        newsByCode.set(n.stock_code, list);
      }
    }
  }

  return surges.map((s) => ({
    code: s.code,
    name: nameByCode.get(s.code) ?? s.code,
    changeRate: s.changeRate,
    news: newsByCode.get(s.code) ?? [],
  }));
}
