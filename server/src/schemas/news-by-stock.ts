import { z } from "zod";
import {
  SHORT_CODE_RE,
  NEWS_BY_STOCK_MAX_CODES,
  STOCK_FEED_DEFAULT_DAYS,
  STOCK_FEED_MAX_DAYS,
  STOCK_FEED_DEFAULT_LIMIT,
  STOCK_FEED_MAX_LIMIT,
} from "@gh-radar/shared";

/** 범위 밖 · 비정수 · 빈 값은 거부하지 않고 잘라 맞춘다(news.ts NewsListQuery 꼴). */
function clampInt(def: number, max: number) {
  return z.coerce
    .number()
    .int()
    .optional()
    .transform((v) => {
      if (v == null || !Number.isFinite(v) || v < 1) return def;
      if (v > max) return max;
      return v;
    });
}

/**
 * Phase 41 D-04 · D-08 — `GET /api/news/by-stock?codes=005930,0011T0,…&days=3&limit=20`.
 *
 * - codes: 쉼표 구분 · 각 `SHORT_CODE_RE`(영문 포함 6자 — 2025~ 신규 코드 · themes by-stock 의 숫자 6자리 규칙을 따르지 않는다) ·
 *   1 ~ NEWS_BY_STOCK_MAX_CODES · 중복은 한 번(입력 순서 유지 — 응답 순서 = 입력 순서). 빈 조각 · 형식 위반 · 초과는 400.
 * - days: 1 ~ 7 잘라 맞춤 · 기본 3(D-08). limit: 종목당 1 ~ 100 잘라 맞춤 · 기본 20.
 */
export const NewsByStockQuery = z.object({
  codes: z
    .string()
    .min(1)
    .transform((raw) => raw.split(","))
    .pipe(z.array(z.string().regex(SHORT_CODE_RE, "6자 종목코드(숫자 · 대문자 영문)")).min(1).max(NEWS_BY_STOCK_MAX_CODES))
    .transform((codes) => [...new Set(codes)]),
  days: clampInt(STOCK_FEED_DEFAULT_DAYS, STOCK_FEED_MAX_DAYS),
  limit: clampInt(STOCK_FEED_DEFAULT_LIMIT, STOCK_FEED_MAX_LIMIT),
});

export type NewsByStockQueryT = z.infer<typeof NewsByStockQuery>;
