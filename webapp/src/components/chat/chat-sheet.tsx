"use client";

/**
 * Phase 14 Plan 08 — 챗 시트 (C2, CHAT-01, D-03/D-06).
 *
 * shadcn Sheet(우측 드로어)로 제어되는 현재-대화 전용 셸. 목록/이어가기 UI 는 없다(D-13,
 * /chat P10 담당). 헤더(AI 아바타 + 제목 + 종목 서브 + ＋새 대화 + 닫기) / thread(스크롤)
 * / composer 로 구성. 메시지 렌더 세부(마크다운/진행스텝퍼/카드)는 P09 가 채운다 — 이
 * plan 은 텍스트 append 수준의 최소 thread + SSE 배선까지.
 *
 * ## D-03 자동 이어가기 (BLOCKER 해소)
 * open===true 로 전환되고 stockContext 가 있으면 listConversations(code) → 최신 대화의
 * getConversation 으로 messages 프리로드 + conversationId 세팅, 없으면 빈 상태(새 대화).
 * stockContext 가 null(일반 챗)이면 자동 로드하지 않는다. 같은 (open,code) 조합 1회만
 * 로드(guard ref). 로드 실패 시 에러 상태 박스.
 *
 * ## D-06 스트리밍/중단
 * 새 전송 시 이전 응답을 자동 abort(abortRef). 정지 버튼은 명시 abort. 시트를 닫아도
 * (closeChat) 진행 중 fetch 는 abort 하지 않는다 — 서버가 완료 후 저장.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatRole, MessageRow, ChatSSEEventMap } from "@gh-radar/shared";

import { useAuth } from "@/lib/auth-context";
import { listConversations, getConversation } from "@/lib/chat-api";
import { streamChat } from "@/lib/chat-sse";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

import { useChat } from "./chat-provider";
import { Composer } from "./composer";
import { EmptyState, LoginRequiredState, ChatErrorState } from "./chat-states";

/** thread 렌더용 최소 메시지 형태. */
interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
}

let idCounter = 0;
/** crypto 미가용 환경 방어 — 단조 증가 로컬 ID. */
function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

function toChatMessage(row: MessageRow): ChatMessage {
  return { id: row.id, role: row.role, content: row.content };
}

export function ChatSheet() {
  const { user } = useAuth();
  const { open, closeChat, stockContext } = useChat();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasError, setHasError] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  // D-03 중복 로드 방지 — 같은 (open,code) 조합 1회만.
  const loadedKeyRef = useRef<string | null>(null);

  // ── D-03 자동 이어가기 ──────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      // 닫히면 리셋 — 재오픈 시 다시 로드.
      loadedKeyRef.current = null;
      return;
    }
    if (!stockContext) return; // 일반 챗은 자동 로드 안 함(D-13)

    const key = stockContext.code;
    if (loadedKeyRef.current === key) return;
    loadedKeyRef.current = key;

    let cancelled = false;
    setHasError(false);
    void (async () => {
      try {
        const convs = await listConversations(stockContext.code);
        if (cancelled) return;
        if (convs.length > 0) {
          const detail = await getConversation(convs[0]!.id);
          if (cancelled) return;
          setMessages(detail.messages.map(toChatMessage));
          setConversationId(detail.conversation.id);
        } else {
          setMessages([]);
          setConversationId(null);
        }
      } catch {
        if (!cancelled) setHasError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, stockContext]);

  // ── ＋ 새 대화 ─────────────────────────────────────────────────────
  const startNewConversation = useCallback(() => {
    // 진행 중 스트리밍은 명시 abort(같은 종목으로 새 대화).
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    setStreamingText("");
    setIsStreaming(false);
    setHasError(false);
  }, []);

  // ── 전송 + SSE 스트리밍 (D-06) ─────────────────────────────────────
  const send = useCallback(
    async (text: string) => {
      // 새 질문 시 이전 응답 자동 abort(D-06).
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setHasError(false);
      setMessages((prev) => [
        ...prev,
        { id: makeId("user"), role: "user", content: text },
      ]);
      setStreamingText("");
      setIsStreaming(true);

      let assembled = "";
      try {
        await streamChat(
          {
            message: text,
            conversationId: conversationId ?? undefined,
            stockCode: stockContext?.code,
          },
          (event, data) => {
            // event/data 는 독립 제네릭 파라미터라 switch 로 자동 narrow 되지 않는다 —
            // 각 case 에서 대응 payload 타입으로 명시 캐스팅한다(SSE 계약 P02 기준).
            switch (event) {
              case "session":
                setConversationId(
                  (data as ChatSSEEventMap["session"]).conversationId,
                );
                break;
              case "text":
                assembled += (data as ChatSSEEventMap["text"]).text;
                setStreamingText(assembled);
                break;
              case "text_clear":
                assembled = "";
                setStreamingText("");
                break;
              case "response_complete": {
                const finalText = assembled;
                if (finalText) {
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: makeId("assistant"),
                      role: "assistant",
                      content: finalText,
                    },
                  ]);
                }
                assembled = "";
                setStreamingText("");
                break;
              }
              case "error":
                setHasError(true);
                break;
              // agent_start/agent_end/stock_card/citation/chart/done → P09 렌더 훅 위임(현 plan 최소 placeholder)
              default:
                break;
            }
          },
          controller.signal,
        );
      } catch (err) {
        // 사용자 abort(D-06)는 에러로 취급하지 않는다.
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setHasError(true);
        }
      } finally {
        setIsStreaming(false);
      }
    },
    [conversationId, stockContext],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const showEmpty =
    !hasError && messages.length === 0 && !isStreaming && !streamingText;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && closeChat()}>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 sm:max-w-[440px]"
      >
        <SheetHeader className="flex-row items-center gap-[var(--s-2)] pr-12">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[length:var(--t-caption)] font-semibold text-[var(--primary-fg)]"
            aria-hidden="true"
          >
            AI
          </span>
          <div className="flex min-w-0 flex-col">
            <SheetTitle className="truncate">AI 애널리스트</SheetTitle>
            <SheetDescription className="sr-only">
              상한가 따라잡기 전략을 돕는 AI 애널리스트 대화 창입니다.
            </SheetDescription>
            {stockContext && (
              <span className="truncate text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                {stockContext.name} · 상한가 따라잡기
              </span>
            )}
          </div>
          <button
            type="button"
            aria-label="새 대화"
            onClick={startNewConversation}
            className="ml-auto rounded-[var(--r)] border border-[var(--border)] px-[var(--s-2)] py-1 text-[length:var(--t-caption)] text-[var(--muted-fg)] hover:bg-[var(--muted)] hover:text-[var(--fg)]"
          >
            ＋ 새 대화
          </button>
        </SheetHeader>

        {!user ? (
          <div className="flex-1">
            <LoginRequiredState />
          </div>
        ) : (
          <>
            <div
              className="flex-1 overflow-y-auto p-[var(--s-4)]"
              aria-live="polite"
              aria-busy={isStreaming}
            >
              {hasError ? (
                <ChatErrorState />
              ) : showEmpty ? (
                <EmptyState onPromptSelect={(t) => void send(t)} />
              ) : (
                <div className="flex flex-col gap-[var(--s-4)]">
                  {messages.map((m) =>
                    m.role === "user" ? (
                      <div key={m.id} className="flex justify-end">
                        <div className="max-w-[80%] whitespace-pre-wrap rounded-[12px_12px_4px_12px] bg-[var(--accent)] px-[var(--s-3)] py-[var(--s-2)] text-[length:var(--t-sm)] text-[var(--accent-fg)]">
                          {m.content}
                        </div>
                      </div>
                    ) : (
                      <div key={m.id} className="flex flex-col gap-[var(--s-1)]">
                        <span className="text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)]">
                          팀장 애널리스트
                        </span>
                        <div className="whitespace-pre-wrap text-[length:var(--t-sm)] leading-relaxed text-[var(--fg)]">
                          {m.content}
                        </div>
                      </div>
                    ),
                  )}
                  {streamingText && (
                    <div className="flex flex-col gap-[var(--s-1)]">
                      <span className="text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)]">
                        팀장 애널리스트
                      </span>
                      <div className="whitespace-pre-wrap text-[length:var(--t-sm)] leading-relaxed text-[var(--fg)]">
                        {streamingText}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <Composer
              onSend={(t) => void send(t)}
              isStreaming={isStreaming}
              onStop={stop}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
