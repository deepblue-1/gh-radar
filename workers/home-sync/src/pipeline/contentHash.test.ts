import { describe, expect, it } from "vitest";
import { computeContentHash } from "./contentHash";
import type { Surge } from "./loadSurges";

/**
 * Phase 13 Plan 02 Task 1 — content_hash 변경 감지 (D-04, Pattern 4).
 *
 * 해시 입력은 급등 종목코드 + 뉴스 id 집합의 결정적 직렬화:
 *   - 순서 무관 (정렬 후 직렬화) — 급등 로드 순서가 바뀌어도 동일 해시.
 *   - title-insensitive — 같은 뉴스 id 집합이면 제목이 바뀌어도 동일 해시
 *     (Open Q3: 제목 전체를 넣으면 과민 반응 → id/count 기반).
 *   - 급등 집합/뉴스 id 집합이 실제로 바뀌면 다른 해시.
 */

function surge(code: string, changeRate: number, newsIds: string[]): Surge {
  return {
    code,
    name: `종목-${code}`,
    changeRate,
    news: newsIds.map((id) => ({
      id,
      stock_code: code,
      title: `제목-${id}`,
      url: `https://news/${id}`,
      source: "테스트",
      published_at: "2026-07-01T00:00:00Z",
    })),
  };
}

describe("computeContentHash", () => {
  it("동일 급등집합은 로드 순서와 무관하게 같은 해시 (order-independent)", () => {
    const a: Surge[] = [
      surge("005930", 25, ["n1", "n2"]),
      surge("000660", 30, ["n3"]),
    ];
    const shuffled: Surge[] = [
      surge("000660", 30, ["n3"]),
      surge("005930", 25, ["n2", "n1"]),
    ];
    expect(computeContentHash(a)).toBe(computeContentHash(shuffled));
  });

  it("같은 뉴스 id 집합이면 제목이 달라도 같은 해시 (title-insensitive)", () => {
    const a: Surge[] = [surge("005930", 25, ["n1", "n2"])];
    const withDifferentTitles: Surge[] = [surge("005930", 25, ["n1", "n2"])];
    withDifferentTitles[0].news[0].title = "완전히 다른 제목입니다";
    withDifferentTitles[0].news[1].title = "또 다른 제목";
    expect(computeContentHash(a)).toBe(computeContentHash(withDifferentTitles));
  });

  it("급등 종목 집합이 다르면 다른 해시", () => {
    const a: Surge[] = [surge("005930", 25, ["n1"])];
    const b: Surge[] = [surge("000660", 25, ["n1"])];
    expect(computeContentHash(a)).not.toBe(computeContentHash(b));
  });

  it("뉴스 id 집합이 다르면 다른 해시", () => {
    const a: Surge[] = [surge("005930", 25, ["n1"])];
    const b: Surge[] = [surge("005930", 25, ["n1", "n2"])];
    expect(computeContentHash(a)).not.toBe(computeContentHash(b));
  });

  it("SHA256 hex 문자열 반환 (64자)", () => {
    const a: Surge[] = [surge("005930", 25, ["n1"])];
    expect(computeContentHash(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});
