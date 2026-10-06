/**
 * Phase 26 Plan 04 — D-17. `loadConfig().dmaQuoteObserverSecret` (시세 전용 관찰자 · role 1 비밀).
 *
 * 규칙: `DMA_QUOTE_OBSERVER_SECRET` 이 있으면 그 값, 없으면 `DMA_OBSERVER_SECRET` 폴백. 빈 문자열은 「없음」.
 * 여기서 잠그는 것:
 *   ① `DMA_OBSERVER_SECRET` 만 있음 → quote 도 그 값(프로덕션 · Secret Manager 무변경 경로).
 *   ② 둘 다 있음 → quote 는 `DMA_QUOTE_OBSERVER_SECRET` · 저널은 여전히 `DMA_OBSERVER_SECRET`.
 *   ③ NODE_ENV=test · 저널 비밀 빈 문자열 · quote 키만 → quote 는 그 값 · 저널 undefined(e2e 구성).
 *   ④ 둘 다 없음(또는 둘 다 빈 문자열) → undefined(QuoteFeed disabled).
 *   ⑤ NODE_ENV=production · 저널 비밀 없음 → quote 키가 있어도 기동 거부(19 D-13 무변경).
 *
 * Phase 26 Plan 08 — D-10. `loadConfig().quoteLingerMs` (hub linger · `QUOTE_LINGER_MS`).
 *   env 없음 → 15000(hub `LINGER_MS`) · 0 · 30000 은 그대로 · 음수 · 비숫자는 사유 문구와 함께 기동 거부.
 *
 * 규율: 건드린 env 는 전부 원래 값으로 되돌린다(config-upstreams.test.ts 관례). 비밀 값은 의미 없는 더미다.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { LINGER_MS } from "../src/hub/subscription-hub.js";

const TOUCHED = [
  "NODE_ENV",
  "DMA_OBSERVER_SECRET",
  "DMA_QUOTE_OBSERVER_SECRET",
  "DMA_KYOBO_HOST",
  "DMA_KYOBO_PORT",
  "DMA_OBSERVER_SECRET_KYOBO",
  "QUOTE_LINGER_MS",
  "DMA_REGISTRY_SOURCE",
] as const;

const JOURNAL_SECRET = "journal-observer-secret-test";
const QUOTE_SECRET = "quote-observer-secret-test";

describe("loadConfig — dmaQuoteObserverSecret (Phase 26 D-17)", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of TOUCHED) saved[k] = process.env[k];
    // 바깥 셸 값이 새어 들어오지 않게 관찰자 비밀 계열은 매 케이스 비우고 시작한다.
    delete process.env.DMA_OBSERVER_SECRET;
    delete process.env.DMA_QUOTE_OBSERVER_SECRET;
    delete process.env.DMA_KYOBO_HOST;
    delete process.env.DMA_KYOBO_PORT;
    delete process.env.DMA_OBSERVER_SECRET_KYOBO;
    delete process.env.DMA_REGISTRY_SOURCE;
    delete process.env.QUOTE_LINGER_MS;
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    for (const k of TOUCHED) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("① DMA_OBSERVER_SECRET 만 있음 → quote 비밀도 그 값(프로덕션 폴백 경로)", () => {
    process.env.DMA_OBSERVER_SECRET = JOURNAL_SECRET;
    const c = loadConfig();
    expect(c.dmaQuoteObserverSecret).toBe(JOURNAL_SECRET);
    expect(c.dmaObserverSecret).toBe(JOURNAL_SECRET);
    // production 도 같은 폴백이다 — Secret Manager 에는 DMA_OBSERVER_SECRET 하나뿐이다.
    // Phase 29 D-09 — production 은 레지스트리 db 원천이 필수다(이 케이스의 관심사는 비밀 폴백뿐).
    process.env.NODE_ENV = "production";
    process.env.DMA_REGISTRY_SOURCE = "db";
    expect(loadConfig().dmaQuoteObserverSecret).toBe(JOURNAL_SECRET);
    // quote 키가 빈 문자열이면 「없음」 — 폴백한다.
    process.env.DMA_QUOTE_OBSERVER_SECRET = "";
    expect(loadConfig().dmaQuoteObserverSecret).toBe(JOURNAL_SECRET);
  });

  it("② 둘 다 있음 → quote 는 DMA_QUOTE_OBSERVER_SECRET · 저널은 DMA_OBSERVER_SECRET", () => {
    process.env.DMA_OBSERVER_SECRET = JOURNAL_SECRET;
    process.env.DMA_QUOTE_OBSERVER_SECRET = QUOTE_SECRET;
    const c = loadConfig();
    expect(c.dmaQuoteObserverSecret).toBe(QUOTE_SECRET);
    expect(c.dmaObserverSecret).toBe(JOURNAL_SECRET);
    // 저널 관찰자 비밀(KB)도 quote 키의 영향을 받지 않는다(Phase 29 — 증권사별 매핑).
    expect(c.observerSecretOf("KB")).toBe(JOURNAL_SECRET);
    expect(c.quoteSecretOf("KB")).toBe(QUOTE_SECRET);
  });

  it("③ NODE_ENV=test · 저널 비밀 빈 문자열 · quote 키만 → quote 는 그 값 · 저널 undefined(e2e 구성)", () => {
    process.env.DMA_OBSERVER_SECRET = "";
    process.env.DMA_QUOTE_OBSERVER_SECRET = QUOTE_SECRET;
    const c = loadConfig();
    expect(c.dmaQuoteObserverSecret).toBe(QUOTE_SECRET);
    expect(c.dmaObserverSecret).toBeUndefined();
    expect(c.observerSecretOf("KB")).toBeUndefined();
    expect(c.quoteSecretOf("KB")).toBe(QUOTE_SECRET);
    // 저널 비밀 키가 아예 없어도 같다.
    delete process.env.DMA_OBSERVER_SECRET;
    expect(loadConfig().dmaQuoteObserverSecret).toBe(QUOTE_SECRET);
  });

  it("④ 둘 다 없음(또는 둘 다 빈 문자열) → dmaQuoteObserverSecret undefined (QuoteFeed disabled)", () => {
    expect(loadConfig().dmaQuoteObserverSecret).toBeUndefined();
    process.env.DMA_OBSERVER_SECRET = "";
    process.env.DMA_QUOTE_OBSERVER_SECRET = "";
    const c = loadConfig();
    expect(c.dmaQuoteObserverSecret).toBeUndefined();
    expect(c.dmaObserverSecret).toBeUndefined();
  });

  it("⑤ NODE_ENV=production · DMA_OBSERVER_SECRET 없음 → quote 키가 있어도 기동 거부(19 D-13 무변경)", () => {
    process.env.NODE_ENV = "production";
    process.env.DMA_QUOTE_OBSERVER_SECRET = QUOTE_SECRET;
    expect(() => loadConfig()).toThrow(/DMA_OBSERVER_SECRET must be set in production/);
    // 거부 문구에 비밀 값이 실리지 않는다(T-26-05).
    try {
      loadConfig();
    } catch (err) {
      expect(String((err as Error).message)).not.toContain(QUOTE_SECRET);
    }
    // 빈 문자열도 「없음」 이다.
    process.env.DMA_OBSERVER_SECRET = "";
    expect(() => loadConfig()).toThrow(/DMA_OBSERVER_SECRET must be set in production/);
  });
});

describe("loadConfig — quoteLingerMs (Phase 26 D-10)", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of TOUCHED) saved[k] = process.env[k];
    delete process.env.QUOTE_LINGER_MS;
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    for (const k of TOUCHED) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("LK1 env 없음 → 15000 (hub LINGER_MS 와 같은 값 · 프로덕션 배포 env 무변경)", () => {
    expect(loadConfig().quoteLingerMs).toBe(15_000);
    expect(loadConfig().quoteLingerMs).toBe(LINGER_MS);
  });

  it("LK2 QUOTE_LINGER_MS=0 → 0 (e2e 즉시 해제) · 30000 → 30000", () => {
    process.env.QUOTE_LINGER_MS = "0";
    expect(loadConfig().quoteLingerMs).toBe(0);
    process.env.QUOTE_LINGER_MS = "30000";
    expect(loadConfig().quoteLingerMs).toBe(30_000);
  });

  it("LK3 음수 · 비숫자 → 사유 문구와 함께 기동 거부 (T-26-13)", () => {
    process.env.QUOTE_LINGER_MS = "-1";
    expect(() => loadConfig()).toThrow(/QUOTE_LINGER_MS/);
    process.env.QUOTE_LINGER_MS = "abc";
    expect(() => loadConfig()).toThrow(/QUOTE_LINGER_MS/);
  });
});
