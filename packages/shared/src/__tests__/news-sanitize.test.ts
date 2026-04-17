import { describe, it, expect } from "vitest";
import {
  stripHtml,
  parsePubDate,
  extractSourcePrefix,
} from "../news-sanitize.js";

describe("stripHtml (V-04)", () => {
  it("returns empty for empty input", () => {
    expect(stripHtml("")).toBe("");
  });
  it("strips <b> tag", () => {
    expect(stripHtml("<b>삼성</b>")).toBe("삼성");
  });
  it("strips nested tags", () => {
    expect(stripHtml("<i><b>X</b></i>")).toBe("X");
  });
  it("decodes &quot;", () => {
    expect(stripHtml("&quot;hi&quot;")).toBe('"hi"');
  });
  it("decodes &#39;", () => {
    expect(stripHtml("&#39;X&#39;")).toBe("'X'");
  });
  it("decodes hex &#x2019;", () => {
    expect(stripHtml("&#x2019;")).toBe("\u2019");
  });
  it("decodes common named entities", () => {
    // &amp; → '&', &lt; → '<', &gt; → '>', &nbsp; → ' ' (공백)
    // 최종 trim() 이 뒤쪽 공백 제거 → '& < >'
    expect(stripHtml("&amp; &lt; &gt; &nbsp;")).toBe("& < >  ".trim());
  });
  it("preserves Korean", () => {
    expect(stripHtml("한글 테스트")).toBe("한글 테스트");
  });
});

describe("parsePubDate (V-05)", () => {
  it("parses RFC 822 +0900", () => {
    expect(parsePubDate("Fri, 17 Apr 2026 14:32:00 +0900")).toBe(
      "2026-04-17T05:32:00.000Z",
    );
  });
  it("parses RFC 822 GMT to ISO", () => {
    expect(parsePubDate("Fri, 17 Apr 2026 14:32:00 GMT")).toBe(
      "2026-04-17T14:32:00.000Z",
    );
  });
  it("returns null for invalid string", () => {
    expect(parsePubDate("invalid")).toBeNull();
  });
  it("returns null for empty", () => {
    expect(parsePubDate("")).toBeNull();
  });
});

describe("extractSourcePrefix (V-06)", () => {
  it("strips www", () => {
    expect(extractSourcePrefix("https://www.hankyung.com/x")).toBe("hankyung");
  });
  it("handles news.mt.co.kr → mt", () => {
    expect(extractSourcePrefix("https://news.mt.co.kr/x")).toBe("mt");
  });
  it("strips m. subdomain", () => {
    expect(extractSourcePrefix("https://m.chosun.com/x")).toBe("chosun");
  });
  it("naver special-case (n.news.naver.com)", () => {
    expect(extractSourcePrefix("https://n.news.naver.com/x")).toBe("naver");
  });
  it("naver special-case (news.naver.com)", () => {
    expect(extractSourcePrefix("https://news.naver.com/x")).toBe("naver");
  });
  it("strips biz. subdomain", () => {
    expect(extractSourcePrefix("https://biz.chosun.com/x")).toBe("chosun");
  });
  it("returns null for invalid URL", () => {
    expect(extractSourcePrefix("not-a-url")).toBeNull();
  });
  it("returns null for empty", () => {
    expect(extractSourcePrefix("")).toBeNull();
  });
  it("rejects non-http(s) protocols", () => {
    expect(extractSourcePrefix("ftp://evil.com")).toBeNull();
  });
  it("rejects javascript: protocol (T-02 defense)", () => {
    expect(extractSourcePrefix("javascript:alert(1)")).toBeNull();
  });
});
