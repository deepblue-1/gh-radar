import { describe, it, expect, vi, beforeEach } from "vitest";
import { runHomeSyncCycle } from "./index";
import type { HomeSyncConfig } from "./config";
import type { HomeSnapshotPayload } from "@gh-radar/shared";
import { createMockSupabase } from "../tests/helpers/supabase-mock";

/**
 * Phase 13 Plan 02 Task 3 — runHomeSyncCycle (hash-skip clone-append, Pattern 4).
 *
 * 검증:
 *   - hash-match 분기: 직전 스냅샷 content_hash === 이번 hash → cluster spy NOT called,
 *     insert payload = 직전 payload 복제 + is_carried=true (clone-append).
 *   - hash-miss 분기(첫 slot / 해시 변경): cluster spy 1회, is_carried=false.
 *   - upsertSnapshot 은 onConflict "trade_date,captured_at" ignoreDuplicates (idempotent).
 */

function cfg(over: Partial<HomeSyncConfig> = {}): HomeSyncConfig {
  return {
    supabaseUrl: "https://x.supabase.co",
    supabaseServiceRoleKey: "svc",
    anthropicApiKey: "test",
    classifyModel: "claude-haiku-4-5",
    surgeThreshold: 20,
    newsPerStock: 5,
    surgeMax: 80,
    appVersion: "test",
    logLevel: "silent",
    ...over,
  };
}

const CLUSTER_PAYLOAD: HomeSnapshotPayload = {
  threshold: 20,
  marketStatus: "open",
  themes: [
    {
      name: "반도체",
      reason: "r",
      stocks: [
        { code: "005930", name: "삼성전자", changeRate: 25 },
        { code: "000660", name: "SK하이닉스", changeRate: 30 },
      ],
      news: [],
    },
  ],
  singles: [
    { code: "347700", name: "라파스", changeRate: 22, reason: "r", news: [] },
  ],
};

/** 급등 2종목 + 뉴스 — loadSurges 가 이 값을 반환하도록 mock supabase seed. */
function seedSurgeSupabase() {
  const sb = createMockSupabase();
  sb.from("stock_quotes").gte.mockResolvedValue({
    data: [
      { code: "005930", change_rate: 25 },
      { code: "000660", change_rate: 30 },
      { code: "347700", change_rate: 22 },
    ],
    error: null,
  });
  sb.from("stocks").in.mockResolvedValue({
    data: [
      { code: "005930", name: "삼성전자", market: "KOSPI" },
      { code: "000660", name: "SK하이닉스", market: "KOSPI" },
      { code: "347700", name: "라파스", market: "KOSDAQ" },
    ],
    error: null,
  });
  sb.from("news_articles").order.mockResolvedValue({
    data: [{ id: "n0", stock_code: "005930", title: "t", url: "u", source: "s", published_at: "2026-07-01T00:00:00Z" }],
    error: null,
  });
  return sb;
}

const NOW = new Date("2026-07-01T01:30:00Z"); // 10:30 KST

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("runHomeSyncCycle (hash-skip clone-append)", () => {
  it("hash-miss (첫 slot): cluster 1회 호출, is_carried=false, payload 저장", async () => {
    const sb = seedSurgeSupabase();
    // 직전 스냅샷 없음 (prev lookup 은 .limit(1) 종결).
    sb.from("home_theme_snapshots").limit.mockResolvedValue({ data: [], error: null });
    const cluster = vi.fn().mockResolvedValue(CLUSTER_PAYLOAD);

    const summary = await runHomeSyncCycle({
      config: cfg(),
      supabase: sb as never,
      cluster,
      now: NOW,
    });

    expect(cluster).toHaveBeenCalledTimes(1);
    expect(summary.isCarried).toBe(false);
    expect(summary.claudeCalled).toBe(true);
    expect(summary.themeCount).toBe(1);
    expect(summary.stockCount).toBe(3); // 테마 2 + single 1

    const upsertArg = sb._chains.home_theme_snapshots.upsert.mock.calls[0][0];
    expect(upsertArg.is_carried).toBe(false);
    expect(upsertArg.payload).toEqual(CLUSTER_PAYLOAD);
  });

  it("hash-match: cluster NOT called, 직전 payload 복제 + is_carried=true", async () => {
    const sb = seedSurgeSupabase();
    const cluster = vi.fn().mockResolvedValue(CLUSTER_PAYLOAD);

    // 먼저 hash 를 계산하기 위해 loadSurges/computeContentHash 를 실제 실행하는 대신,
    // 직전 스냅샷의 content_hash 를 "이번 cycle 이 계산할 값" 과 동일하게 주입한다.
    // → cycle 이 먼저 loadSurges + computeContentHash 로 hash 를 얻고, prev.content_hash 와 비교.
    // 이를 위해 prev 를 두 단계로: 첫 호출로 hash 확보 후 재실행.

    // 1) hash 확보용 dry run (직전 없음 — limit 종결 기본 [] ).
    sb.from("home_theme_snapshots").limit.mockResolvedValue({ data: [], error: null });
    const first = await runHomeSyncCycle({ config: cfg(), supabase: sb as never, cluster, now: NOW });
    const computedHash = sb._chains.home_theme_snapshots.upsert.mock.calls[0][0].content_hash;
    expect(first.isCarried).toBe(false);

    // 2) 직전 스냅샷이 동일 hash + 이전 payload 를 가지고 있는 상태로 재실행.
    const prevPayload: HomeSnapshotPayload = { ...CLUSTER_PAYLOAD, marketStatus: "open" };
    const sb2 = seedSurgeSupabase();
    sb2.from("home_theme_snapshots").limit.mockResolvedValue({
      data: [
        {
          content_hash: computedHash,
          theme_count: 1,
          stock_count: 3,
          payload: prevPayload,
        },
      ],
      error: null,
    });
    const cluster2 = vi.fn().mockResolvedValue(CLUSTER_PAYLOAD);

    const summary = await runHomeSyncCycle({
      config: cfg(),
      supabase: sb2 as never,
      cluster: cluster2,
      now: NOW,
    });

    expect(cluster2).not.toHaveBeenCalled();
    expect(summary.isCarried).toBe(true);
    expect(summary.claudeCalled).toBe(false);

    const upsertArg = sb2._chains.home_theme_snapshots.upsert.mock.calls[0][0];
    expect(upsertArg.is_carried).toBe(true);
    expect(upsertArg.payload).toEqual(prevPayload); // 직전 payload 복제
  });
});
