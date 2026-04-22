import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";

/**
 * Phase 08.1 Plan 04 T-02 — POST /refresh inline classify 통합 테스트.
 *
 * 시나리오:
 *   1) classifyAndPersist spy 호출 (신규 upsert 행 분류)
 *   2) ANTHROPIC_API_KEY 미설정(config 에서 null) 시에도 refresh 200
 *      — classifyAndPersist 는 내부 graceful no-op 으로 호출되어도 무방.
 *   3) refresh 응답 Discussion[] 에 relevance / classifiedAt 필드 존재
 *
 * Note: classify 모듈은 module-scope vi.mock 으로 spy 교체.
 * Supabase mock 은 기존 discussions.test.ts chainable mock 패턴 참조 +
 * upsert().select() 반환값을 명시적으로 제공.
 */

// classify 모듈 전체를 spy 로 교체 — 실제 Anthropic API 호출 차단.
const classifySpy = vi.fn(async (_s: unknown, _rows: unknown[]) => 0);
vi.mock("../../src/services/discussion-classify", () => ({
  classifyAndPersist: (...args: unknown[]) => classifySpy(args[0], args[1] as unknown[]),
  __resetAnthropicClientForTests: () => {},
}));

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
    id: "d-1",
    stock_code: "005930",
    post_id: "900001",
    title: "삼성전자 1분기 실적 기대감",
    body: "컨센 상회 전망",
    author: "abc****",
    posted_at: "2026-04-22T02:00:00+00:00",
    scraped_at: "2026-04-22T05:00:00+00:00",
    relevance: "price_reason",
    classified_at: "2026-04-22T05:00:10+00:00",
    ...overrides,
  };
}

/**
 * upsert().select() chain 이 미분류 신규 행 배열을 반환하도록 구성한 Supabase mock.
 *
 * - master (stocks): { code }
 * - cooldown probe (discussions.scraped_at maybeSingle): scraped_at 11분 전(캐시 만료)
 * - upsert → select('id,title,body,classified_at') → upsertedRows 반환
 * - 24h 최종 select (5건) → finalRows 반환 (응답)
 */
function makeSupabase(options: {
  upsertedRows?: Array<Pick<SnakeRow, "id" | "title" | "body" | "classified_at">>;
  finalRows?: SnakeRow[];
  masterExists?: boolean;
}) {
  const upsertedRows = options.upsertedRows ?? [];
  const finalRows = options.finalRows ?? [];
  const masterExists = options.masterExists ?? true;
  const oldScrapedAt = new Date(Date.now() - 11 * 60_000).toISOString();

  const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });

  const supabase = {
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.gte = vi.fn().mockReturnValue(chain);
      chain.lt = vi.fn().mockReturnValue(chain);
      chain.order = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn(() => {
        const limitedChain: Record<string, unknown> = {
          ...chain,
          then: (resolve: (v: unknown) => unknown) =>
            resolve({ data: finalRows, error: null }),
          maybeSingle: vi.fn(() => {
            if (table === "stocks") {
              return Promise.resolve({
                data: masterExists ? { code: "005930" } : null,
                error: null,
              });
            }
            if (table === "discussions") {
              // scraped_at probe (cooldown/cache) — 11분 전으로 두 단계 모두 통과
              return Promise.resolve({
                data: { scraped_at: oldScrapedAt },
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: null });
          }),
        };
        return limitedChain;
      });
      chain.maybeSingle = vi.fn(() => {
        if (table === "stocks") {
          return Promise.resolve({
            data: masterExists ? { code: "005930" } : null,
            error: null,
          });
        }
        if (table === "discussions") {
          return Promise.resolve({
            data: { scraped_at: oldScrapedAt },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      });
      // upsert().select(...) — select 가 Promise-like 를 반환.
      chain.upsert = vi.fn(() => {
        const upsertSelect: Record<string, unknown> = {
          then: (resolve: (v: unknown) => unknown) =>
            resolve({ data: upsertedRows, error: null }),
        };
        return {
          select: vi.fn().mockReturnValue(upsertSelect),
          then: (resolve: (v: unknown) => unknown) =>
            resolve({ data: [], error: null }),
        };
      });
      chain.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: finalRows, error: null });
      return chain;
    }),
    rpc,
  };
  return supabase;
}

function makeBrightDataClient(payload: unknown) {
  return {
    post: vi.fn().mockResolvedValue({
      data: JSON.stringify(payload),
    }),
  };
}

function naverJson(overrides: Partial<{ posts: unknown[] }> = {}) {
  return {
    pageSize: 50,
    posts: [
      {
        id: "900001",
        itemCode: "005930",
        itemName: "삼성전자",
        postType: "normal",
        writer: { nickname: "abc****" },
        writtenAt: "2026.04.22 11:00",
        title: "삼성전자 1분기 실적 기대감",
        contentSwReplacedButImg: "컨센 상회 전망",
        replyDepth: 0,
        commentCount: 0,
        recommendCount: 0,
        isCleanbotPassed: true,
      },
    ],
    ...overrides,
  };
}

type AppDepsLoose = Parameters<typeof createApp>[0];

function makeApp(deps: {
  supabase: ReturnType<typeof makeSupabase>;
  brightdataClient?: { post: ReturnType<typeof vi.fn> };
  brightdataApiKey?: string;
  brightdataZone?: string;
}) {
  return createApp({
    supabase: deps.supabase as unknown as AppDepsLoose["supabase"],
    brightdataClient: deps.brightdataClient as unknown as
      | AppDepsLoose["brightdataClient"]
      | undefined,
    brightdataApiKey: deps.brightdataApiKey,
    brightdataZone: deps.brightdataZone ?? "gh_radar_naver",
  });
}

beforeEach(() => {
  classifySpy.mockReset();
  classifySpy.mockResolvedValue(0);
});

describe("POST /api/stocks/:code/discussions/refresh — inline classify (Phase 08.1 Plan 04)", () => {
  it("C-01 upsert 직후 미분류 행에 대해 classifyAndPersist 가 호출된다", async () => {
    classifySpy.mockResolvedValue(1);
    const supabase = makeSupabase({
      upsertedRows: [
        { id: "d-1", title: "삼성전자 1분기 실적 기대감", body: "컨센 상회 전망", classified_at: null },
      ],
      finalRows: [snakeRow()],
    });
    const app = makeApp({
      supabase,
      brightdataClient: makeBrightDataClient(naverJson()),
      brightdataApiKey: "k",
    });
    const res = await request(app).post(
      "/api/stocks/005930/discussions/refresh",
    );
    expect(res.status).toBe(200);
    expect(classifySpy).toHaveBeenCalledTimes(1);
    const [, rowsArg] = classifySpy.mock.calls[0]!;
    expect(Array.isArray(rowsArg)).toBe(true);
    expect((rowsArg as Array<{ id: string }>)[0]?.id).toBe("d-1");
  });

  it("C-02 ANTHROPIC_API_KEY 없을 때 refresh 는 200 — classify no-op 이어도 성공", async () => {
    // spy 가 0 을 반환해 no-op 시뮬레이션 (실제 config 경로는 서비스 모듈 내부에서 graceful warn + return 0)
    classifySpy.mockResolvedValue(0);
    const supabase = makeSupabase({
      upsertedRows: [
        { id: "d-1", title: "t", body: "b", classified_at: null },
      ],
      finalRows: [snakeRow()],
    });
    const app = makeApp({
      supabase,
      brightdataClient: makeBrightDataClient(naverJson()),
      brightdataApiKey: "k",
    });
    const res = await request(app).post(
      "/api/stocks/005930/discussions/refresh",
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // classify 가 0 반환(no-op)해도 응답 자체는 정상이어야 함
    expect(classifySpy).toHaveBeenCalled();
  });

  it("C-03 refresh 응답의 Discussion[] 에 relevance / classifiedAt 필드가 노출된다", async () => {
    classifySpy.mockResolvedValue(1);
    const supabase = makeSupabase({
      upsertedRows: [
        { id: "d-1", title: "삼성전자 1분기 실적 기대감", body: "컨센 상회 전망", classified_at: null },
      ],
      finalRows: [snakeRow({ relevance: "price_reason", classified_at: "2026-04-22T05:00:10+00:00" })],
    });
    const app = makeApp({
      supabase,
      brightdataClient: makeBrightDataClient(naverJson()),
      brightdataApiKey: "k",
    });
    const res = await request(app).post(
      "/api/stocks/005930/discussions/refresh",
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      stockCode: "005930",
      postId: "900001",
      relevance: "price_reason",
      classifiedAt: "2026-04-22T05:00:10+00:00",
    });
  });
});
