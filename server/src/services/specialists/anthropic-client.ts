import Anthropic from "@anthropic-ai/sdk";

/**
 * Phase 14 — 챗 전문가 공용 Anthropic client (lazy 싱글톤).
 *
 * 선례: discussion-classify.ts 의 getClient/__resetAnthropicClientForTests 패턴을
 * 전문가 모듈들이 공유하도록 별도 모듈로 추출. 테스트는 이 모듈을 mock 해
 * messages.create 를 스파이로 교체한다 (specialists.test.ts).
 *
 * anthropicApiKey 재사용 — 챗도 기존 키(config.anthropicApiKey). 신규 키 없음.
 */

let _client: Anthropic | null = null;

/** 프로세스당 1회만 Anthropic client 생성 (lazy 싱글톤). */
export function getChatAnthropicClient(apiKey: string): Anthropic {
  if (_client) return _client;
  _client = new Anthropic({ apiKey });
  return _client;
}

/** 테스트 전용 — SDK mock 교체 후 client reset. 런타임에서 호출 금지. */
export function __resetChatClientForTests(): void {
  _client = null;
}
