import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * quick-260928-nf6 — cycle 사전 예산 판정 회귀 테스트.
 *
 * 배경: 기존 판정은 종목 수 × 백필 최대 페이지(104 × 30 = 3,120)로 필요량을 잡아
 * 하루 사용량 ~1,880 이후 KST 자정까지 매 정각 cycle 이 skip 됐다
 * (2026-09-28 07:00Z budgetBefore=1986 · 104종목 · cap 5000).
 * 이제 "남은 예산 < 종목 수 × 1(최소 1페이지)" 일 때만 skip 하고,
 * 실제 상한은 onRequest 의 원자적 하드캡(incrementUsage → used > cap → stopAll)이 지킨다.
 *
 * 검증:
 *  1. 재현 — 1986/104/5000 에서 skip 없이 104종목 전부 수집
 *  2. 남은 예산 부족 — skip warn + 판정 근거 필드, 수집 0회
 *  3. 경계 — remaining == minRequired 이면 실행
 *  4. 하드캡 — 사전 판정 통과 후 수요가 상한을 넘으면 정확히 cap − budgetBefore 건만 허가
 *  모든 케이스에서 error 로그 0건 (알림 정책 jsonPayload.level>=50 무영향).
 *
 * 전략: 외부 I/O 모듈 전부 vi.mock. apiUsage 는 counter 하나로 원자적 RPC 를 흉내낸다.
 * vi.mock 는 파일 top 으로 hoisted 되므로 factory 내부 사용 변수는 vi.hoisted 로 선언.
 */

type LogCall = { obj: Record<string, unknown>; msg: string };

const hoist = vi.hoisted(() => {
  const state = {
    counter: 0,
    pagesPerStock: 1,
    granted: 0,
    targets: [] as Array<{ code: string; name: string }>,
  };
  const infoCalls: LogCall[] = [];
  const warnCalls: LogCall[] = [];
  const errorCalls: LogCall[] = [];
  return { state, infoCalls, warnCalls, errorCalls };
});

// === apiUsage — counter 기반 원자적 카운터 흉내 ===
vi.mock("../src/apiUsage", () => ({
  kstDateString: vi.fn(() => "2026-09-28"),
  checkBudget: vi.fn(async () => hoist.state.counter),
  incrementUsage: vi.fn(async (_sb: unknown, _date: string, amount = 1) => {
    hoist.state.counter += amount;
    return hoist.state.counter;
  }),
}));

// === loadTargets ===
vi.mock("../src/pipeline/targets", () => ({
  loadTargets: vi.fn(async () => hoist.state.targets),
}));

// === collectDiscussions — 실제 루프처럼 페이지마다 onRequest() ===
vi.mock("../src/pipeline/collectDiscussions", () => ({
  collectDiscussions: vi.fn(
    async (
      _proxy: unknown,
      _cfg: unknown,
      _sb: unknown,
      _code: string,
      onRequest: () => Promise<boolean>,
    ) => {
      let requests = 0;
      for (let page = 0; page < hoist.state.pagesPerStock; page++) {
        const ok = await onRequest();
        if (!ok) break;
        hoist.state.granted++;
        requests++;
      }
      return {
        rows: [],
        mode: "incremental" as const,
        requests,
        filteredByCutoff: 0,
        parsedCount: 0,
      };
    },
  ),
}));

// === upsert — 빈 결과 ===
vi.mock("../src/pipeline/upsert", () => ({
  upsertDiscussions: vi.fn(async () => ({ upserted: 0, unclassifiedRows: [] })),
}));

// === classify — Anthropic 의존 차단 (호출되지 않아야 정상) ===
vi.mock("../src/classify/classifyBatch", () => ({
  classifyBatch: vi.fn(async () => new Map()),
}));
vi.mock("../src/classify/persistRelevance", () => ({
  persistRelevance: vi.fn(async () => 0),
}));

// === retention / proxy / supabase — no-op ===
vi.mock("../src/retention", () => ({
  runRetention: vi.fn(async () => 0),
}));
vi.mock("../src/proxy/client", () => ({
  createProxyClient: vi.fn(() => ({})),
}));
vi.mock("../src/services/supabase", () => ({
  createSupabaseClient: vi.fn(() => ({})),
}));

// === logger spy — info / warn / error 캡처 ===
vi.mock("../src/logger", () => {
  const capture =
    (arr: LogCall[]) =>
    (obj: Record<string, unknown>, msg: string): void => {
      arr.push({ obj, msg });
    };
  const logChild: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
    child: ReturnType<typeof vi.fn>;
  } = {
    info: vi.fn(capture(hoist.infoCalls)),
    warn: vi.fn(capture(hoist.warnCalls)),
    error: vi.fn(capture(hoist.errorCalls)),
    debug: vi.fn(),
    child: vi.fn(),
  };
  logChild.child.mockReturnValue(logChild);
  return { createLogger: vi.fn(() => logChild) };
});

import { collectDiscussions } from "../src/pipeline/collectDiscussions";
import { runDiscussionSyncCycle } from "../src/index";

const SKIP_MSG = "budget would exceed — skipping cycle";
const PASS_MSG = "budget precheck passed";
const HARDCAP_MSG = "daily budget exceeded mid-cycle — stopAll";
const SUMMARY_MSG = "discussion-sync cycle complete";

const findInfo = (msg: string) => hoist.infoCalls.find((c) => c.msg === msg);
const warnsOf = (msg: string) => hoist.warnCalls.filter((c) => c.msg === msg);

beforeEach(() => {
  process.env.SUPABASE_URL = "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sr";
  process.env.BRIGHTDATA_API_KEY = "bd";
  process.env.ANTHROPIC_API_KEY = "test-anth";
  process.env.DISCUSSION_SYNC_DAILY_BUDGET = "5000";
  process.env.DISCUSSION_SYNC_BACKFILL_MAX_PAGES = "30";
  process.env.DISCUSSION_SYNC_CONCURRENCY = "3";

  hoist.infoCalls.length = 0;
  hoist.warnCalls.length = 0;
  hoist.errorCalls.length = 0;
  hoist.state.granted = 0;
  hoist.state.pagesPerStock = 1;
  hoist.state.targets = Array.from({ length: 104 }, (_, i) => ({
    code: String(i).padStart(6, "0"),
    name: `종목${i}`,
  }));
  vi.mocked(collectDiscussions).mockClear();
});

describe("quick-260928-nf6 사전 예산 판정", () => {
  it("재현: budgetBefore=1986 · 104종목 · cap 5000 · 백필 30페이지 → skip 없이 104종목 전부 수집", async () => {
    hoist.state.counter = 1986;

    await runDiscussionSyncCycle();

    expect(warnsOf(SKIP_MSG)).toHaveLength(0);
    expect(vi.mocked(collectDiscussions)).toHaveBeenCalledTimes(104);
    expect(findInfo(PASS_MSG)?.obj).toEqual({
      budgetBefore: 1986,
      targets: 104,
      minRequired: 104,
      remaining: 3014,
      cap: 5000,
    });
    const summary = findInfo(SUMMARY_MSG);
    expect(summary).toBeDefined();
    expect(summary?.obj.totalRequests).toBe(104);
    expect(summary?.obj.stopAll).toBe(false);
    expect(summary?.obj.budgetBefore).toBe(1986);
    expect(summary?.obj.budgetAfter).toBe(2090);
    expect(hoist.errorCalls).toHaveLength(0);
  });

  it("남은 예산 부족: budgetBefore=4950 (remaining 50 < 104) → skip warn + 판정 근거 필드, 수집 0회", async () => {
    hoist.state.counter = 4950;

    await runDiscussionSyncCycle();

    const skips = warnsOf(SKIP_MSG);
    expect(skips).toHaveLength(1);
    expect(skips[0].obj).toEqual({
      budgetBefore: 4950,
      targets: 104,
      minRequired: 104,
      remaining: 50,
      cap: 5000,
    });
    expect(vi.mocked(collectDiscussions)).not.toHaveBeenCalled();
    expect(findInfo(PASS_MSG)).toBeUndefined();
    expect(findInfo(SUMMARY_MSG)).toBeUndefined();
    expect(hoist.state.counter).toBe(4950);
    expect(hoist.errorCalls).toHaveLength(0);
  });

  it("경계: budgetBefore=4896 (remaining 104 == minRequired) → 실행, 정확히 cap 까지 사용", async () => {
    hoist.state.counter = 4896;

    await runDiscussionSyncCycle();

    expect(warnsOf(SKIP_MSG)).toHaveLength(0);
    expect(vi.mocked(collectDiscussions)).toHaveBeenCalledTimes(104);
    expect(hoist.state.granted).toBe(104);
    expect(hoist.state.counter).toBe(5000);
    expect(findInfo(SUMMARY_MSG)?.obj.stopAll).toBe(false);
    expect(warnsOf(HARDCAP_MSG)).toHaveLength(0);
    expect(hoist.errorCalls).toHaveLength(0);
  });

  it("하드캡: budgetBefore=4890 · 종목당 2페이지(수요 208 > 남은 110) → 정확히 110건만 허가 후 stopAll", async () => {
    hoist.state.counter = 4890;
    hoist.state.pagesPerStock = 2;

    await runDiscussionSyncCycle();

    expect(warnsOf(SKIP_MSG)).toHaveLength(0);
    const hardcaps = warnsOf(HARDCAP_MSG);
    expect(hardcaps.length).toBeGreaterThanOrEqual(1);
    expect(hardcaps[0].obj.cap).toBe(5000);
    expect(hardcaps[0].obj.used as number).toBeGreaterThan(5000);
    expect(hoist.state.granted).toBe(110);
    expect(findInfo(SUMMARY_MSG)?.obj.stopAll).toBe(true);
    expect(hoist.errorCalls).toHaveLength(0);
  });
});
