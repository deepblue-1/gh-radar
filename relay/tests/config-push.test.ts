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

/**
 * Phase 40 (40-09) — `loadConfig().apns` (env `APNS_AUTH_KEY_B64` · `APNS_KEY_ID` · `APNS_TEAM_ID` · `APNS_TOPIC`).
 * 비치명: 하나만 있거나 형식이 어긋나면 apns undefined · 원인 문구(env 이름만 · 값 없음) · 기동은 된다.
 */
const APNS_TOUCHED = [
  "APNS_AUTH_KEY_B64",
  "APNS_KEY_ID",
  "APNS_TEAM_ID",
  "APNS_TOPIC",
  "DMA_OBSERVER_SECRET",
  "DMA_REGISTRY_SOURCE",
] as const;
const FAKE_PEM = "-----BEGIN PRIVATE KEY-----\nMIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg\n-----END PRIVATE KEY-----\n";
const FAKE_B64 = Buffer.from(FAKE_PEM).toString("base64");

describe("loadConfig — apns (Phase 40 APNs 비밀 · 비치명)", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of APNS_TOUCHED) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of APNS_TOUCHED) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("둘 다 있고 PEM · 10자 Key ID → 기본 팀 ID · topic 으로 apns", () => {
    process.env.APNS_AUTH_KEY_B64 = FAKE_B64;
    process.env.APNS_KEY_ID = "ABC123DEFG";
    const c = loadConfig();
    expect(c.apns).toEqual({ keyPem: FAKE_PEM, keyId: "ABC123DEFG", teamId: "954QPCS3F5", topic: "com.ghtrade.app" });
    expect(c.apnsOffReason).toBeUndefined();
  });

  it("APNS_TEAM_ID · APNS_TOPIC env 가 있으면 그 값", () => {
    process.env.APNS_AUTH_KEY_B64 = FAKE_B64;
    process.env.APNS_KEY_ID = "ABC123DEFG";
    process.env.APNS_TEAM_ID = "TEAM000001";
    process.env.APNS_TOPIC = "com.example.app";
    expect(loadConfig().apns).toMatchObject({ teamId: "TEAM000001", topic: "com.example.app" });
  });

  it("둘 다 없음 → undefined · 「APNs 비밀 없음」", () => {
    const c = loadConfig();
    expect(c.apns).toBeUndefined();
    expect(c.apnsOffReason).toBe("APNs 비밀 없음");
  });

  it("하나만 · Key ID 형식 아님 · PEM 아님 → undefined · 원인에 값이 없다", () => {
    const cases: Array<[Record<string, string>, RegExp]> = [
      [{ APNS_AUTH_KEY_B64: FAKE_B64 }, /APNS_KEY_ID 없음/],
      [{ APNS_KEY_ID: "ABC123DEFG" }, /APNS_AUTH_KEY_B64 없음/],
      [{ APNS_AUTH_KEY_B64: FAKE_B64, APNS_KEY_ID: "ABC123" }, /APNS_KEY_ID 형식 아님/],
      [{ APNS_AUTH_KEY_B64: Buffer.from("not a pem").toString("base64"), APNS_KEY_ID: "ABC123DEFG" }, /PEM 이 아님/],
    ];
    for (const [env, re] of cases) {
      for (const k of APNS_TOUCHED) delete process.env[k];
      Object.assign(process.env, env);
      const c = loadConfig();
      expect(c.apns).toBeUndefined();
      expect(c.apnsOffReason).toMatch(re);
      expect(c.apnsOffReason).not.toContain(FAKE_B64);
      expect(c.apnsOffReason).not.toContain("ABC123");
    }
  });

  it("production 에서도 비밀이 반쪽이면 기동은 된다(iOS 송신기만 빠진다)", () => {
    process.env.NODE_ENV = "production";
    process.env.DMA_OBSERVER_SECRET = "observer-secret-test";
    process.env.DMA_REGISTRY_SOURCE = "db";
    process.env.APNS_KEY_ID = "ABC123DEFG";
    const c = loadConfig();
    expect(c.apns).toBeUndefined();
    expect(c.pushNotify).toBe(true);
  });
});

/** Phase 40 (40-09) — `loadConfig().fcmProjectId` (env `FCM_PROJECT_ID` · production 기본 `gh-radar`). */
describe("loadConfig — fcmProjectId (Phase 40 FCM v1)", () => {
  const KEYS = ["FCM_PROJECT_ID", "DMA_OBSERVER_SECRET", "DMA_REGISTRY_SOURCE"] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("없음 + production → gh-radar(운영 VM 메타데이터 토큰)", () => {
    process.env.NODE_ENV = "production";
    process.env.DMA_OBSERVER_SECRET = "observer-secret-test";
    process.env.DMA_REGISTRY_SOURCE = "db";
    expect(loadConfig().fcmProjectId).toBe("gh-radar");
  });

  it("없음 + development · test → undefined(로컬엔 메타데이터 서버가 없다)", () => {
    process.env.NODE_ENV = "development";
    expect(loadConfig().fcmProjectId).toBeUndefined();
    process.env.NODE_ENV = "test";
    expect(loadConfig().fcmProjectId).toBeUndefined();
  });

  it("FCM_PROJECT_ID 가 있으면 그 값(NODE_ENV 무관)", () => {
    process.env.FCM_PROJECT_ID = "other-project";
    expect(loadConfig().fcmProjectId).toBe("other-project");
  });
});
