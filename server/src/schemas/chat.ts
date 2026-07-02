import { z } from "zod";

/**
 * Phase 14 — 챗 입력 검증 (CHAT-01, T-14-05a Input Validation / V5).
 *
 * message 길이 상한·conversationId uuid·stockCode 6자리 정규식으로 PostgREST/Anthropic
 * 바인딩 전에 형식을 검증해 프롬프트 인젝션·오류 입력 표면을 축소한다 (home/search 톤).
 * 6자리 종목코드 정규식은 search.ts 선례(`/^\d{6}$/` 계열)와 동일 패턴.
 */

/**
 * POST /api/chat body.
 * - message: 1~1,000자 (D — Claude's Discretion, V5 프롬프트 표면 축소)
 * - conversationId: 선택 — 없으면 새 대화 생성, 있으면 소유권 검증 후 이어가기
 * - stockCode: 선택 — 종목상세 컨텍스트(D-03). 6자리 숫자.
 */
export const ChatPostBody = z.object({
  message: z.string().min(1).max(1000),
  conversationId: z.string().uuid().optional(),
  stockCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});
export type ChatPostBodyT = z.infer<typeof ChatPostBody>;

/**
 * GET /api/conversations 쿼리 — 종목별 대화 목록 필터(D-13).
 * stockCode 없으면 사용자 전체 대화, 있으면 해당 종목 대화만.
 */
export const ConversationListQuery = z.object({
  stockCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});
export type ConversationListQueryT = z.infer<typeof ConversationListQuery>;
