import { describe, it, expect, vi, beforeEach } from "vitest";
import pino from "pino";

/**
 * Phase 08.1 Plan 03 T-03 — classifyBatch 단위 테스트.
 *
 * 다중 row 의 라벨 매핑 / 일부 실패 처리 / p-limit(cfg.classifyConcurrency) 의
 * 동시성 상한 검증. Anthropic SDK 는 module-level mock 으로 교체.
 */

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import { __resetAnthropicClientForTests } from "../anthropic.js";
import { classifyBatch } from "../classifyBatch.js";

const silentLogger = pino({ level: "silent" });

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-anth-key";
  process.env.SUPABASE_URL = "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sr";
  process.env.BRIGHTDATA_API_KEY = "bd";
  process.env.DISCUSSION_SYNC_CLASSIFY_CONCURRENCY = "5";
  mockCreate.mockReset();
  __resetAnthropicClientForTests();
});

describe("classifyBatch — Phase 08.1 Plan 03", () => {
  it("3 rows 각각 price_reason/theme/noise 반환 → Map size 3", async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: "text", text: "price_reason" }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "theme" }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "noise" }] });

    const rows = [
      { id: "a", title: "차트", body: "지지선" },
      { id: "b", title: "2차전지", body: "정책" },
      { id: "c", title: "ㅎㅎ", body: null },
    ];
    const out = await classifyBatch(rows, silentLogger);
    expect(out.size).toBe(3);
    expect(out.get("a")).toBe("price_reason");
    expect(out.get("b")).toBe("theme");
    expect(out.get("c")).toBe("noise");
  });

  it("3 rows 중 1개 null(unknown label) → Map size 2", async () => {
    mockCreate
      .mockResolvedValueOnce({ content: [{ type: "text", text: "price_reason" }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "unknown_label" }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: "theme" }] });

    const rows = [
      { id: "a", title: "x", body: null },
      { id: "b", title: "y", body: null },
      { id: "c", title: "z", body: null },
    ];
    const out = await classifyBatch(rows, silentLogger);
    expect(out.size).toBe(2);
    expect(out.has("a")).toBe(true);
    expect(out.has("b")).toBe(false); // unknown → null → Map 에 안 들어감
    expect(out.has("c")).toBe(true);
  });

  it("10 rows 동시 호출 시 p-limit(5) 가 동시성 5 이하로 제한", async () => {
    // concurrency 카운터 스파이 — 진행 중 동시 호출 수의 최대값 측정.
    let inflight = 0;
    let maxInflight = 0;
    mockCreate.mockImplementation(async () => {
      inflight++;
      maxInflight = Math.max(maxInflight, inflight);
      // 시작된 작업이 즉시 resolve 되지 않도록 next-tick 대기 → 5개 이상 쌓일 기회 부여
      await new Promise((resolve) => setTimeout(resolve, 10));
      inflight--;
      return { content: [{ type: "text", text: "noise" }] };
    });

    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: `r${i}`,
      title: "t",
      body: null,
    }));
    const out = await classifyBatch(rows, silentLogger);
    expect(out.size).toBe(10);
    expect(maxInflight).toBeLessThanOrEqual(5);
    expect(maxInflight).toBeGreaterThan(1); // 병렬성 실제 동작 확인
  });
});
