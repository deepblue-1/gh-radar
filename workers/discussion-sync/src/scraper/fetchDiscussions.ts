import type { AxiosInstance } from "axios";
import { z } from "zod";
import type { DiscussionSyncConfig } from "../config.js";
import { fetchViaProxy } from "../proxy/client.js";
import { NaverApiValidationError } from "../proxy/errors.js";
import type { NaverDiscussionApiResponse } from "./types.js";

/**
 * Phase 08 — Naver discussion JSON API fetcher (Bright Data Web Unlocker 경유).
 *
 * POC §4 확정:
 *   GET https://stock.naver.com/api/community/discussion/posts/by-item
 *     ?discussionType=domesticStock
 *     &itemCode={code}
 *     &isHolderOnly=false           ← required (zod validation server-side)
 *     &excludesItemNews=false       ← required
 *     &isItemNewsOnly=false         ← required
 *     &isCleanbotPassedOnly=false
 *     &pageSize=50
 *
 * 필수 3 파라미터 누락 시 네이버 API 가 207B 에러 응답:
 *   `{"detailCode":"invalid_type,...","fieldErrors":{...}}`
 * → 본 fetcher 는 항상 3 파라미터 명시.
 *
 * Response 는 UTF-8 JSON. Bright Data Web Unlocker 가 인코딩 + 차단 회피 + country=kr routing.
 */

export interface FetchDiscussionsInput {
  itemCode: string;
  pageSize?: number;
  isHolderOnly?: boolean;
  excludesItemNews?: boolean;
  isItemNewsOnly?: boolean;
  isCleanbotPassedOnly?: boolean;
  /** 다음 페이지 cursor — 이전 응답의 lastOffset 값. 미지정 시 첫 페이지. */
  offset?: string;
}

// zod schema — 필드 중 gh-radar 가 실제 사용하는 것들만 strict 검증.
const WriterSchema = z
  .object({
    profileId: z.string(),
    profileType: z.string(),
    nickname: z.string(),
  })
  .passthrough();

const PostSchema = z
  .object({
    id: z.string(),
    itemCode: z.string(),
    itemName: z.string(),
    postType: z.string(),
    writer: WriterSchema,
    writtenAt: z.string(),
    title: z.string(),
    // 일부 post 는 본문 없음 (이미지/투표만 등) — null 허용. parser 가 빈 body 로 처리.
    contentSwReplacedButImg: z.string().nullable(),
    replyDepth: z.number(),
    commentCount: z.number(),
    recommendCount: z.number(),
    isCleanbotPassed: z.boolean(),
  })
  .passthrough();

const ApiResponseSchema = z
  .object({
    pageSize: z.number(),
    posts: z.array(PostSchema),
  })
  .passthrough();

interface ResolvedFetchDiscussionsInput {
  itemCode: string;
  pageSize: number;
  isHolderOnly: boolean;
  excludesItemNews: boolean;
  isItemNewsOnly: boolean;
  isCleanbotPassedOnly: boolean;
  offset?: string;
}

function buildTargetUrl(
  base: string,
  input: ResolvedFetchDiscussionsInput,
): string {
  const params = new URLSearchParams({
    discussionType: "domesticStock",
    itemCode: input.itemCode,
    isHolderOnly: String(input.isHolderOnly),
    excludesItemNews: String(input.excludesItemNews),
    isItemNewsOnly: String(input.isItemNewsOnly),
    isCleanbotPassedOnly: String(input.isCleanbotPassedOnly),
    pageSize: String(input.pageSize),
  });
  if (input.offset) params.set("offset", input.offset);
  return `${base}?${params.toString()}`;
}

export async function fetchDiscussions(
  input: FetchDiscussionsInput,
  deps: { proxy: AxiosInstance; cfg: DiscussionSyncConfig },
): Promise<NaverDiscussionApiResponse> {
  const resolved: ResolvedFetchDiscussionsInput = {
    itemCode: input.itemCode,
    pageSize: input.pageSize ?? deps.cfg.discussionSyncPageSize,
    isHolderOnly: input.isHolderOnly ?? false,
    excludesItemNews: input.excludesItemNews ?? false,
    isItemNewsOnly: input.isItemNewsOnly ?? false,
    isCleanbotPassedOnly: input.isCleanbotPassedOnly ?? false,
    offset: input.offset,
  };
  const targetUrl = buildTargetUrl(deps.cfg.naverDiscussionApiBase, resolved);
  const raw = await fetchViaProxy(deps.proxy, deps.cfg, targetUrl);

  // 필수 파라미터 누락 감지 (207B 에러 응답 가드)
  if (raw.length < 400 && /fieldErrors|detailCode|invalid_type/i.test(raw)) {
    throw new NaverApiValidationError(
      `naver api validation error (missing required params?): ${raw.slice(0, 200)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new NaverApiValidationError(
      `naver api response not JSON (first 200 bytes): ${raw.slice(0, 200)}`,
    );
  }

  const result = ApiResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new NaverApiValidationError(
      `naver api schema mismatch: ${result.error.message}`,
    );
  }
  return result.data as unknown as NaverDiscussionApiResponse;
}
