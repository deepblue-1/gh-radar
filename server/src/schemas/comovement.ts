import { z } from "zod";

/**
 * Phase 11 — GET /api/stocks/:code/co-movement 의 :code 검증 (COMV-01, T-11-09).
 *
 * 앵커 종목코드는 영숫자 1~10자만 허용 — PostgREST 파라미터 바인딩 전에 형식 검증으로
 * injection/오류 입력을 차단(stocks.ts :code 정규식 + themes.ts ThemeDetailParams 선례 동형).
 */
export const CoMovementParams = z.object({
  code: z.string().regex(/^[A-Za-z0-9]{1,10}$/),
});

export type CoMovementParamsT = z.infer<typeof CoMovementParams>;
