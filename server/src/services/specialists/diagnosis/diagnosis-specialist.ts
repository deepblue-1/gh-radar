import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadConfig, type DiagnosisEffort } from "../../../config.js";
import { logger } from "../../../logger.js";
import type { TickConvertTrigger } from "../../tick-convert-trigger.js";
import type { TickgwClient } from "../../tickgw-client.js";
import { getChatAnthropicClient } from "../anthropic-client.js";
import { SPECIALIST_UNAVAILABLE } from "../helpers.js";
import { DIAGNOSIS_SYSTEM_PROMPT } from "./diagnosis-knowledge.js";
import { DIAGNOSIS_TOOLS, dispatchDiagnosisTool, type DiagnosisToolState } from "./diagnosis-tools.js";

/**
 * Phase 39 — 주문 진단 전문가(D-01 · SC-3). 이 저장소의 첫 「도구 가진 전문가」 — Opus 5.5 가 자기 도구 루프를 돈다.
 *
 * 요청 모양(RESEARCH Pattern 2 · claude-api skill Opus 5.5 절):
 *   - model = `cfg.chatDiagnosisModel`(기본 claude-opus-5-5) · `output_config.effort` 명시(기본 medium)
 *   - thinking 키 없음(Opus 5.5 는 끌 수 없다 — 생략 = adaptive) · temperature 키 없음(프로젝트 lesson)
 *   - 일반 라운드에 tool_choice 없음(강제 any/tool 은 400) — 도구 사용 요구는 프롬프트로
 *   - messages 는 append-only — 응답 content(thinking 블록 포함)를 그대로 assistant 로 되싣는다
 *   - 캐시: system 블록 · tools 마지막 원소 · 매 라운드 마지막 user 메시지의 마지막 블록
 */

export type { DiagnosisEffort };

/** 시세 도구 의존성 묶음 — 39-07 이 라우트 `app.locals` 에서 채워 `get_market_ticks` 에 넘긴다. */
export type DiagnosisDeps = {
  tickgw?: TickgwClient;
  tickConvertTrigger?: TickConvertTrigger;
  tickRequestDailyCap: number;
};

export type DiagnosisContext = {
  /** 인증 사용자 id(라우트 `req.userId`) — RPC `p_user_id` 의 유일한 출처(SC-2). */
  userId: string;
  signal?: AbortSignal;
  deps?: DiagnosisDeps;
};

export type ModelUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
};

export type DiagnosisResult = { text: string; display?: string; usage: ModelUsage[] };

/** SDK 0.65 타입에 `output_config` 가 없다 — 이 파일 한 곳에서만 넓힌다(RESEARCH Pitfall 11). */
type DiagnosisStreamParams = Anthropic.MessageStreamParams & { output_config: { effort: DiagnosisEffort } };

export const DIAGNOSIS_MAX_ROUNDS = 8;
/** 라운드당 출력 상한 — thinking 이 이 안에서 소모된다(스트리밍 필수 크기). */
export const DIAGNOSIS_MAX_TOKENS = 32_000;

const EPHEMERAL = { type: "ephemeral" as const };

function messageText(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

type CacheMarkable = { cache_control?: Anthropic.CacheControlEphemeral | null };

/**
 * 증분 캐시 브레이크포인트를 최신 user 메시지의 마지막 블록으로 옮긴다. 브레이크포인트는 요청당 최대 4개
 * (system · tools · 이것 = 3) — 앞 라운드 표시를 지우지 않으면 4라운드째에 400 이 난다. cache_control 은 표시일 뿐
 * 내용이 아니라 지워도 prefix · thinking 블록은 그대로다(append-only 유지).
 */
function moveCacheMarker(prev: CacheMarkable | undefined, next: CacheMarkable | undefined): CacheMarkable | undefined {
  if (prev) delete prev.cache_control;
  if (next) next.cache_control = EPHEMERAL;
  return next;
}

function addUsage(acc: ModelUsage, u: Anthropic.Usage | undefined): void {
  if (!u) return;
  acc.inputTokens += u.input_tokens ?? 0;
  acc.outputTokens += u.output_tokens ?? 0;
  acc.cacheReadInputTokens += u.cache_read_input_tokens ?? 0;
  acc.cacheCreationInputTokens += u.cache_creation_input_tokens ?? 0;
}

/** 진단 전문가 상담 — 질문 하나 → Opus 도구 루프 → 진단문. 성공이면 text = display = 진단문. */
export async function consultDiagnosisSpecialist(
  supabase: SupabaseClient,
  input: { question: string },
  ctx: DiagnosisContext,
): Promise<DiagnosisResult> {
  const cfg = loadConfig();
  if (!cfg.anthropicApiKey) return { text: SPECIALIST_UNAVAILABLE, usage: [] };

  const client = getChatAnthropicClient(cfg.anthropicApiKey);
  const state: DiagnosisToolState = {
    supabase,
    userId: ctx.userId,
    deps: ctx.deps,
    calls: {},
    orderLogMemo: new Map(),
    marketMemo: new Map(),
    marketRecords: 0,
    truncated: false,
  };
  const usage: ModelUsage = {
    model: cfg.chatDiagnosisModel,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  };
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: DIAGNOSIS_SYSTEM_PROMPT, cache_control: EPHEMERAL },
  ];
  const tools: Anthropic.Tool[] = DIAGNOSIS_TOOLS.map((t, i) =>
    i === DIAGNOSIS_TOOLS.length - 1 ? { ...t, cache_control: EPHEMERAL } : t,
  );
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: input.question }];
  let marker: CacheMarkable | undefined;

  for (let round = 0; round < DIAGNOSIS_MAX_ROUNDS; round++) {
    const params: DiagnosisStreamParams = {
      model: cfg.chatDiagnosisModel,
      max_tokens: DIAGNOSIS_MAX_TOKENS,
      system,
      tools,
      messages,
      output_config: { effort: cfg.chatDiagnosisEffort },
    };
    const stream = client.messages.stream(params as Anthropic.MessageStreamParams, { signal: ctx.signal });
    const msg = await stream.finalMessage();
    addUsage(usage, msg.usage);
    messages.push({ role: "assistant", content: msg.content });

    if (msg.stop_reason !== "tool_use") {
      const text = messageText(msg);
      return { text, display: text, usage: [usage] };
    }
    const calls = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
      calls.map((b) => dispatchDiagnosisTool(b, state)),
    );
    marker = moveCacheMarker(marker, results[results.length - 1]);
    messages.push({ role: "user", content: results });
  }
  logger.warn({ rounds: DIAGNOSIS_MAX_ROUNDS }, "[chat] diagnosis round limit");
  return { text: SPECIALIST_UNAVAILABLE, usage: [usage] };
}
