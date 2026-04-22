import type { Discussion } from "@gh-radar/shared";

/**
 * Phase 08 — Supabase `discussions` snake_case row.
 * Phase 08.1 — `relevance` / `classified_at` 컬럼 추가 (AI 분류 결과).
 *
 * Schema (`supabase/migrations/20260413120000_init_tables.sql:58-71`
 *       + `supabase/migrations/20260422000000_discussions_relevance.sql`):
 *   id (uuid pk) / stock_code / post_id / title / body / author / posted_at / scraped_at
 *   relevance (text, NULL | 'price_reason' | 'theme' | 'news_info' | 'noise')
 *   classified_at (timestamptz, NULL = 미분류)
 *   UNIQUE (stock_code, post_id)
 *
 * 주의: 스키마에 `url` 컬럼이 없다. 응답의 url 은 mapper 가 결정적 재구성.
 */
export type DiscussionRow = {
  id: string;
  stock_code: string;
  post_id: string;
  title: string;
  body: string | null;
  author: string | null;
  posted_at: string;
  scraped_at: string;
  relevance: string | null;
  classified_at: string | null;
};

// PIVOT: 토론방 상세는 stock.naver.com 통합 URL 사용 (cheerio 경로 폐기).
const NAVER_DISCUSSION_BASE = "https://stock.naver.com/domestic/stock";

/**
 * snake_case row → Discussion (camelCase) 변환.
 *
 * `url` 컬럼이 DB 에 없으므로 stock_code + post_id 로 결정적 재구성:
 *   `https://stock.naver.com/domestic/stock/{code}/discussion/{postId}?chip=all`
 *
 * 이 URL 은 worker 의 parseDiscussionsJson + pipeline/map 이 사용하는 형식과 동일 — UI 가
 * 새 탭으로 그대로 열면 네이버 종목토론방 글 상세 페이지로 이동.
 */
export function toDiscussion(row: DiscussionRow): Discussion {
  const url = `${NAVER_DISCUSSION_BASE}/${encodeURIComponent(row.stock_code)}/discussion/${encodeURIComponent(row.post_id)}?chip=all`;
  return {
    id: row.id,
    stockCode: row.stock_code,
    postId: row.post_id,
    title: row.title,
    body: row.body ?? null,
    author: row.author ?? null,
    postedAt: row.posted_at,
    scrapedAt: row.scraped_at,
    url,
    // Phase 08.1 — relevance 값은 DB CHECK 제약(4 라벨 | NULL)에 의해 narrowing 안전.
    relevance: (row.relevance as Discussion['relevance']) ?? null,
    classifiedAt: row.classified_at ?? null,
  };
}
