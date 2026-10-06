/**
 * Phase 29 Plan 03 — D-09. `loadConfig()` 의 서버 레지스트리 원천 게이트 · env 합성 · 증권사별 비밀.
 *
 * 잠그는 것:
 *   ① `DMA_REGISTRY_SOURCE` 미설정 → env · db + 비프로덕션 → 기동 거부(문구에 D-09) · production + env(또는 미설정) →
 *      기동 거부 · 알 수 없는 값 → 기동 거부 · production + db → `dmaRegistrySource === "db"`.
 *   ② env 합성 — 기본 1행(KB · 127.0.0.1 · 9100 · 주문 + 시세 주) · KYOBO 호스트면 둘째 행(KYOBO 주문 · 시세 주 아님) ·
 *      DMA_BROKER=KYOBO 와 KYOBO 행이 겹치면 기동 거부 · DMA_BROKER 가 KB/KYOBO 밖이면 기동 거부.
 *   ③ 증권사별 비밀 — observerSecretOf · quoteSecretOf 매핑.
 *   ④ production 비밀 부재 사유는 원천 게이트보다 먼저다(문구 불변).
 *
 * 규율: 주소는 127.0.0.1 · TEST-NET(192.0.2.x)만(D-27). 건드린 env 는 전부 원래 값으로 되돌린다.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

const TOUCHED = [
  "NODE_ENV",
  "DMA_REGISTRY_SOURCE",
  "DMA_HOST",
  "DMA_PORT",
  "DMA_BROKER",
  "DMA_OBSERVER_SECRET",
  "DMA_QUOTE_OBSERVER_SECRET",
  "DMA_KYOBO_HOST",
  "DMA_KYOBO_PORT",
  "DMA_OBSERVER_SECRET_KYOBO",
] as const;

const KB_SECRET = "kb-observer-secret-registry-test";
const KYOBO_SECRET = "kyobo-observer-secret-registry-test";
const QUOTE_SECRET = "quote-observer-secret-registry-test";

describe("loadConfig — DMA_REGISTRY_SOURCE 원천 게이트 (Phase 29 D-09)", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of TOUCHED) saved[k] = process.env[k];
    for (const k of TOUCHED) delete process.env[k];
    process.env.NODE_ENV = "test";
    process.env.DMA_OBSERVER_SECRET = KB_SECRET;
  });

  afterEach(() => {
    for (const k of TOUCHED) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("① 미설정 · 빈 값 → env", () => {
    expect(loadConfig().dmaRegistrySource).toBe("env");
    process.env.DMA_REGISTRY_SOURCE = "";
    expect(loadConfig().dmaRegistrySource).toBe("env");
    process.env.DMA_REGISTRY_SOURCE = "env";
    expect(loadConfig().dmaRegistrySource).toBe("env");
  });

  it("① db + NODE_ENV development/test → 기동 거부(문구에 D-09) — 로컬 relay 는 운영 레지스트리를 읽지 않는다", () => {
    process.env.DMA_REGISTRY_SOURCE = "db";
    for (const env of ["development", "test"]) {
      process.env.NODE_ENV = env;
      expect(() => loadConfig()).toThrow(/D-09/);
      expect(() => loadConfig()).toThrow(/NODE_ENV=production/);
    }
    // NODE_ENV 미설정(= development)도 같다.
    delete process.env.NODE_ENV;
    expect(() => loadConfig()).toThrow(/D-09/);
  });

  it("① production + env(또는 미설정) → 기동 거부 · production + db → db", () => {
    process.env.NODE_ENV = "production";
    expect(() => loadConfig()).toThrow(/DMA_REGISTRY_SOURCE=db must be set in production/);
    process.env.DMA_REGISTRY_SOURCE = "env";
    expect(() => loadConfig()).toThrow(/D-09/);
    process.env.DMA_REGISTRY_SOURCE = "db";
    expect(loadConfig().dmaRegistrySource).toBe("db");
  });

  it("① 알 수 없는 값 → 기동 거부", () => {
    process.env.DMA_REGISTRY_SOURCE = "bogus";
    expect(() => loadConfig()).toThrow(/DMA_REGISTRY_SOURCE must be "env" or "db"/);
    process.env.NODE_ENV = "production";
    expect(() => loadConfig()).toThrow(/DMA_REGISTRY_SOURCE/);
  });

  it("④ production 비밀 부재 사유가 원천 게이트보다 먼저다(Phase 19 문구 불변) · 거부 문구에 비밀 없음", () => {
    process.env.NODE_ENV = "production";
    delete process.env.DMA_OBSERVER_SECRET;
    expect(() => loadConfig()).toThrow(/DMA_OBSERVER_SECRET must be set in production/);
    process.env.DMA_OBSERVER_SECRET = KB_SECRET;
    process.env.DMA_OBSERVER_SECRET_KYOBO = KYOBO_SECRET;
    try {
      loadConfig();
      expect.unreachable("production + env 는 거부돼야 한다");
    } catch (err) {
      const msg = String((err as Error).message);
      expect(msg).not.toContain(KB_SECRET);
      expect(msg).not.toContain(KYOBO_SECRET);
    }
  });

  it("② env 기본 → KB 1행(127.0.0.1 · 9100 · 주문 · 시세 주) — 실서버 주소 기본값 없음", () => {
    const c = loadConfig();
    expect(c.envServers).toEqual([
      {
        key: "KB",
        broker: "KB",
        host: "127.0.0.1",
        port: 9100,
        enabled: true,
        isOrderServer: true,
        isQuotePrimary: true,
        sortOrder: 0,
      },
    ]);
  });

  it("② DMA_KYOBO_HOST=192.0.2.10 → 둘째 행 KYOBO(주문 서버 · 시세 주 아님)", () => {
    process.env.DMA_KYOBO_HOST = "192.0.2.10";
    const c = loadConfig();
    expect(c.envServers).toHaveLength(2);
    expect(c.envServers[1]).toEqual({
      key: "KYOBO",
      broker: "KYOBO",
      host: "192.0.2.10",
      port: 9100,
      enabled: true,
      isOrderServer: true,
      isQuotePrimary: false,
      sortOrder: 1,
    });
  });

  it("② DMA_BROKER=KYOBO + KYOBO 추가 행 → 키 겹침 기동 거부 · DMA_BROKER 가 KB/KYOBO 밖이면 기동 거부", () => {
    process.env.DMA_BROKER = "KYOBO";
    process.env.DMA_KYOBO_HOST = "192.0.2.10";
    expect(() => loadConfig()).toThrow(/KYOBO/);
    delete process.env.DMA_KYOBO_HOST;
    process.env.DMA_BROKER = "MOCK";
    expect(() => loadConfig()).toThrow(/DMA_BROKER must be "KB" or "KYOBO"/);
  });

  it("③ observerSecretOf · quoteSecretOf — 증권사별 env 고정 매핑", () => {
    process.env.DMA_OBSERVER_SECRET_KYOBO = KYOBO_SECRET;
    let c = loadConfig();
    expect(c.observerSecretOf("KB")).toBe(KB_SECRET);
    expect(c.observerSecretOf("KYOBO")).toBe(KYOBO_SECRET);
    // quote KB = DMA_QUOTE_OBSERVER_SECRET ‖ DMA_OBSERVER_SECRET (26 D-17).
    expect(c.quoteSecretOf("KB")).toBe(KB_SECRET);
    expect(c.quoteSecretOf("KYOBO")).toBe(KYOBO_SECRET);
    process.env.DMA_QUOTE_OBSERVER_SECRET = QUOTE_SECRET;
    c = loadConfig();
    expect(c.quoteSecretOf("KB")).toBe(QUOTE_SECRET);
    expect(c.observerSecretOf("KB")).toBe(KB_SECRET);
    // 빈 값은 「없음」.
    process.env.DMA_OBSERVER_SECRET_KYOBO = "";
    c = loadConfig();
    expect(c.observerSecretOf("KYOBO")).toBeUndefined();
    expect(c.quoteSecretOf("KYOBO")).toBeUndefined();
    // 설정 객체를 통째로 직렬화해도 비밀 값이 함수 필드 뒤에 있어 새지 않는다(dmaObserverSecret 필드는 종전대로 redact 대상).
    process.env.DMA_OBSERVER_SECRET_KYOBO = KYOBO_SECRET;
    expect(JSON.stringify(loadConfig())).not.toContain(KYOBO_SECRET);
  });
});
