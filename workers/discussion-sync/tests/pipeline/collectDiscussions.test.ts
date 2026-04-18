import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AxiosInstance } from "axios";
import type { SupabaseClient } from "@supabase/supabase-js";
import { collectDiscussions } from "../../src/pipeline/collectDiscussions";
import type { DiscussionSyncConfig } from "../../src/config";
import type {
  NaverDiscussionApiResponse,
  NaverDiscussionPost,
} from "../../src/scraper/types";

// fetchDiscussions 모킹 — collectDiscussions 의 다중 페이지 loop 만 검증
vi.mock("../../src/scraper/fetchDiscussions", () => ({
  fetchDiscussions: vi.fn(),
}));
import { fetchDiscussions } from "../../src/scraper/fetchDiscussions";

const cfg: DiscussionSyncConfig = {
  supabaseUrl: "https://x.supabase.co",
  supabaseServiceRoleKey: "k",
  brightdataApiKey: "k",
  brightdataZone: "z",
  brightdataUrl: "https://api.brightdata.com/request",
  naverDiscussionApiBase: "https://stock.naver.com/api/community/discussion/posts/by-item",
  discussionSyncDailyBudget: 10000,
  discussionSyncConcurrency: 1,
  discussionSyncPageSize: 100,
  discussionSyncBackfillMaxPages: 10,
  discussionSyncBackfillDays: 7,
  discussionSyncIncrementalHours: 24,
  appVersion: "test",
  logLevel: "silent",
};

function makePost(id: string, hoursAgo: number): NaverDiscussionPost {
  // Naver API 의 writtenAt 은 KST time (offset 없음). 실시간 hoursAgo 를 KST 문자열로 포맷.
  const realMs = Date.now() - hoursAgo * 3600_000;
  const kstMs = realMs + 9 * 3600_000; // UTC → KST shift
  const d = new Date(kstMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return {
    id,
    itemCode: "005930",
    itemName: "삼성전자",
    postType: "normal",
    writer: { profileId: "p", profileType: "normal", nickname: "tester" },
    writtenAt: `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`,
    title: `테스트 제목 ${id}`,
    contentSwReplacedButImg: "본문",
    isCleanbotPassed: true,
    replyDepth: 0,
    commentCount: 0,
    recommendCount: 0,
  };
}

function makeApiResponse(
  posts: NaverDiscussionPost[],
  lastOffset?: string,
): NaverDiscussionApiResponse {
  return { pageSize: cfg.discussionSyncPageSize, posts, lastOffset };
}

function makeSupabaseMock(lastScrapedAt: string | null): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: lastScrapedAt ? { scraped_at: lastScrapedAt } : null,
                  error: null,
                }),
            }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("collectDiscussions — backfill vs incremental mode", () => {
  beforeEach(() => {
    vi.mocked(fetchDiscussions).mockReset();
  });

  it("first-time stock (no prior scraped_at) → backfill mode, fetches multiple pages", async () => {
    // page 1: 100 posts (1~10시간 전), lastOffset 있음
    // page 2: 100 posts (10~20시간 전), lastOffset 있음
    // page 3: 50 posts (20~30시간 전), lastOffset 있음 — but 일부가 7일 cutoff 안에 있음
    // (간소화: 2 페이지 후 cutoff 도달)
    vi.mocked(fetchDiscussions)
      .mockResolvedValueOnce(
        makeApiResponse(
          Array.from({ length: 100 }, (_, i) => makePost(`p1-${i}`, i * 0.1)),
          "offset-1",
        ),
      )
      .mockResolvedValueOnce(
        makeApiResponse(
          [
            makePost("p2-0", 24),
            makePost("p2-1", 48),
            makePost("p2-2", 24 * 8), // 8일 전 — cutoff 넘김 (backfillDays=7)
          ],
          "offset-2",
        ),
      );

    const supabase = makeSupabaseMock(null);
    const onRequest = vi.fn().mockResolvedValue(true);

    const result = await collectDiscussions(
      vi.fn() as unknown as AxiosInstance,
      cfg,
      supabase,
      "005930",
      onRequest,
    );

    expect(result.mode).toBe("backfill");
    expect(result.requests).toBe(2); // page 2 에서 cutoff 도달 → 종료
    expect(result.rows.length).toBe(102); // p1 100건 + p2 (24h, 48h 둘 다 7d 이내) — 2건
    expect(result.filteredByCutoff).toBe(1); // 8일 전 글 1건
  });

  it("recent stock (scraped 1h ago) → incremental mode, fetches 1 page only", async () => {
    vi.mocked(fetchDiscussions).mockResolvedValueOnce(
      makeApiResponse(
        [
          makePost("r-0", 0.5), // 30분 전 → incremental 24h 안
          makePost("r-1", 23),  // 23시간 전 → incremental 24h 안
          makePost("r-2", 30),  // 30시간 전 → incremental 24h 넘김
        ],
        "offset-1",
      ),
    );

    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
    const supabase = makeSupabaseMock(oneHourAgo);
    const onRequest = vi.fn().mockResolvedValue(true);

    const result = await collectDiscussions(
      vi.fn() as unknown as AxiosInstance,
      cfg,
      supabase,
      "005930",
      onRequest,
    );

    expect(result.mode).toBe("incremental");
    expect(result.requests).toBe(1);
    expect(result.rows.length).toBe(2);
    expect(result.filteredByCutoff).toBe(1);
  });

  it("backfill stops at backfillMaxPages cap even if more pages available", async () => {
    // 모든 페이지가 cutoff 안 + lastOffset 항상 존재 → cap 만 종료 사유
    const tinyCfg = { ...cfg, discussionSyncBackfillMaxPages: 3 };
    vi.mocked(fetchDiscussions).mockResolvedValue(
      makeApiResponse([makePost("x", 1)], "always-more"),
    );

    const supabase = makeSupabaseMock(null);
    const onRequest = vi.fn().mockResolvedValue(true);

    const result = await collectDiscussions(
      vi.fn() as unknown as AxiosInstance,
      tinyCfg,
      supabase,
      "005930",
      onRequest,
    );

    expect(result.mode).toBe("backfill");
    expect(result.requests).toBe(3); // cap 으로 종료
  });

  it("budget exhausted mid-loop → onRequest returns false → loop exits early", async () => {
    vi.mocked(fetchDiscussions).mockResolvedValue(
      makeApiResponse([makePost("a", 1)], "more"),
    );

    const supabase = makeSupabaseMock(null);
    const onRequest = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false); // 2번째 페이지에서 예산 초과

    const result = await collectDiscussions(
      vi.fn() as unknown as AxiosInstance,
      cfg,
      supabase,
      "005930",
      onRequest,
    );

    expect(result.requests).toBe(1); // 첫 페이지만
    expect(result.mode).toBe("backfill");
  });

  it("empty page → loop exits even if lastOffset present", async () => {
    vi.mocked(fetchDiscussions).mockResolvedValueOnce(
      makeApiResponse([], "leftover-offset"),
    );

    const supabase = makeSupabaseMock(null);
    const onRequest = vi.fn().mockResolvedValue(true);

    const result = await collectDiscussions(
      vi.fn() as unknown as AxiosInstance,
      cfg,
      supabase,
      "005930",
      onRequest,
    );

    expect(result.requests).toBe(1);
    expect(result.rows.length).toBe(0);
  });
});
