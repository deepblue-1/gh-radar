import { describe, it, expect } from "vitest";
import { normalizeName } from "../src/merge/normalizeName";
import { mergeThemes } from "../src/merge/mergeThemes";
import type { ThemeScrape } from "../src/scrape/types";

describe("normalizeName (보수적 정규화 — RESEARCH §Pattern 4)", () => {
  it("'AI챗봇' 과 'ai 챗봇' 이 동일 norm_key 를 갖는다 (대소문자 + 공백 무시)", () => {
    expect(normalizeName("AI챗봇")).toBe(normalizeName("ai 챗봇"));
  });

  it("특수문자(·, /, -, ,)를 제거한다", () => {
    expect(normalizeName("2차전지·소재")).toBe(normalizeName("2차전지 소재"));
    expect(normalizeName("바이오/제약")).toBe("바이오제약");
    expect(normalizeName("AI-반도체")).toBe("ai반도체");
  });

  it("괄호 안 내용은 유지한다 (보수적 — 오병합 회피)", () => {
    // 'HBM(고대역폭메모리)' 와 'HBM' 은 서로 다른 norm_key (괄호 보존)
    const withParen = normalizeName("HBM(고대역폭메모리)");
    const bare = normalizeName("HBM");
    expect(withParen).not.toBe(bare);
    expect(withParen).toContain("고대역폭메모리");
  });

  it("NFKC 정규화로 전각/반각을 통일한다", () => {
    // 전각 'ＡＩ' → 반각 'ai'
    expect(normalizeName("ＡＩ")).toBe(normalizeName("AI"));
  });

  it("특수문자만 있으면 빈 문자열을 반환한다", () => {
    expect(normalizeName("···")).toBe("");
  });
});

describe("mergeThemes (네이버 ∪ 알파 norm_key 병합 — D-10)", () => {
  const naver = (name: string, codes: string[]): ThemeScrape => ({
    name,
    description: null,
    aliases: [],
    stocks: codes.map((code) => ({ code, reason: `${code} 편입사유` })),
    source: "naver",
  });
  const alpha = (
    name: string,
    codes: string[],
    description: string | null = null,
  ): ThemeScrape => ({
    name,
    description,
    aliases: [],
    stocks: codes.map((code) => ({ code, reason: null })),
    source: "alphasquare",
  });

  it("동일 norm_key 네이버+알파를 1개 시스템 테마로 병합한다", () => {
    const merged = mergeThemes([
      naver("AI챗봇", ["005930", "000660"]),
      alpha("ai 챗봇", ["000660", "035420"], "AI 챗봇 관련주"),
    ]);
    expect(merged.length).toBe(1);
    const t = merged[0];
    // sources 합집합
    expect([...t.sources].sort()).toEqual(["alphasquare", "naver"]);
    // 종목 code 합집합 (005930 ∪ 000660 ∪ 035420)
    expect(new Set(t.stocks.map((s) => s.code))).toEqual(
      new Set(["005930", "000660", "035420"]),
    );
    // 네이버 이름 우선
    expect(t.name).toBe("AI챗봇");
    // 비어있던 description 을 알파에서 채움
    expect(t.description).toBe("AI 챗봇 관련주");
  });

  it("서로 다른 norm_key 는 분리 유지한다 (보수적 — 오병합 금지)", () => {
    const merged = mergeThemes([
      naver("HBM(고대역폭메모리)", ["000660"]),
      naver("HBM", ["005930"]),
    ]);
    expect(merged.length).toBe(2);
  });

  it("같은 code 가 두 소스에 있으면 네이버 source/reason 이 우선한다", () => {
    const merged = mergeThemes([
      alpha("반도체", ["005930"]),
      naver("반도체", ["005930"]),
    ]);
    expect(merged.length).toBe(1);
    const s = merged[0].stocks.find((x) => x.code === "005930");
    expect(s?.source).toBe("naver");
    expect(s?.reason).toBe("005930 편입사유");
  });

  it("빈 정규화 키(특수문자만) 테마는 skip 한다", () => {
    const merged = mergeThemes([naver("···", ["005930"])]);
    expect(merged.length).toBe(0);
  });
});
