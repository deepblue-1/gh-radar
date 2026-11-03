import { describe, expect, it } from "vitest";

import { TickCache, makeKey } from "../src/cache.js";
import { kstDayStartNs, kstMs, kstToday } from "../src/config.js";
import type { IndexerArgs, IndexerResult } from "../src/indexer.js";
import { Poller, type PollerConfig } from "../src/poller.js";

const DATE = "20261030";
const DAY_START = kstDayStartNs(DATE);
const SEC = 1_000_000_000n;
const ISIN = "KR7101360006";
const KEY = makeKey(ISIN, "KRX", DATE);

const isinN = (n: number) => `KR70000000${String(n).padStart(2, "0")}`;
const keyN = (n: number) => makeKey(isinN(n), "KRX", DATE);

type Behavior = (a: IndexerArgs, n: number) => IndexerResult | Promise<IndexerResult>;

/** 하루 레코드 = 08:00 + (i+1)초 · 레코드당 10바이트(가짜 — tickgw 는 바이트를 풀지 않는다). */
function dayResponse(a: IndexerArgs, total: number, page = Infinity): IndexerResult {
  const all: bigint[] = [];
  for (let i = 0; i < total; i++) {
    const ns = kstDayStartNs(a.date) + BigInt(i + 1) * SEC;
    if (ns >= a.fromNs && (a.toNs === 0n || ns <= a.toNs)) all.push(ns);
  }
  const take = all.slice(0, page);
  const hasMore = all.length > take.length;
  return {
    code: 0,
    stdout: Buffer.alloc(take.length * 10, 7),
    meta: {
      fmt: "pcapns-rec/1",
      records: take.length,
      firstRecvNs: take[0] ?? null,
      lastRecvNs: take.at(-1) ?? null,
      hasMore,
      nextFromNs: hasMore ? all[take.length]! : null,
    },
    stderrTail: "",
  };
}

const fail = (code: number, stderr = ""): IndexerResult => ({ code, stdout: Buffer.alloc(0), meta: null, stderrTail: stderr });

interface Rig {
  poller: Poller;
  cache: TickCache;
  calls: { at: number; args: IndexerArgs }[];
  clock: { t: number };
  /** step 을 돌리며 idle 이면 시계를 다음 할 일까지 민다. `touch` 키들은 매 step 갱신(브라우저 폴링 흉내). */
  drive: (o: { untilCalls?: number; untilT?: number; touch?: string[] }) => Promise<void>;
}

function rig(behavior: Behavior, cfg: Partial<PollerConfig> = {}, startMs = kstMs(DATE, "1000"), cacheBytes = 128 * 1024 * 1024): Rig {
  const clock = { t: startMs };
  const calls: Rig["calls"] = [];
  const cache = new TickCache(cacheBytes, 15 * 60 * 1000);
  let n = 0;
  const poller = new Poller(
    { pollMs: 5_000, pollJitterMs: 500, leaseMs: 30_000, maxKeys: 8, closeDelayMs: 60_000, ...cfg },
    {
      cache,
      runIndexer: async (a) => {
        calls.push({ at: clock.t, args: a });
        return behavior(a, n++);
      },
      now: () => clock.t,
      sleep: async () => {},
      random: () => 0.5, // 폴링 지터 0 · 바쁨 지터 250ms
    },
  );
  const drive: Rig["drive"] = async ({ untilCalls, untilT, touch = [] }) => {
    for (let guard = 0; guard < 10_000; guard++) {
      if (untilCalls !== undefined && calls.length >= untilCalls) return;
      if (untilT !== undefined && clock.t >= untilT) return;
      for (const k of touch) poller.touch(k);
      const r = await poller.step();
      if (r.action !== "call" && r.action !== "close") {
        const next = clock.t + Math.max(1, r.waitMs);
        clock.t = untilT !== undefined ? Math.min(next, untilT) : next;
      }
    }
    throw new Error("drive: guard");
  };
  return { poller, cache, calls, clock, drive };
}

const gaps = (calls: { at: number }[]) => calls.slice(1).map((c, i) => c.at - calls[i]!.at);

describe("KST 경계 — 37-12 promote(shared dayStartNs)와 같은 리터럴", () => {
  it("08:00 · 20:00 · 자정 넘김", () => {
    expect(kstDayStartNs("20261030")).toBe(1793314800000000000n); // 2026-10-29T23:00:00Z
    expect(kstDayStartNs("20261030", "2000")).toBe(1793358000000000000n); // 2026-10-30T11:00:00Z
    expect(kstToday(Date.UTC(2026, 9, 30, 15, 0))).toBe("20261031");
    expect(kstToday(Date.UTC(2026, 9, 30, 14, 59))).toBe("20261030");
  });
});

describe("Poller — 하루치 · 이어받기 · 증분", () => {
  it("첫 touch → 08:00 부터 to=0 · has_more 면 next_from_ns 로 곧바로 · 끝나면 ready · 그 뒤 lastRecvNs+1", async () => {
    const r = rig((a) => dayResponse(a, 5, 3));
    expect(r.poller.touch(KEY)).toEqual({ state: "loading", queue: 0 });
    await r.drive({ untilCalls: 3, touch: [KEY] });
    expect(r.calls.map((c) => c.args.fromNs)).toEqual([DAY_START, DAY_START + 4n * SEC, DAY_START + 5n * SEC + 1n]);
    expect(r.calls.every((c) => c.args.toNs === 0n)).toBe(true);
    expect(gaps(r.calls)).toEqual([0, 5_000]);
    expect(r.poller.touch(KEY).state).toBe("ready");
    expect(r.cache.get(KEY)?.records).toBe(5);
    expect(r.cache.get(KEY)?.complete).toBe(true);
  });
});

describe("Poller — 리스 30초", () => {
  it("마지막 touch 뒤 30초가 지나면 그 키 요청이 더 나가지 않는다 · 다시 touch 하면 재개", async () => {
    const r = rig((a) => dayResponse(a, 3));
    const t0 = r.clock.t;
    r.poller.touch(KEY);
    await r.drive({ untilT: t0 + 60_000 });
    // t0 · +5 · +10 · +15 · +20 · +25 — 리스는 t0+30s 에 끝난다
    expect(r.calls.map((c) => c.at - t0)).toEqual([0, 5_000, 10_000, 15_000, 20_000, 25_000]);
    r.poller.touch(KEY);
    await r.drive({ untilCalls: 7 });
    expect(r.calls.at(-1)!.at).toBe(t0 + 60_000);
    expect(r.calls.at(-1)!.args.fromNs).toBe(DAY_START + 3n * SEC + 1n);
  });
});

describe("Poller — 활성 키 상한 8 · 대기 k건", () => {
  it("9번째 키는 queued · queue 1 · 앞 키 리스가 끝나면 올라온다", async () => {
    const r = rig((a) => dayResponse(a, 2));
    const t0 = r.clock.t;
    for (let i = 1; i <= 8; i++) expect(r.poller.touch(keyN(i)).state).toBe("loading");
    expect(r.poller.touch(keyN(9))).toEqual({ state: "queued", queue: 1 });
    expect(r.poller.touch(keyN(10))).toEqual({ state: "queued", queue: 2 });
    const keep = [2, 3, 4, 5, 6, 7, 8, 9, 10].map(keyN);
    await r.drive({ untilT: t0 + 20_000, touch: [keyN(1), ...keep] });
    const called = new Set(r.calls.map((c) => c.args.isin));
    expect(called.has(isinN(9))).toBe(false);
    expect(called.has(isinN(10))).toBe(false);
    expect(called.size).toBe(8);
    // 키 1 만 touch 를 멈춘다 → t0+20s+30s 뒤 리스 끝 → 키 9 가 활성
    await r.drive({ untilT: t0 + 51_000, touch: keep });
    expect(r.poller.touch(keyN(9)).state).not.toBe("queued");
    expect(r.poller.touch(keyN(10))).toEqual({ state: "queued", queue: 1 });
    expect(r.calls.some((c) => c.args.isin === isinN(9))).toBe(true);
  });

  it("119 동시성 1 — step 은 한 번에 한 호출만 한다(키가 여럿이면 순환)", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const r = rig(async (a) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight--;
      return dayResponse(a, 1);
    });
    for (let i = 1; i <= 3; i++) r.poller.touch(keyN(i));
    await Promise.all([r.poller.step(), r.poller.step(), r.poller.step()]);
    expect(maxInFlight).toBe(1);
    await r.drive({ untilCalls: 9, touch: [1, 2, 3].map(keyN) });
    expect(new Set(r.calls.map((c) => c.args.isin)).size).toBe(3);
  });
});

describe("Poller — 백오프 · 바쁨 · 차단", () => {
  it("실패 연속 → 5 · 10 · 20 · 40 · 60 · 60초 · 성공하면 다시 5초", async () => {
    const r = rig((a, n) => (n < 6 ? fail(n % 2 ? -1 : 255, "Permission denied (publickey).") : dayResponse(a, 2)));
    r.poller.touch(KEY);
    await r.drive({ untilCalls: 8, touch: [KEY] });
    expect(gaps(r.calls)).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 5_000]);
  });

  it("실패 중 상태는 delayed", async () => {
    const r = rig(() => fail(255, "Permission denied"));
    r.poller.touch(KEY);
    await r.drive({ untilCalls: 1, touch: [KEY] });
    await r.poller.step();
    expect(r.poller.touch(KEY).state).toBe("delayed");
  });

  it("종료코드 75 → 2초 + 지터 뒤 재시도 · 백오프 단계를 올리지 않는다", async () => {
    const seq = [75, 75, 255, 0];
    const r = rig((a, n) => (seq[n] === 0 ? dayResponse(a, 1) : fail(seq[n] ?? 0)));
    r.poller.touch(KEY);
    await r.drive({ untilCalls: 4, touch: [KEY] });
    const g = gaps(r.calls);
    expect(g[0]).toBeGreaterThanOrEqual(2_000);
    expect(g[0]).toBeLessThanOrEqual(2_500);
    expect(g[1]).toBeGreaterThanOrEqual(2_000);
    expect(g[1]).toBeLessThanOrEqual(2_500);
    expect(g[2]).toBe(5_000); // 75 두 번 뒤 첫 실패 = 1단계(5초)
  });

  it("연결 실패 3회 연속 → 전역 60초 차단 · 모든 키 delayed · 차단 중 119 호출 0", async () => {
    const timedOut = "ssh: connect to host 10.16.207.119 port 22: Connection timed out";
    let down = true;
    const r = rig((a) => (down ? fail(255, timedOut) : dayResponse(a, 1)));
    const keys = [1, 2, 3].map(keyN);
    for (const k of keys) r.poller.touch(k);
    await r.drive({ untilCalls: 3, touch: keys });
    const blockedAt = r.calls.at(-1)!.at;
    for (const k of keys) expect(r.poller.touch(k).state).toBe("delayed");
    await r.drive({ untilT: blockedAt + 59_999, touch: keys });
    expect(r.calls).toHaveLength(3);
    down = false;
    await r.drive({ untilCalls: 4, touch: keys });
    expect(r.calls[3]!.at).toBeGreaterThanOrEqual(blockedAt + 60_000);
  });

  it("차단이 풀린 뒤 첫 탐침이 또 연결 실패면 곧바로 다시 60초 차단(두드리지 않는다)", async () => {
    const timedOut = "ssh: connect to host 10.16.207.119 port 22: No route to host";
    const r = rig(() => fail(255, timedOut));
    const keys = [1, 2, 3].map(keyN);
    for (const k of keys) r.poller.touch(k);
    await r.drive({ untilCalls: 4, touch: keys });
    const probeAt = r.calls[3]!.at;
    await r.drive({ untilT: probeAt + 59_999, touch: keys });
    expect(r.calls).toHaveLength(4);
  });

  it("인자 오류(64) → blocked · 60초 뒤 재시도", async () => {
    const r = rig((a, n) => (n === 0 ? fail(64, "bad args") : dayResponse(a, 1)));
    r.poller.touch(KEY);
    await r.drive({ untilCalls: 1, touch: [KEY] });
    expect(r.poller.touch(KEY).state).toBe("blocked");
    await r.drive({ untilCalls: 2, touch: [KEY] });
    expect(gaps(r.calls)).toEqual([60_000]);
  });
});

describe("Poller — 캐시 상한 · LRU 보호(WR-33)", () => {
  it("리스가 살아 있는 키는 LRU 로 지우지 않는다 — 자리가 없으면 새 키는 붙이지 않고 백오프 · 앞 키를 08:00 부터 다시 받지 않는다", async () => {
    // 키당 6레코드 × 10B = 60B · 상한 100B → 둘이 함께는 못 든다
    const r = rig((a) => dayResponse(a, 6), {}, kstMs(DATE, "1000"), 100);
    const t0 = r.clock.t;
    r.poller.touch(keyN(1));
    await r.drive({ untilCalls: 1, touch: [keyN(1)] });
    const epoch1 = r.cache.get(keyN(1))!.epoch;
    await r.drive({ untilT: t0 + 25_000, touch: [keyN(1), keyN(2)] });
    expect(r.cache.get(keyN(1))!.epoch).toBe(epoch1);
    expect(r.cache.get(keyN(1))!.records).toBe(6);
    expect(r.cache.get(keyN(2))!.records).toBe(0);
    expect(r.cache.totalBytes()).toBeLessThanOrEqual(100);
    const fromStart = (k: string) =>
      r.calls.filter((c) => makeKey(c.args.isin, c.args.ex, c.args.date) === k && c.args.fromNs === DAY_START).length;
    expect(fromStart(keyN(1))).toBe(1); // 지워지고 처음부터 다시 받는 고리 없음
    expect(fromStart(keyN(2))).toBeLessThanOrEqual(4); // 5 · 10 · 20초 백오프
    expect(r.poller.touch(keyN(2)).state).toBe("delayed");

    // 키 1 리스가 끝나면(보호 해제) 키 2 가 다음 재시도에 자리를 얻는다
    await r.drive({ untilT: t0 + 120_000, touch: [keyN(2)] });
    expect(r.cache.get(keyN(1))).toBeUndefined();
    expect(r.cache.get(keyN(2))!.records).toBe(6);
  });

  it("키 하나의 하루치가 상한을 넘으면 지우지 않고 그날 폴링을 멈춘다 — blocked · complete=false · 다시 열어도 처음부터 받지 않는다", async () => {
    const r = rig((a) => dayResponse(a, 20, 5), {}, kstMs(DATE, "1000"), 100);
    r.poller.touch(KEY);
    await r.drive({ untilCalls: 3, touch: [KEY] });
    const n = r.calls.length;
    await r.drive({ untilT: r.clock.t + 60_000, touch: [KEY] });
    expect(r.calls).toHaveLength(n);
    const e = r.cache.get(KEY)!;
    expect(e.records).toBe(10); // 50B + 50B 까지 · 세 번째 50B 는 붙이지 않았다
    expect(e.complete).toBe(false);
    expect(r.poller.touch(KEY)).toEqual({ state: "blocked", queue: 0 });

    // 엔트리가 지워진 뒤(유휴 등) 다시 열어도 08:00 부터 다시 받지 않는다
    r.cache.delete(KEY);
    await r.poller.step();
    expect(r.poller.touch(KEY).state).toBe("blocked");
    await r.drive({ untilT: r.clock.t + 30_000, touch: [KEY] });
    expect(r.calls).toHaveLength(n);
  });
});

describe("Poller — 20:01 마감 마무리(closeSweep)", () => {
  const at = (hhmmss: string) => kstMs(DATE, hhmmss.slice(0, 4)) + Number(hhmmss.slice(4, 6)) * 1000;

  it("20:00:59 엔 아무것도 · 20:01:00 이 지나면 complete 키마다(리스 끝난 키 포함) 1회 → closed · closedThroughNs = 시작 − 2초", async () => {
    let total = 3;
    const r = rig((a) => dayResponse(a, total), {}, at("195800"));
    r.poller.touch(keyN(1));
    r.poller.touch(keyN(2));
    await r.drive({ untilCalls: 2, touch: [keyN(1), keyN(2)] });
    // 이후 touch 없음 → 19:58:30 쯤 리스 끝
    await r.drive({ untilT: at("200059") });
    const before = r.calls.length;
    total = 4; // 마감 직전 레코드 하나 더
    await r.poller.step();
    expect(r.calls.length).toBe(before);

    r.clock.t = at("200100");
    await r.drive({ untilCalls: before + 2 });
    const closeCalls = r.calls.slice(before);
    expect(closeCalls.map((c) => c.args.fromNs)).toEqual([DAY_START + 3n * SEC + 1n, DAY_START + 3n * SEC + 1n]);
    expect(closeCalls.every((c) => c.args.toNs === 0n)).toBe(true);
    for (const k of [keyN(1), keyN(2)]) {
      const e = r.cache.get(k)!;
      expect(e.closed).toBe(true);
      expect(e.records).toBe(4);
      const startedAt = closeCalls.find((c) => makeKey(c.args.isin, c.args.ex, c.args.date) === k)!.at;
      expect(e.closedThroughNs).toBe(BigInt(startedAt - 2_000) * 1_000_000n);
      expect(e.closedThroughNs! >= kstDayStartNs(DATE, "2000")).toBe(true);
    }
    // closed 키는 touch 해도 119 호출 0 · 마무리는 하루 한 번
    const n = r.calls.length;
    r.poller.touch(keyN(1));
    await r.drive({ untilT: at("203000"), touch: [keyN(1)] });
    expect(r.calls.length).toBe(n);
    expect(r.poller.touch(keyN(1)).state).toBe("ready");
  });

  it("마무리 중 has_more 면 이어받은 뒤 closed", async () => {
    let page = Infinity;
    let total = 2;
    const r = rig((a) => dayResponse(a, total, page), {}, at("195900"));
    r.poller.touch(KEY);
    await r.drive({ untilCalls: 1, touch: [KEY] });
    total = 6;
    page = 2;
    r.clock.t = at("200130");
    await r.drive({ untilCalls: 2 });
    expect(r.cache.get(KEY)!.closed).toBe(false); // 첫 마무리 응답이 has_more — 아직 아님
    await r.drive({ untilCalls: 3 });
    expect(r.calls.slice(1).map((c) => c.args.fromNs)).toEqual([DAY_START + 2n * SEC + 1n, DAY_START + 5n * SEC]);
    const e = r.cache.get(KEY)!;
    expect(e.closed).toBe(true);
    expect(e.records).toBe(6);
    expect(e.closedThroughNs).toBe(BigInt(r.calls[1]!.at - 2_000) * 1_000_000n);
    await r.drive({ untilT: at("203000") });
    expect(r.calls).toHaveLength(3);
  });

  it("마무리 실패 3회 → closed 아님 · 더 시도하지 않는다 · complete 아닌 키는 대상 아님", async () => {
    let closing = false;
    const r = rig((a) => (closing && a.isin === isinN(1) ? fail(255, "Permission denied") : dayResponse(a, 2)), {}, at("195900"));
    r.poller.touch(keyN(1));
    r.poller.touch(keyN(2));
    await r.drive({ untilCalls: 2, touch: [keyN(1), keyN(2)] });
    r.cache.get(keyN(2))!.complete = false; // 이어받기 끊긴 키
    closing = true;
    r.clock.t = at("200100");
    await r.drive({ untilT: at("201000") }); // 20:14 이후엔 complete 아닌 키 2 가 유휴 삭제된다

    const closeCalls = r.calls.slice(2);
    expect(closeCalls.map((c) => c.args.isin)).toEqual([isinN(1), isinN(1), isinN(1)]);
    expect(r.cache.get(keyN(1))!.closed).toBe(false);
    expect(r.cache.get(keyN(2))!.closed).toBe(false);
  });

  it("마무리 응답이 compressed_files_skipped > 0(20:00 압축 원본 건너뜀) → complete=false · closed 아님(승격 안 함 · CR-31)", async () => {
    let skipped = 0;
    let total = 3;
    const r = rig((a) => {
      const res = dayResponse(a, total);
      return { ...res, meta: { ...res.meta!, compressedFilesSkipped: skipped } };
    }, {}, at("195900"));
    r.poller.touch(keyN(1));
    r.poller.touch(keyN(2));
    await r.drive({ untilCalls: 2, touch: [keyN(1), keyN(2)] });
    // 리스가 끝난 뒤 20:00 압축 — 키 1 의 지난 시간 파일이 건너뛰어진다(키 2 는 이미 다 받았다 · 마감 응답에 건너뜀 0)
    total = 5;
    r.clock.t = at("200100");
    const before = r.calls.length;
    skipped = 2;
    await r.drive({ untilCalls: before + 1 });
    expect(makeKey(r.calls.at(-1)!.args.isin, "KRX", DATE)).toBe(keyN(1));
    skipped = 0;
    await r.drive({ untilT: at("201000") }); // 20:14 뒤엔 complete 아닌 키 1 이 유휴 삭제된다(면제 대상 아님)
    const e1 = r.cache.get(keyN(1))!;
    expect(e1.complete).toBe(false);
    expect(e1.closed).toBe(false);
    expect(r.cache.get(keyN(2))!.closed).toBe(true);
  });

  it("응답이 skipped_records > 0(범위 안 레코드를 싣지 못함 · gh-trade 4e9de34b) → complete=false · 마감 뒤 closed 아님", async () => {
    let skippedRecords = 0;
    const r = rig((a) => {
      const res = dayResponse(a, 3);
      return { ...res, meta: { ...res.meta!, skippedRecords } };
    }, {}, at("195900"));
    r.poller.touch(KEY);
    await r.drive({ untilCalls: 1, touch: [KEY] });
    expect(r.cache.get(KEY)!.complete).toBe(true);
    skippedRecords = 2;
    r.clock.t = at("200100");
    const before = r.calls.length;
    await r.drive({ untilCalls: before + 1 });
    skippedRecords = 0;
    await r.drive({ untilT: at("201000") });
    const e = r.cache.get(KEY)!;
    expect(e.complete).toBe(false);
    expect(e.closed).toBe(false);
  });

  it("20:00 뒤 처음 연 키도 건너뛴 파일이 있으면 X-Tick-Complete 근거(complete)가 false", async () => {
    const r = rig((a) => {
      const res = dayResponse(a, 3);
      return { ...res, meta: { ...res.meta!, compressedFilesSkipped: 11 } };
    }, {}, at("203000"));
    r.poller.touch(KEY);
    await r.drive({ untilCalls: 1, touch: [KEY] });
    expect(r.cache.get(KEY)!.complete).toBe(false);
  });

  it("차단 중에는 마무리도 기다렸다가 풀린 뒤 한다", async () => {
    const timedOut = "ssh: connect to host 10.16.207.119 port 22: Connection timed out";
    let down = false;
    const r = rig((a) => (down ? fail(255, timedOut) : dayResponse(a, 2)), {}, at("195900"));
    const keys = [1, 2, 3].map(keyN);
    for (const k of keys) r.poller.touch(k);
    await r.drive({ untilCalls: 3, touch: keys });
    down = true;
    r.clock.t = at("200100");
    await r.drive({ untilCalls: 6 }); // 마무리 3회 연결 실패 → 전역 차단(키당 실패 1회)
    const blockedAt = r.calls.at(-1)!.at;
    down = false;
    await r.drive({ untilT: blockedAt + 59_000 });
    expect(r.calls).toHaveLength(6);
    await r.drive({ untilT: at("203000") });
    for (const k of keys) expect(r.cache.get(k)!.closed).toBe(true);
    expect(r.calls.slice(6).every((c) => c.at >= blockedAt + 60_000)).toBe(true);
  });
});
