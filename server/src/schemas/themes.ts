import { z } from "zod";

/**
 * Phase 10 — /api/themes Zod 스키마 (THEME-02, T-10-04-01).
 *
 * GET /api/themes/:id 의 :id 는 uuid 만 허용 — PostgREST 파라미터 바인딩 전에
 * 형식 검증으로 injection/오류 입력을 차단(stocks.ts :code 정규식 선례와 동형).
 */
export const ThemeDetailParams = z.object({
  id: z.string().uuid(),
});

export type ThemeDetailParamsT = z.infer<typeof ThemeDetailParams>;

/** `GET /api/themes/by-stock?codes=` 상한 — 인박스 261019-theme-by-stock 계약(6자리 · 최대 100 · 초과/형식 오류 400). */
export const THEME_BY_STOCK_MAX_CODES = 100;

/**
 * inbox 261019-theme-by-stock — `?codes=005930,000660,…` (쉼표 구분 6자리 종목코드 · 1~100개 · 중복은 한 번).
 * 빈 조각(`,,`)·비6자리·101개 이상은 400. 순서는 입력 순서를 지킨다(응답 순서 = 입력 순서).
 */
export const ThemeByStockQuery = z.object({
  codes: z
    .string()
    .min(1)
    .transform((raw) => raw.split(","))
    .pipe(z.array(z.string().regex(/^\d{6}$/, "6자리 종목코드")).min(1).max(THEME_BY_STOCK_MAX_CODES))
    .transform((codes) => [...new Set(codes)]),
});

export type ThemeByStockQueryT = z.infer<typeof ThemeByStockQuery>;
