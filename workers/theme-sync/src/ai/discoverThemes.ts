import type { SupabaseClient } from "@supabase/supabase-js";
import type pino from "pino";
import pLimit from "p-limit";
import { getAnthropicClient } from "./anthropic";
import {
  DISCOVER_SYSTEM_PROMPT,
  formatDiscoverMessage,
  buildDiscoverFewShot,
} from "./prompt";
import { normalizeName } from "../merge/normalizeName";
import { extractJsonObject } from "./parseJson";
import type { ThemeSyncConfig } from "../config";

/**
 * Phase 10 Plan 06 — 최근 news_articles 기반 신규 시스템 테마 후보 발굴 (RESEARCH §Pattern 6 (a)).
 *
 * 안전/비용 설계:
 *  - classifyEnabled=false 면 즉시 빈 결과 (Claude 호출 0 — kill-switch, Pitfall 7).
 *  - 뉴스를 청크로 나눠 p-limit(classifyConcurrency) 배치 호출(토큰 제어). 각 청크는 단건 호출.
 *  - JSON 파싱 실패/SDK 예외는 try/catch 로 빈 결과(다음 cycle 재시도) — cycle 전체를 죽이지 않음.
 *  - 기존 시스템 테마(EXISTING) 와 norm_key 충돌하는 후보는 제외(중복 발굴 방지, persistAi 가 병합).
 *  - 발굴은 시스템 레이어(source='ai')로만 — 유저 테마 불가침은 persistAi 가 강제.
 */

/** 발굴된 신규 테마 후보 — persistAi 입력. */
export interface DiscoveredTheme {
  /** 정규화 전 테마명. */
  name: string;
  /** 병합 키 (normalizeName(name)). */
  normKey: string;
  /** 관련 종목 code (6자리, AI 추정 — stocks 마스터 존재 여부는 persistAi 가 검증). */
  stockCodes: string[];
  /** 0~1 신뢰도. */
  confidence: number;
}

/** 한 청크에 담는 뉴스 제목 수 (토큰 제어). */
const NEWS_CHUNK = 60;
/** 발굴 응답 max_tokens (JSON 후보 목록). */
const DISCOVER_MAX_TOKENS = 1024;
/** 6자리 단축코드 정규식 (stocks.code 호환). */
const CODE_RE = /^[A-Za-z0-9]{6}$/;

interface RawCandidate {
  name?: unknown;
  stockCodes?: unknown;
  confidence?: unknown;
}

/** SDK 텍스트 응답 → DiscoveredTheme[] (파싱 실패 시 빈 배열). */
function parseDiscoverResponse(text: string): DiscoveredTheme[] {
  let parsed: { themes?: unknown };
  const jsonStr = extractJsonObject(text);
  if (jsonStr === null) return [];
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return [];
  }
  const themes = (parsed as { themes?: unknown }).themes;
  if (!Array.isArray(themes)) return [];

  const out: DiscoveredTheme[] = [];
  for (const t of themes as RawCandidate[]) {
    const name = typeof t?.name === "string" ? t.name.trim() : "";
    if (!name) continue;
    const normKey = normalizeName(name);
    if (!normKey) continue;
    const codes = Array.isArray(t?.stockCodes)
      ? (t.stockCodes as unknown[])
          .filter((c): c is string => typeof c === "string")
          .map((c) => c.trim())
          .filter((c) => CODE_RE.test(c))
      : [];
    const confidence =
      typeof t?.confidence === "number" && Number.isFinite(t.confidence)
        ? Math.min(1, Math.max(0, t.confidence))
        : 0.5;
    out.push({ name, normKey, stockCodes: [...new Set(codes)], confidence });
  }
  return out;
}

/** substring 병합 시 포함되는(짧은) norm_key 최소 길이 — "ai"(2자) 류 짧은 토큰 오병합 방지. */
const MIN_CONTAINED_KEY_LEN = 4;

/**
 * 보수적 cross-chunk near-duplicate 병합 (Plan 06 POC 발견 대응).
 *
 * 배경: 5개 뉴스 청크가 각각 독립적으로 같은 테마를 "조금씩 다른 이름" 으로 재발굴 →
 *   norm_key 완전일치 dedupe 만으로는 안 잡힌다(예: "피지컬AI" vs "피지컬AI로봇" ×5,
 *   "단일종목레버리지ETF" vs "단일종목레버리지etf과열" ×4). 실측 36 후보 중 ~55% 가
 *   이런 cross-chunk 변형 중복이었다.
 *
 * 휴리스틱 — 후보 B 를 A 로 병합하는 조건은 EITHER (증거 기반, 문자열 유사도 금지):
 *   (a) 종목코드를 2개 이상 공유 (≥2) — 같은 종목 묶음이면 사실상 같은 테마.
 *   (b) 한 norm_key 가 다른 norm_key 를 substring 으로 완전 포함 + 포함되는(짧은) 쪽
 *       길이 ≥ MIN_CONTAINED_KEY_LEN — "ai"(2자) 같은 짧은 토큰이 모든 후보에 매칭되는
 *       오병합을 차단. 'AI기판부품' ⊃ 'AI기판' 류 변형명만 안전하게 병합.
 *
 * 보수성(normalizeName 의 "유사도 자동병합 금지" 원칙 승계):
 *   - edit-distance / Jaccard / 부분 토큰 일치는 쓰지 않는다. 불확실하면 둘 다 KEEP.
 *     (남은 중복은 허용, 잘못된 병합은 불가 — 시스템 레이어 read-only 라 fork-후-수정 불가.)
 *   - 병합 시 더 일반적인(norm_key 가 짧은) 이름을 canonical 로, 동률이면 confidence 높은 쪽.
 *     stockCodes 는 합집합, confidence 는 max.
 *
 * 입력은 이미 norm_key 완전일치로 1차 dedupe 된 후보 배열. O(n²) 이나 n 은 보통 수십.
 */
function collapseNearDuplicates(
  candidates: DiscoveredTheme[],
): DiscoveredTheme[] {
  const kept: DiscoveredTheme[] = [];
  for (const cand of candidates) {
    const target = kept.find((k) => shouldMerge(k, cand));
    if (!target) {
      kept.push({ ...cand, stockCodes: [...cand.stockCodes] });
      continue;
    }
    mergeInto(target, cand);
  }
  return kept;
}

/** 두 후보가 같은 테마인지 — 증거 기반(공유종목 ≥2 OR norm_key 포함관계). */
function shouldMerge(a: DiscoveredTheme, b: DiscoveredTheme): boolean {
  // (a) 종목코드 2개 이상 공유.
  const aCodes = new Set(a.stockCodes);
  let shared = 0;
  for (const c of b.stockCodes) {
    if (aCodes.has(c)) {
      shared++;
      if (shared >= 2) return true;
    }
  }
  // (b) norm_key 포함관계 + 짧은 쪽 길이 가드.
  const [shortKey, longKey] =
    a.normKey.length <= b.normKey.length
      ? [a.normKey, b.normKey]
      : [b.normKey, a.normKey];
  if (
    shortKey.length >= MIN_CONTAINED_KEY_LEN &&
    shortKey !== longKey &&
    longKey.includes(shortKey)
  ) {
    return true;
  }
  return false;
}

/**
 * b 를 target 으로 병합 — canonical(더 일반적=norm_key 짧은, 동률이면 confidence 높은) 이름 유지,
 * stockCodes 합집합, confidence max. target 을 in-place 갱신.
 */
function mergeInto(target: DiscoveredTheme, b: DiscoveredTheme): void {
  const bIsMoreGeneral =
    b.normKey.length < target.normKey.length ||
    (b.normKey.length === target.normKey.length &&
      b.confidence > target.confidence);
  if (bIsMoreGeneral) {
    target.name = b.name;
    target.normKey = b.normKey;
  }
  target.stockCodes = [...new Set([...target.stockCodes, ...b.stockCodes])];
  target.confidence = Math.max(target.confidence, b.confidence);
}

/** 단일 뉴스 청크 → Claude 1회 호출 → 후보 (실패 시 빈 배열). */
async function discoverChunk(
  cfg: ThemeSyncConfig,
  existingThemeNames: string[],
  chunk: Array<{ title: string; description: string | null }>,
): Promise<DiscoveredTheme[]> {
  try {
    const client = getAnthropicClient();
    const res = await client.messages.create({
      model: cfg.classifyModel,
      max_tokens: DISCOVER_MAX_TOKENS,
      temperature: 0,
      system: DISCOVER_SYSTEM_PROMPT,
      messages: [
        ...buildDiscoverFewShot(),
        {
          role: "user",
          content: formatDiscoverMessage(existingThemeNames, chunk),
        },
      ],
    });
    const first = res.content.find((c) => c.type === "text");
    const text = first && first.type === "text" ? first.text.trim() : "";
    return parseDiscoverResponse(text);
  } catch {
    // SDK 예외/네트워크 실패 — 빈 결과로 격리(다음 cycle 재시도).
    return [];
  }
}

/**
 * 최근 N일 news_articles(title+description) 를 읽어 Claude 로 신규 테마 후보 발굴.
 * 기존 시스템 테마 norm_key 와 충돌하는 후보는 제외(중복 방지) 후 반환.
 */
export async function discoverThemes(
  supabase: SupabaseClient,
  cfg: ThemeSyncConfig,
  log: pino.Logger,
  now: Date = new Date(),
): Promise<DiscoveredTheme[]> {
  // kill-switch — classify 비활성 시 Claude 호출 0.
  if (!cfg.classifyEnabled) {
    log.info("classify disabled — skip theme discovery (Claude 호출 0)");
    return [];
  }

  // 1) 최근 N일 뉴스 (published_at 기준).
  const sinceIso = new Date(
    now.getTime() - cfg.discoverNewsLookbackDays * 24 * 3600_000,
  ).toISOString();
  const { data: news, error: newsErr } = await supabase
    .from("news_articles")
    .select("title, description")
    .gte("published_at", sinceIso)
    .order("published_at", { ascending: false })
    .limit(cfg.discoverNewsMax);
  if (newsErr) {
    log.error({ err: newsErr.message }, "discoverThemes: news fetch failed");
    return [];
  }
  const newsRows = (news ?? []) as Array<{
    title: string;
    description: string | null;
  }>;
  if (newsRows.length === 0) {
    log.info("discoverThemes: no recent news — skip");
    return [];
  }

  // 2) 기존 시스템 테마명(중복 발굴 방지용 EXISTING + norm_key 충돌 필터).
  //    .limit() 로 종결 — .eq() 는 체이닝(필터)만, 종결은 .limit()(mock/PostgREST 일관).
  const { data: existing, error: exErr } = await supabase
    .from("themes")
    .select("name, norm_key")
    .eq("is_system", true)
    .limit(cfg.discoverExistingThemesMax);
  if (exErr) {
    log.error({ err: exErr.message }, "discoverThemes: themes fetch failed");
    return [];
  }
  const existingRows = (existing ?? []) as Array<{
    name: string;
    norm_key: string | null;
  }>;
  const existingNames = existingRows.map((r) => r.name);
  const existingNormKeys = new Set(
    existingRows
      .map((r) => r.norm_key)
      .filter((k): k is string => typeof k === "string" && k.length > 0),
  );

  // 3) 뉴스 청크 → p-limit 배치 호출.
  const chunks: Array<Array<{ title: string; description: string | null }>> = [];
  for (let i = 0; i < newsRows.length; i += NEWS_CHUNK) {
    chunks.push(newsRows.slice(i, i + NEWS_CHUNK));
  }
  const limit = pLimit(cfg.classifyConcurrency);
  const settled = await Promise.allSettled(
    chunks.map((c) => limit(() => discoverChunk(cfg, existingNames, c))),
  );

  // 4) 청크 결과 병합 + 기존 norm_key 충돌 제외 + 후보 내 norm_key dedupe.
  const byKey = new Map<string, DiscoveredTheme>();
  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    for (const cand of s.value) {
      if (existingNormKeys.has(cand.normKey)) continue; // 중복 발굴 방지.
      const prev = byKey.get(cand.normKey);
      if (!prev) {
        byKey.set(cand.normKey, cand);
      } else {
        // 동일 후보 — 종목코드 합집합 + 높은 confidence 유지.
        prev.stockCodes = [
          ...new Set([...prev.stockCodes, ...cand.stockCodes]),
        ];
        prev.confidence = Math.max(prev.confidence, cand.confidence);
      }
    }
  }

  // 5) cross-chunk near-duplicate 보수적 병합 (POC: 청크별 같은 테마 변형명 재발굴 ~55%).
  //    norm_key 완전일치(4번)로는 안 잡히는 변형명을 증거(공유종목≥2 OR 포함관계)로만 병합.
  const exactDeduped = [...byKey.values()];
  const discovered = collapseNearDuplicates(exactDeduped);
  log.info(
    {
      newsCount: newsRows.length,
      rawCandidates: exactDeduped.length,
      discovered: discovered.length,
    },
    "discoverThemes done",
  );
  return discovered;
}
