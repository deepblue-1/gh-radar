import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 돌파 알림음 — quick-261107-fbj 로 꺼짐(Phase 18 D-17 의 합성 구현은 git 이력).
 *
 * 잠그는 명제:
 *  ① 예전에 켜 둔 저장값(`gh-radar:breakout-tone` = "on")이 있어도 울리지 않는다 — `playBreakoutTone()` 은 false
 *  ② AudioContext 생성자를 부르지 않는다(모듈 로드 · 재생 시도 모두)
 *  ③ 오디오 파일을 참조하지 않는다
 */

/** 옛 저장 키 — 이제 아무 모듈도 읽지 않는다(문자열로만 남긴다). */
const LEGACY_TONE_KEY = "gh-radar:breakout-tone";

let ctor: ReturnType<typeof vi.fn>;

async function load() {
  vi.resetModules();
  return import("../alert-tone");
}

beforeEach(() => {
  window.localStorage.clear();
  ctor = vi.fn();
  vi.stubGlobal("AudioContext", ctor);
  vi.stubGlobal("webkitAudioContext", ctor);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("alert-tone (꺼짐)", () => {
  it("옛 저장값이 on 이어도 playBreakoutTone 은 false 이고 AudioContext 를 만들지 않는다", async () => {
    window.localStorage.setItem(LEGACY_TONE_KEY, "on");
    const { playBreakoutTone } = await load();
    expect(playBreakoutTone()).toBe(false);
    expect(playBreakoutTone()).toBe(false);
    expect(ctor).not.toHaveBeenCalled();
  });

  it("저장값이 없어도 false · 생성자 호출 0", async () => {
    const { playBreakoutTone } = await load();
    expect(playBreakoutTone()).toBe(false);
    expect(ctor).not.toHaveBeenCalled();
  });

  it("소스가 AudioContext 를 생성하지 않고 오디오 파일을 참조하지 않는다", () => {
    const src = readFileSync(path.resolve(__dirname, "../alert-tone.ts"), "utf8");
    expect(src).not.toMatch(/new\s+(webkit)?AudioContext/);
    expect(src).not.toMatch(/\.(mp3|wav|ogg)\b/);
    expect(src).not.toMatch(/new Audio\(/);
  });
});
