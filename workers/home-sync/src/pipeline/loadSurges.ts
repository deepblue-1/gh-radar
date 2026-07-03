import type { SupabaseClient } from "@supabase/supabase-js";
import type { HomeSyncConfig } from "../config";

/**
 * Phase 13 Plan 02 Task 1 — 오늘의 급등 종목 + 종목명 + 종목별 top-K 뉴스 로드.
 *
 * 흐름 (server/src/lib/quoteJoin.ts 청크 패턴 계승):
 *   1. stock_quotes.change_rate >= surgeThreshold 필터 → change_rate desc → surgeMax cap.
 *   2. stocks 마스터에서 code→name/market 해석 (청크 IN, QUOTE_CHUNK).
 *   3. news_articles 를 code 청크로 나눠 최근 48h 창(published_at >= now-48h)만 로드 후
 *      **앱 측에서 종목별 2단 정렬 top-K** (newsPerStock) 유지 — 단일 .in() 은 PostgREST
 *      db-max-rows(1000) 에서 통째 truncation 되어 정렬상 뒤쪽 종목의 뉴스가 조용히 사라진다
 *      (D-07 / Pitfall 1).
 *      2단 정렬(광진실업 케이스 fix): 종목명이 title 또는 description 에 포함된 기사를 먼저
 *      배치하고 그 안에서/나머지에서 published_at desc. 시황 라운드업 기사가 최신이라는
 *      이유로 종목 특정 재료 기사를 top-K 밖으로 밀어내는 문제를 막는다.
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
  /** Naver Search API 스니펫 (HTML 태그 포함 가능, nullable). 프롬프트 컨텍스트용. */
  description: string | null;
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

const NEWS_COLS = "id,stock_code,title,url,source,published_at,description";

/** 뉴스 후보 창 — 최근 48h (전일 저녁 공시가 당일 재료이므로 "당일만"은 금물). */
const NEWS_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * 종목당 메모리에 보관할 뉴스 후보 상한 — 48h 창 + 이 cap 으로 정렬 비용을 bound 한다.
 * newsPerStock(기본 5) 보다 넉넉히 잡아 2단 정렬이 종목 특정 재료 기사를 top-K 안으로
 * 끌어올릴 여지를 확보한다. (Supabase 쿼리로 무리하게 풀지 않고 앱 측 슬라이스.)
 */
const NEWS_CANDIDATES_PER_STOCK = 50;

/** loadSurges 재시도 옵션 (기본: 빈 결과 시 2회 재시도, 1.5s 간격). 테스트가 delay 0 주입. */
export interface LoadSurgesOptions {
  emptyRetries?: number;
  retryDelayMs?: number;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 종목명이 뉴스 title 또는 description 에 verbatim 부분문자열로 등장하는가 (2단 정렬 우선순위 신호). */
function nameMatches(n: NewsRow, name: string): boolean {
  if (!name) return false;
  if (n.title.includes(name)) return true;
  return n.description ? n.description.includes(name) : false;
}

export async function loadSurges(
  supabase: SupabaseClient,
  cfg: HomeSyncConfig,
  opts: LoadSurgesOptions = {},
): Promise<Surge[]> {
  const emptyRetries = opts.emptyRetries ?? 2;
  const retryDelayMs = opts.retryDelayMs ?? 1500;

  // 1) 급등 종목 (change_rate >= threshold) — desc 정렬 + surgeMax cap.
  //    빈 결과(0행)는 상류 stock_quotes 갱신 갭 / 일시 read blip 일 수 있으므로 (에러 아닌
  //    빈 성공 응답일 때만) 짧게 재시도한다. 진짜 급등 없는 날은 재시도해도 0 → 빠르게 [] 반환.
  let quoteRows: Array<{ code: string; change_rate: number }> = [];
  for (let attempt = 0; attempt <= emptyRetries; attempt++) {
    const { data, error: qErr } = await supabase
      .from("stock_quotes")
      .select("code,change_rate")
      .gte("change_rate", cfg.surgeThreshold);
    if (qErr) throw qErr;
    quoteRows = (data ?? []) as Array<{ code: string; change_rate: number }>;
    if (quoteRows.length > 0 || attempt === emptyRetries) break;
    await sleep(retryDelayMs);
  }

  const surges = quoteRows
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

  // 3) 종목별 뉴스 후보 로드 (최근 48h 창) — code 청크로 fetch → 종목당 후보 cap 유지.
  //    (단일 .in() 1000-row truncation 회피, D-07 / Pitfall 1.)
  const cutoffIso = new Date(Date.now() - NEWS_WINDOW_MS).toISOString();
  const candidatesByCode = new Map<string, NewsRow[]>();
  for (let i = 0; i < codes.length; i += QUOTE_CHUNK) {
    const chunk = codes.slice(i, i + QUOTE_CHUNK);
    const { data, error } = await supabase
      .from("news_articles")
      .select(NEWS_COLS)
      .in("stock_code", chunk)
      .gte("published_at", cutoffIso)
      .order("published_at", { ascending: false });
    if (error) throw error;
    const chunkSet = new Set(chunk);
    for (const n of (data ?? []) as NewsRow[]) {
      // 청크 밖 종목은 무시 (mock/응답이 전체를 줄 수 있으므로 방어).
      if (!chunkSet.has(n.stock_code)) continue;
      const list = candidatesByCode.get(n.stock_code) ?? [];
      if (list.length < NEWS_CANDIDATES_PER_STOCK) {
        list.push(n);
        candidatesByCode.set(n.stock_code, list);
      }
    }
  }

  // 3b) 종목별 2단 정렬 → top-K. 종목명이 title/description 에 등장하는 기사를 우선 배치하고,
  //     각 그룹 내부는 published_at desc. 시황 라운드업이 재료 기사를 밀어내지 않게 한다.
  const newsByCode = new Map<string, NewsRow[]>();
  for (const [code, cands] of candidatesByCode) {
    const name = nameByCode.get(code) ?? "";
    const sorted = [...cands].sort((a, b) => {
      const am = nameMatches(a, name) ? 0 : 1;
      const bm = nameMatches(b, name) ? 0 : 1;
      if (am !== bm) return am - bm; // 종목명 매칭 기사 우선.
      return b.published_at.localeCompare(a.published_at); // 그룹 내 최신순.
    });
    newsByCode.set(code, sorted.slice(0, cfg.newsPerStock));
  }

  return surges.map((s) => ({
    code: s.code,
    name: nameByCode.get(s.code) ?? s.code,
    changeRate: s.changeRate,
    news: newsByCode.get(s.code) ?? [],
  }));
}
