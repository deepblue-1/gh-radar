import type Anthropic from "@anthropic-ai/sdk";
import { loadConfig } from "../../config.js";
import { logger } from "../../logger.js";
import { WEBSEARCH_SPECIALIST_PROMPT } from "../chat-prompts.js";
import { getChatAnthropicClient } from "./anthropic-client.js";
import { specialistText } from "./helpers.js";

/**
 * Phase 14 — ⑤실시간 웹서치 전문가 (CHAT-01, RESEARCH Pattern 2 — 예외: Anthropic web_search 서버 tool).
 *
 * 데이터 전문가 4종과 달리 DB 조회가 아니라 Anthropic `web_search` 서버 tool 로 오늘 속보·공시·
 * 장중 이슈를 실시간 조회한다. 팀장이 DB 로 답할 수 없을 때만 호출(D-12, 비용 $10/1,000회).
 *
 * 비용/안정성:
 *   - max_uses: 3 — 한 상담당 웹서치 횟수 상한 (D-12 비용, T-14-04b).
 *   - user_location country=KR / Asia/Seoul — 국내 검색 정확도 (Pitfall 7).
 *   - chatWebSearchModel 기본 Haiku — web_search 미지원 관측 시 env=claude-sonnet-4-6 폴백
 *     (RESEARCH A2, config 별도 키). 이 함수는 web_search_tool_result_error / 예외를 삼켜
 *     빈 citations + 안내 텍스트를 반환 → 팀장이 나머지 전문가로 답변 가능(Pitfall 1).
 */

/** 웹서치 미가용 시 graceful 안내 텍스트 (Pitfall 1 — Haiku 미지원/에러). */
const WEBSEARCH_UNAVAILABLE = "실시간 검색을 사용할 수 없습니다.";

/** web_search 서버 tool 정의 — basic 버전(web_search_20250305)으로 충분(코드실행 불요). */
const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 3,
  user_location: {
    type: "approximate",
    country: "KR",
    timezone: "Asia/Seoul",
  },
} as const;

export interface WebSearchResult {
  text: string;
  citations: Array<{ title: string; url: string }>;
}

/**
 * 응답 content 에서 web_search_result_location citation 을 { title, url } 로 추출(D-08).
 * url 기준 dedupe. 없으면 빈 배열.
 */
function extractCitations(res: Anthropic.Message): Array<{ title: string; url: string }> {
  const out: Array<{ title: string; url: string }> = [];
  const seen = new Set<string>();
  for (const block of res.content) {
    if (block.type !== "text") continue;
    const citations = (block as { citations?: unknown }).citations;
    if (!Array.isArray(citations)) continue;
    for (const c of citations) {
      if (
        c &&
        typeof c === "object" &&
        (c as { type?: string }).type === "web_search_result_location"
      ) {
        const url = (c as { url?: unknown }).url;
        const title = (c as { title?: unknown }).title;
        if (typeof url === "string" && !seen.has(url)) {
          seen.add(url);
          out.push({ title: typeof title === "string" && title ? title : url, url });
        }
      }
    }
  }
  return out;
}

/** 응답에 web_search_tool_result_error 가 있으면 true (Haiku 미지원 등, Pitfall 1). */
function hasWebSearchError(res: Anthropic.Message): boolean {
  for (const block of res.content) {
    const b = block as { type?: string; content?: unknown };
    if (b.type === "web_search_tool_result") {
      const content = b.content as { type?: string } | undefined;
      if (content && content.type === "web_search_tool_result_error") return true;
    }
    if (b.type === "web_search_tool_result_error") return true;
  }
  return false;
}

/**
 * 실시간 웹서치 전문가 상담. web_search tool 로 검색 후 { text, citations } 반환.
 * 에러/미지원/키 미설정 시 graceful — 빈 citations + 안내 텍스트 (throw 안 함).
 */
export async function consultWebSearchSpecialist(input: {
  question: string;
}): Promise<WebSearchResult> {
  const cfg = loadConfig();
  if (!cfg.anthropicApiKey) return { text: WEBSEARCH_UNAVAILABLE, citations: [] };

  try {
    const client = getChatAnthropicClient(cfg.anthropicApiKey);
    const res = await client.messages.create({
      model: cfg.chatWebSearchModel,
      max_tokens: 1024,
      system: WEBSEARCH_SPECIALIST_PROMPT,
      messages: [{ role: "user", content: input.question }],
      tools: [WEB_SEARCH_TOOL as unknown as Anthropic.Messages.ToolUnion],
    });
    if (hasWebSearchError(res)) {
      logger.warn({}, "web_search returned tool_result_error — graceful fallback");
      return { text: WEBSEARCH_UNAVAILABLE, citations: [] };
    }
    return {
      text: specialistText(res) || WEBSEARCH_UNAVAILABLE,
      citations: extractCitations(res),
    };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "websearch specialist failed");
    return { text: WEBSEARCH_UNAVAILABLE, citations: [] };
  }
}
