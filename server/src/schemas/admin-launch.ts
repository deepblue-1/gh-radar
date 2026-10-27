import { z } from "zod";

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
