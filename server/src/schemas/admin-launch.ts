import { z } from "zod";
import { LAUNCH_PLAN_GATEWAYS, LAUNCH_PLAN_SERVER_MAX_PIECES } from "@gh-radar/shared";

import { Ymd } from "./limitup-report.js";

/**
 * Phase 35 D-20 — 발사 경계 지도 어드민 입력 검증 (`GET /api/admin/launch/orders` · `GET /api/admin/launch/map`).
 *
 * - `d` = `YYYYMMDD` — 상한가 · 매집 보고서와 같은 규칙(`Ymd` · 형식 + 실재 날짜). 어긋나면 400 · RPC 0회.
 *   `d` 생략 = 조각이 있는 최신 거래일(RPC 가 정한다).
 * - `fire` = 발사 기준(q16 = KRX 16:00:00 · n0930 = NXT 09:00:30) · 기본 q16(D-15).
 * - `range` = 최근 거래일 수(10d · 20d · all) · 기본 10d — RPC `p_days` 는 shared `LAUNCH_RANGE_DAYS` 로 옮긴다(10 · 20 · null).
 *   그 밖 값은 400 · RPC 0회.
 */
export const LaunchOrdersQuery = z.object({ d: Ymd.optional() });
export type LaunchOrdersQueryT = z.infer<typeof LaunchOrdersQuery>;

export const LaunchMapQuery = z.object({
  fire: z.enum(["q16", "n0930"]).default("q16"),
  range: z.enum(["10d", "20d", "all"]).default("10d"),
});
export type LaunchMapQueryT = z.infer<typeof LaunchMapQuery>;

/**
 * Phase 35 범위 7 (35-13) — `PUT /api/admin/launch/plan/:gateway/:fire/:market` 입력. 어긋나면 400 · relay 0회 · RPC 0회.
 *
 * - **구조만 본다** — gateway ∈ `LAUNCH_PLAN_GATEWAYS` · fire ∈ q16|n0930 · market ∈ K|Q · offsets_us 는 int32 정수 1~64칸 · 추가 키 거부.
 * - 순서 · 범위(D-34)는 웹 편집 칸(D-26 · shared `validateLaunchPlanDraft`)과 gh-trade 서버(code 1 문구)가 말한다 — server 가 막으면
 *   서버 거부 문구 경로가 죽는다.
 * - KB121 · KYOBO127 은 계획 대상이 아니다(gh-trade 43 D-02) — `ServerKeySchema` 대신 enum 으로 좁힌다.
 */
export const LaunchPlanParams = z.object({
  gateway: z.enum(LAUNCH_PLAN_GATEWAYS),
  fire: z.enum(["q16", "n0930"]),
  market: z.enum(["K", "Q"]),
});
export type LaunchPlanParamsT = z.infer<typeof LaunchPlanParams>;

export const LaunchPlanSaveBodySchema = z
  .object({
    offsets_us: z
      .array(z.number().int().min(-2147483648).max(2147483647))
      .min(1)
      .max(LAUNCH_PLAN_SERVER_MAX_PIECES),
  })
  .strict();
