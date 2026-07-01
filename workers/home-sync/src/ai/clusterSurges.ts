import type {
  HomeNewsRef,
  HomeSnapshotPayload,
  HomeSurgeSingle,
  HomeSurgeTheme,
} from "@gh-radar/shared";

/**
 * clusterSurges 결과 — themes/singles 만 계산한다. threshold/marketStatus 는 caller(index.ts)가
 * 슬롯 컨텍스트로 확정해 채운다 (RESEARCH §Pattern 3).
 */
export type ClusterResult = Pick<HomeSnapshotPayload, "themes" | "singles">;
import { getAnthropicClient } from "./anthropic";
import { extractJsonObject } from "./parseJson";
import {
  CLUSTER_SYSTEM_PROMPT,
  buildClusterFewShot,
  formatClusterMessage,
} from "./prompt";
import type { Surge } from "../pipeline/loadSurges";
import type { HomeSyncConfig } from "../config";

/**
 * Phase 13 Plan 02 Task 2 — Claude Haiku 1회 bottom-up 클러스터 + resolve/sort/classify.
 *
 * 흐름 (RESEARCH §Pattern 3):
 *   1. surges → formatClusterMessage (번호 매긴 뉴스 + indexedNews).
 *   2. Claude 1x (temp=0, max_tokens 2048, fence guard) → { themes, singles } (인덱스만).
 *   3. resolveNewsRefs: newsRefs 인덱스 → verbatim indexedNews (범위 밖 drop, D-04).
 *   4. demoteInvalidThemes: 급등 집합 밖 stockCode drop, <2 valid 테마 → single 강등 (D-06).
 *   5. sortThemes: stockCodes.length desc → tie 시 avg changeRate desc (D-05). singles 는 rate desc.
 *
 * fail-safe: 빈 surges → Claude 호출 0. Claude 예외/파싱 실패 → 빈 payload (cycle 은 계속).
 */

const CLUSTER_MAX_TOKENS = 2048;

/** Claude 응답 원시 테마 (인덱스만). */
interface RawTheme {
  name: string;
  reason: string | null;
  stockCodes: string[];
  newsRefs: number[];
}
interface RawSingle {
  stockCode: string;
  reason: string | null;
  newsRefs: number[];
}

/** newsRefs 인덱스 → verbatim 뉴스 (범위 밖 인덱스 drop, D-04 anti-hallucination). */
export function resolveNewsRefs(
  indexedNews: Array<{ title: string; url: string; source: string }>,
  refs: number[],
): HomeNewsRef[] {
  const out: HomeNewsRef[] = [];
  for (const r of refs) {
    if (!Number.isInteger(r) || r < 0 || r >= indexedNews.length) continue;
    out.push(indexedNews[r]);
  }
  return out;
}

/**
 * 급등 집합 밖 stockCode drop + <2 valid 테마 → single 강등 (D-06).
 * 반환: { themes(≥2 valid), demoted(강등된 single) }.
 */
export function demoteInvalidThemes(
  raw: RawTheme[],
  surgeCodes: Set<string>,
): { themes: RawTheme[]; demoted: RawSingle[] } {
  const themes: RawTheme[] = [];
  const demoted: RawSingle[] = [];
  for (const t of raw) {
    const valid = t.stockCodes.filter((c) => surgeCodes.has(c));
    // dedupe (Claude 중복 코드 방어).
    const uniq = [...new Set(valid)];
    if (uniq.length >= 2) {
      themes.push({ ...t, stockCodes: uniq });
    } else if (uniq.length === 1) {
      demoted.push({ stockCode: uniq[0], reason: t.reason, newsRefs: t.newsRefs });
    }
    // 0 valid → 통째 drop.
  }
  return { themes, demoted };
}

/** stockCodes.length desc → tie 시 member avg changeRate desc (D-05). in-place 아님. */
export function sortThemes(
  themes: RawTheme[],
  rateByCode: Map<string, number>,
): RawTheme[] {
  const avg = (codes: string[]): number => {
    if (codes.length === 0) return 0;
    let sum = 0;
    for (const c of codes) sum += rateByCode.get(c) ?? 0;
    return sum / codes.length;
  };
  return [...themes].sort((a, b) => {
    if (b.stockCodes.length !== a.stockCodes.length) {
      return b.stockCodes.length - a.stockCodes.length;
    }
    return avg(b.stockCodes) - avg(a.stockCodes);
  });
}

/** SDK 텍스트 → RawTheme/RawSingle (fence guard + 파싱 실패 시 빈 결과). */
function parseClusterResponse(text: string): {
  themes: RawTheme[];
  singles: RawSingle[];
} {
  const jsonStr = extractJsonObject(text);
  if (jsonStr === null) return { themes: [], singles: [] };
  let parsed: { themes?: unknown; singles?: unknown };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { themes: [], singles: [] };
  }
  const themes = Array.isArray(parsed.themes)
    ? (parsed.themes as unknown[]).map(normTheme).filter((t): t is RawTheme => t !== null)
    : [];
  const singles = Array.isArray(parsed.singles)
    ? (parsed.singles as unknown[]).map(normSingle).filter((s): s is RawSingle => s !== null)
    : [];
  return { themes, singles };
}

function toStrArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim())
    : [];
}
function toIntArray(v: unknown): number[] {
  return Array.isArray(v)
    ? v.filter((x): x is number => typeof x === "number" && Number.isInteger(x))
    : [];
}
function toReason(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function normTheme(t: unknown): RawTheme | null {
  const o = t as { name?: unknown; reason?: unknown; stockCodes?: unknown; newsRefs?: unknown };
  const name = typeof o?.name === "string" ? o.name.trim() : "";
  if (!name) return null;
  return {
    name,
    reason: toReason(o?.reason),
    stockCodes: toStrArray(o?.stockCodes),
    newsRefs: toIntArray(o?.newsRefs),
  };
}
function normSingle(s: unknown): RawSingle | null {
  const o = s as { stockCode?: unknown; reason?: unknown; newsRefs?: unknown };
  const code = typeof o?.stockCode === "string" ? o.stockCode.trim() : "";
  if (!code) return null;
  return { stockCode: code, reason: toReason(o?.reason), newsRefs: toIntArray(o?.newsRefs) };
}

export async function clusterSurges(
  surges: Surge[],
  cfg: HomeSyncConfig,
): Promise<ClusterResult> {
  // short-circuit — 급등 없으면 Claude 호출 0.
  if (surges.length === 0) return { themes: [], singles: [] };

  const surgeByCode = new Map(surges.map((s) => [s.code, s]));
  const surgeCodes = new Set(surges.map((s) => s.code));
  const rateByCode = new Map(surges.map((s) => [s.code, s.changeRate]));

  const { message, indexedNews } = formatClusterMessage(surges);

  let raw: { themes: RawTheme[]; singles: RawSingle[] };
  try {
    const client = getAnthropicClient();
    const res = await client.messages.create({
      model: cfg.classifyModel,
      max_tokens: CLUSTER_MAX_TOKENS,
      temperature: 0,
      system: CLUSTER_SYSTEM_PROMPT,
      messages: [
        ...buildClusterFewShot(),
        { role: "user", content: message },
      ],
    });
    const first = res.content.find((c) => c.type === "text");
    const text = first && first.type === "text" ? first.text.trim() : "";
    raw = parseClusterResponse(text);
  } catch {
    // fail-safe — Claude 예외/네트워크 실패는 빈 payload (cycle 은 계속 append, T-13-08 accept).
    return { themes: [], singles: [] };
  }

  // D-06 — 급등 집합 밖 code drop + <2 valid 테마 → single 강등.
  const { themes: validRaw, demoted } = demoteInvalidThemes(raw.themes, surgeCodes);

  // D-05 — breadth 정렬.
  const sortedRaw = sortThemes(validRaw, rateByCode);

  // RawTheme → HomeSurgeTheme (stocks 해석 + newsRefs verbatim).
  const themes: HomeSurgeTheme[] = sortedRaw.map((t) => ({
    name: t.name,
    reason: t.reason,
    stocks: t.stockCodes.map((c) => {
      const s = surgeByCode.get(c)!;
      return { code: s.code, name: s.name, changeRate: s.changeRate };
    }),
    news: resolveNewsRefs(indexedNews, t.newsRefs),
  }));

  // singles = Claude singles + 강등 테마, 급등 집합 내 code 만, changeRate desc.
  const singleRaws: RawSingle[] = [
    ...raw.singles.filter((s) => surgeCodes.has(s.stockCode)),
    ...demoted,
  ];
  // dedupe by code (강등과 Claude single 중복 방어) — 첫 등장 우선.
  const seen = new Set<string>();
  const singles: HomeSurgeSingle[] = [];
  for (const s of singleRaws) {
    if (seen.has(s.stockCode)) continue;
    seen.add(s.stockCode);
    const surge = surgeByCode.get(s.stockCode)!;
    singles.push({
      code: surge.code,
      name: surge.name,
      changeRate: surge.changeRate,
      reason: s.reason,
      news: resolveNewsRefs(indexedNews, s.newsRefs),
    });
  }
  singles.sort((a, b) => b.changeRate - a.changeRate);

  return { themes, singles };
}
