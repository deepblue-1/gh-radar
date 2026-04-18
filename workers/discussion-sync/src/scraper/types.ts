/**
 * Phase 08 — Naver community discussion JSON API response shape.
 *
 * Mirror of workers/discussion-sync/tests/helpers/naver-board-types.ts (POC fixture).
 * src 는 tests/ 의 타입을 import 하면 tsc rootDir 위반 — src 쪽에서 공식 타입 보유.
 *
 * Source: https://stock.naver.com/api/community/discussion/posts/by-item
 *         ?discussionType=domesticStock&itemCode={code}&pageSize=50
 *
 * gh-radar 가 사용하는 필드만 strict 타입. 나머지는 optional / unknown 허용.
 */

export interface NaverDiscussionWriter {
  profileId: string;
  profileType: "normal" | "itemNews" | string;
  nickname: string;
  imageUrl?: string | null;
  isHolderVerified?: boolean;
  isNiConnected?: boolean;
}

export interface NaverDiscussionPost {
  id: string;
  orderNo?: string;
  discussionType?: "domesticStock" | string;
  itemCode: string;
  itemName: string;
  postType: "normal" | "itemNewsResearch" | string;
  writer: NaverDiscussionWriter;
  /** ISO 8601 KST (no offset suffix). */
  writtenAt: string;
  title: string;
  /** HTML body with profanity replaced. */
  contentSwReplaced?: string;
  /** Plaintext body (HTML stripped) with profanity replaced. null = 본문 없음 (이미지/투표만). */
  contentSwReplacedButImg: string | null;
  topImageUrl?: string | null;
  imageCount?: number;
  isHolderVerified?: boolean;
  isCleanbotPassed: boolean;
  /** > 0 means this post is a reply. */
  replyDepth: number;
  parentId?: string | null;
  commentCount: number;
  recommendCount: number;
  notRecommendCount?: number;
}

export interface NaverDiscussionApiResponse {
  offset?: string;
  pageSize: number;
  posts: NaverDiscussionPost[];
  lastOffset?: string;
}
