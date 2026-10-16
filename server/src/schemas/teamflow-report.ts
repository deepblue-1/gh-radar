import { z } from "zod";

import { Ymd } from "./limitup-report.js";

/**
 * Phase 33 — 팀 매집 보고서 쿼리 검증 (`GET /api/teamflow/report`).
 *
 * `d` = `YYYYMMDD` — 상한가 보고서와 같은 규칙(`Ymd` · 형식 + 실재 날짜). 어긋나면 400 · RPC 0회.
 * 생략 = 최신 보고서 날짜(RPC 가 정한다).
 */
export const TeamflowReportQuery = z.object({ d: Ymd.optional() });
export type TeamflowReportQueryT = z.infer<typeof TeamflowReportQuery>;
