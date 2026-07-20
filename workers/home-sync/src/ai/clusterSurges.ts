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
import { logger } from "../logger";
import {
  CLUSTER_SYSTEM_PROMPT,
  buildClusterFewShot,
  formatClusterMessage,
} from "./prompt";
import type { Surge } from "../pipeline/loadSurges";
import type { HomeSyncConfig } from "../config";
import { isRoundupNews } from "./roundup";

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

// 8192 — threshold 15%(급등 ~70종목+)에서 출력 JSON(테마 + 종목별 한국어 reason)이 2048 을
// 초과해 응답이 잘리고(stop_reason=max_tokens) 파싱 실패 → 빈 payload 로 저장되는 사고가
// 있었다(2026-07-02). max_tokens 는 상한일 뿐 정상 응답 비용은 동일.
const CLUSTER_MAX_TOKENS = 8192;

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

/** dedup 후 최대 저장 뉴스 수 (rule 5 최소저장 — 상한이 필요할 때 cap). */
const MAX_NEWS_PER_GROUP = 20;

/** 테마 뉴스 보강 후 상한 — Claude 선정 refs + 멤버 종목 뉴스 병합의 cap. */
const THEME_NEWS_MAX = 12;

/**
 * URL 기준 뉴스 dedup (IN-01) — 첫 등장 유지, 순서 안정, 최대 max cap.
 *
 * 멤버 종목별 newsRefs 를 합칠 때 같은 라운드업 기사(동일 URL)가 여러 번 들어와
 * 저장 blob 이 부풀고(예: 39건 중 unique 13건) 프론트가 중복 노출한다. URL 을
 * canonical key 로 첫 등장만 남긴다 (5원칙 #5 출처표기 = URL verbatim 유지).
 */
export function dedupeNewsByUrl(
  refs: HomeNewsRef[],
  max: number = MAX_NEWS_PER_GROUP,
): HomeNewsRef[] {
  const seen = new Set<string>();
  const out: HomeNewsRef[] = [];
  for (const ref of refs) {
    if (seen.has(ref.url)) continue;
    seen.add(ref.url);
    out.push(ref);
    if (out.length >= max) break;
  }
  return out;
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

/**
 * 고아 종목 테마 병합 (금호건설 fix) — 강등/직접 single 중, 어떤 테마의 news 제목 또는
 * reason 텍스트에 그 종목명이 verbatim 부분문자열로 등장하면 그 테마로 재귀속한다.
 *
 * 근거 신호: 상한가 라운드업 기사가 같이 오른 종목명을 나열하므로, "테마 news/reason 에
 * 종목명이 등장" = 같은 급등 클러스터 소속의 정밀 신호. Claude 가 서사 차이로 1종목
 * 버킷에 떨궈 강등된 종목을 인접 테마로 되살린다.
 *
 * 병합 규칙:
 *   - 후보 테마 = news 제목 또는 reason 에 종목명(정확 부분문자열) 포함하는 테마.
 *   - 후보 다수: single.reason 과 각 테마(reason+name) 사이 의미 토큰 겹침 수 max 인 테마 선택.
 *     겹침 0 동률(다수)이면 애매 → 병합하지 않고 single 유지 (오병합 방지).
 *   - 후보 유일: 종목명이 그 테마에 등장하면 겹침 0 이어도 병합 (정밀 신호).
 *   - 후보 없음: single 유지.
 *
 * 병합 시 종목 code 를 테마 stockCodes 에 append (정렬은 이후 로직/프론트가 처리).
 */

/** 의미 토큰에서 제외할 범용어 (stoplist). */
const TOKEN_STOPLIST = new Set([
  "기대감",
  "기대",
  "관련",
  "수혜",
  "급등",
  "상한가",
  "종목",
  "오늘",
  "강세",
  "부각",
  "편승",
  "동반",
]);

/** 텍스트 → 2자 이상 한글/영숫자 어절 토큰 (stoplist 제외). */
function semanticTokens(text: string): Set<string> {
  const out = new Set<string>();
  const words = text.split(/[^0-9A-Za-z가-힣]+/);
  for (const w of words) {
    if (w.length < 2) continue;
    if (TOKEN_STOPLIST.has(w)) continue;
    out.add(w);
  }
  return out;
}

/** a/b 토큰 집합의 겹침 수. */
function tokenOverlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

/** reassignOrphans 가 다루는 테마 형태 (news/reason resolved). */
export interface ResolvedTheme {
  name: string;
  reason: string | null;
  stockCodes: string[];
  news: HomeNewsRef[];
}

export function reassignOrphans(
  themes: ResolvedTheme[],
  singles: RawSingle[],
  surgeByCode: Map<string, { name: string; changeRate: number }>,
): { themes: ResolvedTheme[]; singles: RawSingle[] } {
  // 테마를 복제(stockCodes append 대비) — 순수함수 계약 유지.
  const outThemes: ResolvedTheme[] = themes.map((t) => ({
    ...t,
    stockCodes: [...t.stockCodes],
  }));
  const remainingSingles: RawSingle[] = [];

  // 급등 종목명 집합 — 라운드업 판정용 (quick-260720-jh7). surgeByCode 에 이미 모든 급등
  // 종목명이 있으므로 시그니처 변경 없이 1회 계산.
  const surgeNames = [...surgeByCode.values()].map((v) => v.name);

  for (const single of singles) {
    const surge = surgeByCode.get(single.stockCode);
    // 급등 집합 밖 (방어) → 그대로 (이후 로직이 drop).
    if (!surge) {
      remainingSingles.push(single);
      continue;
    }
    const name = surge.name;

    // 1) 종목명이 news 제목 또는 reason 에 등장하는 후보 테마 수집.
    //    라운드업 기사(급등 종목명 3+ 나열)는 news 제목 매칭 신호에서 제외한다
    //    (quick-260720-jh7) — 라운드업이 같이 오른 종목명을 나열하는 것을 정밀 병합
    //    신호로 오해해 무관 종목(고려산업류)을 흡수하는 오염을 방지. reason 매칭은 유지.
    const candidates = outThemes.filter((t) => {
      const inReason = t.reason ? t.reason.includes(name) : false;
      const inNews = t.news.some(
        (n) => !isRoundupNews(n, surgeNames) && n.title.includes(name),
      );
      return inReason || inNews;
    });

    if (candidates.length === 0) {
      remainingSingles.push(single);
      continue;
    }

    if (candidates.length === 1) {
      // 유일 후보 — 정밀 신호, 겹침 0 이어도 병합.
      if (!candidates[0].stockCodes.includes(single.stockCode)) {
        candidates[0].stockCodes.push(single.stockCode);
      }
      continue;
    }

    // 2) 다중 후보 — reason 토큰 겹침 max 테마 선택.
    const singleTokens = semanticTokens(single.reason ?? "");
    let best: ResolvedTheme | null = null;
    let bestScore = -1;
    let tie = false;
    for (const t of candidates) {
      const themeTokens = semanticTokens(`${t.reason ?? ""} ${t.name}`);
      const score = tokenOverlap(singleTokens, themeTokens);
      if (score > bestScore) {
        bestScore = score;
        best = t;
        tie = false;
      } else if (score === bestScore) {
        tie = true;
      }
    }

    // 겹침 0 동률(다수) → 애매 → single 유지 (오병합 방지).
    if (best === null || (bestScore === 0 && tie)) {
      remainingSingles.push(single);
      continue;
    }

    if (!best.stockCodes.includes(single.stockCode)) {
      best.stockCodes.push(single.stockCode);
    }
  }

  return { themes: outThemes, singles: remainingSingles };
}

/** stockCodes.length desc → tie 시 member avg changeRate desc (D-05). in-place 아님. */
export function sortThemes<T extends { stockCodes: string[] }>(
  themes: T[],
  rateByCode: Map<string, number>,
): T[] {
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

/**
 * 중복 소속 invariant (quick-260720-kyh) — 순수 후처리. clusterSurges 최종 themes/singles 에 적용.
 *
 * (a) 테마간 중복: 2+ 테마에 있는 code 는 근거 뉴스(비라운드업 뉴스 제목에 종목명 verbatim)가
 *     있는 테마만 판정 —
 *       · evidenceThemes ≥ 2 → 그 evidence 테마들에만 유지(복수 허용, 사용자 결정), 나머지 제거.
 *       · evidenceThemes ≤ 1 → 1개로 축소. 우선순위: evidence > stocks.length 큰 > 먼저 나온 테마.
 * (b) invariant 후 stocks.length < 2 로 줄어든 테마 제거 + 그 멤버 중 살아있는 테마에 없는 code 는
 *     single 로 강등(surgeByCode 로 재구성, reason=null, news=[]).
 * (c) 살아있는 테마 멤버 집합에 있는 code 는 singles 에서 제거(테마+single 동시 방지).
 *
 * 순수 반환 — 입력 배열/원소 원본 미변경(명시 복제).
 */
export function enforceMembershipInvariant(
  themes: HomeSurgeTheme[],
  singles: HomeSurgeSingle[],
  surgeNames: string[],
  surgeByCode: ReadonlyMap<string, { name: string; changeRate: number }>,
): { themes: HomeSurgeTheme[]; singles: HomeSurgeSingle[] } {
  // themes 복제 (stocks 배열도 복제 — 순수 계약. news/reason 은 불변 참조 유지).
  const work: HomeSurgeTheme[] = themes.map((t) => ({
    ...t,
    stocks: [...t.stocks],
  }));

  const hasEvidence = (theme: HomeSurgeTheme, stockName: string): boolean =>
    stockName.length > 0 &&
    theme.news.some(
      (n) => !isRoundupNews(n, surgeNames) && n.title.includes(stockName),
    );

  // (a) 테마간 중복 해소.
  const codeToThemeIdx = new Map<string, number[]>();
  work.forEach((t, i) => {
    for (const s of t.stocks) {
      const arr = codeToThemeIdx.get(s.code) ?? [];
      arr.push(i);
      codeToThemeIdx.set(s.code, arr);
    }
  });

  for (const [code, idxs] of codeToThemeIdx) {
    if (idxs.length < 2) continue;
    const stockName = surgeByCode.get(code)?.name ?? "";
    const evidenceIdxs = idxs.filter((i) => hasEvidence(work[i], stockName));
    let keep: Set<number>;
    if (evidenceIdxs.length >= 2) {
      keep = new Set(evidenceIdxs); // 복수 허용.
    } else {
      // 1개로 축소 — evidence > stocks.length > earlier.
      const winner = [...idxs].sort((a, b) => {
        const ea = hasEvidence(work[a], stockName) ? 1 : 0;
        const eb = hasEvidence(work[b], stockName) ? 1 : 0;
        if (ea !== eb) return eb - ea;
        if (work[b].stocks.length !== work[a].stocks.length) {
          return work[b].stocks.length - work[a].stocks.length;
        }
        return a - b;
      })[0];
      keep = new Set([winner]);
    }
    for (const i of idxs) {
      if (keep.has(i)) continue;
      work[i].stocks = work[i].stocks.filter((s) => s.code !== code);
    }
  }

  // (b) sub-2 테마 제거 + 고아 멤버 single 강등.
  const survivingThemes = work.filter((t) => t.stocks.length >= 2);
  const survivingCodes = new Set<string>();
  for (const t of survivingThemes) for (const s of t.stocks) survivingCodes.add(s.code);

  const demoted: HomeSurgeSingle[] = [];
  const demotedSeen = new Set<string>();
  for (const t of work) {
    if (t.stocks.length >= 2) continue; // 살아있는 테마.
    for (const s of t.stocks) {
      if (survivingCodes.has(s.code)) continue; // 다른 테마에 살아있음.
      if (demotedSeen.has(s.code)) continue;
      const surge = surgeByCode.get(s.code);
      if (!surge) continue; // 급등 집합 밖 (방어).
      demotedSeen.add(s.code);
      demoted.push({
        code: s.code,
        name: surge.name,
        changeRate: surge.changeRate,
        reason: null,
        news: [],
      });
    }
  }

  // (c) 테마+single 동시 제거 + 강등 single 병합(기존 single dedup, 기존 우선).
  const outSingles: HomeSurgeSingle[] = [];
  const singleSeen = new Set<string>();
  for (const s of singles) {
    if (survivingCodes.has(s.code)) continue; // 테마 소속 → single 제거.
    if (singleSeen.has(s.code)) continue;
    singleSeen.add(s.code);
    outSingles.push(s);
  }
  for (const d of demoted) {
    if (singleSeen.has(d.code)) continue;
    singleSeen.add(d.code);
    outSingles.push(d);
  }

  return { themes: survivingThemes, singles: outSingles };
}

export async function clusterSurges(
  surges: Surge[],
  cfg: HomeSyncConfig,
  themeHints: Map<string, string[]> = new Map(),
  prevThemes: HomeSurgeTheme[] = [],
): Promise<ClusterResult> {
  // short-circuit — 급등 없으면 Claude 호출 0.
  if (surges.length === 0) return { themes: [], singles: [] };

  const surgeByCode = new Map(surges.map((s) => [s.code, s]));
  const surgeCodes = new Set(surges.map((s) => s.code));
  const rateByCode = new Map(surges.map((s) => [s.code, s.changeRate]));

  // themeHints (quick-260720-in0) — 급등 2+ 공유 네이버 테마를 "참고 테마 분류" 섹션으로
  // 프롬프트에 전달. 뉴스 공백 시 동반 급등 묶기 힌트로만 사용(anti-hallucination 유지).
  // prevThemes (quick-260720-kyh) — 직전 슬롯 테마 구성을 "직전 테마 구성" 섹션으로 전달(sticky prior).
  const { message, indexedNews } = formatClusterMessage(
    surges,
    themeHints,
    prevThemes,
  );

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
    // 조용한 실패 금지 — 잘림(max_tokens)/파싱 실패는 빈 스냅샷 사고로 직결되므로 반드시 로깅.
    if (res.stop_reason !== "end_turn") {
      logger.warn(
        {
          stopReason: res.stop_reason,
          outputTokens: res.usage?.output_tokens,
          maxTokens: CLUSTER_MAX_TOKENS,
          surgeCount: surges.length,
        },
        "clusterSurges — 응답이 정상 종료되지 않음 (잘림 가능, 파싱 실패 시 빈 payload)",
      );
    }
    raw = parseClusterResponse(text);
    if (raw.themes.length === 0 && raw.singles.length === 0 && surges.length > 0) {
      logger.warn(
        { surgeCount: surges.length, textLen: text.length, stopReason: res.stop_reason },
        "clusterSurges — 파싱 결과 빈 themes/singles (JSON 잘림/형식 오류 의심)",
      );
    }
  } catch (err) {
    // fail-safe — Claude 예외/네트워크 실패는 빈 payload (cycle 은 계속 append, T-13-08 accept).
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), surgeCount: surges.length },
      "clusterSurges — Claude 호출 실패 (빈 payload 로 계속)",
    );
    return { themes: [], singles: [] };
  }

  // D-06 — 급등 집합 밖 code drop + <2 valid 테마 → single 강등.
  const { themes: validRaw, demoted } = demoteInvalidThemes(raw.themes, surgeCodes);

  // newsRefs → verbatim 뉴스 해석 (reassignOrphans 가 news 제목으로 종목명 매칭하므로 먼저 resolve).
  const resolvedThemes: ResolvedTheme[] = validRaw.map((t) => ({
    name: t.name,
    reason: t.reason,
    stockCodes: t.stockCodes,
    news: resolveNewsRefs(indexedNews, t.newsRefs),
  }));

  // 고아 종목 병합 — 강등 + Claude 직접 single 을 테마 news/reason 종목명 등장 신호로 재귀속.
  //   순서: demote → reassignOrphans → sortThemes → build (병합으로 breadth 가 바뀌므로 sort 이전).
  const orphanCandidates: RawSingle[] = [
    ...raw.singles.filter((s) => surgeCodes.has(s.stockCode)),
    ...demoted,
  ];
  const { themes: mergedThemes, singles: leftoverSingles } = reassignOrphans(
    resolvedThemes,
    orphanCandidates,
    surgeByCode,
  );

  // D-05 — breadth 정렬 (병합 후 stockCodes 기준).
  const sortedThemes = sortThemes(mergedThemes, rateByCode);

  // ResolvedTheme → HomeSurgeTheme (stocks 해석).
  const themes: HomeSurgeTheme[] = sortedThemes.map((t) => {
    // 근거 뉴스 보강 — Claude 선정 refs(정확도 우선, 앞 순서 유지) 뒤에 멤버 종목의
    // 이미 로드된 뉴스(loadSurges top-K, verbatim)를 붙여 dedup. 추가 API 호출 0.
    // Claude 가 라운드업 기사 위주로 적게 고르면 dedup 후 3~4건에 그치던 것을 보강.
    const memberNews: HomeNewsRef[] = t.stockCodes.flatMap((c) =>
      (surgeByCode.get(c)?.news ?? []).map((n) => ({
        title: n.title,
        url: n.url,
        source: n.source ?? "",
      })),
    );
    return {
      name: t.name,
      reason: t.reason,
      stocks: t.stockCodes.map((c) => {
        const s = surgeByCode.get(c)!;
        return { code: s.code, name: s.name, changeRate: s.changeRate };
      }),
      // IN-01 dedup + THEME_NEWS_MAX cap (rule 5 최소저장).
      news: dedupeNewsByUrl([...t.news, ...memberNews], THEME_NEWS_MAX),
    };
  });

  // singles = reassign 후 남은 후보 (병합되지 않은 순수 single), 급등 집합 내 code 만, changeRate desc.
  const singleRaws: RawSingle[] = leftoverSingles;
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
      news: dedupeNewsByUrl(resolveNewsRefs(indexedNews, s.newsRefs)),
    });
  }
  singles.sort((a, b) => b.changeRate - a.changeRate);

  // 중복 소속 invariant (quick-260720-kyh) — 테마간 중복 정리 + 테마+single 동시 제거 +
  // sub-2 테마 강등. 순수 후처리. 강등 single 이 추가될 수 있으므로 재정렬.
  const inv = enforceMembershipInvariant(
    themes,
    singles,
    surges.map((s) => s.name),
    surgeByCode,
  );
  inv.singles.sort((a, b) => b.changeRate - a.changeRate);
  return inv;
}
