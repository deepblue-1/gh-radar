import type { ParsedDiscussion } from "../scraper/parseDiscussionsJson.js";

/**
 * Phase 08 — ParsedDiscussion → discussions 테이블 row 매핑.
 *
 * T-07 mitigation: ALLOWED_HOSTS 화이트리스트로 open redirect / 악성 URL 저장 방어.
 *   stock.naver.com 만 허용 (PIVOT JSON API 경로 — 상세 URL 이 stock.naver.com).
 *   레거시 finance.naver.com 호스트도 허용 (사용자 공유 URL 호환).
 *
 * D11 스팸 필터 (제목 <5자 OR URL 포함) 는 여기서 적용하지 **않음** — CONTEXT D11 에 따라
 * worker 는 원본 저장, server query 가 UI 노출 단계에서 필터. worker 에서는 cleanbot
 * 1차 필터만 적용 (parseDiscussionsJson 에서 이미 수행).
 */

export interface DiscussionRow {
  stock_code: string;
  post_id: string;
  title: string;
  body: string | null;
  author: string | null;
  posted_at: string;
  url: string;
  scraped_at: string;
}

const ALLOWED_HOSTS = new Set<string>([
  "stock.naver.com",
  "m.stock.naver.com",
  "finance.naver.com",
  "m.finance.naver.com",
]);

function isAllowedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return ALLOWED_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function mapToDiscussionRow(
  stockCode: string,
  item: ParsedDiscussion,
): DiscussionRow | null {
  const title = item.title?.trim();
  if (!title) return null;

  if (!item.postedAt) return null;
  if (!isAllowedUrl(item.url)) return null;

  const author = item.author?.trim() || null;
  const body = item.body && item.body.trim().length > 0 ? item.body.trim() : null;

  return {
    stock_code: stockCode,
    post_id: item.postId,
    title,
    body,
    author,
    posted_at: item.postedAt,
    url: item.url,
    scraped_at: item.scrapedAt,
  };
}
