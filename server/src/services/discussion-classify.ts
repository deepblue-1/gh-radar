import Anthropic from "@anthropic-ai/sdk";
import pLimit from "p-limit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadConfig } from "../config.js";
import { logger } from "../logger.js";

/**
 * Phase 08.1 — server-side inline classify service.
 *
 * ⚠️ TEMP DUPLICATION: 이 로직은 workers/discussion-sync/src/classify/ 와 동일.
 * 향후 packages/discussion-classify 로 이관 예정 (approved plan Plan 08.1-04 §최소침입 방식).
 * 수정 시 worker 쪽과 drift 되지 않도록 주의 — prompt / few-shot / max_tokens / temperature
 * / model 기본값 / 4-label whitelist / 500자 truncate 전부 문자열 단위 동일해야 함.
 *
 * export: classifyAndPersist(supabase, rows) — {id,title,body}[] → 성공 UPDATE 수
 *  → 동일한 고정 system prompt + few-shot 3개 + max_tokens=10 + temperature=0 + p-limit(5)
 *  → Supabase UPDATE discussions SET relevance=$1, classified_at=now() WHERE id=$2
 *
 * Graceful no-op: config.anthropicApiKey == null → logger.warn + return 0.
 * 개별 row 실패는 swallow (다음 refresh 에서 재시도) — classifyOne 이 null 반환.
 */

export type Label = "price_reason" | "theme" | "news_info" | "noise";

const LABELS: ReadonlySet<Label> = new Set<Label>([
  "price_reason",
  "theme",
  "news_info",
  "noise",
]);

// workers/discussion-sync/src/classify/prompt.ts 와 문자열 단위 동일.
const CLASSIFY_SYSTEM_PROMPT = `한국 주식 종목토론방 글을 다음 4개 라벨 중 하나로 분류해라. price_reason(가격 움직임 이유·차트·수급), theme(테마·업종·정책 언급), news_info(뉴스 인용·공시·실적 사실), noise(욕설·감탄사·뇌피셜·광고·단순 반응). 출력은 라벨 단어 하나만.`;

const FEW_SHOT: Array<{ title: string; body: string; label: string }> = [
  {
    title: "실적 서프라이즈 — 영업이익 35% 증가",
    body: "금일 공시된 1분기 실적, 컨센 대비 35% 초과 달성. 매출도 전년 대비 12% 증가.",
    label: "news_info",
  },
  {
    title: "2차전지 섹터 로테이션 지속",
    body: "정책 수혜 테마가 돌면서 관련 업종으로 자금 유입. LG엔솔/포스코퓨처엠 동반 강세.",
    label: "theme",
  },
  {
    title: "ㅋㅋㅋ 또 떨어지네",
    body: "",
    label: "noise",
  },
];

function formatUserMessage(title: string, body: string | null): string {
  const b = (body ?? "").slice(0, 500);
  return `제목: ${title}\n본문: ${b}`;
}

function buildFewShotMessages(): Array<{
  role: "user" | "assistant";
  content: string;
}> {
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const fs of FEW_SHOT) {
    out.push({ role: "user", content: formatUserMessage(fs.title, fs.body) });
    out.push({ role: "assistant", content: fs.label });
  }
  return out;
}

// Anthropic client 은 lazy 싱글톤 — 프로세스 당 1회만 생성.
let _client: Anthropic | null = null;
function getClient(apiKey: string): Anthropic {
  if (_client) return _client;
  _client = new Anthropic({ apiKey });
  return _client;
}

/** 테스트 전용 — SDK mock 교체 후 client reset. 런타임에서 호출 금지. */
export function __resetAnthropicClientForTests(): void {
  _client = null;
}

async function classifyOne(
  client: Anthropic,
  model: string,
  row: { id: string; title: string; body: string | null },
): Promise<Label | null> {
  try {
    const res = await client.messages.create({
      model,
      max_tokens: 10,
      temperature: 0,
      system: CLASSIFY_SYSTEM_PROMPT,
      messages: [
        ...buildFewShotMessages(),
        { role: "user", content: formatUserMessage(row.title, row.body) },
      ],
    });
    const first = res.content.find((c) => c.type === "text");
    const text =
      first && first.type === "text" ? first.text.trim().toLowerCase() : "";
    if (LABELS.has(text as Label)) return text as Label;
    return null;
  } catch {
    return null;
  }
}

/**
 * N 개 discussion row 를 Claude Haiku 4.5 로 분류 + DB UPDATE.
 *
 * @returns 성공 UPDATE 수 (Map 에 들어간 라벨 중 DB 업데이트 성공한 것). API key 미설정 시 0.
 */
export async function classifyAndPersist(
  supabase: SupabaseClient,
  rows: Array<{ id: string; title: string; body: string | null }>,
): Promise<number> {
  if (rows.length === 0) return 0;
  const cfg = loadConfig();
  if (!cfg.anthropicApiKey) {
    logger.warn({}, "anthropic key missing — classify skipped");
    return 0;
  }

  const client = getClient(cfg.anthropicApiKey);
  const limit = pLimit(cfg.classifyConcurrency);
  const results = new Map<string, Label>();

  await Promise.allSettled(
    rows.map((r) =>
      limit(async () => {
        const label = await classifyOne(client, cfg.classifyModel, r);
        if (label) results.set(r.id, label);
      }),
    ),
  );

  if (results.size === 0) return 0;

  const now = new Date().toISOString();
  let updated = 0;
  for (const [id, label] of results) {
    const { error } = await supabase
      .from("discussions")
      .update({ relevance: label, classified_at: now })
      .eq("id", id);
    if (!error) updated++;
  }
  return updated;
}
