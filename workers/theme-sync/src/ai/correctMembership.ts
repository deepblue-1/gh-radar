import type pino from "pino";
import pLimit from "p-limit";
import { getAnthropicClient } from "./anthropic";
import {
  CORRECT_SYSTEM_PROMPT,
  formatCorrectMessage,
  buildCorrectFewShot,
} from "./prompt";
import type { ThemeSyncConfig } from "../config";

/**
 * Phase 10 Plan 06 — 종목↔테마 오분류 교정 (RESEARCH §Pattern 6 (b)).
 *
 * 보수적 설계(false positive 회피):
 *  - AI 가 "명백히 무관" 으로 판단한 매핑만 effective_to soft-제외 대상으로 반환.
 *  - 추가 편입은 절대 하지 않음(제외 후보만).
 *  - classifyEnabled=false 면 즉시 빈 결과(Claude 호출 0 — kill-switch).
 *  - JSON 파싱 실패/SDK 예외는 try/catch 로 빈 결과(원 source 데이터 보존 — 잘못 제외 방지).
 *  - persistAi 가 effective_to 만 마킹(naver/alphasquare row 물리 삭제 금지, T-10-06-02).
 */

/** 교정 입력 — 검수 대상 종목↔테마 매핑 (신규/변경분만). */
export interface MembershipRow {
  themeId: string;
  themeName: string;
  stockCode: string;
  reason: string | null;
}

/** 교정 결과 — effective_to soft-제외 대상. */
export interface CorrectionTarget {
  themeId: string;
  stockCode: string;
}

/** 한 청크에 담는 매핑 수 (토큰 제어). */
const MEMBERSHIP_CHUNK = 40;
/** 교정 응답 max_tokens (JSON key 목록). */
const CORRECT_MAX_TOKENS = 1024;

/** SDK 텍스트 응답 → "themeId::stockCode" key 집합 (파싱 실패 시 빈 배열). */
function parseCorrectResponse(text: string): string[] {
  let parsed: { unrelated?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const unrelated = (parsed as { unrelated?: unknown }).unrelated;
  if (!Array.isArray(unrelated)) return [];
  return (unrelated as unknown[]).filter(
    (k): k is string => typeof k === "string" && k.includes("::"),
  );
}

/** 단일 매핑 청크 → Claude 1회 호출 → 제외 key 목록 (실패 시 빈 배열). */
async function correctChunk(
  cfg: ThemeSyncConfig,
  chunk: MembershipRow[],
): Promise<string[]> {
  try {
    const client = getAnthropicClient();
    const res = await client.messages.create({
      model: cfg.classifyModel,
      max_tokens: CORRECT_MAX_TOKENS,
      temperature: 0,
      system: CORRECT_SYSTEM_PROMPT,
      messages: [
        ...buildCorrectFewShot(),
        { role: "user", content: formatCorrectMessage(chunk) },
      ],
    });
    const first = res.content.find((c) => c.type === "text");
    const text = first && first.type === "text" ? first.text.trim() : "";
    return parseCorrectResponse(text);
  } catch {
    // SDK 예외 — 빈 결과(잘못된 soft-제외 방지, 원본 보존).
    return [];
  }
}

/**
 * 신규/변경분 종목↔테마 매핑을 Claude 로 검수 → "명백히 무관" 만 soft-제외 대상으로 반환.
 * 입력 themeId::stockCode 화이트리스트로 응답을 교차검증(AI 환각 key 방어).
 */
export async function correctMembership(
  cfg: ThemeSyncConfig,
  rows: MembershipRow[],
  log: pino.Logger,
): Promise<CorrectionTarget[]> {
  // kill-switch — classify 비활성 시 Claude 호출 0.
  if (!cfg.classifyEnabled) {
    log.info("classify disabled — skip membership correction (Claude 호출 0)");
    return [];
  }
  if (rows.length === 0) return [];

  // 입력 매핑 key 집합 — AI 가 환각으로 만든 key 는 무시(입력에 있는 것만 제외).
  const validKeys = new Map<string, CorrectionTarget>();
  for (const r of rows) {
    validKeys.set(`${r.themeId}::${r.stockCode}`, {
      themeId: r.themeId,
      stockCode: r.stockCode,
    });
  }

  const chunks: MembershipRow[][] = [];
  for (let i = 0; i < rows.length; i += MEMBERSHIP_CHUNK) {
    chunks.push(rows.slice(i, i + MEMBERSHIP_CHUNK));
  }
  const limit = pLimit(cfg.classifyConcurrency);
  const settled = await Promise.allSettled(
    chunks.map((c) => limit(() => correctChunk(cfg, c))),
  );

  const targets = new Map<string, CorrectionTarget>();
  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    for (const key of s.value) {
      const t = validKeys.get(key); // 입력에 있던 매핑만(환각 방어).
      if (t) targets.set(key, t);
    }
  }

  const result = [...targets.values()];
  log.info(
    { reviewed: rows.length, unrelated: result.length },
    "correctMembership done",
  );
  return result;
}
