import { z } from "zod";

import { Ymd } from "./limitup-report.js";

/**
 * Phase 35 D-20 — 발사 경계 지도 어드민 입력 검증 (`GET /api/admin/launch/orders` · `GET /api/admin/launch/map`).
 *
 * - `d` = `YYYYMMDD` — 상한가 · 매집 보고서와 같은 규칙(`Ymd` · 형식 + 실재 날짜). 어긋나면 400 · RPC 0회.
 *   `d` 생략 = 조각이 있는 최신 거래일(RPC 가 정한다).
 */
export const LaunchOrdersQuery = z.object({ d: Ymd.optional() });
export type LaunchOrdersQueryT = z.infer<typeof LaunchOrdersQuery>;
