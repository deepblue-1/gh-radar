import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoMovementResponse, Market } from "@gh-radar/shared";
import { CoMovementParams } from "../schemas/comovement.js";
import { ApiError } from "../errors.js";
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
 * 입력은 `stock_comovement_inputs(p_code)` RPC 한 번으로 받는다
 * (migration 20260914090000 — 필드 계약은 그 파일 헤더). 종전엔 순차 8~10회 왕복이라
 * Cloud Run(VPC all-traffic egress)에서 1초를 넘었다. 점수 계산은 여기 JS 에 그대로 둔다.
 * mergeParams:true 로 부모 라우터(stocks.ts)의 :code 를 접근 (news.ts/discussions.ts 패턴).
 */

/** stock_comovement_inputs RPC 반환 (jsonb). */
type ComovementInputs = {
  theme_ids: string[];
  members: ThemeComovementRow[];
  edges: CosurgeEdgeRow[];
  themes: { id: string; name: string }[];
  stocks: {
    code: string;
    name: string | null;
    market: string | null;
    change_rate: string | number | null;
  }[];
};

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

    // 1~5. 앵커 테마·멤버·co-surge 이웃·테마 메타(hidden 제외)·후보 마스터+시세를 한 번에.
    const { data, error } = await supabase.rpc("stock_comovement_inputs", {
      p_code: code,
    });
    if (error) throw error;
    const inputs = data as ComovementInputs;

    // 테마도 이웃도 없으면 빈 후보 (무테마 종목 — T-11-12 quiet).
    if (inputs.theme_ids.length === 0 && inputs.edges.length === 0) {
      res.setHeader("Cache-Control", "no-store");
      res.json({ candidates: [] } satisfies CoMovementResponse);
      return;
    }

    // computeComovement 입력 Map<code, {name, market, changeRate}> 합성.
    // 마스터 없음 → name=code·KOSPI, 시세 없음/비유한 → changeRate null (종전과 동일 폴백).
    const quoteByCode = new Map<
      string,
      { name: string; market: Market; changeRate: number | null }
    >();
    for (const s of inputs.stocks) {
      const rate = s.change_rate === null ? NaN : Number(s.change_rate);
      quoteByCode.set(s.code, {
        name: s.name ?? s.code,
        market: (s.market ?? "KOSPI") as Market,
        changeRate: Number.isFinite(rate) ? rate : null,
      });
    }

    // 6. 결합점수 랭킹 → TOP-K. 앵커 코드(:code)를 명시 전달 — 다중 테마에서
    //    휴리스틱 추론이 앵커를 못 찾아 자기 후보에 섞이는 회귀 방지.
    const candidates = computeComovement(
      inputs.members,
      inputs.edges,
      inputs.themes,
      quoteByCode,
      k,
      code,
    );

    res.setHeader("Cache-Control", "no-store");
    res.json({ candidates } satisfies CoMovementResponse);
  } catch (e) {
    next(e);
  }
});
