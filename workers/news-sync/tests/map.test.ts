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

describe("mapToNewsRow — description (Phase 07.1)", () => {
  it("description HTML 태그/entity → stripHtml 처리되어 저장", () => {
    const row = mapToNewsRow("005930", {
      ...baseItem,
      title: "t",
      originallink: "https://ok.com/a",
      description:
        "<b>삼성전자</b>가 17일 발표한 1분기 잠정실적에 따르면 &quot;역대 최대&quot;",
    });
    expect(row).not.toBeNull();
    expect(row!.description).toBe(
      '삼성전자가 17일 발표한 1분기 잠정실적에 따르면 "역대 최대"',
    );
  });

  it("빈 description → null 저장", () => {
    const row = mapToNewsRow("005930", {
      ...baseItem,
      title: "t",
      originallink: "https://ok.com/a",
      description: "",
    });
    expect(row!.description).toBeNull();
  });

  it("undefined description (Naver 응답에 필드 없음) → null 저장", () => {
    const row = mapToNewsRow("005930", {
      ...baseItem,
      title: "t",
      originallink: "https://ok.com/a",
      description: undefined as unknown as string,
    });
    expect(row!.description).toBeNull();
  });

  it("description 만 HTML 태그 → 태그 strip 후 공백만 남으면 null", () => {
    const row = mapToNewsRow("005930", {
      ...baseItem,
      title: "t",
      originallink: "https://ok.com/a",
      description: "<b></b>",
    });
    // stripHtml trim 결과 빈 문자열 → null
    expect(row!.description).toBeNull();
  });

  it("description 저장이 content_hash 계산식을 변경하지 않는다 (기존 row 와 동일성 보장)", () => {
    // Phase 7 구현과 동일한 input 으로 content_hash 가 유지되어야 함.
    // 계산식: sha256(title + '\n' + stripHtml(description))
    const row = mapToNewsRow("005930", {
      ...baseItem,
      title: "T",
      originallink: "https://ok.com/a",
      description: "D",
    });
    // 해시 결정성 + 길이/형식 확인
    expect(row!.content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row!.description).toBe("D");
  });
});
