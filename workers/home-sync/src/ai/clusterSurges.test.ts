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
  reassignOrphans,
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

describe("reassignOrphans (고아 종목 테마 병합, 금호건설 fix)", () => {
  // surgeByCode: code → { name, changeRate }.
  const surgeByCode = new Map([
    ["014790", { name: "금호건설", changeRate: 29.9 }],
    ["053080", { name: "비나텍", changeRate: 25.0 }],
    ["005930", { name: "삼성전자", changeRate: 22.0 }],
    ["000660", { name: "SK하이닉스", changeRate: 21.0 }],
    ["347700", { name: "라파스", changeRate: 20.5 }],
  ]);

  it("테마 news 제목에 종목명 포함 → single 이 그 테마로 병합, singles 에서 제거", () => {
    const themes = [
      {
        name: "호남반도체",
        reason: "호남권 반도체 클러스터 조성 기대감",
        stockCodes: ["005930", "000660"],
        news: [
          { title: "호남권 상한가 랠리…삼성전자·금호건설 동반 강세", url: "u0", source: "s" },
        ],
      },
    ];
    const singles = [
      { stockCode: "014790", reason: "호남 개발 수주 기대", news: [] },
    ];
    const r = reassignOrphans(themes, singles, surgeByCode);
    // 금호건설이 호남반도체 테마 stockCodes 에 추가.
    expect(r.themes[0].stockCodes).toContain("014790");
    // singles 에서 사라짐.
    expect(r.singles.find((s) => s.stockCode === "014790")).toBeUndefined();
  });

  it("오병합 방지: 종목명이 어느 테마 news/reason 에도 없는 순수 single → 그대로 유지", () => {
    const themes = [
      {
        name: "호남반도체",
        reason: "호남권 반도체 클러스터",
        stockCodes: ["005930", "000660"],
        news: [{ title: "삼성전자·SK하이닉스 반도체 강세", url: "u0", source: "s" }],
      },
    ];
    const singles = [{ stockCode: "347700", reason: "마이크로니들 계약", news: [] }];
    const r = reassignOrphans(themes, singles, surgeByCode);
    expect(r.themes[0].stockCodes).not.toContain("347700");
    expect(r.singles.find((s) => s.stockCode === "347700")).toBeDefined();
  });

  it("다중 후보 tie-break: 두 테마 news 에 이름 등장 → reason 토큰 겹침 큰 쪽", () => {
    const themes = [
      {
        name: "반도체소재",
        reason: "반도체 소재 국산화 수혜",
        stockCodes: ["005930", "000660"],
        news: [{ title: "반도체 랠리 속 비나텍 편승", url: "u0", source: "s" }],
      },
      {
        name: "슈퍼커패시터",
        reason: "비나텍 슈퍼커패시터 전기차 공급 확대 기대",
        stockCodes: ["005930", "347700"],
        news: [{ title: "슈퍼커패시터 대장주 비나텍 부각", url: "u1", source: "s" }],
      },
    ];
    // single reason 토큰이 슈퍼커패시터 테마와 겹침(슈퍼커패시터, 전기차).
    const singles = [
      { stockCode: "053080", reason: "슈퍼커패시터 전기차 공급 확대", news: [] },
    ];
    const r = reassignOrphans(themes, singles, surgeByCode);
    const superTheme = r.themes.find((t) => t.name === "슈퍼커패시터")!;
    const sojaeTheme = r.themes.find((t) => t.name === "반도체소재")!;
    expect(superTheme.stockCodes).toContain("053080");
    expect(sojaeTheme.stockCodes).not.toContain("053080");
    expect(r.singles.find((s) => s.stockCode === "053080")).toBeUndefined();
  });

  it("겹침 0 동률 다중 후보 → 애매하므로 single 유지 (오병합 방지)", () => {
    const themes = [
      {
        name: "테마A",
        reason: "관련 기대감 급등",
        stockCodes: ["005930", "000660"],
        news: [{ title: "금호건설 급등", url: "u0", source: "s" }],
      },
      {
        name: "테마B",
        reason: "상한가 종목 오늘",
        stockCodes: ["347700", "005930"],
        news: [{ title: "금호건설 상한가", url: "u1", source: "s" }],
      },
    ];
    // single reason 이 범용어뿐 → 두 테마 모두 토큰 겹침 0 → 애매 → single 유지.
    const singles = [{ stockCode: "014790", reason: "오늘 급등 기대감", news: [] }];
    const r = reassignOrphans(themes, singles, surgeByCode);
    expect(r.themes[0].stockCodes).not.toContain("014790");
    expect(r.themes[1].stockCodes).not.toContain("014790");
    expect(r.singles.find((s) => s.stockCode === "014790")).toBeDefined();
  });

  it("유일 후보 + 종목명 등장 → 겹침 0 이어도 병합 (정밀 신호)", () => {
    const themes = [
      {
        name: "호남개발",
        reason: "호남권 산업단지 조성",
        stockCodes: ["005930", "000660"],
        news: [{ title: "금호건설 상한가", url: "u0", source: "s" }],
      },
    ];
    const singles = [{ stockCode: "014790", reason: "오늘 급등", news: [] }];
    const r = reassignOrphans(themes, singles, surgeByCode);
    expect(r.themes[0].stockCodes).toContain("014790");
    expect(r.singles.find((s) => s.stockCode === "014790")).toBeUndefined();
  });

  it("reason 텍스트에 종목명 포함 (news 없어도) → 병합", () => {
    const themes = [
      {
        name: "2차전지",
        reason: "비나텍 등 2차전지 소재주 동반 강세",
        stockCodes: ["005930", "000660"],
        news: [],
      },
    ];
    const singles = [{ stockCode: "053080", reason: "2차전지 소재 강세", news: [] }];
    const r = reassignOrphans(themes, singles, surgeByCode);
    expect(r.themes[0].stockCodes).toContain("053080");
    expect(r.singles.find((s) => s.stockCode === "053080")).toBeUndefined();
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

  it("고아 종목 병합 통합: 테마 news 제목에 등장한 강등 single → 그 테마로 재귀속", async () => {
    // 금호건설(014790)이 Claude 로부터 1종목 테마로 나와 강등되지만,
    // 호남반도체 테마 news 제목에 "금호건설" 이 등장 → reassignOrphans 로 병합.
    const surges = [
      { code: "005930", name: "삼성전자", changeRate: 25, news: [{ id: "n0", stock_code: "005930", title: "호남권 상한가…금호건설 동반 강세", url: "https://n/n0", source: "출처", published_at: "2026-07-01T00:00:00Z" }] },
      { code: "000660", name: "SK하이닉스", changeRate: 24, news: [{ id: "n1", stock_code: "000660", title: "SK하이닉스 반도체 강세", url: "https://n/n1", source: "출처", published_at: "2026-07-01T00:00:00Z" }] },
      { code: "014790", name: "금호건설", changeRate: 29.9, news: [{ id: "n2", stock_code: "014790", title: "금호건설 상한가 직행", url: "https://n/n2", source: "출처", published_at: "2026-07-01T00:00:00Z" }] },
    ];
    const resp = {
      themes: [
        { name: "호남반도체", reason: "호남권 반도체 클러스터", stockCodes: ["005930", "000660"], newsRefs: [0, 1] },
        { name: "건설", reason: "금호건설 단독", stockCodes: ["014790"], newsRefs: [2] }, // 1 valid → 강등
      ],
      singles: [],
    };
    hoist.mockCreate.mockResolvedValue(
      textResponse("```json\n" + JSON.stringify(resp) + "\n```"),
    );

    const payload = await clusterSurges(surges, cfg());

    // 호남반도체 테마에 금호건설 병합.
    const theme = payload.themes.find((t) => t.name === "호남반도체")!;
    expect(theme.stocks.map((s) => s.code)).toContain("014790");
    // singles 에 금호건설 없음.
    expect(payload.singles.find((s) => s.code === "014790")).toBeUndefined();
  });

  it("Claude 예외 → fail-safe 빈 payload", async () => {
    hoist.mockCreate.mockRejectedValue(new Error("boom"));
    const payload = await clusterSurges([surge("005930", 25, ["n0"])], cfg());
    expect(payload).toEqual({ themes: [], singles: [] });
  });
});
