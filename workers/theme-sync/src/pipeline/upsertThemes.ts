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

// 지수·파생 상품(ETP) 증권그룹 — 일반 주식이 아니므로 테마에서 제외. KRX SECUGRP_NM 기준.
const ETP_SECURITY_GROUPS = new Set(["ETF", "ETN", "ELW"]);

/** stocks 마스터의 분류 컬럼 — 테마 편입 적격성 판정에 필요한 최소 필드. */
interface StockClassRow {
  code: string;
  name: string | null;
  security_group: string | null;
  kosdaq_segment: string | null;
}

/**
 * 일반 주식만 테마에 편입 — 스팩·ETP 제외(요구사항: "일반 주식이 아닌 종목은 테마에서 빼기").
 *
 * 제외 대상:
 *   1. ETP(ETF/ETN/ELW) — security_group(KRX SECUGRP_NM)으로 판별. 스팩과 달리
 *      증권그룹이 명확히 다르다.
 *   2. 스팩(기업인수목적회사) — 법적으로는 보통주(security_group='주권')라 증권그룹으로는
 *      못 거른다. KRX 소속부(kosdaq_segment, SECT_TP_NM)가 'SPAC(소속부없음)' 형태이므로
 *      'SPAC' 접두 + 종목명 '스팩' 패턴으로 이중 판별. 관리종목·투자주의로 전환된 스팩은
 *      kosdaq_segment 가 'SPAC' 이 아니게 바뀌므로 종목명 패턴이 그 누락을 보강한다.
 */
export function isThemeEligible(row: {
  name: string | null;
  security_group: string | null;
  kosdaq_segment: string | null;
}): boolean {
  if (row.security_group && ETP_SECURITY_GROUPS.has(row.security_group)) {
    return false;
  }
  if (row.kosdaq_segment?.startsWith("SPAC")) return false;
  if (row.name?.includes("스팩")) return false;
  return true;
}

export interface UpsertResult {
  themesUpserted: number;
  stockLinksUpserted: number;
  stockLinksRetired: number;
  skippedMissingStocks: number;
  skippedIneligibleStocks: number;
}

/**
 * stocks 마스터 조회 — 청크 분할 .in().
 * - existing: 마스터에 존재하는 code (FK 검사용).
 * - eligible: 존재 + 일반 주식(스팩·ETP 아님) code (테마 편입 대상).
 */
async function loadStockEligibility(
  supabase: SupabaseClient,
  codes: string[],
): Promise<{ existing: Set<string>; eligible: Set<string> }> {
  const unique = [...new Set(codes)];
  const existing = new Set<string>();
  const eligible = new Set<string>();
  for (let i = 0; i < unique.length; i += STOCK_IN_CHUNK) {
    const chunk = unique.slice(i, i + STOCK_IN_CHUNK);
    const { data, error } = await supabase
      .from("stocks")
      .select("code, name, security_group, kosdaq_segment")
      .in("code", chunk);
    if (error) {
      logger.error({ err: error.message }, "loadStockEligibility failed");
      throw error;
    }
    for (const r of (data ?? []) as StockClassRow[]) {
      existing.add(r.code);
      if (isThemeEligible(r)) eligible.add(r.code);
    }
  }
  return { existing, eligible };
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

  // 1) 전체 종목 code 의 stocks 존재·적격성 확인(청크) → 편입 대상 code 집합.
  const allCodes = themes.flatMap((t) => t.stocks.map((s) => s.code));
  const { existing, eligible } = await loadStockEligibility(supabase, allCodes);
  const skippedMissingStocks = new Set(
    allCodes.filter((c) => !existing.has(c)),
  ).size;
  // 마스터엔 있으나 일반 주식이 아님(스팩·ETP) → 테마 편입 제외.
  const skippedIneligibleStocks = new Set(
    allCodes.filter((c) => existing.has(c) && !eligible.has(c)),
  ).size;
  if (skippedMissingStocks > 0) {
    logger.warn(
      { skipped: skippedMissingStocks },
      "theme_stocks: stocks 마스터 미존재 code per-stock skip (FK, Pitfall 5)",
    );
  }
  if (skippedIneligibleStocks > 0) {
    logger.info(
      { skipped: skippedIneligibleStocks },
      "theme_stocks: 스팩·ETP 등 일반 주식 아닌 code 편입 제외",
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

    // 3) 유효 종목만(일반 주식 + excluded 아님) theme_stocks 행 버퍼에 누적.
    //    eligible = 마스터 존재 AND 스팩·ETP 아님. upsert payload 에 manual_override
    //    미포함 → conflict 시 기존 override 보존(included 핀 유지).
    const validStocks = t.stocks.filter(
      (s) => eligible.has(s.code) && !excludedCodes.has(s.code),
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
      skippedIneligibleStocks,
    },
    "upsertThemes complete",
  );

  return {
    themesUpserted,
    stockLinksUpserted,
    stockLinksRetired,
    skippedMissingStocks,
    skippedIneligibleStocks,
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
