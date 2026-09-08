import { z } from "zod";
import { SHORT_CODE_RE } from "@gh-radar/shared";

/**
 * Phase 14 — 챗 입력 검증 (CHAT-01, T-14-05a Input Validation / V5).
 *
 * message 길이 상한·conversationId uuid·stockCode 단축코드 정규식으로 PostgREST/Anthropic
 * 바인딩 전에 형식을 검증해 프롬프트 인젝션·오류 입력 표면을 축소한다 (home/search 톤).
 * 종목코드는 `@gh-radar/shared` 의 `SHORT_CODE_RE`(`^[0-9A-Z]{6}$`) 단일 정의를 쓴다 —
 * KRX 가 2025년부터 영문 포함 단축코드(예: 채비 `0011T0`)를 발급하므로 숫자 전용 가정은
 * 틀렸다(2026-09-08 quick-260908-fis). 대문자 A–Z 만 늘었을 뿐 앵커·길이 6 은 그대로라
 * 따옴표·괄호·공백·와일드카드는 계속 거부된다.
 */

/**
 * POST /api/chat body.
 * - message: 1~1,000자 (D — Claude's Discretion, V5 프롬프트 표면 축소)
 * - conversationId: 선택 — 없으면 새 대화 생성, 있으면 소유권 검증 후 이어가기
 * - stockCode: 선택 — 종목상세 컨텍스트(D-03). 6자 단축코드(숫자+대문자).
 */
export const ChatPostBody = z.object({
  message: z.string().min(1).max(1000),
  conversationId: z.string().uuid().optional(),
  stockCode: z
    .string()
    .regex(SHORT_CODE_RE)
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
    .regex(SHORT_CODE_RE)
    .optional(),
});
export type ConversationListQueryT = z.infer<typeof ConversationListQuery>;
