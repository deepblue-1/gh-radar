import { describe, it, expect } from "vitest";
import { mapToDiscussionRow } from "../../src/pipeline/map";
import type { ParsedDiscussion } from "../../src/scraper/parseDiscussionsJson";

const OK: ParsedDiscussion = {
  postId: "417878625",
  title: "삼성전자 실적 기대감",
  body: "본문 plaintext",
  author: "abc****",
  postedAt: "2026-04-18T10:00:00+09:00",
  url: "https://stock.naver.com/domestic/stock/005930/discussion/417878625?chip=all",
  scrapedAt: "2026-04-18T11:00:00+09:00",
  isCleanbotPassed: true,
  commentCount: 0,
  recommendCount: 0,
};

describe("mapToDiscussionRow", () => {
  it("maps valid item with body", () => {
    const row = mapToDiscussionRow("005930", OK);
    expect(row).not.toBeNull();
    expect(row!.stock_code).toBe("005930");
    expect(row!.post_id).toBe("417878625");
    expect(row!.body).toBe("본문 plaintext");
    expect(row!.posted_at).toBe("2026-04-18T10:00:00+09:00");
    expect(row!.scraped_at).toBe("2026-04-18T11:00:00+09:00");
  });

  it("allows null body", () => {
    const row = mapToDiscussionRow("005930", { ...OK, body: null });
    expect(row!.body).toBeNull();
  });

  it("allows finance.naver.com legacy URL", () => {
    const row = mapToDiscussionRow("005930", {
      ...OK,
      url: "https://finance.naver.com/item/board_read.naver?code=005930&nid=1",
    });
    expect(row).not.toBeNull();
  });

  it("rejects non-naver URL (T-07 open redirect)", () => {
    expect(
      mapToDiscussionRow("005930", { ...OK, url: "https://evil.com/?nid=1" }),
    ).toBeNull();
  });

  it("rejects javascript: protocol", () => {
    expect(
      mapToDiscussionRow("005930", { ...OK, url: "javascript:alert(1)" }),
    ).toBeNull();
  });

  it("rejects malformed URL", () => {
    expect(
      mapToDiscussionRow("005930", { ...OK, url: "not-a-url" }),
    ).toBeNull();
  });

  it("does NOT apply spam filter at map stage (D11 is server responsibility)", () => {
    const shortTitle: ParsedDiscussion = { ...OK, title: "ㅋㅋ" };
    expect(mapToDiscussionRow("005930", shortTitle)).not.toBeNull();
    const urlSpam: ParsedDiscussion = {
      ...OK,
      title: "강추 http://bit.ly/xxx",
    };
    expect(mapToDiscussionRow("005930", urlSpam)).not.toBeNull();
  });

  it("normalizes empty author to null", () => {
    const row = mapToDiscussionRow("005930", { ...OK, author: "  " });
    expect(row!.author).toBeNull();
  });

  it("rejects empty title", () => {
    expect(mapToDiscussionRow("005930", { ...OK, title: "  " })).toBeNull();
  });

  it("rejects empty postedAt", () => {
    expect(mapToDiscussionRow("005930", { ...OK, postedAt: "" })).toBeNull();
  });
});
