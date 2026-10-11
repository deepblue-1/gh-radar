/**
 * Phase 29-46 — GC-06 (29-REVIEW-R2). 유효 주문 서버 규칙 한 벌(`resolveEffectiveOrderServer`) 표.
 *
 * 규칙 = 지정 ?? (기본 서버가 등록 목록에 있거나 등록 모름이면 기본) ?? (등록 서버가 정확히 1대면 그 서버) ?? 없음.
 * relay(서버 매핑 79/87)와 Admin 계좌 편집기(DB 의도 active 행 · 29-55)가 등록 목록만 달리 넣고 이 함수를 같이 부른다.
 */
import { describe, expect, it } from "vitest";

import { resolveEffectiveOrderServer } from "../order-server";

describe("resolveEffectiveOrderServer — 유효 주문 서버 규칙 한 벌 (29-46 GC-06)", () => {
  it.each([
    {
      name: "지정 KB121 → 지정이 이긴다(등록 여부 무관)",
      input: { designated: "KB121", defaultKey: "KB120", registered: [] as string[] },
      expected: { key: "KB121", via: "designated" },
    },
    {
      name: "지정 없음 · 기본 KB120 · 등록 [KB120, KB121] → 기본",
      input: { designated: null, defaultKey: "KB120", registered: ["KB120", "KB121"] },
      expected: { key: "KB120", via: "default" },
    },
    {
      name: "지정 없음 · 기본 KB120 · 등록 [KB121] → 유일 등록 서버 KB121",
      input: { defaultKey: "KB120", registered: ["KB121"] },
      expected: { key: "KB121", via: "only-registered" },
    },
    {
      name: "지정 없음 · 기본 KB120 · 등록 [KB121, KB122] → 없음(fail closed)",
      input: { defaultKey: "KB120", registered: ["KB121", "KB122"] },
      expected: null,
    },
    {
      name: "지정 없음 · 기본 KB120 · 등록 [] · 기본 매핑 미적재(defaultUnknown) → 기본(종전)",
      input: { defaultKey: "KB120", registered: [], defaultUnknown: true },
      expected: { key: "KB120", via: "default" },
    },
    {
      name: "기본 없음(null) · 등록 [KB121] → 유일 등록 서버 KB121",
      input: { defaultKey: null, registered: ["KB121"] },
      expected: { key: "KB121", via: "only-registered" },
    },
    {
      name: "기본 없음 · 등록 [] → 없음",
      input: { defaultKey: null, registered: [] },
      expected: null,
    },
  ])("$name", ({ input, expected }) => {
    expect(resolveEffectiveOrderServer(input)).toEqual(expected);
  });

  it("기본 서버 매핑이 적재됐는데 계좌가 어디에도 없으면 없음 — 기본으로 떨어뜨리지 않는다", () => {
    expect(resolveEffectiveOrderServer({ defaultKey: "KB120", registered: [] })).toBeNull();
  });

  it("등록 목록의 중복은 1대로 센다", () => {
    expect(resolveEffectiveOrderServer({ defaultKey: "KB120", registered: ["KB121", "KB121"] })).toEqual({
      key: "KB121",
      via: "only-registered",
    });
  });
});
