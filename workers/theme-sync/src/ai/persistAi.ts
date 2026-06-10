import type { SupabaseClient } from "@supabase/supabase-js";
import type pino from "pino";
import type { DiscoveredTheme } from "./discoverThemes";
import type { CorrectionTarget } from "./correctMembership";

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

/** stocks 마스터에 존재하는 code 만 통과 — 청크 분할 .in() 조회. */
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
      .select("code")
      .in("code", chunk);
    if (error) {
      log.error({ err: error.message }, "persistAi: filterExistingStocks failed");
      throw error;
    }
    for (const r of (data ?? []) as Array<{ code: string }>) exists.add(r.code);
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

/**
 * 발굴 후보 적재 — themes(source='ai', is_system=true) + theme_stocks(source='ai') UPSERT.
 * norm_key 충돌 시 기존 시스템 테마에 'ai' source 병합(중복 발굴 방지).
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
    const found = await findAiThemeId(supabase, d.normKey, log);
    let themeId: string;
    if (!found) {
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
      // 기존 시스템 테마 — sources 에 'ai' 병합(이미 있으면 멱등). 이미 naver/alpha 종목
      // 보유하므로 ≥2 가드 미적용(병합만, 신규 생성 아님).
      themeId = found.id;
      if (!found.sources.includes("ai")) {
        const { error } = await supabase
          .from("themes")
          .update({ sources: [...found.sources, "ai"], updated_at: nowIso })
          .eq("id", themeId)
          .eq("is_system", true); // ← 불가침 규칙 #1 재확인.
        if (error) {
          log.error(
            { err: error.message, themeId },
            "persistAi: theme sources merge failed",
          );
          throw error;
        }
      }
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
    const { error } = await supabase
      .from("theme_stocks")
      .upsert(linkRows, { onConflict: "theme_id,stock_code" });
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
