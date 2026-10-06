/**
 * Phase 29 Plan 03 — D-09. `ServerRegistry` 단위 테스트 (env 합성 · db 적재).
 *
 * identities.ts 규율 복제를 잠근다:
 *   - 요청 모양: `dma_servers` · 29-01 열 8개 select · `order("sort_order")`
 *   - 첫 적재 성공 → `ready()` resolve · `changed` {added: 전 키} 1회
 *   - 같은 행 재적재 → 이벤트 없음 · host 변경 → changed 1회(changed 에 그 키)
 *   - 불변식 위반(증권사당 주문 서버 2개 · 시세 주 2개) · select 실패 → 직전 값 유지 + error 로그(비밀 · 행 값 없음)
 *   - 첫 성공 전에는 ready 가 풀리지 않는다(fail closed)
 *   - 겹친 `reload()` 는 select 한 번 · `close()` 뒤 타이머 0 · 조회 없음
 *   - orderServerOf · quotePrimary · enabled 조회
 *
 * 가짜 supabase 는 `from(table).select(cols).order(col)` 체인만 흉내 내고, 결과를 큐에서 차례로 돌려준다.
 * 주소는 TEST-NET(192.0.2.x)만(D-27).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "../src/logger.js";
import { REGISTRY_REFRESH_MS, ServerRegistry, type RegistryChange } from "../src/registry/registry.js";

const REFRESH_MS = 50;

type DbRow = {
  key: string;
  broker: string;
  host: string;
  port: number;
  enabled: boolean;
  is_order_server: boolean;
  is_quote_primary: boolean;
  sort_order: number;
};
type Result = { data: DbRow[] | null; error: { code?: string; message: string; details?: string } | null };
type Call = { table: string; select: string; order: string };

type FakeDb = {
  client: SupabaseClient;
  calls: Call[];
  queue(result: Result | Promise<Result>): void;
};

function fakeDb(): FakeDb {
  const calls: Call[] = [];
  const results: Array<Result | Promise<Result>> = [];
  const client = {
    from: (table: string) => ({
      select: (select: string) => ({
        order: (order: string) => {
          calls.push({ table, select, order });
          const next = results.shift() ?? { data: [], error: null };
          return Promise.resolve(next);
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { client, calls, queue: (r) => results.push(r) };
}

const ROWS: DbRow[] = [
  { key: "KB120", broker: "KB", host: "192.0.2.120", port: 9100, enabled: true, is_order_server: true, is_quote_primary: true, sort_order: 1 },
  { key: "KB121", broker: "KB", host: "192.0.2.121", port: 9100, enabled: false, is_order_server: false, is_quote_primary: false, sort_order: 2 },
  { key: "KYOBO119", broker: "KYOBO", host: "192.0.2.119", port: 9100, enabled: true, is_order_server: true, is_quote_primary: false, sort_order: 3 },
  { key: "KYOBO127", broker: "KYOBO", host: "192.0.2.127", port: 9100, enabled: false, is_order_server: false, is_quote_primary: false, sort_order: 4 },
];

const ok = (rows: DbRow[]): Result => ({ data: rows.map((r) => ({ ...r })), error: null });

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe("ServerRegistry — db 적재 (Phase 29 D-09)", () => {
  const registries: ServerRegistry[] = [];

  function make(db: FakeDb): { reg: ServerRegistry; changes: RegistryChange[] } {
    const reg = new ServerRegistry({ source: "db", supabase: db.client, refreshMs: REFRESH_MS });
    registries.push(reg);
    const changes: RegistryChange[] = [];
    reg.on("changed", (c) => changes.push(c));
    return { reg, changes };
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  });

  afterEach(() => {
    for (const r of registries.splice(0)) r.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("주기 상수는 60초 · 요청 모양은 dma_servers · 29-01 열 8개 · sort_order 정렬", async () => {
    expect(REGISTRY_REFRESH_MS).toBe(60_000);
    const db = fakeDb();
    db.queue(ok(ROWS));
    const { reg } = make(db);
    reg.start();
    await flush();
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]?.table).toBe("dma_servers");
    expect(db.calls[0]?.select.split(",").map((c) => c.trim())).toEqual([
      "key",
      "broker",
      "host",
      "port",
      "enabled",
      "is_order_server",
      "is_quote_primary",
      "sort_order",
    ]);
    expect(db.calls[0]?.order).toBe("sort_order");
  });

  it("첫 적재 성공 → ready resolve · changed {added 4행} 1회 · 조회 메서드", async () => {
    const db = fakeDb();
    db.queue(ok(ROWS));
    const { reg, changes } = make(db);
    let ready = false;
    void reg.ready().then(() => {
      ready = true;
    });
    expect(reg.loaded).toBe(false);
    reg.start();
    await flush();
    expect(ready).toBe(true);
    expect(reg.loaded).toBe(true);
    expect(changes).toEqual([{ added: ["KB120", "KB121", "KYOBO119", "KYOBO127"], removed: [], changed: [], roles: false }]);
    expect(reg.all().map((r) => r.key)).toEqual(["KB120", "KB121", "KYOBO119", "KYOBO127"]);
    expect(reg.enabled().map((r) => r.key)).toEqual(["KB120", "KYOBO119"]);
    expect(reg.orderServerOf("KB")).toMatchObject({ key: "KB120", host: "192.0.2.120", port: 9100, isOrderServer: true });
    expect(reg.orderServerOf("KYOBO")?.key).toBe("KYOBO119");
    expect(reg.quotePrimary()?.key).toBe("KB120");
    expect(reg.get("KB121")).toMatchObject({ enabled: false, broker: "KB" });
    // 사본이다 — 바깥 수정이 레지스트리를 바꾸지 않는다.
    const row = reg.get("KB120");
    if (row) row.host = "192.0.2.99";
    expect(reg.get("KB120")?.host).toBe("192.0.2.120");
  });

  it("같은 행 재적재 → 이벤트 없음 · host 변경 → changed 1회 · enabled 전환 · 역할 이동", async () => {
    const db = fakeDb();
    db.queue(ok(ROWS));
    const { reg, changes } = make(db);
    reg.start();
    await flush();
    expect(changes).toHaveLength(1);

    db.queue(ok(ROWS));
    expect(await reg.reload()).toEqual({ ok: true, changed: false });
    expect(changes).toHaveLength(1);

    const moved = ROWS.map((r) => (r.key === "KYOBO119" ? { ...r, host: "192.0.2.200" } : r));
    db.queue(ok(moved));
    expect(await reg.reload()).toEqual({ ok: true, changed: true });
    expect(changes).toHaveLength(2);
    expect(changes[1]).toEqual({ added: [], removed: [], changed: ["KYOBO119"], roles: false });
    expect(reg.get("KYOBO119")?.host).toBe("192.0.2.200");

    // 주문 서버 KB120 → KB121 (KB121 enabled) — changed KB121 · roles true.
    const switched = moved.map((r) =>
      r.key === "KB120"
        ? { ...r, is_order_server: false }
        : r.key === "KB121"
          ? { ...r, enabled: true, is_order_server: true }
          : r,
    );
    db.queue(ok(switched));
    await reg.reload();
    expect(changes[2]).toEqual({ added: [], removed: [], changed: ["KB121"], roles: true });
    expect(reg.orderServerOf("KB")?.key).toBe("KB121");
    expect(reg.quotePrimary()?.key).toBe("KB120");

    // 행 삭제 → removed.
    db.queue(ok(switched.filter((r) => r.key !== "KYOBO127")));
    await reg.reload();
    expect(changes[3]).toEqual({ added: [], removed: ["KYOBO127"], changed: [], roles: false });
  });

  it("불변식 위반(KB 주문 서버 2행 · 시세 주 2행 · 비활성 주문 서버) → 직전 값 유지 + error 로그", async () => {
    const db = fakeDb();
    db.queue(ok(ROWS));
    const { reg, changes } = make(db);
    reg.start();
    await flush();
    const errors = vi.spyOn(logger, "error").mockImplementation((() => undefined) as never);

    const twoOrders = ROWS.map((r) => (r.key === "KB121" ? { ...r, enabled: true, is_order_server: true } : r));
    db.queue(ok(twoOrders));
    expect(await reg.reload()).toEqual({ ok: false, changed: false });
    const twoQuotes = ROWS.map((r) => (r.key === "KYOBO119" ? { ...r, is_quote_primary: true } : r));
    db.queue(ok(twoQuotes));
    expect(await reg.reload()).toEqual({ ok: false, changed: false });
    const disabledOrder = ROWS.map((r) => (r.key === "KYOBO119" ? { ...r, enabled: false } : r));
    db.queue(ok(disabledOrder));
    expect(await reg.reload()).toEqual({ ok: false, changed: false });
    const badBroker = [...ROWS, { ...ROWS[0]!, key: "NH1", broker: "NH" }];
    db.queue(ok(badBroker));
    expect(await reg.reload()).toEqual({ ok: false, changed: false });

    expect(changes).toHaveLength(1);
    expect(reg.orderServerOf("KB")?.key).toBe("KB120");
    expect(reg.enabled().map((r) => r.key)).toEqual(["KB120", "KYOBO119"]);
    expect(errors).toHaveBeenCalledTimes(4);
    const first = errors.mock.calls[0];
    expect(String(first?.[1])).toContain("직전 값 유지");
    expect(JSON.stringify(first?.[0])).toContain("주문 서버가 둘이다");
  });

  it("select 실패 → 직전 유지 · 오류 로그에 details 없음 · 다음 성공은 복구", async () => {
    const db = fakeDb();
    db.queue(ok(ROWS));
    const { reg, changes } = make(db);
    reg.start();
    await flush();
    const errors = vi.spyOn(logger, "error").mockImplementation((() => undefined) as never);
    db.queue({ data: null, error: { code: "42501", message: "permission denied", details: "Failing row contains (secret-ish)" } });
    expect(await reg.reload()).toEqual({ ok: false, changed: false });
    expect(reg.enabled()).toHaveLength(2);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(errors.mock.calls[0]?.[0])).not.toContain("Failing row");
    expect(errors.mock.calls[0]?.[0]).toMatchObject({ pgError: { code: "42501" }, attempt: 1 });
    db.queue(ok(ROWS));
    expect(await reg.reload()).toEqual({ ok: true, changed: false });
    expect(changes).toHaveLength(1);
  });

  it("첫 적재 실패 → ready 미해결(fail closed) · 다음 주기 성공에 풀린다", async () => {
    const db = fakeDb();
    db.queue({ data: null, error: { message: "network down" } });
    db.queue(ok(ROWS));
    vi.spyOn(logger, "error").mockImplementation((() => undefined) as never);
    const { reg, changes } = make(db);
    let ready = false;
    void reg.ready().then(() => {
      ready = true;
    });
    reg.start();
    await flush();
    expect(ready).toBe(false);
    expect(reg.loaded).toBe(false);
    expect(reg.enabled()).toEqual([]);
    expect(reg.orderServerOf("KB")).toBeUndefined();
    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(ready).toBe(true);
    expect(changes).toHaveLength(1);
    expect(db.calls).toHaveLength(2);
  });

  it("겹친 reload() 는 select 한 번 · 주기 틱도 진행 중이면 건너뛴다", async () => {
    const db = fakeDb();
    let release: (r: Result) => void = () => undefined;
    db.queue(new Promise<Result>((resolve) => (release = resolve)));
    const { reg } = make(db);
    reg.start();
    const a = reg.reload();
    const b = reg.reload();
    await vi.advanceTimersByTimeAsync(REFRESH_MS * 3);
    expect(db.calls).toHaveLength(1);
    release(ok(ROWS));
    expect(await a).toEqual({ ok: true, changed: true });
    expect(await b).toEqual({ ok: true, changed: true });
    expect(db.calls).toHaveLength(1);
  });

  it("close() 뒤 타이머 0 · 조회 없음 · reload 는 ok false", async () => {
    const db = fakeDb();
    db.queue(ok(ROWS));
    const { reg } = make(db);
    reg.start();
    await flush();
    reg.close();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(REFRESH_MS * 5);
    expect(db.calls).toHaveLength(1);
    expect(await reg.reload()).toEqual({ ok: false, changed: false });
    expect(db.calls).toHaveLength(1);
  });
});

describe("ServerRegistry — env 합성 (Phase 29 D-09)", () => {
  it("start() 즉시 적재 · ready resolve · changed 1회 · 타이머 없음 · reload 는 변화 없음", async () => {
    const reg = new ServerRegistry({
      source: "env",
      rows: [
        { key: "KB", broker: "KB", host: "127.0.0.1", port: 9100, enabled: true, isOrderServer: true, isQuotePrimary: true, sortOrder: 0 },
      ],
    });
    const changes: RegistryChange[] = [];
    reg.on("changed", (c) => changes.push(c));
    reg.start();
    expect(reg.loaded).toBe(true);
    await reg.ready();
    expect(changes).toEqual([{ added: ["KB"], removed: [], changed: [], roles: false }]);
    expect(reg.source).toBe("env");
    expect(reg.orderServerOf("KB")?.host).toBe("127.0.0.1");
    expect(reg.orderServerOf("KYOBO")).toBeUndefined();
    expect(await reg.reload()).toEqual({ ok: true, changed: false });
    reg.close();
  });

  it("env 행이 불변식을 어기면 start() 가 던진다", () => {
    const row = { key: "KB", broker: "KB" as const, host: "127.0.0.1", port: 9100, enabled: true, isOrderServer: true, isQuotePrimary: true, sortOrder: 0 };
    const reg = new ServerRegistry({ source: "env", rows: [row, { ...row, sortOrder: 1 }] });
    expect(() => reg.start()).toThrow(/중복/);
  });
});
