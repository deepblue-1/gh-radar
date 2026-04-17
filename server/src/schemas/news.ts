import { z } from "zod";

export const StockCodeParam = z.object({
  code: z.string().regex(/^[A-Za-z0-9]{1,10}$/, "invalid stock code"),
});
export type StockCodeParamT = z.infer<typeof StockCodeParam>;

export const NewsListQuery = z.object({
  days: z.coerce.number().int().min(1).max(7).default(7),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});
export type NewsListQueryT = z.infer<typeof NewsListQuery>;
