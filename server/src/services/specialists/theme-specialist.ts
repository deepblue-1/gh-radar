import type { SupabaseClient } from "@supabase/supabase-js";
import { loadConfig } from "../../config.js";
import { logger } from "../../logger.js";
import { THEME_SPECIALIST_PROMPT } from "../chat-prompts.js";
import { getChatAnthropicClient } from "./anthropic-client.js";
import { specialistText, SPECIALIST_UNAVAILABLE } from "./helpers.js";
import type { SpecialistInput } from "./quote-specialist.js";

/**
 * Phase 14 — ②테마 전문가 (CHAT-01, RESEARCH Pattern 2).
 *
 * 결정적 조회: 종목의 active 소속 테마(theme_stocks, effective_to IS NULL) → 테마 메타
 * (themes: name/description/top3_avg_change_rate) + 테마 동조(theme_comovement) → Haiku 1콜.
 * 내부 tool-use 루프 없음. max_tokens=700.
 */

const THEME_META_COLS = "id,name,description,top3_avg_change_rate";
const COMOVEMENT_COLS = "theme_id,conf_d0,conf_d1,lift,avg_ret";

async function fetchThemeContext(
  supabase: SupabaseClient,
  code: string,
): Promise<Record<string, unknown>> {
  try {
    // active 멤버십 (effective_to IS NULL — 시스템/유저 테마 소속).
    const { data: memberRows } = await supabase
      .from("theme_stocks")
      .select("theme_id")
      .eq("stock_code", code)
      .is("effective_to", null);
    const themeIds = [
      ...new Set(((memberRows ?? []) as { theme_id: string }[]).map((r) => r.theme_id)),
    ];

    let themes: Array<{ name: string; description: string | null; top3AvgChangeRate: number | null }> = [];
    if (themeIds.length > 0) {
      const { data: themeMeta } = await supabase
        .from("themes")
        .select(THEME_META_COLS)
        .in("id", themeIds)
        .eq("hidden", false);
      themes = ((themeMeta ?? []) as Array<{
        name: string;
        description: string | null;
        top3_avg_change_rate: string | number | null;
      }>).map((t) => ({
        name: t.name,
        description: t.description,
        top3AvgChangeRate:
          t.top3_avg_change_rate === null || t.top3_avg_change_rate === undefined
            ? null
            : Number(t.top3_avg_change_rate),
      }));
    }

    // 테마 동조 신호 (앵커 종목 기준). 없으면 빈 배열 (무테마/미계산 종목).
    let comovementSignals: unknown[] = [];
    const { data: cm } = await supabase
      .from("theme_comovement")
      .select(COMOVEMENT_COLS)
      .eq("stock_code", code);
    comovementSignals = cm ?? [];

    return { themes, comovementSignals };
  } catch (err) {
    logger.warn({ code, err: (err as Error).message }, "theme specialist fetch failed");
    return {};
  }
}

/** 테마 전문가 상담. Haiku 1콜로 opinion 텍스트 반환. */
export async function consultThemeSpecialist(
  supabase: SupabaseClient,
  input: SpecialistInput,
): Promise<string> {
  const cfg = loadConfig();
  if (!cfg.anthropicApiKey) return SPECIALIST_UNAVAILABLE;
  if (!input.code) return SPECIALIST_UNAVAILABLE;

  const data = await fetchThemeContext(supabase, input.code);
  try {
    const client = getChatAnthropicClient(cfg.anthropicApiKey);
    const res = await client.messages.create({
      model: cfg.chatSpecialistModel,
      max_tokens: 700,
      // Sonnet 5: temperature 400 거부 → 제거. 단발 요약 콜 — thinking 명시 비활성.
      thinking: { type: "disabled" },
      system: THEME_SPECIALIST_PROMPT,
      messages: [
        { role: "user", content: `질문:${input.question}\n데이터:${JSON.stringify(data)}` },
      ],
    });
    return specialistText(res) || SPECIALIST_UNAVAILABLE;
  } catch (err) {
    logger.warn({ code: input.code, err: (err as Error).message }, "theme specialist haiku failed");
    return SPECIALIST_UNAVAILABLE;
  }
}
