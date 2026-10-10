/**
 * Phase 29-36 — G-1 ⑤ 주문 서버 변경 즉시 적용: 옛 서버 전략 끄기 → 재수립 → 25→66 재동기.
 *
 * gh-trade-84 ② 추가 확정(29-29-SUMMARY §후속): 주문 서버를 바꾸면 옛 서버에 남은 그 계좌의 활성 전략(상따 · VI · 자동매도)을
 * 꺼야 한다 — 경고로는 부족. 29-29 「G-1 운영 규칙」 의 「적용 시점 = 즉시 재접속」(사용자 확정 2026-10-10)이 D-10 「열린 세션은
 * 예전 서버 유지」 를 대체한다. 이 파일은 그 순서를 스텁 2대(KB120 · KB120 역할 · KB121) · 실 SessionManager · 실 StrategySweeper ·
 * 실 WsFanout · 실 SubscriptionHub · 실 지정 적재기(RPC 대역) 위에서 끝에서 끝으로 고정한다:
 *   지정 변경 → 적재기 changed → 옛 서버 세션에서 옮겨지는 계좌 전략 끄기(24 · 21 · 21 · 14 · 재조회) → 그 사용자 세션 drop ·
 *   wss 1012 → 재접속 인증 → 새 서버 세션 ready → 25(account_no "") → 66 → 그 계좌 주문은 새 서버로.
 * 끄기 미확인은 레지스터 · warn · 상태 프레임 계좌 `staleStrategies` 셋 다에 남는다(fail closed).
 *
 * 스텁 로그인 응답은 DMA id 별 계좌 목록이다(이 파일의 `loginAccounts` — 같은 스텁에 로그인한 사용자마다 자기 계좌만).
 * 25 를 받으면 그 연결 사용자의 계좌마다 66 스냅샷을 쓴다(실서버 「전 계좌 스냅샷」 흉내).
 *
 * 타이머 · 대기 규율은 `session-routing.test.ts` 와 같다(setTimeout 계열만 가짜 · setImmediate 는 진짜 · 조건 폴링).
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import type net from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as flatbuffers from "flatbuffers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RelayAccount, RelayOutbound, RelayStateMsg } from "@gh-radar/shared";

import { SESSION_GRACE_MS, SessionManager, type DmaCredentials, type SessionTarget } from "../src/dma/session-manager.js";
import { AccountOrderServers, createOrderServerRouting } from "../src/access/account-order-servers.js";
import { StaleStrategyRegister, StrategySweeper, type StrategySweepResult } from "../src/dma/strategy-sweeper.js";
import { EffectiveOwnerTracker } from "../src/dma/effective-owner-tracker.js";
import type { DmaServerRow } from "../src/registry/registry.js";
import { resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { MSG } from "../src/dma/msg-type.js";
import { Envelope } from "../src/generated/stock-dma/envelope.js";
import { WS_CLOSE_ORDER_SERVER_CHANGED, WsFanout } from "../src/ws/fanout.js";
import { SubscriptionHub } from "../src/hub/subscription-hub.js";
import type { SymbolInfo, SymbolLookup } from "../src/store/symbols.js";
import { readDisableStrategiesKey, startFakeGateway, type FakeGateway } from "./helpers/fake-gateway.js";
import {
  SAMPLE_ISIN,
  buildAccountStateFrame,
  buildLoginRespFrame,
  type FakeAccount,
  type FakeLimitChaserInput,
} from "./helpers/frames.js";
import { connectWs, type TestWs } from "./helpers/ws-client.js";

const D1 = "kb-resync-d1";
const D2 = "kb-resync-d2";
const D3 = "kb-resync-d3";
const U1 = "3f1c2b7a-9d40-4a11-8e55-0000000036a1";
const U2 = "3f1c2b7a-9d40-4a11-8e55-0000000036b2";
const U3 = "3f1c2b7a-9d40-4a11-8e55-0000000036c3";
const TOKENS: Record<string, string> = { "token-1": U1, "token-2": U2, "token-3": U3 };
const CREDS: Record<string, DmaCredentials> = {
  [U1]: { dmaUserId: D1, password: "pw-1-절대노출금지" },
  [U2]: { dmaUserId: D2, password: "pw-2-절대노출금지" },
  [U3]: { dmaUserId: D3, password: "pw-3-절대노출금지" },
};

const A = "1234567801";
const B = "1234567802";
const C = "1234567803";
const D = "2234567801";
const E = "3234567801";
const ISIN2 = "KR7000660001";
const ISIN3 = "KR7035420009";

const SYMBOLS: SymbolLookup = {
  lookup: (isin: string): SymbolInfo | undefined =>
    isin === SAMPLE_ISIN ? { code: "005930", name: "삼성전자", market: "K" } : undefined,
};

/** 전략 키 — relay `strategyKey` 와 같은 `isin:accountNo:exchange`. */
const keyOf = (isin: string, accountNo: string, exchange = "KRX") => `${isin}:${accountNo}:${exchange}`;

/** 켜진 상따 1건(매수 스위치만). */
function on(isin: string, accountNo: string): FakeLimitChaserInput {
  return { isin, accountNo, exchange: "KRX", buyEnabled: true };
}

/** 끄기 순서 단언에 쓰는 송신 msg_type — 조회 · 끄기 · 주문만(로그인 · 선언 · 핑 · 34 · 43 · 25 제외). */
const SWEEP_TYPES = new Set<number>([
  MSG.GetLimitChaserListReq,
  MSG.GetVITriggerReq,
  MSG.DisableStrategiesReq,
  MSG.SetVITriggerReq,
  MSG.DirectOrderReq,
]);

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

function envOf(payload: Buffer): Envelope {
  return Envelope.getRootAsEnvelope(
    new flatbuffers.ByteBuffer(new Uint8Array(payload.buffer, payload.byteOffset, payload.length)),
  );
}

function orderNew(accountNo: string, rid: string) {
  return {
    t: "order.new" as const,
    rid,
    isin: SAMPLE_ISIN,
    exchange: "KRX" as const,
    side: "B" as const,
    qty: 10,
    price: 70_000,
    accountNo,
  };
}

type Rx = { msgType: number; payload: Buffer };
type Tab = { ws: TestWs; inbox: RelayOutbound[] };

/** 계좌가 실린 마지막 ready 상태 프레임의 계좌. */
function readyAccounts(inbox: RelayOutbound[]): RelayAccount[] {
  const frames = inbox.filter(
    (f): f is RelayStateMsg => f.t === "state" && f.s === "ready" && (f.accounts?.length ?? 0) > 0,
  );
  return frames.at(-1)?.accounts ?? [];
}

function acctOf(accounts: RelayAccount[], accountNo: string): RelayAccount | undefined {
  return accounts.find((a) => a.accountNo === accountNo);
}

describe("G-1 주문 서버 변경 즉시 적용 — 옛 서버 전략 끄기 → 재수립 → 25→66 (29-36)", () => {
  const gateways: FakeGateway[] = [];
  const managers: SessionManager[] = [];
  const loaders: AccountOrderServers[] = [];
  const cleanups: Array<() => Promise<void>> = [];
  let kb120: FakeGateway;
  let kb121: FakeGateway;
  /** 서버 키 → 그 스텁이 받은 프레임. */
  let rx: Map<string, Rx[]>;
  /** 순서 단언용 — `${서버 키}:${msgType}` · `drop:${userId}`. */
  let events: string[];
  /** DMA id → 그 DMA id 로 로그인하면 스텁이 돌려줄 계좌. */
  let loginAccounts: Map<string, FakeAccount[]>;
  /** 25 를 받으면 66 을 쓰는가. */
  let autoAccountState: boolean;
  let rows: DmaServerRow[];
  let mappings: Map<string, Map<string, Set<string>>>;
  let chosenRows: Array<{ dma_user_id: string; broker: string; account_no: string; server_key: string }>;
  /** userId → 자격증명 공급자가 돌려줄 갈래. */
  let credMode: Map<string, "ok" | "null" | "not_ready" | "throw">;
  /** DMA id → 웹 user id (29-44 `AppAccess.userIdOf` 대역). */
  let dmaToUser: Map<string, string>;

  const supabase = {
    auth: {
      getUser: (token: string) =>
        Promise.resolve(
          TOKENS[token] !== undefined
            ? { data: { user: { id: TOKENS[token] } }, error: null }
            : { data: { user: null }, error: { message: "invalid JWT" } },
        ),
    },
    rpc: (name: string) =>
      Promise.resolve(
        name === "dma_account_order_servers"
          ? { data: chosenRows.map((r) => ({ ...r })), error: null }
          : { data: null, error: { message: `no rpc ${name}` } },
      ),
  } as unknown as SupabaseClient;

  const registry = {
    get: (key: string) => rows.find((r) => r.key === key),
    enabled: () => rows.filter((r) => r.enabled),
    orderServerOf: (broker: string) => rows.find((r) => r.broker === broker && r.isOrderServer && r.enabled),
  };

  function row(key: string, port: number, isOrderServer: boolean, sortOrder: number): DmaServerRow {
    return { key, broker: "KB", host: "127.0.0.1", port, enabled: true, isOrderServer, isQuotePrimary: false, sortOrder };
  }

  /** 스텁 1대 — DMA id 별 로그인 응답 · 25 → 계좌별 66 · 14 처리 · VI 거래소별 미등록. */
  async function stub(key: string): Promise<FakeGateway> {
    const gw = await startFakeGateway({ autoLogin: false });
    const userOf = new Map<net.Socket, string>();
    rx.set(key, []);
    gw.onFrame((msgType, payload, sock) => {
      rx.get(key)?.push({ msgType, payload: Buffer.from(payload) });
      events.push(`${key}:${msgType}`);
      if (msgType === MSG.DisableStrategiesReq) {
        events.push(`dk:${key}:${readDisableStrategiesKey(msgType, Buffer.from(payload)) ?? ""}`);
      }
      if (msgType === MSG.LoginReq) {
        const id = envOf(Buffer.from(payload)).loginReq()?.userId() ?? "";
        userOf.set(sock, id);
        gw.sendFrame(sock, buildLoginRespFrame({ success: true, accounts: loginAccounts.get(id) ?? [] }));
      }
      if (msgType === MSG.GetAccountStateReq && autoAccountState) {
        for (const a of loginAccounts.get(userOf.get(sock) ?? "") ?? []) {
          gw.sendFrame(sock, buildAccountStateFrame({ accountNo: a.accountNo, snapshot: true }));
        }
      }
    });
    gw.handleDisableStrategies({});
    gw.respondViTriggerFor("KRX", null);
    gw.respondViTriggerFor("NXT", null);
    gateways.push(gw);
    return gw;
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    resetDroppedEnvelopeCount();
    rx = new Map();
    events = [];
    autoAccountState = true;
    loginAccounts = new Map([
      [D1, [{ accountNo: A, name: "계좌A" }, { accountNo: B, name: "계좌B" }]],
      [D2, [{ accountNo: D, name: "계좌D" }]],
      [D3, [{ accountNo: E, name: "계좌E" }]],
    ]);
    kb120 = await stub("KB120");
    kb121 = await stub("KB121");
    rows = [row("KB120", kb120.port, true, 1), row("KB121", kb121.port, false, 2)];
    // 두 서버 users.toml 모두에 d1 의 A · B · d3 의 E 가 있다(gh-trade-84 ④). d2 는 KB120 에만.
    mappings = new Map([
      ["KB120", new Map([[D1, new Set([A, B])], [D2, new Set([D])], [D3, new Set([E])]])],
      ["KB121", new Map([[D1, new Set([A, B])], [D3, new Set([E])]])],
    ]);
    chosenRows = [];
    credMode = new Map();
    dmaToUser = new Map([
      [D1, U1],
      [D2, U2],
      [D3, U3],
    ]);
  });

  afterEach(async () => {
    for (const c of cleanups.splice(0).reverse()) await c();
    for (const l of loaders.splice(0)) l.close();
    for (const m of managers.splice(0)) await m.closeAll();
    for (const g of gateways.splice(0)) await g.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** 지정 적재기 · 라우팅 · 세션 관리자 · 실 sweeper · 레지스터 · fanout(운영 결선 모양) · 적재기 changed → resync. */
  async function harness(
    opts: {
      wrapSweeper?: (real: StrategySweeper) => Pick<StrategySweeper, "sweep">;
      /**
       * 29-44 — 운영 index 와 같은 결선: `EffectiveOwnerTracker`(전 사용자 유효 주문 서버) · `userIdOf` · 적재기 changed 에서
       * `resyncChangedUsers` **뒤** `tracker.refresh()` → `sweepMoved`.
       */
      tracker?: boolean;
    } = {},
  ) {
    const loader = new AccountOrderServers({ supabase });
    loaders.push(loader);
    loader.start();
    await loader.ready();
    const routing = createOrderServerRouting({
      loaded: () => loader.loaded,
      chosenOf: (dma, broker, acct) => loader.chosenOf(dma, broker, acct),
      registry,
      accountsOf: (serverKey, dma) => mappings.get(serverKey)?.get(dma),
    });
    const m = new SessionManager({ host: "127.0.0.1", port: 1, broker: "KB", ownerOf: routing.ownerOf });
    managers.push(m);
    const targetOf = (key: string): SessionTarget | undefined => {
      const r = registry.get(key);
      return r === undefined ? undefined : { serverKey: r.key, host: r.host, port: r.port, broker: r.broker };
    };
    const real = new StrategySweeper({ sessions: m, targetOf });
    const register = new StaleStrategyRegister();
    const tracker = opts.tracker
      ? new EffectiveOwnerTracker({
          ready: () => loader.loaded,
          dmaUserIds: () => {
            const out = new Set<string>();
            for (const byDma of mappings.values()) for (const d of byDma.keys()) out.add(d);
            return out;
          },
          accountsOf: (serverKey, dma) => mappings.get(serverKey)?.get(dma),
          servers: () => registry.enabled().map((r) => ({ key: r.key, broker: r.broker })),
          effectiveOrderServer: routing.effectiveOrderServer,
        })
      : undefined;
    tracker?.refresh();

    const server = http.createServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as AddressInfo).port;
    const hub = new SubscriptionHub();
    const fanout = new WsFanout({
      server,
      supabase,
      sessions: m,
      hub,
      credKey: "unused-with-credentials-dep",
      path: "/ws",
      symbols: SYMBOLS,
      serversFor: routing.serversFor,
      credentials: async (userId) => {
        const mode = credMode.get(userId) ?? "ok";
        if (mode === "throw") throw new Error("credential lookup boom");
        if (mode === "null") return null;
        if (mode === "not_ready") return "not_ready";
        return CREDS[userId] ?? null;
      },
      sweeper: opts.wrapSweeper?.(real) ?? real,
      staleStrategies: register,
      ...(tracker !== undefined ? { owners: tracker, userIdOf: (dma: string) => dmaToUser.get(dma) } : {}),
    });
    loader.on("changed", () => {
      void fanout.resyncChangedUsers("account-order-server");
      const moves = tracker?.refresh() ?? [];
      if (moves.length > 0) void fanout.sweepMoved(moves, "account-order-server");
    });
    const sockets: TestWs[] = [];
    async function open(token: string): Promise<Tab> {
      const ws = await connectWs(port, "/ws");
      sockets.push(ws);
      const inbox: RelayOutbound[] = [];
      ws.raw.on("message", (data) => inbox.push(JSON.parse(data.toString()) as RelayOutbound));
      ws.sendAuth(token);
      return { ws, inbox };
    }
    cleanups.push(async () => {
      for (const ws of sockets.splice(0)) await ws.close();
      await fanout.close();
      hub.closeAll();
      await new Promise<void>((r) => server.close(() => r()));
    });
    return { loader, routing, m, fanout, register, open, tracker };
  }

  function mark(key: string): number {
    return rx.get(key)?.length ?? 0;
  }

  function since(key: string, from: number): Rx[] {
    return (rx.get(key) ?? []).slice(from);
  }

  function count(key: string, msgType: number, from = 0): number {
    return since(key, from).filter((r) => r.msgType === msgType).length;
  }

  function disabledKeys(key: string, from: number): string[] {
    return since(key, from)
      .filter((r) => r.msgType === MSG.DisableStrategiesReq)
      .map((r) => readDisableStrategiesKey(r.msgType, r.payload) ?? "<none>");
  }

  function orderAccounts(key: string, from = 0): string[] {
    return since(key, from)
      .filter((r) => r.msgType === MSG.DirectOrderReq)
      .map((r) => envOf(r.payload).directOrderReq()?.accountNo() ?? "");
  }

  /** `dropUser` 호출을 순서 로그에 남긴다(원래 동작 그대로). */
  function traceDrop(m: SessionManager) {
    const orig = m.dropUser.bind(m);
    return vi.spyOn(m, "dropUser").mockImplementation((userId: string, reason: string) => {
      events.push(`drop:${userId}`);
      return orig(userId, reason);
    });
  }

  /** 그 사용자 세션 전부 ready 이고 브라우저가 계좌 n 개 ready 프레임을 받을 때까지. */
  async function readyTab(h: Awaited<ReturnType<typeof harness>>, tab: Tab, userId: string, accounts: number, label: string) {
    await waitFor(
      () =>
        h.m.sessionsOf(userId).length > 0 &&
        h.m.sessionsOf(userId).every((s) => s.isReady) &&
        readyAccounts(tab.inbox).length === accounts,
      label,
    );
    // hub Ready 프리페치(24 · 21 · 34 · 25 · 43)가 다 오가게 둔다.
    await flushIo(20);
  }

  async function captureLogs() {
    const { logger } = await import("../src/logger.js");
    const warns: unknown[][] = [];
    const infos: unknown[][] = [];
    vi.spyOn(logger, "warn").mockImplementation(((...args: unknown[]) => {
      warns.push(args);
    }) as never);
    vi.spyOn(logger, "info").mockImplementation(((...args: unknown[]) => {
      infos.push(args);
    }) as never);
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
    return { warns, infos };
  }

  function msgOf(call: unknown[]): string {
    return typeof call[1] === "string" ? call[1] : "";
  }

  it("① 트레이서 — A → KB121 지정 → KB120 에서 A 전략만 끄기(24 · 21 · 21 · 14 · 재조회) 뒤 u1 두 탭 1012 · KB120 세션 즉시 종료 · u2 무영향 → 재접속 → KB120(B) · KB121(A) ready → 25 각 1 → 66 → A 주문은 KB121 에만", async () => {
    const logs = await captureLogs();
    kb120.respondLimitChaserList([on(SAMPLE_ISIN, A), on(ISIN2, B), on(ISIN3, D)]);
    const h = await harness();
    const tab1 = await h.open("token-1");
    const tab2 = await h.open("token-1");
    const other = await h.open("token-2");
    await readyTab(h, tab1, U1, 2, "u1 탭1 ready(A · B)");
    await readyTab(h, tab2, U1, 2, "u1 탭2 ready(A · B)");
    await readyTab(h, other, U2, 1, "u2 ready(D)");
    expect(h.m.sessionsOf(U1).map((s) => s.serverKey)).toEqual(["KB120"]);
    const drop = traceDrop(h.m);
    const from120 = mark("KB120");
    const fromEvents = events.length;
    const logins120 = count("KB120", MSG.LoginReq);

    chosenRows = [{ dma_user_id: D1, broker: "KB", account_no: A, server_key: "KB121" }];
    await h.loader.reload();
    await waitFor(() => tab1.ws.closeInfo !== null && tab2.ws.closeInfo !== null, "u1 두 탭 close");

    // 순서 — 끄기(24 · 21 · 21 · 14 · 재조회 24 · 21 · 21)가 세션 drop · 1012 보다 먼저.
    const order = events
      .slice(fromEvents)
      .filter((e) => e.startsWith("drop:") || (e.startsWith("KB120:") && SWEEP_TYPES.has(Number(e.slice(6)))));
    const t = (n: number) => `KB120:${n}`;
    expect(order).toEqual([
      t(MSG.GetLimitChaserListReq),
      t(MSG.GetVITriggerReq),
      t(MSG.GetVITriggerReq),
      t(MSG.DisableStrategiesReq),
      t(MSG.GetLimitChaserListReq),
      t(MSG.GetVITriggerReq),
      t(MSG.GetVITriggerReq),
      `drop:${U1}`,
    ]);
    // 14 는 A 의 키 하나뿐 — 같은 서버에 남는 B · 다른 사용자 D 는 그대로 켜져 있다.
    expect(disabledKeys("KB120", from120)).toEqual([keyOf(SAMPLE_ISIN, A)]);
    expect(kb120.limitChaserSeed().filter((c) => c.buyEnabled).map((c) => c.accountNo)).toEqual([B, D]);
    expect(orderAccounts("KB120", from120)).toEqual([]);
    expect(tab1.ws.closeInfo?.code).toBe(WS_CLOSE_ORDER_SERVER_CHANGED);
    expect(tab2.ws.closeInfo?.code).toBe(1012);
    // 끄기는 기존 세션으로(재로그인 0) · 그 뒤 u1 세션은 유예 없이 사라졌다.
    expect(count("KB120", MSG.LoginReq)).toBe(logins120);
    expect(drop).toHaveBeenCalledTimes(1);
    expect(h.m.sessionsOf(U1)).toEqual([]);
    expect(h.register.all()).toEqual([]);
    // u2 는 아무 일 없음.
    expect(other.ws.closeInfo).toBeNull();
    expect(h.m.sessionsOf(U2).map((s) => s.serverKey)).toEqual(["KB120"]);
    // 지워진 세션을 close 경로가 release 하며 warn 을 쏟지 않는다.
    await flushIo(10);
    expect(logs.warns.filter((c) => msgOf(c).includes("세션 없는 release"))).toEqual([]);

    // 재접속 — 새 규칙으로 KB120(B 소유) · KB121(A 소유) 두 세션 · ready 마다 25 → 66.
    const r120 = mark("KB120");
    const r121 = mark("KB121");
    const again = await h.open("token-1");
    await readyTab(h, again, U1, 2, "재접속 ready(A · B)");
    const byServer = new Map(h.m.sessionsOf(U1).map((s) => [s.serverKey, s]));
    expect([...byServer.keys()]).toEqual(["KB120", "KB121"]);
    expect(byServer.get("KB120")?.allowedAccounts.map((a) => a.accountNo)).toEqual([B]);
    expect(byServer.get("KB121")?.allowedAccounts.map((a) => a.accountNo)).toEqual([A]);
    await waitFor(() => count("KB120", MSG.GetAccountStateReq, r120) >= 1 && count("KB121", MSG.GetAccountStateReq, r121) >= 1, "25 각 1");
    await waitFor(
      () => again.inbox.some((f) => f.t === "acct" && f.a === A) && again.inbox.some((f) => f.t === "acct" && f.a === B),
      "66 스냅샷(A · B)",
    );
    await flushIo(10);
    expect(count("KB120", MSG.GetAccountStateReq, r120)).toBe(1);
    expect(count("KB121", MSG.GetAccountStateReq, r121)).toBe(1);
    expect(acctOf(readyAccounts(again.inbox), A)?.staleStrategies).toBeUndefined();

    again.ws.sendRaw(orderNew(A, "rid-a"));
    await waitFor(() => orderAccounts("KB121", r121).length === 1, "KB121 스텁 DirectOrderReq(A)");
    expect(orderAccounts("KB121", r121)).toEqual([A]);
    expect(orderAccounts("KB120", r120)).toEqual([]);

    // 같은 지정으로 다시 적재 · 재판정 → 재수립 0 · sweep 0.
    const r3 = mark("KB120");
    await h.loader.reload();
    expect(await h.fanout.resyncChangedUsers("test-noop")).toBe(0);
    await flushIo(10);
    expect(count("KB120", MSG.GetLimitChaserListReq, r3)).toBe(0);
    expect(count("KB120", MSG.DisableStrategiesReq, r3)).toBe(0);
    expect(again.ws.closeInfo).toBeNull();
    expect(drop).toHaveBeenCalledTimes(1);
  });

  it("② 끄기 미확인(65 안 옴 → 단계 시한) — warn 1줄(계좌 · DMA id 없음) · 레지스터 timeout · 그래도 1012 · 재접속 뒤 상태 프레임 A 에 staleStrategies { KB120, 1 } · B 에는 없음", async () => {
    const logs = await captureLogs();
    kb120.respondLimitChaserList([on(SAMPLE_ISIN, A), on(ISIN2, B)]);
    kb120.handleDisableStrategies({ respond65: false });
    const h = await harness();
    const tab = await h.open("token-1");
    await readyTab(h, tab, U1, 2, "u1 ready");
    const from120 = mark("KB120");

    chosenRows = [{ dma_user_id: D1, broker: "KB", account_no: A, server_key: "KB121" }];
    await h.loader.reload();
    await waitFor(() => disabledKeys("KB120", from120).length === 1, "14 송신");
    await flushIo(10);
    expect(tab.ws.closeInfo).toBeNull();
    vi.advanceTimersByTime(5_000);
    await waitFor(() => tab.ws.closeInfo !== null, "미확인이어도 1012");
    expect(tab.ws.closeInfo?.code).toBe(1012);

    const stale = logs.warns.filter((c) => msgOf(c).includes("옛 서버 KB120 활성 전략 1건 — 끄지 못함"));
    expect(stale).toHaveLength(1);
    const dumped = JSON.stringify(stale);
    for (const secret of [A, B, D1, keyOf(SAMPLE_ISIN, A)]) expect(dumped).not.toContain(secret);
    expect(h.register.all()).toEqual([
      expect.objectContaining({ userId: U1, dmaUserId: D1, serverKey: "KB120", accountNo: A, remaining: 1, reason: "timeout" }),
    ]);

    const again = await h.open("token-1");
    await readyTab(h, again, U1, 2, "재접속 ready");
    const accounts = readyAccounts(again.inbox);
    expect(acctOf(accounts, A)?.staleStrategies).toEqual({ serverKey: "KB120", count: 1 });
    expect(acctOf(accounts, B)?.staleStrategies).toBeUndefined();
  });

  it("③ 소유자 없음 전이 — A 지정 KB121 인데 KB121 매핑에 A 없음 → KB120 에서 A 끄기 1회(B 키 0) · 재접속 뒤 A 는 어느 세션도 소유하지 않는다(fail closed)", async () => {
    await captureLogs();
    mappings.get("KB121")?.set(D1, new Set([B]));
    kb120.respondLimitChaserList([on(SAMPLE_ISIN, A), on(ISIN2, B)]);
    const h = await harness();
    const tab = await h.open("token-1");
    await readyTab(h, tab, U1, 2, "u1 ready");
    const from120 = mark("KB120");

    chosenRows = [{ dma_user_id: D1, broker: "KB", account_no: A, server_key: "KB121" }];
    await h.loader.reload();
    await waitFor(() => tab.ws.closeInfo !== null, "1012");
    expect(disabledKeys("KB120", from120)).toEqual([keyOf(SAMPLE_ISIN, A)]);
    expect(h.register.all()).toEqual([]);

    const again = await h.open("token-1");
    await readyTab(h, again, U1, 1, "재접속 ready(B)");
    expect(h.m.sessionsOf(U1).map((s) => s.serverKey)).toEqual(["KB120"]);
    expect(kb121.sockets).toHaveLength(0);
    expect(h.m.sessionsOf(U1)[0]?.allowedAccounts.map((a) => a.accountNo)).toEqual([B]);
    expect(h.m.forAccount(U1, A)).toBeUndefined();
    expect(kb120.limitChaserSeed().filter((c) => c.buyEnabled).map((c) => c.accountNo)).toEqual([B]);
  });

  it("④ 연달아 두 번(체커 W3) — 앞 sweep 진행 중 두 번째 변경은 기다린다(세션 생존 · close 0 · dropUser 0) → 풀면 앞 sweep ok · dropUser 1 · 1012 → 두 번째는 연결 없는 u1 에 0", async () => {
    await captureLogs();
    loginAccounts.set(D1, [
      { accountNo: A, name: "계좌A" },
      { accountNo: B, name: "계좌B" },
      { accountNo: C, name: "계좌C" },
    ]);
    mappings.get("KB120")?.set(D1, new Set([A, B, C]));
    mappings.get("KB121")?.set(D1, new Set([A, B, C]));
    kb120.respondLimitChaserList([on(SAMPLE_ISIN, A), on(ISIN2, B), on(ISIN3, C)]);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let held = 0;
    const h = await harness({
      wrapSweeper: (real) => ({
        sweep: async (target, creds) => {
          held += 1;
          await gate;
          return real.sweep(target, creds);
        },
      }),
    });
    const tab = await h.open("token-1");
    await readyTab(h, tab, U1, 3, "u1 ready(A · B · C)");
    const drop = traceDrop(h.m);
    const kb120Session = h.m.sessionsOf(U1)[0];
    const from120 = mark("KB120");

    chosenRows = [{ dma_user_id: D1, broker: "KB", account_no: A, server_key: "KB121" }];
    await h.loader.reload();
    await waitFor(() => held === 1, "첫 sweep 진입(지연 래퍼가 쥠)");
    chosenRows = [
      { dma_user_id: D1, broker: "KB", account_no: A, server_key: "KB121" },
      { dma_user_id: D1, broker: "KB", account_no: C, server_key: "KB121" },
    ];
    await h.loader.reload();
    await flushIo(20);
    // 두 번째 변경은 앞 재수립 뒤에 줄 선다 — 진행 중 sweep 의 세션을 닫지 않는다.
    expect(h.m.sessionsOf(U1)).toEqual([kb120Session]);
    expect(kb120Session?.isReady).toBe(true);
    expect(tab.ws.closeInfo).toBeNull();
    expect(drop).not.toHaveBeenCalled();
    expect(held).toBe(1);

    release();
    await waitFor(() => tab.ws.closeInfo !== null, "앞 재수립 1012");
    await flushIo(20);
    expect(h.register.all()).toEqual([]);
    expect(disabledKeys("KB120", from120)).toEqual([keyOf(SAMPLE_ISIN, A)]);
    expect(drop).toHaveBeenCalledTimes(1);
    expect(held).toBe(1);

    // 재접속 인증은 최신 지정(A · C → KB121)으로 연다.
    const again = await h.open("token-1");
    await readyTab(h, again, U1, 3, "재접속 ready");
    const byServer = new Map(h.m.sessionsOf(U1).map((s) => [s.serverKey, s]));
    expect(byServer.get("KB120")?.allowedAccounts.map((a) => a.accountNo)).toEqual([B]);
    expect(byServer.get("KB121")?.allowedAccounts.map((a) => a.accountNo)).toEqual([A, C]);
  });

  it.each(["null", "not_ready", "throw"] as const)(
    "⑤ 자격증명 %s → sweep 0 · 레지스터 no-session(count null) · warn 1줄(계좌 · DMA id 없음) · 그래도 1012 · 재접속 뒤 A staleStrategies { KB120, null }",
    async (mode) => {
      const logs = await captureLogs();
      kb120.respondLimitChaserList([on(SAMPLE_ISIN, A), on(ISIN2, B)]);
      let sweeps = 0;
      const h = await harness({
        wrapSweeper: (real) => ({
          sweep: (target, creds) => {
            sweeps += 1;
            return real.sweep(target, creds);
          },
        }),
      });
      const tab = await h.open("token-1");
      await readyTab(h, tab, U1, 2, "u1 ready");
      const from120 = mark("KB120");

      credMode.set(U1, mode);
      chosenRows = [{ dma_user_id: D1, broker: "KB", account_no: A, server_key: "KB121" }];
      await h.loader.reload();
      await waitFor(() => tab.ws.closeInfo !== null, "1012");
      expect(tab.ws.closeInfo?.code).toBe(1012);
      expect(sweeps).toBe(0);
      expect(count("KB120", MSG.DisableStrategiesReq, from120)).toBe(0);
      expect(h.register.all()).toEqual([
        expect.objectContaining({ userId: U1, dmaUserId: D1, serverKey: "KB120", accountNo: A, remaining: null, reason: "no-session" }),
      ]);
      const stale = logs.warns.filter((c) => msgOf(c).includes("옛 서버 KB120 활성 전략") && msgOf(c).includes("끄지 못함"));
      expect(stale).toHaveLength(1);
      const dumped = JSON.stringify(stale);
      for (const secret of [A, B, D1]) expect(dumped).not.toContain(secret);

      credMode.set(U1, "ok");
      const again = await h.open("token-1");
      await readyTab(h, again, U1, 2, "재접속 ready");
      expect(acctOf(readyAccounts(again.inbox), A)?.staleStrategies).toEqual({ serverKey: "KB120", count: null });
      expect(acctOf(readyAccounts(again.inbox), B)?.staleStrategies).toBeUndefined();
    },
  );

  it("⑥ 증권사 기본 주문 서버 KB120 → KB121 — 지정 없는 u1 · u2 는 각자 계좌 전략만 KB120 에서 끈 뒤 1012 · 전부 KB121 지정인 u3 은 0 · 재접속 뒤 u1 = KB121 세션 · ready → 25 → 66", async () => {
    await captureLogs();
    chosenRows = [{ dma_user_id: D3, broker: "KB", account_no: E, server_key: "KB121" }];
    kb120.respondLimitChaserList([on(SAMPLE_ISIN, A), on(ISIN3, D)]);
    const h = await harness();
    const t1 = await h.open("token-1");
    const t2 = await h.open("token-2");
    const t3 = await h.open("token-3");
    await readyTab(h, t1, U1, 2, "u1 ready");
    await readyTab(h, t2, U2, 1, "u2 ready");
    await readyTab(h, t3, U3, 1, "u3 ready");
    expect(h.m.sessionsOf(U3).map((s) => s.serverKey)).toEqual(["KB121"]);
    const drop = traceDrop(h.m);
    const fromEvents = events.length;
    const from120 = mark("KB120");

    // /admin/servers 에서 KB 기본 주문 서버를 KB121 로(레지스트리 changed → resyncChangedUsers("registry")).
    rows = rows.map((r) => ({ ...r, isOrderServer: r.key === "KB121" }));
    expect(await h.fanout.resyncChangedUsers("registry")).toBe(2);
    await waitFor(() => t1.ws.closeInfo !== null && t2.ws.closeInfo !== null, "u1 · u2 1012");
    expect(t1.ws.closeInfo?.code).toBe(1012);
    expect(t2.ws.closeInfo?.code).toBe(1012);
    expect(t3.ws.closeInfo).toBeNull();
    expect(drop).toHaveBeenCalledTimes(2);
    // 각자 계좌 키만 · 각자의 끄기가 각자의 drop 보다 먼저.
    expect(disabledKeys("KB120", from120).sort()).toEqual([keyOf(SAMPLE_ISIN, A), keyOf(ISIN3, D)].sort());
    const ev = events.slice(fromEvents);
    expect(ev.indexOf(`dk:KB120:${keyOf(SAMPLE_ISIN, A)}`)).toBeGreaterThanOrEqual(0);
    expect(ev.indexOf(`dk:KB120:${keyOf(SAMPLE_ISIN, A)}`)).toBeLessThan(ev.indexOf(`drop:${U1}`));
    expect(ev.indexOf(`dk:KB120:${keyOf(ISIN3, D)}`)).toBeGreaterThanOrEqual(0);
    expect(ev.indexOf(`dk:KB120:${keyOf(ISIN3, D)}`)).toBeLessThan(ev.indexOf(`drop:${U2}`));
    expect(h.register.all()).toEqual([]);
    expect(h.m.sessionsOf(U3).map((s) => s.serverKey)).toEqual(["KB121"]);

    const r121 = mark("KB121");
    const again = await h.open("token-1");
    await readyTab(h, again, U1, 2, "재접속 ready");
    expect(h.m.sessionsOf(U1).map((s) => s.serverKey)).toEqual(["KB121"]);
    await waitFor(() => again.inbox.some((f) => f.t === "acct" && f.a === A), "66 스냅샷(A)");
    expect(count("KB121", MSG.GetAccountStateReq, r121)).toBe(1);
    expect(readyAccounts(again.inbox).map((a) => a.serverKey)).toEqual(["KB121", "KB121"]);
  });

  it("⑦ 레지스트리 변경이 주소 · 안 쓰는 서버 끄기뿐이면 서명이 같다 — 재수립 0 · sweep 0", async () => {
    await captureLogs();
    kb120.respondLimitChaserList([on(SAMPLE_ISIN, A)]);
    const h = await harness();
    const tab = await h.open("token-1");
    await readyTab(h, tab, U1, 2, "u1 ready");
    const from120 = mark("KB120");

    rows = rows.map((r) => (r.key === "KB120" ? { ...r, host: "127.0.0.1", sortOrder: 9 } : { ...r, enabled: false }));
    expect(await h.fanout.resyncChangedUsers("registry")).toBe(0);
    await flushIo(10);
    expect(count("KB120", MSG.GetLimitChaserListReq, from120)).toBe(0);
    expect(tab.ws.closeInfo).toBeNull();
  });

  it("⑧ 상태 프레임 계좌 serverKey · movedFrom — 옮겨진 A 만 movedFrom · 단일 세션 사용자도 serverKey · 탭을 닫고 다시 열어도(세션 재사용) 유지 · 다음 재수립이 교체 · 세션 전부 소멸하면 사라짐", async () => {
    await captureLogs();
    const h = await harness();
    const tab = await h.open("token-1");
    const other = await h.open("token-2");
    await readyTab(h, tab, U1, 2, "u1 ready");
    await readyTab(h, other, U2, 1, "u2 ready");
    // 재수립 전 — 단일 세션도 계좌마다 그 세션 서버 키 · movedFrom 없음.
    expect(readyAccounts(tab.inbox)).toEqual([
      { accountNo: A, name: "계좌A", serverKey: "KB120" },
      { accountNo: B, name: "계좌B", serverKey: "KB120" },
    ]);
    expect(readyAccounts(other.inbox)).toEqual([{ accountNo: D, name: "계좌D", serverKey: "KB120" }]);

    chosenRows = [{ dma_user_id: D1, broker: "KB", account_no: A, server_key: "KB121" }];
    await h.loader.reload();
    await waitFor(() => tab.ws.closeInfo !== null, "1012");
    const again = await h.open("token-1");
    await readyTab(h, again, U1, 2, "재접속 ready");
    const moved = [
      { accountNo: B, name: "계좌B", serverKey: "KB120" },
      { accountNo: A, name: "계좌A", serverKey: "KB121", movedFrom: "KB120" },
    ];
    expect(readyAccounts(again.inbox)).toEqual(moved);

    // 탭을 닫고 유예 안에 다시 연다(같은 세션 재사용) — movedFrom 유지.
    await again.ws.close();
    await waitFor(() => h.m.sessionsOf(U1).length === 2, "유예 중");
    const reopened = await h.open("token-1");
    await readyTab(h, reopened, U1, 2, "다시 열기 ready");
    expect(readyAccounts(reopened.inbox)).toEqual(moved);

    // 다음 재수립(A 지정 해제 → 기본 KB120)이 교체한다 — 이번에 옮겨진 A 는 KB121 에서 왔다.
    chosenRows = [];
    await h.loader.reload();
    await waitFor(() => reopened.ws.closeInfo !== null, "두 번째 1012");
    const third = await h.open("token-1");
    await readyTab(h, third, U1, 2, "셋째 ready");
    expect(readyAccounts(third.inbox)).toEqual([
      { accountNo: A, name: "계좌A", serverKey: "KB120", movedFrom: "KB121" },
      { accountNo: B, name: "계좌B", serverKey: "KB120" },
    ]);

    // 탭을 닫고 유예가 끝나 세션이 전부 소멸하면 movedFrom 도 사라진다.
    await third.ws.close();
    // 서버 쪽 close 경로(release → 유예 예약)가 돈 뒤에 시계를 민다.
    await waitFor(() => !h.fanout.connectedUsers().some((u) => u.userId === U1), "u1 연결 소멸(release)");
    vi.advanceTimersByTime(SESSION_GRACE_MS);
    await waitFor(() => h.m.sessionsOf(U1).length === 0, "유예 만료 — 세션 소멸");
    const fresh = await h.open("token-1");
    await readyTab(h, fresh, U1, 2, "새 세션 ready");
    expect(readyAccounts(fresh.inbox)).toEqual([
      { accountNo: A, name: "계좌A", serverKey: "KB120" },
      { accountNo: B, name: "계좌B", serverKey: "KB120" },
    ]);
  });
  // ============================================================
  // 29-44 — (가) 보강: 연결 없는 사용자 · 트래커 diff · 임시 세션
  // ============================================================

  /** sweep 결과를 모으는 래퍼(실 sweeper 그대로). */
  function recording(results: StrategySweepResult[], targets: string[]) {
    return (real: StrategySweeper): Pick<StrategySweeper, "sweep"> => ({
      sweep: async (target, creds) => {
        targets.push(`${target.serverKey}:${target.accountNos.join(",")}`);
        const res = await real.sweep(target, creds);
        results.push(res);
        return res;
      },
    });
  }

  it("⑨ 트레이서(29-44) — 브라우저 0 · 세션 0 인 u1 의 A 를 KB121 로 지정 → 트래커 move → KB120 임시 세션(LoginReq 1)으로 A 만 끄기(24 · 21 · 21 · 14 · 재조회) → 확인 · release(유예) · KB121 LoginReq 0 · u2 무영향", async () => {
    await captureLogs();
    kb120.respondLimitChaserList([on(SAMPLE_ISIN, A), on(ISIN2, B), on(ISIN3, D)]);
    const results: StrategySweepResult[] = [];
    const targets: string[] = [];
    const h = await harness({ tracker: true, wrapSweeper: recording(results, targets) });
    const other = await h.open("token-2");
    await readyTab(h, other, U2, 1, "u2 ready(D)");
    expect(h.m.sessionsOf(U1)).toEqual([]);
    const drop = traceDrop(h.m);
    const from120 = mark("KB120");
    const fromEvents = events.length;

    chosenRows = [{ dma_user_id: D1, broker: "KB", account_no: A, server_key: "KB121" }];
    await h.loader.reload();
    await waitFor(() => results.length === 1, "연결 없는 u1 의 KB120 sweep 완료");
    await flushIo(10);

    expect(results[0]).toEqual(expect.objectContaining({ ok: true, sessionCreated: true }));
    expect(targets).toEqual([`KB120:${A}`]);
    // 옛 서버에만 임시 로그인 1 — 새 주문 서버(KB121)에는 연결 없는 사용자 세션을 미리 열지 않는다.
    expect(count("KB120", MSG.LoginReq, from120)).toBe(1);
    expect(count("KB121", MSG.LoginReq)).toBe(0);
    expect(kb121.sockets).toHaveLength(0);
    const t = (n: number) => `KB120:${n}`;
    expect(events.slice(fromEvents).filter((e) => e.startsWith("KB120:") && SWEEP_TYPES.has(Number(e.slice(6))))).toEqual([
      t(MSG.GetLimitChaserListReq),
      t(MSG.GetVITriggerReq),
      t(MSG.GetVITriggerReq),
      t(MSG.DisableStrategiesReq),
      t(MSG.GetLimitChaserListReq),
      t(MSG.GetVITriggerReq),
      t(MSG.GetVITriggerReq),
    ]);
    expect(disabledKeys("KB120", from120)).toEqual([keyOf(SAMPLE_ISIN, A)]);
    expect(kb120.limitChaserSeed().filter((c) => c.buyEnabled).map((c) => c.accountNo)).toEqual([B, D]);
    expect(orderAccounts("KB120", from120)).toEqual([]);
    expect(h.register.all()).toEqual([]);
    // release 1 — 임시 세션은 종전 유예로 끝난다(즉시 drop 아님 · 연결 중 경로가 아니다).
    expect(drop).not.toHaveBeenCalled();
    expect(h.m.sessionsOf(U1).map((s) => s.serverKey)).toEqual(["KB120"]);
    vi.advanceTimersByTime(SESSION_GRACE_MS);
    await waitFor(() => h.m.sessionsOf(U1).length === 0, "임시 세션 유예 만료");
    // u2 는 아무 일 없음.
    expect(other.ws.closeInfo).toBeNull();
    expect(h.m.sessionsOf(U2).map((s) => s.serverKey)).toEqual(["KB120"]);

    // 같은 지정 재적재 → move 0 · sweep 0.
    await h.loader.reload();
    await flushIo(10);
    expect(results).toHaveLength(1);
  });

  it("⑩ 연결 0 사용자 · 자격증명 null(비밀 없음) → sweep 0 · 레지스터 no-session(count null) · warn 1줄(계좌 · DMA id 없음) · 다음 로그인 상태 프레임 A 에 staleStrategies", async () => {
    const logs = await captureLogs();
    kb120.respondLimitChaserList([on(SAMPLE_ISIN, A)]);
    const results: StrategySweepResult[] = [];
    const targets: string[] = [];
    const h = await harness({ tracker: true, wrapSweeper: recording(results, targets) });
    const from120 = mark("KB120");
    credMode.set(U1, "null");

    chosenRows = [{ dma_user_id: D1, broker: "KB", account_no: A, server_key: "KB121" }];
    await h.loader.reload();
    await waitFor(() => h.register.all().length === 1, "레지스터 no-session");
    await flushIo(10);
    expect(targets).toEqual([]);
    expect(count("KB120", MSG.LoginReq, from120)).toBe(0);
    expect(h.register.all()).toEqual([
      expect.objectContaining({ userId: U1, dmaUserId: D1, serverKey: "KB120", accountNo: A, remaining: null, reason: "no-session" }),
    ]);
    const stale = logs.warns.filter((c) => msgOf(c).includes("옛 서버 KB120 활성 전략") && msgOf(c).includes("끄지 못함"));
    expect(stale).toHaveLength(1);
    for (const secret of [A, D1]) expect(JSON.stringify(stale)).not.toContain(secret);

    credMode.set(U1, "ok");
    const tab = await h.open("token-1");
    await readyTab(h, tab, U1, 2, "로그인 ready");
    const first = tab.inbox.find(
      (f): f is RelayStateMsg => f.t === "state" && (f.accounts?.some((a) => a.accountNo === A) ?? false),
    );
    expect(first?.accounts?.find((a) => a.accountNo === A)?.staleStrategies).toEqual({ serverKey: "KB120", count: null });
  });

  it("⑪ 연결 0 DMA 유저인데 웹 사용자(접근 맵)에 없음 → sweep 0 · 레지스터 0 · warn 1줄(수만 — DMA id 없음)", async () => {
    const logs = await captureLogs();
    kb120.respondLimitChaserList([on(SAMPLE_ISIN, A)]);
    const results: StrategySweepResult[] = [];
    const targets: string[] = [];
    const h = await harness({ tracker: true, wrapSweeper: recording(results, targets) });
    dmaToUser.delete(D1);
    const from120 = mark("KB120");

    chosenRows = [{ dma_user_id: D1, broker: "KB", account_no: A, server_key: "KB121" }];
    await h.loader.reload();
    await waitFor(() => logs.warns.some((c) => msgOf(c).includes("웹 사용자 없음")), "warn");
    await flushIo(10);
    expect(targets).toEqual([]);
    expect(count("KB120", MSG.LoginReq, from120)).toBe(0);
    expect(h.register.all()).toEqual([]);
    const lines = logs.warns.filter((c) => msgOf(c).includes("웹 사용자 없음"));
    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines)).not.toContain(D1);
    expect(JSON.stringify(lines)).not.toContain(A);
  });

  it("⑫ 연결 0 사용자 · 끄기 미확인(65 안 옴) → 레지스터 { u1, KB120, A, timeout, remaining 1 } · release · 뒤에 인증하면 첫 상태 프레임 A 에 staleStrategies { KB120, 1 }", async () => {
    await captureLogs();
    kb120.respondLimitChaserList([on(SAMPLE_ISIN, A)]);
    kb120.handleDisableStrategies({ respond65: false });
    const results: StrategySweepResult[] = [];
    const targets: string[] = [];
    const h = await harness({ tracker: true, wrapSweeper: recording(results, targets) });
    const from120 = mark("KB120");

    chosenRows = [{ dma_user_id: D1, broker: "KB", account_no: A, server_key: "KB121" }];
    await h.loader.reload();
    await waitFor(() => disabledKeys("KB120", from120).length === 1, "14 송신");
    await flushIo(10);
    vi.advanceTimersByTime(5_000);
    await waitFor(() => results.length === 1, "sweep 시한");
    expect(results[0]).toEqual(expect.objectContaining({ ok: false, reason: "timeout" }));
    expect(h.register.all()).toEqual([
      expect.objectContaining({ userId: U1, dmaUserId: D1, serverKey: "KB120", accountNo: A, remaining: 1, reason: "timeout" }),
    ]);

    const tab = await h.open("token-1");
    await readyTab(h, tab, U1, 2, "로그인 ready");
    const first = tab.inbox.find(
      (f): f is RelayStateMsg => f.t === "state" && (f.accounts?.some((a) => a.accountNo === A) ?? false),
    );
    expect(first?.accounts?.find((a) => a.accountNo === A)?.staleStrategies).toEqual({ serverKey: "KB120", count: 1 });
    expect(acctOf(readyAccounts(tab.inbox), B)?.staleStrategies).toBeUndefined();
  });
});
