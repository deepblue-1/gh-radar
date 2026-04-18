import { describe, it, expect } from "vitest";
import {
  stripHtmlToPlaintext,
  extractNid,
  parseNaverBoardDate,
} from "../discussion-sanitize.js";

/**
 * Phase 08 — V-04/V-05/V-06 unit tests for discussion-sanitize.
 * POC PIVOT: parseNaverBoardDate 입력이 ISO 8601 no-offset (JSON API) 중심,
 * 레거시 dot 포맷 양쪽 커버.
 */

describe("stripHtmlToPlaintext (V-04 / Phase 8 — T-01 mitigation)", () => {
  it("returns empty for empty input", () => {
    expect(stripHtmlToPlaintext("")).toBe("");
  });
  it("strips simple tag", () => {
    expect(stripHtmlToPlaintext("<p>삼성</p>")).toBe("삼성");
  });
  it("strips anchor with href", () => {
    expect(stripHtmlToPlaintext('<a href="http://spam">click</a>광고')).toBe(
      "click광고",
    );
  });
  it("decodes named entities (space-separated)", () => {
    // 각 엔티티를 space 로 분리하여 디코드 후 공백 정규화 결과를 검증.
    // '&nbsp;' → ' ' 는 whitespace 정규화 단계에서 다른 공백과 병합됨.
    expect(stripHtmlToPlaintext("&amp; &lt; &gt; &quot; &nbsp; end")).toBe(
      '& < > " end',
    );
  });
  it("decodes adjacent named entities without separator", () => {
    // 인접 엔티티는 디코드 후에도 공백이 없으므로 연속 문자열로 남음.
    expect(stripHtmlToPlaintext("&amp;&lt;&gt;&quot;&nbsp;end")).toBe(
      '&<>" end',
    );
  });
  it("decodes numeric entity &#39;", () => {
    expect(stripHtmlToPlaintext("&#39;X&#39;")).toBe("'X'");
  });
  it("decodes hex entity &#x2019;", () => {
    expect(stripHtmlToPlaintext("&#x2019;hi")).toBe("\u2019hi");
  });
  it("preserves Korean text", () => {
    expect(stripHtmlToPlaintext("한글 보존")).toBe("한글 보존");
  });
  it("collapses multiple whitespace", () => {
    expect(stripHtmlToPlaintext("a   b\n\nc")).toBe("a b c");
  });
  it("strips nested tags", () => {
    expect(stripHtmlToPlaintext("<div><span>X<b>Y</b></span></div>")).toBe("XY");
  });
  it("handles stray < (entity-decoded &lt;)", () => {
    // '2 &lt; 3' → entity decode → '2 < 3'. 태그 regex 는 `<` 단독은 매치하지 않음.
    expect(stripHtmlToPlaintext("2 &lt; 3")).toBe("2 < 3");
  });
  it("handles <br> as whitespace-equivalent", () => {
    expect(stripHtmlToPlaintext("line1<br>line2")).toBe("line1line2");
  });
});

describe("extractNid (V-05 / Phase 8)", () => {
  it("extracts nid from relative href", () => {
    expect(
      extractNid("/item/board_read.naver?code=005930&nid=272617128"),
    ).toBe("272617128");
  });
  it("extracts nid from full URL", () => {
    expect(
      extractNid(
        "https://finance.naver.com/item/board_read.naver?code=005930&nid=272617128&st=&sw=&page=1",
      ),
    ).toBe("272617128");
  });
  it("extracts nid when first param", () => {
    expect(
      extractNid("/item/board_read.naver?nid=123456&code=005930"),
    ).toBe("123456");
  });
  it("returns null when nid missing", () => {
    expect(extractNid("/item/board.naver?code=005930")).toBeNull();
  });
  it("returns null for empty", () => {
    expect(extractNid("")).toBeNull();
  });
  it("returns null for invalid string", () => {
    expect(extractNid("not-a-url")).toBeNull();
  });
  it("rejects nid < 6 digits", () => {
    expect(extractNid("?nid=123")).toBeNull();
  });
  it("rejects nid > 12 digits", () => {
    expect(extractNid("?nid=1234567890123")).toBeNull();
  });
  it("fallback articleId", () => {
    expect(extractNid("?articleId=9999999&code=005930")).toBe("9999999");
  });
});

describe("parseNaverBoardDate (V-06 / Phase 8 — PIVOT: ISO no-offset + legacy dot)", () => {
  // Case 1: ISO no-offset (JSON API writtenAt — POC 채택 포맷)
  it("parses ISO no-offset → adds +09:00", () => {
    expect(parseNaverBoardDate("2026-04-17T14:32:29")).toBe(
      "2026-04-17T14:32:29+09:00",
    );
  });
  it("parses ISO no-offset without seconds → adds :00 + offset", () => {
    expect(parseNaverBoardDate("2026-04-17T14:32")).toBe(
      "2026-04-17T14:32:00+09:00",
    );
  });
  it("parses ISO no-offset with milliseconds → preserves ms", () => {
    expect(parseNaverBoardDate("2026-04-17T14:32:29.123")).toBe(
      "2026-04-17T14:32:29.123+09:00",
    );
  });
  it("returns null for ISO with out-of-range month", () => {
    expect(parseNaverBoardDate("2026-13-01T00:00:00")).toBeNull();
  });

  // Case 2: ISO with offset/Z — passthrough
  it("passes through ISO with +09:00 offset unchanged", () => {
    expect(parseNaverBoardDate("2026-04-17T14:32:29+09:00")).toBe(
      "2026-04-17T14:32:29+09:00",
    );
  });
  it("passes through ISO with Z (UTC) unchanged", () => {
    expect(parseNaverBoardDate("2026-04-17T05:32:29Z")).toBe(
      "2026-04-17T05:32:29Z",
    );
  });

  // Case 3/4: Legacy HTML dot format (tolerant)
  it("parses legacy dot YYYY.MM.DD HH:mm", () => {
    expect(parseNaverBoardDate("2026.04.17 14:32")).toBe(
      "2026-04-17T14:32:00+09:00",
    );
  });
  it("tolerates multiple spaces in legacy dot format", () => {
    expect(parseNaverBoardDate("2026.04.17  14:32")).toBe(
      "2026-04-17T14:32:00+09:00",
    );
  });
  it("returns null for legacy dot with out-of-range hour", () => {
    expect(parseNaverBoardDate("2026.04.17 25:00")).toBeNull();
  });
  it("returns null for legacy dot with out-of-range month", () => {
    expect(parseNaverBoardDate("2026.13.01 00:00")).toBeNull();
  });

  // Common failure modes
  it("returns null for invalid string", () => {
    expect(parseNaverBoardDate("invalid")).toBeNull();
  });
  it("returns null for empty", () => {
    expect(parseNaverBoardDate("")).toBeNull();
  });
  it("returns null for whitespace-only", () => {
    expect(parseNaverBoardDate("   ")).toBeNull();
  });
});
