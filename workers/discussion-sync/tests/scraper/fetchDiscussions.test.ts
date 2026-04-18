import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/proxy/client", () => ({
  fetchViaProxy: vi.fn(),
}));

import { fetchDiscussions } from "../../src/scraper/fetchDiscussions";
import { fetchViaProxy } from "../../src/proxy/client";
import { NaverApiValidationError } from "../../src/proxy/errors";
import type { DiscussionSyncConfig } from "../../src/config";

const CFG: DiscussionSyncConfig = {
  supabaseUrl: "https://x",
  supabaseServiceRoleKey: "sk",
  brightdataApiKey: "k",
  brightdataZone: "gh_radar_naver",
  brightdataUrl: "https://api.brightdata.com/request",
  naverDiscussionApiBase:
    "https://stock.naver.com/api/community/discussion/posts/by-item",
  discussionSyncDailyBudget: 5000,
  discussionSyncConcurrency: 8,
  discussionSyncPageSize: 50,
  appVersion: "test",
  logLevel: "info",
};

const VALID_JSON = JSON.stringify({
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
  ],
});

const proxyStub = {} as import("axios").AxiosInstance;

describe("fetchDiscussions", () => {
  beforeEach(() => {
    vi.mocked(fetchViaProxy).mockReset();
  });

  it("requests required params (isHolderOnly/excludesItemNews/isItemNewsOnly/discussionType)", async () => {
    vi.mocked(fetchViaProxy).mockResolvedValue(VALID_JSON);
    await fetchDiscussions({ itemCode: "005930" }, { proxy: proxyStub, cfg: CFG });
    const targetUrl = vi.mocked(fetchViaProxy).mock.calls[0][2];
    expect(targetUrl).toContain("discussionType=domesticStock");
    expect(targetUrl).toContain("itemCode=005930");
    expect(targetUrl).toContain("isHolderOnly=false");
    expect(targetUrl).toContain("excludesItemNews=false");
    expect(targetUrl).toContain("isItemNewsOnly=false");
    expect(targetUrl).toContain("isCleanbotPassedOnly=false");
    expect(targetUrl).toContain("pageSize=50");
  });

  it("returns parsed response when JSON is valid", async () => {
    vi.mocked(fetchViaProxy).mockResolvedValue(VALID_JSON);
    const out = await fetchDiscussions(
      { itemCode: "005930" },
      { proxy: proxyStub, cfg: CFG },
    );
    expect(out.posts.length).toBe(1);
    expect(out.posts[0].id).toBe("1");
  });

  it("throws NaverApiValidationError on 207B fieldErrors response", async () => {
    vi.mocked(fetchViaProxy).mockResolvedValue(
      '{"detailCode":"invalid_type,...","fieldErrors":{"isHolderOnly":"required"}}',
    );
    await expect(
      fetchDiscussions({ itemCode: "005930" }, { proxy: proxyStub, cfg: CFG }),
    ).rejects.toBeInstanceOf(NaverApiValidationError);
  });

  it("throws NaverApiValidationError on non-JSON response", async () => {
    vi.mocked(fetchViaProxy).mockResolvedValue("<html>not json</html>");
    await expect(
      fetchDiscussions({ itemCode: "005930" }, { proxy: proxyStub, cfg: CFG }),
    ).rejects.toBeInstanceOf(NaverApiValidationError);
  });

  it("throws NaverApiValidationError on schema mismatch (missing posts)", async () => {
    vi.mocked(fetchViaProxy).mockResolvedValue('{"pageSize":50}');
    await expect(
      fetchDiscussions({ itemCode: "005930" }, { proxy: proxyStub, cfg: CFG }),
    ).rejects.toBeInstanceOf(NaverApiValidationError);
  });

  it("respects custom pageSize override", async () => {
    vi.mocked(fetchViaProxy).mockResolvedValue(VALID_JSON);
    await fetchDiscussions(
      { itemCode: "005930", pageSize: 20 },
      { proxy: proxyStub, cfg: CFG },
    );
    const targetUrl = vi.mocked(fetchViaProxy).mock.calls[0][2];
    expect(targetUrl).toContain("pageSize=20");
  });
});
