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
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ORDER_QUEUE_LIMIT,
  OrderStore,
  rowPatchOf,
  selectorOf,
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
  looked: string[];
} {
  const written: Written[] = [];
  const inserted: OrderInsertRow[] = [];
  const looked: string[] = [];
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
      findIdByOrderNo: async (orderNo) => {
        looked.push(orderNo);
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

    store.enqueueUpdate({ orderNo: "0000012345", status: "filled", filledQty: 3 });
    expect(written).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(200);

    expect(written).toHaveLength(1);
    expect(written[0]?.sel).toEqual({ column: "order_no", value: "0000012345" });
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
    expect(selectorOf({ orderNo: "0000012345" })).toEqual({
      column: "order_no",
      value: "0000012345",
    });
    // 빈 문자열은 셀렉터가 아니다 — 접수 전 거부는 order_no 가 "" 로 온다.
    expect(selectorOf({ orderRowId: "", orderNo: "" })).toBeNull();
    expect(selectorOf({})).toBeNull();
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

    expect(await store.findIdByOrderNo("0000012345")).toBe("row-9");
    // 접수 전 거부는 order_no 가 "" 다 — 그것으로 조회하면 전 테이블이 후보가 된다.
    expect(await store.findIdByOrderNo("")).toBeNull();
    expect(looked).toEqual(["0000012345"]);

    // 미결선을 `null`(=행 없음)로 열화하면 중복 insert 가 난다.
    const updateOnly = new OrderStore(recordingSink().sink);
    await expect(updateOnly.findIdByOrderNo("0000012345")).rejects.toThrow("lookup sink 미결선");
    await expect(updateOnly.insertRequest(insertRow())).rejects.toThrow("insert sink 미결선");
  });

  it("⑮ rowPatchOf 는 origin 을 dma_orders 컬럼으로 옮긴다 (camelCase 경계 유일 지점)", () => {
    expect(rowPatchOf({ orderNo: "0000012345", origin: "vi" }).origin).toBe("vi");
    // 안 실으면 컬럼을 만들지 않는다 — 기존 값을 덮지 않기 위해서다.
    expect(rowPatchOf({ orderRowId: "r", status: "filled" })).not.toHaveProperty("origin");
  });
});
