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
  /**
   * Phase 07.1 — Naver description 스니펫(stripHtml 처리됨).
   * 빈 문자열 또는 미제공 시 null — Phase 9 AI 요약 입력 필드.
   */
  description: string | null;
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
 *  - description (Phase 07.1) = stripHtml(item.description); 빈 문자열 → null
 *  - url = item.originallink || item.link (폴백)
 *  - http/https 외 프로토콜 → null 반환 (T-02)
 *  - published_at = parsePubDate(item.pubDate); 실패 시 null 반환
 *  - source = extractSourcePrefix(url)
 *  - content_hash = sha256(title + '\n' + descStripped) — 계산식 불변 (기존 row 와 동일성 보장)
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
    description: descStripped.length > 0 ? descStripped : null,
    source: extractSourcePrefix(rawUrl),
    url: rawUrl,
    published_at: publishedIso,
    content_hash: contentHash,
  };
}
