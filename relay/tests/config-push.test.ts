/**
 * Phase 40 Plan 06 — `loadConfig().pushNotify` (env `PUSH_NOTIFY` · 체결 앱 푸시 켜기/끄기).
 *
 * 규칙: `on` → true · `off` → false · 없음 → production 이면 true, 그 밖(development · test)이면 false ·
 * 그 밖 값(`yes` · 빈 문자열 · 대문자 등)은 기동 거부(사유 문구에 키 이름).
 *
 * 규율: 건드린 env 는 전부 원래 값으로 되돌린다(config-quote.test.ts 관례). production 케이스는 기동 필수 env
 * (`DMA_OBSERVER_SECRET` · `DMA_REGISTRY_SOURCE=db`)를 더미로 채운다.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

const TOUCHED = ["NODE_ENV", "PUSH_NOTIFY", "DMA_OBSERVER_SECRET", "DMA_REGISTRY_SOURCE"] as const;

describe("loadConfig — pushNotify (Phase 40 PUSH_NOTIFY)", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of TOUCHED) saved[k] = process.env[k];
    delete process.env.PUSH_NOTIFY;
    delete process.env.DMA_OBSERVER_SECRET;
    delete process.env.DMA_REGISTRY_SOURCE;
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    for (const k of TOUCHED) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  const production = (): void => {
    process.env.NODE_ENV = "production";
    process.env.DMA_OBSERVER_SECRET = "observer-secret-test";
    process.env.DMA_REGISTRY_SOURCE = "db";
  };

  it("없음 + production → true(운영 기본 켜짐)", () => {
    production();
    expect(loadConfig().pushNotify).toBe(true);
  });

  it("없음 + development · test → false(로컬 · e2e 는 실기기로 보내지 않는다)", () => {
    process.env.NODE_ENV = "development";
    expect(loadConfig().pushNotify).toBe(false);
    process.env.NODE_ENV = "test";
    expect(loadConfig().pushNotify).toBe(false);
  });

  it("on → true · off → false(production 비상 끄기 포함)", () => {
    process.env.PUSH_NOTIFY = "on";
    expect(loadConfig().pushNotify).toBe(true);
    process.env.PUSH_NOTIFY = "off";
    expect(loadConfig().pushNotify).toBe(false);
    production();
    process.env.PUSH_NOTIFY = "off";
    expect(loadConfig().pushNotify).toBe(false);
  });

  it("다른 값(yes · 빈 문자열 · ON)은 기동 거부 — 사유 문구에 키 이름", () => {
    for (const v of ["yes", "", "ON"]) {
      process.env.PUSH_NOTIFY = v;
      expect(() => loadConfig()).toThrow(/PUSH_NOTIFY must be "on" or "off"/);
    }
  });
});
