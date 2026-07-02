import type { SupabaseClient } from "@supabase/supabase-js";
import { loadConfig } from "../../config.js";
import { logger } from "../../logger.js";
import { NEWS_SPECIALIST_PROMPT } from "../chat-prompts.js";
import { getChatAnthropicClient } from "./anthropic-client.js";
import { specialistText, SPECIALIST_UNAVAILABLE } from "./helpers.js";
import type { SpecialistInput } from "./quote-specialist.js";

/**
 * Phase 14 — ③뉴스·심리 전문가 (CHAT-01, RESEARCH Pattern 2).
 *
 * 결정적 조회: news_articles(title/source/url/published_at verbatim, D-08) +
 * discussions(relevance != 'noise' — 의미 있는 글만, discussions 라우트 filter=meaningful 미러) → Haiku 1콜.
 * 뉴스 제목/URL 은 verbatim 주입 — 프롬프트가 환각 없이 입력 중 선택만 하게 함(D-08). 내부 루프 없음.
 */

const NEWS_COLS = "title,source,url,published_at";
const DISCUSSION_COLS = "title,body,relevance,posted_at";
const NEWS_WINDOW_MS = 7 * 86400_000;
const DISCUSSION_WINDOW_MS = 3 * 86400_000;

async function fetchNewsContext(
  supabase: SupabaseClient,
  code: string,
): Promise<Record<string, unknown>> {
  try {
    const newsSince = new Date(Date.now() - NEWS_WINDOW_MS).toISOString();
    const { data: newsRows } = await supabase
      .from("news_articles")
      .select(NEWS_COLS)
      .eq("stock_code", code)
      .gte("published_at", newsSince)
      .order("published_at", { ascending: false })
      .limit(15);
    // title/source/url/published_at 만 주입 (verbatim, D-08 — 본문 없음).
    const news = ((newsRows ?? []) as Array<{
      title: string;
      source: string | null;
      url: string;
      published_at: string;
    }>).map((r) => ({
      title: r.title,
      source: r.source,
      url: r.url,
      publishedAt: r.published_at,
    }));

    // discussions — relevance IS NULL OR relevance != 'noise' (noise 제외, meaningful).
    // discussions 라우트의 filter=meaningful 필터와 동일 문자열.
    const discSince = new Date(Date.now() - DISCUSSION_WINDOW_MS).toISOString();
    const { data: discRows } = await supabase
      .from("discussions")
      .select(DISCUSSION_COLS)
      .eq("stock_code", code)
      .gte("posted_at", discSince)
      .or("relevance.is.null,relevance.neq.noise")
      .order("posted_at", { ascending: false })
      .limit(20);
    const discussions = ((discRows ?? []) as Array<{
      title: string;
      body: string | null;
      relevance: string | null;
    }>).map((r) => ({ title: r.title, body: r.body, relevance: r.relevance }));

    return { news, discussions };
  } catch (err) {
    logger.warn({ code, err: (err as Error).message }, "news specialist fetch failed");
    return {};
  }
}

/** 뉴스·심리 전문가 상담. Haiku 1콜로 opinion 텍스트 반환. */
export async function consultNewsSpecialist(
  supabase: SupabaseClient,
  input: SpecialistInput,
): Promise<string> {
  const cfg = loadConfig();
  if (!cfg.anthropicApiKey) return SPECIALIST_UNAVAILABLE;
  if (!input.code) return SPECIALIST_UNAVAILABLE;

  const data = await fetchNewsContext(supabase, input.code);
  try {
    const client = getChatAnthropicClient(cfg.anthropicApiKey);
    const res = await client.messages.create({
      model: cfg.chatSpecialistModel,
      max_tokens: 700,
      // Sonnet 5: temperature 400 거부 → 제거. 단발 요약 콜 — thinking 명시 비활성.
      thinking: { type: "disabled" },
      system: NEWS_SPECIALIST_PROMPT,
      messages: [
        { role: "user", content: `질문:${input.question}\n데이터:${JSON.stringify(data)}` },
      ],
    });
    return specialistText(res) || SPECIALIST_UNAVAILABLE;
  } catch (err) {
    logger.warn({ code: input.code, err: (err as Error).message }, "news specialist haiku failed");
    return SPECIALIST_UNAVAILABLE;
  }
}
