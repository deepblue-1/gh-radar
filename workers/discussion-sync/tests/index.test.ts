import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Phase 08.1 Plan 03 T-04 — cycle 통합 테스트 (classify hook).
 *
 * 검증:
 *  1. upsert 직후 미분류 row 만 classifyBatch 로 전달
 *  2. 성공 라벨이 Supabase update({relevance, classified_at}) 로 반영
 *  3. cycle summary 로그에 totalClassified 포함
 *
 * 전략: 외부 I/O 하드 모듈(proxy / Bright Data / collectDiscussions / loadTargets /
 * apiUsage / runRetention) 전부 vi.mock → 단일 종목 시나리오 최소 재현.
 *
 * vi.mock 는 파일 top 으로 hoisted 되므로 factory 내부 사용 변수는 vi.hoisted 로 선언.
 */

const hoist = vi.hoisted(() => {
  const mockCreate = vi.fn();
  const upsertSelectMock = vi.fn();
  const upsertMock = vi.fn();
  const updateEqMock = vi.fn();
  const updateMock = vi.fn();
  const updateCalls: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const infoCalls: Array<{ obj: Record<string, unknown>; msg: string }> = [];

  updateMock.mockReturnValue({ eq: updateEqMock });
  upsertMock.mockReturnValue({ select: upsertSelectMock });
  updateEqMock.mockImplementation(async (_col: string, value: string) => {
    const lastPayload = (updateMock.mock.calls.at(-1)?.[0] ?? {}) as Record<
      string,
      unknown
    >;
    updateCalls.push({ id: value, payload: lastPayload });
    return { data: null, error: null };
  });

  const mockRows = [
    {
      stock_code: "005930",
      post_id: "p1",
      title: "차트 지지선 이탈",
      body: "거래량 급증",
      author: "user",
      posted_at: "2026-04-22T00:00:00+09:00",
      scraped_at: "2026-04-22T00:00:00Z",
    },
  ];

  return {
    mockCreate,
    upsertSelectMock,
    upsertMock,
    updateEqMock,
    updateMock,
    updateCalls,
    infoCalls,
    mockRows,
  };
});

// === Anthropic SDK mock ===
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: hoist.mockCreate },
  })),
}));

// === collectDiscussions — 고정 row 1건 반환 ===
vi.mock("../src/pipeline/collectDiscussions", () => ({
  collectDiscussions: vi.fn().mockResolvedValue({
    rows: hoist.mockRows,
    mode: "incremental",
    requests: 1,
    filteredByCutoff: 0,
    parsedCount: 1,
  }),
}));

// === loadTargets — 단일 종목 ===
vi.mock("../src/pipeline/targets", () => ({
  loadTargets: vi.fn().mockResolvedValue([{ code: "005930", name: "삼성전자" }]),
}));

// === apiUsage — budget check/increment 고정 ===
vi.mock("../src/apiUsage", () => ({
  kstDateString: vi.fn().mockReturnValue("2026-04-22"),
  checkBudget: vi.fn().mockResolvedValue(0),
  incrementUsage: vi.fn().mockResolvedValue(1),
}));

// === retention — no-op ===
vi.mock("../src/retention", () => ({
  runRetention: vi.fn().mockResolvedValue(0),
}));

// === proxy client — axios instance stub ===
vi.mock("../src/proxy/client", () => ({
  createProxyClient: vi.fn().mockReturnValue({}),
}));

// === Supabase client mock ===
vi.mock("../src/services/supabase", () => ({
  createSupabaseClient: vi.fn().mockImplementation(() => ({
    from: vi.fn(() => ({
      upsert: hoist.upsertMock,
      update: hoist.updateMock,
    })),
    rpc: vi.fn(),
  })),
}));

// === logger spy ===
vi.mock("../src/logger", () => {
  const logChild: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    child: ReturnType<typeof vi.fn>;
  } = {
    info: vi.fn((obj: Record<string, unknown>, msg: string) => {
      hoist.infoCalls.push({ obj, msg });
    }),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logChild.child.mockReturnValue(logChild);
  return { createLogger: vi.fn(() => logChild) };
});

// 싱글톤 리셋 — Anthropic client 캐시 제거
import { __resetAnthropicClientForTests } from "../src/classify/anthropic";
import { runDiscussionSyncCycle } from "../src/index";

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-anth";
  process.env.SUPABASE_URL = "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sr";
  process.env.BRIGHTDATA_API_KEY = "bd";
  process.env.DISCUSSION_SYNC_CLASSIFY_CONCURRENCY = "5";
  hoist.updateCalls.length = 0;
  hoist.infoCalls.length = 0;
  hoist.mockCreate.mockReset();
  hoist.mockCreate.mockResolvedValue({
    content: [{ type: "text", text: "price_reason" }],
  });
  hoist.upsertMock.mockClear();
  hoist.upsertSelectMock.mockReset();
  hoist.upsertSelectMock.mockResolvedValue({
    data: [
      {
        id: "row-1",
        title: "차트 지지선 이탈",
        body: "거래량 급증",
        relevance: null,
        classified_at: null,
      },
    ],
    error: null,
  });
  hoist.updateMock.mockClear();
  hoist.updateEqMock.mockClear();
  __resetAnthropicClientForTests();
});

describe("Phase 08.1 classify hook — cycle 통합", () => {
  it("upsert 직후 미분류 row 를 분류 → Supabase update 로 반영 → summary 에 totalClassified=1", async () => {
    await runDiscussionSyncCycle();

    // 1. Anthropic 호출
    expect(hoist.mockCreate).toHaveBeenCalledTimes(1);

    // 2. Supabase update({relevance:'price_reason', classified_at:<iso>}).eq('id','row-1')
    expect(hoist.updateCalls).toHaveLength(1);
    expect(hoist.updateCalls[0].id).toBe("row-1");
    expect(hoist.updateCalls[0].payload.relevance).toBe("price_reason");
    expect(typeof hoist.updateCalls[0].payload.classified_at).toBe("string");
    // ISO timestamp 포맷 확인 (Date.toISOString → '2026-...Z')
    expect(String(hoist.updateCalls[0].payload.classified_at)).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );

    // 3. cycle summary log 에 totalClassified 필드
    const cycleSummary = hoist.infoCalls.find(
      (c) => c.msg === "discussion-sync cycle complete",
    );
    expect(cycleSummary).toBeDefined();
    expect(cycleSummary?.obj.totalClassified).toBe(1);
    expect(cycleSummary?.obj.totalUpserted).toBe(1);

    // 4. per-stock done log 에 classified / unclassified 필드
    const perStock = hoist.infoCalls.find((c) => c.msg === "per-stock done");
    expect(perStock).toBeDefined();
    expect(perStock?.obj.classified).toBe(1);
    expect(perStock?.obj.unclassified).toBe(1);
  });
});
