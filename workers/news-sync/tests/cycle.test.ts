import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * quick-260915-il4 — runNewsSyncCycle 를 끝까지 돌리는 결정적 하네스.
 *
 * I/O 경계(config · logger · supabase · naver client · targets · lastSeen · upsert · retention ·
 * apiUsage 카운터)만 mock 하고, collectStockNews · searchNews · classify · cadence(full) 는 실제 구현을 쓴다.
 * 그래서 탐침 경로의 "네이버 호출 수" 가 실제 재시도 로직을 통과한 값으로 단언된다.
 */

type Step =
  | { kind: "ok" }
  | { kind: "http"; status: number; body: unknown }
  | { kind: "net" };

const h = vi.hoisted(() => {
  const rec: Record<string, unknown> & {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  } = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  rec.child = () => rec;
  return {
    rec,
    events: [] as string[],
    queues: new Map<string, unknown[]>(),
    get: vi.fn(),
    loadTargets: vi.fn(),
    upsertNews: vi.fn(),
    readQuotaStrikes: vi.fn(),
    recordQuotaStrike: vi.fn(),
    checkBudget: vi.fn(),
    incrementUsage: vi.fn(),
  };
});

vi.mock("../src/config", () => ({
  loadConfig: () => ({
    supabaseUrl: "https://x.supabase.co",
    supabaseServiceRoleKey: "svc",
    naverClientId: "cid",
    naverClientSecret: "csecret",
    naverBaseUrl: "https://openapi.naver.com",
    naverDailyBudget: 18750,
    newsSyncMode: "full",
    newsSyncConcurrency: 3,
    appVersion: "test",
    logLevel: "info",
  }),
}));
vi.mock("../src/logger", () => ({
  createLogger: () => ({ child: () => h.rec }),
}));
vi.mock("../src/services/supabase", () => ({
  createSupabaseClient: () => ({}),
}));
vi.mock("../src/naver/client", () => ({
  createNaverClient: () => ({ get: h.get }),
}));
vi.mock("../src/pipeline/targets", () => ({ loadTargets: h.loadTargets }));
vi.mock("../src/pipeline/lastSeen", () => ({
  loadLastSeenMap: async () => new Map(),
}));
vi.mock("../src/pipeline/upsert", () => ({ upsertNews: h.upsertNews }));
vi.mock("../src/retention", () => ({ runRetention: async () => 0 }));
vi.mock("../src/apiUsage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/apiUsage")>();
  return {
    ...actual,
    readQuotaStrikes: h.readQuotaStrikes,
    recordQuotaStrike: h.recordQuotaStrike,
    checkBudget: h.checkBudget,
    incrementUsage: h.incrementUsage,
  };
});

import { runNewsSyncCycle } from "../src/index";

const TARGETS = [
  { code: "000001", name: "알파", rank: 1, watched: false },
  { code: "000002", name: "베타", rank: 2, watched: false },
  { code: "000003", name: "감마", rank: 3, watched: false },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function queue(name: string, ...steps: Step[]): void {
  h.queues.set(name, steps);
}

function http(status: number, body: unknown = {}): Step {
  return { kind: "http", status, body };
}

function getCallsFor(name: string): number {
  return h.get.mock.calls.filter(
    (c) => (c[1] as { params: { query: string } }).params.query === name,
  ).length;
}

function summary(): Record<string, unknown> {
  const call = h.rec.info.mock.calls.find((c) => c[1] === "news-sync cycle complete");
  if (!call) throw new Error("cycle complete log not found");
  return call[0] as Record<string, unknown>;
}

function infoCount(msg: string): number {
  return h.rec.info.mock.calls.filter((c) => c[1] === msg).length;
}

function allMessages(): string[] {
  return [h.rec.info, h.rec.warn, h.rec.error, h.rec.debug].flatMap((fn) =>
    fn.mock.calls.map((c) => String(c[1] ?? c[0])),
  );
}

const PASSED = "quota probe passed — resuming";

beforeEach(() => {
  vi.clearAllMocks();
  h.events.length = 0;
  h.queues.clear();

  h.get.mockImplementation(
    async (_url: string, opts: { params: { query: string } }) => {
      const name = opts.params.query;
      h.events.push(`${name}:start`);
      const step = (h.queues.get(name)?.shift() as Step | undefined) ?? { kind: "ok" };
      try {
        if (step.kind === "ok") {
          await sleep(10);
          return { data: { items: [] } };
        }
        await sleep(1);
        if (step.kind === "http") {
          const e = new Error(`HTTP ${step.status}`) as Error & { response: unknown };
          e.response = { status: step.status, data: step.body };
          throw e;
        }
        throw new Error("ECONNRESET");
      } finally {
        h.events.push(`${name}:end`);
      }
    },
  );
  h.loadTargets.mockResolvedValue(TARGETS.map((t) => ({ ...t })));
  h.upsertNews.mockResolvedValue({ inserted: 0 });
  h.readQuotaStrikes.mockResolvedValue(0);
  h.recordQuotaStrike.mockResolvedValue(1);
  h.checkBudget.mockResolvedValue(0);
  h.incrementUsage.mockResolvedValue(1);
});

describe("runNewsSyncCycle — 한도 소진 탐침 (quick-260915-il4)", () => {
  it("C1 strike 0 — 탐침 없이 3종목 모두 수집", async () => {
    await runNewsSyncCycle();

    expect(h.get).toHaveBeenCalledTimes(3);
    expect(h.upsertNews).toHaveBeenCalledTimes(3);
    expect(h.recordQuotaStrike).not.toHaveBeenCalled();
    expect(allMessages().filter((m) => /quota probe|probing/.test(m))).toHaveLength(0);
    const s = summary();
    expect(s.strikesToday).toBe(0);
    expect(s.quotaProbe).toBeNull();
    expect(s.quotaAbort).toBeNull();
  });

  it("C2 strike 1 · 전부 성공 — 첫 종목 단독 탐침 후 재개", async () => {
    h.readQuotaStrikes.mockResolvedValue(1);

    await runNewsSyncCycle();

    expect(h.get).toHaveBeenCalledTimes(3);
    expect(h.upsertNews).toHaveBeenCalledTimes(3);
    expect((h.get.mock.calls[0][1] as { params: { query: string } }).params.query).toBe(
      "알파",
    );
    const probeEnd = h.events.indexOf("알파:end");
    expect(probeEnd).toBeGreaterThanOrEqual(0);
    expect(probeEnd).toBeLessThan(h.events.indexOf("베타:start"));
    expect(probeEnd).toBeLessThan(h.events.indexOf("감마:start"));
    expect(infoCount(PASSED)).toBe(1);
    const s = summary();
    expect(s.quotaProbe).toBe("passed");
    expect(s.quotaAbort).toBeNull();
    expect(s.strikesToday).toBe(1);
  });

  it("C3 strike 1 · 탐침 429 소진 본문 — 네이버 호출 1건 후 run 중단 · strike 1회", async () => {
    h.readQuotaStrikes.mockResolvedValue(1);
    queue("알파", http(429, { errorCode: "010", errorMessage: "Query limit exceeded" }));

    await runNewsSyncCycle();

    expect(h.get).toHaveBeenCalledTimes(1);
    expect(h.recordQuotaStrike).toHaveBeenCalledTimes(1);
    expect(h.upsertNews).not.toHaveBeenCalled();
    expect(infoCount(PASSED)).toBe(0);
    const s = summary();
    expect(s.quotaAbort).toBe("explicit");
    expect(s.quotaProbe).toBe("rate-limited");
    expect(s.skipped).toBe(2);
  });

  it.each([
    ["errorCode 012 · Rate limit exceeded", { errorCode: "012", errorMessage: "Rate limit exceeded" }],
    ["빈 본문", {}],
  ])(
    "C4 strike 1 · 탐침 429 일반 본문(%s) — backoff 재시도 없이 1건 후 중단",
    async (_label, body) => {
      h.readQuotaStrikes.mockResolvedValue(1);
      queue("알파", http(429, body));

      await runNewsSyncCycle();

      expect(h.get).toHaveBeenCalledTimes(1);
      expect(h.recordQuotaStrike).toHaveBeenCalledTimes(1);
      expect(h.upsertNews).not.toHaveBeenCalled();
      expect(infoCount(PASSED)).toBe(0);
      const s = summary();
      expect(s.quotaAbort).toBe("probe");
      expect(s.quotaProbe).toBe("rate-limited");
      expect(s.skipped).toBe(2);
      expect(s.errors).toBe(1);
    },
  );

  it.each([
    ["HTTP 400", [http(400, { errorMessage: "bad" })], 3],
    ["네트워크 에러(응답 없음)", [{ kind: "net" } as Step, { kind: "net" } as Step], 4],
  ])(
    "C5 strike 1 · 탐침 비429 실패(%s) — run 계속",
    async (_label, steps, totalGets) => {
      h.readQuotaStrikes.mockResolvedValue(1);
      queue("알파", ...(steps as Step[]));

      await runNewsSyncCycle();

      expect(h.get).toHaveBeenCalledTimes(totalGets as number);
      expect(h.upsertNews).toHaveBeenCalledTimes(2);
      expect(h.recordQuotaStrike).not.toHaveBeenCalled();
      expect(infoCount(PASSED)).toBe(1);
      const s = summary();
      expect(s.errors).toBe(1);
      expect(s.quotaProbe).toBe("passed");
      expect(s.quotaAbort).toBeNull();
    },
    10_000,
  );

  it.each([2, 7])(
    "C6 strike %i — 당일 사전 skip 없이 대상 로드 후 탐침·재개",
    async (strikes) => {
      h.readQuotaStrikes.mockResolvedValue(strikes);

      await runNewsSyncCycle();

      expect(h.loadTargets).toHaveBeenCalledTimes(1);
      expect(h.get).toHaveBeenCalledTimes(3);
      expect(infoCount(PASSED)).toBe(1);
      expect(summary().strikesToday).toBe(strikes);
    },
  );

  it("C7 회귀 잠금 strike 0 — 비탐침 429 는 250ms·500ms backoff 3회 시도 유지", async () => {
    queue("베타", http(429), http(429), http(429));

    await runNewsSyncCycle();

    expect(getCallsFor("베타")).toBe(3);
    expect(h.recordQuotaStrike).not.toHaveBeenCalled();
    expect(h.upsertNews).toHaveBeenCalledTimes(2);
    const s = summary();
    expect(s.quotaProbe).toBeNull();
    expect(s.quotaAbort).toBeNull();
    expect(s.errors).toBe(1);
  });
});
