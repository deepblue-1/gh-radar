/**
 * Phase 29-44 — `EffectiveOwnerTracker` 단위 (G-1 ⑤c (가) 보강).
 *
 * 전 DMA 유저 × 계좌의 유효 주문 서버(지정 ?? 증권사 기본 · 그 서버 매핑에 계좌가 있을 때만 소유 — 29-33 fail closed)를 연결 유무와
 * 무관하게 스냅샷으로 쥐고, `refresh()` 가 직전과 비교해 소유 서버가 바뀐 계좌(`OwnerMove`)를 낸다. 유효 주문 서버 계산은 운영과
 * 같은 `createOrderServerRouting().effectiveOrderServer` 를 주입받는다(두 벌 금지).
 */
import { describe, expect, it } from "vitest";

import { createOrderServerRouting } from "../src/access/account-order-servers.js";
import { EffectiveOwnerTracker } from "../src/dma/effective-owner-tracker.js";
import type { DmaServerRow } from "../src/registry/registry.js";

const D1 = "tracker-d1";
const D2 = "tracker-d2";
const A = "1234567801";
const B = "1234567802";
const K = "9234567801";

function row(key: string, broker: "KB" | "KYOBO", isOrderServer: boolean, sortOrder: number): DmaServerRow {
  return { key, broker, host: "127.0.0.1", port: 1, enabled: true, isOrderServer, isQuotePrimary: false, sortOrder };
}

function setup() {
  const rows: DmaServerRow[] = [row("KB120", "KB", true, 1), row("KB121", "KB", false, 2), row("KYOBO119", "KYOBO", true, 3)];
  const mappings = new Map<string, Map<string, Set<string>>>([
    ["KB120", new Map([[D1, new Set([A, B])], [D2, new Set([B])]])],
    ["KB121", new Map([[D1, new Set([A])]])],
    ["KYOBO119", new Map([[D1, new Set([K])]])],
  ]);
  /** `${dma}|${broker}|${acct}` → 지정 서버 키. */
  const chosen = new Map<string, string>();
  let loaded = true;
  const registry = {
    get: (key: string) => rows.find((r) => r.key === key),
    enabled: () => rows.filter((r) => r.enabled),
    orderServerOf: (broker: string) => rows.find((r) => r.broker === broker && r.isOrderServer && r.enabled),
  };
  const routing = createOrderServerRouting({
    loaded: () => loaded,
    chosenOf: (dma, broker, acct) => chosen.get(`${dma}|${broker}|${acct}`),
    registry,
    accountsOf: (serverKey, dma) => mappings.get(serverKey)?.get(dma),
  });
  const tracker = new EffectiveOwnerTracker({
    ready: () => loaded,
    dmaUserIds: () => {
      const out = new Set<string>();
      for (const m of mappings.values()) for (const d of m.keys()) out.add(d);
      return out;
    },
    accountsOf: (serverKey, dma) => mappings.get(serverKey)?.get(dma),
    servers: () => registry.enabled().map((r) => ({ key: r.key, broker: r.broker })),
    effectiveOrderServer: routing.effectiveOrderServer,
  });
  return {
    rows,
    mappings,
    chosen,
    tracker,
    setLoaded: (v: boolean) => {
      loaded = v;
    },
  };
}

describe("EffectiveOwnerTracker — 전 사용자 유효 주문 서버 스냅샷 · diff (29-44)", () => {
  it("첫 refresh 는 스냅샷만(0) → 지정 (d1, KB, A, KB121) → A 만 KB120 → KB121 move 1 · B · 다른 사용자 · 교보 없음 → 재호출 0", () => {
    const t = setup();
    expect(t.tracker.refresh()).toEqual([]);
    t.chosen.set(`${D1}|KB|${A}`, "KB121");
    expect(t.tracker.refresh()).toEqual([{ dmaUserId: D1, broker: "KB", accountNo: A, from: "KB120", to: "KB121" }]);
    expect(t.tracker.refresh()).toEqual([]);
  });

  it("지정 서버 매핑에 계좌가 없으면 소유자 없음 — to undefined 도 move 다(옛 서버는 끈다 · 29-33 fail closed)", () => {
    const t = setup();
    t.tracker.refresh();
    t.chosen.set(`${D1}|KB|${B}`, "KB121"); // KB121 매핑에는 d1 의 B 가 없다.
    expect(t.tracker.refresh()).toEqual([{ dmaUserId: D1, broker: "KB", accountNo: B, from: "KB120", to: undefined }]);
    // 지정 서버 매핑이 B 를 싣으면 소유자 없음 → KB121.
    t.mappings.get("KB121")?.get(D1)?.add(B);
    expect(t.tracker.refresh()).toEqual([{ dmaUserId: D1, broker: "KB", accountNo: B, from: undefined, to: "KB121" }]);
  });

  it("레지스트리 KB 기본 KB120 → KB121 — 지정 없는 계좌 전부 from KB120 · KB121 매핑에 있으면 to KB121, 없으면 undefined · 교보 무영향", () => {
    const t = setup();
    t.tracker.refresh();
    for (const r of t.rows) if (r.broker === "KB") r.isOrderServer = r.key === "KB121";
    const moves = t.tracker.refresh();
    expect(moves).toEqual(
      expect.arrayContaining([
        { dmaUserId: D1, broker: "KB", accountNo: A, from: "KB120", to: "KB121" },
        { dmaUserId: D1, broker: "KB", accountNo: B, from: "KB120", to: undefined },
        { dmaUserId: D2, broker: "KB", accountNo: B, from: "KB120", to: undefined },
      ]),
    );
    expect(moves).toHaveLength(3);
  });

  it("매핑에서 사라진 계좌 · 새로 보인 계좌는 move 가 아니다(87 축소 · 확장 — 옮겨짐 아님)", () => {
    const t = setup();
    t.tracker.refresh();
    t.mappings.get("KB120")?.get(D1)?.delete(B);
    t.mappings.get("KB120")?.set("tracker-d3", new Set(["5234567801"]));
    expect(t.tracker.refresh()).toEqual([]);
  });

  it("지정 첫 적재 전(ready false)에는 스냅샷을 잡지 않는다 — 적재 뒤 첫 refresh 가 기준선(0)", () => {
    const t = setup();
    t.setLoaded(false);
    expect(t.tracker.refresh()).toEqual([]);
    t.chosen.set(`${D1}|KB|${A}`, "KB121");
    t.setLoaded(true);
    expect(t.tracker.refresh()).toEqual([]);
    t.chosen.delete(`${D1}|KB|${A}`);
    expect(t.tracker.refresh()).toEqual([{ dmaUserId: D1, broker: "KB", accountNo: A, from: "KB121", to: "KB120" }]);
  });

  it("snapshotOf — 지금 값(계좌마다 증권사 · 소유 서버 · 유효 서버 · 등록 서버) · 기준선을 바꾸지 않는다", () => {
    const t = setup();
    t.tracker.refresh();
    t.chosen.set(`${D1}|KB|${A}`, "KB121");
    const snap = t.tracker.snapshotOf(D1);
    expect([...snap.values()]).toEqual(
      expect.arrayContaining([
        { broker: "KB", accountNo: A, owner: "KB121", effective: "KB121", servers: ["KB120", "KB121"] },
        { broker: "KB", accountNo: B, owner: "KB120", effective: "KB120", servers: ["KB120"] },
        { broker: "KYOBO", accountNo: K, owner: "KYOBO119", effective: "KYOBO119", servers: ["KYOBO119"] },
      ]),
    );
    expect(snap.size).toBe(3);
    expect(t.tracker.snapshotOf("nobody").size).toBe(0);
    // snapshotOf 는 기준선을 건드리지 않는다 — refresh 는 여전히 A 의 move 를 낸다.
    expect(t.tracker.refresh()).toEqual([{ dmaUserId: D1, broker: "KB", accountNo: A, from: "KB120", to: "KB121" }]);
  });
});
