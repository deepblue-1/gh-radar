import { z } from "zod";

export const StockCodeParam = z.object({
  code: z.string().regex(/^[A-Za-z0-9]{1,10}$/, "invalid stock code"),
});
export type StockCodeParamT = z.infer<typeof StockCodeParam>;

/**
 * 사용자 입력을 reject 하지 않고 상한으로 clamp (plan must_haves "limit 200 → 100 으로 clamp").
 * - days: [1, 7] 범위로 clamp, default 7
 * - limit: [1, 100] 범위로 clamp, default 100
 * 음수/0/NaN 은 default 로 대체.
 */
export const NewsListQuery = z.object({
  days: z.coerce
    .number()
    .int()
    .optional()
    .transform((v) => {
      if (v == null || !Number.isFinite(v) || v < 1) return 7;
      if (v > 7) return 7;
      return v;
    }),
  limit: z.coerce
    .number()
    .int()
    .optional()
    .transform((v) => {
      if (v == null || !Number.isFinite(v) || v < 1) return 100;
      if (v > 100) return 100;
      return v;
    }),
});
export type NewsListQueryT = z.infer<typeof NewsListQuery>;
