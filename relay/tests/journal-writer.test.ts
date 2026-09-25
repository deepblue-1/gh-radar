/**
 * Phase 19 Plan 05 — `JournalWriter` 견고성 (D-12 · D-32 · Pitfall 2·3 · T-19-06 · T-19-09).
 *
 * 가짜는 Supabase 하나다 — rpc 호출 기록 · 응답 스크립트(성공/오류/보류) · `from().select().eq().maybeSingle()`
 * 커서 체인. 재시도 지연은 `vi.useFakeTimers` 로 당긴다. 워커의 비동기 경계는 마이크로태스크라
 * `flush()` 가 Promise 체인을 충분히 돌린다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { JournalOrderDbRow } from "@gh-radar/shared";

import { logger } from "../src/logger.js";
import {
  JOURNAL_BATCH_SIZE,
  JOURNAL_MAX_QUEUE,
  JournalWriter,
  type JournalApplyEvent,
  type JournalWriterDeps,
} from "../src/journal/writer.js";
import type { JournalRecord, JournalWriterHealth } from "../src/journal/types.js";

const GATEWAY = "KB";

/** 오류 `details` 에 행 값이 실리는 PostgREST 오류 흉내 — 로그로 새면 안 된다. */
const PG_ERROR = {
  code: "23514",
  message: 'new row for relation "dma_journal_events" violates check constraint',
  details: "Failing row contains (KB, ep-1, 1, 11112222-01, SECRET-ROW-VALUE).",
  hint: "secret hint",
};

type RpcCall = { fn: string; args: { p_gateway: string; p_epoch: string; p_events: JournalApplyEvent[] } };

/** 응답 스크립트 1칸. `hold` 는 테스트가 `release()` 할 때까지 끝나지 않는다. */
type Step = "ok" | "error" | "throw" | "hold";

type CursorResponse = { data: unknown; error: unknown };

function fakeDb(opts: { cursor?: CursorResponse; defaultStep?: Step } = {}) {
  const calls: RpcCall[] = [];
  const script: Step[] = [];
  const holds: Array<() => void> = [];
  let active = 0;
  let maxActive = 0;
  const cursorQueries: Array<{ table: string; cols: string; col: string; val: string }> = [];

  const okResult = (events: JournalApplyEvent[]) => ({
    data: {
      applied: events.length,
      skipped: 0,
      errors: [],
      last_seq: events.length > 0 ? String(Math.max(...events.map((e) => e.seq))) : 0,
      rows: [] as JournalOrderDbRow[],
    },
    error: null,
  });

  const supabase = {
    rpc: async (fn: string, args: RpcCall["args"]) => {
      calls.push({ fn, args: { ...args, p_events: [...args.p_events] } });
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        const step = script.shift() ?? opts.defaultStep ?? "ok";
        if (step === "hold") {
          await new Promise<void>((resolve) => holds.push(resolve));
          return okResult(args.p_events);
        }
        if (step === "error") return { data: null, error: PG_ERROR };
        if (step === "throw") throw new Error("fetch failed");
        return okResult(args.p_events);
      } finally {
        active -= 1;
      }
    },
    from: (table: string) => ({
      select: (cols: string) => ({
        eq: (col: string, val: string) => ({
          maybeSingle: () => {
            cursorQueries.push({ table, cols, col, val });
            return Promise.resolve(opts.cursor ?? { data: null, error: null });
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient;

  return {
    supabase,
    calls,
    script,
    cursorQueries,
    get maxActive() {
      return maxActive;
    },
    get holding() {
      return holds.length;
    },
    release(): void {
      holds.shift()?.();
    },
  };
}

function record(seq: number): JournalRecord {
  return {
    seq,
    tradeDate: "2026-09-25",
    gwTimeMs: 1_790_000_000_000 + seq,
    dmaUserId: "dma-shared",
    accountNo: "11112222-01",
    isin: "KR7005930003",
    side: "2",
    sideTrusted: true,
    orderNo: `000${seq}`,
    orgOrderNo: "",
    noticeType: "A",
    requestKind: "new",
    requester: "web",
    origin: "manual",
    exchange: "KRX",
    board: "",
    orderPrice: 70_000,
    orderQty: 10,
    execPrice: 0,
    execQty: 0,
    resultCode: 0,
    message: "",
    localReject: false,
  };
}

function range(from: number, to: number): JournalRecord[] {
  const out: JournalRecord[] = [];
  for (let s = from; s <= to; s += 1) out.push(record(s));
  return out;
}

/** 워커의 Promise 체인을 충분히 돌린다. */
async function flush(turns = 30): Promise<void> {
  for (let i = 0; i < turns; i += 1) await Promise.resolve();
}

function writerWith(db: ReturnType<typeof fakeDb>, extra: Partial<JournalWriterDeps> = {}): JournalWriter {
  const w = new JournalWriter({ supabase: db.supabase, gateway: GATEWAY, ...extra });
  return w;
}

describe("JournalWriter", () => {
  const writers: JournalWriter[] = [];
  const make = (db: ReturnType<typeof fakeDb>, extra: Partial<JournalWriterDeps> = {}): JournalWriter => {
    const w = writerWith(db, extra);
    writers.push(w);
    return w;
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    for (const w of writers) w.close();
    writers.length = 0;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("상수 정본 — 배치 200 · 큐 상한 5,000", () => {
    expect(JOURNAL_BATCH_SIZE).toBe(200);
    expect(JOURNAL_MAX_QUEUE).toBe(5_000);
  });

  it("① 450건 push → rpc 3회(200·200·50) · seq 오름차순 · 두 번째 호출은 첫 호출이 끝난 뒤에만", async () => {
    const db = fakeDb({ defaultStep: "hold" });
    const w = make(db);
    w.beginEpoch("ep-1", { resync: false, headSeq: 0 });

    // 두 번에 나눠 넣는다 — 첫 호출이 진행 중일 때 들어온 push 가 두 번째 호출을 동시에 열면 안 된다.
    expect(w.push(range(1, 200))).toBe("ok");
    await flush();
    expect(w.push(range(201, 450))).toBe("ok");
    await flush();
    expect(db.calls).toHaveLength(1); // 첫 호출이 보류 중이면 두 번째는 시작하지 않는다
    db.release();
    await flush();
    expect(db.calls).toHaveLength(2);
    db.release();
    await flush();
    expect(db.calls).toHaveLength(3);
    db.release();
    await flush();

    expect(db.maxActive).toBe(1);
    expect(db.calls.map((c) => c.fn)).toEqual(["dma_journal_apply", "dma_journal_apply", "dma_journal_apply"]);
    expect(db.calls.map((c) => c.args.p_events.length)).toEqual([200, 200, 50]);
    const seqs = db.calls.flatMap((c) => c.args.p_events.map((e) => e.seq));
    expect(seqs).toEqual(range(1, 450).map((r) => r.seq));
    expect(db.calls.every((c) => c.args.p_gateway === GATEWAY && c.args.p_epoch === "ep-1")).toBe(true);
    expect(w.queueDepth).toBe(0);
    expect(w.lastAppliedSeq).toBe(450);
  });

  it("② rpc 오류 2회 뒤 성공 → 같은 배치 재전송 · 실패 동안 lastAppliedSeq 불변 · 로그는 safePgError 필드만", async () => {
    const db = fakeDb();
    db.script.push("error", "throw", "ok");
    const errorSpy = vi.spyOn(logger, "error");
    const w = make(db);
    w.beginEpoch("ep-1", { resync: false, headSeq: 0 });

    w.push(range(1, 3));
    await flush();
    expect(db.calls).toHaveLength(1);
    expect(w.lastAppliedSeq).toBeNull();

    await vi.advanceTimersByTimeAsync(1_000); // backoffDelayMs(1)
    await flush();
    expect(db.calls).toHaveLength(2);
    expect(w.lastAppliedSeq).toBeNull();

    await vi.advanceTimersByTimeAsync(1_999);
    await flush();
    expect(db.calls).toHaveLength(2); // backoffDelayMs(2) = 2초 — 아직
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(db.calls).toHaveLength(3);

    for (const c of db.calls) expect(c.args.p_events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(w.lastAppliedSeq).toBe(3);
    expect(w.queueDepth).toBe(0);

    const failLogs = errorSpy.mock.calls.filter((c) => String(c[1]).includes("dma_journal_apply 실패"));
    expect(failLogs).toHaveLength(2);
    const first = failLogs[0]?.[0] as { pgError: Record<string, unknown>; batch: number; firstSeq: number; lastSeq: number };
    expect(first.pgError).toEqual({ code: PG_ERROR.code, message: PG_ERROR.message });
    expect(first).toMatchObject({ batch: 3, firstSeq: 1, lastSeq: 3 });
    expect(JSON.stringify(failLogs)).not.toContain("SECRET-ROW-VALUE");
    expect(JSON.stringify(failLogs)).not.toContain("secret hint");
  });

  it("③ 연속 3회 실패 → health().dbError true + health 이벤트 · 성공 1회 → false + 이벤트", async () => {
    const db = fakeDb();
    db.script.push("error", "error", "error", "ok");
    const w = make(db);
    const events: JournalWriterHealth[] = [];
    w.on("health", (h) => events.push(h));
    w.beginEpoch("ep-1", { resync: false, headSeq: 0 });

    w.push([record(1)]);
    await flush();
    await vi.advanceTimersByTimeAsync(1_000);
    await flush();
    expect(w.health().dbError).toBe(false); // 2회 — 아직
    await vi.advanceTimersByTimeAsync(2_000);
    await flush();
    expect(db.calls).toHaveLength(3);
    expect(w.health()).toMatchObject({ dbError: true, consecutiveFailures: 3, queueDepth: 1 });
    expect(events).toHaveLength(1);
    expect(events[0]?.dbError).toBe(true);

    await vi.advanceTimersByTimeAsync(4_000);
    await flush();
    expect(db.calls).toHaveLength(4);
    expect(w.health()).toMatchObject({ dbError: false, consecutiveFailures: 0, queueDepth: 0, lastAppliedSeq: 1 });
    expect(w.health().lastAppliedAtMs).not.toBeNull();
    expect(events).toHaveLength(2);
    expect(events[1]?.dbError).toBe(false);
  });

  it("④ lastReceivedSeq 5 에서 [7] → gap(큐 불변) · [4,5] → 중복 건너뜀 ok · [6,7,9] → 6·7 적재 후 gap", async () => {
    const db = fakeDb({ defaultStep: "hold" });
    const errorSpy = vi.spyOn(logger, "error");
    const w = make(db);
    w.beginEpoch("ep-1", { resync: false, headSeq: 0 });
    expect(w.push(range(1, 5))).toBe("ok");
    expect(w.lastReceivedSeq).toBe(5);
    const depth = w.queueDepth;

    expect(w.push([record(7)])).toBe("gap");
    expect(w.queueDepth).toBe(depth);
    expect(w.lastReceivedSeq).toBe(5);
    expect(errorSpy.mock.calls.some((c) => (c[0] as { expected?: number }).expected === 6 && (c[0] as { got?: number }).got === 7)).toBe(true);

    expect(w.push([record(4), record(5)])).toBe("ok");
    expect(w.queueDepth).toBe(depth);
    expect(w.lastReceivedSeq).toBe(5);

    expect(w.push([record(6), record(7), record(9)])).toBe("gap");
    expect(w.queueDepth).toBe(depth + 2);
    expect(w.lastReceivedSeq).toBe(7);

    // 적재된 것은 6·7 까지 — 9 는 게이트웨이에서 since_seq=7 로 다시 받는다.
    for (let i = 0; i < 3; i += 1) {
      db.release();
      await flush();
    }
    const sent = db.calls.flatMap((c) => c.args.p_events.map((e) => e.seq));
    expect(sent).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("⑤ maxQueue 10 · 큐 8 에서 push 3건 → overflow · 아무것도 적재하지 않는다", () => {
    const db = fakeDb({ defaultStep: "hold" });
    const w = make(db, { maxQueue: 10 });
    w.beginEpoch("ep-1", { resync: false, headSeq: 0 });
    expect(w.push(range(1, 8))).toBe("ok");
    expect(w.queueDepth).toBe(8);

    expect(w.push(range(9, 11))).toBe("overflow");
    expect(w.queueDepth).toBe(8);
    expect(w.lastReceivedSeq).toBe(8); // 커서도 그대로 — 다시 받으면 9 부터 이어진다
    expect(w.push(range(9, 10))).toBe("ok");
    expect(w.queueDepth).toBe(10);
  });

  it("⑥ readCursor — 행 있음 {ep-1, 42} · 행 없음 {'' , 0} · 오류 throw", async () => {
    const db = fakeDb({ cursor: { data: { journal_epoch: "ep-1", last_seq: 42 }, error: null } });
    const w = make(db);
    await expect(w.readCursor()).resolves.toEqual({ epoch: "ep-1", lastSeq: 42 });
    expect(db.cursorQueries).toEqual([
      { table: "dma_journal_cursor", cols: "journal_epoch, last_seq", col: "gateway", val: GATEWAY },
    ]);
    expect(w.epoch).toBe("ep-1");
    expect(w.lastReceivedSeq).toBe(42);
    expect(w.lastAppliedSeq).toBe(42);

    const empty = make(fakeDb({ cursor: { data: null, error: null } }));
    await expect(empty.readCursor()).resolves.toEqual({ epoch: "", lastSeq: 0 });
    expect(empty.epoch).toBe("");
    expect(empty.lastReceivedSeq).toBeNull();

    const errorSpy = vi.spyOn(logger, "error");
    const broken = make(fakeDb({ cursor: { data: null, error: PG_ERROR } }));
    await expect(broken.readCursor()).rejects.toThrow(/dma_journal_cursor 조회 실패/);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("SECRET-ROW-VALUE");
  });

  it("⑦ beginEpoch — 같은 epoch 는 lastReceivedSeq 유지 · resync 는 새 epoch · 옛 epoch 항목이 먼저 · 배치에 epoch 혼합 없음", async () => {
    const db = fakeDb({
      cursor: { data: { journal_epoch: "ep-1", last_seq: 42 }, error: null },
      defaultStep: "hold",
    });
    const errorSpy = vi.spyOn(logger, "error");
    const w = make(db);
    await w.readCursor();

    w.beginEpoch("ep-1", { resync: false, headSeq: 42 });
    expect(w.lastReceivedSeq).toBe(42);
    expect(w.push([record(43)])).toBe("ok"); // 첫 배치 [43] 이 보류 중
    await flush();
    expect(w.push([record(44)])).toBe("ok"); // ep-1 로 큐에 남는다

    w.beginEpoch("ep-2", { resync: true, headSeq: 0 });
    expect(w.epoch).toBe("ep-2");
    expect(w.lastReceivedSeq).toBeNull();
    expect(
      errorSpy.mock.calls.some((c) => {
        const o = c[0] as { from?: string; to?: string };
        return o.from === "ep-1" && o.to === "ep-2";
      }),
    ).toBe(true);
    // 새 epoch 첫 레코드는 갭 판정 없이 받는다(1 ≤ 44 여도 중복이 아니다).
    expect(w.push([record(1), record(2)])).toBe("ok");
    expect(w.lastReceivedSeq).toBe(2);

    for (let i = 0; i < 3; i += 1) {
      db.release();
      await flush();
    }
    expect(db.calls.map((c) => [c.args.p_epoch, c.args.p_events.map((e) => e.seq)])).toEqual([
      ["ep-1", [43]],
      ["ep-1", [44]],
      ["ep-2", [1, 2]],
    ]);
  });

  it.each([true, false])("⑦b seq 역행(같은 epoch · head < 받은 seq · resync=%s) → lastReceivedSeq 유지 · error 1 · health 카운터", async (resync) => {
    const db = fakeDb({ cursor: { data: { journal_epoch: "ep-1", last_seq: 42 }, error: null } });
    const errorSpy = vi.spyOn(logger, "error");
    const w = make(db);
    await w.readCursor();
    expect(w.health()).toMatchObject({ seqRegressions: 0, lastSeqRegressionAtMs: null });

    w.beginEpoch("ep-1", { resync, headSeq: 40 });

    expect(w.epoch).toBe("ep-1");
    expect(w.lastReceivedSeq).toBe(42);
    const hits = errorSpy.mock.calls.filter((c) => typeof c[1] === "string" && c[1].includes("저널 seq 역행"));
    expect(hits).toHaveLength(1);
    expect(hits[0]?.[0]).toMatchObject({ gateway: GATEWAY, epoch: "ep-1", headSeq: 40, lastReceivedSeq: 42, resync });
    expect(w.health().seqRegressions).toBe(1);
    expect(w.health().lastSeqRegressionAtMs).not.toBeNull();
    // 게이트웨이가 since+1 부터 보내면 갭 없이 이어진다.
    expect(w.push([record(43)])).toBe("ok");
    expect(w.lastReceivedSeq).toBe(43);
  });

  it("⑧ drain — 큐가 비면 true · 시간 초과면 false", async () => {
    const db = fakeDb({ defaultStep: "hold" });
    const w = make(db);
    w.beginEpoch("ep-1", { resync: false, headSeq: 0 });

    await expect(w.drain(2_000)).resolves.toBe(true); // 이미 비어 있다

    w.push(range(1, 3));
    await flush();
    const drained = w.drain(2_000);
    db.release();
    await flush();
    await expect(drained).resolves.toBe(true);
    expect(w.queueDepth).toBe(0);

    w.push(range(4, 5));
    await flush();
    const timedOut = w.drain(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(timedOut).resolves.toBe(false);
    expect(w.queueDepth).toBe(2);
    db.release();
    await flush();
  });

  it("⑨ close() 뒤 재시도 타이머 없음 · 이후 push 거부", async () => {
    const db = fakeDb({ defaultStep: "error" });
    const w = make(db);
    w.beginEpoch("ep-1", { resync: false, headSeq: 0 });
    w.push([record(1)]);
    await flush();
    expect(db.calls).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1); // 재시도 예약

    w.close();
    expect(vi.getTimerCount()).toBe(0);
    expect(w.push([record(2)])).toBe("overflow");
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(db.calls).toHaveLength(1);
  });
});
