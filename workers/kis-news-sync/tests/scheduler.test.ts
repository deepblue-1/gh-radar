import { describe, expect, it } from "vitest";
import {
  STOCK_MIN_INTERVAL_MS,
  TargetQueue,
  TokenBucket,
  type TargetInfo,
} from "../src/pipeline/scheduler";

/**
 * Phase 41-08 — 초당 상한 토큰 버킷(공식 API 운영 기준 ①) · 종목 대상 순서(D-05 · D-06).
 * 시계는 주입한다 — 실제 시간이 흐르지 않는다.
 */

function fakeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
    set: (ms: number) => {
      t = ms;
    },
  };
}

describe("TokenBucket", () => {
  it("초당 5 · 용량 5: 연속 5번 참 · 6번째 거짓", () => {
    const c = fakeClock(1_000);
    const b = new TokenBucket(5, 5, c.now);
    const got = Array.from({ length: 6 }, () => b.tryTake());
    expect(got).toEqual([true, true, true, true, true, false]);
  });

  it("다 쓴 뒤 200ms 가 지나면 1번 참 · 바로 다음은 거짓", () => {
    const c = fakeClock(1_000);
    const b = new TokenBucket(5, 5, c.now);
    for (let i = 0; i < 5; i++) b.tryTake();
    expect(b.tryTake()).toBe(false);
    c.advance(200);
    expect(b.tryTake()).toBe(true);
    expect(b.tryTake()).toBe(false);
  });

  it("msUntilNext: 토큰이 있으면 0 · 없으면 다음 토큰까지 남은 ms", () => {
    const c = fakeClock(0);
    const b = new TokenBucket(5, 5, c.now);
    expect(b.msUntilNext()).toBe(0);
    for (let i = 0; i < 5; i++) b.tryTake();
    expect(b.msUntilNext()).toBe(200);
    c.advance(150);
    expect(b.msUntilNext()).toBe(50);
  });

  it("다 쓴 뒤 10ms 마다 시도하면 1초에 5번을 넘지 않는다(3초 동안 초마다)", () => {
    const c = fakeClock(0);
    const b = new TokenBucket(5, 5, c.now);
    for (let i = 0; i < 5; i++) b.tryTake();
    const perSecond = [0, 0, 0];
    for (let t = 0; t < 3_000; t += 10) {
      c.set(t);
      if (b.tryTake()) perSecond[Math.floor(t / 1000)] += 1;
    }
    for (const n of perSecond) expect(n).toBeLessThanOrEqual(5);
    expect(perSecond.reduce((a, n) => a + n, 0)).toBeGreaterThanOrEqual(14);
  });

  it("용량 1 이면 버스트가 없다 — 어느 1초 창(반열림)에도 rate 이하", () => {
    const c = fakeClock(0);
    const b = new TokenBucket(5, 1, c.now);
    const takes: number[] = [];
    for (let t = 0; t < 3_000; t += 10) {
      c.set(t);
      if (b.tryTake()) takes.push(t);
    }
    for (const start of takes) {
      expect(takes.filter((x) => x >= start && x < start + 1_000).length).toBeLessThanOrEqual(5);
    }
  });

  it("초당 2.5(종목 몫)면 토큰 간격이 400ms", () => {
    const c = fakeClock(0);
    const b = new TokenBucket(2.5, 1, c.now);
    expect(b.tryTake()).toBe(true);
    c.advance(399);
    expect(b.tryTake()).toBe(false);
    c.advance(1);
    expect(b.tryTake()).toBe(true);
  });
});

// ── TargetQueue ───────────────────────────────────────────────────────
const T = (hms: string) => Date.parse(`2026-11-16T${hms}+09:00`);

function target(code: string, over: Partial<TargetInfo> = {}): TargetInfo {
  return { code, reasons: ["mover"], rank: null, lastRequestedAt: null, lastCollectedAt: null, ...over };
}

describe("TargetQueue", () => {
  it("STOCK_MIN_INTERVAL_MS = 30초", () => {
    expect(STOCK_MIN_INTERVAL_MS).toBe(30_000);
  });

  it("수집 전(등록 최신순) → 수집된 것(오래된 순) 순서로 낸다", () => {
    const q = new TargetQueue(STOCK_MIN_INTERVAL_MS, 450);
    const now = T("10:01:00");
    q.update(
      [
        target("000010", { lastCollectedAt: T("10:00:00") }),
        target("000020", { reasons: ["registered"], lastRequestedAt: T("10:00:01") }),
        target("000030", { lastCollectedAt: T("09:59:00") }),
        target("000040", { reasons: ["registered"], lastRequestedAt: T("10:00:05") }),
      ],
      now,
    );
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      const t = q.next(now);
      if (!t) break;
      order.push(t.code);
      q.markCollected(t.code, now);
    }
    expect(order).toEqual(["000040", "000020", "000030", "000010"]);
  });

  it("30초 안에 모은 종목은 건너뛴다", () => {
    const q = new TargetQueue(STOCK_MIN_INTERVAL_MS, 450);
    const now = T("10:00:40");
    q.update(
      [target("000010", { lastCollectedAt: T("10:00:20") }), target("000020", { lastCollectedAt: T("10:00:00") })],
      now,
    );
    expect(q.next(now)?.code).toBe("000020");
  });

  it("모두 30초 안이면 null · 30초가 지나면 다시 낸다", () => {
    const q = new TargetQueue(STOCK_MIN_INTERVAL_MS, 450);
    const now = T("10:00:00");
    q.update([target("000010")], now);
    expect(q.next(now)?.code).toBe("000010");
    q.markCollected("000010", now);
    expect(q.next(now + 29_999)).toBeNull();
    expect(q.next(now + 30_000)?.code).toBe("000010");
  });

  it("다시 읽은 DB 값이 이 실행의 수집 기록보다 오래돼도 이 실행의 기록을 쓴다", () => {
    const q = new TargetQueue(STOCK_MIN_INTERVAL_MS, 450);
    const now = T("10:00:00");
    q.update([target("000010")], now);
    q.markCollected("000010", now);
    // DB 는 아직 수집 전(null)으로 돌려준다 — 그래도 30초 안이면 건너뛴다
    q.update([target("000010")], now + 5_000);
    expect(q.next(now + 5_000)).toBeNull();
  });

  it("update 로 새 등록이 오면 다음 next 가 그것", () => {
    const q = new TargetQueue(STOCK_MIN_INTERVAL_MS, 450);
    const now = T("10:00:00");
    q.update(
      [target("000010", { lastCollectedAt: T("09:50:00") }), target("000020", { lastCollectedAt: T("09:55:00") })],
      now,
    );
    expect(q.next(now)?.code).toBe("000010");
    q.update(
      [
        target("000010", { lastCollectedAt: T("09:50:00") }),
        target("000020", { lastCollectedAt: T("09:55:00") }),
        target("000099", { reasons: ["registered"], lastRequestedAt: now }),
      ],
      now,
    );
    expect(q.next(now)?.code).toBe("000099");
  });

  it("상한을 넘으면 dropped 수를 돌려주고 급등 · 관심을 등록보다 먼저 남긴다", () => {
    const q = new TargetQueue(STOCK_MIN_INTERVAL_MS, 2);
    const now = T("10:00:00");
    const r = q.update(
      [
        target("000010", { reasons: ["registered"], lastRequestedAt: T("09:59:59") }),
        target("000020", { reasons: ["mover"], rank: 3 }),
        target("000030", { reasons: ["watch"] }),
      ],
      now,
    );
    expect(r).toEqual({ size: 2, dropped: 1 });
    const seen: string[] = [];
    for (let t = q.next(now); t; t = q.next(now)) {
      seen.push(t.code);
      q.markCollected(t.code, now);
    }
    expect(seen.sort()).toEqual(["000020", "000030"]);
  });

  it("ordered(now) 는 지금 조회할 수 있는 종목 전부를 next() 순서로(30초 안에 모은 것 제외)", () => {
    const q = new TargetQueue(STOCK_MIN_INTERVAL_MS, 450);
    const now = T("10:01:00");
    q.update(
      [
        target("000010", { lastCollectedAt: T("10:00:00") }),
        target("000020", { reasons: ["registered"], lastRequestedAt: T("10:00:01") }),
        target("000030", { lastCollectedAt: T("10:00:50") }),
        target("000040", { reasons: ["registered"], lastRequestedAt: T("10:00:05") }),
      ],
      now,
    );
    expect(q.ordered(now).map((t) => t.code)).toEqual(["000040", "000020", "000010"]);
  });

  it("대상에서 빠진 종목은 더 내지 않는다", () => {
    const q = new TargetQueue(STOCK_MIN_INTERVAL_MS, 450);
    const now = T("10:00:00");
    q.update([target("000010"), target("000020")], now);
    q.update([target("000020")], now);
    expect(q.next(now)?.code).toBe("000020");
    q.markCollected("000020", now);
    expect(q.next(now)).toBeNull();
  });
});
