import type { SupabaseClient } from "@supabase/supabase-js";
import { loadConfig } from "../../config.js";
import { logger } from "../../logger.js";
import {
  mergeMasterAndQuote,
  type StockMasterRow,
  type StockQuoteRow,
} from "../../mappers/stock.js";
import { QUOTE_SPECIALIST_PROMPT } from "../chat-prompts.js";
import { getChatAnthropicClient } from "./anthropic-client.js";
import { specialistText, SPECIALIST_UNAVAILABLE } from "./helpers.js";

/**
 * Phase 14 — ①시세·수급 전문가 (CHAT-01, RESEARCH Pattern 2).
 *
 * 결정적 TS 함수가 Supabase 에서 stock_quotes ⋈ stocks ⋈ 최근 일봉을 먼저 조회 →
 * Haiku 프롬프트에 주입 → opinion 1콜 반환. **내부 tool-use 루프 없음** (RESEARCH Anti-pattern —
 * 팀장 turn × 전문가 turn 곱연산 지연/비용 폭증 회피). max_tokens=700 상한 (비용, T-14-04b).
 *
 * 데이터 소스: stock_quotes / stocks / stock_daily_ohlcv (mappers/stock.ts 재사용).
 */

/** 전문가 입력 — code 는 종목 컨텍스트(없을 수 있음), question 은 사용자 질문. */
export interface SpecialistInput {
  code?: string;
  question: string;
}

const MASTER_COLS = "code,name,market,sector,security_type,listing_date,is_delisted,updated_at";
const QUOTE_COLS =
  "code,price,change_amount,change_rate,volume,trade_amount,open,high,low,market_cap,upper_limit,lower_limit,updated_at";
const OHLCV_COLS = "date,open,high,low,close,volume";

/** 결정적 조회 — 시세/마스터/최근 일봉 조립. 조회 실패/무데이터는 부분 컨텍스트로 진행. */
async function fetchQuoteContext(
  supabase: SupabaseClient,
  code: string,
): Promise<Record<string, unknown>> {
  try {
    const [{ data: master }, { data: quote }] = await Promise.all([
      supabase.from("stocks").select(MASTER_COLS).eq("code", code).maybeSingle(),
      supabase.from("stock_quotes").select(QUOTE_COLS).eq("code", code).maybeSingle(),
    ]);
    const { data: ohlcv } = await supabase
      .from("stock_daily_ohlcv")
      .select(OHLCV_COLS)
      .eq("code", code)
      .order("date", { ascending: false })
      .limit(10);

    const stock = master
      ? mergeMasterAndQuote(
          master as unknown as StockMasterRow,
          (quote as unknown as StockQuoteRow | null) ?? null,
        )
      : null;
    return { stock, recentDaily: ohlcv ?? [] };
  } catch (err) {
    logger.warn({ code, err: (err as Error).message }, "quote specialist fetch failed");
    return {};
  }
}

/**
 * 시세·수급 전문가 상담. Haiku 1콜로 opinion 텍스트 반환.
 * anthropicApiKey 미설정 시 graceful 안내 텍스트 (throw 안 함).
 */
export async function consultQuoteSpecialist(
  supabase: SupabaseClient,
  input: SpecialistInput,
): Promise<string> {
  const cfg = loadConfig();
  if (!cfg.anthropicApiKey) return SPECIALIST_UNAVAILABLE;
  if (!input.code) {
    // 종목 컨텍스트 없이 시세 질문은 근거 부재 → 안내.
    return SPECIALIST_UNAVAILABLE;
  }

  const data = await fetchQuoteContext(supabase, input.code);
  try {
    const client = getChatAnthropicClient(cfg.anthropicApiKey);
    const res = await client.messages.create({
      model: cfg.chatSpecialistModel,
      max_tokens: 700,
      // Sonnet 5: temperature 등 비기본 sampling 파라미터는 400 거부 — 결정성은 프롬프트가 담당.
      // 단발 요약 콜이므로 adaptive thinking 명시 비활성(생략 시 기본 ON → max_tokens 소모).
      thinking: { type: "disabled" },
      system: QUOTE_SPECIALIST_PROMPT,
      messages: [
        { role: "user", content: `질문:${input.question}\n데이터:${JSON.stringify(data)}` },
      ],
    });
    const text = specialistText(res);
    if (!text) {
      // 무로그 fail-safe 금지 (프로젝트 lesson) — max_tokens 절단 등 원인 추적용 (WR-08).
      logger.warn(
        { code: input.code, stopReason: res.stop_reason, usage: res.usage },
        "quote specialist empty text — fallback",
      );
      return SPECIALIST_UNAVAILABLE;
    }
    logger.info(
      { code: input.code, model: cfg.chatSpecialistModel, usage: res.usage },
      "[chat] quote specialist usage",
    );
    return text;
  } catch (err) {
    logger.warn({ code: input.code, err: (err as Error).message }, "quote specialist haiku failed");
    return SPECIALIST_UNAVAILABLE;
  }
}
