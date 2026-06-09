import Anthropic from "@anthropic-ai/sdk";
import { loadConfig } from "../config";

/**
 * Phase 10 Plan 06 — Anthropic SDK 싱글톤 (discussion-sync/src/classify/anthropic.ts 복제).
 *
 * lazy 초기화로 import-side-effect 제거 (테스트에서 env 설정 후 호출 순서 자유).
 * `ANTHROPIC_API_KEY` 미설정 시 throw — discoverThemes/correctMembership 가 try/catch 에서
 * 빈 결과 반환(다음 cycle 재시도). 시크릿은 logger redact(cfg.anthropicApiKey, Plan 01)로 차단.
 */
let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (_client) return _client;
  const cfg = loadConfig();
  if (!cfg.anthropicApiKey) throw new Error("ANTHROPIC_API_KEY missing");
  _client = new Anthropic({ apiKey: cfg.anthropicApiKey });
  return _client;
}

/** 테스트 전용 — SDK mock 교체 후 client reset. 런타임에서는 호출하지 말 것. */
export function __resetAnthropicClientForTests(): void {
  _client = null;
}
