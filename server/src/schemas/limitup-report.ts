import { z } from "zod";

/**
 * Phase 28 Plan 10 — 상한가 보고서 쿼리 검증 (`GET /api/limitup/report` · `GET /api/limitup/grid-urls`).
 *
 * `d` = `YYYYMMDD`(gh-trade export 날짜 형식 그대로). 형식만 맞고 날짜가 아닌 값(`20261340` · `20260230`)도 여기서 400 —
 * `Date.UTC` 가 조용히 다음 달로 넘기는 값은 다시 펼친 연 · 월 · 일이 입력과 달라 거부된다. RPC 0회로 끝난다.
 * (파일명이 `limitup-report` 인 이유: 기존 상한가 이력 스키마 `limitUp.ts` 와 대소문자만 다른 이름은 macOS 에서 같은 파일이다.)
 */
const Ymd = z
  .string()
  .regex(/^\d{8}$/, "YYYYMMDD 형식이어야 합니다.")
  .refine((s) => {
    const y = Number(s.slice(0, 4));
    const m = Number(s.slice(4, 6));
    const d = Number(s.slice(6, 8));
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }, "올바른 날짜가 아닙니다.");

/** 보고서 — `d` 생략 = 최신 적재 날짜(RPC 가 정한다). */
export const LimitupReportQuery = z.object({ d: Ymd.optional() });
export type LimitupReportQueryT = z.infer<typeof LimitupReportQuery>;

/** 격자 서명 URL — `d` 필수(보고서 응답의 `date` 를 그대로 넘긴다). */
export const LimitupGridUrlsQuery = z.object({ d: Ymd });
export type LimitupGridUrlsQueryT = z.infer<typeof LimitupGridUrlsQuery>;
