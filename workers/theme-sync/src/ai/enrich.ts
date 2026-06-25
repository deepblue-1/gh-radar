import type { SupabaseClient } from "@supabase/supabase-js";
import type pino from "pino";
import type { ThemeSyncConfig } from "../config";
import { discoverThemes } from "./discoverThemes";
import { correctMembership, type MembershipRow } from "./correctMembership";
import { persistAi, pruneSparseAiThemes, consolidateAiThemes } from "./persistAi";

/**
 * Phase 10 Plan 06 — theme-sync cycle 의 AI 보강 단계 (RESEARCH §Pattern 6, 일1회 cycle 동반).
 *
 * upsertThemes 직후 호출. 흐름:
 *   1. discoverThemes — 최근 news_articles 기반 신규 시스템 테마 후보 발굴.
 *   2. loadMembershipForReview — 검수 대상(신규/변경분: 활성 + reason 보유 + naver/alphasquare)만 로드(비용 통제).
 *   3. correctMembership — "명백히 무관" 매핑만 soft-제외 대상으로 판정.
 *   4. persistAi — 발굴(source='ai' 적재) + 교정(effective_to soft-제외).
 *
 * 안전:
 *   - classifyEnabled 게이트는 discoverThemes/correctMembership 내부 + 본 함수 진입부 이중.
 *   - 호출부(index.ts)가 try/catch 로 감싸 AI 실패가 cycle 전체를 죽이지 않음(isolation).
 */

/** 교정 검수 대상 상한 — 토큰/비용 통제(신규/변경분만이라 보통 훨씬 적음). */
const REVIEW_MAX = 200;

export interface AiEnrichResult {
  aiDiscovered: number;
  aiCorrected: number;
  aiThemesUpserted: number;
  aiStockLinksUpserted: number;
  /** ai 단독 <2종목 테마 prune 삭제 수. */
  aiPruned: number;
  /** 큐레이션 테마와 종목 ≥2 겹쳐 흡수·삭제된 ai 단독 중복 테마 수. */
  aiConsolidated: number;
}

/**
 * 검수 대상 종목↔테마 매핑 로드 — 비용 통제 위해 신규/변경분만(reason 보유 + 활성 + 스크랩 소스).
 * reason 텍스트가 "이 종목이 왜 이 테마인가" 의 근거라 오분류 판정 입력으로 유용(RESEARCH §Pattern 6(b)).
 */
async function loadMembershipForReview(
  supabase: SupabaseClient,
  log: pino.Logger,
): Promise<MembershipRow[]> {
  // reason/effective_to 필터는 JS 에서 — 종결은 .limit() 하나만(mock/PostgREST 일관, .is()/.not() 미사용).
  const { data, error } = await supabase
    .from("theme_stocks")
    .select("theme_id, stock_code, reason, effective_to, themes!inner(name, is_system)")
    .in("source", ["naver", "alphasquare"])
    .limit(REVIEW_MAX);
  if (error) {
    log.error({ err: error.message }, "loadMembershipForReview failed");
    return [];
  }
  const rows = (data ?? []) as Array<{
    theme_id: string;
    stock_code: string;
    reason: string | null;
    effective_to: string | null;
    themes: { name: string; is_system: boolean } | { name: string; is_system: boolean }[] | null;
  }>;
  const out: MembershipRow[] = [];
  for (const r of rows) {
    if (r.effective_to !== null) continue; // 현재 편입(active)만.
    if (!r.reason) continue; // reason 보유분만(오분류 판정 근거).
    // PostgREST inner join 은 1:1 이면 object, 배열로 올 수도 있어 방어(watchlist 선례).
    const theme = Array.isArray(r.themes) ? r.themes[0] : r.themes;
    if (!theme || !theme.is_system) continue; // 시스템 테마만 교정 대상.
    out.push({
      themeId: r.theme_id,
      themeName: theme.name,
      stockCode: r.stock_code,
      reason: r.reason,
    });
  }
  return out;
}

/**
 * AI 보강 1회 실행 — 발굴 + 교정 + 적재. 결과 카운트 반환.
 * classifyEnabled=false 면 즉시 0(Claude 호출 0). 본 함수는 throw 하지 않도록 내부 모듈이
 * 모두 실패-안전이나, 호출부도 try/catch 로 이중 격리한다.
 */
export async function enrichWithAi(
  supabase: SupabaseClient,
  cfg: ThemeSyncConfig,
  log: pino.Logger,
  now: Date = new Date(),
): Promise<AiEnrichResult> {
  if (!cfg.classifyEnabled) {
    log.info("classify disabled — skip AI enrichment (Claude 호출 0)");
    return {
      aiDiscovered: 0,
      aiCorrected: 0,
      aiThemesUpserted: 0,
      aiStockLinksUpserted: 0,
      aiPruned: 0,
      aiConsolidated: 0,
    };
  }

  // 1) 발굴.
  const discovered = await discoverThemes(supabase, cfg, log, now);

  // 2) 교정 검수 대상(신규/변경분만) 로드 → 3) 무관 판정.
  const reviewRows = await loadMembershipForReview(supabase, log);
  const corrections = await correctMembership(cfg, reviewRows, log);

  // 4) 적재 — 발굴(source='ai') + 교정(effective_to soft-제외).
  const persisted = await persistAi(supabase, discovered, corrections, log, now);

  // 5) consolidate — 기존 ai 단독 중복 테마를 큐레이션 테마로 흡수·삭제(이미 쌓인 중복 정리).
  const aiConsolidated = await consolidateAiThemes(supabase, log, now);

  // 6) prune — ai 단독 <2종목 테마 정리(생성 ≥2 가드와 동일 불변식, 기존 sparse 청소).
  const aiPruned = await pruneSparseAiThemes(supabase, log);

  log.info(
    {
      aiDiscovered: discovered.length,
      aiCorrected: persisted.corrected,
      aiThemesUpserted: persisted.aiThemesUpserted,
      aiStockLinksUpserted: persisted.aiStockLinksUpserted,
      skippedMissingStocks: persisted.skippedMissingStocks,
      aiConsolidated,
      aiPruned,
    },
    "AI enrichment done",
  );

  return {
    aiDiscovered: discovered.length,
    aiCorrected: persisted.corrected,
    aiThemesUpserted: persisted.aiThemesUpserted,
    aiStockLinksUpserted: persisted.aiStockLinksUpserted,
    aiPruned,
    aiConsolidated,
  };
}
