"use client";

/**
 * Phase 14 Plan 10 — `/chat` 대화 관리 페이지 (C10, CHAT-01, D-13).
 *
 * 사이드바 진입 전용 페이지. FAB 시트가 목록 없는 현재-대화만 유지(D-13)하는 것과 달리,
 * 이 페이지는 2-col(좌 280px 대화목록+종목 필터 / 우 thread+composer)로 종목별 히스토리
 * 탐색·이어가기·삭제를 제공한다.
 *
 * ## 반응형(D-13)
 * `<640px` 1-col: 목록(상단, max 40vh 스크롤) + thread(하단). `≥640px` 2-col grid.
 *
 * ## 컴포넌트 재사용
 * thread/message/composer/상태박스/진행스텝퍼는 FAB 시트(P08/P09)와 동일 컴포넌트를
 * 공유한다. SSE 스트리밍 오케스트레이션은 chat-sheet 와 동형이나, 시트/페이지가 서로 다른
 * 상태 소유 주체(시트=useChat provider, 페이지=로컬)라 각자 소유한다 — chat-sheet 를
 * 수정하지 않고(wave 격리) 렌더 컴포넌트만 재사용해 중복을 최소화.
 *
 * ## 인증 · DMA 게이트 (quick-261009-c43 D-01 · D-02 · D-04)
 * middleware(supabase/middleware) 가 whitelist 기반 기본 차단으로 `/chat` 를 이미 보호
 * (비로그인 → /login?next=/chat 302). DMA 미매핑 사용자는 server `requireDmaMapped` 가 챗 API
 * 전부를 403 `DMA_UNMAPPED` 로 막는다(실제 차단). 이 페이지는 접근 탐침(`useChatAccess` →
 * `GET /api/chat/access`) 결과로 표시만 한다 — 웹 사이드바 · 네이티브 앱 AI 탭 · 직접 주소 공통:
 *   - 판정 전 → 본문 비움(대화 화면이 떴다가 게이트로 바뀌는 깜빡임 없음 — 상한가 보고서 Suspense 폴백 null 규율)
 *   - 미매핑 · 비로그인 → `<DmaGate surface="AI 애널리스트">`(대화목록 · 입력창 없음)
 *   - 탐침 실패 → ChatErrorState + 다시 시도
 *   - 세션 중 DMA 연결 해제(스트림 · 대화 열기 403) → markUnmapped 로 DmaGate 전환
 */

import { useCallback, useRef, useState } from "react";
import type {
  ChatSSEEventMap,
  MessageBlock,
  MessageRow,
  SpecialistId,
} from "@gh-radar/shared";

import { useChatAccess } from "@/hooks/use-chat-access";
import { ApiClientError } from "@/lib/api";
import { getConversation } from "@/lib/chat-api";
import { ChatStreamError, streamChat } from "@/lib/chat-sse";
import { DmaGate } from "@/components/trading/dma-gate";
import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";

import { ConversationList } from "@/components/chat/conversation-list";
import { Composer } from "@/components/chat/composer";
import {
  ChatThread,
  type ChatThreadMessage,
} from "@/components/chat/chat-thread";
import { EmptyState, ChatErrorState } from "@/components/chat/chat-states";
import {
  AgentProgress,
  type AgentStepStatus,
} from "@/components/chat/agent-progress";

let idCounter = 0;
/** crypto 미가용 환경 방어 — 단조 증가 로컬 ID. */
function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

function toChatMessage(row: MessageRow): ChatThreadMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    blocks: row.blocks,
  };
}

export default function ChatPage() {
  const { access, retry, markUnmapped } = useChatAccess();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatThreadMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [agentStatus, setAgentStatus] = useState<
    Partial<Record<SpecialistId, AgentStepStatus>>
  >({});
  // 새 대화 생성/삭제 시 목록 재조회 트리거.
  const [listRefresh, setListRefresh] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  // ── 대화 선택 → 이어가기 ────────────────────────────────────────────
  const selectConversation = useCallback(async (id: string) => {
    abortRef.current?.abort();
    setActiveId(id);
    setStreamingText("");
    setIsStreaming(false);
    setAgentStatus({});
    setHasError(false);
    try {
      const detail = await getConversation(id);
      setMessages(detail.messages.map(toChatMessage));
    } catch (err) {
      // 세션 중 DMA 연결 해제 — 오류 상자가 아니라 게이트로(D-02).
      if (err instanceof ApiClientError && err.status === 403) {
        markUnmapped();
        return;
      }
      setMessages([]);
      setHasError(true);
    }
  }, [markUnmapped]);

  // ── ＋ 새 대화 ─────────────────────────────────────────────────────
  const startNew = useCallback(() => {
    abortRef.current?.abort();
    setActiveId(null);
    setMessages([]);
    setStreamingText("");
    setIsStreaming(false);
    setHasError(false);
    setAgentStatus({});
  }, []);

  // ── 전송 + SSE 스트리밍 (D-06) ─────────────────────────────────────
  const send = useCallback(
    async (text: string) => {
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
      setAgentStatus({});

      let assembled = "";
      const collectedBlocks: MessageBlock[] = [];
      try {
        await streamChat(
          { message: text, conversationId: activeId ?? undefined },
          (event, data) => {
            // event/data 는 독립 제네릭이라 case 별 명시 캐스팅(SSE 계약 P02).
            switch (event) {
              case "session": {
                const id = (data as ChatSSEEventMap["session"]).conversationId;
                setActiveId(id);
                // 새 대화가 목록에 나타나도록 재조회.
                setListRefresh((n) => n + 1);
                break;
              }
              case "agent_start": {
                const a = (data as ChatSSEEventMap["agent_start"]).agent;
                setAgentStatus((prev) => ({ ...prev, [a]: "active" }));
                break;
              }
              case "agent_end": {
                const a = (data as ChatSSEEventMap["agent_end"]).agent;
                setAgentStatus((prev) => ({ ...prev, [a]: "done" }));
                break;
              }
              case "stock_card": {
                const c = data as ChatSSEEventMap["stock_card"];
                collectedBlocks.push({ type: "stock_card", ...c });
                break;
              }
              case "citation": {
                const c = data as ChatSSEEventMap["citation"];
                collectedBlocks.push({ type: "citation", ...c });
                break;
              }
              case "chart": {
                const c = data as ChatSSEEventMap["chart"];
                collectedBlocks.push({ type: "chart", code: c.code });
                break;
              }
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
                if (finalText || collectedBlocks.length > 0) {
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: makeId("assistant"),
                      role: "assistant",
                      content: finalText,
                      blocks:
                        collectedBlocks.length > 0 ? collectedBlocks : null,
                    },
                  ]);
                }
                assembled = "";
                setStreamingText("");
                setAgentStatus({});
                break;
              }
              case "error":
                setHasError(true);
                break;
              default:
                break;
            }
          },
          controller.signal,
        );
      } catch (err) {
        if (err instanceof ChatStreamError && err.code === "DMA_UNMAPPED") {
          // 세션 중 DMA 연결 해제 — server 403(D-01)을 게이트로 바꾼다(D-02).
          markUnmapped();
        } else if (!(err instanceof DOMException && err.name === "AbortError")) {
          setHasError(true);
        }
      } finally {
        // 이전 send 의 늦은 finally(abort rejection 마이크로태스크)가 새 스트림의
        // isStreaming=true 를 덮지 않도록 controller 정체성 가드 (WR-06).
        if (abortRef.current === controller) setIsStreaming(false);
      }
    },
    [activeId, markUnmapped],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const handleDeleted = useCallback(
    (id: string) => {
      if (id === activeId) startNew();
    },
    [activeId, startNew],
  );

  const showEmpty =
    !hasError && messages.length === 0 && !isStreaming && !streamingText;

  // 판정 전 — 본문 비움(스켈레톤 없음). 대화 화면이 떴다가 게이트로 바뀌지 않게(D-02).
  if (access === "pending") {
    return <AppShell sidebar={<AppSidebar />}>{null}</AppShell>;
  }

  // 미매핑 · 비로그인 — 표시만. 실제 차단은 server requireDmaMapped(D-01).
  if (access === "unmapped" || access === "unauthenticated") {
    return (
      <AppShell sidebar={<AppSidebar />}>
        <div className="flex h-full items-center justify-center p-[var(--s-4)]">
          <DmaGate reason={access} surface="AI 애널리스트" />
        </div>
      </AppShell>
    );
  }

  // 탐침 실패(500 · 네트워크) — 권한 없음으로 위장하지 않고 다시 시도를 준다.
  if (access === "error") {
    return (
      <AppShell sidebar={<AppSidebar />}>
        <div className="flex h-full items-center justify-center">
          <ChatErrorState onRetry={retry} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell sidebar={<AppSidebar />}>
      <div className="flex h-full flex-col sm:grid sm:grid-cols-[280px_1fr] sm:gap-0">
        {/* 좌: 대화목록 (모바일 상단 스택) */}
        <aside className="max-h-[40vh] shrink-0 overflow-hidden border-b border-[var(--border-subtle)] sm:max-h-none sm:border-b-0 sm:border-r">
          <ConversationList
            activeId={activeId}
            onSelect={(id) => void selectConversation(id)}
            onNew={startNew}
            onDeleted={handleDeleted}
            refreshKey={listRefresh}
          />
        </aside>

        {/* 우: thread + composer */}
        <section className="flex min-h-0 flex-1 flex-col">
          <div
            className="flex-1 overflow-y-auto p-[var(--s-4)]"
            aria-live="polite"
            aria-busy={isStreaming}
          >
            {hasError ? (
              <ChatErrorState />
            ) : showEmpty ? (
              <EmptyState />
            ) : (
              <ChatThread
                messages={messages}
                streamingText={streamingText}
                isStreaming={isStreaming}
                progressSlot={
                  Object.keys(agentStatus).length > 0 ? (
                    <AgentProgress status={agentStatus} />
                  ) : undefined
                }
              />
            )}
          </div>

          <Composer
            onSend={(t) => void send(t)}
            isStreaming={isStreaming}
            onStop={stop}
          />
        </section>
      </div>
    </AppShell>
  );
}
