import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LimitUpResponse, LimitUpThemeStat } from "@gh-radar/shared";
import { LimitUpParams } from "../schemas/limitUp.js";
import { ApiError } from "../errors.js";
import {
  mapEvent,
  mapStats,
  mapTheme,
  zeroStats,
  type LimitUpEventRow,
  type LimitUpStockStatsRow,
  type LimitUpThemeStatRow,
} from "../mappers/limitUp.js";

/**
 * Phase 12 — GET /api/stocks/:code/limit-up (LIMIT-01, RESEARCH §읽기경로).
 *
 * 사전계산된 limit_up_* 테이블(워커 야간 rebuild_limit_up 적재)을 종목 상세에 노출하는
 * 읽기 전용 라우트. **객체** { hero, events, themes } 로 반환한다 (LimitUpResponse 계약 —
 * 배열 아님, comovement 드리프트 회피).
 *
 * 정적 이력 — comovement 라우트의 실시간 시세 조인 / 동조 점수 계산 / 청크 시세 fetch 는
 * 의도적으로 미사용한다 (RESEARCH Anti-Pattern). on-demand 재계산 트리거 없음
 * (D-22, SELECT 만). mergeParams:true 로 부모(stocks.ts)의 :code 접근.
 */

const EVENT_COLS =
  "code,date,is_jeomsang,next_open_ret,next_high_ret,next_low_ret,next_close_ret,trade_amount,turnover";
const STATS_COLS =
  "code,total_events,resolved_events,win_count,win_rate,avg_open_ret,worst_low_ret,recent_wins,recent_losses,bucket_n10_n5,bucket_n5_0,bucket_0_p5,bucket_p5_p10,bucket_p10";
const THEME_STAT_COLS = "theme_id,sample_n,win_count,win_rate,avg_open_ret";

export const limitUpRouter: RouterT = Router({ mergeParams: true });

limitUpRouter.get("/", async (req, res, next) => {
  try {
    const parsed = LimitUpParams.safeParse(req.params);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError(
        400,
        "INVALID_QUERY_PARAM",
        `${issue.path.join(".")}: ${issue.message}`,
      );
    }
    const code = parsed.data.code;
    const supabase = req.app.locals.supabase as SupabaseClient;

    // 1. 종목 히어로 통계 (없으면 zero stats — 이벤트 0회 빈 상태).
    const { data: statsRow, error: sErr } = await supabase
      .from("limit_up_stock_stats")
      .select(STATS_COLS)
      .eq("code", code)
      .maybeSingle();
    if (sErr) throw sErr;
    const hero = statsRow
      ? mapStats(statsRow as unknown as LimitUpStockStatsRow)
      : zeroStats();

    // 2. 이벤트 리스트 (date DESC — 행 수 작아 페이지네이션 불요, RESEARCH "Don't Hand-Roll").
    const { data: eventRows, error: eErr } = await supabase
      .from("limit_up_events")
      .select(EVENT_COLS)
      .eq("code", code)
      .order("date", { ascending: false });
    if (eErr) throw eErr;
    const events = ((eventRows ?? []) as unknown as LimitUpEventRow[]).map(
      mapEvent,
    );

    // 3. 소속 테마별 분리 통계 — 앵커의 active 시스템 테마(effective_to IS NULL) 풀.
    const { data: memberRows, error: mErr } = await supabase
      .from("theme_stocks")
      .select("theme_id")
      .eq("stock_code", code)
      .is("effective_to", null);
    if (mErr) throw mErr;
    const themeIds = [
      ...new Set(
        ((memberRows ?? []) as { theme_id: string }[]).map((r) => r.theme_id),
      ),
    ];

    let themes: LimitUpThemeStat[] = [];
    if (themeIds.length > 0) {
      // 테마 통계 + 테마 메타(name, hidden=false — service_role RLS 우회라 tombstone 필터).
      const { data: themeStats, error: tsErr } = await supabase
        .from("limit_up_theme_stats")
        .select(THEME_STAT_COLS)
        .in("theme_id", themeIds);
      if (tsErr) throw tsErr;
      const { data: themeMeta, error: tmErr } = await supabase
        .from("themes")
        .select("id,name")
        .in("id", themeIds)
        .eq("hidden", false);
      if (tmErr) throw tmErr;
      const nameById = new Map<string, string>();
      for (const t of (themeMeta ?? []) as { id: string; name: string }[]) {
        nameById.set(t.id, t.name);
      }
      themes = ((themeStats ?? []) as unknown as LimitUpThemeStatRow[])
        .filter((row) => nameById.has(row.theme_id))
        .map((row) => mapTheme(row, nameById.get(row.theme_id)!))
        // D-17 — 표본 큰 테마 우선 노출 (sample_n DESC).
        .sort((a, b) => b.sampleN - a.sampleN);
    }

    res.setHeader("Cache-Control", "no-store");
    res.json({ hero, events, themes } satisfies LimitUpResponse);
  } catch (e) {
    next(e);
  }
});
