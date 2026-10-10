/**
 * Phase 29 Plan 23 — 시세 주 서버 즉시 전환(D-11) 통합: 가짜 게이트웨이 2대(quote 모드) + 실 `DmaClient` + 실 `QuoteFeed` +
 * 실 `QuoteSwitch` + 실 `SubscriptionHub` + 실 `QuoteStatus`. 운영 무접촉.
 *
 * 잠그는 것 (Task 1 트레이서 — break-then-make):
 *   W1  시작: KB120 스텁에 role 1 로그인(KB 비밀) · hub 키 2개 → KB120 스텁에 두 벌(28·29·32 / 28·29) ·
 *       switchTo(KYOBO119) → KB120 소켓 닫힘 → KYOBO119 스텁 role 1 로그인(교보 비밀) → ready → 같은 키 두 벌이 KYOBO119 에만
 *       (재구독 1회) · KB120 에 새 요청 0 · 래퍼 상태 connecting → ready · QuoteStatus 는 같은 래퍼를 계속 본다 ·
 *       새 스텁이 로그인을 받은 순간 옛 스텁에 살아 있는 소켓 0(동시 quote 연결 없음) · reconnects 1 · currentServerKey.
 *   W2  내부 HTTP: `POST /internal/admin/servers/KYOBO119/quote-primary` → 같은 전환 → RPC `dma_admin_set_quote_primary
 *       ('KYOBO119')` 1회 → 200 `{ ok: true }` · 감사 1줄(server 키).
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAdminRouter } from "../src/admin/admin-api.js";
import { AdminIntentStore } from "../src/admin/intent-store.js";
import { MSG } from "../src/dma/msg-type.js";
import { SubscriptionHub } from "../src/hub/subscription-hub.js";
import { createOrderApi } from "../src/order/order-api.js";
import { QUOTE_CLIENT_NAME, QuoteFeed, type QuoteFeedState } from "../src/quote/feed.js";
import { QuoteStatus } from "../src/quote/status.js";
import { QuoteSwitch, type QuoteSwitchServer } from "../src/quote/quote-switch.js";
import type { DmaServerRow } from "../src/registry/registry.js";
import { AdminDbFake } from "./helpers/admin-db-fake.js";
import {
  readQuoteRequestKey,
  readSubscribeRequest,
  startFakeGateway,
  type FakeGateway,
} from "./helpers/fake-gateway.js";
import { SAMPLE_ISIN } from "./helpers/frames.js";

const KB_SECRET = "test-kb-quote-secret";
const KYOBO_SECRET = "test-kyobo-quote-secret";
const RELAY_SECRET = "test-relay-order-secret-0123456789";
const ADMIN = "boss@gmail.com";
const FULL_ISIN = SAMPLE_ISIN;
const PRICE_ISIN = "KR7000660001";

type LogCall = { level: string; args: unknown[] };

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

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`조건이 서지 않았습니다: ${label}`);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 게이트웨이가 받은 시세 요청 1건(28/29/32) — 로그인 · 핑 제외. */
type QuoteReq = { msgType: number; isin: string | null; level: number | null };

/** 스텁 1대 — 받은 시세 요청 · 로그인을 받은 순간 상대 스텁의 살아 있는 소켓 수. */
type Stub = { gw: FakeGateway; reqs: QuoteReq[]; liveOnPeerAtLogin: number[] };

async function startStub(): Promise<Stub> {
  const gw = await startFakeGateway({ autoLogin: false, autoAccount: false });
  const stub: Stub = { gw, reqs: [], liveOnPeerAtLogin: [] };
  gw.onFrame((msgType, payload) => {
    if (msgType !== MSG.GetQuoteReq && msgType !== MSG.SubscribeQuoteReq && msgType !== MSG.GetTradeTapeReq) return;
    const copy = Buffer.from(payload);
    const sub = readSubscribeRequest(msgType, copy);
    stub.reqs.push({ msgType, isin: readQuoteRequestKey(msgType, copy)?.isin ?? sub?.isin ?? null, level: sub?.level ?? null });
  });
  return stub;
}

/** 두 스텁이 서로의 「로그인 순간 상대 소켓 수」 를 기록하게 묶는다. */
function watchPeers(a: Stub, b: Stub): void {
  const live = (s: Stub): number => s.gw.sockets.filter((x) => !x.destroyed).length;
  a.gw.onFrame((t) => {
    if (t === MSG.ObserverLoginReq) a.liveOnPeerAtLogin.push(live(b));
  });
  b.gw.onFrame((t) => {
    if (t === MSG.ObserverLoginReq) b.liveOnPeerAtLogin.push(live(a));
  });
}

/** full 키 28·29(0)·32 + price 키 28·29(1) — 한 벌. */
function expectUnion(reqs: QuoteReq[]): void {
  const full = reqs.filter((r) => r.isin === FULL_ISIN);
  const price = reqs.filter((r) => r.isin === PRICE_ISIN);
  expect(reqs).toHaveLength(5);
  expect(full.map((r) => r.msgType)).toEqual([MSG.GetQuoteReq, MSG.SubscribeQuoteReq, MSG.GetTradeTapeReq]);
  expect(full[1]?.level).toBe(0);
  expect(price.map((r) => r.msgType)).toEqual([MSG.GetQuoteReq, MSG.SubscribeQuoteReq]);
  expect(price[1]?.level).toBe(1);
}

function server(key: string, broker: "KB" | "KYOBO", port: number): QuoteSwitchServer {
  return { key, broker, host: "127.0.0.1", port };
}

function makeSwitch(initial: QuoteSwitchServer, readyTimeoutMs?: number): QuoteSwitch {
  return new QuoteSwitch({
    initial,
    secretOf: (b) => (b === "KB" ? KB_SECRET : KYOBO_SECRET),
    createFeed: (s, secret) => new QuoteFeed({ secret, host: s?.host ?? "127.0.0.1", port: s?.port ?? 1 }),
    ...(readyTimeoutMs !== undefined ? { readyTimeoutMs } : {}),
  });
}

describe("QuoteSwitch 트레이서 — KB120 → KYOBO119 break-then-make · 재구독 1회 (29-23 Task 1)", () => {
  let kb: Stub;
  let kyobo: Stub;
  let hub: SubscriptionHub;
  let sw: QuoteSwitch | null = null;
  let status: QuoteStatus | null = null;
  let logs: LogCall[];

  beforeEach(async () => {
    logs = await spyLogs();
    kb = await startStub();
    kyobo = await startStub();
    watchPeers(kb, kyobo);
    kb.gw.respondQuoteLogin({ success: true });
    kyobo.gw.respondQuoteLogin({ success: true });
    hub = new SubscriptionHub();
  });

  afterEach(async () => {
    status?.close();
    status = null;
    sw?.stop();
    sw = null;
    hub.closeAll();
    await kb.gw.close();
    await kyobo.gw.close();
    vi.restoreAllMocks();
    // T-26-05: 비밀은 어떤 로그 인자에도 없다.
    const dumped = JSON.stringify(logs.map((c) => c.args));
    expect(dumped).not.toContain(KB_SECRET);
    expect(dumped).not.toContain(KYOBO_SECRET);
  });

  it("W1 KB120 → KYOBO119 — 옛 연결 닫고 교보 비밀로 role 1 로그인 → 같은 키 두 벌이 새 서버에만 · 상태 connecting → ready", async () => {
    const s = makeSwitch(server("KB120", "KB", kb.gw.port));
    sw = s;
    hub.attachFeed(s);
    status = new QuoteStatus({ feed: s, hubStats: () => hub.stats() });
    const states: QuoteFeedState[] = [];
    s.on("state", (st) => states.push(st));
    hub.subscribe("user-1", FULL_ISIN, "KRX");
    hub.subscribe("user-2", PRICE_ISIN, "KRX", "price");
    s.start();

    await waitFor(() => s.state === "ready", "KB120 ready");
    await waitFor(() => kb.reqs.length === 5, "KB120 합집합 두 벌");
    expectUnion(kb.reqs);
    expect(kb.gw.quoteLoginRequests()).toEqual([
      { secret: KB_SECRET, sinceSeq: 0, epoch: "", client: QUOTE_CLIENT_NAME, strategySinceSeq: 0, role: 1 },
    ]);
    expect(s.currentServerKey).toBe("KB120");
    expect(s.reconnects).toBe(0);
    states.length = 0;

    const t0 = Date.now();
    const r = await s.switchTo(server("KYOBO119", "KYOBO", kyobo.gw.port));
    const elapsedMs = Date.now() - t0;
    expect(r).toEqual({ ok: true, changed: true });
    expect(s.currentServerKey).toBe("KYOBO119");
    expect(s.isReady).toBe(true);

    await waitFor(() => kyobo.reqs.length === 5, "KYOBO119 합집합 재구독");
    await sleep(150); // 중복 재구독 · 옛 서버 새 요청이 없는지 볼 여유
    expectUnion(kyobo.reqs);
    expect(kb.reqs).toHaveLength(5);
    expect(kyobo.gw.quoteLoginRequests()).toEqual([
      { secret: KYOBO_SECRET, sinceSeq: 0, epoch: "", client: QUOTE_CLIENT_NAME, strategySinceSeq: 0, role: 1 },
    ]);
    expect(kb.gw.quoteLoginRequests()).toHaveLength(1);
    // break-then-make — 새 스텁이 로그인을 받은 순간 옛 스텁에 살아 있는 quote 소켓은 없다.
    expect(kyobo.liveOnPeerAtLogin).toEqual([0]);
    expect(kb.gw.sockets.filter((x) => !x.destroyed)).toHaveLength(0);
    // 래퍼 상태 — 전환 창 connecting → 새 서버 ready. QuoteStatus 는 같은 래퍼 객체를 본다(재결선 없음).
    expect(states[0]).toBe("connecting");
    expect(states.at(-1)).toBe("ready");
    expect(states).not.toContain("rejected");
    expect(status.health(Date.now()).state).toBe("ready");
    expect(s.reconnects).toBe(1);
    // 참조계수는 전환 전과 같다 — 브라우저는 아무것도 다시 보내지 않았다.
    expect(hub.refCount(FULL_ISIN, "KRX")).toBe(1);
    expect(hub.refCount(PRICE_ISIN, "KRX")).toBe(1);
    // 전환 시간 실측(스텁 · 루프백) — SUMMARY 기록용.
    console.info(`[measure] quote switch KB120 → KYOBO119 elapsedMs=${elapsedMs}`);
    expect(elapsedMs).toBeLessThan(3000);
  });

  it("W2 POST /internal/admin/servers/KYOBO119/quote-primary → 전환 → RPC 1회 → 200 { ok: true }", async () => {
    const rows: DmaServerRow[] = [
      { key: "KB120", broker: "KB", host: "127.0.0.1", port: kb.gw.port, enabled: true, isOrderServer: true, isQuotePrimary: true, sortOrder: 1 },
      { key: "KYOBO119", broker: "KYOBO", host: "127.0.0.1", port: kyobo.gw.port, enabled: true, isOrderServer: true, isQuotePrimary: false, sortOrder: 2 },
    ];
    const s = makeSwitch(rows[0]!);
    sw = s;
    hub.attachFeed(s);
    hub.subscribe("user-1", FULL_ISIN, "KRX");
    s.start();
    await waitFor(() => s.state === "ready", "KB120 ready");
    await waitFor(() => kb.reqs.length === 3, "KB120 full 한 벌");

    const db = new AdminDbFake(rows.map((r) => ({ key: r.key, broker: r.broker })));
    let reloads = 0;
    const router = createAdminRouter({
      store: new AdminIntentStore({ supabase: db.client }),
      dispatcher: {
        reconcileUser: () => Promise.resolve([]),
        changePassword: () => Promise.resolve([]),
        deleteUser: () => Promise.resolve({ results: [], deleted: false }),
      },
      registry: {
        all: () => rows.map((r) => ({ ...r })),
        reload: () => {
          reloads += 1;
          return Promise.resolve({ ok: true, changed: true });
        },
      },
      access: { reload: () => Promise.resolve({ ok: true, revoked: [] }) },
      pipelines: { get: () => undefined },
      credKey: "unused",
      quoteStatus: { serverKey: () => s.currentServerKey, health: () => ({ state: s.state }) },
      quoteSwitch: s,
    });
    const app = createOrderApi({
      relayOrderSecret: RELAY_SECRET,
      dmaHost: () => "10.41.0.10",
      networkInterfaces: () => ({}),
      appVersion: "test-sha",
      nodeEnv: "test",
      sessions: { stats: () => ({ sessionCount: 0, readyCount: 0, everReadyCount: 0, stalledCount: 0 }) },
      admin: { router },
    });
    const httpServer = http.createServer(app);
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));
    const { port } = httpServer.address() as AddressInfo;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/internal/admin/servers/KYOBO119/quote-primary`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-relay-secret": RELAY_SECRET, "x-admin-email": ADMIN },
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(db.callsTo("dma_admin_set_quote_primary")).toEqual([
        { name: "dma_admin_set_quote_primary", args: { p_key: "KYOBO119" } },
      ]);
      expect(s.currentServerKey).toBe("KYOBO119");
      await waitFor(() => kyobo.reqs.length === 3, "KYOBO119 재구독");
      expect(kb.reqs).toHaveLength(3);
      // 레지스트리를 바로 맞춘다(60초 주기를 기다리지 않는다).
      await waitFor(() => reloads === 1, "레지스트리 재적재 1회");
      const audit = logs.find(
        (c) => c.level === "info" && c.args.some((a) => typeof a === "string" && a.includes("[admin-audit]")),
      );
      expect(audit?.args[0]).toMatchObject({ admin: ADMIN, route: "POST /servers/:key/quote-primary", server: "KYOBO119", ok: true, changed: true });
    } finally {
      httpServer.closeAllConnections();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  });
});

/**
 * 잠그는 것 (Task 2 — 실패 복귀 · 단일 비행 · 레지스트리 보정 · 무동작):
 *   F1  새 서버 79 거부 → 새 연결 닫힘 → KB120 재연결 · ready · 같은 키 재구독 → QUOTE_SWITCH_FAILED「새 서버 로그인 실패 — KB120 으로
 *       되돌림」 · 래퍼 상태에 rejected 가 비치지 않는다
 *   F2  새 서버 role 0 응답(role_mismatch) → 같은 복귀
 *   F3  새 서버 무응답 → 상한(주입 300ms) → 같은 복귀 · 새 스텁 소켓 닫힘
 *   F4  진행 중 두 번째 요청 → QUOTE_SWITCH_BUSY · 첫 요청은 그대로 성공
 *   F5  같은 서버 → { ok: true, changed: false } · 연결 · 로그인 · 요청 변화 0
 *   F6  그 증권사 quote 비밀 없음 → 끊지 않고 즉시 실패 · 새 스텁 연결 0
 *   R1  레지스트리 보정 — DB 시세 주 서버가 다른 경로로 KYOBO119 → 자동 전환 · 되돌리기 RPC 0
 *   R2  보정 실패 → DB 를 지금 연결 서버(KB120)로 되돌리는 restore 1회 + error 로그
 *   R3  admin 전환 직후 낡은 재적재(KB120 그대로)는 연결을 되돌리지 않는다 — 레지스트리 관점에서 바뀐 적이 없다
 */
describe("QuoteSwitch 실패 복귀 · 단일 비행 · 보정 · 무동작 (29-23 Task 2)", () => {
  let kb: Stub;
  let kyobo: Stub;
  let hub: SubscriptionHub;
  let sw: QuoteSwitch | null = null;
  let logs: LogCall[];
  let states: QuoteFeedState[];

  beforeEach(async () => {
    logs = await spyLogs();
    kb = await startStub();
    kyobo = await startStub();
    watchPeers(kb, kyobo);
    kb.gw.respondQuoteLogin({ success: true });
    hub = new SubscriptionHub();
    states = [];
  });

  afterEach(async () => {
    sw?.stop();
    sw = null;
    hub.closeAll();
    await kb.gw.close();
    await kyobo.gw.close();
    vi.restoreAllMocks();
    const dumped = JSON.stringify(logs.map((c) => c.args));
    expect(dumped).not.toContain(KB_SECRET);
    expect(dumped).not.toContain(KYOBO_SECRET);
  });

  /** KB120 에 붙어 full 키 한 벌(3건)까지 받은 래퍼. */
  async function readyOnKb(opts: { readyTimeoutMs?: number; secretOf?: (b: "KB" | "KYOBO") => string | undefined } = {}): Promise<QuoteSwitch> {
    const s = new QuoteSwitch({
      initial: server("KB120", "KB", kb.gw.port),
      secretOf: opts.secretOf ?? ((b) => (b === "KB" ? KB_SECRET : KYOBO_SECRET)),
      createFeed: (srv, secret) => new QuoteFeed({ secret, host: srv?.host ?? "127.0.0.1", port: srv?.port ?? 1 }),
      ...(opts.readyTimeoutMs !== undefined ? { readyTimeoutMs: opts.readyTimeoutMs } : {}),
    });
    sw = s;
    hub.attachFeed(s);
    hub.subscribe("user-1", FULL_ISIN, "KRX");
    s.start();
    await waitFor(() => s.state === "ready", "KB120 ready");
    await waitFor(() => kb.reqs.length === 3, "KB120 full 한 벌");
    s.on("state", (st) => states.push(st));
    return s;
  }

  const kyoboServer = (): QuoteSwitchServer => server("KYOBO119", "KYOBO", kyobo.gw.port);

  /** 실패 뒤 공통 — KB120 으로 되돌아와 재로그인 · 같은 키 재구독 · 새 스텁에 살아 있는 소켓 없음. */
  async function expectRevertedToKb(s: QuoteSwitch): Promise<void> {
    expect(s.currentServerKey).toBe("KB120");
    await waitFor(() => s.state === "ready", "KB120 으로 복귀 ready");
    await waitFor(() => kb.reqs.length === 6, "KB120 재구독(두 번째 한 벌)");
    expect(kb.gw.quoteLoginRequests()).toHaveLength(2);
    expect(kb.gw.quoteLoginRequests().every((r) => r.secret === KB_SECRET && r.role === 1)).toBe(true);
    expect(kyobo.reqs).toEqual([]);
    await waitFor(() => kyobo.gw.sockets.filter((x) => !x.destroyed).length === 0, "새 서버 소켓 닫힘");
    // 복귀 연결도 break-then-make — KB120 이 다시 로그인을 받은 순간 KYOBO119 에 살아 있는 소켓 0.
    expect(kb.liveOnPeerAtLogin.at(-1)).toBe(0);
    expect(states).not.toContain("rejected");
    expect(states).not.toContain("role_mismatch");
    expect(states.at(-1)).toBe("ready");
  }

  const FAILED = { ok: false, code: "QUOTE_SWITCH_FAILED", message: "새 서버 로그인 실패 — KB120 으로 되돌림" };

  it("F1 새 서버 79 거부 → KB120 으로 되돌림 · 재구독 · 409 문구", async () => {
    kyobo.gw.respondQuoteLogin({ success: false, message: "거부" });
    const s = await readyOnKb();
    const r = await s.switchTo(kyoboServer());
    expect(r).toEqual(FAILED);
    expect(kyobo.gw.quoteLoginRequests()).toHaveLength(1);
    await expectRevertedToKb(s);
    const err = logs.find((c) => c.level === "error" && c.args.some((a) => typeof a === "string" && a.includes("전환 실패")));
    expect(err?.args[0]).toMatchObject({ from: "KB120", to: "KYOBO119", reason: "rejected" });
  });

  it("F2 새 서버 role 0 응답(role_mismatch) → 같은 복귀", async () => {
    kyobo.gw.respondQuoteLogin({ success: true, role: 0 });
    const s = await readyOnKb();
    expect(await s.switchTo(kyoboServer())).toEqual(FAILED);
    await expectRevertedToKb(s);
  });

  it("F3 새 서버 무응답 → 상한(300ms) → 같은 복귀", async () => {
    kyobo.gw.respondQuoteLogin(null);
    const s = await readyOnKb({ readyTimeoutMs: 300 });
    const t0 = Date.now();
    expect(await s.switchTo(kyoboServer())).toEqual(FAILED);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(290);
    expect(kyobo.gw.quoteLoginRequests()).toHaveLength(1);
    await expectRevertedToKb(s);
  });

  it("F4 진행 중 두 번째 요청 → QUOTE_SWITCH_BUSY · 첫 요청은 그대로 성공", async () => {
    kyobo.gw.respondQuoteLogin({ success: true });
    const s = await readyOnKb();
    const first = s.switchTo(kyoboServer());
    const second = await s.switchTo(server("KB120", "KB", kb.gw.port));
    expect(second).toMatchObject({ ok: false, code: "QUOTE_SWITCH_BUSY" });
    expect(await first).toEqual({ ok: true, changed: true });
    expect(s.currentServerKey).toBe("KYOBO119");
    await waitFor(() => kyobo.reqs.length === 3, "KYOBO119 재구독");
    expect(kb.gw.quoteLoginRequests()).toHaveLength(1);
  });

  it("F5 같은 서버 → 무동작 { ok: true, changed: false } · 연결 · 요청 변화 0", async () => {
    const s = await readyOnKb();
    const sock = await kb.gw.waitForQuoteConnection(1000);
    expect(await s.switchTo(server("KB120", "KB", kb.gw.port))).toEqual({ ok: true, changed: false });
    await sleep(100);
    expect(await kb.gw.waitForQuoteConnection(1000)).toBe(sock);
    expect(kb.gw.quoteLoginRequests()).toHaveLength(1);
    expect(kb.reqs).toHaveLength(3);
    expect(states).toEqual([]);
  });

  it("F6 그 증권사 quote 비밀 없음 → 끊지 않고 즉시 실패 · 새 스텁 연결 0", async () => {
    const s = await readyOnKb({ secretOf: (b) => (b === "KB" ? KB_SECRET : undefined) });
    const r = await s.switchTo(kyoboServer());
    expect(r).toMatchObject({ ok: false, code: "QUOTE_SWITCH_FAILED" });
    await sleep(100);
    expect(s.currentServerKey).toBe("KB120");
    expect(s.isReady).toBe(true);
    expect(kyobo.gw.quoteLoginRequests()).toEqual([]);
    expect(kb.gw.quoteLoginRequests()).toHaveLength(1);
    expect(states).toEqual([]);
  });

  it("R1 레지스트리 보정 — DB 가 다른 경로로 KYOBO119 → 자동 전환 · 되돌리기 0", async () => {
    kyobo.gw.respondQuoteLogin({ success: true });
    const s = await readyOnKb();
    const restored: string[] = [];
    const out = await s.reconcileWithRegistry({ quotePrimary: () => kyoboServer() }, (k) => {
      restored.push(k);
      return Promise.resolve();
    });
    expect(out).toBe("switched");
    expect(s.currentServerKey).toBe("KYOBO119");
    expect(restored).toEqual([]);
    await waitFor(() => kyobo.reqs.length === 3, "KYOBO119 재구독");
    // 같은 값 재적재는 무동작.
    expect(await s.reconcileWithRegistry({ quotePrimary: () => kyoboServer() }, () => Promise.resolve())).toBe("noop");
  });

  it("R2 보정 실패 → DB 를 지금 연결 서버(KB120)로 되돌리는 restore 1회 + error 로그", async () => {
    kyobo.gw.respondQuoteLogin({ success: false, message: "거부" });
    const s = await readyOnKb();
    const restored: string[] = [];
    const out = await s.reconcileWithRegistry({ quotePrimary: () => kyoboServer() }, (k) => {
      restored.push(k);
      return Promise.resolve();
    });
    expect(out).toBe("restored");
    expect(restored).toEqual(["KB120"]);
    await expectRevertedToKb(s);
    expect(
      logs.some((c) => c.level === "error" && c.args.some((a) => typeof a === "string" && a.includes("보정 실패"))),
    ).toBe(true);
  });

  it("R3 admin 전환 직후 낡은 재적재(KB120 그대로)는 연결을 되돌리지 않는다", async () => {
    kyobo.gw.respondQuoteLogin({ success: true });
    const s = await readyOnKb();
    expect(await s.switchTo(kyoboServer())).toEqual({ ok: true, changed: true });
    // RPC 커밋 전에 시작된 재적재 — 레지스트리는 여전히 KB120 을 시세 주 서버로 본다(부팅 때와 같은 값).
    const out = await s.reconcileWithRegistry({ quotePrimary: () => server("KB120", "KB", kb.gw.port) }, () => Promise.resolve());
    expect(out).toBe("noop");
    expect(s.currentServerKey).toBe("KYOBO119");
    expect(kb.gw.quoteLoginRequests()).toHaveLength(1);
  });
});

/**
 * 잠그는 것 (29-28 Task 3 — WR-03 시세 주 서버 주소 추종):
 *   A1  레지스트리 재적재가 같은 키 KB120 을 다른 포트(스텁 B)로 → 스텁 A 소켓 닫힘 → 스텁 B 에 role 1 로그인(같은 KB 비밀) →
 *       ready → 구독 키 재구독 1회 · 두 소켓이 동시에 살아 있는 순간 없음 · restore 0 · 같은 값 재적재는 무동작
 *   A2  같은 키 · 같은 주소 재적재(다른 서버 행만 바뀜) → 무동작(소켓 · 로그인 · 요청 변화 0)
 *   A3  `switchTo(같은 키 · 다른 주소)` 직접 호출도 같은 break-then-make(종전엔 무동작이었다)
 *   A4  새 주소 로그인 실패 → 옛 주소로 되돌림 · restore 0(같은 키라 되돌릴 DB 값이 없다) · error 로그 1줄 · 같은 관측 값이
 *       다시 와도 재시도하지 않는다(직전 값 유지 — 다음 Admin 저장이 다시 시도)
 */
describe("QuoteSwitch 시세 주 서버 주소 추종 — 같은 키 break-then-make (29-28 WR-03)", () => {
  /** 스텁 A = 지금 KB120 주소 · 스텁 B = 고친 KB120 주소(같은 키 · 다른 포트). */
  let a: Stub;
  let b: Stub;
  let hub: SubscriptionHub;
  let sw: QuoteSwitch | null = null;
  let logs: LogCall[];
  let states: QuoteFeedState[];

  beforeEach(async () => {
    logs = await spyLogs();
    a = await startStub();
    b = await startStub();
    watchPeers(a, b);
    a.gw.respondQuoteLogin({ success: true });
    hub = new SubscriptionHub();
    states = [];
  });

  afterEach(async () => {
    sw?.stop();
    sw = null;
    hub.closeAll();
    await a.gw.close();
    await b.gw.close();
    vi.restoreAllMocks();
    const dumped = JSON.stringify(logs.map((c) => c.args));
    expect(dumped).not.toContain(KB_SECRET);
    expect(dumped).not.toContain(KYOBO_SECRET);
  });

  const atA = (): QuoteSwitchServer => server("KB120", "KB", a.gw.port);
  const atB = (): QuoteSwitchServer => server("KB120", "KB", b.gw.port);

  /** KB120@스텁A 에 붙어 full 키 한 벌(3건)까지 받은 래퍼. */
  async function readyOnA(): Promise<QuoteSwitch> {
    const s = makeSwitch(atA());
    sw = s;
    hub.attachFeed(s);
    hub.subscribe("user-1", FULL_ISIN, "KRX");
    s.start();
    await waitFor(() => s.state === "ready", "KB120@A ready");
    await waitFor(() => a.reqs.length === 3, "KB120@A full 한 벌");
    s.on("state", (st) => states.push(st));
    return s;
  }

  it("A1 레지스트리 재적재가 같은 키의 포트를 바꿈 → 옛 주소 닫고 새 주소 role 1 로그인 · 재구독 1회 · restore 0", async () => {
    b.gw.respondQuoteLogin({ success: true });
    const s = await readyOnA();
    const restored: string[] = [];
    const out = await s.reconcileWithRegistry({ quotePrimary: () => atB() }, (k) => {
      restored.push(k);
      return Promise.resolve();
    });
    expect(out).toBe("switched");
    expect(s.currentServerKey).toBe("KB120");
    expect(s.isReady).toBe(true);
    expect(restored).toEqual([]);

    await waitFor(() => b.reqs.length === 3, "KB120@B 재구독");
    await sleep(150); // 중복 재구독 · 옛 주소 새 요청이 없는지 볼 여유
    expect(b.reqs.map((r) => r.msgType)).toEqual([MSG.GetQuoteReq, MSG.SubscribeQuoteReq, MSG.GetTradeTapeReq]);
    expect(a.reqs).toHaveLength(3);
    expect(b.gw.quoteLoginRequests()).toEqual([
      { secret: KB_SECRET, sinceSeq: 0, epoch: "", client: QUOTE_CLIENT_NAME, strategySinceSeq: 0, role: 1 },
    ]);
    expect(a.gw.quoteLoginRequests()).toHaveLength(1);
    // break-then-make — 새 주소가 로그인을 받은 순간 옛 주소에 살아 있는 quote 소켓은 없다(D-11 · 관찰자 정원).
    expect(b.liveOnPeerAtLogin).toEqual([0]);
    expect(a.gw.sockets.filter((x) => !x.destroyed)).toHaveLength(0);
    expect(states[0]).toBe("connecting");
    expect(states.at(-1)).toBe("ready");

    // 같은 값 재적재는 무동작.
    expect(await s.reconcileWithRegistry({ quotePrimary: () => atB() }, () => Promise.resolve())).toBe("noop");
    expect(b.gw.quoteLoginRequests()).toHaveLength(1);
  });

  it("A2 같은 키 · 같은 주소 재적재(다른 서버 행만 바뀜) → 무동작 · 소켓 · 로그인 · 요청 변화 0", async () => {
    const s = await readyOnA();
    const sock = await a.gw.waitForQuoteConnection(1000);
    expect(await s.reconcileWithRegistry({ quotePrimary: () => atA() }, () => Promise.resolve())).toBe("noop");
    expect(await s.switchTo(atA())).toEqual({ ok: true, changed: false });
    await sleep(100);
    expect(await a.gw.waitForQuoteConnection(1000)).toBe(sock);
    expect(a.gw.quoteLoginRequests()).toHaveLength(1);
    expect(a.reqs).toHaveLength(3);
    expect(b.gw.quoteLoginRequests()).toEqual([]);
    expect(states).toEqual([]);
  });

  it("A3 switchTo(같은 키 · 다른 주소) 직접 호출 → 같은 break-then-make (종전 무동작 아님)", async () => {
    b.gw.respondQuoteLogin({ success: true });
    const s = await readyOnA();
    expect(await s.switchTo(atB())).toEqual({ ok: true, changed: true });
    expect(s.currentServerKey).toBe("KB120");
    await waitFor(() => b.reqs.length === 3, "KB120@B 재구독");
    expect(b.liveOnPeerAtLogin).toEqual([0]);
    expect(a.gw.sockets.filter((x) => !x.destroyed)).toHaveLength(0);
  });

  it("A4 새 주소 로그인 실패 → 옛 주소로 되돌림 · restore 0 · error 로그 1줄 · 같은 관측 값 재적재는 재시도하지 않는다", async () => {
    b.gw.respondQuoteLogin({ success: false, message: "거부" });
    const s = await readyOnA();
    const restored: string[] = [];
    const restore = (k: string): Promise<void> => {
      restored.push(k);
      return Promise.resolve();
    };
    const out = await s.reconcileWithRegistry({ quotePrimary: () => atB() }, restore);
    expect(out).toBe("failed");
    expect(restored).toEqual([]); // 같은 키 — DB 시세 주 서버는 되돌릴 것이 없다
    expect(s.currentServerKey).toBe("KB120");
    await waitFor(() => s.state === "ready", "옛 주소로 복귀 ready");
    await waitFor(() => a.reqs.length === 6, "옛 주소 재구독(두 번째 한 벌)");
    expect(a.gw.quoteLoginRequests()).toHaveLength(2);
    expect(b.gw.quoteLoginRequests()).toHaveLength(1);
    await waitFor(() => b.gw.sockets.filter((x) => !x.destroyed).length === 0, "새 주소 소켓 닫힘");
    expect(a.liveOnPeerAtLogin.at(-1)).toBe(0);
    expect(states).not.toContain("rejected");
    const addrErrors = logs.filter(
      (c) => c.level === "error" && c.args.some((x) => typeof x === "string" && x.includes("주소 변경 실패")),
    );
    expect(addrErrors).toHaveLength(1);
    expect(addrErrors[0]?.args[0]).toMatchObject({ server: "KB120" });

    // 같은 관측 값이 다시 와도 재시도하지 않는다 — 다음 Admin 저장(주소가 다시 바뀜)이 다시 시도한다.
    expect(await s.reconcileWithRegistry({ quotePrimary: () => atB() }, restore)).toBe("noop");
    await sleep(100);
    expect(b.gw.quoteLoginRequests()).toHaveLength(1);
    expect(restored).toEqual([]);
  });
});
