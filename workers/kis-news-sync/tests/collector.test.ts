import { describe, expect, it, vi } from "vitest";
import {
  FEED_MAX_PAGES_SLOW,
  LEASE_TTL_S,
  RATE_LIMIT_PAUSE_MS,
  runCollector,
  type CollectorDeps,
} from "../src/collector";
import { KisApiError } from "../src/kis/client";
import type { NewsTitleQuery } from "../src/kis/newsTitle";
import type { KisNewsTitleRow } from "../src/kis/types";
import type { KisNewsMode } from "../src/config";
import type { TargetInfo } from "../src/pipeline/scheduler";

/**
 * Phase 41-08 — 장기 실행 수집 루프. 가짜 시계(sleep 이 시계를 앞당긴다) · 가짜 DB · 가짜 한투로
 * 13시간 실행의 동작을 몇 초 안에 단언한다. 실제 한투 · Supabase 호출 없음.
 */

const SECRET_TOKEN = "SECRET-TOKEN-DO-NOT-LOG-777";
const HOLDER = "exec-1:abcd1234";

/** KST 벽시계 → epoch ms (2026-11-16 = 월요일 · 11-14 = 토요일) */
const kst = (ymd: string, hms: string) => Date.parse(`${ymd}T${hms}+09:00`);
const MON_10 = kst("2026-11-16", "10:00:00");

const OLD_SRNO = "2026111100000000001";
const LAST_SRNO = "2026111200000000000";
const srno = (n: number) => String(20261116100000000000n + BigInt(n));

function row(no: string, over: Partial<KisNewsTitleRow> = {}): KisNewsTitleRow {
  const base: Record<string, string> = {
    cntt_usiq_srno: no,
    news_ofer_entp_code: "2",
    data_dt: "20261116",
    data_tm: "100000",
    hts_pbnt_titl_cntt: `제목 ${no}`,
    news_lrdv_code: "",
    dorg: "연합뉴스",
  };
  for (let i = 1; i <= 10; i++) {
    base[`iscd${i}`] = "";
    base[`kor_isnm${i}`] = " ";
  }
  base.iscd1 = "005930";
  return { ...base, ...over } as unknown as KisNewsTitleRow;
}

type Flow = "feed" | "F" | "G" | "stock";
const flowOf = (q: NewsTitleQuery): Flow =>
  q.stockCode ? "stock" : q.providerCode === "F" ? "F" : q.providerCode === "G" ? "G" : "feed";

interface Call {
  at: number;
  flow: Flow;
  query: NewsTitleQuery;
  token: string;
}

interface LogLine {
  level: "info" | "warn" | "error";
  obj: Record<string, unknown>;
  msg: string;
}

function codes(n: number, from = 100): string[] {
  return Array.from({ length: n }, (_, i) => String(from + i).padStart(6, "0"));
}

function targetsOf(list: string[], over: Partial<TargetInfo> = {}): TargetInfo[] {
  return list.map((code, i) => ({
    code,
    reasons: ["mover"],
    rank: i + 1,
    lastRequestedAt: null,
    lastCollectedAt: null,
    ...over,
  }));
}

interface HarnessOpts {
  start?: number;
  mode?: KisNewsMode;
  /** 이 시각이 되면 abort(SIGTERM 흉내) */
  stopAt?: number;
  lease?: (n: number) => boolean | Promise<boolean>;
  used?: number;
  budget?: number;
  strikes?: number;
  lastSrno?: string | null;
  cleanupDate?: string | null;
  targets?: (now: number, n: number) => TargetInfo[];
  /** 한투 한 쪽 — 던지면 실패 */
  page?: (q: NewsTitleQuery, ctx: { now: number; n: number; flowN: number }) => KisNewsTitleRow[] | Promise<KisNewsTitleRow[]>;
  token?: (args: { canIssue: boolean; force: boolean }, n: number) => string | Promise<string>;
}

function harness(o: HarnessOpts = {}) {
  let t = o.start ?? MON_10;
  const ac = new AbortController();
  const logs: LogLine[] = [];
  const calls: Call[] = [];
  const flowCounts: Record<Flow, number> = { feed: 0, F: 0, G: 0, stock: 0 };
  let used = o.used ?? 0;
  let pending = 0;
  let leaseN = 0;
  let tokenN = 0;
  let targetsN = 0;
  let feedSeq = 0;

  const usage = {
    read: vi.fn(async () => used),
    add: vi.fn((n: number) => {
      pending += n;
    }),
    flush: vi.fn(async () => {
      if (pending === 0) return null;
      used += pending;
      pending = 0;
      return used;
    }),
  };

  const defaultPage = (q: NewsTitleQuery): KisNewsTitleRow[] => {
    const f = flowOf(q);
    if (f === "feed") {
      feedSeq += 1;
      return [row(srno(feedSeq)), row(OLD_SRNO)];
    }
    return [];
  };

  const deps: CollectorDeps = {
    cfg: { maxRps: 5, dailyBudget: o.budget ?? 200_000, mode: o.mode ?? "auto", targetCap: 450 },
    log: {
      info: (obj, msg) => logs.push({ level: "info", obj, msg }),
      warn: (obj, msg) => logs.push({ level: "warn", obj, msg }),
      error: (obj, msg) => logs.push({ level: "error", obj, msg }),
    },
    clock: { now: () => t },
    sleep: vi.fn(async (ms: number) => {
      t += Math.max(0, ms);
      if (o.stopAt !== undefined && t >= o.stopAt) ac.abort();
    }),
    signal: ac.signal,
    holder: HOLDER,
    db: {
      leaseAcquire: vi.fn(async () => {
        leaseN += 1;
        return o.lease ? o.lease(leaseN) : true;
      }),
      leaseRelease: vi.fn(async () => true),
      readState: vi.fn(async () => ({
        lastSrno: o.lastSrno === undefined ? LAST_SRNO : o.lastSrno,
        cleanupDate: o.cleanupDate ?? null,
      })),
      loadStockMeta: vi.fn(async () => new Map([["005930", { name: "삼성전자", group: "주권" }]])),
      loadTargets: vi.fn(async () => {
        targetsN += 1;
        return o.targets ? o.targets(t, targetsN) : [];
      }),
      ingest: vi.fn(async () => ({ inserted: 1, revisions: 0, linked: 1 })),
      cleanup: vi.fn(async () => ({ news_deleted: 0, targets_deleted: 0 })),
      usage,
      strikes: { read: vi.fn(async () => o.strikes ?? 0), record: vi.fn(async () => (o.strikes ?? 0) + 1) },
    },
    kis: {
      token: vi.fn(async (args: { canIssue: boolean; force: boolean }) => {
        tokenN += 1;
        return o.token ? o.token(args, tokenN) : SECRET_TOKEN;
      }),
      page: vi.fn(async (query: NewsTitleQuery, token: string) => {
        const flow = flowOf(query);
        flowCounts[flow] += 1;
        calls.push({ at: t, flow, query, token });
        const ctx = { now: t, n: calls.length, flowN: flowCounts[flow] };
        return o.page ? o.page(query, ctx) : defaultPage(query);
      }),
    },
  };
  return {
    deps,
    logs,
    calls,
    now: () => t,
    usage,
    flows: (f: Flow) => calls.filter((c) => c.flow === f),
    run: () => runCollector(deps),
  };
}

function maxPerSecond(times: number[]): number {
  let max = 0;
  for (const s of times) max = Math.max(max, times.filter((x) => x >= s && x < s + 1_000).length);
  return max;
}

const has = (logs: LogLine[], level: LogLine["level"], re: RegExp) =>
  logs.filter((l) => l.level === level && re.test(l.msg));

// ── 시작 · 임대 · 예산 · 탐침 ─────────────────────────────────────────
describe("시작", () => {
  it("임대 못 잡음(fast) → 종료 0 · 한투 호출 0 · 「lease held by another run」 info", async () => {
    const h = harness({ lease: () => false });
    const r = await h.run();
    expect(r.code).toBe(0);
    expect(h.calls).toHaveLength(0);
    expect(h.deps.kis.token).not.toHaveBeenCalled();
    expect(has(h.logs, "info", /lease held by another run/)).toHaveLength(1);
    expect(h.deps.db.leaseAcquire).toHaveBeenCalledWith(HOLDER, LEASE_TTL_S);
    expect(h.deps.db.leaseRelease).not.toHaveBeenCalled();
  });

  it("시작 시 당일 사용량 ≥ 상한 → 종료 0 · 한투 호출 0 · warn", async () => {
    const h = harness({ used: 200_000 });
    const r = await h.run();
    expect(r.code).toBe(0);
    expect(h.calls).toHaveLength(0);
    expect(h.deps.kis.token).not.toHaveBeenCalled();
    expect(h.logs.filter((l) => l.level === "warn")).toHaveLength(1);
    expect(h.deps.db.leaseRelease).toHaveBeenCalledWith(HOLDER);
  });

  it("당일 한도 의심 표시 > 0 → 탐침 1건 먼저 · 실패하면 종료 1 · 그 뒤 호출 0", async () => {
    const h = harness({
      strikes: 1,
      stopAt: MON_10 + 30_000,
      page: () => {
        throw new KisApiError(200, "OPSQ9999", "모르는 오류");
      },
    });
    const r = await h.run();
    expect(r.code).toBe(1);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].flow).toBe("feed");
    expect(h.deps.db.strikes.record).not.toHaveBeenCalled();
  });

  it("당일 한도 의심 표시 > 0 · 탐침 성공하면 정상 진행", async () => {
    const h = harness({ strikes: 2, stopAt: MON_10 + 10_000 });
    const r = await h.run();
    expect(r.code).toBe(0);
    expect(h.calls[0].flow).toBe("feed");
    expect(h.calls.length).toBeGreaterThan(3);
    expect(has(h.logs, "info", /quota probe ok/)).toHaveLength(1);
  });

  it("시작 토큰 실패 → 61초 뒤 1회만 다시 · 또 실패면 종료 1 · 발급 요청 2번", async () => {
    const h = harness({
      token: () => {
        throw new KisApiError(403, "EGW00133", "접근토큰 발급 잠시 후 다시 시도하세요(1분당 1회)");
      },
    });
    const r = await h.run();
    expect(r.code).toBe(1);
    expect(h.deps.kis.token).toHaveBeenCalledTimes(2);
    expect(h.now() - MON_10).toBeGreaterThanOrEqual(61_000);
    expect(h.calls).toHaveLength(0);
  });
});

describe("probe 모드", () => {
  it("probe → 전체 최신 1쪽 · 들여오기(feed) 1번 · 「probe ok」 info(들여온 수) · 임대 없으면 발급 없이 DB 토큰", async () => {
    const h = harness({ mode: "probe", lease: () => false });
    const r = await h.run();
    expect(r.code).toBe(0);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].flow).toBe("feed");
    expect(h.deps.db.ingest).toHaveBeenCalledTimes(1);
    expect(vi.mocked(h.deps.db.ingest).mock.calls[0][1]).toBe("feed");
    const ok = has(h.logs, "info", /^probe ok$/);
    expect(ok).toHaveLength(1);
    expect(ok[0].obj).toMatchObject({ inserted: 1 });
    expect(h.deps.kis.token).toHaveBeenCalledWith({ canIssue: false, force: false });
    expect(h.deps.db.leaseRelease).not.toHaveBeenCalled();
  });

  it("probe 가 임대를 잡았으면 끝날 때 해제한다", async () => {
    const h = harness({ mode: "probe" });
    await h.run();
    expect(h.deps.kis.token).toHaveBeenCalledWith({ canIssue: true, force: false });
    expect(h.deps.db.leaseRelease).toHaveBeenCalledWith(HOLDER);
  });
});

// ── fast 모드 ───────────────────────────────────────────────────────
describe("fast 모드 — 가짜 시계 30초", () => {
  const run30 = async () => {
    const h = harness({ stopAt: MON_10 + 30_000, targets: () => targetsOf(codes(200)) });
    const r = await h.run();
    return { h, r };
  };

  it("흐름별 호출: 전체 최신 ≈ 6번(5초) · F · G 각 1번 · 대상 다시 읽기 ≈ 3번", async () => {
    const { h, r } = await run30();
    expect(r.code).toBe(0);
    expect(h.flows("feed").length).toBeGreaterThanOrEqual(6);
    expect(h.flows("feed").length).toBeLessThanOrEqual(7);
    const feedAt = h.flows("feed").map((c) => c.at - MON_10);
    for (let i = 1; i < feedAt.length; i++) expect(feedAt[i] - feedAt[i - 1]).toBeGreaterThanOrEqual(5_000);
    expect(h.flows("F")).toHaveLength(1);
    expect(h.flows("G")).toHaveLength(1);
    expect(vi.mocked(h.deps.db.loadTargets).mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(vi.mocked(h.deps.db.loadTargets).mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("종목별 호출 ≤ 초당 2.5 · 모든 호출 합 어느 1초 창에서도 ≤ 5", async () => {
    const { h } = await run30();
    const stockAt = h.flows("stock").map((c) => c.at);
    expect(stockAt.length).toBeGreaterThan(50);
    expect(stockAt.length).toBeLessThanOrEqual(76);
    for (let i = 1; i < stockAt.length; i++) expect(stockAt[i] - stockAt[i - 1]).toBeGreaterThanOrEqual(400);
    expect(maxPerSecond(h.calls.map((c) => c.at))).toBeLessThanOrEqual(5);
  });

  it("종목별 조회 결과는 그 코드로 들여오기(via stock) — 글 0건이어도 들여오기 호출(수집 시각)", async () => {
    const { h } = await run30();
    const ingests = vi.mocked(h.deps.db.ingest).mock.calls.filter((c) => c[1] === "stock");
    expect(ingests.length).toBe(h.flows("stock").length);
    const first = h.flows("stock")[0].query.stockCode;
    expect(ingests[0]).toEqual([[], "stock", first]);
  });

  it("새 등록 종목이 다음 종목 호출 대상", async () => {
    const h = harness({
      stopAt: MON_10 + 30_000,
      targets: (now) =>
        now >= MON_10 + 15_000
          ? [...targetsOf(codes(200)), ...targetsOf(["999999"], { reasons: ["registered"], rank: null, lastRequestedAt: now })]
          : targetsOf(codes(200)),
    });
    await h.run();
    // 15초 뒤 첫 다시 읽기(20초)에 새 등록이 들어온다 → 그 뒤 첫 종목별 호출이 그것
    expect(h.calls.some((c) => c.flow === "stock" && c.at < MON_10 + 20_000 && c.query.stockCode === "999999")).toBe(false);
    const afterReload = h.calls.filter((c) => c.flow === "stock" && c.at >= MON_10 + 20_000);
    expect(afterReload.length).toBeGreaterThan(0);
    expect(afterReload[0].query.stockCode).toBe("999999");
    expect(h.calls.filter((c) => c.query.stockCode === "999999")).toHaveLength(1);
  });

  it("전체 최신은 마지막 본 일련번호까지만(1쪽) · 들여오기 via feed", async () => {
    const { h } = await run30();
    const feedIngests = vi.mocked(h.deps.db.ingest).mock.calls.filter((c) => c[1] === "feed");
    expect(feedIngests.length).toBe(h.flows("feed").length + 2); // + F · G
    // 매번 마지막 본 글이 1쪽에 있으므로 커서로 다음 쪽을 부르지 않는다
    for (const c of h.flows("feed")) expect(c.query.cursor ?? null).toBeNull();
  });

  it("사용량은 10초마다 flush — 끝날 때 남은 것도 flush", async () => {
    const { h } = await run30();
    expect(h.usage.add).toHaveBeenCalled();
    const flushes = h.usage.flush.mock.calls.length;
    expect(flushes).toBeGreaterThanOrEqual(3);
    expect(flushes).toBeLessThanOrEqual(5);
    const added = h.usage.add.mock.calls.reduce((a, c) => a + (c[0] as number), 0);
    expect(added).toBe(h.calls.length);
  });

  it("SIGTERM(abort) → 다음 걸음에서 끝내고 임대 해제 · 종료 0", async () => {
    const { h, r } = await run30();
    expect(r).toEqual({ code: 0, reason: "aborted" });
    expect(h.deps.db.leaseRelease).toHaveBeenCalledWith(HOLDER);
  });
});

describe("fast 모드 — 끝 · 임대", () => {
  it("시계가 KST 20:00 을 지나면 → 사용량 flush · 임대 해제 · 종료 0", async () => {
    const h = harness({ start: kst("2026-11-16", "19:59:50"), cleanupDate: null });
    const r = await h.run();
    expect(r).toEqual({ code: 0, reason: "window_end" });
    expect(h.now()).toBeGreaterThanOrEqual(kst("2026-11-16", "20:00:00"));
    expect(h.now()).toBeLessThan(kst("2026-11-16", "20:00:01"));
    expect(h.usage.flush).toHaveBeenCalled();
    expect(h.deps.db.leaseRelease).toHaveBeenCalledWith(HOLDER);
    expect(h.deps.db.cleanup).not.toHaveBeenCalled();
  });

  it("임대 연장 거절 → 종료 0 · warn", async () => {
    const h = harness({ lease: (n) => n === 1, stopAt: MON_10 + 120_000 });
    const r = await h.run();
    expect(r).toEqual({ code: 0, reason: "lease_lost" });
    expect(h.now() - MON_10).toBeGreaterThanOrEqual(30_000);
    expect(h.now() - MON_10).toBeLessThan(31_000);
    expect(has(h.logs, "warn", /lease/)).toHaveLength(1);
  });

  it("임대는 30초마다 연장한다", async () => {
    const h = harness({ stopAt: MON_10 + 95_000 });
    await h.run();
    // 시작 1 + 30 · 60 · 90 초
    expect(h.deps.db.leaseAcquire).toHaveBeenCalledTimes(4);
  });
});

// ── 오류 처리 ───────────────────────────────────────────────────────
describe("오류 처리", () => {
  it("초당 초과 1분 안 5번 → 60초 동안 한투 호출 0 · error 1번", async () => {
    const h = harness({
      stopAt: MON_10 + 90_000,
      targets: () => targetsOf(codes(50)),
      page: (q, { now }) => {
        if (now < MON_10 + 3_000) throw new KisApiError(500, "EGW00201", "초당 거래건수를 초과하였습니다.");
        return flowOf(q) === "feed" ? [row(OLD_SRNO)] : [];
      },
    });
    const r = await h.run();
    expect(r.code).toBe(0);
    const errors = h.logs.filter((l) => l.level === "error");
    expect(errors).toHaveLength(1);
    const fifth = h.calls[4].at;
    const during = h.calls.filter((c) => c.at > fifth && c.at < fifth + RATE_LIMIT_PAUSE_MS);
    expect(during).toHaveLength(0);
    expect(h.calls.filter((c) => c.at >= fifth + RATE_LIMIT_PAUSE_MS).length).toBeGreaterThan(0);
  });

  it("토큰 무효 → 강제 재발급 1번 → 성공이면 계속", async () => {
    const h = harness({
      stopAt: MON_10 + 10_000,
      page: (q, { n }) => {
        if (n === 1) throw new KisApiError(500, "EGW00123", "기간이 만료된 token 입니다.");
        return flowOf(q) === "feed" ? [row(OLD_SRNO)] : [];
      },
    });
    const r = await h.run();
    expect(r.code).toBe(0);
    expect(h.deps.kis.token).toHaveBeenCalledWith({ canIssue: true, force: true });
    expect(vi.mocked(h.deps.kis.token).mock.calls.filter((c) => c[0].force)).toHaveLength(1);
    expect(h.calls.length).toBeGreaterThan(5);
  });

  it("같은 실행에서 토큰이 또 무효 → 종료 1", async () => {
    const h = harness({
      stopAt: MON_10 + 60_000,
      page: () => {
        throw new KisApiError(500, "EGW00121", "유효하지 않은 token 입니다.");
      },
    });
    const r = await h.run();
    expect(r).toEqual({ code: 1, reason: "token_invalid" });
    expect(h.calls).toHaveLength(2);
    expect(h.deps.db.leaseRelease).toHaveBeenCalledWith(HOLDER);
  });

  it("모르는 msg_cd 연속 5번 → 한도 의심 표시 기록 · error · 종료 1", async () => {
    const h = harness({
      stopAt: MON_10 + 60_000,
      targets: () => targetsOf(codes(10)),
      page: () => {
        throw new KisApiError(200, "OPSQ0001", "모르는 오류");
      },
    });
    const r = await h.run();
    expect(r).toEqual({ code: 1, reason: "quota_suspected" });
    expect(h.calls).toHaveLength(5);
    expect(h.deps.db.strikes.record).toHaveBeenCalledTimes(1);
    expect(h.deps.db.strikes.record).toHaveBeenCalledWith("2026-11-16");
    expect(h.logs.filter((l) => l.level === "error")).toHaveLength(1);
  });

  it("모르는 msg_cd 중간에 성공이 있으면 연속 수 0 으로", async () => {
    const h = harness({
      stopAt: MON_10 + 20_000,
      targets: () => targetsOf(codes(10)),
      page: (q, { n }) => {
        if (n % 5 !== 0) throw new KisApiError(200, "OPSQ0001", "모르는 오류");
        return flowOf(q) === "feed" ? [row(OLD_SRNO)] : [];
      },
    });
    const r = await h.run();
    expect(r.code).toBe(0);
    expect(h.deps.db.strikes.record).not.toHaveBeenCalled();
    expect(h.calls.length).toBeGreaterThan(10);
  });

  it("일시 장애 → 그 흐름만 1 · 2 · 4 … 최대 60초 물러섬 · 다른 흐름은 계속 · 실패 로그에 상태 · msg_cd · msg1", async () => {
    const h = harness({
      stopAt: MON_10 + 240_000,
      targets: () => targetsOf(codes(20)),
      page: (q) => {
        if (flowOf(q) === "feed") throw new KisApiError(503, null, "Service Unavailable");
        return [];
      },
    });
    const r = await h.run();
    expect(r.code).toBe(0);
    const at = h.flows("feed").map((c) => c.at);
    const gaps = at.slice(1).map((x, i) => x - at[i]);
    // 1 · 2 · 4 · 8 · 16 · 32 · 60 · 60 … (걸음 200ms 만큼 늦을 수 있다)
    const want = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000];
    want.forEach((w, i) => {
      expect(gaps[i]).toBeGreaterThanOrEqual(w);
      expect(gaps[i]).toBeLessThanOrEqual(w + 400);
    });
    for (const g of gaps) expect(g).toBeLessThanOrEqual(60_400);
    // 다른 흐름은 계속 — 30초 구간마다 종목별 호출이 있다
    for (let s = 0; s < 240_000; s += 30_000) {
      expect(h.flows("stock").filter((c) => c.at >= MON_10 + s && c.at < MON_10 + s + 30_000).length).toBeGreaterThan(0);
    }
    const w = h.logs.find((l) => l.level === "warn" && l.obj.flow === "feed");
    expect(w?.obj).toMatchObject({ status: 503, msgCd: null, msg1: "Service Unavailable", kind: "transient" });
  });
});

// ── 예산 ────────────────────────────────────────────────────────────
describe("예산", () => {
  it("사용량 80% → warn 1번", async () => {
    const h = harness({ used: 159_995, stopAt: MON_10 + 20_000 });
    const r = await h.run();
    expect(r.code).toBe(0);
    expect(has(h.logs, "warn", /80%/)).toHaveLength(1);
  });

  it("사용량 100% → error · 종료 1", async () => {
    const h = harness({ used: 199_997, stopAt: MON_10 + 20_000, targets: () => targetsOf(codes(5)) });
    const r = await h.run();
    expect(r).toEqual({ code: 1, reason: "budget_exhausted" });
    expect(h.calls).toHaveLength(3);
    expect(h.logs.filter((l) => l.level === "error")).toHaveLength(1);
    expect(h.usage.flush).toHaveBeenCalled();
  });
});

// ── slow 모드 ───────────────────────────────────────────────────────
describe("slow 모드", () => {
  const SAT_10 = kst("2026-11-14", "10:00:00");
  const slowPage = (q: NewsTitleQuery): KisNewsTitleRow[] => {
    if (flowOf(q) !== "feed") return [];
    // 1쪽: 새 글 1건 → 2쪽: 새 글 1건 + 마지막 본 글
    return q.cursor ? [row(srno(1)), row(LAST_SRNO)] : [row(srno(2))];
  };

  it("slow: 마지막 본 글까지 되감기 · F · G · 대상 한 바퀴(각 1번) · 오늘 정리 안 했으면 정리 1번 · 종료 0", async () => {
    const h = harness({ start: SAT_10, cleanupDate: "2026-11-13", targets: () => targetsOf(codes(5)), page: slowPage });
    const r = await h.run();
    expect(r).toEqual({ code: 0, reason: "slow_done" });
    expect(h.flows("feed")).toHaveLength(2);
    expect(h.flows("F")).toHaveLength(1);
    expect(h.flows("G")).toHaveLength(1);
    expect(h.flows("stock").map((c) => c.query.stockCode).sort()).toEqual(codes(5));
    expect(h.deps.db.cleanup).toHaveBeenCalledTimes(1);
    expect(h.deps.db.leaseRelease).toHaveBeenCalledWith(HOLDER);
    expect(maxPerSecond(h.calls.map((c) => c.at))).toBeLessThanOrEqual(5);
  });

  it("slow: 오늘 이미 정리했으면 정리 0번", async () => {
    const h = harness({ start: SAT_10, cleanupDate: "2026-11-14", targets: () => targetsOf(codes(2)), page: slowPage });
    await h.run();
    expect(h.deps.db.cleanup).not.toHaveBeenCalled();
  });

  it("slow: 마지막 본 글이 없으면 30쪽에서 멈추고 「page cap reached」 warn", async () => {
    let n = 0;
    const h = harness({
      start: SAT_10,
      lastSrno: null,
      cleanupDate: "2026-11-14",
      page: (q) => (flowOf(q) === "feed" ? [row(srno(1_000 - ++n))] : []),
    });
    const r = await h.run();
    expect(r.code).toBe(0);
    expect(h.flows("feed")).toHaveLength(FEED_MAX_PAGES_SLOW);
    expect(has(h.logs, "warn", /page cap reached/)).toHaveLength(1);
  });

  it("slow: 대상이 많아 90초를 넘기면 그동안 임대를 연장한다", async () => {
    const h = harness({ start: SAT_10, cleanupDate: "2026-11-14", targets: () => targetsOf(codes(300)), page: slowPage });
    const r = await h.run();
    expect(r.code).toBe(0);
    expect(h.flows("stock")).toHaveLength(300);
    expect(h.now() - SAT_10).toBeGreaterThan(100_000);
    expect(vi.mocked(h.deps.db.leaseAcquire).mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});

// ── 비밀 ────────────────────────────────────────────────────────────
describe("로그", () => {
  it("어떤 경우에도 로그 출력에 토큰 문자열이 없다 · 호출에는 토큰을 넘긴다", async () => {
    const h = harness({
      stopAt: MON_10 + 20_000,
      targets: () => targetsOf(codes(5)),
      page: (q, { n }) => {
        if (n === 2) throw new KisApiError(500, "EGW00123", "기간이 만료된 token 입니다.");
        if (n === 4) throw new KisApiError(503, null, "Service Unavailable");
        if (n === 6) throw new KisApiError(200, "OPSQ0001", "모르는 오류");
        return flowOf(q) === "feed" ? [row(OLD_SRNO)] : [];
      },
    });
    await h.run();
    expect(h.calls.every((c) => c.token === SECRET_TOKEN)).toBe(true);
    expect(JSON.stringify(h.logs)).not.toContain(SECRET_TOKEN);
  });
});
