import type Anthropic from "@anthropic-ai/sdk";

/**
 * Phase 14 — 전문가 공용 순수 헬퍼 (테스트에서 mock 하지 않음 — 텍스트/citation 추출 경로 검증).
 */

/**
 * 전문가/팀장 실패 시 반환하는 graceful 안내 텍스트.
 * anthropicApiKey 미설정 또는 Haiku 호출 예외 시 throw 대신 이 텍스트를 반환해,
 * 팀장이 나머지 전문가로 partial 답변을 구성할 수 있게 한다 (RESEARCH 에이전트 실패 처리).
 */
export const SPECIALIST_UNAVAILABLE = "실시간 분석을 사용할 수 없습니다.";

/** Anthropic.Message 에서 첫 text 블록을 추출 (discussion-classify content.find 재사용). */
export function specialistText(res: Anthropic.Message): string {
  const first = res.content.find((c) => c.type === "text");
  return first && first.type === "text" ? first.text.trim() : "";
}
