/**
 * Phase 15 Plan 16 — RELAY-02. `dma_orders` 비동기 갱신 큐 단위 테스트 (D-24 / D-32).
 *
 * 이 큐의 리스크는 SQL 이 아니라 **타이밍과 실패 처리**다. 그래서 Supabase 를 흉내 내는
 * 대신 쓰기 sink 를 주입해 ① 수신 콜백이 절대 기다리지 않는가 ② 실패가 조용히 사라지지
 * 않는가 ③ 셀렉터 없는 갱신이 테이블 전체를 덮지 않는가 를 본다.
 *
 * ③ 이 가장 중요하다 — `WHERE` 가 빠진 update 는 감사 기록 전체를 파괴한다.
 *
 * Phase 16 Plan 08 추가 (D-03) — **insert 도 이 모듈이 한다.** 큐 규율과 정반대인
 * 「`await` 로 즉시 쓰고 id 를 돌려준다」가 의도임을 ⑪~⑭ 가 고정한다. 반환 `id` 가 상관
 * 1순위 키라 큐에 넣으면 호출자가 게이트웨이로 보내기 전에 쥘 수 없다 (A10).
 *
 * Phase 16 Plan 18 추가 (gap 1) — 위 「Supabase 를 흉내 내는 대신 sink 를 주입한다」가
 * **정확히 gap 1 을 놓친 사각지대**다. 쓰기 sink 를 스텁으로 바꾸면 「어떤 `WHERE` 로
 * 나가는가」는 아무도 보지 않는다. 그래서 마지막 describe 블록 한 벌만 예외로, 가짜
 * `SupabaseClient` 를 진짜 sink 팩토리에 주입해 **적용된 필터 자체**를 단언한다. 위 규율의
 * 폐기가 아니라 예외 추가다 — 기존 케이스는 그대로 둔다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ORDER_QUEUE_LIMIT,
  OrderStore,
  kstDayRangeUtc,
  rowPatchOf,
  selectorOf,
  supabaseOrderLookupSink,
  supabaseOrderSink,
  type OrderInsertRow,
  type OrderSelector,
  type OrderRowPatch,
  type OrderSinks,
  type OrderUpdateSink,
} from "../src/store/orders.js";

type Written = { sel: OrderSelector; patch: OrderRowPatch };

/** 정상 insert 입력 — 각 케이스가 필요한 필드만 덮어쓴다. */
function insertRow(overrides: Partial<OrderInsertRow> = {}): OrderInsertRow {
  return {
    userId: "11111111-2222-4333-8444-555555555555",
    accountNo: "1234567801",
    isin: "KR7005930003",
    code: "005930",
    exchange: "KRX",
    market: "K",
    side: "B",
    orderType: "N",
    qty: 10,
    price: 70_000,
    origin: "manual",
    ...overrides,
  };
}

/** update + insert + lookup 을 전부 기록하는 sink 한 벌. */
function recordingSinks(opts: { insertFails?: boolean; existingId?: string | null } = {}): {
  sinks: OrderSinks;
  written: Written[];
  inserted: OrderInsertRow[];
  looked: { userId: string; orderNo: string }[];
} {
  const written: Written[] = [];
  const inserted: OrderInsertRow[] = [];
  const looked: { userId: string; orderNo: string }[] = [];
  return {
    written,
    inserted,
    looked,
    sinks: {
      update: async (sel, patch) => {
        written.push({ sel, patch });
        await Promise.resolve();
      },
      insert: async (row) => {
        await Promise.resolve();
        if (opts.insertFails === true) throw new Error("supabase insert down");
        inserted.push(row);
        return `id-${inserted.length}`;
      },
      findIdByOrderNo: async (userId, orderNo) => {
        looked.push({ userId, orderNo });
        await Promise.resolve();
        return opts.existingId ?? null;
      },
    },
  };
}

/** 성공하는 sink + 기록. */
function recordingSink(): { sink: OrderUpdateSink; written: Written[] } {
  const written: Written[] = [];
  const sink: OrderUpdateSink = async (sel, patch) => {
    written.push({ sel, patch });
    await Promise.resolve();
  };
  return { sink, written };
}

describe("OrderStore — 비동기 갱신 큐", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("① enqueueUpdate 는 동기다 — 반환 시점에 아직 쓰지 않았다 (D-32)", () => {
    const { sink, written } = recordingSink();
    const store = new OrderStore(sink);

    store.enqueueUpdate({ orderRowId: "row-1", status: "accepted", orderNo: "0000012345" });

    // 수신 콜백이 여기서 기다렸다면 게이트웨이 송신 큐가 차서 연결이 끊긴다.
    expect(written).toHaveLength(0);
    expect(store.stats().queued).toBe(1);
  });

  it("② flushNow 가 큐를 비우고 셀렉터로 좁힌 update 를 낸다", async () => {
    const { sink, written } = recordingSink();
    const store = new OrderStore(sink);

    store.enqueueUpdate({ orderRowId: "row-1", status: "accepted", orderNo: "0000012345" });
    await store.flushNow();

    expect(written).toHaveLength(1);
    expect(written[0]?.sel).toEqual({ column: "id", value: "row-1" });
    expect(written[0]?.patch).toMatchObject({ status: "accepted", order_no: "0000012345" });
    expect(written[0]?.patch.updated_at).toEqual(expect.any(String));
    expect(store.stats()).toMatchObject({ queued: 0, flushed: 1, dropped: 0 });
  });

  it("③ start() tick 이 주기적으로 flush 한다", async () => {
    const { sink, written } = recordingSink();
    const store = new OrderStore(sink, 200);
    store.start();
    store.start(); // 멱등 — 타이머가 두 벌 돌면 같은 항목을 두 번 쓴다

    // `userId` 가 있어야 `order_no` 셀렉터가 선다 (gap 1) — 없으면 드롭이다(⑧ 참조).
    store.enqueueUpdate({ orderNo: "0000012345", userId: "user-a", status: "filled", filledQty: 3 });
    expect(written).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(200);

    expect(written).toHaveLength(1);
    expect(written[0]?.sel).toEqual({
      column: "order_no",
      value: "0000012345",
      userId: "user-a",
    });
    store.close();
  });

  it("④ 셀렉터가 없으면 드롭한다 — WHERE 없는 update 는 테이블 전체를 덮는다", async () => {
    const { sink, written } = recordingSink();
    const store = new OrderStore(sink);

    store.enqueueUpdate({ status: "filled" });
    await store.flushNow();

    expect(written).toHaveLength(0);
    // 조용히 사라지지 않는다 — 드롭 수가 곧 감사 기록의 결손량이다 (S-5).
    expect(store.stats().dropped).toBe(1);
  });

  it("⑤ 실패는 1회 재큐잉하고, 2회째 실패면 드롭 + 카운터 (무한 재시도 금지)", async () => {
    let calls = 0;
    const sink: OrderUpdateSink = async () => {
      calls += 1;
      await Promise.resolve();
      throw new Error("supabase down");
    };
    const store = new OrderStore(sink);

    store.enqueueUpdate({ orderRowId: "row-1", status: "filled" });

    await store.flushNow();
    expect(calls).toBe(1);
    expect(store.stats()).toMatchObject({ queued: 1, retried: 1, dropped: 0 });

    await store.flushNow();
    expect(calls).toBe(2);
    expect(store.stats()).toMatchObject({ queued: 0, retried: 1, dropped: 1 });

    // 세 번째 flush 에서 다시 때리지 않는다.
    await store.flushNow();
    expect(calls).toBe(2);
  });

  it("⑥ 재시도 후 성공하면 드롭하지 않는다", async () => {
    let calls = 0;
    const written: Written[] = [];
    const sink: OrderUpdateSink = async (sel, patch) => {
      calls += 1;
      await Promise.resolve();
      if (calls === 1) throw new Error("일시 장애");
      written.push({ sel, patch });
    };
    const store = new OrderStore(sink);

    store.enqueueUpdate({ orderRowId: "row-1", status: "accepted" });
    await store.flushNow();
    await store.flushNow();

    expect(written).toHaveLength(1);
    expect(store.stats()).toMatchObject({ flushed: 1, dropped: 0 });
  });

  it("⑦ 큐 상한을 넘으면 가장 오래된 항목부터 버린다 (OOM 방지)", () => {
    const { sink } = recordingSink();
    const store = new OrderStore(sink);

    for (let i = 0; i < ORDER_QUEUE_LIMIT + 5; i += 1) {
      store.enqueueUpdate({ orderRowId: `row-${i}`, status: "accepted" });
    }

    expect(store.stats().queued).toBe(ORDER_QUEUE_LIMIT);
    expect(store.stats().dropped).toBe(5);
  });

  it("⑧ 셀렉터 우선순위는 id → order_no 다 (A10 — order_no 단독은 모호할 수 있다)", () => {
    expect(selectorOf({ orderRowId: "row-1", orderNo: "0000012345" })).toEqual({
      column: "id",
      value: "row-1",
    });
    expect(selectorOf({ orderNo: "0000012345", userId: "user-a" })).toEqual({
      column: "order_no",
      value: "0000012345",
      userId: "user-a",
    });
    // 빈 문자열은 셀렉터가 아니다 — 접수 전 거부는 order_no 가 "" 로 온다.
    expect(selectorOf({ orderRowId: "", orderNo: "" })).toBeNull();
    expect(selectorOf({})).toBeNull();
    // ★ gap 1 — `order_no` 는 일별 재사용 시퀀스다. `userId` 없는 셀렉터는 「이 행」이 아니라
    //   「이 번호를 쓴 모든 사용자의 모든 날짜」를 가리킨다. 그래서 드롭이다.
    expect(selectorOf({ orderNo: "0000012345", status: "filled" })).toBeNull();
    expect(selectorOf({ orderNo: "0000012345", userId: "" })).toBeNull();
  });

  it("⑨ rowPatchOf — 빈 값은 컬럼을 만들지 않고 filled_qty 는 음수를 0 으로 친다", () => {
    const patch = rowPatchOf({
      orderNo: "",
      noticeType: "",
      message: "",
      status: "timeout",
      resultCode: -2,
    });

    expect(patch).not.toHaveProperty("order_no");
    expect(patch).not.toHaveProperty("notice_type");
    expect(patch).not.toHaveProperty("message");
    expect(patch).toMatchObject({ status: "timeout", result_code: -2 });

    // `filled_qty >= 0` CHECK 를 위반하면 그 행의 갱신이 통째로 사라진다.
    expect(rowPatchOf({ orderRowId: "r", filledQty: -3 }).filled_qty).toBe(0);
    expect(rowPatchOf({ orderRowId: "r", filledQty: 7 }).filled_qty).toBe(7);
  });

  it("⑩ 바꿀 값이 없는 갱신은 큐에 넣지 않는다 (updated_at 만 튀는 update 방지)", () => {
    const { sink } = recordingSink();
    const store = new OrderStore(sink);

    store.enqueueUpdate({ orderRowId: "row-1" });

    expect(store.stats()).toMatchObject({ queued: 0, dropped: 0 });
  });

  it("⑪ insertRequest 는 큐를 거치지 않고 즉시 쓰고 id 를 돌려준다 (A10 — 상관 1순위 키)", async () => {
    const { sinks, inserted } = recordingSinks();
    const store = new OrderStore(sinks);

    const id = await store.insertRequest(insertRow({ origin: "limit_chaser" }));

    // 큐잉이었다면 여기서 아직 아무것도 쓰이지 않았을 것이고, id 도 없었을 것이다.
    expect(id).toBe("id-1");
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ origin: "limit_chaser", market: "K", code: "005930" });
    expect(store.stats()).toMatchObject({ queued: 0, inserted: 1 });
  });

  it("⑫ insert 실패는 throw 되고 큐에 남지 않는다 (조용한 실패 금지)", async () => {
    const { sinks, inserted } = recordingSinks({ insertFails: true });
    const store = new OrderStore(sinks);

    await expect(store.insertRequest(insertRow())).rejects.toThrow("supabase insert down");

    expect(inserted).toHaveLength(0);
    // 재시도 큐로 흘려보내지 않는다 — 호출자가 사용자에게 사유를 돌려줘야 한다.
    expect(store.stats()).toMatchObject({ queued: 0, inserted: 0, dropped: 0 });
  });

  it("⑬ insert 를 붙여도 update 는 여전히 큐잉된다 (D-32 규율 불변)", async () => {
    const { sinks, written } = recordingSinks();
    const store = new OrderStore(sinks);

    store.enqueueUpdate({ orderRowId: "row-1", status: "filled", filledQty: 3 });
    // 수신 콜백이 여기서 기다렸다면 게이트웨이 송신 큐가 찬다.
    expect(written).toHaveLength(0);
    expect(store.stats().queued).toBe(1);

    await store.flushNow();
    expect(written).toHaveLength(1);
  });

  it("⑭ findIdByOrderNo — 빈 주문번호는 조회하지 않고, 미결선 sink 는 null 이 아니라 throw 다", async () => {
    const { sinks, looked } = recordingSinks({ existingId: "row-9" });
    const store = new OrderStore(sinks);

    expect(await store.findIdByOrderNo("user-a", "0000012345")).toBe("row-9");
    // 접수 전 거부는 order_no 가 "" 다 — 그것으로 조회하면 전 테이블이 후보가 된다.
    expect(await store.findIdByOrderNo("user-a", "")).toBeNull();
    // 소유자 없는 조회도 마찬가지로 전 사용자 스캔이다 (gap 1).
    expect(await store.findIdByOrderNo("", "0000012345")).toBeNull();
    expect(looked).toEqual([{ userId: "user-a", orderNo: "0000012345" }]);

    // 미결선을 `null`(=행 없음)로 열화하면 중복 insert 가 난다.
    const updateOnly = new OrderStore(recordingSink().sink);
    await expect(updateOnly.findIdByOrderNo("user-a", "0000012345")).rejects.toThrow(
      "lookup sink 미결선",
    );
    await expect(updateOnly.insertRequest(insertRow())).rejects.toThrow("insert sink 미결선");
  });

  it("⑮ rowPatchOf 는 origin 을 dma_orders 컬럼으로 옮긴다 (camelCase 경계 유일 지점)", () => {
    expect(rowPatchOf({ orderNo: "0000012345", origin: "vi" }).origin).toBe("vi");
    // 안 실으면 컬럼을 만들지 않는다 — 기존 값을 덮지 않기 위해서다.
    expect(rowPatchOf({ orderRowId: "r", status: "filled" })).not.toHaveProperty("origin");
  });
});

// ============================================================
// Supabase 쿼리 경계 (gap 1)
// ============================================================

/** 가짜가 기록하는 필터 1건. `order`/`limit` 도 같은 배열에 남겨 순서를 볼 수 있게 한다. */
type FakeFilter = { op: "eq" | "gte" | "lt" | "order" | "limit"; column: string; value: unknown };

/** 가짜가 본 쿼리 1건. `matched` 는 필터를 **실제로 적용한** 결과다. */
type FakeQuery = {
  verb: "select" | "update";
  filters: FakeFilter[];
  patch?: OrderRowPatch;
  matched: FakeRow[];
};

type FakeRow = { id: string; user_id: string; order_no: string; created_at: string };

/**
 * `dma_orders` 3행을 든 가짜 `SupabaseClient`.
 *
 * 스텁이 아니라 **필터를 실제로 적용한다** — 「`.eq("user_id", …)` 를 불렀다」만 보면 그
 * 필터가 아무 행도 거르지 않아도 초록이 된다. 그래서 `matched` 로 「영향 받은 행」을 계산해
 * 남의 행·어제 행이 그 안에 없음을 단언한다.
 */
function fakeDmaOrders(rows: FakeRow[]): { supabase: SupabaseClient; queries: FakeQuery[] } {
  const queries: FakeQuery[] = [];

  function applyFilters(filters: FakeFilter[]): FakeRow[] {
    let out = [...rows];
    for (const f of filters) {
      if (f.op === "eq") out = out.filter((r) => (r as unknown as Record<string, unknown>)[f.column] === f.value);
      else if (f.op === "gte") out = out.filter((r) => r.created_at >= String(f.value));
      else if (f.op === "lt") out = out.filter((r) => r.created_at < String(f.value));
      else if (f.op === "order") {
        const desc = (f.value as { ascending?: boolean } | undefined)?.ascending === false;
        out = [...out].sort((a, b) =>
          desc ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at),
        );
      } else if (f.op === "limit") out = out.slice(0, Number(f.value));
    }
    return out;
  }

  function builder(query: FakeQuery): Record<string, unknown> {
    const self: Record<string, unknown> = {};
    const push = (op: FakeFilter["op"]) => (column: string, value: unknown) => {
      query.filters.push({ op, column, value });
      return self;
    };
    self.eq = push("eq");
    self.gte = push("gte");
    self.lt = push("lt");
    self.order = push("order");
    self.limit = (n: number) => {
      query.filters.push({ op: "limit", column: "", value: n });
      return self;
    };
    // Supabase 빌더는 thenable 이다 — `await` 시점에 필터를 적용해 결과를 만든다.
    self.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      query.matched = applyFilters(query.filters);
      const result =
        query.verb === "select"
          ? { data: query.matched.map((r) => ({ id: r.id })), error: null }
          : { data: null, error: null };
      return Promise.resolve(result).then(resolve, reject);
    };
    return self;
  }

  const supabase = {
    from: (table: string) => {
      if (table !== "dma_orders") throw new Error(`예상 밖 테이블: ${table}`);
      return {
        select: (_cols: string) => {
          const q: FakeQuery = { verb: "select", filters: [], matched: [] };
          queries.push(q);
          return builder(q);
        },
        update: (patch: OrderRowPatch) => {
          const q: FakeQuery = { verb: "update", filters: [], patch, matched: [] };
          queries.push(q);
          return builder(q);
        },
      };
    },
  } as unknown as SupabaseClient;

  return { supabase, queries };
}

const ORDER_NO = "0000012345";
const USER_A = "11111111-2222-4333-8444-55555555555a";
const USER_B = "11111111-2222-4333-8444-55555555555b";

/** 오늘(KST) 안 / 어제 시각을 지금 기준으로 만든다 — 자정 경계에서도 흔들리지 않는다. */
function fixtureRows(): FakeRow[] {
  const { from } = kstDayRangeUtc();
  const todayIso = new Date(new Date(from).getTime() + 3600_000).toISOString();
  const yesterdayIso = new Date(new Date(from).getTime() - 3600_000).toISOString();
  return [
    { id: "row-b-today", user_id: USER_B, order_no: ORDER_NO, created_at: todayIso },
    { id: "row-a-yesterday", user_id: USER_A, order_no: ORDER_NO, created_at: yesterdayIso },
    { id: "row-a-today", user_id: USER_A, order_no: ORDER_NO, created_at: todayIso },
  ];
}

describe("Supabase 쿼리 경계 (gap 1)", () => {
  it("⓵ 조회는 내 오늘 행만 찾는다 — 남의 오늘 행도, 내 어제 행도 아니다", async () => {
    const { supabase, queries } = fakeDmaOrders(fixtureRows());

    const id = await supabaseOrderLookupSink(supabase)(USER_A, ORDER_NO);

    // 어제 행(row-a-yesterday)이 매치되면 오늘 자동주문의 insert 가 일어나지 않는다 —
    // 그것이 16-08 이 막겠다고 선언한 감사 기록 결손(Pitfall 18)이다.
    expect(id).toBe("row-a-today");
    expect(queries).toHaveLength(1);
    expect(queries[0]?.matched.map((r) => r.id)).toEqual(["row-a-today"]);
  });

  it("⓶ 조회 필터에 user_id eq 와 created_at 의 gte·lt 가 모두 있다", async () => {
    const { supabase, queries } = fakeDmaOrders(fixtureRows());

    await supabaseOrderLookupSink(supabase)(USER_A, ORDER_NO);

    const filters = queries[0]?.filters ?? [];
    expect(filters).toContainEqual(expect.objectContaining({ op: "eq", column: "user_id", value: USER_A }));
    expect(filters).toContainEqual(expect.objectContaining({ op: "eq", column: "order_no", value: ORDER_NO }));
    expect(filters).toContainEqual(expect.objectContaining({ op: "gte", column: "created_at" }));
    expect(filters).toContainEqual(expect.objectContaining({ op: "lt", column: "created_at" }));
  });

  it("⓷ order_no update 는 남의 행·어제 행에 닿지 않는다 (T-16-14 테넌트 경계)", async () => {
    const { supabase, queries } = fakeDmaOrders(fixtureRows());

    await supabaseOrderSink(supabase)(
      { column: "order_no", value: ORDER_NO, userId: USER_A },
      { status: "filled", updated_at: new Date().toISOString() },
    );

    const q = queries[0];
    expect(q?.verb).toBe("update");
    expect(q?.filters).toContainEqual(expect.objectContaining({ op: "eq", column: "user_id", value: USER_A }));
    expect(q?.filters).toContainEqual(expect.objectContaining({ op: "gte", column: "created_at" }));
    expect(q?.filters).toContainEqual(expect.objectContaining({ op: "lt", column: "created_at" }));
    // ★ 영향 받은 행 = 내 오늘 행 하나뿐이다. 셀렉터 한 축이던 시절엔 3행 전부였다.
    expect(q?.matched.map((r) => r.id)).toEqual(["row-a-today"]);
  });

  it("⓸ id 셀렉터는 한 축으로 충분하다 — PK 라 사용자·날짜를 덧붙이지 않는다", async () => {
    const { supabase, queries } = fakeDmaOrders(fixtureRows());

    await supabaseOrderSink(supabase)({ column: "id", value: "row-a-today" }, { status: "filled" });

    expect(queries[0]?.filters).toEqual([
      { op: "eq", column: "id", value: "row-a-today" },
    ]);
  });

  it("⓹ userId 없는 order_no 갱신은 셀렉터가 서지 않는다 — 쿼리 자체가 나가지 않는다", async () => {
    expect(selectorOf({ orderNo: ORDER_NO, status: "filled" })).toBeNull();

    const { supabase, queries } = fakeDmaOrders(fixtureRows());
    const store = new OrderStore(supabaseOrderSink(supabase));
    store.enqueueUpdate({ orderNo: ORDER_NO, status: "filled" });
    await store.flushNow();

    // 큐에 실리지 않았으므로 Supabase 로 나간 쿼리가 0건이다 (S-5 — 드롭은 카운터로 드러난다).
    expect(queries).toHaveLength(0);
    expect(store.stats().dropped).toBe(1);
  });

  it("⓺ kstDayRangeUtc 는 서버 정본과 같은 반열린 24시간 구간이다", () => {
    const { from, to } = kstDayRangeUtc(new Date("2026-09-09T23:30:00Z"));

    // 2026-09-09 23:30 UTC = 2026-09-10 08:30 KST → 그 날의 00:00 KST 부터다.
    expect(from).toBe(new Date("2026-09-10T00:00:00+09:00").toISOString());
    expect(new Date(to).getTime() - new Date(from).getTime()).toBe(24 * 3600_000);
  });
});
