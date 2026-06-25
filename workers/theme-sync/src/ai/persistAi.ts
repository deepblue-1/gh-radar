import type { SupabaseClient } from "@supabase/supabase-js";
import type pino from "pino";
import type { DiscoveredTheme } from "./discoverThemes";
import type { CorrectionTarget } from "./correctMembership";
import { isThemeEligible } from "../pipeline/upsertThemes";

/**
 * Phase 10 Plan 06 — AI 발굴/교정 결과를 시스템 레이어에 적재 (RESEARCH §Pattern 6, T-10-06-01/02).
 *
 * 불가침 규칙(가장 중요 — 위반 시 데이터 손상):
 *  1. persistAi 는 source='ai' + is_system=true 만 쓴다. 유저 테마(is_system=false)는 절대 미접근.
 *     → findAiThemeId/insert 모두 is_system=true 한정. 유저 테마는 코드 경로상 도달 불가.
 *  2. 교정은 effective_to soft-제외만. naver/alphasquare/user row 를 물리 삭제(DELETE)하지 않는다.
 *     → UPDATE { effective_to } 만 사용, .delete() 호출 없음(원 source 데이터 보존).
 *  3. 발굴 종목은 stocks 마스터 존재 확인(FK, Pitfall 5) — 미존재 code per-stock skip.
 *  4. 발굴 테마는 norm_key 충돌 시 기존 시스템 테마에 병합(sources 에 'ai' append, 중복 발굴 방지).
 */

const STOCK_IN_CHUNK = 200; // .in() URL 길이 한계 (커밋 37afcde 회귀 교훈).

/**
 * AI 단독 테마가 존재/생성되기 위한 최소 active 종목 수.
 * AI 발굴은 회사명을 stocks 마스터로 해석하는데, 상장 매칭이 안 되는 추상 개념
 * (예: 'AI 데이터센터 지역 유치')은 0~1종목으로 노이즈가 된다. '테마=종목 묶음' 불변식 —
 * 생성 시 가드(persistDiscoveries) + 기존/이탈분 정리(pruneSparseAiThemes) 양쪽 적용.
 */
const MIN_AI_THEME_STOCKS = 2;

/**
 * AI 발굴 후보를 기존 시스템 테마에 "같은 테마" 로 흡수하기 위한 최소 공유 active 종목 수.
 * norm_key 완전일치(findAiThemeId)로는 'AI반도체' vs '인공지능 반도체' 류 변형명을 못 잡아
 * 같은 종목 묶음인데도 중복 테마가 생긴다(사용자 보고). discoverThemes 의 collapseNearDuplicates
 * 가 이미 쓰는 "공유 종목 ≥2 = 같은 테마" 휴리스틱을 후보↔기존 테마 경계에도 적용 —
 * 우연 동반상장(1개 공유)은 흡수하지 않는 보수적 임계(과병합 금지, 잘못된 흡수는 불가역).
 */
const MERGE_MIN_SHARED_STOCKS = 2;

export interface PersistAiResult {
  /** 적재(신규 INSERT + 기존 병합 UPDATE)된 AI 테마 수. */
  aiThemesUpserted: number;
  /** 적재된 AI theme_stocks 행 수. */
  aiStockLinksUpserted: number;
  /** stocks 마스터 미존재로 skip 한 종목 수. */
  skippedMissingStocks: number;
  /** effective_to soft-제외 마킹된 매핑 수. */
  corrected: number;
}

/**
 * 테마 편입 적격 code 만 통과 — 청크 분할 .in() 조회.
 * stocks 마스터에 존재하면서 일반 주식(스팩·ETP 아님, isThemeEligible)인 code 집합.
 * 스크랩 경로(upsertThemes)와 동일 필터로 AI 발굴 테마에도 스팩·ETP 유입을 막는다.
 */
async function filterExistingStocks(
  supabase: SupabaseClient,
  codes: string[],
  log: pino.Logger,
): Promise<Set<string>> {
  const unique = [...new Set(codes)];
  const exists = new Set<string>();
  for (let i = 0; i < unique.length; i += STOCK_IN_CHUNK) {
    const chunk = unique.slice(i, i + STOCK_IN_CHUNK);
    const { data, error } = await supabase
      .from("stocks")
      .select("code, name, security_group, kosdaq_segment")
      .in("code", chunk);
    if (error) {
      log.error({ err: error.message }, "persistAi: filterExistingStocks failed");
      throw error;
    }
    for (const r of (data ?? []) as Array<{
      code: string;
      name: string | null;
      security_group: string | null;
      kosdaq_segment: string | null;
    }>) {
      if (isThemeEligible(r)) exists.add(r.code);
    }
  }
  return exists;
}

/** norm_key 로 기존 **시스템** 테마 id + sources 조회 (없으면 null). 유저 테마는 조회 대상 아님. */
async function findAiThemeId(
  supabase: SupabaseClient,
  normKey: string,
  log: pino.Logger,
): Promise<{ id: string; sources: string[] } | null> {
  const { data, error } = await supabase
    .from("themes")
    .select("id, sources")
    .eq("norm_key", normKey)
    .eq("is_system", true) // ← 불가침 규칙 #1: 시스템 테마만.
    .maybeSingle();
  if (error) {
    log.error({ err: error.message, normKey }, "persistAi: findAiThemeId failed");
    throw error;
  }
  if (!data) return null;
  const row = data as { id: string; sources?: string[] | null };
  return { id: row.id, sources: row.sources ?? [] };
}

/** 시스템 테마 sources 에 'ai' 를 멱등 병합(이미 있으면 no-op). 유저 테마는 미접근(is_system 가드). */
async function mergeAiSource(
  supabase: SupabaseClient,
  themeId: string,
  currentSources: string[],
  log: pino.Logger,
  nowIso: string,
): Promise<void> {
  if (currentSources.includes("ai")) return; // 멱등.
  const { error } = await supabase
    .from("themes")
    .update({ sources: [...currentSources, "ai"], updated_at: nowIso })
    .eq("id", themeId)
    .eq("is_system", true); // ← 불가침 규칙 #1 재확인.
  if (error) {
    log.error({ err: error.message, themeId }, "persistAi: theme sources merge failed");
    throw error;
  }
}

/**
 * 후보 종목 code → 그 code 를 active 로 보유한 기존 **시스템** 테마 id 집합 + 테마별 sources.
 * persistDiscoveries 의 stock-overlap 흡수(2순위 매칭)용 인덱스. effective_to/ is_system 은 JS 필터
 * (loadMembershipForReview 선례 — PostgREST embedded 필터 대신 일관). 유저 테마는 제외.
 */
async function loadSystemThemeMembership(
  supabase: SupabaseClient,
  codes: string[],
  log: pino.Logger,
): Promise<{
  codeToThemes: Map<string, Set<string>>;
  themeSources: Map<string, string[]>;
}> {
  const codeToThemes = new Map<string, Set<string>>();
  const themeSources = new Map<string, string[]>();
  const unique = [...new Set(codes)];
  for (let i = 0; i < unique.length; i += STOCK_IN_CHUNK) {
    const chunk = unique.slice(i, i + STOCK_IN_CHUNK);
    const { data, error } = await supabase
      .from("theme_stocks")
      .select("theme_id, stock_code, effective_to, themes!inner(is_system, sources)")
      .in("stock_code", chunk)
      .eq("themes.is_system", true) // 시스템 테마만(유저 테마 row inflation·truncation 방지). JS 가드도 유지.
      .limit(PRUNE_READ_LIMIT);
    if (error) {
      log.error({ err: error.message }, "persistAi: loadSystemThemeMembership failed");
      throw error;
    }
    for (const r of (data ?? []) as Array<{
      theme_id: string;
      stock_code: string;
      effective_to: string | null;
      themes:
        | { is_system: boolean; sources: string[] | null }
        | { is_system: boolean; sources: string[] | null }[]
        | null;
    }>) {
      if (r.effective_to !== null) continue; // active(현재 편입)만.
      // PostgREST inner join 은 1:1 이면 object, 배열로 올 수도 있어 방어(loadMembershipForReview 선례).
      const theme = Array.isArray(r.themes) ? r.themes[0] : r.themes;
      if (!theme || !theme.is_system) continue; // 시스템 테마만.
      let set = codeToThemes.get(r.stock_code);
      if (!set) {
        set = new Set<string>();
        codeToThemes.set(r.stock_code, set);
      }
      set.add(r.theme_id);
      if (!themeSources.has(r.theme_id)) {
        themeSources.set(r.theme_id, theme.sources ?? []);
      }
    }
  }
  return { codeToThemes, themeSources };
}

/**
 * validCodes 와 active 종목을 가장 많이 공유하는 시스템 테마 id 반환(공유 ≥ MERGE_MIN_SHARED_STOCKS).
 * 동률은 theme_id 사전순 최소(결정론적 tie-break). 임계 미만이면 null(흡수 안 함 → 신규 생성 경로).
 */
function pickOverlapTheme(
  validCodes: string[],
  codeToThemes: Map<string, Set<string>>,
): string | null {
  const tally = new Map<string, number>();
  for (const c of validCodes) {
    const themes = codeToThemes.get(c);
    if (!themes) continue;
    for (const tid of themes) tally.set(tid, (tally.get(tid) ?? 0) + 1);
  }
  let bestId: string | null = null;
  let bestCount = MERGE_MIN_SHARED_STOCKS - 1; // 임계 이상 + 최다만 채택.
  for (const tid of [...tally.keys()].sort()) {
    const cnt = tally.get(tid) ?? 0;
    if (cnt > bestCount) {
      bestCount = cnt;
      bestId = tid;
    }
  }
  return bestId;
}

/**
 * 발굴 후보 적재 — themes(source='ai', is_system=true) + theme_stocks(source='ai') UPSERT.
 * 기존 시스템 테마 흡수(중복 발굴 방지) 2순위:
 *   1순위) norm_key 완전일치 → 그 테마에 병합.
 *   2순위) norm_key 불일치 시 active 종목 ≥2 공유하는 시스템 테마 → 그 테마에 흡수(변형명 중복 방지).
 *   둘 다 없을 때만 신규 AI 테마 생성(≥2 유효종목 가드).
 * theme_stocks 는 ignoreDuplicates — 흡수 시 기존 naver/alpha 종목 행의 source 라벨을 덮지 않고
 * 누락 종목만 'ai' 로 추가(상호 보강).
 */
export async function persistDiscoveries(
  supabase: SupabaseClient,
  discovered: DiscoveredTheme[],
  log: pino.Logger,
  now: Date = new Date(),
): Promise<{
  aiThemesUpserted: number;
  aiStockLinksUpserted: number;
  skippedMissingStocks: number;
}> {
  if (discovered.length === 0) {
    return {
      aiThemesUpserted: 0,
      aiStockLinksUpserted: 0,
      skippedMissingStocks: 0,
    };
  }
  const nowIso = now.toISOString();

  // FK: 전체 발굴 종목 code 의 stocks 존재 확인.
  const allCodes = discovered.flatMap((d) => d.stockCodes);
  const existing = await filterExistingStocks(supabase, allCodes, log);
  const skippedMissingStocks = new Set(
    allCodes.filter((c) => !existing.has(c)),
  ).size;

  // 2순위 흡수용 인덱스 — 후보 유효종목을 active 로 보유한 기존 시스템 테마(code→테마, 테마→sources).
  const candidateCodes = allCodes.filter((c) => existing.has(c));
  const { codeToThemes, themeSources } = await loadSystemThemeMembership(
    supabase,
    candidateCodes,
    log,
  );

  let aiThemesUpserted = 0;
  let skippedSparse = 0;
  const linkRows: Array<{
    theme_id: string;
    stock_code: string;
    source: "ai";
    confidence: number;
    effective_from: string;
    effective_to: null;
  }> = [];

  for (const d of discovered) {
    const validCodes = d.stockCodes.filter((c) => existing.has(c)); // 해석된 코드는 사실상 전부.

    // 1순위) norm_key 완전일치. 2순위) active 종목 ≥2 공유하는 시스템 테마(변형명 중복 흡수).
    let match = await findAiThemeId(supabase, d.normKey, log);
    if (!match) {
      const overlapId = pickOverlapTheme(validCodes, codeToThemes);
      if (overlapId) {
        match = { id: overlapId, sources: themeSources.get(overlapId) ?? [] };
      }
    }

    let themeId: string;
    if (!match) {
      // 신규 AI 테마 — 해석된 유효 종목 2개 미만이면 생성 skip(추상 개념 노이즈 차단, 사용자 결정).
      if (validCodes.length < MIN_AI_THEME_STOCKS) {
        skippedSparse++;
        continue;
      }
      // is_system=true, owner_id=null, sources=['ai'].
      const { data, error } = await supabase
        .from("themes")
        .insert({
          name: d.name,
          description: null,
          is_system: true,
          owner_id: null,
          norm_key: d.normKey,
          sources: ["ai"],
          updated_at: nowIso,
        })
        .select("id")
        .single();
      if (error) {
        log.error(
          { err: error.message, normKey: d.normKey },
          "persistAi: theme insert failed",
        );
        throw error;
      }
      themeId = (data as { id: string }).id;
    } else {
      // 기존 시스템 테마(norm_key 일치 or 종목 ≥2 공유) — sources 에 'ai' 병합(멱등).
      // 이미 naver/alpha 종목 보유하므로 ≥2 가드 미적용(흡수만, 신규 생성 아님).
      themeId = match.id;
      await mergeAiSource(supabase, themeId, match.sources, log, nowIso);
    }
    aiThemesUpserted++;

    for (const code of validCodes) {
      linkRows.push({
        theme_id: themeId,
        stock_code: code,
        source: "ai",
        confidence: d.confidence,
        effective_from: nowIso,
        effective_to: null,
      });
    }
  }
  if (skippedSparse > 0) {
    log.info(
      { skippedSparse, min: MIN_AI_THEME_STOCKS },
      "persistAi: 해석 후 <2종목 신규 AI 테마 생성 skip",
    );
  }

  let aiStockLinksUpserted = 0;
  if (linkRows.length > 0) {
    // ignoreDuplicates — 흡수 시 기존 (theme,stock) 행(naver/alpha source · soft-제외 이력)을
    // 덮지 않고 누락 종목만 'ai' 로 INSERT(상호 보강, 출처 라벨 보존, 이전 교정 존중).
    const { error } = await supabase
      .from("theme_stocks")
      .upsert(linkRows, {
        onConflict: "theme_id,stock_code",
        ignoreDuplicates: true,
      });
    if (error) {
      log.error({ err: error.message }, "persistAi: theme_stocks upsert failed");
      throw error;
    }
    aiStockLinksUpserted = linkRows.length;
  }

  return { aiThemesUpserted, aiStockLinksUpserted, skippedMissingStocks };
}

/**
 * 오분류 교정 적재 — effective_to=now soft-제외 마킹만 (T-10-06-02 원본 보존).
 * naver/alphasquare/user row 를 DELETE 하지 않는다. 현재 편입(effective_to IS NULL)만 마킹.
 */
export async function persistCorrections(
  supabase: SupabaseClient,
  targets: CorrectionTarget[],
  log: pino.Logger,
  now: Date = new Date(),
): Promise<number> {
  if (targets.length === 0) return 0;
  const nowIso = now.toISOString();
  let corrected = 0;
  for (const t of targets) {
    // soft-제외: effective_to 마킹만(삭제 금지). 이미 제외된 행은 건드리지 않음.
    const { error } = await supabase
      .from("theme_stocks")
      .update({ effective_to: nowIso })
      .eq("theme_id", t.themeId)
      .eq("stock_code", t.stockCode)
      .is("effective_to", null);
    if (error) {
      log.error(
        { err: error.message, themeId: t.themeId, stockCode: t.stockCode },
        "persistAi: correction soft-exclude failed",
      );
      continue; // 한 행 실패가 전체를 막지 않음.
    }
    corrected++;
  }
  return corrected;
}

/** 읽기 종결 상한 — 시스템 테마(~수백)·AI 테마 종목(~수십)은 db-max-rows(1000) 미만이라 단일 조회로 충분. */
const PRUNE_READ_LIMIT = 2000;

/**
 * ai 단독(sources=['ai']) 시스템 테마 중 active 종목 < MIN_AI_THEME_STOCKS 인 것을 삭제.
 * theme_stocks 는 FK CASCADE. 생성 ≥2 가드와 동일 불변식 — 기존 sparse(0~1종목) AI 테마 정리 +
 * 이후 종목 이탈로 빈약해진 것 청소. **불가침**: sources 에 naver/alphasquare/user 가 섞인
 * 테마는 절대 미접근(원 소스 데이터 보존, T-10-06-02 정신). enrichWithAi 말미에 1회 호출.
 *
 * @returns 삭제된 테마 수
 */
export async function pruneSparseAiThemes(
  supabase: SupabaseClient,
  log: pino.Logger,
): Promise<number> {
  // 1) 시스템 테마 + sources → JS 에서 ai 단독만 선별(배열 동등은 PostgREST 가 까다로워 JS 필터).
  const { data: themes, error: tErr } = await supabase
    .from("themes")
    .select("id, sources")
    .eq("is_system", true)
    .limit(PRUNE_READ_LIMIT);
  if (tErr) {
    log.error({ err: tErr.message }, "pruneSparseAiThemes: themes 조회 실패");
    return 0;
  }
  const aiOnlyIds = ((themes ?? []) as Array<{ id: string; sources: string[] | null }>)
    .filter(
      (t) =>
        Array.isArray(t.sources) &&
        t.sources.length === 1 &&
        t.sources[0] === "ai",
    )
    .map((t) => t.id);
  if (aiOnlyIds.length === 0) return 0;

  // 2) 해당 테마들의 active(effective_to IS NULL) 종목 수 (AI 테마는 소수라 단일 .in()).
  const { data: links, error: lErr } = await supabase
    .from("theme_stocks")
    .select("theme_id, effective_to")
    .in("theme_id", aiOnlyIds)
    .limit(PRUNE_READ_LIMIT);
  if (lErr) {
    log.error({ err: lErr.message }, "pruneSparseAiThemes: theme_stocks 조회 실패");
    return 0;
  }
  const activeCount = new Map<string, number>();
  for (const r of (links ?? []) as Array<{ theme_id: string; effective_to: string | null }>) {
    if (r.effective_to !== null) continue; // active 만.
    activeCount.set(r.theme_id, (activeCount.get(r.theme_id) ?? 0) + 1);
  }

  // 3) active < MIN 인 ai 단독 테마 삭제 (theme_stocks FK CASCADE).
  const sparseIds = aiOnlyIds.filter(
    (id) => (activeCount.get(id) ?? 0) < MIN_AI_THEME_STOCKS,
  );
  if (sparseIds.length === 0) return 0;

  const { error: dErr } = await supabase
    .from("themes")
    .delete()
    .in("id", sparseIds)
    .eq("is_system", true); // ← 안전 재확인(ai 단독은 1)에서 이미 선별).
  if (dErr) {
    log.error({ err: dErr.message }, "pruneSparseAiThemes: 삭제 실패");
    return 0;
  }
  log.info(
    { pruned: sparseIds.length, min: MIN_AI_THEME_STOCKS },
    "pruneSparseAiThemes: ai 단독 <2종목 테마 삭제",
  );
  return sparseIds.length;
}

/**
 * 이미 쌓인 AI 단독 중복 정리 — sources=['ai'] 시스템 테마 중 큐레이션(naver/alphasquare) 테마와
 * active 종목 ≥ MERGE_MIN_SHARED_STOCKS 공유하는 것을 그 큐레이션 테마로 **흡수 후 삭제**.
 *
 * 배경: persistDiscoveries 의 2순위 흡수는 **앞으로의** 중복만 막는다. 그 가드가 없던 시절
 * 생성됐거나, 이후 큐레이션 테마가 자라 겹치게 된 AI 단독 테마(사용자 보고 "네이버/알파와 비슷한
 * AI 테마")는 그대로 남는다. 매 cycle idempotent 로 점진 정리한다.
 *
 * **불가침**: AI 단독(sources=['ai']) 테마만 삭제 대상. naver/alphasquare/user 가 섞인 테마는 절대
 * 미접근(원 소스 보존, pruneSparseAiThemes 정신). 흡수는 누락 종목만 'ai' 로 추가(ignoreDuplicates).
 *
 * @returns 흡수·삭제된 AI 단독 테마 수
 */
export async function consolidateAiThemes(
  supabase: SupabaseClient,
  log: pino.Logger,
  now: Date = new Date(),
): Promise<number> {
  const nowIso = now.toISOString();

  // 1) 시스템 테마 → AI 단독 vs 큐레이션 분류(배열 동등은 PostgREST 가 까다로워 JS 필터).
  const { data: themes, error: tErr } = await supabase
    .from("themes")
    .select("id, sources")
    .eq("is_system", true)
    .limit(PRUNE_READ_LIMIT);
  if (tErr) {
    log.error({ err: tErr.message }, "consolidateAiThemes: themes 조회 실패");
    return 0;
  }
  const rows = (themes ?? []) as Array<{ id: string; sources: string[] | null }>;
  const aiOnly: string[] = [];
  const curated = new Set<string>();
  const curatedSources = new Map<string, string[]>();
  for (const t of rows) {
    const s = Array.isArray(t.sources) ? t.sources : [];
    if (s.length === 1 && s[0] === "ai") {
      aiOnly.push(t.id);
    } else if (s.includes("naver") || s.includes("alphasquare")) {
      curated.add(t.id);
      curatedSources.set(t.id, s);
    }
  }
  if (aiOnly.length === 0 || curated.size === 0) return 0;

  // 2) AI 단독 테마들의 active 종목(code+confidence) 로드.
  const { data: aiLinks, error: alErr } = await supabase
    .from("theme_stocks")
    .select("theme_id, stock_code, confidence, effective_to")
    .in("theme_id", aiOnly)
    .limit(PRUNE_READ_LIMIT);
  if (alErr) {
    log.error({ err: alErr.message }, "consolidateAiThemes: ai theme_stocks 조회 실패");
    return 0;
  }
  const aiThemeCodes = new Map<string, Array<{ code: string; confidence: number | null }>>();
  const allAiCodes = new Set<string>();
  for (const r of (aiLinks ?? []) as Array<{
    theme_id: string;
    stock_code: string;
    confidence: number | null;
    effective_to: string | null;
  }>) {
    if (r.effective_to !== null) continue; // active 만.
    let arr = aiThemeCodes.get(r.theme_id);
    if (!arr) {
      arr = [];
      aiThemeCodes.set(r.theme_id, arr);
    }
    arr.push({ code: r.stock_code, confidence: r.confidence });
    allAiCodes.add(r.stock_code);
  }
  if (allAiCodes.size === 0) return 0;

  // 3) 그 종목을 active 로 보유한 큐레이션 테마 → code→큐레이션 테마 id 집합.
  const codeToCurated = new Map<string, Set<string>>();
  const codeList = [...allAiCodes];
  for (let i = 0; i < codeList.length; i += STOCK_IN_CHUNK) {
    const chunk = codeList.slice(i, i + STOCK_IN_CHUNK);
    const { data, error } = await supabase
      .from("theme_stocks")
      .select("theme_id, stock_code, effective_to, themes!inner(is_system)")
      .in("stock_code", chunk)
      .eq("themes.is_system", true) // 시스템 테마만(유저 테마 row inflation 방지). curated.has 가 추가 narrowing.
      .limit(PRUNE_READ_LIMIT);
    if (error) {
      log.error({ err: error.message }, "consolidateAiThemes: curated theme_stocks 조회 실패");
      return 0;
    }
    for (const r of (data ?? []) as Array<{
      theme_id: string;
      stock_code: string;
      effective_to: string | null;
    }>) {
      if (r.effective_to !== null) continue;
      if (!curated.has(r.theme_id)) continue; // 큐레이션 테마만.
      let set = codeToCurated.get(r.stock_code);
      if (!set) {
        set = new Set<string>();
        codeToCurated.set(r.stock_code, set);
      }
      set.add(r.theme_id);
    }
  }

  // 4) 각 AI 단독 테마 → 최다 공유(≥임계) 큐레이션 테마로 흡수.
  const linkRows: Array<{
    theme_id: string;
    stock_code: string;
    source: "ai";
    confidence: number | null;
    effective_from: string;
    effective_to: null;
  }> = [];
  const foldedAiThemeIds: string[] = [];
  const curatedToUpdate = new Set<string>();
  for (const aiId of aiOnly) {
    const links = aiThemeCodes.get(aiId);
    if (!links || links.length === 0) continue;
    const tally = new Map<string, number>();
    for (const { code } of links) {
      const set = codeToCurated.get(code);
      if (!set) continue;
      for (const cid of set) tally.set(cid, (tally.get(cid) ?? 0) + 1);
    }
    let bestId: string | null = null;
    let bestCount = MERGE_MIN_SHARED_STOCKS - 1;
    for (const cid of [...tally.keys()].sort()) {
      const cnt = tally.get(cid) ?? 0;
      if (cnt > bestCount) {
        bestCount = cnt;
        bestId = cid;
      }
    }
    if (!bestId) continue; // 겹치는 큐레이션 테마 없음 → 진짜 신규 AI 테마, 보존.

    for (const { code, confidence } of links) {
      if (codeToCurated.get(code)?.has(bestId)) continue; // 이미 큐레이션에 active.
      linkRows.push({
        theme_id: bestId,
        stock_code: code,
        source: "ai",
        confidence,
        effective_from: nowIso,
        effective_to: null,
      });
      // 동일 큐레이션 테마로 흡수될 다음 AI 테마가 중복 INSERT 하지 않도록 인덱스 갱신.
      let s = codeToCurated.get(code);
      if (!s) {
        s = new Set<string>();
        codeToCurated.set(code, s);
      }
      s.add(bestId);
    }
    curatedToUpdate.add(bestId);
    foldedAiThemeIds.push(aiId);
  }
  if (foldedAiThemeIds.length === 0) return 0;

  // 5) 누락 종목 'ai' INSERT(ignoreDuplicates) → 큐레이션 sources 에 'ai' 병합 → AI 단독 테마 삭제.
  if (linkRows.length > 0) {
    const { error } = await supabase
      .from("theme_stocks")
      .upsert(linkRows, {
        onConflict: "theme_id,stock_code",
        ignoreDuplicates: true,
      });
    if (error) {
      log.error({ err: error.message }, "consolidateAiThemes: 흡수 종목 upsert 실패");
      return 0;
    }
  }
  for (const cid of curatedToUpdate) {
    await mergeAiSource(supabase, cid, curatedSources.get(cid) ?? [], log, nowIso);
  }
  const { error: dErr } = await supabase
    .from("themes")
    .delete()
    .in("id", foldedAiThemeIds)
    .eq("is_system", true); // ← 안전 재확인(1)에서 ai 단독만 선별).
  if (dErr) {
    log.error({ err: dErr.message }, "consolidateAiThemes: AI 단독 테마 삭제 실패");
    return 0;
  }
  log.info(
    { folded: foldedAiThemeIds.length, linksMoved: linkRows.length },
    "consolidateAiThemes: AI 단독 중복 테마를 큐레이션 테마로 흡수",
  );
  return foldedAiThemeIds.length;
}

/**
 * 발굴 + 교정 통합 적재 — index.ts cycle 에서 호출.
 * 발굴 먼저(신규 테마 생성) → 교정(soft-제외)순. 둘 다 실패해도 부분 결과 반환.
 */
export async function persistAi(
  supabase: SupabaseClient,
  discovered: DiscoveredTheme[],
  corrections: CorrectionTarget[],
  log: pino.Logger,
  now: Date = new Date(),
): Promise<PersistAiResult> {
  const disc = await persistDiscoveries(supabase, discovered, log, now);
  const corrected = await persistCorrections(supabase, corrections, log, now);
  return { ...disc, corrected };
}
