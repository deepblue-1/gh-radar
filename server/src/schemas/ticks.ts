import { z } from "zod";

import { Ymd } from "./limitup-report.js";

/**
 * Phase 37 — 틱 전문 뷰어 과거 경로 입력 검증 (`GET /api/ticks/day` · `GET /api/ticks/open` · `POST /api/ticks/convert{,/cancel}`).
 *
 * - `d` = `YYYYMMDD` — 상한가 · 매집감지 보고서와 같은 `Ymd`(형식 + 실재 날짜). 어긋나면 400 · RPC 0회.
 * - `isin` = 대문자 · 숫자 12자. **`^KR` 로 좁히지 않는다** — 비 KR ISIN(KYG2114A1094 씨엑스아이)이 실재한다.
 * - `ex` = `KRX` | `NXT` 만(DB CHECK 와 같은 집합).
 */
export const Isin = z.string().regex(/^[A-Z0-9]{12}$/, "ISIN 12자(대문자 · 숫자)여야 합니다.");
export const TickEx = z.enum(["KRX", "NXT"]);

/** 하루 목록 — `d` 생략 = 최신 격자 날짜(RPC 가 정한다). */
export const TickDayQuery = z.object({ d: Ymd.optional() });
export type TickDayQueryT = z.infer<typeof TickDayQuery>;

/** 한 종목 열기 — 세 키 모두 필수. */
export const TickOpenQuery = z.object({ isin: Isin, d: Ymd, ex: TickEx });
export type TickOpenQueryT = z.infer<typeof TickOpenQuery>;

/** 요청 변환 · 취소 본문 — 열기와 같은 키(`TickConvertBody`). */
export const TickConvertBodySchema = TickOpenQuery;
export type TickConvertBodyT = TickOpenQueryT;
