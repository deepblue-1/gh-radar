import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { kstDateIso } from "@gh-radar/shared";

import { loadConfig, type AppConfig, type DiagnosisEffort } from "../../../config.js";
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
 *
 * 가드(RESEARCH Pitfall 1 · 2 · 오케스트레이터 결정 2):
 *   - 라운드 8 · 벽시계 마감(기본 150초) · 누적 입력 60만 토큰 → **마무리 콜 1회**: 같은 system · 같은 tools ·
 *     append-only messages + `tool_choice: {type:"none"}`. tools 를 빼거나 system 을 바꾸면 thinking 이 무효라
 *     팀장 루프의 「tools 빼고 요약」 을 따르지 않는다.
 *   - 마감 + 30초 = 강제 중단(진행 중 스트림 abort) → 고정 문구.
 *   - 하루 상한(전역 · 사용자) — Opus 호출 전에 `incr_api_usage` 로 원자 증가 · 초과면 Opus 0회. 확인 실패는 fail-closed.
 *   - refusal 은 대체 모델 없이 로그 + 고정 문구. 빈 답 · max_tokens · 예외도 stop_reason · usage 를 남긴다(무로그 금지).
 *   - 어떤 끝이든 `[chat] diagnosis usage` info 1줄(D-03 서버 로그).
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

/** 성공이면 text = display = 진단문. 고정 문구 경로는 display 없음. */
export type DiagnosisResult = { text: string; display?: string; usage: ModelUsage[] };

/** SDK 0.65 타입에 `output_config` 가 없다 — 이 파일 한 곳에서만 넓힌다(RESEARCH Pitfall 11). */
type DiagnosisStreamParams = Anthropic.MessageStreamParams & { output_config: { effort: DiagnosisEffort } };

export const DIAGNOSIS_MAX_ROUNDS = 8;
/** 라운드당 출력 상한 — thinking 이 이 안에서 소모된다(스트리밍 필수 크기). */
export const DIAGNOSIS_MAX_TOKENS = 32_000;
/** 누적 입력(input + cache_read + cache_creation) 가드 — 넘으면 마무리 콜(비용 상한 ≈ $1.5/건). */
export const DIAGNOSIS_INPUT_TOKEN_GUARD = 600_000;
/** 마감 뒤 강제 중단까지 여유 — 마무리 콜이 이 안에 끝나야 한다. */
export const DIAGNOSIS_HARD_ABORT_GRACE_MS = 30_000;

export const DIAGNOSIS_CAP_TEXT = "오늘 주문 진단 한도를 모두 썼습니다. 내일 다시 물어 주세요.";
export const DIAGNOSIS_REFUSAL_TEXT = "이 질문은 주문 진단 전문가가 답하지 못했습니다. 질문을 바꿔 다시 물어 주세요.";
export const DIAGNOSIS_TIMEOUT_TEXT =
  "주문 진단이 시간 안에 끝나지 않았습니다. 날짜 · 종목 · 시각을 좁혀 다시 물어 주세요.";
export const DIAGNOSIS_USAGE_CHECK_FAILED_TEXT = "주문 진단을 지금 쓸 수 없습니다(사용량 확인 실패).";
export const DIAGNOSIS_CONTEXT_MISSING_TEXT = "주문 진단을 지금 쓸 수 없습니다.";

/** 마무리 콜에서 실행하지 않은 tool_use 에 돌려주는 결과. */
const SKIPPED_TOOL_TEXT = "상한 도달 — 실행 안 함";
/** 마무리 콜 user 메시지 끝 지시. */
const FINISH_INSTRUCTION = "더 이상 조회할 수 없습니다. 지금까지 자료로 답하세요.";

/** api_usage 서비스 키 — 전역 · 사용자별(`chat_diagnosis:<userId>`). */
const USAGE_SERVICE = "chat_diagnosis";

const EPHEMERAL = { type: "ephemeral" as const };

type Outcome =
  | "ok"
  | "refusal"
  | "empty"
  | "stop"
  | "timeout"
  | "aborted"
  | "error"
  | "capped"
  | "usage_check_failed"
  | "no_key";

type FinishReason = "rounds" | "deadline" | "input_tokens";

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

function messageText(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

function addUsage(acc: ModelUsage, u: Anthropic.Usage | undefined): void {
  if (!u) return;
  acc.inputTokens += u.input_tokens ?? 0;
  acc.outputTokens += u.output_tokens ?? 0;
  acc.cacheReadInputTokens += u.cache_read_input_tokens ?? 0;
  acc.cacheCreationInputTokens += u.cache_creation_input_tokens ?? 0;
}

function cumulativeInput(u: ModelUsage): number {
  return u.inputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * 하루 상한 — 사용자 카운터를 먼저 원자 증가(`incr_api_usage` · 누적 반환)해 판정하고, 통과했을 때만 전역 카운터를
 * 올린다. 순서가 반대(또는 동시)면 사용자 상한에 걸린 한 사람의 거부된 시도가 전역 카운터를 채워 그날 전원의 진단을
 * 막는다(사용자 상한의 목적 = 한 사용자 폭주 격리).
 * 확인 실패는 throw(호출부가 fail-closed — DB 가 죽었으면 주문로그도 못 읽는다).
 */
async function checkDailyCap(
  supabase: SupabaseClient,
  userId: string,
  date: string,
  cfg: AppConfig,
): Promise<{ scope: "global" | "user" | null; global: number; user: number }> {
  const incr = async (service: string): Promise<number> => {
    const r = await supabase.rpc("incr_api_usage", { p_service: service, p_date: date, p_amount: 1 });
    if (r.error) throw new Error(r.error.message ?? "incr_api_usage failed");
    const n = Number(r.data);
    if (!Number.isFinite(n)) throw new Error("incr_api_usage returned non-number");
    return n;
  };
  const user = await incr(`${USAGE_SERVICE}:${userId}`);
  if (user > cfg.chatDiagnosisUserDailyCap) return { scope: "user", global: Number.NaN, user };
  const global = await incr(USAGE_SERVICE);
  return { scope: global > cfg.chatDiagnosisDailyCap ? "global" : null, global, user };
}

/** 진단 전문가 상담 — 질문 하나 → Opus 도구 루프 → 진단문. */
export async function consultDiagnosisSpecialist(
  supabase: SupabaseClient,
  input: { question: string },
  ctx: DiagnosisContext,
): Promise<DiagnosisResult> {
  const cfg = loadConfig();
  const startedAt = Date.now();
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
  let rounds = 0;
  let stopReason: string | null = null;

  /** 모든 종료 경로의 단일 출구 — usage 로그 1줄(무로그 fail-safe 금지) 뒤 결과. */
  const finish = (outcome: Outcome, text: string, display?: string): DiagnosisResult => {
    logger.info(
      {
        outcome,
        rounds,
        toolCalls: state.calls,
        durationMs: Date.now() - startedAt,
        stopReason,
        effort: cfg.chatDiagnosisEffort,
        models:
          rounds > 0
            ? {
                [usage.model]: {
                  inputTokens: usage.inputTokens,
                  outputTokens: usage.outputTokens,
                  cacheReadInputTokens: usage.cacheReadInputTokens,
                  cacheCreationInputTokens: usage.cacheCreationInputTokens,
                },
              }
            : {},
        marketRecords: state.marketRecords,
        truncated: state.truncated,
      },
      "[chat] diagnosis usage",
    );
    const used = rounds > 0 ? [usage] : [];
    return display === undefined ? { text, usage: used } : { text, display, usage: used };
  };

  if (!cfg.anthropicApiKey) {
    logger.warn({}, "[chat] diagnosis unavailable — ANTHROPIC_API_KEY 미설정");
    return finish("no_key", SPECIALIST_UNAVAILABLE);
  }

  // ── 하루 상한(Opus 호출 전) ──
  try {
    const cap = await checkDailyCap(supabase, ctx.userId, kstDateIso(new Date(startedAt)), cfg);
    if (cap.scope) {
      logger.info(
        {
          scope: cap.scope,
          used: cap.scope === "global" ? cap.global : cap.user,
          cap: cap.scope === "global" ? cfg.chatDiagnosisDailyCap : cfg.chatDiagnosisUserDailyCap,
        },
        "[chat] diagnosis capped",
      );
      return finish("capped", DIAGNOSIS_CAP_TEXT);
    }
  } catch (err) {
    logger.warn({ err: errMessage(err) }, "[chat] diagnosis usage check failed — fail-closed");
    return finish("usage_check_failed", DIAGNOSIS_USAGE_CHECK_FAILED_TEXT);
  }

  const client = getChatAnthropicClient(cfg.anthropicApiKey);
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: DIAGNOSIS_SYSTEM_PROMPT, cache_control: EPHEMERAL },
  ];
  const tools: Anthropic.Tool[] = DIAGNOSIS_TOOLS.map((t, i) =>
    i === DIAGNOSIS_TOOLS.length - 1 ? { ...t, cache_control: EPHEMERAL } : t,
  );
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: input.question }];
  let marker: CacheMarkable | undefined;
  const pushUser = (blocks: Array<Anthropic.ToolResultBlockParam | Anthropic.TextBlockParam>): void => {
    marker = moveCacheMarker(marker, blocks[blocks.length - 1]);
    messages.push({ role: "user", content: blocks });
  };

  // 강제 중단 — 마감 + 여유에 진행 중 스트림을 끊는다(실행 단위 절대 시각 하나 · 라운드마다 남은 시간으로 거는 것과 같다).
  const deadline = startedAt + cfg.chatDiagnosisDeadlineMs;
  const hardAbort = new AbortController();
  const hardTimer = setTimeout(
    () => hardAbort.abort(),
    Math.max(0, deadline + DIAGNOSIS_HARD_ABORT_GRACE_MS - Date.now()),
  );
  const signal = ctx.signal ? AbortSignal.any([ctx.signal, hardAbort.signal]) : hardAbort.signal;

  const finishReason = (): FinishReason | null => {
    if (rounds >= DIAGNOSIS_MAX_ROUNDS - 1) return "rounds";
    if (Date.now() >= deadline) return "deadline";
    if (cumulativeInput(usage) > DIAGNOSIS_INPUT_TOKEN_GUARD) return "input_tokens";
    return null;
  };

  let finishing = false;
  try {
    for (;;) {
      rounds++;
      const params: DiagnosisStreamParams = {
        model: cfg.chatDiagnosisModel,
        max_tokens: DIAGNOSIS_MAX_TOKENS,
        system,
        tools,
        messages,
        output_config: { effort: cfg.chatDiagnosisEffort },
        ...(finishing ? { tool_choice: { type: "none" as const } } : {}),
      };
      const stream = client.messages.stream(params as Anthropic.MessageStreamParams, { signal });
      const msg = await stream.finalMessage();
      addUsage(usage, msg.usage);
      stopReason = msg.stop_reason;
      messages.push({ role: "assistant", content: msg.content });

      if (msg.stop_reason === "tool_use" && !finishing) {
        const calls = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
        const reason = finishReason();
        if (reason) {
          // 이 라운드 도구는 실행하지 않고 마무리 콜로 — tool_use 마다 결과를 채워야 다음 요청이 유효하다.
          finishing = true;
          logger.info({ reason, rounds, cumulativeInput: cumulativeInput(usage) }, "[chat] diagnosis finishing");
          pushUser([
            ...calls.map((b): Anthropic.ToolResultBlockParam => ({
              type: "tool_result",
              tool_use_id: b.id,
              content: SKIPPED_TOOL_TEXT,
            })),
            { type: "text", text: FINISH_INSTRUCTION },
          ]);
          continue;
        }
        const results = await Promise.all(calls.map((b) => dispatchDiagnosisTool(b, state)));
        if (Date.now() >= deadline) {
          // 도구가 마감을 넘겼다 — 받은 결과는 싣고 바로 마무리 콜.
          finishing = true;
          logger.info({ reason: "deadline", rounds }, "[chat] diagnosis finishing");
          pushUser([...results, { type: "text", text: FINISH_INSTRUCTION }]);
        } else {
          pushUser(results);
        }
        continue;
      }

      if (msg.stop_reason === "refusal") {
        const stopDetails = (msg as Anthropic.Message & { stop_details?: unknown }).stop_details ?? null;
        logger.warn({ stopReason: msg.stop_reason, stopDetails, usage: msg.usage, rounds }, "[chat] diagnosis refusal");
        return finish("refusal", DIAGNOSIS_REFUSAL_TEXT);
      }
      const text = messageText(msg);
      if ((msg.stop_reason === "end_turn" || msg.stop_reason === "stop_sequence") && text) {
        return finish("ok", text, text);
      }
      // 빈 답 · max_tokens · 마무리 콜인데 tool_use · 그 밖 stop_reason — 원인 추적용 로그 뒤 고정 문구.
      logger.warn(
        { stopReason: msg.stop_reason, usage: msg.usage, rounds, textChars: text.length, finishing },
        "[chat] diagnosis no answer — fallback",
      );
      return finish(text ? "stop" : "empty", SPECIALIST_UNAVAILABLE);
    }
  } catch (err) {
    if (hardAbort.signal.aborted) {
      logger.warn({ rounds, stopReason, durationMs: Date.now() - startedAt }, "[chat] diagnosis hard timeout");
      return finish("timeout", DIAGNOSIS_TIMEOUT_TEXT);
    }
    if (ctx.signal?.aborted) {
      logger.warn({ rounds, stopReason }, "[chat] diagnosis aborted by caller");
      return finish("aborted", SPECIALIST_UNAVAILABLE);
    }
    logger.warn({ err: errMessage(err), rounds, stopReason, usage }, "[chat] diagnosis failed");
    return finish("error", SPECIALIST_UNAVAILABLE);
  } finally {
    clearTimeout(hardTimer);
  }
}
