import { describe, expect, it } from "vitest";

import { homeNewsRefKey } from "../home";

describe("homeNewsRefKey (Phase 41 D-20 · 근거 목록 중복 제거 키)", () => {
  it("url 이 있으면 url", () => {
    expect(homeNewsRefKey({ url: "https://a", source: "연합뉴스", title: "제목" })).toBe("https://a");
  });

  it("url null 이면 「자료원|제목」", () => {
    expect(
      homeNewsRefKey({ url: null, source: "코스닥 공시", title: "(주)가람전자 단일판매ㆍ공급계약체결" }),
    ).toBe("코스닥 공시|(주)가람전자 단일판매ㆍ공급계약체결");
  });

  it("링크 없는 공시끼리 제목이 다르면 키도 다르다(한 건으로 뭉치지 않는다)", () => {
    const a = homeNewsRefKey({ url: null, source: "코스닥 공시", title: "단일판매ㆍ공급계약체결" });
    const b = homeNewsRefKey({ url: null, source: "코스닥 공시", title: "유상증자결정" });
    expect(a).not.toBe(b);
  });

  it("빈 문자열 url 도 링크 없음으로 본다", () => {
    expect(homeNewsRefKey({ url: "", source: "거래소 공시", title: "T" })).toBe("거래소 공시|T");
  });
});
