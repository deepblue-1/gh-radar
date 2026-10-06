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
