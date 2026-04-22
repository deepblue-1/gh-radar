import { describe, it, expect } from "vitest";
import type { Discussion } from "../discussion.js";

/**
 * Phase 08.1 — Discussion 타입 확장(relevance / classifiedAt) 구조 검증.
 *
 * 타입 변경은 컴파일 타임에 강제되지만, 런타임 fixture 로 실제 필드·값 도메인이
 * 기대와 일치하는지 명시 검증한다. server mapper / worker classify / webapp filter
 * 3개 워크스페이스 계약의 single-source-of-truth 로 기능한다.
 */

describe("Discussion type (Phase 08.1)", () => {
  it("relevance/classifiedAt 필드를 허용해야 한다", () => {
    const d: Discussion = {
      id: "x",
      stockCode: "005930",
      postId: "1",
      title: "t",
      body: null,
      author: null,
      postedAt: "2026-04-21T00:00:00+09:00",
      scrapedAt: "2026-04-21T00:01:00+09:00",
      url: "https://stock.naver.com/domestic/stock/005930/discussion/1?chip=all",
      relevance: "price_reason",
      classifiedAt: "2026-04-21T00:02:00+09:00",
    };
    expect(d.relevance).toBe("price_reason");
    expect(d.classifiedAt).not.toBeNull();
  });

  it("relevance=null / classifiedAt=null 도 유효하다", () => {
    const d: Discussion = {
      id: "y",
      stockCode: "005930",
      postId: "2",
      title: "t2",
      body: null,
      author: null,
      postedAt: "2026-04-21T00:00:00+09:00",
      scrapedAt: "2026-04-21T00:01:00+09:00",
      url: "https://stock.naver.com/domestic/stock/005930/discussion/2?chip=all",
      relevance: null,
      classifiedAt: null,
    };
    expect(d.relevance).toBeNull();
    expect(d.classifiedAt).toBeNull();
  });

  it("relevance 는 4개 카테고리 유니언을 모두 수용한다", () => {
    const labels: Array<Discussion["relevance"]> = [
      "price_reason",
      "theme",
      "news_info",
      "noise",
      null,
    ];
    expect(labels).toHaveLength(5);
    expect(labels).toContain("price_reason");
    expect(labels).toContain("theme");
    expect(labels).toContain("news_info");
    expect(labels).toContain("noise");
    expect(labels).toContain(null);
  });
});
