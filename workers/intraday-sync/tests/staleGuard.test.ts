import { describe, it, expect } from "vitest";
import { detectStaleSnapshot } from "../src/pipeline/staleGuard";
import type { PrevDayRow } from "../src/pipeline/staleGuard";
import type { IntradayCloseUpdate } from "@gh-radar/shared";

function mkUpdate(
  code: string,
  price: number,
  changeRate: number | null,
): IntradayCloseUpdate {
  return {
    code,
    date: "2026-07-17",
    name: code,
    price,
    changeAmount: null,
    changeRate,
    volume: 0,
    tradeAmount: 0,
  };
}

function mkPrev(
  code: string,
  close: number | null,
  change_rate: number | null,
): PrevDayRow {
  return { code, close, change_rate };
}

/** n개의 완전 일치 쌍 생성 (price===close, changeRate===change_rate) */
function matchingPairs(
  n: number,
  price = 1000,
  rate = 5,
): { updates: IntradayCloseUpdate[]; prev: PrevDayRow[] } {
  const updates: IntradayCloseUpdate[] = [];
  const prev: PrevDayRow[] = [];
  for (let i = 0; i < n; i++) {
    const code = String(100000 + i);
    updates.push(mkUpdate(code, price, rate));
    prev.push(mkPrev(code, price, rate));
  }
  return { updates, prev };
}

describe("detectStaleSnapshot", () => {
  it("Test 1: 전체 일치 + comparable>=30 → stale=true", () => {
    const { updates, prev } = matchingPairs(30);
    const r = detectStaleSnapshot(updates, prev);
    expect(r.comparable).toBe(30);
    expect(r.matched).toBe(30);
    expect(r.ratio).toBe(1);
    expect(r.stale).toBe(true);
  });

  it("Test 2: 부분 일치(50%) → ratio<0.8 → stale=false", () => {
    const { updates, prev } = matchingPairs(30);
    // 절반의 update price 를 어긋나게 만들어 불일치 처리
    for (let i = 0; i < 15; i++) {
      updates[i] = mkUpdate(updates[i].code, 9999, 5);
    }
    const r = detectStaleSnapshot(updates, prev);
    expect(r.comparable).toBe(30);
    expect(r.matched).toBe(15);
    expect(r.ratio).toBeCloseTo(0.5, 5);
    expect(r.stale).toBe(false);
  });

  it("Test 3: 표본 부족(comparable<30) → stale=false", () => {
    const { updates, prev } = matchingPairs(29);
    const r = detectStaleSnapshot(updates, prev);
    expect(r.comparable).toBe(29);
    expect(r.matched).toBe(29);
    expect(r.ratio).toBe(1);
    expect(r.stale).toBe(false);
  });

  it("Test 4: null changeRate/change_rate 쌍은 comparable 에서 제외", () => {
    const { updates, prev } = matchingPairs(30);
    // update 5건의 changeRate 를 null 로 → comparable 에서 빠짐
    for (let i = 0; i < 3; i++) {
      updates[i] = mkUpdate(updates[i].code, 1000, null);
    }
    // prev 2건의 change_rate 를 null 로 → comparable 에서 빠짐
    prev[3] = mkPrev(prev[3].code, 1000, null);
    prev[4] = mkPrev(prev[4].code, 1000, null);
    const r = detectStaleSnapshot(updates, prev);
    expect(r.comparable).toBe(25);
    expect(r.matched).toBe(25);
    expect(r.ratio).toBe(1);
    // comparable(25) < 30 → stale=false
    expect(r.stale).toBe(false);
  });

  it("Test 5: epsilon 경계 — |diff|==0.005 불일치, 0.0049 일치", () => {
    // diff 를 0 기준으로 구성해 float 리터럴 0.005 와 정확히 같은 비트로 비교(strict <).
    const atBoundary = detectStaleSnapshot(
      [mkUpdate("100000", 1000, 0.005)],
      [mkPrev("100000", 1000, 0)],
    );
    expect(atBoundary.comparable).toBe(1);
    expect(atBoundary.matched).toBe(0); // strict < 0.005

    const justInside = detectStaleSnapshot(
      [mkUpdate("100000", 1000, 0.0049)],
      [mkPrev("100000", 1000, 0)],
    );
    expect(justInside.comparable).toBe(1);
    expect(justInside.matched).toBe(1);
  });

  it("prevRows 비어있음 → comparable=0, ratio=0, stale=false (가드 무력화 방지는 fetch 단 fail-fast 담당)", () => {
    const { updates } = matchingPairs(30);
    const r = detectStaleSnapshot(updates, []);
    expect(r.comparable).toBe(0);
    expect(r.matched).toBe(0);
    expect(r.ratio).toBe(0);
    expect(r.stale).toBe(false);
  });
});
