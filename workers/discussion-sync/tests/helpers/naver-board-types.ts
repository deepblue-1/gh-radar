/**
 * Naver community discussion JSON API — response shape.
 *
 * Source: https://stock.naver.com/api/community/discussion/posts/by-item
 *         ?discussionType=domesticStock&itemCode={code}&pageSize=50
 *
 * Captured 2026-04-18. Field set is what the Naver SPA consumes; we keep it
 * as a structural type (no runtime validation here — `discussion-sync`
 * worker validates with zod at the seam between fetch and pipeline).
 *
 * Only fields used by gh-radar are commented; the rest are documented as
 * `unknown` to keep the type honest.
 */

export interface NaverDiscussionWriter {
  profileId: string;
  profileType: 'normal' | 'itemNews' | string;
  nickname: string;
  imageUrl?: string;
  isHolderVerified?: boolean;
  isNiConnected?: boolean;
}

export interface NaverDiscussionPost {
  id: string;
  orderNo: string;
  discussionType: 'domesticStock' | string;
  itemCode: string;
  itemName: string;
  postType: 'normal' | 'itemNewsResearch' | string;
  writer: NaverDiscussionWriter;
  /** ISO 8601 KST (no offset suffix). */
  writtenAt: string;
  title: string;
  /** HTML body with profanity replaced; image tags stripped. */
  contentSwReplaced: string;
  /** Plaintext body (HTML stripped) with profanity replaced. */
  contentSwReplacedButImg: string;
  /** Naver editor structured JSON; we don't parse this in v1. */
  contentJsonSwReplaced?: string;
  topImageUrl?: string | null;
  topImageType?: string | null;
  imageCount: number;
  isHolderVerified: boolean;
  isCleanbotPassed: boolean;
  /** > 0 means this post is a reply. */
  replyDepth: number;
  parentId?: string | null;
  childOrderNo?: string | null;
  commentCount: number;
  recommendCount: number;
  notRecommendCount: number;
  /** Per-viewer flags (always false for unauthenticated requests). */
  recommended: boolean;
  notRecommended: boolean;
  reactionId: string | null;
}

export interface NaverDiscussionApiResponse {
  offset: string;
  pageSize: number;
  posts: NaverDiscussionPost[];
  lastOffset?: string;
}
