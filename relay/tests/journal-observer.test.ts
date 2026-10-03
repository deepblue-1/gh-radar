/**
 * Phase 19 Plan 07 — 관찰자 상태기계(`JournalObserver`) · 상태 요약(`JournalStatus`) · `/healthz` journal 필드.
 *
 * 가짜는 **전송(DmaClient 표면) · 코덱 · Supabase** 셋뿐이다. 기록기는 실제 `JournalWriter` 를 가짜
 * Supabase 위에 올려 쓴다 — 갭·상한·epoch 판정이 실제 코드로 돌아야 관찰자의 끊기·재로그인이 의미가 있다.
 *
 * 코덱 가짜의 요령: 전송 프레임 이벤트의 `env` 슬롯에 테스트가 만든 `ObserverFrame` 객체를 실어 보내고,
 * 가짜 `decode` 가 그것을 그대로 돌려준다. 와이어 형식(19-09)은 이 파일의 관심사가 아니다.
 */
import http from "node:http";
import os from "node:os";
import type { AddressInfo } from "node:net";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RelayJournalStateMsg } from "@gh-radar/shared";

import { JournalObserver, OBSERVER_CLIENT_NAME } from "../src/journal/observer.js";
import { JournalStatus } from "../src/journal/status.js";
import { JournalWriter } from "../src/journal/writer.js";
import { createStrategyWriter } from "../src/journal/strategy-stream.js";
import { createOrderApi } from "../src/order/order-api.js";
import type { TransportFrameEvent } from "../src/dma/dma-client.js";
import type {
  JournalCodec,
  JournalRecord,
  ObserverAccountRow,
  ObserverFrame,
  ObserverLoginResult,
  ObserverTransport,
  StrategyEventRecord,
} from "../src/journal/types.js";
import { fakeStrategyEventRecord } from "./helpers/frames.js";

const SECRET = "observer-secret-DO-NOT-LOG-7f3a";
const GATEWAY = "KB";

// ============================================================
// 가짜 전송 · 코덱 · Supabase
// ============================================================

class FakeTransport extends EventEmitter implements ObserverTransport {
  gen = 0;
  connects = 0;
  resets = 0;
  destroys = 0;
  readonly sent: Uint8Array[] = [];
  readonly drops: string[] = [];
  readonly stops: string[] = [];

  get generation(): number {
    return this.gen;
  }
  connect(): void {
    this.connects += 1;
  }
  send(payload: Uint8Array): boolean {
    this.sent.push(payload);
    return true;
  }
  stopReconnect(reason: string): void {
    this.stops.push(reason);
  }
  dropTransport(reason: string): void {
    this.drops.push(reason);
  }
  resetReconnectAttempts(): void {
    this.resets += 1;
  }
  destroy(): void {
    this.destroys += 1;
  }

  /** DmaClient 의 연결 수립 흉내 — 세대 +1 후 "up". */
  up(): void {
    this.gen += 1;
    this.emit("up", { generation: this.gen });
  }
  /** DmaClient 의 단절 확정 흉내 — 세대 +1 후 "down". */
  down(reason = "test down"): void {
    this.gen += 1;
    this.emit("down", { reason, generation: this.gen });
  }
  /** 수신 프레임 — `env` 슬롯에 해석 결과를 실어 보낸다(가짜 코덱이 그대로 돌려준다). */
  frame(f: ObserverFrame, generation = this.gen): void {
    const e = { msgType: 0, env: f, generation } as unknown as TransportFrameEvent;
    this.emit("frame", e);
  }
}

type LoginInput = Parameters<JournalCodec["buildLoginReq"]>[0];

class FakeCodec implements JournalCodec {
  readonly logins: LoginInput[] = [];
  /** buildLoginReq 가 돌려준 바이트 — 송신 페이로드가 전부 이 집합이어야 한다(D-09 relay 몫). */
  readonly built = new Set<Uint8Array>();

  buildLoginReq(input: LoginInput): Uint8Array {
    this.logins.push({ ...input });
    const bytes = new TextEncoder().encode(`LOGIN#${this.logins.length}`);
    this.built.add(bytes);
    return bytes;
  }
  decode(e: TransportFrameEvent): ObserverFrame {
    return e.env as unknown as ObserverFrame;
  }
}

/** 커서 행 — 전략 칸(Phase 25)은 선택. 두 기록기가 같은 행을 각자 칸으로 읽는다. */
type CursorRow = {
  journal_epoch: string;
  last_seq: number;
  strategy_journal_epoch?: string | null;
  strategy_last_seq?: number;
};

type FakeDb = {
  supabase: SupabaseClient;
  cursorReads: () => number;
  applies: () => number;
  /** `dma_strategy_apply` 호출 수(Phase 25). */
  strategyApplies: () => number;
  /** 적용 RPC 를 멈춰 둔다(큐 상한 시나리오). */
  holdApplies: () => void;
  /** 전략 적용 RPC 만 멈춰 둔다 — 주문 적용은 흐른다(WR-01 전략 역압 분리). */
  holdStrategyApplies: () => void;
  /** 멈춰 둔 전략 적용을 전부 성공으로 풀고 이후 호출은 바로 성공시킨다. */
  releaseStrategyApplies: () => void;
};

function fakeDb(opts: { cursor?: CursorRow | null; cursorErrors?: number; strategyCursorErrors?: number } = {}): FakeDb {
  let cursorReads = 0;
  /** 전략 칸 select 만 실패시킨다(WR-01 — 전략 커서 실패 격리). */
  let strategyCursorErrors = opts.strategyCursorErrors ?? 0;
  let applies = 0;
  let strategyApplies = 0;
  let hold = false;
  let holdStrategy = false;
  const heldStrategy: Array<() => void> = [];
  let cursorErrors = opts.cursorErrors ?? 0;
  const supabase = {
    from: () => ({
      select: (cols: string) => ({
        eq: () => ({
          maybeSingle: () => {
            cursorReads += 1;
            if (cols.includes("strategy_") && strategyCursorErrors > 0) {
              strategyCursorErrors -= 1;
              return Promise.resolve({ data: null, error: { code: "42703", message: "column does not exist" } });
            }
            if (cursorErrors > 0) {
              cursorErrors -= 1;
              return Promise.resolve({ data: null, error: { code: "57P01", message: "terminating connection" } });
            }
            return Promise.resolve({ data: opts.cursor ?? null, error: null });
          },
        }),
      }),
    }),
    rpc: (fn: string, args: Record<string, unknown>) => {
      if (fn === "dma_strategy_apply") strategyApplies += 1;
      else if (fn === "dma_journal_apply") applies += 1;
      else return Promise.resolve({ data: null, error: { message: `unknown ${fn}` } });
      if (hold) return new Promise(() => undefined);
      const events = args.p_events as Array<{ seq: number }>;
      const ok = {
        data: { applied: events.length, skipped: 0, errors: [], last_seq: Math.max(...events.map((e) => e.seq)), rows: [] },
        error: null,
      };
      if (fn === "dma_strategy_apply" && holdStrategy) {
        return new Promise((resolve) => heldStrategy.push(() => resolve(ok)));
      }
      return Promise.resolve(ok);
    },
  } as unknown as SupabaseClient;
  return {
    supabase,
    cursorReads: () => cursorReads,
    applies: () => applies,
    strategyApplies: () => strategyApplies,
    holdApplies: () => {
      hold = true;
    },
    holdStrategyApplies: () => {
      holdStrategy = true;
    },
    releaseStrategyApplies: () => {
      holdStrategy = false;
      for (const release of heldStrategy.splice(0)) release();
    },
  };
}

function record(seq: number): JournalRecord {
  return {
    seq,
    tradeDate: "2026-09-28",
    gwTimeMs: 1_790_000_000_000 + seq,
    dmaUserId: "dma-a",
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

const ACCOUNTS: ObserverAccountRow[] = [
  { dmaUserId: "dma-a", accountNo: "11112222-01", name: "계좌1", priority: 0 },
  { dmaUserId: "dma-b", accountNo: "33334444-01", name: "계좌2", priority: 1 },
];

function loginOk(over: Partial<ObserverLoginResult> = {}): ObserverFrame {
  return {
    k: "login",
    result: {
      success: true,
      message: "",
      broker: "KB",
      epoch: "ep-1",
      headSeq: 1,
      oldestSeq: 1,
      resync: true,
      accounts: ACCOUNTS,
      // 전략 저널 없음(구 게이트웨이 동형 · G1 ⓑ) — 전략 pending 은 처음부터 거짓(Phase 25).
      strategyHeadSeq: 0,
      strategyOldestSeq: 0,
      strategyResync: false,
      // 저널 관찰자 로그인의 역할 에코 = journal(0 — Phase 26 · ed2e0240).
      role: 0,
      ...over,
    },
  };
}

function batch(seqs: number[], headSeq: number, caughtUp: boolean): ObserverFrame {
  return {
    k: "batch",
    batch: { records: seqs.map(record), headSeq, caughtUp, strategyEvents: [], strategyHeadSeq: 0, strategyCaughtUp: false },
  };
}

async function flush(turns = 6): Promise<void> {
  for (let i = 0; i < turns; i += 1) await Promise.resolve();
}

async function flushIo(turns = 4): Promise<void> {
  for (let i = 0; i < turns; i += 1) await new Promise<void>((resolve) => setImmediate(resolve));
}

// ============================================================
// 하네스
// ============================================================

type Rig = {
  transport: FakeTransport;
  codec: FakeCodec;
  db: FakeDb;
  writer: JournalWriter;
  /** 전략 기록기(Phase 25) — `rig({ strategy })` 일 때만. */
  strategyWriter: ReturnType<typeof createStrategyWriter> | undefined;
  access: { replace: ReturnType<typeof vi.fn> };
  observer: JournalObserver;
  status: JournalStatus;
  frames: RelayJournalStateMsg[];
  deliverJournalState: ReturnType<typeof vi.fn>;
};

const rigs: Rig[] = [];

function rig(
  opts: {
    secret?: string | undefined;
    cursor?: CursorRow | null;
    cursorErrors?: number;
    /** 전략 칸 커서 select 만 이 횟수만큼 실패(WR-01). */
    strategyCursorErrors?: number;
    maxQueue?: number;
    /** 전략 기록기를 같은 fakeDb 위에 붙인다(Phase 25). 생략하면 전략 스트림 없음(구 동작). */
    strategy?: { maxQueue?: number };
  } = {},
): Rig {
  const transport = new FakeTransport();
  const codec = new FakeCodec();
  const db = fakeDb({ cursor: opts.cursor, cursorErrors: opts.cursorErrors, strategyCursorErrors: opts.strategyCursorErrors });
  const writer = new JournalWriter({ supabase: db.supabase, gateway: GATEWAY, maxQueue: opts.maxQueue });
  const strategyWriter =
    opts.strategy !== undefined
      ? createStrategyWriter({ supabase: db.supabase, gateway: GATEWAY, maxQueue: opts.strategy.maxQueue })
      : undefined;
  const access = { replace: vi.fn() };
  const observer = new JournalObserver({
    secret: "secret" in opts ? opts.secret : SECRET,
    gateway: GATEWAY,
    codec,
    writer,
    ...(strategyWriter !== undefined ? { strategyWriter } : {}),
    access,
    transport,
    host: "127.0.0.1",
    port: 9100,
  });
  const status = new JournalStatus({ observer, writer, ...(strategyWriter !== undefined ? { strategyWriter } : {}) });
  const frames: RelayJournalStateMsg[] = [];
  // 부팅 결선(19-10)과 같은 모양 — 상태 프레임 → fanout.deliverJournalState.
  const deliverJournalState = vi.fn((f: RelayJournalStateMsg) => frames.push(f));
  status.on("frame", (f) => deliverJournalState(f));
  const r = { transport, codec, db, writer, strategyWriter, access, observer, status, frames, deliverJournalState };
  rigs.push(r);
  return r;
}

afterEach(() => {
  for (const r of rigs) {
    r.status.close();
    r.writer.close();
    r.strategyWriter?.close();
  }
  rigs.length = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** 기동 → 커서 → 연결 → up → 로그인 요청까지. */
async function bootToLogin(r: Rig): Promise<void> {
  r.observer.start();
  await flush();
  r.transport.up();
}

// ============================================================
// Task 1 — tracer
// ============================================================

describe("관찰자 tracer — 기동 → 로그인 → 배치 1건 → 기록기 → live → journal.state · healthz", () => {
  it("① start → readCursor 1회 → connect 1회 → up → buildLoginReq(secret, since 0, epoch '', client) 송신 1회 · logging_in", async () => {
    const r = rig();
    const readCursor = vi.spyOn(r.writer, "readCursor");

    r.observer.start();
    expect(r.transport.connects).toBe(0); // 커서를 읽기 전에는 붙지 않는다
    await flush();
    expect(readCursor).toHaveBeenCalledTimes(1);
    expect(r.transport.connects).toBe(1);
    expect(r.observer.state).toBe("connecting");

    r.transport.up();
    expect(r.codec.logins).toEqual([
      { secret: SECRET, sinceSeq: 0, epoch: "", client: OBSERVER_CLIENT_NAME, strategySinceSeq: 0 },
    ]);
    expect(OBSERVER_CLIENT_NAME).toBe("gh-radar-relay");
    expect(r.transport.sent).toHaveLength(1);
    expect(r.codec.built.has(r.transport.sent[0] as Uint8Array)).toBe(true);
    expect(r.observer.state).toBe("logging_in");
  });

  it("② 로그인 성공(epoch ep-1 · headSeq 1 · resync · 계좌 2행) → access.replace · beginEpoch · replaying (백오프 리셋은 첫 진전까지 미룬다 — WR-02)", async () => {
    const r = rig();
    const beginEpoch = vi.spyOn(r.writer, "beginEpoch");
    await bootToLogin(r);

    r.transport.frame(loginOk());

    expect(r.access.replace).toHaveBeenCalledTimes(1);
    expect(r.access.replace).toHaveBeenCalledWith(ACCOUNTS, { skipped: 0 });
    expect(beginEpoch).toHaveBeenCalledWith("ep-1", { resync: true, headSeq: 1 });
    expect(r.transport.resets).toBe(0);
    expect(r.observer.headSeq).toBe(1);
    expect(r.observer.state).toBe("replaying");
  });

  it("③ 배치 [seq 1] caughtUp → writer.push([seq 1]) · live · journal.state live 프레임 1 · 스냅샷 live", async () => {
    const r = rig();
    const push = vi.spyOn(r.writer, "push");
    await bootToLogin(r);
    r.transport.frame(loginOk());
    expect(r.status.frame()).toBeNull(); // 아직 판정 전 — 스냅샷을 보내지 않는다

    r.transport.frame(batch([1], 1, true));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]?.[0].map((x) => x.seq)).toEqual([1]);
    expect(r.observer.state).toBe("live");
    expect(r.deliverJournalState).toHaveBeenCalledTimes(1);
    expect(r.frames).toEqual([{ t: "journal.state", s: "live" }]);
    expect(r.status.frame()).toEqual({ t: "journal.state", s: "live" });
    // 관찰자 연결의 송신은 로그인 1건뿐이다(D-09 relay 몫).
    expect(r.transport.sent).toHaveLength(1);
  });

  it("④ /healthz 본문에 journal.state live · lastSeq(기록기 lastAppliedSeq) · 식별자 키 없음 · 200", async () => {
    const r = rig();
    await bootToLogin(r);
    r.transport.frame(loginOk());
    r.transport.frame(batch([1], 1, true));
    await flushIo();
    expect(r.writer.lastAppliedSeq).toBe(1);

    const { status, text } = await fetchHealthz(r.status);
    expect(status).toBe(200);
    const body = JSON.parse(text) as { journal: Record<string, unknown> };
    expect(body.journal).toEqual({
      state: "live",
      lastSeq: 1,
      headSeq: 1,
      lagSeq: 0,
      disconnectedSec: null,
      lastAppliedAgeSec: expect.any(Number),
      seqRegressions: 0,
      lastSeqRegressionAgeSec: null,
      duplicatesAfterRegression: 0,
      lastDuplicateAfterRegressionAgeSec: null,
      mapping: null,
      // 전략 기록기 미주입 rig — 칸은 있고 값은 null (Phase 25).
      strategy: null,
    });
    expectNoIdentifiers(text);
  });

  it("④b /healthz journal.strategy — 전략 기록기 주입 · 전략 이벤트 1건 적용 → {lastSeq 1 · headSeq 1 · lagSeq 0 · dbError false · queueDepth 0} · 식별자 키 없음 (Phase 25)", async () => {
    const r = rig({ strategy: {} });
    await bootToLogin(r);
    r.transport.frame(loginOk({ headSeq: 1, strategyHeadSeq: 1, strategyOldestSeq: 1, strategyResync: false }));
    r.transport.frame({
      k: "batch",
      batch: {
        records: [record(1)],
        headSeq: 1,
        caughtUp: true,
        strategyEvents: [fakeStrategyEventRecord({ seq: 1 })],
        strategyHeadSeq: 1,
        strategyCaughtUp: true,
      },
    });
    await flushIo();
    expect(r.observer.state).toBe("live");
    expect(r.db.strategyApplies()).toBe(1);

    const { status, text } = await fetchHealthz(r.status);
    expect(status).toBe(200);
    const body = JSON.parse(text) as { journal: Record<string, unknown> };
    expect(body.journal.strategy).toEqual({ lastSeq: 1, headSeq: 1, lagSeq: 0, dbError: false, queueDepth: 0, paused: null });
    expectNoIdentifiers(text);
  });
});

/** 실 `createOrderApi` 로 `/healthz` 를 한 번 부른다(상태 코드 · 본문 원문). */
async function fetchHealthz(journal: JournalStatus): Promise<{ status: number; text: string }> {
  const app = createOrderApi({
    relayOrderSecret: "test-relay-order-secret-0123456789",
    appVersion: "test-sha",
    nodeEnv: "test",
    sessions: { stats: () => ({ sessionCount: 0, readyCount: 0, everReadyCount: 0, stalledCount: 0 }) },
    dmaHost: "127.0.0.1",
    networkInterfaces: () => ({
      lo: [{ address: "127.0.0.1", family: "IPv4", internal: true } as os.NetworkInterfaceInfo],
    }),
    journal,
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    return { status: res.status, text: await res.text() };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** 공개 `/healthz` 본문에 계좌 · 사용자 식별자 · 비밀이 없다(T-19-07 · T-25-10). */
function expectNoIdentifiers(text: string): void {
  expect(text).not.toMatch(/"(accountNo|userId|account_no|user_id|dmaUserId|dma_user_id)"/);
  expect(text).not.toContain("11112222");
  expect(text).not.toContain("1234567801"); // 전략 이벤트 픽스처 계좌(SAMPLE_ACCOUNT_NO)
  expect(text).not.toContain(SECRET);
}

// ============================================================
// Task 2 — 실패 경로 · 비밀
// ============================================================

type LogCall = { level: string; args: unknown[] };

/** logger 전 레벨 스파이 — 출력은 삼키고 인자를 모은다. */
async function spyLogs(): Promise<LogCall[]> {
  const { logger } = await import("../src/logger.js");
  const calls: LogCall[] = [];
  for (const level of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(logger, level).mockImplementation(((...args: unknown[]) => {
      calls.push({ level, args });
    }) as never);
  }
  return calls;
}

function countLogs(calls: LogCall[], level: string, message: string): number {
  return calls.filter((c) => c.level === level && c.args.some((a) => typeof a === "string" && a.includes(message))).length;
}

/** 전 시나리오 공통 — 관찰자 연결로 나간 페이로드는 전부 buildLoginReq 결과였다(D-09 relay 몫). */
function expectOnlyLogins(r: Rig): void {
  for (const payload of r.transport.sent) expect(r.codec.built.has(payload)).toBe(true);
  expect(r.transport.sent).toHaveLength(r.codec.logins.length);
}

/** 로그에 비밀 문자열이 없다(T-19-03). */
function expectNoSecret(calls: LogCall[]): void {
  expect(JSON.stringify(calls.map((c) => c.args))).not.toContain(SECRET);
}

describe("관찰자 실패 경로 — 거부 정지 · 타임아웃 · 갭/상한 · resync · 방송 무시 · 커서 재시도 · 비밀", () => {
  it("⑤ 로그인 거부 → stopReconnect 1회 · rejected · error 1줄 · 이후 down 에도 rejected · up 이 와도 로그인 0", async () => {
    const logs = await spyLogs();
    const r = rig();
    await bootToLogin(r);

    r.transport.frame(loginOk({ success: false, message: "거부" }));

    expect(r.transport.stops).toEqual(["관찰자 로그인 거부"]);
    expect(r.transport.stops[0]).not.toContain(SECRET);
    expect(r.observer.state).toBe("rejected");
    expect(countLogs(logs, "error", "[JOURNAL] 관찰자 로그인 거부")).toBe(1);
    // 게이트웨이 문구 그대로 — 사유를 추측하지 않는다(D-09).
    const rejectLog = logs.find((c) => c.level === "error" && String(c.args[1]).includes("관찰자 로그인 거부"));
    expect(rejectLog?.args[0]).toMatchObject({ gatewayMessage: "거부" });
    expect(r.access.replace).not.toHaveBeenCalled();

    r.transport.down();
    expect(r.observer.state).toBe("rejected");
    r.transport.up();
    expect(r.codec.logins).toHaveLength(1);
    expect(r.transport.sent).toHaveLength(1);
    expect(r.observer.state).toBe("rejected");
    expectOnlyLogins(r);
    expectNoSecret(logs);
  });

  it("⑥ up 뒤 5초 무응답 → dropTransport(타임아웃) · connecting · 다음 up(gen 2) 에서 재송신 · 옛 세대(gen 1) 프레임 무시", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const logs = await spyLogs();
    const r = rig();
    await bootToLogin(r);
    expect(r.transport.gen).toBe(1);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(r.transport.drops).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(r.transport.drops).toEqual(["관찰자 로그인 응답 타임아웃"]);
    expect(r.observer.state).toBe("connecting");

    r.transport.up();
    expect(r.transport.gen).toBe(2);
    expect(r.codec.logins).toHaveLength(2);
    expect(r.observer.state).toBe("logging_in");

    // gen 1 에 대한 늦은 로그인 응답 — 새 세대의 판정에 쓰지 않는다.
    r.transport.frame(loginOk(), 1);
    expect(r.observer.state).toBe("logging_in");
    expect(r.access.replace).not.toHaveBeenCalled();

    r.transport.frame(loginOk());
    expect(r.observer.state).toBe("replaying");
    expectOnlyLogins(r);
    expectNoSecret(logs);
  });

  it("⑦ push → gap → dropTransport(갭) · 재로그인 since = lastReceivedSeq · epoch = writer.epoch", async () => {
    const logs = await spyLogs();
    const r = rig();
    await bootToLogin(r);
    r.transport.frame(loginOk({ headSeq: 5 }));
    r.transport.frame(batch([1, 2], 5, false));
    expect(r.observer.state).toBe("replaying");

    r.transport.frame(batch([4], 5, false)); // 3 이 빠졌다
    expect(r.transport.drops).toEqual(["저널 seq 갭"]);
    expect(r.observer.state).toBe("connecting");

    r.transport.down();
    r.transport.up();
    expect(r.codec.logins[1]).toEqual({
      secret: SECRET,
      sinceSeq: 2,
      epoch: "ep-1",
      client: OBSERVER_CLIENT_NAME,
      strategySinceSeq: 0,
    });
    expectOnlyLogins(r);
    expectNoSecret(logs);
  });

  it("⑧ push → overflow → dropTransport(상한) · 재로그인 since 는 적재된 마지막 seq", async () => {
    const logs = await spyLogs();
    const r = rig({ maxQueue: 2 });
    r.db.holdApplies(); // 적용이 멈춰 큐가 빠지지 않는다
    await bootToLogin(r);
    r.transport.frame(loginOk({ headSeq: 9 }));
    r.transport.frame(batch([1, 2], 9, false));

    r.transport.frame(batch([3], 9, false));
    expect(r.transport.drops).toEqual(["저널 큐 상한"]);
    expect(r.observer.state).toBe("connecting");

    r.transport.up();
    expect(r.codec.logins[1]).toMatchObject({ sinceSeq: 2, epoch: "ep-1" });
    expectOnlyLogins(r);
    expectNoSecret(logs);
  });

  it("⑨ 재접속 로그인 응답의 resync → 기록기 epoch 교체 · 새 epoch 첫 레코드 수용", async () => {
    const logs = await spyLogs();
    const r = rig({ cursor: { journal_epoch: "ep-old", last_seq: 5000 } });
    const beginEpoch = vi.spyOn(r.writer, "beginEpoch");
    await bootToLogin(r);
    // 커서가 있으면 첫 로그인부터 그 since · epoch 로 이어받는다.
    expect(r.codec.logins[0]).toMatchObject({ sinceSeq: 5000, epoch: "ep-old" });

    r.transport.frame(loginOk({ epoch: "ep-new", headSeq: 3, resync: true }));
    expect(beginEpoch).toHaveBeenCalledWith("ep-new", { resync: true, headSeq: 3 });
    expect(r.writer.epoch).toBe("ep-new");
    expect(r.observer.state).toBe("replaying");

    r.transport.frame(batch([1, 2, 3], 3, true));
    expect(r.transport.drops).toEqual([]);
    expect(r.observer.state).toBe("live");
    expect(r.writer.lastReceivedSeq).toBe(3);
    expect(countLogs(logs, "error", "저널 재동기화")).toBe(1);
    expectOnlyLogins(r);
    expectNoSecret(logs);
  });

  it("⑨b resync · oldestSeq 0(재생 원천 없음 — 다음 append 부터만 온다) · head>0 → 곧바로 live · 다음 레코드 수용 (19-09 ⑥)", async () => {
    // 게이트웨이는 oldest 0 이면 보낼 레코드가 없어 배치를 보내지 않는다(빈 배치 금지 · 시작은 head+1).
    // replaying 에 머물면 첫 주문 전까지 브라우저 「기록 지연」, 장중 180초 뒤 /healthz 503 거짓 알림이 난다.
    const r = rig({ cursor: { journal_epoch: "ep-old", last_seq: 5000 } });
    await bootToLogin(r);

    r.transport.frame(loginOk({ epoch: "ep-new", headSeq: 42, oldestSeq: 0, resync: true }));
    expect(r.observer.state).toBe("live");
    expect(r.observer.headSeq).toBe(42);
    expect(r.writer.epoch).toBe("ep-new");
    expect(r.writer.lastReceivedSeq).toBeNull();

    // 새 epoch 첫 레코드(head+1)는 seq 확인 없이 받는다 — 기록기 갭 규칙은 그대로다.
    r.transport.frame(batch([43], 43, true));
    expect(r.transport.drops).toEqual([]);
    expect(r.observer.state).toBe("live");
    expect(r.writer.lastReceivedSeq).toBe(43);
    expectOnlyLogins(r);
  });

  it("⑨c resync 가 아니면 oldestSeq 0 이어도 종전대로 head > 마지막 수신이면 replaying", async () => {
    const r = rig({ cursor: { journal_epoch: "ep-1", last_seq: 3 } });
    await bootToLogin(r);
    r.transport.frame(loginOk({ epoch: "ep-1", headSeq: 5, oldestSeq: 0, resync: false }));
    expect(r.observer.state).toBe("replaying");
  });

  it("⑩ ignore(76) → 로그·상태 변화 0 · unexpected(51) → warn 1회(두 번째 0) · malformed → error + dropTransport", async () => {
    const logs = await spyLogs();
    const r = rig();
    await bootToLogin(r);
    r.transport.frame(loginOk());
    r.transport.frame(batch([1], 1, true));
    expect(r.observer.state).toBe("live");

    const before = logs.length;
    r.transport.frame({ k: "ignore", msgType: 76 });
    expect(logs.length).toBe(before);
    expect(r.observer.state).toBe("live");

    r.transport.frame({ k: "unexpected", msgType: 51 });
    r.transport.frame({ k: "unexpected", msgType: 51 });
    expect(countLogs(logs, "warn", "예상 밖 프레임")).toBe(1);
    expect(r.observer.state).toBe("live");
    expect(r.transport.drops).toEqual([]);

    r.transport.frame({ k: "malformed", msgType: 80 });
    expect(countLogs(logs, "error", "관찰자 프레임 파손")).toBe(1);
    expect(r.transport.drops).toEqual(["관찰자 프레임 파손"]);
    expect(r.observer.state).toBe("connecting");
    expectOnlyLogins(r);
    expectNoSecret(logs);
  });

  it("⑪ readCursor throw → error 로그 · connect 0 · 백오프 뒤 재시도 성공 → connect 1", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const logs = await spyLogs();
    const r = rig({ cursorErrors: 1 });

    r.observer.start();
    await flush(10);
    expect(r.db.cursorReads()).toBe(1);
    expect(r.transport.connects).toBe(0);
    expect(countLogs(logs, "error", "커서 읽기 실패")).toBe(1);
    expect(r.observer.state).toBe("connecting");

    await vi.advanceTimersByTimeAsync(1_000); // backoffDelayMs(1)
    await flush(10);
    expect(r.db.cursorReads()).toBe(2);
    expect(r.transport.connects).toBe(1);
    expectNoSecret(logs);
  });

  it("⑫ secret 미설정 → disabled · connect 0 · readCursor 0 · warn 1 · status.frame() null · 프레임 0", async () => {
    const logs = await spyLogs();
    const r = rig({ secret: undefined });

    r.observer.start();
    await flush();
    expect(r.observer.state).toBe("disabled");
    expect(r.transport.connects).toBe(0);
    expect(r.db.cursorReads()).toBe(0);
    expect(countLogs(logs, "warn", "관찰자 비밀 미설정")).toBe(1);
    expect(r.status.frame()).toBeNull();
    expect(r.frames).toEqual([]);
    expect(r.status.health(Date.now()).state).toBe("disabled");
  });

  it("⑬ stop → 이후 up·frame 에도 상태 불변 · destroy 1회 · 타이머 0", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const r = rig();
    await bootToLogin(r);
    r.observer.stop();
    expect(r.transport.destroys).toBe(1);
    const state = r.observer.state;

    r.transport.up();
    r.transport.frame(loginOk());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(r.observer.state).toBe(state);
    expect(r.codec.logins).toHaveLength(1);
    expect(r.transport.drops).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("19-REVIEW WR-02 — 백오프 리셋은 로그인 뒤 첫 진전에서 · 계약 위반 epoch 정지 · not_ready 사유 분리", () => {
  it("로그인 성공만으로는 리셋하지 않는다 → 첫 배치 적재에서 1회 · 이후 배치는 추가 리셋 없음", async () => {
    const r = rig();
    await bootToLogin(r);
    r.transport.frame(loginOk({ headSeq: 3 }));
    expect(r.transport.resets).toBe(0);
    r.transport.frame(batch([1], 3, false));
    expect(r.transport.resets).toBe(1);
    r.transport.frame(batch([2, 3], 3, true));
    expect(r.observer.state).toBe("live");
    expect(r.transport.resets).toBe(1);
  });

  it("로그인 직후 같은 갭이 반복되면 리셋하지 않는다(백오프가 자란다 — 1초 무한 재접속 방지)", async () => {
    const r = rig({ cursor: { journal_epoch: "ep-1", last_seq: 2 } });
    r.observer.start();
    await flush();
    for (let i = 0; i < 3; i += 1) {
      r.transport.up();
      r.transport.frame(loginOk({ resync: false, headSeq: 9 }));
      r.transport.frame(batch([4, 5], 9, false)); // 3 이 게이트웨이 저널에서 영구히 빠졌다
      r.transport.down();
    }
    expect(r.transport.drops).toEqual(["저널 seq 갭", "저널 seq 갭", "저널 seq 갭"]);
    expect(r.transport.resets).toBe(0);
  });

  it("재생할 것이 없는 로그인(곧바로 live)은 진전이다 → 리셋 1회", async () => {
    const r = rig({ cursor: { journal_epoch: "ep-1", last_seq: 4 } });
    r.observer.start();
    await flush();
    r.transport.up();
    r.transport.frame(loginOk({ resync: false, headSeq: 4 }));
    expect(r.observer.state).toBe("live");
    expect(r.transport.resets).toBe(1);
  });

  it("성공 응답인데 epoch 가 비었다 → 계약 위반 정지(rejected · stopReconnect) · 매핑 교체 0 · 이후 up 에도 로그인 0", async () => {
    const logs = await spyLogs();
    const r = rig();
    await bootToLogin(r);
    r.transport.frame(loginOk({ epoch: "" }));
    expect(r.observer.state).toBe("rejected");
    expect(r.transport.stops).toEqual(["관찰자 로그인 epoch 없음"]);
    expect(r.transport.destroys).toBe(1);
    expect(r.access.replace).not.toHaveBeenCalled();
    expect(countLogs(logs, "error", "[JOURNAL] 관찰자 로그인 성공 응답에 epoch 가 없다 — 게이트웨이 계약 위반 · 재접속 중단")).toBe(1);
    // 「저널 큐 상한」 같은 틀린 사유로 끊지 않는다.
    expect(r.transport.drops).toEqual([]);
    r.transport.up();
    expect(r.codec.logins).toHaveLength(1);
  });

  it("기록기 not_ready(종료 · epoch 미설정) → 「저널 큐 상한」 이 아니라 「저널 기록기 준비 안 됨」 으로 끊는다", async () => {
    const r = rig();
    await bootToLogin(r);
    r.transport.frame(loginOk({ headSeq: 1 }));
    vi.spyOn(r.writer, "push").mockReturnValue("not_ready");
    r.transport.frame(batch([1], 1, true));
    expect(r.transport.drops).toEqual(["저널 기록기 준비 안 됨"]);
    expect(r.transport.resets).toBe(0);
  });
});

describe("seq 역행 방어 — 같은 epoch 인데 게이트웨이 head 가 받은 seq 보다 작다 (gh-trade 23 합의)", () => {
  // 시나리오: 게이트웨이가 같은 epoch 를 되살렸지만 최신 날짜 파일을 잃어 head < relay 의 마지막 수신 seq.
  // gh-trade 는 다음 seq 를 since+1 로 올리고 resync=false 로 답하기로 했다 — relay 는 resync 값과 무관하게
  // lastReceivedSeq 를 **유지**해야 한다(되돌리면 1..head 재생 → since+1 → 갭 → since=head 재접속 → 갭 무한 반복).

  it.each([true, false])("resync=%s · head 7 < 받은 10 → lastReceivedSeq 유지 · 곧바로 live · 11 수용(갭 0) · error 1 · health 신호", async (resync) => {
    const logs = await spyLogs();
    const r = rig({ cursor: { journal_epoch: "ep-1", last_seq: 10 } });
    await bootToLogin(r);
    expect(r.codec.logins[0]).toMatchObject({ sinceSeq: 10, epoch: "ep-1" });

    r.transport.frame(loginOk({ epoch: "ep-1", headSeq: 7, oldestSeq: 1, resync }));

    expect(r.writer.epoch).toBe("ep-1");
    expect(r.writer.lastReceivedSeq).toBe(10);
    expect(r.observer.state).toBe("live");
    expect(countLogs(logs, "error", "저널 seq 역행")).toBe(1);
    expect(countLogs(logs, "error", "저널 재동기화")).toBe(0);
    const regression = logs.find((c) => c.level === "error" && c.args.some((a) => typeof a === "string" && a.includes("저널 seq 역행")));
    expect(regression?.args[0]).toMatchObject({ gateway: GATEWAY, epoch: "ep-1", headSeq: 7, lastReceivedSeq: 10, resync });

    const h = r.status.health(Date.now());
    expect(h.seqRegressions).toBe(1);
    expect(h.lastSeqRegressionAgeSec).toBe(0);
    // 503 을 만들지 않는다 — 스트림은 계속 정상이다(표시만).
    expect(h.state).toBe("live");

    r.transport.frame(batch([11], 11, true));
    expect(r.transport.drops).toEqual([]);
    expect(r.writer.lastReceivedSeq).toBe(11);
    await flush();
    expect(r.db.applies()).toBe(1);
    expectOnlyLogins(r);
    expectNoSecret(logs);
  });

  it("회귀 방지 — 새 epoch 는 종전대로 lastReceivedSeq 를 비운다 · 역행 신호 0", async () => {
    const logs = await spyLogs();
    const r = rig({ cursor: { journal_epoch: "ep-1", last_seq: 10 } });
    await bootToLogin(r);
    r.transport.frame(loginOk({ epoch: "ep-2", headSeq: 3, oldestSeq: 1, resync: true }));
    expect(r.writer.epoch).toBe("ep-2");
    expect(r.writer.lastReceivedSeq).toBeNull();
    expect(r.observer.state).toBe("replaying");
    expect(countLogs(logs, "error", "저널 seq 역행")).toBe(0);
    expect(r.status.health(Date.now())).toMatchObject({ seqRegressions: 0, lastSeqRegressionAgeSec: null });
  });

  it("회귀 방지 — 같은 epoch · resync · head >= 받은 seq(보관 범위 밖) → 종전대로 비운다 · 역행 신호 0", async () => {
    const logs = await spyLogs();
    const r = rig({ cursor: { journal_epoch: "ep-1", last_seq: 10 } });
    await bootToLogin(r);
    r.transport.frame(loginOk({ epoch: "ep-1", headSeq: 15, oldestSeq: 12, resync: true }));
    expect(r.writer.epoch).toBe("ep-1");
    expect(r.writer.lastReceivedSeq).toBeNull();
    expect(r.observer.state).toBe("replaying");
    expect(countLogs(logs, "error", "저널 재동기화")).toBe(1);
    expect(countLogs(logs, "error", "저널 seq 역행")).toBe(0);
    expect(r.status.health(Date.now()).seqRegressions).toBe(0);
  });

  it("회귀 방지 — 같은 epoch · resync 아님 · head == 받은 seq → 유지 · live · 역행 신호 0", async () => {
    const logs = await spyLogs();
    const r = rig({ cursor: { journal_epoch: "ep-1", last_seq: 10 } });
    await bootToLogin(r);
    r.transport.frame(loginOk({ epoch: "ep-1", headSeq: 10, oldestSeq: 1, resync: false }));
    expect(r.writer.lastReceivedSeq).toBe(10);
    expect(r.observer.state).toBe("live");
    expect(countLogs(logs, "error", "저널 seq 역행")).toBe(0);
  });
});

// ============================================================
// Phase 25 — 두 스트림 경계 (25-02 Task 1)
// ============================================================

/** 80 두 스트림 배치 — 주문 레코드 · 전략 이벤트를 seq 목록으로. */
function batch2(opts: {
  records?: number[];
  headSeq?: number;
  caughtUp?: boolean;
  strategy?: number[];
  strategyHeadSeq?: number;
  strategyCaughtUp?: boolean;
}): ObserverFrame {
  const records = opts.records ?? [];
  const strategy = opts.strategy ?? [];
  const strategyEvents: StrategyEventRecord[] = strategy.map((seq) => fakeStrategyEventRecord({ seq }));
  return {
    k: "batch",
    batch: {
      records: records.map(record),
      headSeq: opts.headSeq ?? records[records.length - 1] ?? 0,
      caughtUp: opts.caughtUp ?? true,
      strategyEvents,
      strategyHeadSeq: opts.strategyHeadSeq ?? strategy[strategy.length - 1] ?? 0,
      strategyCaughtUp: opts.strategyCaughtUp ?? true,
    },
  };
}

function strategyOf(r: Rig): NonNullable<Rig["strategyWriter"]> {
  if (r.strategyWriter === undefined) throw new Error("rig({ strategy }) 로 만들어야 한다");
  return r.strategyWriter;
}

describe("두 스트림 (Phase 25) — 전략 갭 · resync · 구 게이트웨이 · 두 pending · 주문 먼저 · since epoch 짝", () => {
  it("두 스트림 since epoch 짝 — 전략 epoch = 주문 epoch 면 전략 마지막 수신 7 · 옛 epoch(ep-0)면 0 · 전략 기록기 없으면 0", async () => {
    const same = rig({
      cursor: { journal_epoch: "ep-1", last_seq: 10, strategy_journal_epoch: "ep-1", strategy_last_seq: 7 },
      strategy: {},
    });
    await bootToLogin(same);
    expect(same.codec.logins[0]).toEqual({
      secret: SECRET,
      sinceSeq: 10,
      epoch: "ep-1",
      client: OBSERVER_CLIENT_NAME,
      strategySinceSeq: 7,
    });

    // 옛 epoch 의 전략 seq 를 새 epoch 와 짝지으면 게이트웨이가 새 구간 앞부분을 건너뛴다(RESEARCH Pitfall 3).
    const stale = rig({
      cursor: { journal_epoch: "ep-1", last_seq: 10, strategy_journal_epoch: "ep-0", strategy_last_seq: 7 },
      strategy: {},
    });
    await bootToLogin(stale);
    expect(stale.codec.logins[0]).toMatchObject({ sinceSeq: 10, epoch: "ep-1", strategySinceSeq: 0 });

    // 전략 기록기 미주입 — 커서 행에 전략 칸이 있어도 전략 since 는 0(구 동작).
    const none = rig({
      cursor: { journal_epoch: "ep-1", last_seq: 10, strategy_journal_epoch: "ep-1", strategy_last_seq: 7 },
    });
    await bootToLogin(none);
    expect(none.codec.logins[0]).toMatchObject({ sinceSeq: 10, epoch: "ep-1", strategySinceSeq: 0 });
  });

  it("두 스트림 두 pending — 주문 caught_up 이어도 전략 caught_up 전에는 replaying · 다음 배치 전략 caught_up 에서 live", async () => {
    const r = rig({
      cursor: { journal_epoch: "ep-1", last_seq: 10, strategy_journal_epoch: "ep-1", strategy_last_seq: 0 },
      strategy: {},
    });
    await bootToLogin(r);
    r.transport.frame(
      loginOk({ epoch: "ep-1", headSeq: 10, oldestSeq: 1, resync: false, strategyHeadSeq: 5, strategyOldestSeq: 1, strategyResync: false }),
    );
    // 주문은 이미 head(10)까지 받았다 — 전략(head 5 · 수신 0)만 밀려 있다.
    expect(r.observer.state).toBe("replaying");
    expect(r.observer.strategyHeadSeq).toBe(5);

    r.transport.frame(batch2({ records: [], headSeq: 10, caughtUp: true, strategy: [], strategyHeadSeq: 5, strategyCaughtUp: false }));
    expect(r.observer.state).toBe("replaying");

    r.transport.frame(batch2({ records: [], headSeq: 10, caughtUp: true, strategy: [1, 2, 3, 4, 5], strategyCaughtUp: true }));
    expect(r.transport.drops).toEqual([]);
    expect(r.observer.state).toBe("live");
    expect(strategyOf(r).lastReceivedSeq).toBe(5);
    expect(r.writer.lastReceivedSeq).toBe(10);
    expectOnlyLogins(r);
  });

  it("두 스트림 구 게이트웨이 — 로그인 전략 0/0/false · 배치 전략 빈 벡터 · strategy caught_up false 여도 주문 caught_up 만으로 live", async () => {
    const r = rig({ strategy: {} });
    await bootToLogin(r);
    r.transport.frame(loginOk({ headSeq: 1, strategyHeadSeq: 0, strategyOldestSeq: 0, strategyResync: false }));
    expect(r.observer.state).toBe("replaying"); // 주문 pending 만

    // 구 게이트웨이 프레임은 전략 필드가 없다 → 코덱이 빈 벡터 · head 0 · caught_up false 로 푼다(실 TCP 는 journal-gateway).
    r.transport.frame(batch2({ records: [1], headSeq: 1, caughtUp: true, strategy: [], strategyHeadSeq: 0, strategyCaughtUp: false }));
    expect(r.observer.state).toBe("live");
    expect(r.transport.drops).toEqual([]);
    expect(strategyOf(r).lastReceivedSeq).toBeNull();
    await flush();
    expect(r.db.strategyApplies()).toBe(0);
  });

  it("두 스트림 전략 갭 — 전략 수신 3 에서 [5] → 「전략 seq 갭」 끊기 · 재로그인 strategySinceSeq 3 · 주문 커서 불변", async () => {
    const logs = await spyLogs();
    const r = rig({
      cursor: { journal_epoch: "ep-1", last_seq: 10, strategy_journal_epoch: "ep-1", strategy_last_seq: 3 },
      strategy: {},
    });
    await bootToLogin(r);
    expect(r.codec.logins[0]).toMatchObject({ sinceSeq: 10, strategySinceSeq: 3 });
    r.transport.frame(
      loginOk({ epoch: "ep-1", headSeq: 10, oldestSeq: 1, resync: false, strategyHeadSeq: 5, strategyOldestSeq: 1, strategyResync: false }),
    );
    expect(r.observer.state).toBe("replaying");

    r.transport.frame(batch2({ records: [], headSeq: 10, caughtUp: true, strategy: [5], strategyCaughtUp: true })); // 4 가 빠졌다
    expect(r.transport.drops).toEqual(["전략 seq 갭"]);
    expect(r.observer.state).toBe("connecting");
    expect(strategyOf(r).lastReceivedSeq).toBe(3);
    expect(r.writer.lastReceivedSeq).toBe(10);
    // 기록기 로그에 스트림 문맥이 붙는다 — 주문 갭과 운영 판독이 섞이지 않는다.
    const gapLog = logs.find((c) => c.level === "error" && c.args.some((a) => typeof a === "string" && a.includes("seq 갭 — 연결을 끊고")));
    expect(gapLog?.args[0]).toMatchObject({ stream: "strategy", expected: 4, got: 5 });

    r.transport.down();
    r.transport.up();
    expect(r.codec.logins[1]).toEqual({
      secret: SECRET,
      sinceSeq: 10,
      epoch: "ep-1",
      client: OBSERVER_CLIENT_NAME,
      strategySinceSeq: 3,
    });
    expectOnlyLogins(r);
    expectNoSecret(logs);
  });

  it("두 스트림 전략 overflow — 소켓을 끊지 않고 전략 수신만 멈춘다 · 주문은 계속 적재 · live 유지 · healthz paused overflow (WR-01)", async () => {
    const logs = await spyLogs();
    const r = rig({ strategy: { maxQueue: 2 } });
    r.db.holdStrategyApplies(); // 전략 적용만 멈춘다 — 주문 적용은 흐른다
    await bootToLogin(r);
    r.transport.frame(loginOk({ headSeq: 1, strategyHeadSeq: 3, strategyOldestSeq: 1, strategyResync: false }));
    expect(r.observer.state).toBe("replaying");

    r.transport.frame(batch2({ records: [1], headSeq: 1, caughtUp: true, strategy: [1, 2, 3], strategyCaughtUp: true }));
    // 끊지 않는다 — 전략 쪽 지속 장애가 주문 저널 재로그인 반복 · 503 으로 번지지 않게.
    expect(r.transport.drops).toEqual([]);
    expect(r.observer.strategyPaused).toBe("overflow");
    // 전략 pending 을 내려 주문 caught_up 만으로 live.
    expect(r.observer.state).toBe("live");
    expect(strategyOf(r).queueDepth).toBe(0);
    expect(strategyOf(r).lastReceivedSeq).toBeNull();
    expect(r.writer.lastReceivedSeq).toBe(1);
    const pauseLog = logs.find((c) => c.level === "error" && c.args.some((a) => typeof a === "string" && a.includes("전략 수신만 일시 중지")));
    expect(pauseLog?.args[0]).toMatchObject({ reason: "overflow" });
    expect(r.status.health(Date.now()).strategy?.paused).toBe("overflow");
    expectOnlyLogins(r);
  });

  it("두 스트림 전략 overflow 일시 중지 동안 — 이후 프레임의 주문은 적재 · 전략분은 버림(since 불변) · 큐가 비면 재로그인 1회로 전략 since 이어받기 (WR-01)", async () => {
    const r = rig({ strategy: { maxQueue: 3 } });
    r.db.holdStrategyApplies();
    await bootToLogin(r);
    r.transport.frame(loginOk({ headSeq: 1, strategyHeadSeq: 2, strategyOldestSeq: 1, strategyResync: false }));

    // 전략 1 · 2 는 큐에 들어가 적용 대기(멈춤) — 3 · 4 가 상한을 넘겨 일시 중지.
    r.transport.frame(batch2({ records: [1], headSeq: 1, caughtUp: true, strategy: [1, 2], strategyCaughtUp: true }));
    r.transport.frame(batch2({ records: [2], headSeq: 2, caughtUp: true, strategy: [3, 4], strategyCaughtUp: true }));
    expect(r.observer.strategyPaused).toBe("overflow");
    expect(r.transport.drops).toEqual([]);
    expect(strategyOf(r).lastReceivedSeq).toBe(2);
    expect(strategyOf(r).queueDepth).toBe(2);

    // 전략 적용이 아직 멈춰 있다 — 다음 프레임도 주문만 적재하고 전략분(5)은 버린다. 끊지 않는다.
    r.transport.frame(batch2({ records: [3], headSeq: 3, caughtUp: true, strategy: [5], strategyCaughtUp: true }));
    expect(r.transport.drops).toEqual([]);
    expect(r.writer.lastReceivedSeq).toBe(3);
    expect(strategyOf(r).lastReceivedSeq).toBe(2);
    expect(r.observer.state).toBe("live");
    await flushIo();
    expect(r.db.applies()).toBeGreaterThan(0);

    // 전략 적용 복구 → 큐가 빈다. 다음 프레임에서 주문분을 먼저 적재하고 재로그인 1회로 전략 since 를 이어받는다.
    r.db.releaseStrategyApplies();
    await flushIo();
    expect(strategyOf(r).queueDepth).toBe(0);
    r.transport.frame(batch2({ records: [4], headSeq: 4, caughtUp: true, strategy: [6], strategyCaughtUp: true }));
    expect(r.writer.lastReceivedSeq).toBe(4);
    expect(r.transport.drops).toEqual(["전략 큐 해소 — 전략 이어받기"]);
    expect(r.observer.state).toBe("connecting");

    r.transport.up();
    expect(r.codec.logins[1]).toMatchObject({ sinceSeq: 4, epoch: "ep-1", strategySinceSeq: 2 });
    r.transport.frame(loginOk({ epoch: "ep-1", resync: false, headSeq: 4, strategyHeadSeq: 6, strategyOldestSeq: 1, strategyResync: false }));
    expect(r.observer.strategyPaused).toBeNull();
    // 재생분(3..6)을 받는다 — 전략 큐 상한 3 안에서 두 프레임으로.
    r.transport.frame(batch2({ records: [], headSeq: 4, caughtUp: true, strategy: [3, 4], strategyHeadSeq: 6, strategyCaughtUp: false }));
    await flushIo();
    r.transport.frame(batch2({ records: [], headSeq: 4, caughtUp: true, strategy: [5, 6], strategyCaughtUp: true }));
    expect(r.transport.drops).toEqual(["전략 큐 해소 — 전략 이어받기"]);
    expect(r.observer.strategyPaused).toBeNull();
    expect(strategyOf(r).lastReceivedSeq).toBe(6);
    expect(r.observer.state).toBe("live");
    expectOnlyLogins(r);
  });

  it("두 스트림 전략 필수 키 계약 위반 — 앞 이벤트까지 적재 · 전략 수신만 중지(paused contract) · 주문은 계속 · 큐가 비어도 자동 재로그인 없음 (WR-01)", async () => {
    const logs = await spyLogs();
    const r = rig({ strategy: {} });
    await bootToLogin(r);
    r.transport.frame(loginOk({ headSeq: 1, strategyHeadSeq: 5, strategyOldestSeq: 1, strategyResync: false }));

    // 파서가 seq 3(trade_date 위반) 앞까지만 넘기고 위반을 표시했다.
    const f = batch2({ records: [1], headSeq: 1, caughtUp: true, strategy: [1, 2], strategyHeadSeq: 5, strategyCaughtUp: false });
    if (f.k !== "batch") throw new Error("batch 프레임이어야 한다");
    f.batch.strategyContractViolation = { seq: 3, field: "trade_date" };
    r.transport.frame(f);
    expect(r.transport.drops).toEqual([]);
    expect(strategyOf(r).lastReceivedSeq).toBe(2);
    expect(r.observer.strategyPaused).toBe("contract");
    expect(r.observer.state).toBe("live");
    const pauseLog = logs.find((c) => c.level === "error" && c.args.some((a) => typeof a === "string" && a.includes("필수 키 계약 위반")));
    expect(pauseLog?.args[0]).toMatchObject({ reason: "contract", seq: 3, field: "trade_date" });

    await flushIo();
    expect(strategyOf(r).queueDepth).toBe(0);
    // 큐가 비어도 재로그인하지 않는다 — 같은 위반 이벤트가 재생될 뿐이다. 주문은 계속 들어온다.
    r.transport.frame(batch2({ records: [2], headSeq: 2, caughtUp: true, strategy: [4, 5], strategyCaughtUp: true }));
    expect(r.transport.drops).toEqual([]);
    expect(r.writer.lastReceivedSeq).toBe(2);
    expect(strategyOf(r).lastReceivedSeq).toBe(2);
    expect(r.status.health(Date.now()).strategy?.paused).toBe("contract");
    expectOnlyLogins(r);
  });

  it("19-REVIEW WR-01 — 전략 커서 읽기 실패는 주문 저널 연결을 막지 않는다 · 전략만 paused cursor · 전략분 버림 · 커서 복구 뒤 재로그인 1회로 전략 since 이어받기", async () => {
    vi.useFakeTimers();
    const logs = await spyLogs();
    const r = rig({
      strategy: {},
      cursor: { journal_epoch: "ep-1", last_seq: 4, strategy_journal_epoch: "ep-1", strategy_last_seq: 7 },
      strategyCursorErrors: 2,
    });
    r.observer.start();
    await flush();
    // 주문 커서만으로 연결한다 — 전략 커서 실패가 connecting 고착(장중 503)으로 번지지 않는다.
    expect(r.transport.connects).toBe(1);
    expect(r.observer.strategyPaused).toBe("cursor");
    const pauseLog = logs.find((c) => c.level === "error" && c.args.some((a) => typeof a === "string" && a.includes("전략 커서 읽기 실패")));
    expect(pauseLog?.args[0]).toMatchObject({ reason: "cursor" });

    r.transport.up();
    // 전략 since 는 모른다 — 0. 주문 since 는 커서 그대로.
    expect(r.codec.logins[0]).toMatchObject({ sinceSeq: 4, epoch: "ep-1", strategySinceSeq: 0 });
    const strategyBegin = vi.spyOn(strategyOf(r), "beginEpoch");
    r.transport.frame(loginOk({ epoch: "ep-1", resync: false, headSeq: 5, strategyHeadSeq: 9, strategyOldestSeq: 1, strategyResync: false }));
    // 로그인으로 풀리지 않는다 — 커서를 읽어야만 풀린다. 전략 기록기는 건드리지 않고 전략 pending 도 없다.
    expect(r.observer.strategyPaused).toBe("cursor");
    expect(strategyBegin).not.toHaveBeenCalled();
    expect(r.observer.state).toBe("replaying");

    // 게이트웨이가 보관분 처음부터 재생한 전략분은 버린다 — 주문은 적재 · live.
    r.transport.frame(batch2({ records: [5], headSeq: 5, caughtUp: true, strategy: [1, 2, 3], strategyHeadSeq: 9, strategyCaughtUp: false }));
    expect(r.writer.lastReceivedSeq).toBe(5);
    expect(strategyOf(r).queueDepth).toBe(0);
    expect(r.db.strategyApplies()).toBe(0);
    expect(r.observer.state).toBe("live");
    expect(r.transport.drops).toEqual([]);
    expect(r.status.health(Date.now()).strategy?.paused).toBe("cursor");

    // 1차 재읽기(1초) 실패 → 유지. 2차(2초) 성공 → 재로그인 1회.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(r.observer.strategyPaused).toBe("cursor");
    expect(r.transport.drops).toEqual([]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(strategyOf(r).lastReceivedSeq).toBe(7);
    expect(r.transport.drops).toEqual(["전략 커서 복구 — 전략 이어받기"]);

    r.transport.up();
    expect(r.codec.logins[1]).toMatchObject({ sinceSeq: 5, epoch: "ep-1", strategySinceSeq: 7 });
    r.transport.frame(loginOk({ epoch: "ep-1", resync: false, headSeq: 5, strategyHeadSeq: 9, strategyOldestSeq: 1, strategyResync: false }));
    expect(r.observer.strategyPaused).toBeNull();
    expect(strategyBegin).toHaveBeenCalledTimes(1);
    r.transport.frame(batch2({ records: [], headSeq: 5, caughtUp: true, strategy: [8, 9], strategyHeadSeq: 9, strategyCaughtUp: true }));
    expect(strategyOf(r).lastReceivedSeq).toBe(9);
    expect(r.observer.state).toBe("live");
    expectOnlyLogins(r);
  });

  it("19-REVIEW WR-01 — 로그인 응답 대기 중 전략 커서가 복구되면 그 로그인 응답이 커서를 반영한다(추가 재로그인 없음 · 중복은 기록기가 건너뜀)", async () => {
    vi.useFakeTimers();
    const r = rig({
      strategy: {},
      cursor: { journal_epoch: "ep-1", last_seq: 4, strategy_journal_epoch: "ep-1", strategy_last_seq: 7 },
      strategyCursorErrors: 1,
    });
    r.observer.start();
    await flush();
    r.transport.up();
    expect(r.codec.logins[0]).toMatchObject({ strategySinceSeq: 0 });
    expect(r.observer.state).toBe("logging_in");
    await vi.advanceTimersByTimeAsync(1_000); // 재읽기 성공 — 로그인 중이라 끊지 않는다
    expect(r.transport.drops).toEqual([]);
    r.transport.frame(loginOk({ epoch: "ep-1", resync: false, headSeq: 4, strategyHeadSeq: 9, strategyOldestSeq: 1, strategyResync: false }));
    expect(r.observer.strategyPaused).toBeNull();
    // since 0 으로 받은 재생(1..7)은 중복으로 건너뛰고 8 부터 적재한다.
    r.transport.frame(batch2({ records: [], headSeq: 4, caughtUp: true, strategy: [6, 7, 8, 9], strategyHeadSeq: 9, strategyCaughtUp: true }));
    expect(strategyOf(r).lastReceivedSeq).toBe(9);
    expect(strategyOf(r).queueDepth).toBe(2);
    expect(r.observer.state).toBe("live");
    expect(r.transport.drops).toEqual([]);
  });

  it("두 스트림 주문 먼저 — 주문 갭이 있는 프레임의 전략 이벤트는 기록기에 들어가지 않는다(「저널 seq 갭」 · 전략 큐 0)", async () => {
    const r = rig({ strategy: {} });
    await bootToLogin(r);
    r.transport.frame(loginOk({ headSeq: 5, strategyHeadSeq: 1, strategyOldestSeq: 1, strategyResync: false }));
    r.transport.frame(batch2({ records: [1, 2], headSeq: 5, caughtUp: false, strategy: [], strategyHeadSeq: 1, strategyCaughtUp: false }));
    expect(r.observer.state).toBe("replaying");

    r.transport.frame(batch2({ records: [4], headSeq: 5, caughtUp: false, strategy: [1], strategyCaughtUp: true })); // 주문 3 이 빠졌다
    expect(r.transport.drops).toEqual(["저널 seq 갭"]);
    expect(r.observer.state).toBe("connecting");
    expect(strategyOf(r).queueDepth).toBe(0);
    expect(strategyOf(r).lastReceivedSeq).toBeNull();
    await flush();
    expect(r.db.strategyApplies()).toBe(0);
    // 재로그인 since 로 다시 받는다 — 주문 2 · 전략 0(아직 이 프레임을 보지 않았다).
    r.transport.up();
    expect(r.codec.logins[1]).toMatchObject({ sinceSeq: 2, strategySinceSeq: 0 });
  });

  it("두 스트림 strategy_resync · strategy_oldest 0 → 전략 마지막 수신 비움(error 로그 · stream strategy) · 전략 pending 없음 → 즉시 live · 다음 전략 이벤트 수용", async () => {
    const logs = await spyLogs();
    const r = rig({
      cursor: { journal_epoch: "ep-1", last_seq: 10, strategy_journal_epoch: "ep-1", strategy_last_seq: 7 },
      strategy: {},
    });
    await bootToLogin(r);
    expect(strategyOf(r).lastReceivedSeq).toBe(7);

    r.transport.frame(
      loginOk({ epoch: "ep-1", headSeq: 10, oldestSeq: 1, resync: false, strategyHeadSeq: 9, strategyOldestSeq: 0, strategyResync: true }),
    );
    expect(strategyOf(r).lastReceivedSeq).toBeNull();
    expect(strategyOf(r).epoch).toBe("ep-1");
    // 주문 커서는 영향받지 않는다(resync 는 스트림별 · G1 ⓑ).
    expect(r.writer.lastReceivedSeq).toBe(10);
    expect(r.observer.state).toBe("live");
    const resyncLogs = logs.filter((c) => c.level === "error" && c.args.some((a) => typeof a === "string" && a.includes("저널 재동기화")));
    expect(resyncLogs).toHaveLength(1);
    expect(resyncLogs[0]?.args[0]).toMatchObject({ stream: "strategy", resync: true });

    // 새 구간 첫 이벤트(head+1)는 갭 판정 없이 받는다.
    r.transport.frame(batch2({ records: [], headSeq: 10, caughtUp: true, strategy: [10], strategyCaughtUp: true }));
    expect(r.transport.drops).toEqual([]);
    expect(strategyOf(r).lastReceivedSeq).toBe(10);
    expect(r.observer.state).toBe("live");
    expectOnlyLogins(r);
    expectNoSecret(logs);
  });
});

describe("loadConfig — DMA_OBSERVER_SECRET (D-10 · T-19-03)", () => {
  const saved = { NODE_ENV: process.env.NODE_ENV, DMA_OBSERVER_SECRET: process.env.DMA_OBSERVER_SECRET };

  afterEach(() => {
    process.env.NODE_ENV = saved.NODE_ENV;
    if (saved.DMA_OBSERVER_SECRET === undefined) delete process.env.DMA_OBSERVER_SECRET;
    else process.env.DMA_OBSERVER_SECRET = saved.DMA_OBSERVER_SECRET;
  });

  it("⑭ production + 비밀 없음 → throw (기동 실패)", async () => {
    const { loadConfig } = await import("../src/config.js");
    process.env.NODE_ENV = "production";
    delete process.env.DMA_OBSERVER_SECRET;
    expect(() => loadConfig()).toThrow(/DMA_OBSERVER_SECRET must be set in production/);
    process.env.DMA_OBSERVER_SECRET = "";
    expect(() => loadConfig()).toThrow(/DMA_OBSERVER_SECRET/);
  });

  it("⑮ test/development + 비밀 없음 → dmaObserverSecret undefined · 있으면 그 값", async () => {
    const { loadConfig } = await import("../src/config.js");
    delete process.env.DMA_OBSERVER_SECRET;
    for (const env of ["test", "development"]) {
      process.env.NODE_ENV = env;
      expect(loadConfig().dmaObserverSecret).toBeUndefined();
    }
    process.env.NODE_ENV = "production";
    process.env.DMA_OBSERVER_SECRET = SECRET;
    expect(loadConfig().dmaObserverSecret).toBe(SECRET);
  });
});
