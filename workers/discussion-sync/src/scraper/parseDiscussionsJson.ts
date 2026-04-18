import sanitizeHtml from "sanitize-html";
import { parseNaverBoardDate } from "@gh-radar/shared";
import type {
  NaverDiscussionApiResponse,
  NaverDiscussionPost,
} from "./types.js";

/**
 * Phase 08 — Naver discussion JSON API → ParsedDiscussion 변환.
 *
 * PIVOT 규칙:
 *  - `replyDepth === 0` (최상위 글만) + `postType === 'normal'` (뉴스봇 itemNewsResearch 제외)
 *  - body = sanitizeHtml(contentSwReplacedButImg, { allowedTags: [] })
 *    · 이미 plaintext 이지만 defensive 2차 strip — T-01 XSS (tag 잔재 시)
 *    · trim 결과 빈 문자열 → null
 *  - postedAt = parseNaverBoardDate(writtenAt) — ISO no-offset → +09:00 보강
 *  - url = stock.naver.com 통합 상세 URL (chip=all)
 *  - D11 스팸 필터: `isCleanbotPassed === false` 인 post 는 worker 에서 drop.
 *    네이버 API 가 1차로 cleanbot 통과 여부를 flag 해주므로 이를 신뢰. 추가 제목/URL 필터는
 *    CONTEXT D11 에 따라 server query 책임 (본 worker 는 원본 보존).
 */

export interface ParsedDiscussion {
  postId: string;
  title: string;
  body: string | null;
  author: string;
  postedAt: string;
  url: string;
  scrapedAt: string;
  isCleanbotPassed: boolean;
  commentCount: number;
  recommendCount: number;
}

export interface ParseDiscussionsOpts {
  stockCode: string;
  fetchedAt: string; // ISO
}

function sanitizeBody(raw: string): string | null {
  if (!raw) return null;
  const cleaned = sanitizeHtml(raw, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: "discard",
    textFilter: (text) => text.replace(/\s+/g, " "),
  }).trim();
  return cleaned.length > 0 ? cleaned : null;
}

function buildUrl(stockCode: string, postId: string): string {
  return `https://stock.naver.com/domestic/stock/${encodeURIComponent(stockCode)}/discussion/${encodeURIComponent(postId)}?chip=all`;
}

function keep(post: NaverDiscussionPost): boolean {
  if (post.replyDepth !== 0) return false;
  if (post.postType !== "normal") return false;
  // D11 cleanbot 필터: API 가 false 표시한 post 는 drop (stored spam guard).
  if (post.isCleanbotPassed === false) return false;
  return true;
}

export function parseDiscussionsJson(
  raw: NaverDiscussionApiResponse,
  opts: ParseDiscussionsOpts,
): ParsedDiscussion[] {
  const out: ParsedDiscussion[] = [];
  for (const post of raw.posts ?? []) {
    if (!keep(post)) continue;

    const postedAt = parseNaverBoardDate(post.writtenAt);
    if (!postedAt) continue; // timestamp 파싱 실패 row 는 drop (NOT NULL 컬럼)

    const title = post.title?.trim();
    if (!title) continue;

    const body = sanitizeBody(post.contentSwReplacedButImg ?? "");
    const author = post.writer?.nickname?.trim() ?? "";
    if (!author) continue;

    out.push({
      postId: post.id,
      title,
      body,
      author,
      postedAt,
      url: buildUrl(opts.stockCode, post.id),
      scrapedAt: opts.fetchedAt,
      isCleanbotPassed: post.isCleanbotPassed,
      commentCount: post.commentCount,
      recommendCount: post.recommendCount,
    });
  }
  return out;
}
