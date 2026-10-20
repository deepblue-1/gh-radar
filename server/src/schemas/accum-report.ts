import { z } from "zod";

import { Ymd } from "./limitup-report.js";

/**
 * Phase 34 — 매집감지 보고서 입력 검증 (`GET /api/accum/report` · `GET /api/accum/report/:date/:isin`).
 *
 * - `d` · `date` = `YYYYMMDD` — 상한가 · 팀 매집 보고서와 같은 규칙(`Ymd` · 형식 + 실재 날짜). 어긋나면 400 · RPC 0회.
 *   `d` 생략 = 최신 보고서 날짜(RPC 가 정한다).
 * - `isin` = 대문자 · 숫자 12자. **`^KR` 로 좁히지 않는다** — 비 KR ISIN(KYG2114A1094 씨엑스아이)이 실재한다
 *   (Pitfall 7 · gh-trade `_ISIN_RE` 와 같은 규칙).
 */
export const AccumReportQuery = z.object({ d: Ymd.optional() });
export type AccumReportQueryT = z.infer<typeof AccumReportQuery>;

export const AccumDetailParams = z.object({
  date: Ymd,
  isin: z.string().regex(/^[A-Z0-9]{12}$/),
});
export type AccumDetailParamsT = z.infer<typeof AccumDetailParams>;
