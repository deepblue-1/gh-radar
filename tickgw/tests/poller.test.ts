import { describe, expect, it, vi } from "vitest";

import { TickCache, makeKey } from "../src/cache.js";
import { ConfigError, kstDayStartNs, kstMs, kstToday, loadConfig } from "../src/config.js";
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
    // 따라잡기는 운영 기본(19:55)으로 켠다 — 기존 시나리오도 그 상태에서 그대로여야 한다
    { pollMs: 5_000, pollJitterMs: 500, leaseMs: 30_000, maxKeys: 8, closeDelayMs: 60_000, catchupHhmm: 1955, ...cfg },
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
      if (r.action !== "call" && r.action !== "close" && r.action !== "catchup") {
        const next = clock.t + Math.max(1, r.waitMs);
        clock.t = untilT !== undefined ? Math.min(next, untilT) : next;
      }
    }
    throw new Error("drive: guard");
  };
  return { poller, cache, calls, clock, drive };
}

/** 75 연속 이 횟수까지는 2초 재시도(poller BUSY_FAST_TRIES). */
const BUSY_FAST = 5;

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

  it("75 가 연속 5회를 넘으면 전역 대기를 5 → 15 → 30 → 60초로 늘린다 · 정상 응답이면 2초로 되돌림 · 실패로 세지 않음(R2-IN-05)", async () => {
    let busy = 10;
    const r = rig((a) => (busy-- > 0 ? fail(75) : dayResponse(a, 1)));
    r.poller.touch(KEY);
    await r.drive({ untilCalls: 11, touch: [KEY] });
    expect(gaps(r.calls)).toEqual([2_250, 2_250, 2_250, 2_250, 2_250, 5_250, 15_250, 30_250, 60_250, 60_250]);
    expect(r.poller.touch(KEY).state).toBe("ready"); // 실패 단계 없음 — delayed 아님
    busy = 1;
    await r.drive({ untilCalls: 13, touch: [KEY] });
    expect(gaps(r.calls).slice(-2)).toEqual([5_000, 2_250]); // 다시 처음부터 2초
  });

  it("75 연속 대기는 전역 — 키가 여럿이어도 느린 단계에선 대기 동안 119 호출 0", async () => {
    const r = rig(() => fail(75));
    const keys = [1, 2, 3, 4].map(keyN);
    for (const k of keys) r.poller.touch(k);
    await r.drive({ untilT: r.clock.t + 300_000, touch: keys });
    const slow = r.calls.slice(BUSY_FAST);
    expect(gaps(slow).every((g) => g >= 5_000)).toBe(true);
    expect(r.calls.length).toBeLessThan(20); // 키당 2초였다면 5분 동안 ≈ 600회
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
    // 처음 한 번만 119 를 부르고 버린다 — 그 뒤 백오프(5 · 10 · 20초)는 자리가 없으니 부르지 않는다(R2-IN-03)
    expect(fromStart(keyN(2))).toBe(1);
    expect(r.poller.touch(keyN(2)).state).toBe("delayed");

    // 키 1 리스가 끝나면(보호 해제) 키 2 가 다음 재시도에 자리를 얻는다
    await r.drive({ untilT: t0 + 120_000, touch: [keyN(2)] });
    expect(r.cache.get(keyN(1))).toBeUndefined();
    expect(r.cache.get(keyN(2))!.records).toBe(6);
    expect(fromStart(keyN(2))).toBe(2); // 자리가 난 뒤 한 번 더 — 그때 붙었다
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

  it("건너뜀 수 필드 형식 오류(badCounts) → complete=false · 마감 뒤 closed 아님(R2-IN-01 — 조용히 0 으로 승격하지 않는다)", async () => {
    let bad = false;
    const r = rig((a) => {
      const res = dayResponse(a, 3);
      return bad ? { ...res, meta: { ...res.meta!, badCounts: ["skipped_records"] } } : res;
    }, {}, at("195900"));
    r.poller.touch(KEY);
    await r.drive({ untilCalls: 1, touch: [KEY] });
    expect(r.cache.get(KEY)!.complete).toBe(true);
    bad = true;
    r.clock.t = at("200100");
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

describe("Poller — 19:55 따라잡기(CR-31 후속 · 승격률 보전)", () => {
  const at = (hhmmss: string) => kstMs(DATE, hhmmss.slice(0, 4)) + Number(hhmmss.slice(4, 6)) * 1000;
  const MIN = 60n * SEC;
  const keyOf = (a: IndexerArgs) => makeKey(a.isin, a.ex, a.date);
  const AT_1954_30 = kstDayStartNs(DATE, "1954") + 30n * SEC;

  /**
   * 1분마다 레코드 하나(08:00:30 부터 「지금」 까지 · 레코드당 10B). 20:00 회전 뒤엔 최악을 흉내 — 08~18시 시간 파일이 곧바로
   * 모두 압축돼 건너뛰고(`compressed_files_skipped` = from 이후에 걸친 그 시간 파일 수), 19시 · 20시 파일만 읽힌다(가장 늦게 압축).
   */
  function minuteDay(a: IndexerArgs, nowMs: number, page = Infinity): IndexerResult {
    const nowNs = BigInt(nowMs) * 1_000_000n;
    const compressed = nowMs >= kstMs(a.date, "2000");
    const cut = kstDayStartNs(a.date, "1900");
    const all: bigint[] = [];
    for (let ns = kstDayStartNs(a.date) + 30n * SEC; ns <= nowNs; ns += MIN) {
      if (ns >= a.fromNs && !(compressed && ns < cut)) all.push(ns);
    }
    let skippedFiles = 0;
    if (compressed) {
      for (let h = 8; h <= 18; h++) {
        if (kstDayStartNs(a.date, `${String(h + 1).padStart(2, "0")}00`) > a.fromNs) skippedFiles++;
      }
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
        compressedFilesSkipped: skippedFiles,
        skippedRecords: 0,
      },
      stderrTail: "",
    };
  }

  /** 10:00 에 열고 닫은(리스 끝) 키 하나 → 19:54:59 로 건너뛴다. */
  async function openedAt10(cfg: Partial<PollerConfig> = {}): Promise<Rig> {
    const r: Rig = rig((a) => minuteDay(a, r.clock.t, 200), cfg, at("100000"));
    r.poller.touch(KEY);
    await r.drive({ untilCalls: 1, touch: [KEY] }); // 08:00:30 ~ 09:59:30 · 120건 · 한 페이지
    r.clock.t = at("195459");
    await r.poller.step();
    expect(r.calls).toHaveLength(1); // 리스가 끝난 뒤 · 따라잡기 전 — 호출 없음
    return r;
  }

  it("리스가 끝난 complete 키 → 19:55 에 lastRecvNs+1 부터 has_more 끝까지 → 20:01 마무리는 마지막 몇 분만 · 19시 전 원본이 압축돼도 closed", async () => {
    const lines: Record<string, unknown>[] = [];
    const prevLevel = process.env.LOG_LEVEL;
    const r = await openedAt10();
    process.env.LOG_LEVEL = "info";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      try {
        lines.push(JSON.parse(String(chunk)) as Record<string, unknown>);
      } catch {
        /* 로그 줄이 아님 */
      }
      return true;
    });
    try {
      await r.drive({ untilT: at("200000") });
    } finally {
      spy.mockRestore();
      process.env.LOG_LEVEL = prevLevel;
    }
    const cu = r.calls.slice(1);
    // 10:00:30 ~ 19:54:30 = 595건 → 200 · 200 · 195 세 페이지, 모두 19:55:00(20:00 압축 전)
    expect(cu.map((c) => c.at)).toEqual([at("195500"), at("195500"), at("195500")]);
    expect(cu[0]!.args.fromNs).toBe(DAY_START + 30n * SEC + 119n * MIN + 1n);
    expect(cu.every((c) => c.args.toNs === 0n)).toBe(true);
    const e = r.cache.get(KEY)!;
    expect(e.records).toBe(120 + 595);
    expect(e.lastRecvNs).toBe(AT_1954_30);
    expect(e.complete).toBe(true);
    expect(e.closed).toBe(false); // 닫는 건 여전히 20:01 마감 마무리
    const done = lines.find((l) => l.msg === "catchup done");
    expect(done).toMatchObject({ keys: 1, caught: 1, left: 0, calls: 3, bytes: 5_950 });
    expect(typeof done!.ms).toBe("number");

    r.clock.t = at("200100");
    await r.drive({ untilT: at("203000") });
    const close = r.calls.slice(4);
    expect(close).toHaveLength(1);
    expect(close[0]!.args.fromNs).toBe(AT_1954_30 + 1n); // 19시 파일 — 가장 늦게 압축 · 건너뜀 0
    expect(e.complete).toBe(true);
    expect(e.closed).toBe(true);
    expect(e.records).toBe(120 + 595 + 6); // 19:55:30 ~ 20:00:30
  });

  it("TICKGW_CATCHUP_AT off → 19:55~20:00 호출 0 · 20:01 마무리가 10시부터 읽다 압축 원본을 건너뛰어 승격 안 됨(CR-31 그대로)", async () => {
    const r = await openedAt10({ catchupHhmm: null });
    await r.drive({ untilT: at("200000") });
    expect(r.calls).toHaveLength(1);
    const e = r.cache.get(KEY)!;
    r.clock.t = at("200100");
    await r.drive({ untilCalls: 2 });
    expect(r.calls[1]!.args.fromNs).toBe(DAY_START + 30n * SEC + 119n * MIN + 1n);
    expect(e.complete).toBe(false);
    expect(e.closed).toBe(false);
  });

  it("리스가 살아 있는 키는 대상이 아니다 — 5초 간격 그대로 · 따라잡기는 리스 끝난 키만", async () => {
    const A = keyN(1);
    const B = keyN(2);
    const r: Rig = rig((a) => minuteDay(a, r.clock.t, 200), {}, at("100000"));
    r.poller.touch(A);
    r.poller.touch(B);
    await r.drive({ untilCalls: 2, touch: [A, B] });
    r.clock.t = at("195400"); // B 는 닫힌 채 · A 는 다시 열려 계속 본다
    await r.drive({ untilT: at("200000"), touch: [A] });
    const win = r.calls.filter((c) => c.at >= at("195500"));
    const aCalls = win.filter((c) => keyOf(c.args) === A);
    const bCalls = win.filter((c) => keyOf(c.args) === B);
    expect(aCalls).toHaveLength(60); // 19:55:00 ~ 19:59:55
    expect(gaps(aCalls).every((g) => g === 5_000)).toBe(true);
    expect(bCalls.map((c) => c.at)).toEqual([at("195500"), at("195500"), at("195500")]);
    expect(r.calls.filter((c) => keyOf(c.args) === B && c.at < at("195500"))).toHaveLength(1); // 10:00 첫 호출뿐
    expect(r.cache.get(B)!.lastRecvNs).toBe(AT_1954_30);
    expect(r.poller.touch(A).state).toBe("ready");
  });

  it("공정 교대 — 활성 키가 슬롯을 꽉 채워도(3키 × 호출 6초 > 간격 5초) 따라잡기가 한 호출씩 번갈아 얻어 20:00 전에 끝난다", async () => {
    const live = [1, 2, 3].map(keyN);
    const B = keyN(4);
    let slow = false;
    const r: Rig = rig((a) => {
      const res = minuteDay(a, r.clock.t, 200);
      if (slow) r.clock.t += 6_000; // 호출 하나 = 6초
      return res;
    }, {}, at("100000"));
    for (const k of [...live, B]) r.poller.touch(k);
    await r.drive({ untilCalls: 4, touch: [...live, B] });
    r.clock.t = at("195400");
    slow = true;
    await r.drive({ untilT: at("200000"), touch: live });
    const win = r.calls.filter((c) => c.at >= at("195500")).map((c) => (keyOf(c.args) === B ? "B" : "A"));
    // 순수 우선순위면 활성 키가 늘 기다리고 있어 B 는 한 번도 못 간다 — 교대라 B 세 페이지가 활성 호출 하나씩 사이에 낀다
    expect(win.slice(0, 6)).toEqual(["B", "A", "B", "A", "B", "A"]);
    expect(win.filter((k) => k === "B")).toHaveLength(3);
    expect(r.cache.get(B)!.lastRecvNs).toBe(AT_1954_30);
  });

  it("동시성 1 · 종료코드 75 는 2초 + 지터 뒤 재시도(실패 단계 안 올림) — 같은 호출 슬롯", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    let catching = false;
    let nSeq = 0;
    const seq = [75, 75, 255];
    const r: Rig = rig(async (a) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight--;
      if (catching && keyOf(a) === keyN(1) && nSeq < seq.length) return fail(seq[nSeq++]!);
      return minuteDay(a, r.clock.t);
    }, {}, at("100000"));
    const keys = [1, 2, 3].map(keyN);
    for (const k of keys) r.poller.touch(k);
    await r.drive({ untilCalls: 3, touch: keys });
    r.clock.t = at("195500");
    catching = true;
    await Promise.all([r.poller.step(), r.poller.step(), r.poller.step(), r.poller.step()]);
    expect(maxInFlight).toBe(1);
    await r.drive({ untilT: at("200000") });
    const k1 = r.calls.filter((c) => keyOf(c.args) === keyN(1) && c.at >= at("195500"));
    expect(gaps(k1)).toEqual([2_250, 2_250, 5_000]); // 75 · 75 · 실패(1단계 5초) · 성공
    for (const k of keys) expect(r.cache.get(k)!.lastRecvNs).toBe(AT_1954_30);
  });

  it("19:59 까지 못 끝내면 보통 백오프만 · 19:59:00 뒤 따라잡기 호출 없음(gh-trade 회신 · 20:01 마감 마무리 몫)", async () => {
    let down = false;
    const r: Rig = rig((a) => (down ? fail(255, "Permission denied (publickey).") : minuteDay(a, r.clock.t)), {}, at("100000"));
    r.poller.touch(KEY);
    await r.drive({ untilCalls: 1, touch: [KEY] });
    r.clock.t = at("195459");
    down = true;
    await r.drive({ untilT: at("200059") });
    expect(r.calls.slice(1).map((c) => c.at)).toEqual(
      ["195500", "195505", "195515", "195535", "195615", "195715", "195815"].map(at),
    );
  });

  it("너무 큼(WR-33) 키는 리스가 끝나도 따라잡지 않는다", async () => {
    const r = rig((a) => dayResponse(a, 20, 5), {}, at("100000"), 100);
    r.poller.touch(KEY);
    await r.drive({ untilCalls: 3, touch: [KEY] });
    const n = r.calls.length;
    r.clock.t = at("195450");
    await r.drive({ untilT: at("203000") });
    expect(r.calls).toHaveLength(n);
    expect(r.cache.get(KEY)?.closed ?? false).toBe(false);
  });

  it("따라잡기는 다른 승격 입력(이미 따라잡은 키 포함)을 LRU 로 지우지 않는다 — 자리가 없으면 그 키만 멈춘다 · caught 는 살아 있는 키만(R2-WR-01)", async () => {
    // 상한 21,000B(따라잡기 몫 = 75% = 15,750B · R3-WR-01 예비 25% — 둘만 든다 · 셋째 마감 마무리도 자리 없음) · 1분 1레코드 10B — 10:00 · 10:01 · 10:02 에 잠깐 연 키 셋
    // (각 ≈1.2KB). 19:55 에 하루치(≈7.1KB)로 불리면 둘까지만 든다. 고치기 전엔 키 3 의 append 가 방금 따라잡은 키 1 을 지우고 로그는 caught=3 이었다(scratchpad r2probe).
    const lines: Record<string, unknown>[] = [];
    const prevLevel = process.env.LOG_LEVEL;
    const r: Rig = rig((a) => minuteDay(a, r.clock.t), {}, at("100000"), 21_000);
    for (const [i, hhmmss] of [[1, "100000"], [2, "100100"], [3, "100200"]] as const) {
      r.clock.t = Math.max(r.clock.t, at(hhmmss));
      r.poller.touch(keyN(i));
      await r.drive({ untilT: r.clock.t + 2_000 });
    }
    r.clock.t = at("195459"); // 리스는 모두 끝났다 — 따라잡기 직전으로
    process.env.LOG_LEVEL = "info";
    const capture = (chunk: unknown) => {
      try {
        lines.push(JSON.parse(String(chunk)) as Record<string, unknown>);
      } catch {
        /* 로그 줄이 아님 */
      }
      return true;
    };
    const out = vi.spyOn(process.stdout, "write").mockImplementation(capture);
    const err = vi.spyOn(process.stderr, "write").mockImplementation(capture);
    try {
      await r.drive({ untilT: at("195900") });
      const sizes = [1, 2, 3].map((i) => r.cache.get(keyN(i))?.size ?? null);
      expect(sizes[0]).toBe(7_150); // 08:00:30 ~ 19:54:30 — 따라잡은 뒤에도 남아 있다
      expect(sizes[1]).toBe(7_150);
      expect(sizes[2]).toBe(1_220); // 08:00:30 ~ 10:01:30 그대로 — 자리가 없어 멈춤 — 다른 키를 지우지 않았다
      expect(lines.some((l) => l.msg === "catchup stopped (cache full)" && l.key === keyN(3))).toBe(true);
      await r.drive({ untilT: at("201000") });
      const done = lines.find((l) => l.msg === "catchup done"); // 창 끝(19:59) 요약
      expect(done).toMatchObject({ keys: 3, caught: 2, lost: 0, left: 0 });
    } finally {
      out.mockRestore();
      err.mockRestore();
      process.env.LOG_LEVEL = prevLevel;
    }
    expect(lines.filter((l) => l.msg === "cache evict")).toEqual([]);
    expect([1, 2, 3].map((i) => r.cache.get(keyN(i))?.closed ?? "evicted")).toEqual([true, true, false]);
    expect(r.cache.totalBytes()).toBeLessThanOrEqual(21_000);
    // 키 3 마감 마무리 — 버려질 게 확실한 질의는 보내지 않는다(R2-IN-03)
    expect(r.calls.filter((c) => keyOf(c.args) === keyN(3) && c.at >= at("200000"))).toEqual([]);
  });

  it("따라잡기는 상한의 25% 를 남긴다 — 지금 보는 키는 19:55~마감 사이에도 5초 증분 · 마감 뒤 승격(R3-WR-01)", async () => {
    // 상한 15,500B — 키 1 · 2 는 10:00 · 10:01 에 잠깐 연 키(각 ≈1.2KB) · 키 9 는 19:50 에 열고 계속 보는 키(≈7.1KB).
    // 고치기 전엔 따라잡기가 키 1 을 하루치로 불려 상한을 채웠고, 승격 보호 때문에 아무것도 못 지워 키 9 증분이 full → delayed ·
    // 20:01 마감 마무리도 「close gave up (cache full)」 로 빠졌다(scratchpad r3probe).
    const r: Rig = rig((a) => minuteDay(a, r.clock.t), {}, at("100000"), 15_500);
    for (const [i, hhmmss] of [[1, "100000"], [2, "100100"]] as const) {
      r.clock.t = Math.max(r.clock.t, at(hhmmss));
      r.poller.touch(keyN(i));
      await r.drive({ untilT: r.clock.t + 2_000 });
    }
    r.clock.t = at("195000");
    r.poller.touch(keyN(9));
    await r.drive({ untilT: at("195459"), touch: [keyN(9)] });
    const before = r.cache.get(keyN(9))!.size;
    await r.drive({ untilT: at("195900"), touch: [keyN(9)] });
    expect(r.cache.get(keyN(9))!.size).toBeGreaterThan(before); // 따라잡기 창 안에서도 증분이 붙는다
    expect(r.poller.peek(keyN(9))?.state).not.toBe("delayed");
    expect(r.cache.totalBytes()).toBeLessThanOrEqual(15_500);
    await r.drive({ untilT: at("201500"), touch: [keyN(9)] });
    expect(r.cache.get(keyN(9))?.closed).toBe(true); // 보던 키는 승격 입력이 된다
  });

  it("창이 열린 뒤 들어온 queued 키(한 번도 못 받음)도 따라잡는다 — 08:00 부터 · 마감 마무리는 마지막 몇 분만(R2-IN-04 · R3-IN-03)", async () => {
    const A = keyN(1);
    const B = keyN(2);
    const r: Rig = rig((a) => minuteDay(a, r.clock.t), { maxKeys: 1 }, at("195400"));
    r.poller.touch(A);
    await r.drive({ untilCalls: 1, touch: [A] });
    await r.drive({ untilT: at("195530"), touch: [A] });
    expect(r.poller.touch(B)).toEqual({ state: "queued", queue: 1 }); // 활성 1키 밖 — 보통 루프는 돌지 않는다 · 리스는 19:56:00 에 끝
    await r.drive({ untilT: at("195900"), touch: [A] });
    const bCalls = r.calls.filter((c) => keyOf(c.args) === B);
    expect(bCalls.length).toBeGreaterThanOrEqual(1);
    // R2-IN-04 땐 리스가 끝난 19:56:00 뒤에야 넣었다 — R3-IN-03 부터는 queued 가 되는 순간(19:55:30) 넣는다
    expect(bCalls[0]!.at).toBeGreaterThanOrEqual(at("195530"));
    expect(bCalls[0]!.args.fromNs).toBe(DAY_START);
    const e = r.cache.get(B)!;
    expect(e.complete).toBe(true);
    expect(e.lastRecvNs! >= kstDayStartNs(DATE, "1955")).toBe(true);
    r.clock.t = at("200100");
    await r.drive({ untilT: at("201000") });
    expect(e.closed).toBe(true); // 20:01 마무리는 19:55 이후만 읽어 압축된 아침 파일을 건너뛰지 않는다
  });

  it("리스가 살아 있는 queued 키(활성 maxKeys 밖)도 19:55 에 따라잡는다 — 활성 키는 그대로 · 20:01 마무리는 마지막 몇 분만 · 승격(R3-IN-03)", async () => {
    const A = keyN(1);
    const B = keyN(2);
    const r: Rig = rig((a) => minuteDay(a, r.clock.t), { maxKeys: 1 }, at("195300"));
    r.poller.touch(A);
    await r.drive({ untilCalls: 1, touch: [A] });
    expect(r.poller.touch(B)).toEqual({ state: "queued", queue: 1 }); // 계속 보는 화면 — 리스는 끝나지 않는다
    await r.drive({ untilT: at("195459"), touch: [A, B] });
    expect(r.calls.filter((c) => keyOf(c.args) === B)).toEqual([]); // 창 전엔 보통 루프가 돌지 않는다
    await r.drive({ untilT: at("195900"), touch: [A, B] });
    const bCalls = r.calls.filter((c) => keyOf(c.args) === B);
    expect(bCalls.length).toBeGreaterThanOrEqual(1);
    expect(bCalls[0]!.at).toBe(at("195500"));
    expect(bCalls[0]!.args.fromNs).toBe(DAY_START); // 받은 적 없음 — 08:00 부터
    const e = r.cache.get(B)!;
    expect(e.complete).toBe(true);
    expect(e.lastRecvNs! >= kstDayStartNs(DATE, "1954")).toBe(true);
    expect(r.poller.touch(B)).toEqual({ state: "queued", queue: 1 }); // 활성 상한은 그대로
    const aWin = r.calls.filter((c) => keyOf(c.args) === A && c.at >= at("195500"));
    expect(aWin.length).toBeGreaterThanOrEqual(40); // 활성 키는 교대로 5초 증분을 계속 받는다
    await r.drive({ untilT: at("201000"), touch: [A, B] });
    expect(e.complete).toBe(true);
    expect(e.closed).toBe(true); // 고치기 전엔 20:01 이 08:00 부터 읽다 압축된 아침 파일을 건너뛰어 complete=false · 승격 안 됨
  });

  it("승격 창(따라잡기 시작 ~ 21:00) 밖에선 오늘 complete 키도 LRU 후보 · 지우면 cache evict warn 이 남는다", async () => {
    const lines: Record<string, unknown>[] = [];
    const prevLevel = process.env.LOG_LEVEL;
    // 키당 6레코드 60B · 상한 100B — 10:00 에 키 1 을 닫고 키 2 를 열면 키 1(리스 끝 · 창 밖)이 밀려난다
    const r = rig((a) => dayResponse(a, 6), {}, at("100000"), 100);
    r.poller.touch(keyN(1));
    await r.drive({ untilCalls: 1, touch: [keyN(1)] });
    r.clock.t += 31_000;
    process.env.LOG_LEVEL = "info";
    const err = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      try {
        lines.push(JSON.parse(String(chunk)) as Record<string, unknown>);
      } catch {
        /* 로그 줄이 아님 */
      }
      return true;
    });
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      r.poller.touch(keyN(2));
      await r.drive({ untilCalls: 2, touch: [keyN(2)] });
    } finally {
      err.mockRestore();
      out.mockRestore();
      process.env.LOG_LEVEL = prevLevel;
    }
    expect(r.cache.get(keyN(1))).toBeUndefined();
    expect(r.cache.get(keyN(2))!.records).toBe(6);
    expect(lines.find((l) => l.msg === "cache evict")).toMatchObject({ key: keyN(1), size: 60, complete: true, reason: "lru" });
  });

  it("따라잡기 중 그 키 하루치가 캐시 상한을 넘으면 멈춘다 — 다음 페이지를 받지 않는다 · blocked", async () => {
    // 레코드 10B · 페이지 4건 · 상한 100B — 08:03 에 3건(30B) · 리스 끝 · 19:55 첫 페이지 40B(=70B) · 둘째 40B 에서 too_large
    const r: Rig = rig((a) => minuteDay(a, r.clock.t, 4), {}, at("080300"), 100);
    r.poller.touch(KEY);
    await r.drive({ untilCalls: 1, touch: [KEY] });
    const e = r.cache.get(KEY)!;
    r.clock.t = at("195459");
    await r.drive({ untilT: at("200000") });
    expect(r.calls).toHaveLength(3);
    expect(e.records).toBe(7);
    expect(e.complete).toBe(false);
    expect(r.poller.touch(KEY)).toEqual({ state: "blocked", queue: 0 });
  });
});

describe("config — TICKGW_CATCHUP_AT", () => {
  const base = { TICKGW_SECRET: "x".repeat(32) };
  it("기본 19:55 · off 면 null · 19:59 이후 · 형식 오류는 거부", () => {
    expect(loadConfig(base).catchupHhmm).toBe(1955);
    expect(loadConfig({ ...base, TICKGW_CATCHUP_AT: "off" }).catchupHhmm).toBeNull();
    expect(loadConfig({ ...base, TICKGW_CATCHUP_AT: "19:50" }).catchupHhmm).toBe(1950);
    expect(loadConfig({ ...base, TICKGW_CATCHUP_AT: "19:58" }).catchupHhmm).toBe(1958);
    expect(() => loadConfig({ ...base, TICKGW_CATCHUP_AT: "19:59" })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, TICKGW_CATCHUP_AT: "20:00" })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, TICKGW_CATCHUP_AT: "7:55" })).toThrow(/TICKGW_CATCHUP_AT/);
  });
});
