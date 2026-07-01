import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Phase 13 Plan 02 Task 2 — clusterSurges (Claude 1x 클러스터 + resolve/sort/classify).
 *
 * SDK mock 패턴 (theme-sync/tests/ai.test.ts 계승): @anthropic-ai/sdk default 를 vi.mock 으로
 * 교체(실 API 호출 0). messages.create 는 vi.hoisted mock 으로 응답 주입.
 * __resetAnthropicClientForTests 로 싱글톤 reset.
 *
 * 검증:
 *   - ```json 펜스 응답 파싱 (extractJsonObject 펜스 가드 동작).
 *   - newsRefs out-of-range 인덱스 drop (D-04 anti-hallucination).
 *   - 급등 집합 밖 stockCode drop (D-06 unknown-code).
 *   - <2 valid stockCode 테마 → singles 강등 (D-06).
 *   - sortThemes: stockCodes.length desc → tie 시 avg changeRate desc (D-05).
 *   - empty surges → Claude 호출 0 (short-circuit).
 */

const hoist = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: hoist.mockCreate },
  })),
}));

import {
  clusterSurges,
  resolveNewsRefs,
  sortThemes,
  demoteInvalidThemes,
} from "./clusterSurges";
import { __resetAnthropicClientForTests } from "./anthropic";
import type { Surge } from "../pipeline/loadSurges";
import type { HomeSyncConfig } from "../config";

function cfg(over: Partial<HomeSyncConfig> = {}): HomeSyncConfig {
  return {
    supabaseUrl: "https://x.supabase.co",
    supabaseServiceRoleKey: "svc",
    anthropicApiKey: "test-anth",
    classifyModel: "claude-haiku-4-5",
    surgeThreshold: 20,
    newsPerStock: 5,
    surgeMax: 80,
    appVersion: "test",
    logLevel: "silent",
    ...over,
  };
}

function surge(code: string, changeRate: number, news: string[] = []): Surge {
  return {
    code,
    name: `종목-${code}`,
    changeRate,
    news: news.map((id) => ({
      id,
      stock_code: code,
      title: `제목-${id}`,
      url: `https://n/${id}`,
      source: "출처",
      published_at: "2026-07-01T00:00:00Z",
    })),
  };
}

/** messages.create 응답 헬퍼 — content[0].text 에 텍스트. */
function textResponse(text: string) {
  return { content: [{ type: "text", text }] };
}

beforeEach(() => {
  process.env.SUPABASE_URL = "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sr";
  process.env.ANTHROPIC_API_KEY = "test-anth";
  hoist.mockCreate.mockReset();
  __resetAnthropicClientForTests();
});

// ── 순수함수 유닛 ─────────────────────────────────────────────────────────────

describe("resolveNewsRefs (D-04 anti-hallucination)", () => {
  const indexed = [
    { title: "T0", url: "u0", source: "s0" },
    { title: "T1", url: "u1", source: "s1" },
  ];
  it("인덱스를 verbatim 뉴스로 해석", () => {
    expect(resolveNewsRefs(indexed, [0, 1])).toEqual(indexed);
  });
  it("범위 밖 인덱스는 drop (환각 방어)", () => {
    expect(resolveNewsRefs(indexed, [0, 5, -1])).toEqual([indexed[0]]);
  });
  it("빈 refs → []", () => {
    expect(resolveNewsRefs(indexed, [])).toEqual([]);
  });
});

describe("demoteInvalidThemes (D-06 classify)", () => {
  const surgeCodes = new Set(["005930", "000660", "035420"]);
  it("급등 집합 밖 stockCode drop + <2 valid → singles 강등", () => {
    const { themes, demoted } = demoteInvalidThemes(
      [
        { name: "반도체", reason: "r", stockCodes: ["005930", "000660"], newsRefs: [] },
        { name: "잡음", reason: "r", stockCodes: ["005930", "999999"], newsRefs: [] },
      ],
      surgeCodes,
    );
    // 2 valid 테마 유지.
    expect(themes).toHaveLength(1);
    expect(themes[0].stockCodes).toEqual(["005930", "000660"]);
    // 1 valid 만 남은 테마 → 강등된 single (unknown 999999 drop).
    expect(demoted).toHaveLength(1);
    expect(demoted[0].stockCode).toBe("005930");
  });
});

describe("sortThemes (D-05 breadth sort)", () => {
  it("stockCodes.length desc → tie 시 avg changeRate desc", () => {
    const rateByCode = new Map<string, number>([
      ["a", 20],
      ["b", 22],
      ["c", 50],
      ["d", 51],
      ["e", 25],
    ]);
    const sorted = sortThemes(
      [
        { name: "T2", reason: null, stockCodes: ["a", "b"], newsRefs: [] }, // 2개, avg 21
        { name: "T3low", reason: null, stockCodes: ["a", "b", "e"], newsRefs: [] }, // 3개, avg ~22.3
        { name: "T3high", reason: null, stockCodes: ["c", "d", "e"], newsRefs: [] }, // 3개, avg ~42
      ],
      rateByCode,
    );
    // 3개 테마가 앞 (T3high avg 높으니 먼저), 그 뒤 2개 테마.
    expect(sorted.map((t) => t.name)).toEqual(["T3high", "T3low", "T2"]);
  });
});

// ── clusterSurges 통합 ────────────────────────────────────────────────────────

describe("clusterSurges", () => {
  it("빈 surges → Claude 호출 0 (short-circuit)", async () => {
    const payload = await clusterSurges([], cfg());
    expect(hoist.mockCreate).not.toHaveBeenCalled();
    expect(payload).toEqual({ themes: [], singles: [] });
  });

  it("```json 펜스 응답 파싱 + 뉴스 인덱스 해석 + out-of-range drop + unknown-code drop + <2 강등 + D-05 정렬", async () => {
    const surges = [
      surge("005930", 25, ["n0"]), // global index 0: n0
      surge("000660", 30, ["n1"]), // global index 1: n1
      surge("035420", 40, ["n2"]), // global index 2: n2
      surge("347700", 50, ["n3"]), // global index 3: n3
    ];
    // Claude 응답: 초전도체(2종목) + AI반도체(1 valid + unknown) + single 1건.
    // newsRefs 에 범위 밖(99) 포함 → drop 되어야.
    const resp = {
      themes: [
        {
          name: "반도체",
          reason: "메모리 강세",
          stockCodes: ["005930", "000660"],
          newsRefs: [0, 1, 99], // 99 는 범위 밖 → drop
        },
        {
          name: "AI",
          reason: "단독",
          stockCodes: ["035420", "999999"], // 999999 는 급등 집합 밖 → drop → 1 valid → 강등
          newsRefs: [2],
        },
      ],
      singles: [{ stockCode: "347700", reason: "개별 급등", newsRefs: [3] }],
    };
    hoist.mockCreate.mockResolvedValue(
      textResponse("```json\n" + JSON.stringify(resp) + "\n```"),
    );

    const payload = await clusterSurges(surges, cfg());

    expect(hoist.mockCreate).toHaveBeenCalledTimes(1);

    // 반도체 테마만 유지 (2 valid).
    expect(payload.themes).toHaveLength(1);
    expect(payload.themes[0].name).toBe("반도체");
    expect(payload.themes[0].stocks.map((s) => s.code)).toEqual([
      "005930",
      "000660",
    ]);
    // newsRefs out-of-range(99) drop → verbatim 2건만.
    expect(payload.themes[0].news).toHaveLength(2);
    expect(payload.themes[0].news[0].title).toBe("제목-n0");

    // AI 테마는 unknown drop 후 1 valid → single 강등. 347700 개별 급등도 single.
    const singleCodes = payload.singles.map((s) => s.code).sort();
    expect(singleCodes).toEqual(["035420", "347700"]);
  });

  it("Claude 예외 → fail-safe 빈 payload", async () => {
    hoist.mockCreate.mockRejectedValue(new Error("boom"));
    const payload = await clusterSurges([surge("005930", 25, ["n0"])], cfg());
    expect(payload).toEqual({ themes: [], singles: [] });
  });
});
