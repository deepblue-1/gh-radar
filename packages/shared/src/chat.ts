/**
 * Phase 14 — AI 애널리스트 챗봇 (멀티에이전트) 공유 계약 (CHAT-01).
 *
 * server · webapp 가 공유하는 챗 도메인 타입의 단일 진실 소스.
 * 팀장(Sonnet) + 전문가 5(Haiku: 시세·수급/테마/뉴스·심리/상한가패턴/웹서치)
 * 오케스트레이션의 SSE 이벤트 계약 · 전문가 ID · 대화/메시지 row 타입을 정의한다.
 *
 * 인터페이스-우선: 이후 서버(P03~P06)와 웹앱(P07~P10)이 이 계약에 대해 병렬 구현한다.
 * ChatSSEEventMap 은 SSE 프로토콜의 단일 진실 소스 (RESEARCH Pattern 6).
 *
 * DB 는 snake_case (supabase/migrations/{ts}_chat.sql) — server 순수함수가
 * row → 아래 camelCase 타입으로 변환한다.
 */

/** 전문가 에이전트 5종 식별자. 팀장이 tool-use 로 위임한다. */
export type SpecialistId = "quote" | "theme" | "news" | "limitup" | "websearch";

/** 팀장 tool 이름 → SpecialistId 매핑용 tool 이름 상수. */
export const SPECIALIST_TOOL_NAMES: Record<SpecialistId, string> = {
  quote: "consult_quote_specialist",
  theme: "consult_theme_specialist",
  news: "consult_news_specialist",
  limitup: "consult_limitup_specialist",
  websearch: "consult_websearch_specialist",
};

/** 진행 스텝퍼(D-04/C5) 한글 라벨. UI-SPEC Copywriting 과 일치. */
export const SPECIALIST_LABELS: Record<SpecialistId, string> = {
  quote: "시세·수급 전문가",
  theme: "테마 전문가",
  news: "뉴스·심리 전문가",
  limitup: "상한가 패턴 전문가",
  websearch: "실시간 검색 전문가",
};

/** 대화 메시지 역할. */
export type ChatRole = "user" | "assistant";

/** messages.blocks jsonb 부가물 (D-07/08/10). content 텍스트와 분리. */
export type MessageBlock =
  | { type: "stock_card"; code: string; name: string; price: number; changeRate: number }
  | { type: "chart"; code: string }
  | { type: "citation"; title: string; source?: string; url: string; kind: "news" | "web" };

/** conversations 테이블 row (camelCase). */
export interface ConversationRow {
  id: string;
  userId: string;
  stockCode: string | null;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

/** messages 테이블 row (camelCase). */
export interface MessageRow {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  blocks: MessageBlock[] | null;
  createdAt: string;
}

/**
 * SSE 이벤트 계약 — SSE 프로토콜의 단일 진실 소스 (RESEARCH Pattern 6).
 * key = SSE `event:` 이름, value = `data:` JSON payload 타입.
 */
export interface ChatSSEEventMap {
  session: { conversationId: string };
  text: { text: string };
  text_clear: Record<string, never>;
  agent_start: { agent: SpecialistId; label: string };
  agent_end: { agent: SpecialistId };
  stock_card: { code: string; name: string; price: number; changeRate: number };
  chart: { code: string };
  citation: { title: string; source?: string; url: string; kind: "news" | "web" };
  response_complete: Record<string, never>;
  error: { error?: string; message?: string };
  done: Record<string, never>;
}

/** SSE 이벤트 이름 union. */
export type ChatSSEEventType = keyof ChatSSEEventMap;
