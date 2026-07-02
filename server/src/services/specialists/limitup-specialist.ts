import type { SupabaseClient } from "@supabase/supabase-js";
import { loadConfig } from "../../config.js";
import { logger } from "../../logger.js";
import {
  mapEvent,
  mapStats,
  mapTheme,
  zeroStats,
  type LimitUpEventRow,
  type LimitUpStockStatsRow,
  type LimitUpThemeStatRow,
} from "../../mappers/limitUp.js";
import type { LimitUpThemeStat } from "@gh-radar/shared";
import { LIMITUP_SPECIALIST_PROMPT } from "../chat-prompts.js";
import { getChatAnthropicClient } from "./anthropic-client.js";
import { specialistText, SPECIALIST_UNAVAILABLE } from "./helpers.js";
import type { SpecialistInput } from "./quote-specialist.js";

/**
 * Phase 14 — ④상한가 패턴 전문가 (CHAT-01, RESEARCH Pattern 2).
 *
 * 결정적 조회: 사전계산 테이블 limit_up_stock_stats(히어로 통계) + limit_up_events(이벤트 리스트) +
 * 소속 테마별 limit_up_theme_stats → Haiku 1콜. mappers/limitUp.ts 재사용. 내부 루프 없음.
 */

const STATS_COLS =
  "code,total_events,resolved_events,win_count,win_rate,avg_open_ret,worst_low_ret,recent_wins,recent_losses,bucket_n10_n5,bucket_n5_0,bucket_0_p5,bucket_p5_p10,bucket_p10";
const EVENT_COLS =
  "code,date,is_jeomsang,next_open_ret,next_high_ret,next_low_ret,next_close_ret,trade_amount,turnover";
const THEME_STAT_COLS = "theme_id,sample_n,win_count,win_rate,avg_open_ret";

async function fetchLimitupContext(
  supabase: SupabaseClient,
  code: string,
): Promise<Record<string, unknown>> {
  try {
    const { data: statsRow } = await supabase
      .from("limit_up_stock_stats")
      .select(STATS_COLS)
      .eq("code", code)
      .maybeSingle();
    const hero = statsRow ? mapStats(statsRow as unknown as LimitUpStockStatsRow) : zeroStats();

    const { data: eventRows } = await supabase
      .from("limit_up_events")
      .select(EVENT_COLS)
      .eq("code", code)
      .order("date", { ascending: false })
      .limit(20);
    const events = ((eventRows ?? []) as unknown as LimitUpEventRow[]).map(mapEvent);

    // 소속 active 테마 → 테마별 상한가 통계.
    const { data: memberRows } = await supabase
      .from("theme_stocks")
      .select("theme_id")
      .eq("stock_code", code)
      .is("effective_to", null);
    const themeIds = [
      ...new Set(((memberRows ?? []) as { theme_id: string }[]).map((r) => r.theme_id)),
    ];

    let themes: LimitUpThemeStat[] = [];
    if (themeIds.length > 0) {
      const { data: themeStats } = await supabase
        .from("limit_up_theme_stats")
        .select(THEME_STAT_COLS)
        .in("theme_id", themeIds);
      const { data: themeMeta } = await supabase
        .from("themes")
        .select("id,name")
        .in("id", themeIds)
        .eq("hidden", false);
      const nameById = new Map<string, string>();
      for (const t of (themeMeta ?? []) as { id: string; name: string }[]) {
        nameById.set(t.id, t.name);
      }
      themes = ((themeStats ?? []) as unknown as LimitUpThemeStatRow[])
        .filter((row) => nameById.has(row.theme_id))
        .map((row) => mapTheme(row, nameById.get(row.theme_id)!))
        .sort((a, b) => b.sampleN - a.sampleN);
    }

    return { hero, events, themes };
  } catch (err) {
    logger.warn({ code, err: (err as Error).message }, "limitup specialist fetch failed");
    return {};
  }
}

/** 상한가 패턴 전문가 상담. Haiku 1콜로 opinion 텍스트 반환. */
export async function consultLimitupSpecialist(
  supabase: SupabaseClient,
  input: SpecialistInput,
): Promise<string> {
  const cfg = loadConfig();
  if (!cfg.anthropicApiKey) return SPECIALIST_UNAVAILABLE;
  if (!input.code) return SPECIALIST_UNAVAILABLE;

  const data = await fetchLimitupContext(supabase, input.code);
  try {
    const client = getChatAnthropicClient(cfg.anthropicApiKey);
    const res = await client.messages.create({
      model: cfg.chatSpecialistModel,
      max_tokens: 700,
      // Sonnet 5: temperature 400 거부 → 제거. 단발 요약 콜 — thinking 명시 비활성.
      thinking: { type: "disabled" },
      system: LIMITUP_SPECIALIST_PROMPT,
      messages: [
        { role: "user", content: `질문:${input.question}\n데이터:${JSON.stringify(data)}` },
      ],
    });
    const text = specialistText(res);
    if (!text) {
      // 무로그 fail-safe 금지 (프로젝트 lesson) — max_tokens 절단 등 원인 추적용 (WR-08).
      logger.warn(
        { code: input.code, stopReason: res.stop_reason, usage: res.usage },
        "limitup specialist empty text — fallback",
      );
      return SPECIALIST_UNAVAILABLE;
    }
    logger.info(
      { code: input.code, model: cfg.chatSpecialistModel, usage: res.usage },
      "[chat] limitup specialist usage",
    );
    return text;
  } catch (err) {
    logger.warn({ code: input.code, err: (err as Error).message }, "limitup specialist haiku failed");
    return SPECIALIST_UNAVAILABLE;
  }
}
