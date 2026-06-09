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
