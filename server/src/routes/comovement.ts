import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoMovementResponse, Market } from "@gh-radar/shared";
import { CoMovementParams } from "../schemas/comovement.js";
import { ApiError } from "../errors.js";
import {
  ROW_PAGE,
  fetchQuotesChunked,
  fetchMastersChunked,
} from "../lib/quoteJoin.js";
import { computeComovement } from "../lib/computeComovement.js";
import type {
  ThemeComovementRow,
  CosurgeEdgeRow,
} from "../mappers/comovement.js";

/**
 * Phase 11 — GET /api/stocks/:code/co-movement (COMV-01, RESEARCH §읽기경로).
 *
 * 앵커의 활성 테마 멤버(theme_comovement) ∪ co-surge 이웃(cosurge_edges) 을 합쳐
 * stock_quotes 실시간 등락률을 조인하고, computeComovement 순수함수로 결합점수 TOP-K 를
 * **객체** { candidates:[...] } 로 반환한다 (CoMovementResponse 계약 — 배열 아님, 드리프트 회피).
 *
 * themes.ts 의 청크 IN(QUOTE_CHUNK) + .range(ROW_PAGE) 페이지네이션 선례를 재사용한다.
 * mergeParams:true 로 부모 라우터(stocks.ts)의 :code 를 접근 (news.ts/discussions.ts 패턴).
 */

const THEME_COMOVEMENT_COLS =
  "theme_id,stock_code,ignite_days,member_count,conf_d0,conf_d1,lift,avg_ret";
const COSURGE_COLS = "code_a,code_b,co_count,lift,avg_pair_ret";

/**
 * 앵커의 theme_id 들이 매칭하는 theme_comovement 멤버 전 행을 .range() 페이지네이션 수집.
 * 멤버가 1000 을 넘는 메가 테마(반도체 등)에서 db-max-rows 침묵 절단 방지 (themes.ts 동일 클래스).
 */
async function fetchThemeMembersPaged(
  supabase: SupabaseClient,
  themeIds: string[],
): Promise<ThemeComovementRow[]> {
  if (themeIds.length === 0) return [];
  const out: ThemeComovementRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("theme_comovement")
      .select(THEME_COMOVEMENT_COLS)
      .in("theme_id", themeIds)
      .order("theme_id", { ascending: true })
      .order("stock_code", { ascending: true })
      .range(from, from + ROW_PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as ThemeComovementRow[];
    if (rows.length === 0) break;
    out.push(...rows);
    from += rows.length;
  }
  return out;
}

export const comovementRouter: RouterT = Router({ mergeParams: true });

comovementRouter.get("/", async (req, res, next) => {
  try {
    const parsed = CoMovementParams.safeParse(req.params);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new ApiError(
        400,
        "INVALID_QUERY_PARAM",
        `${issue.path.join(".")}: ${issue.message}`,
      );
    }
    const code = parsed.data.code;
    // k 클램프 (T-11-10 DoS — 거대 응답 방지). 기본 8, 최대 50.
    const k = Math.min(Number(req.query.k) || 8, 50);

    const supabase = req.app.locals.supabase as SupabaseClient;

    // 1. 앵커가 속한 theme_comovement 의 theme_id 집합 (idx_theme_comovement_code).
    const { data: anchorRows, error: aErr } = await supabase
      .from("theme_comovement")
      .select("theme_id")
      .eq("stock_code", code);
    if (aErr) throw aErr;
    const themeIds = [
      ...new Set(
        ((anchorRows ?? []) as { theme_id: string }[]).map((r) => r.theme_id),
      ),
    ];

    // 2. co-surge 이웃 — 양방향 (code_a=:code, code_b=:code) 두 쿼리 union.
    //    OR 금지: 단일 .or() 는 인덱스 2개를 못 타 seq-scan (RESEARCH §읽기경로).
    const { data: aSide, error: e1 } = await supabase
      .from("cosurge_edges")
      .select(COSURGE_COLS)
      .eq("code_a", code);
    if (e1) throw e1;
    const { data: bSide, error: e2 } = await supabase
      .from("cosurge_edges")
      .select(COSURGE_COLS)
      .eq("code_b", code);
    if (e2) throw e2;
    const cosurgeRows = [
      ...((aSide ?? []) as unknown as CosurgeEdgeRow[]),
      ...((bSide ?? []) as unknown as CosurgeEdgeRow[]),
    ];

    // 테마도 이웃도 없으면 빈 후보 (무테마 종목 — T-11-12 quiet).
    if (themeIds.length === 0 && cosurgeRows.length === 0) {
      res.setHeader("Cache-Control", "no-store");
      res.json({ candidates: [] } satisfies CoMovementResponse);
      return;
    }

    // 3. 앵커 테마들의 전 멤버 통계 (.range() 페이지네이션).
    const themeMemberRows = await fetchThemeMembersPaged(supabase, themeIds);

    // 4. 테마 메타 (id,name, hidden=false — service_role RLS 우회라 tombstone 코드 필터).
    const anchorThemes: { id: string; name: string }[] = [];
    if (themeIds.length > 0) {
      const { data: themes, error: tErr } = await supabase
        .from("themes")
        .select("id,name")
        .in("id", themeIds)
        .eq("hidden", false);
      if (tErr) throw tErr;
      for (const t of (themes ?? []) as { id: string; name: string }[]) {
        anchorThemes.push({ id: t.id, name: t.name });
      }
    }

    // 5. 후보 code 합집합 (앵커 제외) → 마스터 + 시세 청크 조인.
    const candidateCodes = new Set<string>();
    for (const r of themeMemberRows) {
      if (r.stock_code !== code) candidateCodes.add(r.stock_code);
    }
    for (const e of cosurgeRows) {
      const other = e.code_a === code ? e.code_b : e.code_a;
      if (other !== code) candidateCodes.add(other);
    }
    const codes = [...candidateCodes];
    const masterByCode = await fetchMastersChunked(supabase, codes);
    const quoteRowByCode = await fetchQuotesChunked(supabase, codes);

    // computeComovement 입력 Map<code, {name, market, changeRate}> 합성.
    const quoteByCode = new Map<
      string,
      { name: string; market: Market; changeRate: number | null }
    >();
    for (const c of codes) {
      const m = masterByCode.get(c);
      const q = quoteRowByCode.get(c);
      const rate = q ? Number(q.change_rate) : NaN;
      quoteByCode.set(c, {
        name: m?.name ?? c,
        market: (m?.market ?? "KOSPI") as Market,
        changeRate: Number.isFinite(rate) ? rate : null,
      });
    }

    // 6. 결합점수 랭킹 → TOP-K.
    const candidates = computeComovement(
      themeMemberRows,
      cosurgeRows,
      anchorThemes,
      quoteByCode,
      k,
    );

    res.setHeader("Cache-Control", "no-store");
    res.json({ candidates } satisfies CoMovementResponse);
  } catch (e) {
    next(e);
  }
});
