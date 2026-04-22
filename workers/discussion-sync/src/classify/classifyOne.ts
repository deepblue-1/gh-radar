import { getAnthropicClient } from "./anthropic.js";
import {
  CLASSIFY_SYSTEM_PROMPT,
  formatUserMessage,
  buildFewShotMessages,
} from "./prompt.js";
import { loadConfig } from "../config.js";

/**
 * Phase 08.1 — 단일 discussion row 분류.
 *
 * approved plan §Decisions §1 (claude-haiku-4-5) + §2 (max_tokens=10, temperature=0)
 * 라벨 매치 실패(unknown text) 또는 API 예외 시 null 반환 → 호출자는 classified_at
 * 미업데이트 → 다음 cycle 에서 재시도 (§8 retry 정책).
 */
export type Label = "price_reason" | "theme" | "news_info" | "noise";

const LABELS: ReadonlySet<Label> = new Set<Label>([
  "price_reason",
  "theme",
  "news_info",
  "noise",
]);

export async function classifyOne(row: {
  id: string;
  title: string;
  body: string | null;
}): Promise<Label | null> {
  const cfg = loadConfig();
  const client = getAnthropicClient();
  try {
    const res = await client.messages.create({
      model: cfg.classifyModel,
      max_tokens: 10,
      temperature: 0,
      system: CLASSIFY_SYSTEM_PROMPT,
      messages: [
        ...buildFewShotMessages(),
        { role: "user", content: formatUserMessage(row.title, row.body) },
      ],
    });
    // SDK 의 content 는 Array<TextBlock | ToolUseBlock | ...>. 텍스트 블록만 사용.
    const first = res.content.find((c) => c.type === "text");
    const text =
      first && first.type === "text" ? first.text.trim().toLowerCase() : "";
    if (LABELS.has(text as Label)) return text as Label;
    return null;
  } catch {
    // 실패 시 skip — classified_at 미업데이트 → 다음 cycle 재시도
    return null;
  }
}
