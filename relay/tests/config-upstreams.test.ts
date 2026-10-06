/**
 * quick-260929-c8e → Phase 29-03 — `loadConfig().envServers` (env 모드 합성 레지스트리 · 관찰자 다중 업스트림 env 표).
 *
 * 추가 관찰자는 config.ts 의 env 표에서만 온다(행 1개 — 키 KYOBO). Phase 29 에서 `journalUpstreams` 가 `envServers`
 * (`DmaServerRow`)로 바뀌고 비밀은 증권사별 `observerSecretOf` 로 갈라졌다. 케이스 의미는 그대로다:
 *   ① 추가 env 가 없으면 주 게이트웨이 1행뿐이고 기존 필드 값과 같다(오늘과 동일).
 *   ② 호스트 → 두 번째 행 {KYOBO · 호스트 · 9100 · KYOBO 주문 서버} · 비밀은 observerSecretOf("KYOBO") · 포트 env 로 바꿀 수 있다.
 *   ③ 비밀만 있거나 호스트가 빈 문자열이면 추가 행이 없다.
 *   ④ production 에서도 추가 게이트웨이 비밀 부재는 기동을 막지 않는다(observerSecretOf undefined → disabled).
 *   ⑤ 추가 행의 키가 주 게이트웨이 키와 같으면 기동을 거부한다(커서 · epoch · 매핑 혼합 방지).
 *
 * 규율: 주소는 TEST-NET(192.0.2.x)만 쓴다(D-27). 건드린 env 는 전부 원래 값으로 되돌린다
 * (journal-observer.test.ts `loadConfig` describe 관례).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

const TOUCHED = [
  "NODE_ENV",
  "DMA_HOST",
  "DMA_PORT",
  "DMA_BROKER",
  "DMA_OBSERVER_SECRET",
  "DMA_KYOBO_HOST",
  "DMA_KYOBO_PORT",
  "DMA_OBSERVER_SECRET_KYOBO",
  "DMA_REGISTRY_SOURCE",
] as const;

const PRIMARY_SECRET = "primary-observer-secret-test";
const KYOBO_SECRET = "kyobo-observer-secret-test";

const KB_ROW = {
  key: "KB",
  broker: "KB",
  host: "127.0.0.1",
  port: 9100,
  enabled: true,
  isOrderServer: true,
  isQuotePrimary: true,
  sortOrder: 0,
};
const KYOBO_ROW = {
  key: "KYOBO",
  broker: "KYOBO",
  host: "192.0.2.10",
  port: 9100,
  enabled: true,
  isOrderServer: true,
  isQuotePrimary: false,
  sortOrder: 1,
};

describe("loadConfig — envServers (quick-260929-c8e → Phase 29-03)", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of TOUCHED) saved[k] = process.env[k];
    // 바깥 환경에서 새어 들어오지 않게 추가 관찰자 env 는 매 케이스 비우고 시작한다.
    delete process.env.DMA_KYOBO_HOST;
    delete process.env.DMA_KYOBO_PORT;
    delete process.env.DMA_OBSERVER_SECRET_KYOBO;
    delete process.env.DMA_BROKER;
    delete process.env.DMA_REGISTRY_SOURCE;
    process.env.DMA_HOST = "127.0.0.1";
    process.env.DMA_PORT = "9100";
    process.env.DMA_OBSERVER_SECRET = PRIMARY_SECRET;
  });

  afterEach(() => {
    for (const k of TOUCHED) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("① 추가 env 없음 → [{KB · host · port · 주문 · 시세 주}] 1행 · 기존 필드 값과 같다", () => {
    const c = loadConfig();
    expect(c.envServers).toEqual([KB_ROW]);
    const [primary] = c.envServers;
    expect(primary).toMatchObject({ key: c.dmaBroker, broker: c.dmaBroker, host: c.dmaHost, port: c.dmaPort });
    expect(c.observerSecretOf("KB")).toBe(c.dmaObserverSecret);
    expect(c.observerSecretOf("KB")).toBe(PRIMARY_SECRET);
  });

  it("② 호스트 + 비밀 → envServers[1] = {KYOBO · 192.0.2.10 · 9100 · KYOBO 주문 서버} · 비밀은 증권사별 · DMA_KYOBO_PORT 로 포트 변경", () => {
    process.env.DMA_KYOBO_HOST = "192.0.2.10";
    process.env.DMA_OBSERVER_SECRET_KYOBO = KYOBO_SECRET;
    const c = loadConfig();
    expect(c.envServers).toHaveLength(2);
    expect(c.envServers[1]).toEqual(KYOBO_ROW);
    expect(c.observerSecretOf("KYOBO")).toBe(KYOBO_SECRET);
    // 주 게이트웨이 행 · 비밀은 그대로다.
    expect(c.envServers[0]).toEqual(KB_ROW);
    expect(c.observerSecretOf("KB")).toBe(PRIMARY_SECRET);

    process.env.DMA_KYOBO_PORT = "9105";
    expect(loadConfig().envServers[1]?.port).toBe(9105);
    // 빈 포트는 기본값 9100.
    process.env.DMA_KYOBO_PORT = "";
    expect(loadConfig().envServers[1]?.port).toBe(9100);
  });

  it("③ 비밀만 있거나 호스트가 빈 문자열이면 추가 원소가 없다", () => {
    process.env.DMA_OBSERVER_SECRET_KYOBO = KYOBO_SECRET;
    expect(loadConfig().envServers).toHaveLength(1);
    process.env.DMA_KYOBO_HOST = "";
    expect(loadConfig().envServers).toHaveLength(1);
  });

  it("④ production(db) + KB 비밀 있음 + KYOBO 호스트만 → throw 없이 observerSecretOf(KYOBO) undefined (disabled 로 드러난다)", () => {
    process.env.NODE_ENV = "production";
    // Phase 29 D-09 — production 은 db 원천 필수(env 합성은 계산만 해 둔다).
    process.env.DMA_REGISTRY_SOURCE = "db";
    process.env.DMA_KYOBO_HOST = "192.0.2.10";
    expect(() => loadConfig()).not.toThrow();
    const c = loadConfig();
    expect(c.envServers[1]).toEqual(KYOBO_ROW);
    expect(c.observerSecretOf("KYOBO")).toBeUndefined();
    // 빈 비밀도 undefined 다.
    process.env.DMA_OBSERVER_SECRET_KYOBO = "";
    expect(loadConfig().observerSecretOf("KYOBO")).toBeUndefined();
    // 주 게이트웨이 비밀의 production 필수 규칙은 그대로다.
    delete process.env.DMA_OBSERVER_SECRET;
    expect(() => loadConfig()).toThrow(/DMA_OBSERVER_SECRET must be set in production/);
  });

  it("⑤ DMA_BROKER=KYOBO + KYOBO 호스트 → 게이트웨이 키 충돌로 기동 거부 (메시지에 키)", () => {
    process.env.DMA_BROKER = "KYOBO";
    process.env.DMA_KYOBO_HOST = "192.0.2.10";
    process.env.DMA_OBSERVER_SECRET_KYOBO = KYOBO_SECRET;
    expect(() => loadConfig()).toThrow(/KYOBO/);
    // 추가 호스트가 없으면 충돌이 아니다 — 주 게이트웨이 키만 바뀐 것이다.
    delete process.env.DMA_KYOBO_HOST;
    const c = loadConfig();
    expect(c.envServers).toEqual([{ ...KB_ROW, key: "KYOBO", broker: "KYOBO" }]);
    // 비밀은 증권사별이다 — 주 게이트웨이가 KYOBO 면 KYOBO 비밀을 쓴다(Phase 29 Pitfall 11).
    expect(c.observerSecretOf("KYOBO")).toBe(KYOBO_SECRET);
  });
});
