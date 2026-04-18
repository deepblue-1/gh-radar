import { describe, it, expect } from "vitest";
import { parseDiscussionsJson } from "../../src/scraper/parseDiscussionsJson";
import {
  NAVER_BOARD_JSON_SAMPLE_ACTIVE,
  NAVER_BOARD_JSON_SAMPLE_QUIET,
} from "../helpers/naver-board-fixtures";
import type { NaverDiscussionApiResponse } from "../../src/scraper/types";

const FIXED_NOW = "2026-04-18T11:00:00+09:00";

describe("parseDiscussionsJson — POC §4 fixture", () => {
  it("parses active fixture (5 posts → 5 ParsedDiscussion)", () => {
    const out = parseDiscussionsJson(
      NAVER_BOARD_JSON_SAMPLE_ACTIVE as unknown as NaverDiscussionApiResponse,
      { stockCode: "005930", fetchedAt: FIXED_NOW },
    );
    expect(out.length).toBe(5);
    for (const p of out) {
      expect(p.postId).toMatch(/^\d{6,}$/);
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.author.length).toBeGreaterThan(0);
      expect(p.postedAt).toMatch(/\+09:00$/);
      expect(p.url).toMatch(
        /^https:\/\/stock\.naver\.com\/domestic\/stock\/005930\/discussion\/\d+\?chip=all$/,
      );
      expect(p.scrapedAt).toBe(FIXED_NOW);
    }
  });

  it("parses quiet fixture", () => {
    const out = parseDiscussionsJson(
      NAVER_BOARD_JSON_SAMPLE_QUIET as unknown as NaverDiscussionApiResponse,
      { stockCode: "247540", fetchedAt: FIXED_NOW },
    );
    expect(out.length).toBeGreaterThan(0);
    for (const p of out) {
      expect(p.url).toContain("/domestic/stock/247540/discussion/");
    }
  });

  it("body is plaintext (HTML tags stripped via sanitize-html)", () => {
    const out = parseDiscussionsJson(
      NAVER_BOARD_JSON_SAMPLE_ACTIVE as unknown as NaverDiscussionApiResponse,
      { stockCode: "005930", fetchedAt: FIXED_NOW },
    );
    for (const p of out) {
      if (p.body) {
        expect(p.body).not.toMatch(/<[a-z]/i);
      }
    }
  });

  it("converts writtenAt (no offset) to ISO + +09:00", () => {
    const out = parseDiscussionsJson(
      NAVER_BOARD_JSON_SAMPLE_ACTIVE as unknown as NaverDiscussionApiResponse,
      { stockCode: "005930", fetchedAt: FIXED_NOW },
    );
    // 첫 post writtenAt = '2026-04-18T10:02:42'
    expect(out[0].postedAt).toBe("2026-04-18T10:02:42+09:00");
  });

  it("filters replyDepth > 0 posts", () => {
    const synthetic: NaverDiscussionApiResponse = {
      pageSize: 50,
      posts: [
        {
          id: "1",
          itemCode: "005930",
          itemName: "삼성전자",
          postType: "normal",
          writer: { profileId: "p", profileType: "normal", nickname: "u" },
          writtenAt: "2026-04-18T10:00:00",
          title: "ok",
          contentSwReplacedButImg: "body",
          isCleanbotPassed: true,
          replyDepth: 0,
          commentCount: 0,
          recommendCount: 0,
        },
        {
          id: "2",
          itemCode: "005930",
          itemName: "삼성전자",
          postType: "normal",
          writer: { profileId: "p2", profileType: "normal", nickname: "u2" },
          writtenAt: "2026-04-18T10:00:00",
          title: "reply",
          contentSwReplacedButImg: "body",
          isCleanbotPassed: true,
          replyDepth: 1, // ← filter out
          commentCount: 0,
          recommendCount: 0,
        },
      ],
    };
    const out = parseDiscussionsJson(synthetic, {
      stockCode: "005930",
      fetchedAt: FIXED_NOW,
    });
    expect(out.length).toBe(1);
    expect(out[0].postId).toBe("1");
  });

  it("filters postType !== 'normal' (itemNewsResearch bot)", () => {
    const synthetic: NaverDiscussionApiResponse = {
      pageSize: 50,
      posts: [
        {
          id: "n1",
          itemCode: "005930",
          itemName: "삼성전자",
          postType: "itemNewsResearch",
          writer: { profileId: "p", profileType: "itemNews", nickname: "뉴스봇" },
          writtenAt: "2026-04-18T10:00:00",
          title: "[속보] ...",
          contentSwReplacedButImg: "기사",
          isCleanbotPassed: true,
          replyDepth: 0,
          commentCount: 0,
          recommendCount: 0,
        },
      ],
    };
    expect(
      parseDiscussionsJson(synthetic, {
        stockCode: "005930",
        fetchedAt: FIXED_NOW,
      }),
    ).toEqual([]);
  });

  it("D11: drops posts with isCleanbotPassed === false", () => {
    const synthetic: NaverDiscussionApiResponse = {
      pageSize: 50,
      posts: [
        {
          id: "spam",
          itemCode: "005930",
          itemName: "삼성전자",
          postType: "normal",
          writer: { profileId: "p", profileType: "normal", nickname: "spammer" },
          writtenAt: "2026-04-18T10:00:00",
          title: "spam title",
          contentSwReplacedButImg: "spam body",
          isCleanbotPassed: false,
          replyDepth: 0,
          commentCount: 0,
          recommendCount: 0,
        },
      ],
    };
    expect(
      parseDiscussionsJson(synthetic, {
        stockCode: "005930",
        fetchedAt: FIXED_NOW,
      }),
    ).toEqual([]);
  });

  it("returns null body when contentSwReplacedButImg is empty", () => {
    const synthetic: NaverDiscussionApiResponse = {
      pageSize: 50,
      posts: [
        {
          id: "1",
          itemCode: "005930",
          itemName: "삼성전자",
          postType: "normal",
          writer: { profileId: "p", profileType: "normal", nickname: "u" },
          writtenAt: "2026-04-18T10:00:00",
          title: "title",
          contentSwReplacedButImg: "",
          isCleanbotPassed: true,
          replyDepth: 0,
          commentCount: 0,
          recommendCount: 0,
        },
      ],
    };
    const out = parseDiscussionsJson(synthetic, {
      stockCode: "005930",
      fetchedAt: FIXED_NOW,
    });
    expect(out.length).toBe(1);
    expect(out[0].body).toBeNull();
  });

  it("returns empty when posts array is empty", () => {
    expect(
      parseDiscussionsJson(
        { pageSize: 50, posts: [] },
        { stockCode: "005930", fetchedAt: FIXED_NOW },
      ),
    ).toEqual([]);
  });
});
