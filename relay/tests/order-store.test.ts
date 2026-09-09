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

import { logger } from "../src/logger.js";
import {
  ORDER_QUEUE_LIMIT,
  OrderStore,
  kstDayRangeUtc,
  rowPatchOf,
  selectorOf,
  supabaseOrderInsertSink,
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
        // `created: true` — 이 가짜는 언제나 새 행을 만든다. 수렴(`created: false`) 경로는
        // 진짜 sink + 가짜 `SupabaseClient` 로 ⓻-b 가 본다 (16-40).
        return { id: `id-${inserted.length}`, created: true };
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

  /*
    ⑤ 는 **tick 경로**로 본다 (16-24). 재큐잉을 「같은 순회에서 다시 때리지 않는다」는
    규율의 무대가 인터벌 tick 이기 때문이다 — 종료 경로(`flushNow`)는 반대로 재큐잉분까지
    한 번에 비운다(⑮ 참조). 두 경로의 계약이 다르다는 사실 자체를 여기서 고정한다.
  */
  it("⑤ tick 은 실패를 1회 재큐잉하고 **다음 tick** 에서 드롭한다 (무한 재시도 금지)", async () => {
    let calls = 0;
    const sink: OrderUpdateSink = async () => {
      calls += 1;
      await Promise.resolve();
      throw new Error("supabase down");
    };
    const store = new OrderStore(sink, 200);
    store.start();

    store.enqueueUpdate({ orderRowId: "row-1", status: "filled" });

    await vi.advanceTimersByTimeAsync(200);
    expect(calls).toBe(1);
    expect(store.stats()).toMatchObject({ queued: 1, retried: 1, dropped: 0 });

    await vi.advanceTimersByTimeAsync(200);
    expect(calls).toBe(2);
    expect(store.stats()).toMatchObject({ queued: 0, retried: 1, dropped: 1 });

    // 세 번째 tick 에서 다시 때리지 않는다.
    await vi.advanceTimersByTimeAsync(200);
    expect(calls).toBe(2);
    store.close();
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
    // ★ 16-24 이후 재시도는 **같은 `flushNow()` 안에서** 끝난다 (WR-09 — 재큐잉분까지 비운다).
    expect(calls).toBe(2);
    await store.flushNow(); // 두 번째 호출은 무동작이다.

    expect(written).toHaveLength(1);
    expect(calls).toBe(2);
    expect(store.stats()).toMatchObject({ flushed: 1, dropped: 0, queued: 0 });
  });

  /*
    ⑮~⑰ — 종료 경로의 계약 (16-24 / WR-09).

    옛 `flushNow` 는 `if (this.#flushing) return;` 이라 200ms tick 이 도는 중에 SIGTERM 이
    오면 **아무것도 기다리지 않고** 반환했다. 그 뒤 `close()` 가 인터벌을 끊으므로, 진행 중
    배치 이후에 큐에 들어간 마지막 체결 통보는 그대로 사라졌다. 여기 셋이 그 경로를 잠근다.
  */
  it("⑮ 인터벌 플러시가 진행 중이면 flushNow 는 **기다렸다가** 남은 큐까지 비운다", async () => {
    const written: Written[] = [];
    let release: (() => void) | null = null;
    const sink: OrderUpdateSink = async (sel, patch) => {
      // 첫 항목만 붙잡아 둔다 — 그 사이가 곧 SIGTERM 이 끼어드는 창이다.
      if (written.length === 0 && release === null) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      written.push({ sel, patch });
    };
    const store = new OrderStore(sink, 200);
    store.start();

    store.enqueueUpdate({ orderRowId: "row-1", status: "accepted" });
    await vi.advanceTimersByTimeAsync(200); // tick 이 배치를 시작하고 sink 에서 멈춘다
    expect(written).toHaveLength(0);

    // 진행 중 배치 **이후**에 도착한 마지막 통보 — 옛 구현이 잃어버리던 바로 그 항목이다.
    store.enqueueUpdate({ orderRowId: "row-2", status: "filled", filledQty: 7 });

    const shutdown = store.flushNow();
    let settled = false;
    void shutdown.then(() => {
      settled = true;
    });

    // 아직 진행 중이므로 **반환하지 않았다**(옛 구현은 여기서 이미 끝나 있었다).
    await Promise.resolve();
    expect(settled).toBe(false);

    (release as unknown as () => void)();
    await shutdown;

    expect(written.map((w) => w.sel)).toEqual([
      { column: "id", value: "row-1" },
      { column: "id", value: "row-2" },
    ]);
    expect(store.stats()).toMatchObject({ queued: 0, flushed: 2, dropped: 0 });
    store.close();
  });

  it("⑮-b flushNow 는 라운드마다 #current 를 재확인한다 — 남의 배치를 덮어쓰지 않는다 (16-40 / R2-WR-04)", async () => {
    /*
      잠그는 것: **「도는 배치는 언제나 1개」**. 종전 `flushNow` 는 진행 중 배치 대기를 루프
      **밖**에 한 번만 두고, 루프 안에서는 `this.#current = this.#runDrain()` 을 확인 없이
      대입했다. 라운드 끝의 `await` 이 풀린 뒤 대입까지 마이크로태스크 경계가 있고, 이 시점은
      아직 `close()` 전이라 200ms `#tick` 이 살아 있다 — 그 경계에서 tick 이 자기 배치를
      시작하면 우리가 그 핸들을 덮어쓰고 배치를 하나 더 띄운다.

      **관측 대상은 항목 중복이 아니라 동시에 도는 배치 수(`maxLive`)다.** 같은 항목이 두 번
      쓰이지 않은 것은 `#drain` 이 진입 즉시 큐를 스왑하기 때문이고(2선 방어), 그래서 이
      결함이 오래 보이지 않았다.

      재현 3단계 — 순서가 곧 이 케이스의 내용이다:
        P1  tick 이 `row-a` 배치를 시작하고 sink 에서 멈춘다.
        P2  SIGTERM. `flushNow` 가 진행 중 배치를 기다린다. **틱을 때리지 않고** 마이크로태스크만
            돌려 `flushNow` 를 라운드 루프 안으로 들여보낸다(round 0 = `row-b`).
        P3  이제 마이크로태스크 경계마다 틱을 때린다. round 0 이 끝나 `#current` 가 `null` 인
            순간을 tick 이 낚아채 `row-c` 배치를 시작하고, 그 sink 가 `row-d` 를 큐에 넣는다
            (종료 중 유입 — DMA 수신 콜백은 플러시를 기다리지 않는다, D-32/16-24).
            여기서 `flushNow` 의 round 1 이 재확인 없이 대입하면 **배치가 둘** 이 된다.

      실측: 이 케이스는 수정 전 구현에서 `maxLive === 2` 로 실패한다(회귀 잠금 실증 C).
    */
    const gates: (() => void)[] = [];
    const seen: string[] = [];
    /** 「이 항목의 sink 가 도는 동안 새로 들어오는 갱신」 — 종료 중 유입 사슬이다. */
    const NEXT: Record<string, string | undefined> = { "row-b": "row-c", "row-c": "row-d" };
    let live = 0;
    let maxLive = 0;
    let store: OrderStore | undefined;

    const sink: OrderUpdateSink = async (sel) => {
      live += 1;
      maxLive = Math.max(maxLive, live);
      seen.push(String(sel.value));
      const next = NEXT[String(sel.value)];
      if (next !== undefined) {
        store?.enqueueUpdate({ orderRowId: next, status: "filled", filledQty: 1 });
      }
      await new Promise<void>((resolve) => {
        gates.push(resolve);
      });
      live -= 1;
    };

    store = new OrderStore(sink, 200);
    store.start();

    // P1 — tick 이 배치를 시작하고 sink 에서 멈춘다.
    store.enqueueUpdate({ orderRowId: "row-a", status: "accepted" });
    await vi.advanceTimersByTimeAsync(200);
    expect(live).toBe(1);

    // P2 — SIGTERM. `close()` 는 아직이다(종료 절차 순서: `flushNow()` → `close()`).
    const shutdown = store.flushNow();
    store.enqueueUpdate({ orderRowId: "row-b", status: "accepted" });

    // 틱을 때리지 않고 마이크로태스크만 돌린다 — `flushNow` 가 라운드 루프에 진입한다.
    for (const g of gates) g();
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    expect(seen).toEqual(["row-a", "row-b"]);

    // P3 — 이제 경계마다 틱을 때린다. 창이 열리는 hop 은 구현 세부라 전부 때린다.
    for (let i = 0; i < 30; i += 1) {
      for (const g of gates) g();
      await Promise.resolve();
      vi.advanceTimersByTime(200);
    }
    for (const g of gates) g();
    await shutdown;

    // ★ 이 한 줄이 불변식이다. 수정 전에는 **2** 다.
    expect(maxLive).toBe(1);
    // 계약은 그대로 — 종료 중 유입분까지 비운다 (16-24 / T-16-40).
    expect(seen).toEqual(["row-a", "row-b", "row-c", "row-d"]);
    expect(store.stats()).toMatchObject({ queued: 0, flushed: 4, dropped: 0 });
    store.close();
  });

  it("⑯ 배치 중 실패로 재큐잉된 항목도 **같은 flushNow 안에서** 다시 시도된다", async () => {
    let calls = 0;
    const written: Written[] = [];
    const sink: OrderUpdateSink = async (sel, patch) => {
      calls += 1;
      await Promise.resolve();
      if (calls === 1) throw new Error("일시 장애");
      written.push({ sel, patch });
    };
    const store = new OrderStore(sink);

    store.enqueueUpdate({ orderRowId: "row-1", status: "filled", filledQty: 3 });
    await store.flushNow();

    // 「비웠다」가 참이어야 한다 — 재큐잉분을 남긴 채 반환하면 close() 가 그것을 버린다.
    expect(calls).toBe(2);
    expect(written).toHaveLength(1);
    expect(store.stats()).toMatchObject({ queued: 0, flushed: 1, retried: 1, dropped: 0 });
  });

  it("⑰ 계속 실패해도 flushNow 는 반복 상한에서 반환한다 (종료를 영원히 막지 않는다)", async () => {
    const sink: OrderUpdateSink = async () => {
      await Promise.resolve();
      throw new Error("supabase down");
    };
    const store = new OrderStore(sink);

    store.enqueueUpdate({ orderRowId: "row-1", status: "filled" });

    // 무한 대기가 아니다 — 재시도를 소진하면 드롭하고 반환한다.
    await store.flushNow();

    expect(store.stats().dropped).toBeGreaterThan(0);
    expect(store.stats().queued).toBe(0);
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
  verb: "select" | "update" | "insert";
  filters: FakeFilter[];
  patch?: OrderRowPatch;
  /** insert 가 실어 보낸 컬럼 값. 부분 UNIQUE 흉내가 여기서 `user_id`/`order_no` 를 읽는다. */
  values?: Record<string, unknown>;
  matched: FakeRow[];
};

/**
 * 가짜 테이블의 행 1건.
 *
 * 고정 4컬럼 외에 **성공한 update 가 병합한 나머지 컬럼**(`status`·`filled_qty` 등)이 그대로
 * 남는다 — 「갱신이 실제로 행에 반영됐는가」를 이 객체로 볼 수 있어야 한다 (16-39 / R2-IN-04).
 */
type FakeRow = {
  id: string;
  user_id: string;
  order_no: string;
  created_at: string;
  [column: string]: unknown;
};

/**
 * 주입할 PostgREST 오류 1건.
 *
 * **`details` 를 실을 수 있는 것이 핵심이다** (16-38 / R2-CR-03). 실제 PostgreSQL 은 CHECK·
 * NOT NULL·FK 위반의 `DETAIL` 에 `Failing row contains (<모든 컬럼 값>)` 을 넣고 PostgREST 가
 * 그것을 `error.details` 로 넘긴다 — 그 필드가 없는 스텁으로는 이 갭을 **재현조차 할 수 없다**.
 */
type FakePgError = { code?: string; message: string; details?: string; hint?: string };

/**
 * `dma_orders` 3행을 든 가짜 `SupabaseClient`.
 *
 * 스텁이 아니라 **필터를 실제로 적용한다** — 「`.eq("user_id", …)` 를 불렀다」만 보면 그
 * 필터가 아무 행도 거르지 않아도 초록이 된다. 그래서 `matched` 로 「영향 받은 행」을 계산해
 * 남의 행·어제 행이 그 안에 없음을 단언한다.
 */
function fakeDmaOrders(
  rows: FakeRow[],
  opts: {
    insertError?: FakePgError;
    /**
     * update 오류 주입. **함수형은 몇 번째 update 인가로 갈라 준다** — `23505` 재시도(짝수
     * 번째)만 실패시키는 케이스가 필요하기 때문이다 (16-39). `undefined` 를 돌려주면 주입하지
     * 않고 아래 `dupToday` 의 **실계산**으로 떨어진다.
     */
    updateError?: FakePgError | ((nth: number, patch?: OrderRowPatch) => FakePgError | undefined);
    selectError?: FakePgError;
  } = {},
): { supabase: SupabaseClient; queries: FakeQuery[]; rows: FakeRow[] } {
  const queries: FakeQuery[] = [];
  /** update 호출 순번 — 주입 함수가 「최초 시도」와 「재시도」를 가르는 근거다. */
  let updateCalls = 0;

  /**
   * `idx_dma_orders_user_order_no_kst_day` 흉내 — `(user_id, order_no, KST일)` 3축.
   *
   * 스텁이 아니라 **실제로 충돌 여부를 계산한다**. 「23505 를 던지도록 설정했다」로 만들면
   * 픽스처에 중복이 없어도 초록이 되어, 정작 「같은 3축일 때만 충돌한다」가 검증되지 않는다.
   */
  function dupToday(userId: unknown, orderNo: unknown): FakeRow | undefined {
    if (typeof orderNo !== "string" || orderNo === "") return undefined; // 부분 인덱스 대상 밖
    const { from, to } = kstDayRangeUtc();
    return rows.find(
      (r) => r.user_id === userId && r.order_no === orderNo && r.created_at >= from && r.created_at < to,
    );
  }

  const uniqueViolation = {
    code: "23505",
    message: 'duplicate key value violates unique constraint "idx_dma_orders_user_order_no_kst_day"',
  };

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
      // 강제 오류 주입 — 「제약 위반을 실제로 계산」하는 `dupToday` 와 달리, 여기서는
      // `details` 를 담은 오류를 **의도적으로** 흘려보내 로깅 경로를 시험한다 (16-38).
      let forced: FakePgError | undefined;
      if (query.verb === "update") {
        updateCalls += 1;
        forced =
          typeof opts.updateError === "function"
            ? opts.updateError(updateCalls, query.patch)
            : opts.updateError;
      } else if (query.verb === "select") {
        forced = opts.selectError;
      }
      if (forced !== undefined) return Promise.resolve({ data: null, error: forced }).then(resolve, reject);
      // 갱신이 `order_no` 를 **채우는** 경우에만 인덱스에 걸릴 수 있다. 그 값을 이미 가진
      // 다른 행(같은 사용자·오늘)이 있으면 실제 DB 처럼 23505 로 거부한다.
      if (query.verb === "update" && query.patch?.order_no !== undefined) {
        const owner = query.matched[0]?.user_id ?? query.filters.find((f) => f.column === "user_id")?.value;
        const clash = dupToday(owner, query.patch.order_no);
        if (clash !== undefined && !query.matched.some((r) => r.id === clash.id)) {
          return Promise.resolve({ data: null, error: uniqueViolation }).then(resolve, reject);
        }
      }
      // ★ 성공한 update 는 **행을 실제로 갱신한다** (16-39 / R2-IN-04). 예전 스텁은
      //   `{ data: null, error: null }` 만 돌려줘 「갱신이 반영됐는가」를 이 파일이 볼 수
      //   없었고, 그래서 패치가 통째로 사라지는 결함이 초록불 아래 숨어 있었다.
      //   `matched` 는 `rows` 의 **같은 객체 참조**라 여기서 병합하면 `rows` 에도 남는다.
      if (query.verb === "update" && query.patch !== undefined) {
        for (const row of query.matched) Object.assign(row, query.patch);
      }
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
        insert: (values: Record<string, unknown>) => {
          const q: FakeQuery = { verb: "insert", filters: [], values, matched: [] };
          queries.push(q);
          const ins: Record<string, unknown> = {};
          ins.select = () => ins;
          ins.single = () => {
            if (opts.insertError !== undefined) {
              return Promise.resolve({ data: null, error: opts.insertError });
            }
            const clash = dupToday(values.user_id, values.order_no);
            if (clash !== undefined) {
              q.matched = [clash];
              return Promise.resolve({ data: null, error: uniqueViolation });
            }
            const created: FakeRow = {
              id: `row-new-${String(rows.length)}`,
              user_id: String(values.user_id),
              order_no: typeof values.order_no === "string" ? values.order_no : "",
              created_at: new Date().toISOString(),
            };
            rows.push(created);
            q.matched = [created];
            return Promise.resolve({ data: { id: created.id }, error: null });
          };
          return ins;
        },
      };
    },
  } as unknown as SupabaseClient;

  return { supabase, queries, rows };
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


// ============================================================
// 부분 UNIQUE 인덱스 위반(`23505`) 해석 (16-28 / GC-WR-08)
// ============================================================

/**
 * 16-18 의 `idx_dma_orders_user_order_no_kst_day` 는 「같은 주문이 두 벌 남는」 경주를 막았다.
 * 그런데 그 위반을 아무도 읽지 않으면 경주 결과가 「두 벌」에서 **「소실」**로 바뀔 뿐이다 —
 * `ensureRow` 는 insert 예외를 통째로 `{kind:"unavailable"}` 로 접고 그 통보를 드롭한다.
 *
 * 여기서 잠그는 것은 셋이다: ① `23505` 는 기존 행으로 **수렴**한다 ② 다른 코드는 **여전히
 * throw** 된다(예외 삼키기를 넓히지 않았다) ③ `order_no` 를 채우는 갱신의 `23505` 는
 * 드롭 카운터를 오염시키지 않는다.
 */
describe("23505 수렴 (GC-WR-08)", () => {
  // ★ 케이스마다 spy 를 되돌린다 — `vi.spyOn` 은 이미 감싼 메서드에 **같은 spy 를 돌려주므로**
  //   복원하지 않으면 `mock.calls` 가 케이스를 넘어 누적된다 (16-38 에서 실제로 드러난 함정).
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("⓻ insert 가 23505 를 받으면 새 행을 만들지 않고 기존 행 id 로 수렴한다", async () => {
    const { supabase, queries, rows } = fakeDmaOrders(fixtureRows());
    const before = rows.length;

    // USER_A 의 오늘 ORDER_NO 행(`row-a-today`)이 이미 있다 = 경주에서 진 쪽의 insert 다.
    const result = await supabaseOrderInsertSink(supabase)(
      insertRow({ userId: USER_A, orderNo: ORDER_NO, origin: "vi" }),
    );

    // 「기록 불가」로 열화되지 않는다 — 그 통보는 이 행에 귀속된다.
    expect(result.id).toBe("row-a-today");
    // ★ **행을 만들지 않았다**를 sink 가 말한다 (16-40 / R2-WR-07①). 예전에는 id 만 돌려줘
    //   호출자가 「만들었다」와 「이미 있었다」를 구분할 수 없었다.
    expect(result.created).toBe(false);
    // 두 벌이 되지도 않는다. 가짜 테이블의 행 수가 그대로다.
    expect(rows).toHaveLength(before);
    // insert 1회 + 수렴 재조회 1회. 재조회는 같은 3축이다(남의 행·어제 행이 아니다).
    expect(queries.map((q) => q.verb)).toEqual(["insert", "select"]);
    const lookup = queries[1]?.filters ?? [];
    expect(lookup).toContainEqual(expect.objectContaining({ op: "eq", column: "user_id", value: USER_A }));
    expect(lookup).toContainEqual(expect.objectContaining({ op: "eq", column: "order_no", value: ORDER_NO }));
    expect(queries[1]?.matched.map((r) => r.id)).toEqual(["row-a-today"]);
  });

  it("⓻-b 수렴은 inserted 를 올리지 않는다 — 「새로 만든 행 누적 건수」가 참말이다 (16-40 / R2-WR-07①)", async () => {
    const { supabase, rows } = fakeDmaOrders(fixtureRows());
    const before = rows.length;
    // 진짜 sink 세 벌을 그대로 결선한다 — 「sink 가 created 를 말하고 store 가 그것을 센다」의
    // 사슬 전체를 봐야 이 갭이 잠긴다. 가짜 sink 로는 sink 쪽 판정을 시험할 수 없다.
    const store = new OrderStore({
      update: supabaseOrderSink(supabase),
      insert: supabaseOrderInsertSink(supabase),
      findIdByOrderNo: supabaseOrderLookupSink(supabase),
    });

    // ① 진짜로 행을 만드는 insert — USER_A 의 오늘에 아직 없는 주문번호다.
    const fresh = await store.insertRequest(insertRow({ userId: USER_A, orderNo: "0000099999" }));
    expect(rows).toHaveLength(before + 1);
    expect(fresh).toBe(rows[rows.length - 1]?.id);
    expect(store.stats()).toMatchObject({ inserted: 1, insertConverged: 0 });

    // ② 이미 있는 행으로 수렴하는 insert — 테이블의 행 수는 **늘지 않는다**.
    const converged = await store.insertRequest(insertRow({ userId: USER_A, orderNo: ORDER_NO }));
    expect(converged).toBe("row-a-today");
    expect(rows).toHaveLength(before + 1);

    // ★ 여기가 이 케이스의 전부다. 예전에는 `inserted: 2` 였다 — 만든 행은 하나뿐인데.
    //   부풀린 감사 지표는 결손을 보이지 않게 만든다 (S-5 / T-16-81).
    expect(store.stats()).toMatchObject({ inserted: 1, insertConverged: 1 });
    // 공개 반환 타입은 `string` 그대로다 — 호출자(`order-handler.ts`)가 바뀌지 않았다.
    expect(typeof converged).toBe("string");
  });

  it("⓻-c 23505 후 재조회가 실패하면 올라가는 것은 23505 다 (16-40 / R2-WR-07②)", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const LEAKED_ACCOUNT = "9876543210";
    const { supabase, queries } = fakeDmaOrders(fixtureRows(), {
      // 재조회(select)만 실패시킨다 — insert 는 `dupToday` 가 **실제로 계산한** 23505 다.
      selectError: {
        code: "57014",
        message: "canceling statement due to statement timeout",
        details: `Failing row contains (a1b2, ${LEAKED_ACCOUNT}, KR7005930003, 0, 70000, …).`,
        hint: "계좌 담당자에게 문의하십시오",
      },
    });

    // ★ 여기가 전부다. 예전에는 `57014`(조회 오류)가 올라갔고, `ensureRow` 가 그것을
    //   `{kind:"unavailable"}` 로 접어 자동주문 통보를 **드롭**했다 — 「이미 있다」가
    //   「기록 불가」로 열화되는 경로가 재조회 실패라는 뒷문으로 살아 있었다.
    await expect(
      supabaseOrderInsertSink(supabase)(insertRow({ userId: USER_A, orderNo: ORDER_NO })),
    ).rejects.toMatchObject({ code: "23505" });

    // insert 1회 + 재조회 1회. 재조회 실패를 재시도로 두드리지 않는다.
    expect(queries.map((q) => q.verb)).toEqual(["insert", "select"]);

    // 삼킨 사실이 로그에 남는다 (S-5) — 그리고 그 로그는 `safePgError` 를 지난다 (16-38 회귀 게이트).
    const dumped = JSON.stringify(errorSpy.mock.calls.map((c) => c[0]));
    expect(dumped).toContain("57014");
    expect(dumped).not.toContain(LEAKED_ACCOUNT);
    expect(dumped).not.toContain("Failing row");
    expect(dumped).not.toContain("문의하십시오");
  });

  it("⓼ 23505 가 아닌 에러는 여전히 throw 된다 — 예외 삼키기를 넓히지 않았다", async () => {
    const { supabase, queries } = fakeDmaOrders(fixtureRows(), {
      insertError: { code: "23514", message: "check constraint 위반" },
    });

    await expect(
      supabaseOrderInsertSink(supabase)(insertRow({ userId: USER_A, orderNo: ORDER_NO })),
    ).rejects.toMatchObject({ code: "23514" });

    // 재조회로 새지 않는다 — 「이미 있다」가 아닌 실패를 행 하나로 덮으면 안 된다.
    expect(queries.map((q) => q.verb)).toEqual(["insert"]);
  });

  /** 수동 주문이 만든 자기 행 — 아직 주문번호가 없고 수명주기도 시작 전이다(`finish` 직전). */
  function manualRow(): FakeRow {
    const { from } = kstDayRangeUtc();
    return {
      id: "row-manual",
      user_id: USER_A,
      order_no: "",
      created_at: new Date(new Date(from).getTime() + 3600_000).toISOString(),
      status: "requested",
      filled_qty: 0,
    };
  }

  it("⓽ order_no 갱신의 23505 는 주문번호만 포기하고 나머지는 반영한다 (16-39 / R2-WR-01)", async () => {
    const { supabase, queries, rows } = fakeDmaOrders([...fixtureRows(), manualRow()]);

    const store = new OrderStore(supabaseOrderSink(supabase));
    // `finish` 의 실제 모양이다 — 셀렉터는 상관 1순위 키(`id`)이고 `order_no` 는 채울 컬럼이며,
    // 수명주기 필드(`status`·`filled_qty`)가 **같은 덩어리**에 실려 온다.
    store.enqueueUpdate({ orderRowId: "row-manual", orderNo: ORDER_NO, status: "accepted", filledQty: 7 });
    await store.flushNow();

    // ★ 이 세 줄이 R2-WR-01 이다. 예전에는 패치가 통째로 버려져 이 행이 `requested`·0 인 채
    //   **영구히** 남았다 — 16-28 이 인정한 대가는 「주문번호를 못 채운다」였지 「자기 행의
    //   수명주기가 갱신되지 않는다」가 아니었다. 포기하는 것은 충돌한 컬럼 하나뿐이다.
    const row = rows.find((r) => r.id === "row-manual");
    expect(row?.status).toBe("accepted");
    expect(row?.filled_qty).toBe(7);
    expect(row?.order_no).toBe(""); // 포기한 컬럼 — 여전히 비어 있다

    // ★ 「반영된 누적 건수」가 이제 참말이다 (S-5 / R2-IN-04). 재시도가 성공했으므로 sink 가
    //   정상 반환하고 `#drain` 이 세는 1건은 실제로 행에 남았다. 카운터 코드는 한 줄도
    //   바뀌지 않았다 — **카운터가 참이 되게 동작을 고쳤다.**
    expect(store.stats().flushed).toBe(1);
    // 16-28 의 규율은 그대로다 — 23505 는 큐 재시도를 태우지 않고 드롭 카운터도 오염시키지 않는다.
    expect(store.stats().dropped).toBe(0);
    expect(store.stats().retried).toBe(0);
    expect(store.stats().queued).toBe(0);

    // update 2건 = 최초(23505) + `order_no` 를 뺀 재시도. 기존의 `toHaveLength(1)` 단언은
    // 「패치를 통째로 버린다」는 손실을 **진실로 잠그고 있었으므로** 고쳤다 (R2-IN-04).
    expect(queries.map((q) => q.verb)).toEqual(["update", "update"]);
    expect(queries[0]?.patch?.order_no).toBe(ORDER_NO);
    expect(queries[0]?.matched.map((r) => r.id)).toEqual(["row-manual"]);
    expect(queries[1]?.patch?.order_no).toBeUndefined();
    expect(queries[1]?.patch?.status).toBe("accepted");
    // 재시도가 셀렉터를 다시 조립하지 않는다 — 같은 축으로 나간다 (T-16-14).
    expect(queries[1]?.filters).toEqual([{ op: "eq", column: "id", value: "row-manual" }]);
    expect(queries[1]?.matched.map((r) => r.id)).toEqual(["row-manual"]);
  });

  it("⓽-b order_no 만 담긴 갱신의 23505 는 재시도하지 않는다 — 보낼 것이 없다", async () => {
    const { supabase, queries, rows } = fakeDmaOrders([...fixtureRows(), manualRow()]);

    const store = new OrderStore(supabaseOrderSink(supabase));
    // 주문번호만 채우려던 갱신. `rowPatchOf` 가 언제나 싣는 `updated_at` 덕에 patch 키가 2개라
    // **큐에는 들어간다**(`enqueueUpdate` 의 「갱신할 필드가 없다」 판정에 걸리지 않는다) —
    // 그래서 sink 를 직접 부르지 않고 실제 경로 그대로 재현할 수 있다.
    store.enqueueUpdate({ orderRowId: "row-manual", orderNo: ORDER_NO });
    await store.flushNow();

    // `order_no` 를 빼면 남는 것이 `updated_at` 뿐이다 = 두 번째 왕복이 무의미하다.
    expect(queries).toHaveLength(1);
    expect(rows.find((r) => r.id === "row-manual")?.order_no).toBe("");
    expect(store.stats().dropped).toBe(0);
    expect(store.stats().retried).toBe(0);
    expect(store.stats().queued).toBe(0);
    // ⚠️ 이 한 경우만은 `flushed` 가 「반영했다」가 아니라 「더 할 것이 없다」를 센다. 유일하게
    //    실릴 값이던 `order_no` 를 포기했으므로 반영된 것은 없다. 카운터를 고치려면 `#drain`
    //    을 건드려야 하는데 그것은 16-28 의 드롭 규율과 얽혀 있어 이 plan 의 범위가 아니다 —
    //    잔여 오차로 드러내 둔다(16-39 SUMMARY).
    expect(store.stats().flushed).toBe(1);
  });

  it("⓽-c 재시도도 실패하면 throw 되어 큐 재시도 규율을 탄다", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    /** 로그에 나타나면 안 되는 문자열의 표식. 실제 계좌가 아니다 (16-38 회귀 게이트). */
    const LEAKED_ACCOUNT = "9876543210";
    const RETRY_FAILURE: FakePgError = {
      code: "23514",
      message: 'new row for relation "dma_orders" violates check constraint "dma_orders_filled_qty_check"',
      details: `Failing row contains (a1b2, ${LEAKED_ACCOUNT}, KR7005930003, 0, 70000, …).`,
      hint: "계좌 담당자에게 문의하십시오",
    };
    const { supabase, queries } = fakeDmaOrders([...fixtureRows(), manualRow()], {
      // 최초 시도(홀수 번째)는 `dupToday` 가 23505 를 **실제로 계산**하게 두고, 재시도(짝수
      // 번째)만 다른 코드로 실패시킨다.
      updateError: (nth) => (nth % 2 === 0 ? RETRY_FAILURE : undefined),
    });

    const store = new OrderStore(supabaseOrderSink(supabase));
    store.enqueueUpdate({ orderRowId: "row-manual", orderNo: ORDER_NO, status: "accepted" });
    await store.flushNow();

    // 재시도 실패는 「이유를 아는 실패」가 아니다 — 삼키지 않고 던져서 큐의 재시도 1회 →
    // 드롭 규율을 그대로 탄다. 결손이 카운터에 남는다 (S-5).
    expect(store.stats().retried).toBe(1);
    expect(store.stats().dropped).toBe(1);
    expect(store.stats().flushed).toBe(0);
    // 라운드 2회 × (최초 + 재시도) = 4건.
    expect(queries.map((q) => q.verb)).toEqual(["update", "update", "update", "update"]);

    // 16-38 의 마스킹 회귀 게이트 — 재시도 실패 로그도 `safePgError` 를 지난다.
    const dumped = JSON.stringify([...warnSpy.mock.calls, ...errorSpy.mock.calls].map((c) => c[0]));
    expect(dumped).not.toContain(LEAKED_ACCOUNT);
    expect(dumped).not.toContain("Failing row");
    expect(dumped).not.toContain("문의하십시오");
    expect(dumped).toContain("23514"); // 사유까지 지우면 그것대로 사고다
  });
});


// ============================================================
// PostgREST 오류 원문 유출 (16-38 / R2-CR-03 · T-16-45)
// ============================================================

/**
 * PostgreSQL 은 제약 위반의 `DETAIL` 에 **위반한 행의 값 전체**를 넣는다 —
 * `Failing row contains (…)`. `dma_orders` 의 행에는 `account_no`·`order_no`·`user_id` 가
 * 다 있으므로, 오류 객체를 통째로 로그에 실으면 `qty <= 0` 같은 CHECK 위반 한 번으로
 * 계좌번호 원문이 Cloud Logging 에 영구히 남는다. 이 phase 가 화면과 로그를 갈라 온
 * 마스킹 규율(T-16-09/T-16-45 — `maskAccountNo`)을 오류 로그 한 줄이 우회하고 있었다.
 *
 * 여기서 잠그는 것은 넷이다:
 *   ① insert · ② update · ③ 조회 — **세 sink 각각**이 `details` 를 흘리지 않는다.
 *     하나만 잠그면 나머지 둘이 다시 열린다. 이 갭이 애초에 그렇게 생겼다.
 *   ④ `#drain` 의 재큐잉 warn / 드롭 error — sink 가 **던진** 그 객체를 다시 받는 자리다.
 *     「sink 에서만 막으면 옆 줄이 흘린다」가 이 갭의 교훈이다.
 * 그리고 매 케이스가 `code` 는 **남아 있음**을 함께 단언한다 — 마스킹이 「조용한 실패」가
 * 되면 그것대로 사고다 (S-5).
 */
describe("PostgREST 오류 원문 유출 (R2-CR-03)", () => {
  // ★ 케이스마다 spy 를 반드시 되돌린다. `vi.spyOn` 은 이미 감싼 메서드에 대해 **같은 spy 를
  //   돌려주므로**, 복원하지 않으면 `mock.calls` 가 케이스를 넘어 누적되고 앞 케이스의
  //   페이로드가 뒤 케이스의 단언에 걸린다 — 회귀 잠금 실증에서 한 곳만 되돌렸는데 네 건이
  //   빨개지는 것으로 실제로 드러났다. 그 상태면 「어느 줄이 새는가」를 이 파일이 말하지 못한다.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** 테스트만 아는 가짜 계좌번호. 실제 계좌가 아니다 — 로그에 나타나면 안 되는 문자열의 표식이다. */
  const LEAKED_ACCOUNT = "9876543210";
  /** 실제 PostgREST 가 주는 모양 그대로. 값은 `details` 에만 들어간다. */
  const CHECK_VIOLATION: FakePgError = {
    code: "23514",
    message: 'new row for relation "dma_orders" violates check constraint "dma_orders_qty_check"',
    details: `Failing row contains (a1b2, ${LEAKED_ACCOUNT}, KR7005930003, 0, 70000, …).`,
    hint: "계좌 담당자에게 문의하십시오",
  };

  /** spy 가 받은 **첫 인자(로그 페이로드)** 만 모아 직렬화한다 — 메시지 문자열은 대상이 아니다. */
  function payloads(...spies: { mock: { calls: unknown[][] } }[]): string {
    return JSON.stringify(spies.flatMap((s) => s.mock.calls.map((c) => c[0])));
  }

  it("⓼-b insert 실패 로그에 details 가 실리지 않는다 — code 는 남는다", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const { supabase, queries } = fakeDmaOrders(fixtureRows(), { insertError: CHECK_VIOLATION });

    // 기존 ⓼ 의 계약은 그대로다 — 23505 가 아닌 에러는 여전히 throw 된다.
    await expect(
      supabaseOrderInsertSink(supabase)(insertRow({ userId: USER_A, orderNo: ORDER_NO })),
    ).rejects.toMatchObject({ code: "23514" });
    expect(queries.map((q) => q.verb)).toEqual(["insert"]);

    const dumped = payloads(errorSpy);
    expect(dumped).not.toContain(LEAKED_ACCOUNT);
    expect(dumped).not.toContain("Failing row");
    expect(dumped).not.toContain("문의하십시오"); // `hint` 도 나가지 않는다
    // 마스킹이 사유까지 지우면 그것대로 사고다 (S-5).
    expect(dumped).toContain("23514");
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("⓼-c update 실패 로그에 details 가 실리지 않는다 — code 는 남는다", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const { supabase } = fakeDmaOrders(fixtureRows(), { updateError: CHECK_VIOLATION });

    await expect(
      supabaseOrderSink(supabase)({ column: "id", value: "row-a-today" }, { status: "filled" }),
    ).rejects.toMatchObject({ code: "23514" });

    const dumped = payloads(errorSpy);
    expect(dumped).not.toContain(LEAKED_ACCOUNT);
    expect(dumped).not.toContain("Failing row");
    expect(dumped).toContain("23514");
    // 비식별 필드는 그대로 남는다 — 사유 추적에 필요하고 식별자가 아니다.
    expect(dumped).toContain('"column":"id"');
  });

  it("⓼-d order_no 조회 실패 로그에 details 가 실리지 않는다 — code 는 남는다", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const { supabase } = fakeDmaOrders(fixtureRows(), { selectError: CHECK_VIOLATION });

    await expect(supabaseOrderLookupSink(supabase)(USER_A, ORDER_NO)).rejects.toMatchObject({
      code: "23514",
    });

    const dumped = payloads(errorSpy);
    expect(dumped).not.toContain(LEAKED_ACCOUNT);
    expect(dumped).not.toContain("Failing row");
    expect(dumped).toContain("23514");
  });

  it("⓼-e #drain 의 재큐잉 warn·드롭 error 도 details 를 싣지 않는다 (sink 옆 줄)", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const { supabase } = fakeDmaOrders(fixtureRows(), { updateError: CHECK_VIOLATION });

    const store = new OrderStore(supabaseOrderSink(supabase));
    store.enqueueUpdate({ orderRowId: "row-a-today", status: "filled" });
    await store.flushNow();
    store.close();

    // 재시도 1회 후 드롭 — 동작은 이 plan 이 건드리지 않는다.
    expect(store.stats().retried).toBe(1);
    expect(store.stats().dropped).toBe(1);
    // sink 의 error · 재큐잉 warn · 드롭 error 를 **전부** 본다. 한 줄만 막으면 옆 줄이 흘린다.
    expect(warnSpy).toHaveBeenCalled();
    const dumped = payloads(warnSpy, errorSpy);
    expect(dumped).not.toContain(LEAKED_ACCOUNT);
    expect(dumped).not.toContain("Failing row");
    expect(dumped).not.toContain("문의하십시오");
    expect(dumped).toContain("23514");
  });
});
