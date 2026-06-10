import type { SupabaseClient } from "@supabase/supabase-js";
import type { MergedTheme } from "../merge/mergeThemes";
import { logger } from "../logger";

/**
 * 병합된 시스템 테마 + 종목을 themes/theme_stocks 에 UPSERT (D-03, RESEARCH §Pattern 1).
 *
 * 워커 service_role(RLS bypass) 전용. 흐름:
 *   1. stocks 마스터 존재 확인 — .in(codes) 청크 분할(200) 후 미존재 code per-stock skip
 *      (Pitfall 5 FK 위반 회피, 커밋 37afcde 대량 IN 청크 교훈).
 *   2. 각 병합 테마: norm_key 로 기존 시스템 테마 조회 → 없으면 INSERT, 있으면 sources append UPDATE.
 *   3. theme_stocks UPSERT(effective_from=now, source/reason 태그) — 청크 분할.
 *   4. 이번 cycle 에서 빠진 종목은 effective_to=now 로 soft-제외(편입/제외 이력, D-03).
 *   5. MIN_EXPECTED 가드 — 테마/종목 수가 비정상적으로 적으면 throw(Pitfall 10).
 */

const STOCK_IN_CHUNK = 200; // .in() URL 길이 한계 — 커밋 37afcde 회귀 교훈.
const UPSERT_CHUNK = 500;

// 응답 비정상 가드 — 네이버(~265)+알파 정치(~39) 가 정상. 둘 다 차단/파서붕괴 시 매우 적음.
const MIN_EXPECTED_THEMES = 1;

export interface UpsertResult {
  themesUpserted: number;
  stockLinksUpserted: number;
  stockLinksRetired: number;
  skippedMissingStocks: number;
}

/** stocks 마스터에 존재하는 code 만 통과 — 청크 분할 .in() 조회. */
async function filterExistingStocks(
  supabase: SupabaseClient,
  codes: string[],
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
      logger.error({ err: error.message }, "filterExistingStocks failed");
      throw error;
    }
    for (const r of (data ?? []) as Array<{ code: string }>) {
      exists.add(r.code);
    }
  }
  return exists;
}

/** norm_key 로 기존 시스템 테마 조회 (id + hidden; 없으면 null). */
async function findSystemTheme(
  supabase: SupabaseClient,
  normKey: string,
): Promise<{ id: string; hidden: boolean } | null> {
  const { data, error } = await supabase
    .from("themes")
    .select("id, hidden")
    .eq("norm_key", normKey)
    .eq("is_system", true)
    .maybeSingle();
  if (error) {
    logger.error({ err: error.message, normKey }, "findSystemTheme failed");
    throw error;
  }
  return (data as { id: string; hidden: boolean } | null) ?? null;
}

/**
 * 테마의 manual_override='excluded' 종목 코드 집합 (Edit B — 재편입 차단용).
 * 운영자가 제외한 종목은 네이버가 다시 스크랩해도 effective_to=null 로 되살리면 안 된다.
 */
async function loadExcludedOverrideCodes(
  supabase: SupabaseClient,
  themeId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("theme_stocks")
    .select("stock_code")
    .eq("theme_id", themeId)
    .eq("manual_override", "excluded");
  if (error) {
    logger.error(
      { err: error.message, themeId },
      "loadExcludedOverrideCodes failed",
    );
    throw error;
  }
  return new Set(
    (data ?? []).map((r) => (r as { stock_code: string }).stock_code),
  );
}

export async function upsertThemes(
  supabase: SupabaseClient,
  themes: MergedTheme[],
  now: Date = new Date(),
): Promise<UpsertResult> {
  // Pitfall 10 — 비정상 적은 테마 수면 즉시 throw(부분 응답/파서 붕괴로 DB 오염 방지).
  if (themes.length < MIN_EXPECTED_THEMES) {
    throw new Error(
      `merged themes ${themes.length} (< ${MIN_EXPECTED_THEMES}) — partial scrape suspected, aborting`,
    );
  }

  const nowIso = now.toISOString();

  // 1) 전체 종목 code 의 stocks 존재 확인(청크) → 유효 code 집합.
  const allCodes = themes.flatMap((t) => t.stocks.map((s) => s.code));
  const existing = await filterExistingStocks(supabase, allCodes);
  const skippedMissingStocks = new Set(
    allCodes.filter((c) => !existing.has(c)),
  ).size;
  if (skippedMissingStocks > 0) {
    logger.warn(
      { skipped: skippedMissingStocks },
      "theme_stocks: stocks 마스터 미존재 code per-stock skip (FK, Pitfall 5)",
    );
  }

  let themesUpserted = 0;
  let stockLinksUpserted = 0;
  let stockLinksRetired = 0;

  // theme_stocks UPSERT 행 버퍼(전 테마 누적 후 청크 flush).
  const linkRows: Array<{
    theme_id: string;
    stock_code: string;
    source: string;
    reason: string | null;
    effective_from: string;
    effective_to: null;
  }> = [];

  for (const t of themes) {
    // 2) themes UPSERT — norm_key 로 기존 조회 후 INSERT or sources append UPDATE.
    const existingTheme = await findSystemTheme(supabase, t.normKey);

    // Edit A — hidden tombstone: 운영자가 삭제(hide)한 시스템 테마. update/buffer/retire/
    // insert 전부 건너뛴다. norm_key 슬롯을 그대로 둬 다음 사이클도 계속 찾게 하여
    // 재생성(INSERT)을 막는다(요구사항 3).
    if (existingTheme?.hidden) {
      logger.info(
        { normKey: t.normKey },
        "hidden 시스템 테마 — sync 스킵(tombstone)",
      );
      continue;
    }

    let themeId = existingTheme?.id ?? null;
    if (!themeId) {
      const { data, error } = await supabase
        .from("themes")
        .insert({
          name: t.name,
          description: t.description,
          is_system: true,
          owner_id: null,
          norm_key: t.normKey,
          sources: t.sources,
          updated_at: nowIso,
        })
        .select("id")
        .single();
      if (error) {
        logger.error(
          { err: error.message, normKey: t.normKey },
          "themes insert failed",
        );
        throw error;
      }
      themeId = (data as { id: string }).id;
    } else {
      const { error } = await supabase
        .from("themes")
        .update({
          name: t.name,
          description: t.description,
          sources: t.sources, // 병합 결과가 이미 합집합 — 멱등.
          updated_at: nowIso,
        })
        .eq("id", themeId);
      if (error) {
        logger.error(
          { err: error.message, themeId },
          "themes update failed",
        );
        throw error;
      }
    }
    themesUpserted++;

    // Edit B — 운영자가 제외(manual_override='excluded')한 종목은 재스크랩돼도 재편입 금지.
    const excludedCodes = await loadExcludedOverrideCodes(supabase, themeId);

    // 3) 유효 종목만(마스터 존재 + excluded 아님) theme_stocks 행 버퍼에 누적.
    //    upsert payload 에 manual_override 미포함 → conflict 시 기존 override 보존(included 핀 유지).
    const validStocks = t.stocks.filter(
      (s) => existing.has(s.code) && !excludedCodes.has(s.code),
    );
    for (const s of validStocks) {
      linkRows.push({
        theme_id: themeId,
        stock_code: s.code,
        source: s.source,
        reason: s.reason,
        effective_from: nowIso,
        effective_to: null,
      });
    }

    // 4) 이번 cycle 에서 빠진 active 종목 → effective_to=now soft-제외(편입/제외 이력, D-03).
    const validCodes = new Set(validStocks.map((s) => s.code));
    stockLinksRetired += await retireRemovedStocks(
      supabase,
      themeId,
      validCodes,
      nowIso,
    );
  }

  // theme_stocks UPSERT — 청크 분할(onConflict theme_id,stock_code → 재편입 시 effective 갱신).
  for (let i = 0; i < linkRows.length; i += UPSERT_CHUNK) {
    const chunk = linkRows.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase
      .from("theme_stocks")
      .upsert(chunk, { onConflict: "theme_id,stock_code" });
    if (error) {
      logger.error(
        { err: error.message, chunkStart: i },
        "theme_stocks upsert failed",
      );
      throw error;
    }
    stockLinksUpserted += chunk.length;
  }

  logger.info(
    {
      themesUpserted,
      stockLinksUpserted,
      stockLinksRetired,
      skippedMissingStocks,
    },
    "upsertThemes complete",
  );

  return {
    themesUpserted,
    stockLinksUpserted,
    stockLinksRetired,
    skippedMissingStocks,
  };
}

/**
 * 테마의 현재 active(effective_to IS NULL) 종목 중 이번 cycle 의 validCodes 에 없는 것을
 * effective_to=now 로 마킹(soft-제외). 원 source 데이터 보존(삭제 아님, D-03).
 */
async function retireRemovedStocks(
  supabase: SupabaseClient,
  themeId: string,
  validCodes: Set<string>,
  nowIso: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("theme_stocks")
    .select("stock_code, manual_override")
    .eq("theme_id", themeId)
    .is("effective_to", null);
  if (error) {
    logger.error(
      { err: error.message, themeId },
      "retireRemovedStocks select failed",
    );
    throw error;
  }
  const active = (data ?? []) as Array<{
    stock_code: string;
    manual_override: string | null;
  }>;
  // Edit C — 운영자 핀(manual_override='included')은 스크랩에 없어도 retire 제외(요구사항 3).
  const toRetire = active
    .filter((r) => r.manual_override !== "included")
    .map((r) => r.stock_code)
    .filter((code) => !validCodes.has(code));
  if (toRetire.length === 0) return 0;

  for (let i = 0; i < toRetire.length; i += STOCK_IN_CHUNK) {
    const chunk = toRetire.slice(i, i + STOCK_IN_CHUNK);
    const { error: updErr } = await supabase
      .from("theme_stocks")
      .update({ effective_to: nowIso })
      .eq("theme_id", themeId)
      .in("stock_code", chunk);
    if (updErr) {
      logger.error(
        { err: updErr.message, themeId },
        "retireRemovedStocks update failed",
      );
      throw updErr;
    }
  }
  return toRetire.length;
}
