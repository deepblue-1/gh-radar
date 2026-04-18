import type { NewsArticle } from "@gh-radar/shared";

// Supabase news_articles row — snake_case.
export type NewsRow = {
  id: string;
  stock_code: string;
  title: string;
  /** Phase 07.1 — Naver description 스니펫 (stripHtml 처리됨, Phase 9 AI 요약 입력). */
  description: string | null;
  source: string | null;
  url: string;
  published_at: string;
  content_hash: string | null;
  summary_id: string | null;
  created_at: string;
};

/**
 * news_articles DB row → 공용 NewsArticle (camelCase) 변환.
 * 웹앱은 packages/shared 의 camelCase NewsArticle 을 기대하므로
 * 모든 news API 응답은 이 mapper 를 통과해야 한다.
 */
export function toNewsArticle(row: NewsRow): NewsArticle {
  return {
    id: row.id,
    stockCode: row.stock_code,
    title: row.title,
    description: row.description ?? null,
    source: row.source,
    url: row.url,
    publishedAt: row.published_at,
    contentHash: row.content_hash ?? null,
    summaryId: row.summary_id ?? null,
    createdAt: row.created_at,
  };
}
