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
import { createOrderApi } from "../src/order/order-api.js";
import type { TransportFrameEvent } from "../src/dma/dma-client.js";
import type {
  JournalCodec,
  JournalRecord,
  ObserverAccountRow,
  ObserverFrame,
  ObserverLoginResult,
  ObserverTransport,
} from "../src/journal/types.js";

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

type CursorRow = { journal_epoch: string; last_seq: number };

type FakeDb = {
  supabase: SupabaseClient;
  cursorReads: () => number;
  applies: () => number;
  /** 적용 RPC 를 멈춰 둔다(큐 상한 시나리오). */
  holdApplies: () => void;
};

function fakeDb(opts: { cursor?: CursorRow | null; cursorErrors?: number } = {}): FakeDb {
  let cursorReads = 0;
  let applies = 0;
  let hold = false;
  let cursorErrors = opts.cursorErrors ?? 0;
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            cursorReads += 1;
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
      if (fn !== "dma_journal_apply") return Promise.resolve({ data: null, error: { message: `unknown ${fn}` } });
      applies += 1;
      if (hold) return new Promise(() => undefined);
      const events = args.p_events as Array<{ seq: number }>;
      return Promise.resolve({
        data: { applied: events.length, skipped: 0, errors: [], last_seq: Math.max(...events.map((e) => e.seq)), rows: [] },
        error: null,
      });
    },
  } as unknown as SupabaseClient;
  return {
    supabase,
    cursorReads: () => cursorReads,
    applies: () => applies,
    holdApplies: () => {
      hold = true;
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
      ...over,
    },
  };
}

function batch(seqs: number[], headSeq: number, caughtUp: boolean): ObserverFrame {
  return { k: "batch", batch: { records: seqs.map(record), headSeq, caughtUp } };
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
  access: { replace: ReturnType<typeof vi.fn> };
  observer: JournalObserver;
  status: JournalStatus;
  frames: RelayJournalStateMsg[];
  deliverJournalState: ReturnType<typeof vi.fn>;
};

const rigs: Rig[] = [];

function rig(opts: { secret?: string | undefined; cursor?: CursorRow | null; cursorErrors?: number; maxQueue?: number } = {}): Rig {
  const transport = new FakeTransport();
  const codec = new FakeCodec();
  const db = fakeDb({ cursor: opts.cursor, cursorErrors: opts.cursorErrors });
  const writer = new JournalWriter({ supabase: db.supabase, gateway: GATEWAY, maxQueue: opts.maxQueue });
  const access = { replace: vi.fn() };
  const observer = new JournalObserver({
    secret: "secret" in opts ? opts.secret : SECRET,
    gateway: GATEWAY,
    codec,
    writer,
    access,
    transport,
    host: "127.0.0.1",
    port: 9100,
  });
  const status = new JournalStatus({ observer, writer });
  const frames: RelayJournalStateMsg[] = [];
  // 부팅 결선(19-10)과 같은 모양 — 상태 프레임 → fanout.deliverJournalState.
  const deliverJournalState = vi.fn((f: RelayJournalStateMsg) => frames.push(f));
  status.on("frame", (f) => deliverJournalState(f));
  const r = { transport, codec, db, writer, access, observer, status, frames, deliverJournalState };
  rigs.push(r);
  return r;
}

afterEach(() => {
  for (const r of rigs) {
    r.status.close();
    r.writer.close();
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
    expect(r.codec.logins).toEqual([{ secret: SECRET, sinceSeq: 0, epoch: "", client: OBSERVER_CLIENT_NAME }]);
    expect(OBSERVER_CLIENT_NAME).toBe("gh-radar-relay");
    expect(r.transport.sent).toHaveLength(1);
    expect(r.codec.built.has(r.transport.sent[0] as Uint8Array)).toBe(true);
    expect(r.observer.state).toBe("logging_in");
  });

  it("② 로그인 성공(epoch ep-1 · headSeq 1 · resync · 계좌 2행) → access.replace · beginEpoch · resetReconnectAttempts · replaying", async () => {
    const r = rig();
    const beginEpoch = vi.spyOn(r.writer, "beginEpoch");
    await bootToLogin(r);

    r.transport.frame(loginOk());

    expect(r.access.replace).toHaveBeenCalledTimes(1);
    expect(r.access.replace).toHaveBeenCalledWith(ACCOUNTS);
    expect(beginEpoch).toHaveBeenCalledWith("ep-1", { resync: true });
    expect(r.transport.resets).toBe(1);
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

    const app = createOrderApi({
      relayOrderSecret: "test-relay-order-secret-0123456789",
      appVersion: "test-sha",
      nodeEnv: "test",
      sessions: { stats: () => ({ sessionCount: 0, readyCount: 0, everReadyCount: 0, stalledCount: 0 }) },
      dmaHost: "127.0.0.1",
      networkInterfaces: () => ({
        lo: [{ address: "127.0.0.1", family: "IPv4", internal: true } as os.NetworkInterfaceInfo],
      }),
      journal: r.status,
    });
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    try {
      const { port } = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${port}/healthz`);
      expect(res.status).toBe(200);
      const text = await res.text();
      const body = JSON.parse(text) as { journal: Record<string, unknown> };
      expect(body.journal).toEqual({
        state: "live",
        lastSeq: 1,
        headSeq: 1,
        lagSeq: 0,
        disconnectedSec: null,
        lastAppliedAgeSec: expect.any(Number),
      });
      expect(text).not.toMatch(/"(accountNo|userId|account_no|user_id|dmaUserId)"/);
      expect(text).not.toContain("11112222");
      expect(text).not.toContain(SECRET);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
