import { describe, it, expect } from "vitest";
import { mapToNewsRow } from "../src/pipeline/map";

const baseItem = {
  title: "",
  originallink: "",
  link: "",
  description: "",
  pubDate: "Fri, 17 Apr 2026 14:32:00 +0900",
};

describe("mapToNewsRow — V-04 stripHtml", () => {
  it("<b>X</b> title → 'X' 로 strip", () => {
    const row = mapToNewsRow("005930", {
      ...baseItem,
      title: "<b>삼성전자</b> 실적 발표",
      originallink: "https://example.com/a",
    });
    expect(row).not.toBeNull();
    expect(row!.title).toBe("삼성전자 실적 발표");
  });

  it("HTML entity &amp; 도 디코드", () => {
    const row = mapToNewsRow("005930", {
      ...baseItem,
      title: "AT&amp;T 관련 뉴스",
      originallink: "https://example.com/a",
    });
    expect(row!.title).toBe("AT&T 관련 뉴스");
  });
});

describe("mapToNewsRow — URL 폴백 및 T-02 guard", () => {
  it("originallink 없으면 link 폴백", () => {
    const row = mapToNewsRow("005930", {
      ...baseItem,
      title: "t",
      originallink: "",
      link: "https://n.news.naver.com/article/015/0001",
    });
    expect(row).not.toBeNull();
    expect(row!.url).toBe("https://n.news.naver.com/article/015/0001");
  });

  it("javascript: URL → null 반환 (T-02)", () => {
    // originallink 이 javascript: 면 link 폴백으로 내려가는데, link 도 javascript: 라 reject
    const row = mapToNewsRow("005930", {
      ...baseItem,
      title: "t",
      originallink: "javascript:alert('xss')",
      link: "javascript:void(0)",
    });
    expect(row).toBeNull();
  });

  it("javascript: originallink + 정상 link → link 폴백 (originallink trim 후 존재하므로 우선 선택)", () => {
    // `||` 는 truthy 우선 — originallink 가 존재하면 사용.
    // isAllowedUrl 이 javascript: 를 reject 하므로 결과적으로 null.
    const row = mapToNewsRow("005930", {
      ...baseItem,
      title: "t",
      originallink: "javascript:alert(1)",
      link: "https://ok.com/a",
    });
    expect(row).toBeNull();
  });

  it("ftp:// URL → null 반환", () => {
    const row = mapToNewsRow("005930", {
      ...baseItem,
      title: "t",
      originallink: "ftp://files.example.com/x",
    });
    expect(row).toBeNull();
  });

  it("malformed URL → null 반환", () => {
    const row = mapToNewsRow("005930", {
      ...baseItem,
      title: "t",
      originallink: "not-a-url",
    });
    expect(row).toBeNull();
  });
});

describe("mapToNewsRow — pubDate", () => {
  it("pubDate invalid → null 반환", () => {
    const row = mapToNewsRow("005930", {
      ...baseItem,
      title: "t",
      originallink: "https://ok.com/a",
      pubDate: "not-a-date",
    });
    expect(row).toBeNull();
  });

  it("정상 pubDate → ISO UTC 문자열", () => {
    const row = mapToNewsRow("005930", {
      ...baseItem,
      title: "t",
      originallink: "https://ok.com/a",
      pubDate: "Fri, 17 Apr 2026 14:32:00 +0900",
    });
    expect(row!.published_at).toBe("2026-04-17T05:32:00.000Z");
  });
});

describe("mapToNewsRow — source + content_hash", () => {
  it("source 추출 — hankyung.com → 'hankyung'", () => {
    const row = mapToNewsRow("005930", {
      ...baseItem,
      title: "t",
      originallink: "https://www.hankyung.com/article/x",
    });
    expect(row!.source).toBe("hankyung");
  });

  it("동일 input → 동일 content_hash (결정성)", () => {
    const item = {
      ...baseItem,
      title: "T",
      originallink: "https://ok.com/a",
      description: "D",
    };
    const a = mapToNewsRow("005930", item);
    const b = mapToNewsRow("005930", item);
    expect(a!.content_hash).toBe(b!.content_hash);
    expect(a!.content_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("다른 description → 다른 content_hash", () => {
    const base = {
      ...baseItem,
      title: "T",
      originallink: "https://ok.com/a",
    };
    const a = mapToNewsRow("005930", { ...base, description: "D1" });
    const b = mapToNewsRow("005930", { ...base, description: "D2" });
    expect(a!.content_hash).not.toBe(b!.content_hash);
  });

  it("빈 title → null 반환", () => {
    const row = mapToNewsRow("005930", {
      ...baseItem,
      title: "",
      originallink: "https://ok.com/a",
    });
    expect(row).toBeNull();
  });
});
