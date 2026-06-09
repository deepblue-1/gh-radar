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
  const linkRows: Array<{
    theme_id: string;
    stock_code: string;
    source: "ai";
    confidence: number;
    effective_from: string;
    effective_to: null;
  }> = [];

  for (const d of discovered) {
    const found = await findAiThemeId(supabase, d.normKey, log);
    let themeId: string;
    if (!found) {
      // 신규 AI 테마 — is_system=true, owner_id=null, sources=['ai'].
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
      // 기존 시스템 테마 — sources 에 'ai' 병합(이미 있으면 멱등).
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

    for (const code of d.stockCodes) {
      if (!existing.has(code)) continue; // FK skip.
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
