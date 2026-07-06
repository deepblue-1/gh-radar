import { describe, it, expect, vi, beforeEach } from "vitest";
import { runHomeSyncCycle, computeSlot } from "./index";
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
  // loadSurges 급등 쿼리는 이중 gte(change_rate + updated_at 신선도 필터). change_rate gte 는
  // chain 유지, updated_at gte 가 종결 resolve (quick 260707-bqj).
  const q = sb.from("stock_quotes");
  q.gte.mockImplementation((col: string) =>
    col === "updated_at"
      ? Promise.resolve({
          data: [
            { code: "005930", change_rate: 25 },
            { code: "000660", change_rate: 30 },
            { code: "347700", change_rate: 22 },
          ],
          error: null,
        })
      : q,
  );
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

describe("computeSlot (10분 슬롯 flooring)", () => {
  // KST = UTC + 9h. now(UTC) → KST slot 검증.
  it("10:37 KST → capturedAt 10:30 슬롯 (10분 floor), open", () => {
    // 10:37 KST = 01:37 UTC.
    const r = computeSlot(new Date("2026-07-01T01:37:00Z"));
    expect(r.tradeDate).toBe("2026-07-01");
    // 10:30 KST = 01:30 UTC.
    expect(r.capturedAt).toBe("2026-07-01T01:30:00.000Z");
    expect(r.marketStatus).toBe("open");
  });

  it("10:42 KST → capturedAt 10:40 슬롯", () => {
    // 10:42 KST = 01:42 UTC → floor 10:40 = 01:40 UTC.
    const r = computeSlot(new Date("2026-07-01T01:42:00Z"));
    expect(r.capturedAt).toBe("2026-07-01T01:40:00.000Z");
    expect(r.marketStatus).toBe("open");
  });

  it("10:30 KST → 10:30 유지 (경계, 회귀 없음)", () => {
    // 10:30 KST = 01:30 UTC → floor 유지.
    const r = computeSlot(new Date("2026-07-01T01:30:00Z"));
    expect(r.capturedAt).toBe("2026-07-01T01:30:00.000Z");
    expect(r.marketStatus).toBe("open");
  });

  it("15:00 KST → open (마감 전)", () => {
    // 15:00 KST = 06:00 UTC.
    const r = computeSlot(new Date("2026-07-01T06:00:00Z"));
    expect(r.capturedAt).toBe("2026-07-01T06:00:00.000Z");
    expect(r.marketStatus).toBe("open");
  });

  it("15:30 KST → closed (정규장 마감)", () => {
    // 15:30 KST = 06:30 UTC.
    const r = computeSlot(new Date("2026-07-01T06:30:00Z"));
    expect(r.capturedAt).toBe("2026-07-01T06:30:00.000Z");
    expect(r.marketStatus).toBe("closed");
  });

  it("15:40 KST → closed (마감 후)", () => {
    // 15:40 KST = 06:40 UTC → floor 15:40 = 06:40 UTC.
    const r = computeSlot(new Date("2026-07-01T06:40:00Z"));
    expect(r.capturedAt).toBe("2026-07-01T06:40:00.000Z");
    expect(r.marketStatus).toBe("closed");
  });

  it("16:05 KST → closed (16시대는 slotMinute 무관 closed)", () => {
    // 16:05 KST = 07:05 UTC → floor 16:00 = 07:00 UTC.
    const r = computeSlot(new Date("2026-07-01T07:05:00Z"));
    expect(r.capturedAt).toBe("2026-07-01T07:00:00.000Z");
    expect(r.marketStatus).toBe("closed");
  });

  it("08:37 KST → premarket, 08:30 슬롯 (NXT 프리마켓)", () => {
    // 08:37 KST = 2026-06-30 23:37 UTC → floor 08:30 = 2026-06-30 23:30 UTC.
    const r = computeSlot(new Date("2026-06-30T23:37:00Z"));
    expect(r.capturedAt).toBe("2026-06-30T23:30:00.000Z");
    expect(r.marketStatus).toBe("premarket");
    expect(r.afterClose).toBe(false);
  });

  it("08:00 KST → premarket (프리마켓 시작)", () => {
    // 08:00 KST = 2026-06-30 23:00 UTC.
    const r = computeSlot(new Date("2026-06-30T23:00:00Z"));
    expect(r.marketStatus).toBe("premarket");
  });

  it("09:00 KST → open (프리마켓 경계 회귀 없음)", () => {
    // 09:00 KST = 2026-07-01 00:00 UTC.
    const r = computeSlot(new Date("2026-07-01T00:00:00Z"));
    expect(r.marketStatus).toBe("open");
  });
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
      loadSurgesOptions: { retryDelayMs: 0 },
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

describe("runHomeSyncCycle (마감 초과 슬롯 skip)", () => {
  it("15:40 KST → skipped=true, DB/cluster 호출 없음 (upsert 없음)", async () => {
    const sb = createMockSupabase();
    const cluster = vi.fn();

    const summary = await runHomeSyncCycle({
      config: cfg(),
      supabase: sb as never,
      cluster,
      now: new Date("2026-07-01T06:40:00Z"), // 15:40 KST
      loadSurgesOptions: { retryDelayMs: 0 },
    });

    expect(summary.skipped).toBe(true);
    expect(cluster).not.toHaveBeenCalled();
    expect(sb._chains.home_theme_snapshots?.upsert).toBeUndefined(); // 테이블 접근 자체 없음
  });

  it("15:30 KST(마감 종가 슬롯) → skip 아님, 정상 실행", async () => {
    const sb = seedSurgeSupabase();
    sb.from("home_theme_snapshots").limit.mockResolvedValue({ data: [], error: null });
    const cluster = vi.fn().mockResolvedValue(CLUSTER_PAYLOAD);

    const summary = await runHomeSyncCycle({
      config: cfg(),
      supabase: sb as never,
      cluster,
      now: new Date("2026-07-01T06:30:00Z"), // 15:30 KST
      loadSurgesOptions: { retryDelayMs: 0 },
    });

    expect(summary.skipped).toBeUndefined();
    expect(sb._chains.home_theme_snapshots.upsert).toHaveBeenCalled();
  });
});

describe("runHomeSyncCycle (transient-empty 가드)", () => {
  /** stock_quotes gte → [] (급등 0) 로 seed. */
  function seedEmptySupabase() {
    const sb = createMockSupabase();
    // 이중 gte(change_rate + updated_at) 대응 — updated_at gte 가 종결 resolve([]).
    const q = sb.from("stock_quotes");
    q.gte.mockImplementation((col: string) =>
      col === "updated_at" ? Promise.resolve({ data: [], error: null }) : q,
    );
    return sb;
  }

  it("surges 0 + 오늘 non-empty 존재: cluster NOT called, 마지막 non-empty payload clone-append (is_carried=true)", async () => {
    const sb = seedEmptySupabase();
    // prevRow(latest) + lastGood(gt stock_count 0) 모두 .limit 종결 → GOOD payload 주입.
    sb.from("home_theme_snapshots").limit.mockResolvedValue({
      data: [{ payload: CLUSTER_PAYLOAD, content_hash: "x", stock_count: 3 }],
      error: null,
    });
    const cluster = vi.fn().mockResolvedValue(CLUSTER_PAYLOAD);

    const summary = await runHomeSyncCycle({
      config: cfg(),
      supabase: sb as never,
      cluster,
      now: NOW,
      loadSurgesOptions: { retryDelayMs: 0 },
    });

    expect(cluster).not.toHaveBeenCalled();
    expect(summary.isCarried).toBe(true);
    expect(summary.claudeCalled).toBe(false);
    expect(summary.stockCount).toBe(3); // 복제된 non-empty payload (테마 2 + single 1)

    const upsertArg = sb._chains.home_theme_snapshots.upsert.mock.calls[0][0];
    expect(upsertArg.is_carried).toBe(true);
    expect(upsertArg.payload).toEqual(CLUSTER_PAYLOAD);
  });

  it("surges 0 + 오늘 non-empty 없음(진짜 급등 없는 날): 빈 payload append (is_carried=false, stocks 0)", async () => {
    const sb = seedEmptySupabase();
    // prevRow + lastGood 모두 [] → carry 대상 없음.
    sb.from("home_theme_snapshots").limit.mockResolvedValue({ data: [], error: null });
    const cluster = vi.fn().mockResolvedValue(CLUSTER_PAYLOAD);

    const summary = await runHomeSyncCycle({
      config: cfg(),
      supabase: sb as never,
      cluster,
      now: NOW,
      loadSurgesOptions: { retryDelayMs: 0 },
    });

    expect(cluster).not.toHaveBeenCalled();
    expect(summary.isCarried).toBe(false);
    expect(summary.claudeCalled).toBe(false);
    expect(summary.themeCount).toBe(0);
    expect(summary.stockCount).toBe(0);

    const upsertArg = sb._chains.home_theme_snapshots.upsert.mock.calls[0][0];
    expect(upsertArg.payload.themes).toEqual([]);
    expect(upsertArg.payload.singles).toEqual([]);
  });
});
