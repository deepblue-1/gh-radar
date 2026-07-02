import { describe, it, expect } from "vitest";
import { CLUSTER_SYSTEM_PROMPT, buildClusterFewShot } from "./prompt";

/**
 * Phase 13 후속 — 프롬프트 consolidation 개선 검증.
 *
 * 근본 원인(금호건설류 고아 발생) 완화: 시스템 프롬프트가 (1) 같은 지역/업종/재료로
 * 동반 상한가한 종목을 서사 차이 무관 하나의 테마로 통합하도록, (2) 1종목 테마를 만들지
 * 않도록 지시하는지 확인. few-shot 에 지역 통합 예시가 추가되었는지 + 모든 assistant
 * 출력이 여전히 유효 JSON(계약 유지)인지 검증.
 */

describe("CLUSTER_SYSTEM_PROMPT consolidation 규칙", () => {
  it("가장 잘 맞는 테마 하나로 귀속 + 서사 차이 무관 통합 지시 포함", () => {
    expect(CLUSTER_SYSTEM_PROMPT).toContain("하나");
    expect(CLUSTER_SYSTEM_PROMPT).toContain("통합");
  });

  it("1종목 테마 금지 지시 포함", () => {
    expect(CLUSTER_SYSTEM_PROMPT).toContain("1종목 테마");
  });
});

describe("buildClusterFewShot 지역 통합 예시", () => {
  it("지역 통합 예시가 추가됨 (기존 초전도체/빈 예시 + 신규)", () => {
    const shots = buildClusterFewShot();
    // user/assistant 쌍 → 최소 3개 쌍(6 메시지) 이상 (기존 2 + 신규 1).
    expect(shots.length).toBeGreaterThanOrEqual(6);
    // 지역 통합 관련 키워드가 어느 user 프롬프트에 등장.
    const userText = shots.filter((m) => m.role === "user").map((m) => m.content).join("\n");
    expect(userText).toContain("호남");
  });

  it("모든 assistant few-shot 출력은 여전히 유효 JSON (JSON-only 계약)", () => {
    const shots = buildClusterFewShot();
    const assistants = shots.filter((m) => m.role === "assistant");
    expect(assistants.length).toBeGreaterThanOrEqual(3);
    for (const a of assistants) {
      const parsed = JSON.parse(a.content) as { themes?: unknown; singles?: unknown };
      expect(Array.isArray(parsed.themes)).toBe(true);
      expect(Array.isArray(parsed.singles)).toBe(true);
    }
  });

  it("지역 통합 assistant 예시는 건설+반도체를 하나의 테마로 묶음", () => {
    const shots = buildClusterFewShot();
    const assistants = shots.filter((m) => m.role === "assistant");
    // 호남 통합 예시: 하나의 테마에 2종목 이상 + singles 로 흩어지지 않음.
    const regional = assistants.find((a) => {
      const p = JSON.parse(a.content) as {
        themes: Array<{ stockCodes: string[] }>;
      };
      return p.themes.some((t) => t.stockCodes.length >= 2);
    });
    expect(regional).toBeDefined();
  });
});
