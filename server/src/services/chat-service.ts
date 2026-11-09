import Anthropic from "@anthropic-ai/sdk";
import type { Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SPECIALIST_LABELS,
  type ChatSSEEventMap,
  type ChatSSEEventType,
  type MessageBlock,
} from "@gh-radar/shared";
import { loadConfig } from "../config.js";
import { logger } from "../logger.js";
import { getChatAnthropicClient } from "./specialists/anthropic-client.js";
import {
  SPECIALIST_TOOLS,
  runSpecialist,
  toolNameToSpecialistId,
  extractStockRefs,
  type SpecialistInput,
} from "./chat-orchestrator.js";
import type { DiagnosisDeps, ModelUsage } from "./specialists/diagnosis/diagnosis-specialist.js";
import {
  loadConversation,
  createConversation,
  appendMessage,
} from "./chat-history.js";
import { LEAD_PROMPT } from "./chat-prompts.js";

/**
 * Phase 14 Plan 06 — AI 애널리스트 챗 서비스 (CHAT-01, RESEARCH Pattern 1 이식).
 *
 * ww-bot `chat-service.ts` 의 검증된 팀장 tool-use 루프를 gh-radar 로 이식한다:
 *   - sanitizeMessages / pruneHistory / isRetryableError / retry / 프롬프트 캐싱을 **그대로**,
 *   - "tool" 자리에 P05 의 5 전문가(SPECIALIST_TOOLS/runSpecialist)를 꽂아 팀장(Sonnet) 루프 구성.
 *
 * ww-bot 과의 의도적 차이 (gh-radar 영속화 경계):
 *   - 세션 Map 은 히스토리 저장이 아니라 **interrupt/busy 가드 전용**(D-06). 히스토리는 DB 복원.
 *   - 히스토리는 conversations/messages(텍스트 스냅샷)에서 복원 — tool_use/tool_result 원본
 *     미저장(Pitfall 3). 복원 후 sanitizeMessages 필수.
 *   - clientAbort(시트 닫힘)는 SSE 전송만 멈추고 생성/저장은 계속 → Claude 스트림은 오직
 *     interrupt(새 요청, D-06)로만 취소한다. (ww-bot interrupt 와 client close 분리 처리.)
 */

// --- Session (interrupt/busy 가드 전용, D-06) ---

interface ChatSession {
  busy: boolean;
  busyAbortSignal?: AbortSignal;
  interruptController?: AbortController;
  /**
   * 이 요청의 히스토리 저장(appendMessage)까지 끝나면 resolve (실패 포함 — 항상 resolve).
   * 시트 닫힘(clientAbort) 후 백그라운드로 계속되는 생성과 재접속 새 요청이 같은 대화에
   * 동시에 append 해 created_at 인터리브/sanitize 손실이 나지 않도록, 새 요청은 히스토리
   * 복원 전에 이 promise 를 await 한다 (WR-07).
   */
  pendingPersist?: Promise<void>;
}

/** 세션 키(conversationId ?? userId)별 in-flight 요청 추적. 새 요청이 이전 요청을 abort. */
const sessions = new Map<string, ChatSession>();

/** 테스트 전용 — 세션 Map 초기화. 런타임 호출 금지. */
export function __resetChatSessionsForTests(): void {
  sessions.clear();
}

// --- 비용 방어 상수 ---

const MAX_RETRIES = 2;
const MAX_TOOL_RESULT_CHARS = 8_000;

/**
 * Phase 39 D-01 — 주문 진단 전문가의 진단문은 서버가 SSE text 로 그대로 흘린다(팀장이 요약 · 재서술하지 않는다).
 * 팀장 tool_result 는 이 머리 + 원문 — 팀장은 이미 화면에 있는 진단문을 다시 쓰지 않고 꼬리말만 붙인다.
 */
export const DIAGNOSIS_RELAY_HEADER =
  "[주문 진단 전문가의 진단문이 이미 사용자 화면에 그대로 표시되었습니다. 다시 쓰거나 요약·재서술하지 말고, 수치·시각을 반복하지 마세요. 필요하면 꼬리말 한두 줄만.]";

// --- 모델별 토큰 합 (Phase 39 SC-3) ---

/** `[chat] usage` 의 `models` 값 — 모델 키별 토큰 합(팀장 Sonnet · 진단 Opus 를 따로 본다). */
type TokenTally = Omit<ModelUsage, "model">;

function tallyFor(models: Record<string, TokenTally>, model: string): TokenTally {
  return (models[model] ??= {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  });
}

/** 팀장 라운드 · recovery 콜 usage 를 더한다(null 은 0). */
function addApiUsage(t: TokenTally, u: Anthropic.Usage): void {
  t.inputTokens += u.input_tokens ?? 0;
  t.outputTokens += u.output_tokens ?? 0;
  t.cacheReadInputTokens += u.cache_read_input_tokens ?? 0;
  t.cacheCreationInputTokens += u.cache_creation_input_tokens ?? 0;
}

// --- SSE 헬퍼 ---

/** SSE 이벤트 전송 (writableEnded 면 no-op — 시트 닫힘/연결 종료 시 안전). */
function sendSSE<E extends ChatSSEEventType>(
  res: Response,
  event: E,
  data: ChatSSEEventMap[E],
): void {
  if (res.writableEnded) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// --- 히스토리 sanitize (ww-bot 이식, Claude API invariant 복구) ---

/**
 * tool_use/tool_result 페어링 복구 + 연속 role 병합 + 첫 메시지 user 보장.
 * DB 복원 히스토리를 팀장에 넣기 전 반드시 통과시킨다 (Claude API invariant). in-place 변경.
 */
export function sanitizeMessages(messages: Anthropic.MessageParam[]): void {
  const repaired: Anthropic.MessageParam[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    // 선행 tool_use 없는 고아 tool_result user 메시지 제거
    if (msg.role === "user" && Array.isArray(msg.content)) {
      const allToolResults =
        msg.content.length > 0 &&
        msg.content.every(
          (b) => typeof b === "object" && "type" in b && b.type === "tool_result",
        );
      const prev = repaired[repaired.length - 1];
      const prevHasToolUse =
        prev?.role === "assistant" &&
        Array.isArray(prev.content) &&
        prev.content.some(
          (b) => typeof b === "object" && "type" in b && b.type === "tool_use",
        );
      if (allToolResults && !prevHasToolUse) {
        i++;
        continue;
      }
    }

    repaired.push(msg);

    // assistant(tool_use) 다음에 매칭 tool_result 없으면 합성 tool_result 삽입
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      const toolUseBlocks = msg.content.filter(
        (b): b is Anthropic.ToolUseBlock =>
          typeof b === "object" && "type" in b && b.type === "tool_use",
      );
      if (toolUseBlocks.length > 0) {
        const next = messages[i + 1];
        const nextHasMatching =
          next?.role === "user" &&
          Array.isArray(next.content) &&
          toolUseBlocks.every((tu) =>
            (next.content as Anthropic.ToolResultBlockParam[]).some(
              (tr) =>
                typeof tr === "object" &&
                "type" in tr &&
                tr.type === "tool_result" &&
                tr.tool_use_id === tu.id,
            ),
          );
        if (!nextHasMatching) {
          const synthetic: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map((tu) => ({
            type: "tool_result" as const,
            tool_use_id: tu.id,
            content: JSON.stringify({ error: "이전 대화가 중단되어 결과를 받지 못했습니다." }),
            is_error: true,
          }));
          repaired.push({ role: "user", content: synthetic });
        }
      }
    }

    i++;
  }

  // Pass 2 — 연속 같은 role 제거 (roles must alternate)
  for (let j = repaired.length - 1; j > 0; j--) {
    if (repaired[j].role === "user" && repaired[j - 1].role === "user") {
      repaired.splice(j - 1, 1);
    } else if (repaired[j].role === "assistant" && repaired[j - 1].role === "assistant") {
      repaired.splice(j - 1, 1);
    }
  }

  // 첫 메시지는 user 여야 함 (Claude API 요구)
  while (repaired.length > 0 && repaired[0].role !== "user") {
    repaired.shift();
  }

  messages.splice(0, messages.length, ...repaired);
}

// --- 히스토리 슬라이딩 윈도우 (ww-bot 이식, max 파라미터화) ---

/**
 * 최근 max 개 메시지만 유지. tool_use/tool_result 페어 경계를 자르지 않고,
 * 첫 메시지가 user 가 되도록 앞으로 민다 (Claude API 요구).
 */
export function pruneHistory(
  messages: Anthropic.MessageParam[],
  max: number,
): Anthropic.MessageParam[] {
  if (messages.length <= max) return messages;

  let cutAt = messages.length - max;

  // tool_result user 메시지 한가운데서 시작하지 않도록 전진
  while (cutAt < messages.length) {
    const msg = messages[cutAt];
    if (msg.role === "user" && Array.isArray(msg.content)) {
      const allToolResults =
        msg.content.length > 0 &&
        msg.content.every(
          (b) => typeof b === "object" && "type" in b && b.type === "tool_result",
        );
      if (allToolResults) {
        cutAt++;
        continue;
      }
    }
    break;
  }

  // 첫 메시지는 user
  while (cutAt < messages.length && messages[cutAt].role !== "user") {
    cutAt++;
  }

  return messages.slice(cutAt);
}

// --- retry (ww-bot 이식) ---

/** overloaded_error / rate_limit_error / HTTP 429 / 529 만 재시도 대상. */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof Anthropic.APIError) {
    return err.status === 429 || err.status === 529;
  }
  const errObj = err as Record<string, unknown> | null;
  const status = errObj?.status;
  if (status === 429 || status === 529) return true;
  const innerError = errObj?.error as Record<string, unknown> | undefined;
  const errorType = innerError?.type as string | undefined;
  return errorType === "overloaded_error" || errorType === "rate_limit_error";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** finalMessage.content 의 text 블록을 이어붙여 반환 (스트림 delta 가 비었을 때 폴백). */
function messageText(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

// --- stock_card (D-07) ---

/** 답변 텍스트의 종목 참조 → stocks(name) + stock_quotes(price/change_rate) 조회 → stock_card SSE. */
async function emitStockCards(
  res: Response,
  supabase: SupabaseClient,
  finalText: string,
  sentCodes: Set<string>,
  blocks: MessageBlock[],
): Promise<void> {
  for (const { code } of extractStockRefs(finalText)) {
    if (sentCodes.has(code)) continue;
    sentCodes.add(code);
    try {
      const [{ data: stock }, { data: quote }] = await Promise.all([
        supabase.from("stocks").select("code,name").eq("code", code).maybeSingle(),
        supabase
          .from("stock_quotes")
          .select("code,price,change_rate")
          .eq("code", code)
          .maybeSingle(),
      ]);
      if (!quote) continue;
      const q = quote as { price?: unknown; change_rate?: unknown };
      const card = {
        code,
        name: ((stock as { name?: unknown } | null)?.name as string) ?? code,
        price: Number(q.price) || 0,
        changeRate: Number(q.change_rate) || 0,
      };
      sendSSE(res, "stock_card", card);
      blocks.push({ type: "stock_card", ...card });
    } catch (err) {
      logger.warn({ code, err: (err as Error).message }, "[chat] stock_card fetch failed");
    }
  }
}

// --- 메인 핸들러 ---

export interface HandleChatOptions {
  userId: string;
  conversationId?: string;
  message: string;
  stockCode?: string;
  /**
   * Phase 39 — 주문 진단 전문가의 시세 도구 의존성(라우트가 `app.locals` 의 tickgw · 변환 트리거 · 하루 상한을 넘긴다).
   * 계좌는 여기에 없다 — 계좌 범위는 `userId` 하나로만 정해진다(SC-2).
   */
  diagnosisDeps?: DiagnosisDeps;
}

/**
 * 팀장(Sonnet) tool-use 루프 SSE 스트림. 히스토리 복원 → sanitize/prune → 스트리밍 →
 * tool_use 시 전문가 병렬 dispatch(Promise.all) → tool_result 재호출 → end_turn 종료.
 * 완료 시 user/assistant 메시지 저장. 새 요청은 이전 요청을 interrupt(D-06).
 */
export async function handleChatStream(
  res: Response,
  supabase: SupabaseClient,
  abortSignal: AbortSignal,
  opts: HandleChatOptions,
): Promise<void> {
  const { userId, conversationId, message, stockCode } = opts;
  const cfg = loadConfig();

  // --- interrupt/busy 가드 (동기 top — 새 요청이 이전 요청을 abort, D-06) ---
  const sessionKey = conversationId ?? userId;
  const existing = sessions.get(sessionKey);
  if (existing?.busy && !existing.busyAbortSignal?.aborted) {
    existing.interruptController?.abort();
  }
  // 이전 요청(interrupt 됐든 백그라운드 계속이든)의 저장 완료 promise — 복원 전 대기 (WR-07).
  const previousPersist = existing?.pendingPersist;
  const interruptController = new AbortController();
  let resolvePersist!: () => void;
  const pendingPersist = new Promise<void>((resolve) => {
    resolvePersist = resolve;
  });
  const session: ChatSession = {
    busy: true,
    busyAbortSignal: abortSignal,
    interruptController,
    pendingPersist,
  };
  sessions.set(sessionKey, session);

  // 오직 interrupt(새 요청)만 Claude 스트림을 취소한다. clientAbort(시트 닫힘)는
  // SSE 전송만 멈추고 생성/저장은 계속되게 하여, 사용자가 재방문 시 답변을 볼 수 있게 한다(D-06).
  const effectiveSignal = AbortSignal.any([interruptController.signal]);

  const releaseBusy = () => {
    if (session.busyAbortSignal === abortSignal) session.busy = false;
  };
  abortSignal.addEventListener("abort", releaseBusy, { once: true });

  try {
    // 이전 요청의 user/assistant 저장이 끝난 뒤에 복원 시작 — 두 생성 스트림이 같은
    // 대화에 동시 append 해 순서가 꼬이거나 히스토리가 누락되는 것을 방지 (WR-07).
    // pendingPersist 는 resolve 전용(reject 없음)이라 안전하게 await 가능.
    await previousPersist;

    // --- 대화 복원/생성 (Pitfall 3: 텍스트 스냅샷만 복원) ---
    let convId = conversationId;
    const restored: Anthropic.MessageParam[] = [];
    if (convId) {
      const { messages } = await loadConversation(supabase, convId, userId); // 소유권 검증 포함(T-14-01)
      for (const m of messages) {
        if (m.role === "user" || m.role === "assistant") {
          restored.push({ role: m.role, content: m.content });
        }
      }
    } else {
      const conv = await createConversation(supabase, userId, {
        stockCode: stockCode ?? null,
        firstUserMessage: message,
      });
      convId = conv.id;
    }

    sendSSE(res, "session", { conversationId: convId });

    // 종목 컨텍스트(D-03) — 팀장이 전문가에 code 를 넘길 수 있도록 프롬프트에 주입. 저장은 원문만.
    const leadContent = stockCode
      ? `[현재 보고 있는 종목 코드: ${stockCode}]\n${message}`
      : message;
    const userMsg: Anthropic.MessageParam = { role: "user", content: leadContent };

    const workingMessages = [
      ...pruneHistory(restored, cfg.chatMaxHistoryMessages),
      userMsg,
    ];
    sanitizeMessages(workingMessages);

    const client = getChatAnthropicClient(cfg.anthropicApiKey ?? "");

    const assistantBlocks: MessageBlock[] = [];
    const sentCodes = new Set<string>();
    let finalText = "";
    // 멀티라운드에서 SSE 로 나간 표시 텍스트 누적 — tool_use 전 중간 서술까지 포함해
    // 화면에 표시된 텍스트와 DB 저장 content 를 일치시킨다 (WR-03).
    let accumulatedText = "";
    let turnTokensIn = 0;
    let turnTokensOut = 0;
    let toolRounds = 0;
    // 모델별 토큰 — 팀장 키는 늘 있다. 전문가가 돌려준 usage(진단 Opus)는 그 모델 키로 더한다(SC-3).
    const models: Record<string, TokenTally> = {};
    tallyFor(models, cfg.chatLeadModel);

    // 진단 시간 예산은 턴 단위 하나(WR-07) — 팀장이 라운드를 바꿔 진단을 거듭 불러도 진단 벽시계 합이
    // chatDiagnosisDeadlineMs(+ 강제 중단 여유)를 넘지 않아 Cloud Run 300초 안에 저장까지 닿는다.
    const diagnosisTurnDeadlineAt = Date.now() + cfg.chatDiagnosisDeadlineMs;

    // --- 팀장 tool-use 루프 (RESEARCH Code Examples 골격) ---
    for (let round = 0; round < cfg.chatMaxToolRounds; round++) {
      let textBuffer = "";
      let finalMessage!: Anthropic.Message;

      for (let attempt = 0; ; attempt++) {
        try {
          const stream = client.messages.stream(
            {
              model: cfg.chatLeadModel,
              // Sonnet 5: thinking 생략 = adaptive ON(품질 목적, 의도) — thinking 이
              // max_tokens 안에서 소모되고 신형 토크나이저가 ~30% 더 쓰므로 8192 로 상향.
              // 스트림 소비부는 text_delta 만 취해 thinking delta 는 SSE 로 새지 않고,
              // tool 루프는 finalMessage.content 전체를 되돌려 thinking 블록이 보존된다.
              max_tokens: 8192,
              system: [
                {
                  type: "text" as const,
                  text: LEAD_PROMPT,
                  cache_control: { type: "ephemeral" as const },
                },
              ],
              tools: SPECIALIST_TOOLS.map((t, idx) =>
                idx === SPECIALIST_TOOLS.length - 1
                  ? { ...t, cache_control: { type: "ephemeral" as const } }
                  : t,
              ),
              messages: workingMessages,
            },
            { signal: effectiveSignal },
          );

          textBuffer = "";
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              textBuffer += event.delta.text;
              sendSSE(res, "text", { text: event.delta.text });
            }
          }
          finalMessage = await stream.finalMessage();
          break;
        } catch (err) {
          if (isRetryableError(err) && attempt < MAX_RETRIES) {
            // 부분 text delta 가 이미 나갔으면 클라이언트 누적을 리셋해
            // 재시도 스트림과의 중복 표시/저장을 방지한다 (WR-02).
            if (textBuffer) {
              sendSSE(res, "text_clear", {});
              // 이전 라운드까지의 확정 텍스트는 다시 밀어
              // 클라이언트 누적 == accumulatedText 규칙 유지 (WR-03).
              if (accumulatedText) sendSSE(res, "text", { text: accumulatedText });
            }
            await sleep(1000 * (attempt + 1));
            continue;
          }
          throw err;
        }
      }

      // 이 라운드에서 화면으로 나간 텍스트 누적 (tool_use 전 중간 서술 포함, WR-03).
      accumulatedText += textBuffer;

      if (finalMessage.usage) {
        turnTokensIn += finalMessage.usage.input_tokens;
        turnTokensOut += finalMessage.usage.output_tokens;
        addApiUsage(tallyFor(models, cfg.chatLeadModel), finalMessage.usage);
      }

      workingMessages.push({ role: "assistant", content: finalMessage.content });

      if (finalMessage.stop_reason === "tool_use") {
        toolRounds++;
        const calls = finalMessage.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
        );

        // 선택적 병렬 호출 — 팀장이 고른 전문가들 동시 실행 (D-04)
        const toolResults = await Promise.all(
          calls.map(async (b) => {
            const agentId = toolNameToSpecialistId(b.name);
            if (agentId) {
              sendSSE(res, "agent_start", { agent: agentId, label: SPECIALIST_LABELS[agentId] });
            }
            // 인증 사용자 id · 취소 신호 · 시세 의존성은 서버가 정한다 — 팀장 입력엔 계좌 칸이 없다(SC-2).
            const out = await runSpecialist(b.name, b.input as SpecialistInput, supabase, {
              userId,
              signal: effectiveSignal,
              deps: opts.diagnosisDeps,
              turnDeadlineAt: diagnosisTurnDeadlineAt,
            });
            for (const u of out.usage ?? []) {
              const t = tallyFor(models, u.model);
              t.inputTokens += u.inputTokens;
              t.outputTokens += u.outputTokens;
              t.cacheReadInputTokens += u.cacheReadInputTokens;
              t.cacheCreationInputTokens += u.cacheCreationInputTokens;
            }

            // D-01 — 진단문은 화면에 글자 그대로. emit 과 누적을 한 자리에서 해 화면 · 저장 · 재시도
            // 재전송(WR-03 accumulatedText)이 같은 글자가 되게 한다. 병렬 호출이면 끝나는 순서대로 흐른다.
            if (out.display) {
              const shown = "\n\n" + out.display + "\n\n";
              sendSSE(res, "text", { text: shown });
              accumulatedText += shown;
            }
            if (agentId) sendSSE(res, "agent_end", { agent: agentId });

            // 웹서치 citations → SSE citation + blocks(D-08)
            if (out.citations?.length) {
              for (const c of out.citations) {
                sendSSE(res, "citation", { title: c.title, url: c.url, kind: "web" });
                assistantBlocks.push({
                  type: "citation",
                  title: c.title,
                  url: c.url,
                  kind: "web",
                });
              }
            }

            // 진단문은 팀장에게 「이미 표시됨 — 재서술 금지」 머리와 함께 준다(절단은 tool_result 에만 · 화면 무관).
            let content = out.display ? DIAGNOSIS_RELAY_HEADER + "\n\n" + out.display : out.text;
            if (content.length > MAX_TOOL_RESULT_CHARS) {
              content = content.slice(0, MAX_TOOL_RESULT_CHARS) + "...(truncated)";
            }
            return {
              type: "tool_result" as const,
              tool_use_id: b.id,
              content,
            };
          }),
        );

        workingMessages.push({ role: "user", content: toolResults });
      } else {
        // 전 라운드 누적 텍스트를 저장 대상으로 사용 — 화면 표시분과 일치 (WR-03).
        // 스트림 delta 가 전부 비었으면 finalMessage text 블록에서 폴백 (불필요한 recovery 콜 회피).
        finalText = accumulatedText || messageText(finalMessage);
        break;
      }
    }

    // 모든 tool 라운드 소진 후에도 최종 텍스트가 없으면 tool 없이 강제 요약 1콜
    if (!finalText) {
      const recoverySystem =
        LEAD_PROMPT +
        "\n\n[중요] 더 이상 전문가를 호출할 수 없습니다. 지금까지의 분석 결과를 바탕으로 종합 답변을 작성하세요.";
      let recoveryText = "";
      for (let attempt = 0; ; attempt++) {
        try {
          const stream = client.messages.stream(
            {
              model: cfg.chatLeadModel,
              // Sonnet 5 adaptive thinking + 신형 토크나이저 — 팀장 루프와 동일하게 8192.
              max_tokens: 8192,
              system: [
                {
                  type: "text" as const,
                  text: recoverySystem,
                  cache_control: { type: "ephemeral" as const },
                },
              ],
              messages: workingMessages,
            },
            { signal: effectiveSignal },
          );
          recoveryText = "";
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              recoveryText += event.delta.text;
              sendSSE(res, "text", { text: event.delta.text });
            }
          }
          const recoveryMsg = await stream.finalMessage();
          if (recoveryMsg.usage) {
            turnTokensIn += recoveryMsg.usage.input_tokens;
            turnTokensOut += recoveryMsg.usage.output_tokens;
            addApiUsage(tallyFor(models, cfg.chatLeadModel), recoveryMsg.usage);
          }
          break;
        } catch (err) {
          if (isRetryableError(err) && attempt < MAX_RETRIES) {
            // recovery 콜도 부분 delta 가 나갔으면 클라이언트 누적 리셋 (WR-02).
            if (recoveryText) {
              sendSSE(res, "text_clear", {});
              // 라운드 누적분(중간 서술)은 다시 밀어 표시 유지 (WR-03).
              if (accumulatedText) sendSSE(res, "text", { text: accumulatedText });
            }
            await sleep(1000 * (attempt + 1));
            continue;
          }
          throw err;
        }
      }
      // 라운드 누적분 + recovery 답변 = 사용자가 화면에서 본 전체 텍스트 (WR-03).
      finalText = accumulatedText + recoveryText;
    }

    // 종목 미니 카드 (D-07) — 답변 텍스트의 종목 참조 조회 후 emit
    await emitStockCards(res, supabase, finalText, sentCodes, assistantBlocks);

    // 비용 로깅 (Pitfall 4, 메모리 lesson project_claude_haiku_cost_classify).
    // 기존 키(model · inputTokens · outputTokens · toolRounds)는 로그 쿼리 호환으로 그대로 — models 가 모델별 분해(SC-3).
    logger.info(
      {
        conversationId: convId,
        model: cfg.chatLeadModel,
        inputTokens: turnTokensIn,
        outputTokens: turnTokensOut,
        toolRounds,
        models,
      },
      "[chat] usage",
    );

    // 히스토리 저장 (user 원문 + assistant 종합답변 + blocks). 시트 닫혀도 여기까지 진행(D-06).
    await appendMessage(supabase, convId, { role: "user", content: message });
    await appendMessage(supabase, convId, {
      role: "assistant",
      content: finalText,
      blocks: assistantBlocks.length > 0 ? assistantBlocks : null,
    });

    sendSSE(res, "response_complete", {});
  } finally {
    // 저장 시도까지 종료 — 이 대화를 기다리는 후속 요청 해제 (WR-07, 실패 경로 포함).
    resolvePersist();
    abortSignal.removeEventListener("abort", releaseBusy);
    // 새 요청이 이미 세션을 점유했으면 해제하지 않음 (finally 경쟁 조건 방지)
    if (session.busyAbortSignal === abortSignal) {
      session.busy = false;
      session.interruptController = undefined;
    }
  }
}
