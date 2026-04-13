import { z } from "zod";

export const ScannerQuery = z.object({
  market: z.enum(["KOSPI", "KOSDAQ", "ALL"]).default("ALL"),
  minRate: z.coerce.number().optional(),
  sort: z
    .enum(["rate_desc", "rate_asc", "volume_desc"])
    .default("rate_desc"),
  limit: z.coerce.number().int().min(1).max(10000).optional(),
});

export type ScannerQueryT = z.infer<typeof ScannerQuery>;
