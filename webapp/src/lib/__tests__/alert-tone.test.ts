import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BREAKOUT_TONE_KEY } from "../breakout-list";

/**
 * Phase 18 Plan 04 Task 3 — 돌파 알림음 (D-17, TRADE-06).
 *
 * 잠그는 명제:
 *  ① 토글이 꺼져 있으면(기본) 아무 노드도 만들지 않는다 — AudioContext 조차 만들지 않는다
 *  ② `AudioContext.state === "suspended"` 면 차단으로 판정한다
 *  ③ 합성 파라미터 — sine 880Hz · 총 160ms · gain 0 → 0.18(10ms) → 0(exponential)
 *  ④ AudioContext 는 지연 생성이다 — 모듈 로드 시점에 만들지 않는다
 */

type Call = [string, ...unknown[]];

class FakeParam {
  calls: Call[] = [];
  setValueAtTime(v: number, t: number) {
    this.calls.push(["set", v, t]);
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.calls.push(["linear", v, t]);
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.calls.push(["exp", v, t]);
  }
}

class FakeOsc {
  type = "";
  frequency = new FakeParam();
  started: number[] = [];
  stopped: number[] = [];
  connect() {}
  start(t: number) {
    this.started.push(t);
  }
  stop(t: number) {
    this.stopped.push(t);
  }
}

class FakeGain {
  gain = new FakeParam();
  connect() {}
}

let instances: FakeCtx[] = [];

class FakeCtx {
  state: "running" | "suspended" = "running";
  currentTime = 1;
  destination = {};
  oscs: FakeOsc[] = [];
  gains: FakeGain[] = [];
  resume = vi.fn(async () => {
    this.state = "running";
  });
  constructor() {
    instances.push(this);
  }
  createOscillator() {
    const o = new FakeOsc();
    this.oscs.push(o);
    return o;
  }
  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
}

async function load() {
  vi.resetModules();
  return import("../alert-tone");
}

beforeEach(() => {
  instances = [];
  window.localStorage.clear();
  vi.stubGlobal("AudioContext", FakeCtx);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("alert-tone", () => {
  it("모듈 로드만으로 AudioContext 를 만들지 않는다(지연 생성)", async () => {
    await load();
    expect(instances).toHaveLength(0);
  });

  it("토글이 꺼져 있으면(기본) playBreakoutTone 은 아무 노드도 만들지 않는다", async () => {
    const { playBreakoutTone } = await load();
    expect(playBreakoutTone()).toBe(false);
    expect(instances).toHaveLength(0);
  });

  it("토글이 켜져 있으면 sine 880Hz · 160ms · gain 0 → 0.18(10ms) → 0 으로 한 번 울린다", async () => {
    window.localStorage.setItem(BREAKOUT_TONE_KEY, "on");
    const { playBreakoutTone } = await load();
    expect(playBreakoutTone()).toBe(true);
    const ctx = instances[0];
    expect(ctx.oscs).toHaveLength(1);
    const osc = ctx.oscs[0];
    expect(osc.type).toBe("sine");
    expect(osc.frequency.calls).toContainEqual(["set", 880, 1]);
    expect(osc.started).toEqual([1]);
    expect(osc.stopped[0]).toBeCloseTo(1.16, 5);

    const g = ctx.gains[0].gain.calls;
    expect(g[0]).toEqual(["set", 0, 1]);
    expect(g[1][0]).toBe("linear");
    expect(g[1][1]).toBe(0.18);
    expect(g[1][2] as number).toBeCloseTo(1.01, 5);
    // exponential 은 0 에 도달할 수 없다 — 0 에 충분히 가까운 값으로 160ms 에 끝난다.
    expect(g[2][0]).toBe("exp");
    expect(g[2][1] as number).toBeGreaterThan(0);
    expect(g[2][1] as number).toBeLessThan(0.001);
    expect(g[2][2] as number).toBeCloseTo(1.16, 5);
  });

  it("AudioContext.state 가 suspended 면 isTonePlaybackBlocked 가 true 다", async () => {
    window.localStorage.setItem(BREAKOUT_TONE_KEY, "on");
    const { isTonePlaybackBlocked, playBreakoutTone } = await load();
    playBreakoutTone();
    instances[0].state = "suspended";
    expect(isTonePlaybackBlocked()).toBe(true);
    instances[0].state = "running";
    expect(isTonePlaybackBlocked()).toBe(false);
  });

  it("resumeToneContext 는 컨텍스트를 resume 하고 차단을 해제한다(제스처 핸들러에서 부른다)", async () => {
    const { isTonePlaybackBlocked, resumeToneContext } = await load();
    await resumeToneContext();
    const ctx = instances[0];
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(isTonePlaybackBlocked()).toBe(false);
  });

  it("AudioContext 가 없는 환경에서도 throw 하지 않는다", async () => {
    vi.stubGlobal("AudioContext", undefined);
    window.localStorage.setItem(BREAKOUT_TONE_KEY, "on");
    const { isTonePlaybackBlocked, playBreakoutTone, resumeToneContext } = await load();
    expect(playBreakoutTone()).toBe(false);
    expect(isTonePlaybackBlocked()).toBe(false);
    await expect(resumeToneContext()).resolves.toBeUndefined();
  });

  it("소스 최상위에서 AudioContext 를 생성하지 않고 오디오 파일을 참조하지 않는다", () => {
    const src = readFileSync(path.resolve(__dirname, "../alert-tone.ts"), "utf8");
    expect(src).not.toMatch(/^(const|let|var)\s+\w+\s*=\s*new\s+AudioContext/m);
    expect(src).not.toMatch(/\.(mp3|wav|ogg)\b/);
    expect(src).not.toMatch(/new Audio\(/);
  });
});
