import { createHash } from "node:crypto";
import {
  stripHtml,
  parsePubDate,
  extractSourcePrefix,
} from "@gh-radar/shared";
import type { NaverNewsItem } from "../naver/searchNews.js";

export interface NewsArticleRow {
  stock_code: string;
  title: string;
  source: string | null;
  url: string;
  published_at: string;
  content_hash: string;
}

/**
 * T-02 mitigation: http/https 프로토콜만 허용. javascript:/ftp: 등은 reject.
 */
function isAllowedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Phase 07 — Naver Search API item → news_articles row 매핑.
 *
 * 변환 규칙:
 *  - title = stripHtml(item.title) — V-04 (HTML tag/entity 제거)
 *  - url = item.originallink || item.link (폴백)
 *  - http/https 외 프로토콜 → null 반환 (T-02)
 *  - published_at = parsePubDate(item.pubDate); 실패 시 null 반환
 *  - source = extractSourcePrefix(url)
 *  - content_hash = sha256(title + '\n' + stripHtml(description))
 */
export function mapToNewsRow(
  stockCode: string,
  item: NaverNewsItem,
): NewsArticleRow | null {
  const rawUrl = item.originallink?.trim() || item.link?.trim();
  if (!rawUrl || !isAllowedUrl(rawUrl)) return null;

  const title = stripHtml(item.title);
  if (!title) return null;

  const publishedIso = parsePubDate(item.pubDate);
  if (!publishedIso) return null;

  const descStripped = stripHtml(item.description ?? "");
  const contentHash = createHash("sha256")
    .update(title + "\n" + descStripped)
    .digest("hex");

  return {
    stock_code: stockCode,
    title,
    source: extractSourcePrefix(rawUrl),
    url: rawUrl,
    published_at: publishedIso,
    content_hash: contentHash,
  };
}
