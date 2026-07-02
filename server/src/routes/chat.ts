import { Router, type Router as RouterT } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversationRow } from "@gh-radar/shared";
import { requireAuth } from "../middleware/require-auth.js";
import { ChatPostBody, ConversationListQuery } from "../schemas/chat.js";
import { ValidationFailed } from "../errors.js";
import { loadConfig } from "../config.js";
import { logger } from "../logger.js";
import { handleChatStream } from "../services/chat-service.js";
import {
  listConversations,
  loadConversation,
  deleteConversation,
} from "../services/chat-history.js";

/**
 * Phase 14 Plan 06 — 챗 라우트 (CHAT-01, ww-bot chat.ts SSE 이식).
 *
 * - POST /            : JWT 인증 후 SSE 스트림으로 팀장 답변 (handleChatStream 위임).
 * - GET  /conversations       : 사용자 대화 목록 (종목 필터 D-13).
 * - GET  /conversations/:id   : 대화 + 메시지 로드 (소유권 검증, 미소유 404 T-14-01).
 * - DELETE /conversations/:id : 대화 삭제 (소유권 검증).
 *
 * 모든 라우트 requireAuth() — SSE 헤더 쓰기 전 401(Pattern 3, T-14-02). SSE 는
 * X-Accel-Buffering:no + 15s keepalive(Cloud Run Pitfall 2) + close→abort + done 보장.
 * CHAT_DISABLED kill-switch 503(헤더 전, T-14-04). 에러는 next(e)/generic — error.message 미노출(V7).
 */

/** 라우트 전용 rate-limit — /api(200/60s) 위에 챗 POST 만 추가 강화(T-14-04 비용 방어). */
const chatRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "", 64),
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: "RATE_LIMITED", message: "채팅 요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
    });
  },
});

/** :id 경로 파라미터 검증 — express 5 params(string|string[]) 정규화 + uuid 형식 방어. */
const ConversationIdParam = z.object({ id: z.string().uuid() });

export const chatRouter: RouterT = Router();

// --- POST / — SSE 스트리밍 챗 ---
chatRouter.post("/", chatRateLimit, requireAuth(), async (req, res, next) => {
  const parsed = ChatPostBody.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    next(ValidationFailed(`${issue.path.join(".")}: ${issue.message}`));
    return;
  }
  const { message, conversationId, stockCode } = parsed.data;

  // kill-switch — SSE 헤더 쓰기 전 503 (일반 JSON, T-14-04)
  if (!loadConfig().chatEnabled) {
    res.status(503).json({
      error: { code: "CHAT_DISABLED", message: "AI 애널리스트가 잠시 점검 중입니다." },
    });
    return;
  }

  const supabase = req.app.locals.supabase as SupabaseClient;

  // 클라이언트 연결 종료(시트 닫힘) 전파 — SSE 전송만 멈추고 생성/저장은 계속(D-06)
  const clientAbort = new AbortController();
  req.on("close", () => clientAbort.abort());

  // SSE 헤더 (Cloud Run Pitfall 2 — X-Accel-Buffering:no)
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // 15s keepalive — 프록시 유휴 타임아웃 방지 (전문가 병렬 대기 침묵 구간)
  const keepalive = setInterval(() => {
    if (!res.writableEnded) res.write(": keepalive\n\n");
  }, 15_000);

  try {
    await handleChatStream(res, supabase, clientAbort.signal, {
      userId: req.userId!,
      conversationId,
      message,
      stockCode,
    });
  } catch (err) {
    // 클라이언트 연결 종료는 에러 아님
    if (!((err as Error)?.name === "AbortError" || clientAbort.signal.aborted)) {
      logger.error({ err: (err as Error).message }, "[chat] stream error");
      if (!res.writableEnded) {
        res.write(
          `event: error\ndata: ${JSON.stringify({ message: "처리 중 문제가 발생했어요. 다시 시도해주세요." })}\n\n`,
        );
      }
    }
  } finally {
    clearInterval(keepalive);
    if (!res.writableEnded) {
      res.write("event: done\ndata: {}\n\n");
      res.end();
    }
  }
});

// --- GET /conversations — 사용자 대화 목록 (종목 필터 D-13) ---
chatRouter.get("/conversations", requireAuth(), async (req, res, next) => {
  try {
    const parsed = ConversationListQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw ValidationFailed(`${issue.path.join(".")}: ${issue.message}`);
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    const data: ConversationRow[] = await listConversations(
      supabase,
      req.userId!,
      parsed.data.stockCode,
    );
    // 코드베이스 규약: list 엔드포인트는 bare array 반환(scanner/themes/news 동일).
    // webapp apiFetch<ConversationRow[]> 는 envelope 를 unwrap 하지 않으므로 { data } 로
    // 감싸면 listConversations 가 배열이 아닌 객체를 받아 종목별 히스토리가 조용히 사라진다.
    res.json(data);
  } catch (e) {
    next(e);
  }
});

// --- GET /conversations/:id — 대화 + 메시지 로드 (소유권 검증) ---
chatRouter.get("/conversations/:id", requireAuth(), async (req, res, next) => {
  try {
    const idParsed = ConversationIdParam.safeParse(req.params);
    if (!idParsed.success) throw ValidationFailed("id: invalid conversation id");
    const supabase = req.app.locals.supabase as SupabaseClient;
    const { conversation, messages } = await loadConversation(
      supabase,
      idParsed.data.id,
      req.userId!,
    );
    res.json({ conversation, messages });
  } catch (e) {
    next(e);
  }
});

// --- DELETE /conversations/:id — 대화 삭제 (소유권 검증) ---
chatRouter.delete("/conversations/:id", requireAuth(), async (req, res, next) => {
  try {
    const idParsed = ConversationIdParam.safeParse(req.params);
    if (!idParsed.success) throw ValidationFailed("id: invalid conversation id");
    const supabase = req.app.locals.supabase as SupabaseClient;
    await deleteConversation(supabase, idParsed.data.id, req.userId!);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
