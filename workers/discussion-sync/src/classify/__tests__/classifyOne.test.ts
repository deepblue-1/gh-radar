import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Phase 08.1 Plan 03 T-03 — classifyOne 단위 테스트.
 *
 * Anthropic SDK 를 mock → 실제 네트워크 호출 없음. 라벨 매치 / trim+lowercase /
 * unknown 라벨 → null / API throw → null 동작 검증.
 */

// 모듈 scope mock — Anthropic default export 를 vi.fn 생성자로 교체하고,
// 생성된 인스턴스의 messages.create 는 테스트마다 mockResolvedValueOnce 로 지정.
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

// Anthropic client 싱글톤 리셋 헬퍼 + classifyOne (import 은 mock 설정 이후여야 함)
import { __resetAnthropicClientForTests } from "../anthropic.js";
import { classifyOne } from "../classifyOne.js";

beforeEach(() => {
  // loadConfig 의 required env 들 — 테스트 격리를 위해 매 케이스 set.
  process.env.ANTHROPIC_API_KEY = "test-anth-key";
  process.env.SUPABASE_URL = "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sr";
  process.env.BRIGHTDATA_API_KEY = "bd";
  mockCreate.mockReset();
  __resetAnthropicClientForTests();
});

describe("classifyOne — Phase 08.1 Plan 03", () => {
  it("정상 라벨 'price_reason' → 'price_reason' 반환", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "price_reason" }],
    });
    const out = await classifyOne({ id: "r1", title: "차트 이탈", body: null });
    expect(out).toBe("price_reason");
    expect(mockCreate).toHaveBeenCalledOnce();
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.max_tokens).toBe(10);
    expect(callArgs.temperature).toBe(0);
    expect(callArgs.model).toBe("claude-haiku-4-5");
  });

  it("공백/대문자 섞인 'NOISE  ' → trim+lowercase 후 'noise'", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "  NOISE  " }],
    });
    const out = await classifyOne({ id: "r2", title: "ㅋㅋㅋ", body: "" });
    expect(out).toBe("noise");
  });

  it("unknown 라벨 'happy' → null (화이트리스트 매치 실패)", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "happy" }],
    });
    const out = await classifyOne({ id: "r3", title: "x", body: null });
    expect(out).toBeNull();
  });

  it("API throw → null (다음 cycle 재시도)", async () => {
    mockCreate.mockRejectedValueOnce(new Error("rate limited"));
    const out = await classifyOne({ id: "r4", title: "x", body: null });
    expect(out).toBeNull();
  });
});
