import { z } from "zod";

/**
 * Phase 08 — server discussions route input validation.
 *
 * 종목 코드는 stocks 마스터 그대로 (Phase 7 news 와 동일 정책: 영숫자 1~10자).
 * 한국 종목 6자리뿐 아니라 ETF/ETN/ELW 등 다양한 영숫자 코드도 수용.
 */
export const StockCodeParam = z.object({
  code: z.string().regex(/^[A-Za-z0-9]{1,10}$/, "invalid stock code"),
});
export type StockCodeParamT = z.infer<typeof StockCodeParam>;

/**
 * Phase 08 — Discussion list query (`hours` | `days` | `limit`).
 *
 *  - hours: 상세 Card 패턴 (기본 24시간 단위 노출). 1~720 범위 (30일 ceiling sanity).
 *  - days : 풀페이지 패턴. 1~7 범위.
 *  - limit: 서버 하드캡 50 (CONTEXT D6). 미지정/초과/음수는 50 으로 정규화 (Phase 7 news clamp 패턴).
 *
 * 우선순위: hours 가 명시되면 hours, 그 외에는 days (없으면 default 7).
 *
 * .transform() 으로 `windowMs` 단일 정수로 변환 — 핸들러는 since = now - windowMs 만 계산.
 */
export const DiscussionListQuery = z
  .object({
    hours: z.coerce.number().int().min(1).max(720).optional(),
    days: z.coerce.number().int().min(1).max(7).optional(),
    limit: z.coerce
      .number()
      .int()
      .optional()
      .transform((v) => {
        if (v == null || !Number.isFinite(v) || v < 1) return 50;
        if (v > 50) return 50;
        return v;
      }),
  })
  .transform((q) => {
    if (q.hours != null) {
      return { windowMs: q.hours * 3600_000, limit: q.limit };
    }
    const days = q.days ?? 7;
    return { windowMs: days * 86400_000, limit: q.limit };
  });
export type DiscussionListQueryT = z.infer<typeof DiscussionListQuery>;
