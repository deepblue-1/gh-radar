import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";

/**
 * Phase 08.1 Plan 02 Task 3 — server discussions `filter` 통합 테스트.
 *
 * DISC-01.1 의 "서버 필터링" 계층 회귀 방지:
 *   - Test 1: filter 미지정 / filter=all → 기존 동작 유지, or() 체인 미호출, 응답에 relevance/classifiedAt 필드 존재.
 *   - Test 2: filter=meaningful → q.or('relevance.is.null,relevance.neq.noise') 체인 발화.
 *   - Test 3: filter=foo → 400 INVALID_QUERY_PARAM (Zod enum reject).
 *
 * NOTE: plan 은 `server/src/routes/__tests__/discussions.filter.test.ts` 경로를 제안했으나
 *       기존 프로젝트 패턴은 `server/tests/routes/*.test.ts` (7개 파일 선례 존재).
 *       CLAUDE.md 의 "기존 패턴 follow" 원칙에 따라 후자로 배치. — 2026-04-22 deviation
 */

type SnakeRow = {
  id: string;
  stock_code: string;
  post_id: string;
  title: string;
  body: string | null;
  author: string | null;
  posted_at: string;
  scraped_at: string;
  relevance: string | null;
  classified_at: string | null;
};

function snakeRow(overrides: Partial<SnakeRow> = {}): SnakeRow {
  return {
    id: "d1",
    stock_code: "005930",
    post_id: "272617128",
    title: "삼성전자 1분기 실적 기대감",
    body: "1분기 영업이익 시장 컨센서스 상회",
    author: "abc****",
    posted_at: "2026-04-17T05:32:00+00:00",
    scraped_at: "2026-04-17T05:40:00+00:00",
    relevance: null,
    classified_at: null,
    ...overrides,
  };
}

/**
 * discussions.test.ts 의 chainable mock 구조에 `or()` chain 을 추가한 확장 버전.
 *
 * ⚠ Plan 08.1-02 T-02 는 GET 핸들러에서:
 *    q = q.gte(...);
 *    if (filter === 'meaningful') q = q.or(...);   // ← 이 라인이 spy 대상
 *    q = q.order(...).limit(limit);
 *    if (before) q = q.lt(..);
 *    const { data, error } = await q;
 *
 * 따라서 mock 은 eq/gte/or/order/limit/lt 모두 chainable + `limit` 이 최종 thenable 을 반환.
 */
function makeSupabase(overrides: Record<string, unknown> = {}) {
  const orSpy = vi.fn();

  const api = {
    orSpy,
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.gte = vi.fn().mockReturnValue(chain);
      chain.lt = vi.fn().mockReturnValue(chain);
      chain.or = vi.fn((arg: string) => {
        orSpy(arg);
        return chain;
      });
      chain.order = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn((n: number) => {
        const dataset =
          (overrides[`${table}.list`] as unknown[] | undefined) ?? [];
        const limited = dataset.slice(0, n);
        const limitedChain: Record<string, unknown> = {
          ...chain,
          then: (resolve: (v: unknown) => unknown) =>
            resolve({ data: limited, error: null }),
          maybeSingle: vi.fn(() => {
            const key = `${table}.single`;
            const data = (overrides[key] as unknown) ?? null;
            return Promise.resolve({ data, error: null });
          }),
        };
        return limitedChain;
      });
      chain.maybeSingle = vi.fn(() => {
        const key = `${table}.single`;
        const data = (overrides[key] as unknown) ?? null;
        return Promise.resolve({ data, error: null });
      });
      chain.upsert = vi.fn().mockResolvedValue({ data: [], error: null });
      chain.then = (resolve: (v: unknown) => unknown) => {
        const dataset =
          (overrides[`${table}.list`] as unknown[] | undefined) ?? [];
        return resolve({ data: dataset, error: null });
      };
      return chain;
    }),
    rpc: vi.fn().mockResolvedValue({ data: 1, error: null }),
  };
  return api;
}

type AppDepsLoose = Parameters<typeof createApp>[0];

function makeApp(supabase: ReturnType<typeof makeSupabase>) {
  return createApp({
    supabase: supabase as unknown as AppDepsLoose["supabase"],
  });
}

describe("GET /api/stocks/:code/discussions (Phase 08.1 filter)", () => {
  it("filter 미지정 (filter=all 정규화) → or() 체인 미호출 + 응답에 relevance/classifiedAt 필드 존재", async () => {
    const row = snakeRow({
      relevance: "price_reason",
      classified_at: "2026-04-21T10:00:00+00:00",
    });
    const supabase = makeSupabase({
      "stocks.single": { code: "005930" },
      "discussions.list": [row],
    });
    const app = makeApp(supabase);
    const res = await request(app).get(
      "/api/stocks/005930/discussions?days=1&limit=50",
    );
    expect(res.status).toBe(200);
    expect(supabase.orSpy).not.toHaveBeenCalled();
    expect(res.body.items).toHaveLength(1);
    // camelCase 노출 확인
    expect(res.body.items[0]).toHaveProperty("relevance", "price_reason");
    expect(res.body.items[0]).toHaveProperty("classifiedAt", "2026-04-21T10:00:00+00:00");
  });

  it("filter=all 명시 → or() 체인 미호출 (filter 미지정과 동일)", async () => {
    const supabase = makeSupabase({
      "stocks.single": { code: "005930" },
      "discussions.list": [snakeRow()],
    });
    const app = makeApp(supabase);
    const res = await request(app).get(
      "/api/stocks/005930/discussions?days=1&limit=50&filter=all",
    );
    expect(res.status).toBe(200);
    expect(supabase.orSpy).not.toHaveBeenCalled();
  });

  it("filter=meaningful → or('relevance.is.null,relevance.neq.noise') 체인 발화", async () => {
    // mock 에서 쿼리 결과는 relevance != 'noise' 인 행들만 모사 (실제 supabase filter 는 DB 책임).
    const rows = [
      snakeRow({ id: "d-a", post_id: "p-a", relevance: null, classified_at: null }),
      snakeRow({
        id: "d-b",
        post_id: "p-b",
        relevance: "price_reason",
        classified_at: "2026-04-21T10:00:00+00:00",
      }),
    ];
    const supabase = makeSupabase({
      "stocks.single": { code: "005930" },
      "discussions.list": rows,
    });
    const app = makeApp(supabase);
    const res = await request(app).get(
      "/api/stocks/005930/discussions?filter=meaningful&days=1&limit=50",
    );
    expect(res.status).toBe(200);
    expect(supabase.orSpy).toHaveBeenCalledWith(
      "relevance.is.null,relevance.neq.noise",
    );
    // 응답 payload 에 relevance='noise' 행 없음 (mock 데이터에서 이미 걸러짐)
    expect(
      res.body.items.every(
        (d: { relevance: string | null }) => d.relevance !== "noise",
      ),
    ).toBe(true);
  });

  it("filter=foo → 400 INVALID_QUERY_PARAM (Zod enum reject)", async () => {
    const supabase = makeSupabase({
      "stocks.single": { code: "005930" },
    });
    const app = makeApp(supabase);
    const res = await request(app).get(
      "/api/stocks/005930/discussions?filter=foo",
    );
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe("INVALID_QUERY_PARAM");
  });
});
