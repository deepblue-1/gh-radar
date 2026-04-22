import Anthropic from "@anthropic-ai/sdk";
import { loadConfig } from "../config.js";

/**
 * Phase 08.1 — Anthropic SDK 싱글톤.
 *
 * lazy 초기화로 import-side-effect 제거 (테스트에서 env 설정 후 호출 순서 자유).
 * `ANTHROPIC_API_KEY` 미설정 시 throw — classifyOne 이 try/catch 에서 null 반환.
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
