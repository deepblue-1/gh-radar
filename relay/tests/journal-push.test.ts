/**
 * Phase 19 Plan 05 — 저널 레코드 → 기록기 → 적용 RPC → 반환 행 → 계좌 권한 사용자 푸시 (tracer).
 *
 * 검증 대상은 **신뢰 경계** T-19-02 다 — 저널 행은 사용자 데이터이고, 계좌 권한 밖으로 새면 타인 체결이
 * 노출된다. `fanout.test.ts` 하네스와 같은 형식으로 실제 ws 서버 · 실제 가짜 게이트웨이 · 실제
 * `SessionManager`/`SubscriptionHub` · 실제 `JournalAccess`/`JournalWriter` 를 쓰고, 가짜는 Supabase
 * (토큰·자격증명 조회 · 두 RPC) 뿐이다.
 *
 * 사용자 넷:
 *   A1 · A2 — 같은 DMA 계정 `dma-shared`(→ ACC1). 둘 다 같은 행을 받아야 한다.
 *   B       — `dma-other`(→ ACC2). ACC1 행은 0 프레임.
 *   U       — `dma_credentials` 미등록(unauthorized). 어떤 행도 0 프레임.
 *
 * ⑦ Phase 25 트레이서 — 실 TCP 관찰자(`DmaClient`) · 실 코덱 · 실 두 기록기로 80 전략 이벤트가 `journal.events` 가
 * 되는 경로. 기대값은 shared 픽스처(`packages/shared/src/__fixtures__/strategy-day.ts`) 원본 한 벌이다 — relay 는
 * NodeNext · rootDir 경계라 그 파일을 정적 import 할 수 없어 런타임 동적 import 로 읽는다(두 벌 금지).
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toJournalOrderRow } from "@gh-radar/shared";
import type {
  JournalOrderDbRow,
  JournalOrderRow,
  RelayJournalStateMsg,
  RelayOutbound,
  StrategyEventDbRow,
  StrategyEventRow,
} from "@gh-radar/shared";

import { WsFanout } from "../src/ws/fanout.js";
import { SubscriptionHub } from "../src/hub/subscription-hub.js";
import { SessionManager } from "../src/dma/session-manager.js";
import { encryptDmaPassword } from "../src/store/credentials.js";
import { resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { JournalAccess } from "../src/journal/access.js";
import { JournalWriter, toApplyEvent, type JournalApplyEvent } from "../src/journal/writer.js";
import type { GatewayIdentityView, JournalRecord, StrategyEventRecord } from "../src/journal/types.js";
import { JournalObserver } from "../src/journal/observer.js";
import { createJournalCodec } from "../src/journal/codec.js";
import { STRATEGY_APPLY_KEYS, createStrategyWriter, type StrategyApplyEvent } from "../src/journal/strategy-stream.js";
import { startFakeGateway, type FakeGateway } from "./helpers/fake-gateway.js";
import { connectWs, type TestWs } from "./helpers/ws-client.js";

const WS_PATH = "/ws";
const GATEWAY = "KB";
const EPOCH = "ep-1";

const USER_A1 = "5a1c2b7a-9d40-4a11-8e55-0000000000a1";
const USER_A2 = "5a1c2b7a-9d40-4a11-8e55-0000000000a2";
const USER_B = "5a1c2b7a-9d40-4a11-8e55-00000000000b";
const USER_U = "5a1c2b7a-9d40-4a11-8e55-00000000000f";

const ACC1 = "11112222-01";
const ACC2 = "33334444-01";
/** 매핑에 없는 계좌 — 기록은 되지만(D-11) 아무에게도 보이지 않는다. */
const ACC9 = "99990000-01";

const CRED_KEY = randomBytes(32).toString("base64");

const TOKENS = new Map<string, string>([
  ["token-a1", USER_A1],
  ["token-a2", USER_A2],
  ["token-b", USER_B],
  ["token-u", USER_U],
]);

type CredRow = { dma_user_id: string; dma_password_enc: string };

const CRED_ROWS = new Map<string, CredRow>([
  [USER_A1, { dma_user_id: "dma-shared", dma_password_enc: encryptDmaPassword("pw", USER_A1, CRED_KEY) }],
  [USER_A2, { dma_user_id: "dma-shared", dma_password_enc: encryptDmaPassword("pw", USER_A2, CRED_KEY) }],
  [USER_B, { dma_user_id: "dma-other", dma_password_enc: encryptDmaPassword("pw", USER_B, CRED_KEY) }],
]);

/** 토큰 검증 + `dma_credentials` 조회만 흉내 내는 fanout 용 스텁. */
function authSupabase(): SupabaseClient {
  return {
    auth: {
      getUser: (token: string) => {
        const userId = TOKENS.get(token);
        if (userId === undefined) {
          return Promise.resolve({ data: { user: null }, error: { message: "invalid JWT" } });
        }
        return Promise.resolve({ data: { user: { id: userId } }, error: null });
      },
    },
    from: () => ({
      select: () => ({
        eq: (_column: string, value: string) => ({
          maybeSingle: () => Promise.resolve({ data: CRED_ROWS.get(value) ?? null, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

type RpcCall = { fn: string; args: Record<string, unknown> };

/** 적용 RPC 가 전략 이벤트 1건을 공개 45키 행으로 되돌리는 가짜 — `dma_user_id` 를 빼고 게이트웨이 · epoch · 종목코드를 붙인다. */
function strategyDbRowOf(ev: StrategyApplyEvent, gateway: string, epoch: string): StrategyEventDbRow {
  const { dma_user_id: _dmaUserId, ...rest } = ev;
  void _dmaUserId;
  return { ...rest, gateway, journal_epoch: epoch, stock_code: ev.isin === "KR7005930003" ? "005930" : null };
}

/** 적용 RPC 가 이벤트 1건마다 공개 행 1건을 만들어 돌려주는 가짜. */
function dbRowOf(ev: JournalApplyEvent): JournalOrderDbRow {
  return {
    id: `row-${ev.seq}`,
    trade_date: ev.trade_date,
    account_no: ev.account_no,
    isin: ev.isin,
    stock_code: "005930",
    exchange: "KRX",
    board: null,
    side: "B",
    order_type: "N",
    org_order_no: null,
    qty: ev.order_qty,
    price: ev.order_price,
    order_no: ev.order_no,
    filled_qty: 0,
    modified_qty: 0,
    status: "accepted",
    result_code: 0,
    notice_type: ev.notice_type,
    message: null,
    origin: null,
    requester: null,
    request_kind: ev.request_kind,
    last_seq: String(ev.seq),
    created_at: "2026-09-25T00:00:00.000Z",
    updated_at: "2026-09-25T00:00:00.000Z",
  };
}

function rpcSupabase(calls: RpcCall[], opts: { failSync?: boolean } = {}): SupabaseClient {
  return {
    // 관찰자 기록기의 커서 조회(`dma_journal_cursor`) — 커서 없음. select 문자열을 기록한다(두 스트림 칸 구분).
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: () => ({
          maybeSingle: () => {
            calls.push({ fn: `from:${table}`, args: { select: columns } });
            return Promise.resolve({ data: null, error: null });
          },
        }),
      }),
    }),
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === "dma_journal_sync_access") {
        if (opts.failSync) {
          return Promise.resolve({ data: null, error: { code: "57P01", message: "terminating connection" } });
        }
        return Promise.resolve({ data: (args.p_rows as unknown[]).length, error: null });
      }
      if (fn === "dma_journal_apply") {
        const events = args.p_events as JournalApplyEvent[];
        return Promise.resolve({
          data: {
            applied: events.length,
            skipped: 0,
            errors: [],
            last_seq: Math.max(...events.map((e) => e.seq)),
            rows: events.map(dbRowOf),
          },
          error: null,
        });
      }
      if (fn === "dma_strategy_apply") {
        const events = args.p_events as StrategyApplyEvent[];
        return Promise.resolve({
          data: {
            applied: events.length,
            skipped: 0,
            errors: [],
            last_seq: Math.max(...events.map((e) => e.seq)),
            rows: events.map((e) => strategyDbRowOf(e, args.p_gateway as string, args.p_epoch as string)),
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: { message: `unknown rpc ${fn}` } });
    },
  } as unknown as SupabaseClient;
}

function record(seq: number, accountNo: string, dmaUserId = "dma-shared"): JournalRecord {
  return {
    seq,
    tradeDate: "2026-09-25",
    gwTimeMs: 1_790_000_000_000 + seq,
    dmaUserId,
    accountNo,
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

/** 19-01 `dma_journal_apply` 가 읽는 이벤트 키 23종. */
const APPLY_KEYS = [
  "seq",
  "trade_date",
  "gw_time_ms",
  "dma_user_id",
  "account_no",
  "isin",
  "side",
  "side_trusted",
  "order_no",
  "org_order_no",
  "notice_type",
  "request_kind",
  "requester",
  "origin",
  "exchange",
  "board",
  "order_price",
  "order_qty",
  "exec_price",
  "exec_qty",
  "result_code",
  "message",
  "local_reject",
].sort();

function eventFrames(inbox: RelayOutbound[]): StrategyEventRow[][] {
  return inbox
    .filter((m): m is Extract<RelayOutbound, { t: "journal.events" }> => m.t === "journal.events")
    .map((m) => m.rows);
}

type StrategyDayFixture = { STRATEGY_DAY_BY_NAME: Readonly<Record<string, StrategyEventRow>> };

/** shared 픽스처 원본을 런타임에 읽는다 (NodeNext · rootDir 경계 — 파일 머리 주석). */
async function loadStrategyDayFixture(): Promise<StrategyDayFixture> {
  const url = new URL("../../packages/shared/src/__fixtures__/strategy-day.ts", import.meta.url).href;
  return (await import(/* @vite-ignore */ url)) as StrategyDayFixture;
}

/** 공개 행 → 게이트웨이가 싣는 와이어 레코드 (공개 행에 없는 주문자만 더한다). */
function recordOf(row: StrategyEventRow, dmaUserId: string): StrategyEventRecord {
  const { gateway: _gateway, journalEpoch: _epoch, stockCode: _stockCode, ...wire } = row;
  void _gateway;
  void _epoch;
  void _stockCode;
  return { ...wire, dmaUserId };
}

function journalFrames(inbox: RelayOutbound[]): JournalOrderRow[][] {
  return inbox.filter((m): m is Extract<RelayOutbound, { t: "journal.rows" }> => m.t === "journal.rows").map((m) => m.rows);
}

/** 추가 게이트웨이 신원 연결의 가짜 뷰 (quick-260929-sas) — gh-radar user_id → 그 게이트웨이의 dma_user_id. */
function identityView(links: Readonly<Record<string, string>>): GatewayIdentityView {
  return { dmaUserIdOf: (userId) => links[userId] };
}

async function flushIo(turns = 4): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

async function waitFor(predicate: () => boolean, label: string, turns = 600): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    if (predicate()) return;
    await flushIo(1);
  }
  throw new Error(`조건이 서지 않았습니다: ${label}`);
}

describe("저널 푸시 — 레코드 → 기록기 → 적용 RPC → 계좌 권한 사용자", () => {
  let gateway: FakeGateway;
  let server: http.Server;
  let port: number;
  let hub: SubscriptionHub;
  let sessions: SessionManager;
  let fanout: WsFanout;
  let access: JournalAccess;
  let writer: JournalWriter;
  let rpcCalls: RpcCall[];
  const sockets: TestWs[] = [];

  async function start(opts: { failSync?: boolean; journalFrame?: () => RelayJournalStateMsg | null } = {}): Promise<void> {
    rpcCalls = [];
    server = http.createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    port = (server.address() as AddressInfo).port;
    hub = new SubscriptionHub();
    sessions = new SessionManager({ host: "127.0.0.1", port: gateway.port, broker: "KB" });
    const rpc = rpcSupabase(rpcCalls, opts);
    access = new JournalAccess({ supabase: rpc, gateway: GATEWAY, retryBaseMs: 10, retryMaxMs: 50 });
    writer = new JournalWriter({ supabase: rpc, gateway: GATEWAY });
    writer.beginEpoch(EPOCH, { resync: false, headSeq: 0 });
    fanout = new WsFanout({
      server,
      supabase: authSupabase(),
      sessions,
      hub,
      credKey: CRED_KEY,
      path: WS_PATH,
      journalAccess: access,
      ...(opts.journalFrame !== undefined ? { journalState: { frame: opts.journalFrame } } : {}),
    });
    // 부팅 결선과 같은 모양 — 기록기 적용 행 → fanout 계좌 권한 푸시.
    writer.on("applied", (rows) => fanout.deliverJournalRows(rows));
  }

  async function open(token: string, until: "ready" | "unauthorized"): Promise<RelayOutbound[]> {
    const ws = await connectWs(port, WS_PATH);
    sockets.push(ws);
    const inbox: RelayOutbound[] = [];
    ws.raw.on("message", (data) => inbox.push(JSON.parse(data.toString()) as RelayOutbound));
    ws.sendAuth(token);
    await waitFor(() => inbox.some((m) => m.t === "state" && m.s === until), `${token} ${until}`);
    return inbox;
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    resetDroppedEnvelopeCount();
    gateway = await startFakeGateway({ autoLogin: true, loginResp: { success: true } });
  });

  afterEach(async () => {
    for (const ws of sockets) await ws.close();
    sockets.length = 0;
    writer.close();
    access.close();
    await fanout.close();
    await sessions.closeAll();
    hub.closeAll();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await gateway.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function authAll(): Promise<{ a1: RelayOutbound[]; a2: RelayOutbound[]; b: RelayOutbound[]; u: RelayOutbound[] }> {
    const a1 = await open("token-a1", "ready");
    const a2 = await open("token-a2", "ready");
    const b = await open("token-b", "ready");
    const u = await open("token-u", "unauthorized");
    access.replace([
      { dmaUserId: "dma-shared", accountNo: ACC1, name: "공유 계좌", priority: 0 },
      { dmaUserId: "dma-other", accountNo: ACC2, name: "다른 계좌", priority: 0 },
    ]);
    return { a1, a2, b, u };
  }

  it("① 레코드 1건 → dma_journal_apply 1회(snake 23키) → A1·A2 각자 journal.rows 1프레임 · B·U 0프레임", async () => {
    await start();
    const { a1, a2, b, u } = await authAll();

    expect(writer.push([record(1, ACC1)])).toBe("ok");
    await waitFor(() => journalFrames(a1).length === 1 && journalFrames(a2).length === 1, "A1·A2 journal.rows");
    await flushIo(8);

    const applies = rpcCalls.filter((c) => c.fn === "dma_journal_apply");
    expect(applies).toHaveLength(1);
    expect(applies[0]?.args.p_gateway).toBe(GATEWAY);
    expect(applies[0]?.args.p_epoch).toBe(EPOCH);
    const events = applies[0]?.args.p_events as JournalApplyEvent[];
    expect(events).toHaveLength(1);
    expect(events[0]?.seq).toBe(1);
    expect(Object.keys(events[0] ?? {}).sort()).toEqual(APPLY_KEYS);
    expect(events[0]?.account_no).toBe(ACC1);
    expect(events[0]?.dma_user_id).toBe("dma-shared");

    // 같은 계정을 공유하는 두 사용자는 같은 행을 받는다.
    expect(journalFrames(a1)).toEqual([[expect.objectContaining({ id: "row-1", accountNo: ACC1, lastSeq: 1 })]]);
    expect(journalFrames(a2)).toEqual(journalFrames(a1));
    // 주문자 식별자는 프레임에 없다(T-19-08).
    expect(JSON.stringify(journalFrames(a1))).not.toContain("dma-shared");
    // 다른 계좌 사용자 · 자격증명 미등록 사용자는 0 프레임.
    expect(journalFrames(b)).toEqual([]);
    expect(journalFrames(u)).toEqual([]);
  });

  it("② deliverJournalRows([ACC1, ACC2]) → A1·A2 는 ACC1 행만 · B 는 ACC2 행만 · U 0", async () => {
    await start();
    const { a1, a2, b, u } = await authAll();
    const rows = [dbRowOf(toApplyEvent(record(10, ACC1))), dbRowOf(toApplyEvent(record(11, ACC2, "dma-other")))];

    fanout.deliverJournalRows(rows.map(toJournalOrderRow));
    await waitFor(
      () => journalFrames(a1).length === 1 && journalFrames(a2).length === 1 && journalFrames(b).length === 1,
      "A1·A2·B journal.rows",
    );
    await flushIo(8);

    expect(journalFrames(a1)).toEqual([[expect.objectContaining({ accountNo: ACC1 })]]);
    expect(journalFrames(a2)).toEqual([[expect.objectContaining({ accountNo: ACC1 })]]);
    expect(journalFrames(b)).toEqual([[expect.objectContaining({ accountNo: ACC2 })]]);
    expect(journalFrames(u)).toEqual([]);
  });

  it("③ 매핑에 없는 계좌(ACC9)도 적용 RPC 로 간다(D-11) · 그 행은 아무에게도 푸시되지 않는다", async () => {
    await start();
    const { a1, a2, b, u } = await authAll();

    expect(writer.push([record(1, ACC9, "dma-winforms")])).toBe("ok");
    // 뒤따르는 ACC1 레코드가 도착했다면 앞선 ACC9 배치의 푸시 기회는 이미 지나갔다(직렬 워커 · 소켓 순서).
    expect(writer.push([record(2, ACC1)])).toBe("ok");
    await waitFor(() => journalFrames(a1).length === 1 && journalFrames(a2).length === 1, "ACC1 푸시");
    await flushIo(8);

    const applied = rpcCalls
      .filter((c) => c.fn === "dma_journal_apply")
      .flatMap((c) => c.args.p_events as JournalApplyEvent[]);
    expect(applied.map((e) => e.account_no)).toContain(ACC9);

    for (const inbox of [a1, a2, b, u]) {
      for (const frame of journalFrames(inbox)) {
        expect(frame.map((r) => r.accountNo)).not.toContain(ACC9);
      }
    }
    expect(journalFrames(b)).toEqual([]);
    expect(journalFrames(u)).toEqual([]);
  });

  it("④ access.replace → dma_journal_sync_access p_rows 는 snake 4키 · RPC 실패해도 accountsOf 는 즉시 새 값", async () => {
    await start({ failSync: true });

    access.replace([
      { dmaUserId: "dma-shared", accountNo: ACC1, name: "공유 계좌", priority: 1 },
      { dmaUserId: "dma-shared", accountNo: ACC2, name: "둘째 계좌", priority: 2 },
    ]);
    // 메모리 라우팅은 동기로 교체된다 — RPC 결과를 기다리지 않는다.
    expect([...(access.accountsOf("dma-shared") ?? [])].sort()).toEqual([ACC1, ACC2].sort());
    expect(access.size).toBe(2);

    await flushIo(4);
    const syncs = rpcCalls.filter((c) => c.fn === "dma_journal_sync_access");
    expect(syncs).toHaveLength(1);
    expect(syncs[0]?.args.p_gateway).toBe(GATEWAY);
    const pRows = syncs[0]?.args.p_rows as Record<string, unknown>[];
    expect(pRows).toEqual([
      { dma_user_id: "dma-shared", account_no: ACC1, name: "공유 계좌", priority: 1 },
      { dma_user_id: "dma-shared", account_no: ACC2, name: "둘째 계좌", priority: 2 },
    ]);
    // 실패 뒤에도 메모리 값은 유효하다.
    expect(access.accountsOf("dma-shared")?.has(ACC1)).toBe(true);

    // 재시도 대기 중 새 스냅샷이 오면 최신 스냅샷만 보낸다.
    access.replace([{ dmaUserId: "dma-other", accountNo: ACC2, name: "다른 계좌", priority: 0 }]);
    expect(access.accountsOf("dma-shared")).toBeUndefined();
    await vi.advanceTimersByTimeAsync(10);
    await flushIo(4);
    const after = rpcCalls.filter((c) => c.fn === "dma_journal_sync_access");
    expect(after).toHaveLength(2);
    expect(after[1]?.args.p_rows).toEqual([
      { dma_user_id: "dma-other", account_no: ACC2, name: "다른 계좌", priority: 0 },
    ]);
  });

  it("⑤ journal.state (Phase 19-07 D-04 (a)) — 스냅샷은 알 때만 · deliverJournalState 는 인증 사용자 전원 · 미인증 0", async () => {
    let current: RelayJournalStateMsg | null = null;
    await start({ journalFrame: () => current });
    const stateFrames = (inbox: RelayOutbound[]): RelayOutbound[] => inbox.filter((m) => m.t === "journal.state");

    // 모르면(판정 전) 스냅샷을 보내지 않는다.
    const a1 = await open("token-a1", "ready");
    await flushIo(8);
    expect(stateFrames(a1)).toEqual([]);

    // 알게 된 뒤 인증한 연결은 스냅샷 1프레임을 받는다.
    current = { t: "journal.state", s: "live" };
    const b = await open("token-b", "ready");
    const u = await open("token-u", "unauthorized");
    await flushIo(8);
    expect(stateFrames(b)).toEqual([{ t: "journal.state", s: "live" }]);

    // 전이 프레임은 인증된 모든 사용자에게 간다 — 자격증명 미등록 연결은 대상이 아니다.
    const delayed: RelayJournalStateMsg = { t: "journal.state", s: "delayed", since: "2026-09-28T01:00:00.000Z" };
    fanout.deliverJournalState(delayed);
    await waitFor(() => stateFrames(a1).length === 1 && stateFrames(b).length === 2, "journal.state 전이");
    await flushIo(8);
    expect(stateFrames(a1)).toEqual([delayed]);
    expect(stateFrames(b)).toEqual([{ t: "journal.state", s: "live" }, delayed]);
    expect(stateFrames(u)).toEqual([]);
  });

  it("⑥ 추가 게이트웨이(KYOBO) 매핑 푸시 (quick-260929-c8e · 260929-sas 신원 연결) — 그 매핑으로만 거른다 · 인자 없으면 기존 매핑", async () => {
    await start();
    const { a1, a2, b, u } = await authAll();
    /** 가짜 교보 계좌 — 실계좌가 아니다(명백한 가짜값). */
    const KYOBO_ACC = "5555555501";
    const kyoboAccess = new JournalAccess({ supabase: rpcSupabase(rpcCalls), gateway: "KYOBO", retryBaseMs: 10, retryMaxMs: 50 });
    try {
      kyoboAccess.replace([{ dmaUserId: "dma-other", accountNo: KYOBO_ACC, name: "교보 가짜 계좌", priority: 0 }]);
      // quick-260929-sas — 추가 게이트웨이는 명시 신원 연결로만 잇는다(B → dma-other).
      const kyoboRoute = { access: kyoboAccess, identities: identityView({ [USER_B]: "dma-other" }) };

      // KYOBO 매핑의 계좌 행 → 그 dma_user_id(dma-other) 를 가진 B 만 받는다.
      const kyoboRow = dbRowOf(toApplyEvent(record(20, KYOBO_ACC, "dma-other")));
      fanout.deliverJournalRows([toJournalOrderRow(kyoboRow)], kyoboRoute);
      await waitFor(() => journalFrames(b).length === 1, "B KYOBO journal.rows");
      await flushIo(8);
      expect(journalFrames(b)).toEqual([[expect.objectContaining({ accountNo: KYOBO_ACC })]]);
      expect(journalFrames(a1)).toEqual([]);
      expect(journalFrames(a2)).toEqual([]);
      expect(journalFrames(u)).toEqual([]);

      // 같은 KYOBO 매핑으로 ACC1 행을 보내면 아무도 받지 않는다 — KB 매핑을 보지 않는다.
      const acc1Row = toJournalOrderRow(dbRowOf(toApplyEvent(record(21, ACC1))));
      fanout.deliverJournalRows([acc1Row], kyoboRoute);
      await flushIo(8);
      expect(journalFrames(a1)).toEqual([]);
      expect(journalFrames(a2)).toEqual([]);
      expect(journalFrames(b)).toHaveLength(1);

      // 인자 없이 같은 ACC1 행 → 기존(주 게이트웨이) 매핑으로 A1 · A2 가 받는다.
      fanout.deliverJournalRows([acc1Row]);
      await waitFor(() => journalFrames(a1).length === 1 && journalFrames(a2).length === 1, "A1·A2 ACC1 journal.rows");
      await flushIo(8);
      expect(journalFrames(a1)).toEqual([[expect.objectContaining({ accountNo: ACC1 })]]);
      expect(journalFrames(a2)).toEqual(journalFrames(a1));
      expect(journalFrames(b)).toHaveLength(1);
      expect(journalFrames(u)).toEqual([]);

      // KYOBO 매핑 동기화는 p_gateway KYOBO 로 간다(KB 와 섞이지 않는다).
      await flushIo(4);
      const kyoboSyncs = rpcCalls.filter((c) => c.fn === "dma_journal_sync_access" && c.args.p_gateway === "KYOBO");
      expect(kyoboSyncs).toHaveLength(1);
    } finally {
      kyoboAccess.close();
    }
  });
  it("⑦ Phase 25 트레이서 — 관찰자 80(전략 BuyOrder · LimitExposed) → 전략 기록기 → dma_strategy_apply → journal.events: A1·A2 둘 다 · B 시세만 · U 0", async () => {
    await start();
    const { STRATEGY_DAY_BY_NAME } = await loadStrategyDayFixture();
    const exposed = STRATEGY_DAY_BY_NAME.exposed;
    const buy = STRATEGY_DAY_BY_NAME.buy12451;
    if (exposed === undefined || buy === undefined) throw new Error("픽스처 exposed · buy12451 없음");

    // 사용자 접속만 — 계좌 매핑은 관찰자 로그인 응답이 채운다(실 경로).
    const a1 = await open("token-a1", "ready");
    const a2 = await open("token-a2", "ready");
    const b = await open("token-b", "ready");
    const u = await open("token-u", "unauthorized");

    // 구 게이트웨이와 같은 0/0/false 가 아니라 「전략 저널 있음 · 아직 0건」 이다 — 어느 쪽이든 since 0 · pending 없음.
    gateway.respondObserverLogin({
      broker: GATEWAY,
      epoch: buy.journalEpoch,
      headSeq: 0,
      oldestSeq: 0,
      resync: false,
      accounts: [
        { dmaUserId: "dma-shared", accountNo: buy.accountNo, name: "공유 계좌", priority: 0 },
        { dmaUserId: "dma-other", accountNo: ACC2, name: "다른 계좌", priority: 0 },
      ],
      strategyHeadSeq: 0,
      strategyOldestSeq: 0,
      strategyResync: false,
    });

    const db = rpcSupabase(rpcCalls);
    const orderWriter = new JournalWriter({ supabase: db, gateway: GATEWAY });
    const strategyWriter = createStrategyWriter({ supabase: db, gateway: GATEWAY });
    // 부팅 결선과 같은 모양 — 전략 기록기 적용 행 → fanout 전략 이벤트 푸시.
    strategyWriter.on("applied", (rows) => fanout.deliverStrategyEvents(rows));
    const observer = new JournalObserver({
      secret: "observer-secret-DO-NOT-LOG-25-01",
      gateway: GATEWAY,
      host: "127.0.0.1",
      port: gateway.port,
      codec: createJournalCodec(),
      writer: orderWriter,
      strategyWriter,
      access,
    });
    observer.start();
    try {
      const sock = await gateway.waitForObserverConnection(3_000);
      await waitFor(() => observer.state === "live", "관찰자 live");

      // 두 커서를 각자 칸으로 읽은 뒤에 로그인했다 · 로그인 요청 strategy since 0.
      const cursorSelects = rpcCalls
        .filter((c) => c.fn === "from:dma_journal_cursor")
        .map((c) => String(c.args.select).replace(/\s/g, ""))
        .sort();
      expect(cursorSelects).toEqual(["journal_epoch,last_seq", "strategy_journal_epoch,strategy_last_seq"]);
      expect(gateway.observerLoginRequests()).toHaveLength(1);
      expect(gateway.observerLoginRequests()[0]?.strategySinceSeq).toBe(0);

      gateway.pushJournalBatch(sock, {
        records: [],
        strategyEvents: [recordOf(exposed, ""), recordOf(buy, "dma-shared")],
        strategyHeadSeq: 2,
        strategyCaughtUp: true,
      });
      await waitFor(
        () => eventFrames(a1).length === 1 && eventFrames(a2).length === 1 && eventFrames(b).length === 1,
        "A1·A2·B journal.events",
      );
      await flushIo(8);

      // 적용 RPC 1회 · 입력 키 43종 = 와이어 필드명 · 주문자는 입력에만 있다.
      const applies = rpcCalls.filter((c) => c.fn === "dma_strategy_apply");
      expect(applies).toHaveLength(1);
      expect(applies[0]?.args.p_gateway).toBe(GATEWAY);
      expect(applies[0]?.args.p_epoch).toBe(buy.journalEpoch);
      const events = applies[0]?.args.p_events as StrategyApplyEvent[];
      expect(STRATEGY_APPLY_KEYS).toHaveLength(43);
      expect(Object.keys(events[0] ?? {}).sort()).toEqual([...STRATEGY_APPLY_KEYS].sort());
      expect(events.map((e) => e.seq)).toEqual([1, 2]);
      expect(events[1]?.dma_user_id).toBe("dma-shared");
      // 주문 0건 프레임은 주문 적용 RPC 를 부르지 않는다.
      expect(rpcCalls.filter((c) => c.fn === "dma_journal_apply")).toEqual([]);

      // 같은 계정의 두 사용자는 시세 + 자기 계좌 주문 이벤트를 받는다 — 행은 픽스처 원본과 같다.
      expect(eventFrames(a1)).toEqual([[exposed, buy]]);
      expect(eventFrames(a2)).toEqual(eventFrames(a1));
      // 다른 계좌 사용자는 시세 이벤트만 · 자격증명 없는 사용자는 0 프레임.
      expect(eventFrames(b)).toEqual([[exposed]]);
      expect(eventFrames(u)).toEqual([]);
      // 주문자 식별자는 프레임에 없다(T-19-08).
      expect(JSON.stringify(eventFrames(a1))).not.toContain("dma-shared");
    } finally {
      observer.stop();
      orderWriter.close();
      strategyWriter.close();
    }
  });
  it("⑧ 추가 게이트웨이 journal.rows 는 명시 신원 연결로만 (quick-260929-sas) — 같은 자격증명 문자열이라도 연결 없으면 0", async () => {
    await start();
    const { a1, a2, b, u } = await authAll();
    /** 가짜 교보 계좌 — 실계좌가 아니다(명백한 가짜값). */
    const K1 = "5555555511";
    const K2 = "5555555512";
    const K9 = "5555555599";
    const kyoboAccess = new JournalAccess({ supabase: rpcSupabase(rpcCalls), gateway: "KYOBO", retryBaseMs: 10, retryMaxMs: 50 });
    try {
      kyoboAccess.replace([
        { dmaUserId: "dma-shared", accountNo: K1, name: "교보 가짜 계좌 1", priority: 0 },
        { dmaUserId: "kyobo-b", accountNo: K2, name: "교보 가짜 계좌 2", priority: 0 },
      ]);
      // A1 만 dma-shared 로 연결 — A2 는 자격증명 문자열이 같은 dma-shared 지만 연결이 없다. B 는 자격증명(dma-other)과 다른 id.
      const route = {
        access: kyoboAccess,
        identities: identityView({ [USER_A1]: "dma-shared", [USER_B]: "kyobo-b" }),
      };

      // K1 행 → A1 만. A2 는 0(핵심 회귀 — 자격증명 문자열로 잇지 않는다).
      fanout.deliverJournalRows([toJournalOrderRow(dbRowOf(toApplyEvent(record(30, K1))))], route);
      await waitFor(() => journalFrames(a1).length === 1, "A1 K1 journal.rows");
      await flushIo(8);
      expect(journalFrames(a1)).toEqual([[expect.objectContaining({ accountNo: K1 })]]);
      expect(journalFrames(a2)).toEqual([]);
      expect(journalFrames(b)).toEqual([]);
      expect(journalFrames(u)).toEqual([]);

      // K2 행 → B 만(연결 id kyobo-b 의 매핑).
      fanout.deliverJournalRows([toJournalOrderRow(dbRowOf(toApplyEvent(record(31, K2, "kyobo-b"))))], route);
      await waitFor(() => journalFrames(b).length === 1, "B K2 journal.rows");
      await flushIo(8);
      expect(journalFrames(b)).toEqual([[expect.objectContaining({ accountNo: K2 })]]);
      expect(journalFrames(a1)).toHaveLength(1);
      expect(journalFrames(a2)).toEqual([]);

      // 누구에게도 매핑되지 않은 계좌 행 → 0.
      fanout.deliverJournalRows([toJournalOrderRow(dbRowOf(toApplyEvent(record(32, K9, "kyobo-x"))))], route);
      await flushIo(8);
      expect(journalFrames(a1)).toHaveLength(1);
      expect(journalFrames(a2)).toEqual([]);
      expect(journalFrames(b)).toHaveLength(1);
      expect(journalFrames(u)).toEqual([]);
    } finally {
      kyoboAccess.close();
    }
  });
  it("⑨ 추가 게이트웨이 journal.events 도 명시 신원 연결로만 (quick-260929-sas) — A1 시세 + 주문 · B 시세만 · A2 · U 0", async () => {
    await start();
    const { a1, a2, b, u } = await authAll();
    const { STRATEGY_DAY_BY_NAME } = await loadStrategyDayFixture();
    const exposed = STRATEGY_DAY_BY_NAME.exposed;
    const buy = STRATEGY_DAY_BY_NAME.buy12451;
    if (exposed === undefined || buy === undefined) throw new Error("픽스처 exposed · buy12451 없음");
    /** 가짜 교보 계좌 — 실계좌가 아니다(명백한 가짜값). */
    const K1 = "5555555511";
    const K2 = "5555555512";
    const kyoboAccess = new JournalAccess({ supabase: rpcSupabase(rpcCalls), gateway: "KYOBO", retryBaseMs: 10, retryMaxMs: 50 });
    try {
      kyoboAccess.replace([
        { dmaUserId: "dma-shared", accountNo: K1, name: "교보 가짜 계좌 1", priority: 0 },
        { dmaUserId: "kyobo-b", accountNo: K2, name: "교보 가짜 계좌 2", priority: 0 },
      ]);
      const route = {
        access: kyoboAccess,
        identities: identityView({ [USER_A1]: "dma-shared", [USER_B]: "kyobo-b" }),
      };
      const market: StrategyEventRow = { ...exposed, gateway: "KYOBO" };
      const order: StrategyEventRow = { ...buy, gateway: "KYOBO", accountNo: K1 };

      fanout.deliverStrategyEvents([market, order], route);
      await waitFor(() => eventFrames(a1).length === 1 && eventFrames(b).length === 1, "A1·B KYOBO journal.events");
      await flushIo(8);

      // A1 = 연결 신원 dma-shared → K1 주문 이벤트 + 시세.
      expect(eventFrames(a1)).toEqual([[market, order]]);
      // B = 연결 신원 kyobo-b(K2) → 시세만(K1 주문 이벤트는 남의 계좌).
      expect(eventFrames(b)).toEqual([[market]]);
      // A2 = 자격증명 문자열은 dma-shared 지만 KYOBO 연결 없음 → 0. U = 자격증명 없음 → 0.
      expect(eventFrames(a2)).toEqual([]);
      expect(eventFrames(u)).toEqual([]);
    } finally {
      kyoboAccess.close();
    }
  });
});
