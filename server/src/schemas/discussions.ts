import { z } from "zod";

/**
 * Phase 08 + 08.1 — server discussions route input validation.
 *
 * 종목 코드는 stocks 마스터 그대로 (Phase 7 news 와 동일 정책: 영숫자 1~10자).
 * 한국 종목 6자리뿐 아니라 ETF/ETN/ELW 등 다양한 영숫자 코드도 수용.
 *
 * Phase 08.1 — DiscussionListQuery 에 `filter: 'all' | 'meaningful'` 추가.
 *  - `all`         : 기존 동작 (전체 반환).
 *  - `meaningful`  : relevance IS NULL OR relevance != 'noise' — AI 분류 전/분류 완료 행 중 noise 제외.
 *  - 미지정        : transform 이후 `'all'` 로 정규화.
 *  - 그 외 값      : Zod enum reject → 400.
 */
export const StockCodeParam = z.object({
  code: z.string().regex(/^[A-Za-z0-9]{1,10}$/, "invalid stock code"),
});
export type StockCodeParamT = z.infer<typeof StockCodeParam>;

/**
 * Phase 08 — Discussion list query (`hours` | `days` | `limit` | `before`).
 *
 *  - hours: 상세 Card 패턴 (기본 24시간 단위 노출). 1~720 범위 (30일 ceiling sanity).
 *  - days : 풀페이지 패턴. 1~7 범위.
 *  - limit: 서버 하드캡 50 (CONTEXT D6). 미지정/초과/음수는 50 으로 정규화 (Phase 7 news clamp 패턴).
 *  - before: 무한 스크롤 cursor — ISO 8601 timestamp. 응답에서 `posted_at < before` 인 글만 반환.
 *           webapp 풀페이지가 마지막 글의 postedAt 을 다음 호출에 전달.
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
    before: z
      .string()
      .datetime({ offset: true })
      .optional(),
    filter: z.enum(['all', 'meaningful']).optional(),
  })
  .transform((q) => {
    const base = q.hours != null
      ? { windowMs: q.hours * 3600_000, limit: q.limit }
      : { windowMs: (q.days ?? 7) * 86400_000, limit: q.limit };
    return { ...base, before: q.before, filter: q.filter ?? 'all' };
  });
/**
 * NOTE: `filter` 필드는 z.infer 로 자동 파생 — 명시 변경 불필요.
 *   transform 이후 `'all' | 'meaningful'` 로 정규화됨 (undefined 없음).
 */
export type DiscussionListQueryT = z.infer<typeof DiscussionListQuery>;
