import { z } from "zod";

/**
 * Phase 12 — GET /api/stocks/:code/limit-up 의 :code 검증 (LIMIT-01, T-12-03-01).
 *
 * 앵커 종목코드는 영숫자 1~10자만 허용 — PostgREST 파라미터 바인딩 전에 형식 검증으로
 * injection/오류 입력을 차단 (comovement.ts CoMovementParams 정규식 동형 복제).
 */
export const LimitUpParams = z.object({
  code: z.string().regex(/^[A-Za-z0-9]{1,10}$/),
});

export type LimitUpParamsT = z.infer<typeof LimitUpParams>;
