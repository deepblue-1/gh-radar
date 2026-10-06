/**
 * Phase 29 Plan 16 — ADMIN-06 트레이서. (유저, 서버) 세션 키 · 증권사별 주문 서버 · 계좌 기준 주문 라우팅.
 *
 * 검증 대상:
 *   - `acquireFor(u, "KB")` 가 레지스트리의 KB 주문 서버(`resolveTarget("KB")`)로 세션을 열고, 같은 사용자의 둘째 탭은
 *     같은 세션을 공유한다(참조계수 2 — 하나를 놓아도 유예가 걸리지 않는다).
 *   - 그 증권사 주문 서버가 없으면(`resolveTarget` → undefined) 세션을 열지 않는다(null · warn 1줄).
 *   - `forAccount` 는 그 계좌가 든 세션을 고른다 — 두 증권사 세션(스텁 2대)을 테스트가 직접 만들면 주문 프레임이 그
 *     계좌의 스텁에만 간다. 구조 · 라우팅은 이미 여러 증권사를 다룬다.
 *   - wss 인증 경로는 **KB 세션만** 연다(교보 스텁 소켓 0 — 교보 사용자 세션은 29-20 · RESEARCH Pitfall 9).
 *
 * 타이머·대기 규율은 `session-manager.test.ts` 와 같다 (setImmediate 는 진짜, 조건 폴링).
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as flatbuffers from "flatbuffers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RelayOrderResultMsg, RelayOutbound } from "@gh-radar/shared";

import { SESSION_GRACE_MS, SessionManager, type DmaCredentials, type SessionTarget } from "../src/dma/session-manager.js";
import { resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { MSG } from "../src/dma/msg-type.js";
import { Envelope } from "../src/generated/stock-dma/envelope.js";
import { createOrderHandler } from "../src/ws/order-handler.js";
import { WsFanout } from "../src/ws/fanout.js";
import { SubscriptionHub } from "../src/hub/subscription-hub.js";
import { encryptDmaPassword } from "../src/store/credentials.js";
import type { SymbolInfo, SymbolLookup } from "../src/store/symbols.js";
import { startFakeGateway, type FakeGateway } from "./helpers/fake-gateway.js";
import { connectWs, type TestWs } from "./helpers/ws-client.js";
import { SAMPLE_ACCOUNT_NO, SAMPLE_ISIN } from "./helpers/frames.js";

const CREDS: DmaCredentials = { dmaUserId: "dma-login-id", password: "p@ssw0rd-절대노출금지" };
/** 교보 스텁의 허용 계좌 — KB 스텁(`SAMPLE_ACCOUNTS`)과 겹치지 않는다. */
const KYOBO_ACCOUNT_NO = "7777777701";
const USER_A = "3f1c2b7a-9d40-4a11-8e55-00000000000a";

const SYMBOLS: SymbolLookup = {
  lookup: (isin: string): SymbolInfo | undefined =>
    isin === SAMPLE_ISIN ? { code: "005930", name: "삼성전자", market: "K" } : undefined,
};

async function flushIo(turns = 4): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

async function waitFor(predicate: () => boolean, label: string, turns = 400): Promise<void> {
  for (let i = 0; i < turns; i += 1) {
    if (predicate()) return;
    await flushIo(1);
  }
  throw new Error(`조건이 서지 않았습니다: ${label}`);
}

/** 게이트웨이가 받은 `DirectOrderReq(2)` 의 계좌번호들. */
function orderAccountsOf(payloads: Buffer[]): string[] {
  return payloads
    .map((p) =>
      Envelope.getRootAsEnvelope(new flatbuffers.ByteBuffer(new Uint8Array(p.buffer, p.byteOffset, p.length))),
    )
    .filter((env) => env.msgType() === MSG.DirectOrderReq)
    .map((env) => env.directOrderReq()?.accountNo() ?? "");
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

describe("SessionManager — (유저, 서버) 세션 라우팅 (29-16 트레이서)", () => {
  const gateways: FakeGateway[] = [];
  const managers: SessionManager[] = [];
  let kb: FakeGateway;
  let kyobo: FakeGateway;
  let kbPayloads: Buffer[];
  let kyoboPayloads: Buffer[];
  /** 레지스트리 흉내 — 증권사 → 주문 서버. 없는 증권사는 undefined(주문 서버 없음). */
  let orderServers: Map<string, SessionTarget>;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    resetDroppedEnvelopeCount();
    kb = await startFakeGateway({ autoLogin: true, loginResp: { success: true } });
    kyobo = await startFakeGateway({
      autoLogin: true,
      loginResp: { success: true, accounts: [{ accountNo: KYOBO_ACCOUNT_NO, name: "교보 위탁" }] },
    });
    gateways.push(kb, kyobo);
    kbPayloads = [];
    kyoboPayloads = [];
    kb.onFrame((_t, payload) => kbPayloads.push(Buffer.from(payload)));
    kyobo.onFrame((_t, payload) => kyoboPayloads.push(Buffer.from(payload)));
    orderServers = new Map([
      ["KB", { serverKey: "KB120", host: "127.0.0.1", port: kb.port, broker: "KB" }],
      ["KYOBO", { serverKey: "KYOBO119", host: "127.0.0.1", port: kyobo.port, broker: "KYOBO" }],
    ]);
  });

  afterEach(async () => {
    for (const m of managers.splice(0)) await m.closeAll();
    for (const g of gateways.splice(0)) await g.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function manager(): SessionManager {
    // 생성자 host/port 는 resolveTarget 을 주면 쓰지 않는다 — 일부러 닫힌 포트를 넣어 폴백이 없음을 함께 본다.
    const m = new SessionManager({
      host: "127.0.0.1",
      port: 1,
      broker: "KB",
      resolveTarget: (broker) => orderServers.get(broker),
    });
    managers.push(m);
    return m;
  }

  it("① acquireFor(u, KB) → 레지스트리 KB 주문 서버(KB120) 세션 · 둘째 탭은 같은 세션(참조계수 2)", async () => {
    const m = manager();
    const first = m.acquireFor(USER_A, "KB", CREDS);
    expect(first).not.toBeNull();
    await waitFor(() => first?.state === "ready", "KB 세션 ready");
    expect(first?.serverKey).toBe("KB120");
    expect(first?.broker).toBe("KB");
    expect(kb.sockets).toHaveLength(1);
    expect(kyobo.sockets).toHaveLength(0);

    const second = m.acquireFor(USER_A, "KB", CREDS);
    expect(second).toBe(first);
    expect(kb.sockets).toHaveLength(1);

    // 참조계수 2 — 하나를 놓아도 유예가 걸리지 않는다(남은 탭이 있다).
    m.release(USER_A, "KB120");
    vi.advanceTimersByTime(SESSION_GRACE_MS * 2);
    await flushIo();
    expect(m.get(USER_A)).toBe(first);
    expect(m.stats().sessionCount).toBe(1);
  });

  it("② 그 증권사 주문 서버가 없으면 세션을 열지 않는다 — null · warn 1줄(사용자 · 증권사만)", async () => {
    const { logger } = await import("../src/logger.js");
    const warns: unknown[][] = [];
    vi.spyOn(logger, "warn").mockImplementation(((...args: unknown[]) => {
      warns.push(args);
    }) as never);
    orderServers.delete("KYOBO");
    const m = manager();

    expect(m.acquireFor(USER_A, "KYOBO", CREDS)).toBeNull();
    await flushIo();
    expect(kyobo.sockets).toHaveLength(0);
    expect(m.sessionsOf(USER_A)).toEqual([]);
    const noServer = warns.filter((c) => typeof c[1] === "string" && c[1].includes("주문 서버가 없다"));
    expect(noServer).toHaveLength(1);
    expect(noServer[0]?.[0]).toEqual({ userId: USER_A, broker: "KYOBO" });
    expect(JSON.stringify(warns)).not.toContain(CREDS.password);
    expect(JSON.stringify(warns)).not.toContain(CREDS.dmaUserId);
  });

  it("③ forAccount — 그 계좌가 든 세션 · 없으면 undefined", async () => {
    const m = manager();
    const s = m.acquireFor(USER_A, "KB", CREDS);
    await waitFor(() => s?.state === "ready", "KB 세션 ready");

    expect(m.forAccount(USER_A, SAMPLE_ACCOUNT_NO)).toBe(s);
    expect(m.forAccount(USER_A, KYOBO_ACCOUNT_NO)).toBeUndefined();
    // 다른 사용자의 계좌 조회는 그 사용자 세션만 본다(교차 없음 · T-15-02).
    expect(m.forAccount("someone-else", SAMPLE_ACCOUNT_NO)).toBeUndefined();
  });

  it("④ 두 증권사 세션(스텁 2대) — forAccount 가 각 계좌를 제 세션으로 · 주문 프레임이 그 계좌의 스텁에만 간다", async () => {
    const m = manager();
    const kbSession = m.acquireFor(USER_A, "KB", CREDS);
    const kyoboSession = m.acquireFor(USER_A, "KYOBO", CREDS);
    await waitFor(
      () => kbSession?.state === "ready" && kyoboSession?.state === "ready",
      "두 증권사 세션 ready",
    );
    expect(kyoboSession).not.toBe(kbSession);
    expect(kyoboSession?.serverKey).toBe("KYOBO119");
    expect(m.sessionsOf(USER_A)).toEqual([kbSession, kyoboSession]);
    expect(m.forAccount(USER_A, SAMPLE_ACCOUNT_NO)).toBe(kbSession);
    expect(m.forAccount(USER_A, KYOBO_ACCOUNT_NO)).toBe(kyoboSession);
    // primary 는 KB 우선(D-18).
    expect(m.primaryOf(USER_A)).toBe(kbSession);
    expect(m.stats().sessionCount).toBe(2);

    const sent: RelayOrderResultMsg[] = [];
    const handler = createOrderHandler<object>({
      sessions: m,
      hub: { on: () => undefined },
      symbols: SYMBOLS,
      send: (_conn, msg) => sent.push(msg),
    });
    try {
      const conn = {};
      void handler.handle(conn, USER_A, orderNew(KYOBO_ACCOUNT_NO, "rid-kyobo"));
      await waitFor(() => orderAccountsOf(kyoboPayloads).length === 1, "교보 스텁 DirectOrderReq");
      expect(orderAccountsOf(kyoboPayloads)).toEqual([KYOBO_ACCOUNT_NO]);
      expect(orderAccountsOf(kbPayloads)).toEqual([]);

      void handler.handle(conn, USER_A, orderNew(SAMPLE_ACCOUNT_NO, "rid-kb"));
      await waitFor(() => orderAccountsOf(kbPayloads).length === 1, "KB 스텁 DirectOrderReq");
      expect(orderAccountsOf(kbPayloads)).toEqual([SAMPLE_ACCOUNT_NO]);
      expect(orderAccountsOf(kyoboPayloads)).toEqual([KYOBO_ACCOUNT_NO]);

      // 어느 세션에도 없는 계좌 — 종전 「사용할 수 없는 계좌」 거부(세션은 있다).
      await handler.handle(conn, USER_A, orderNew("9999999999", "rid-foreign"));
      expect(sent.filter((r) => r.rid === "rid-foreign")).toEqual([
        expect.objectContaining({ status: "rejected", message: "이 세션에서 사용할 수 없는 계좌입니다." }),
      ]);
      // 세션 자체가 없는 사용자 — 종전 「세션 없음」 거부.
      await handler.handle(conn, "no-session-user", orderNew(SAMPLE_ACCOUNT_NO, "rid-none"));
      expect(sent.filter((r) => r.rid === "rid-none")).toEqual([
        expect.objectContaining({ status: "rejected", message: "실시간 세션이 없습니다. 호가창을 먼저 열어 주세요." }),
      ]);
    } finally {
      handler.close();
    }
  });

  it("⑤ wss 인증 경로는 KB 세션만 연다 — 교보 스텁 소켓 0 · 주문은 KB 세션으로", async () => {
    const credKey = randomBytes(32).toString("base64");
    const credRow = { dma_user_id: "kb-a", dma_password_enc: encryptDmaPassword("pw-a", USER_A, credKey) };
    const supabase = {
      auth: {
        getUser: (token: string) =>
          Promise.resolve(
            token === "token-a"
              ? { data: { user: { id: USER_A } }, error: null }
              : { data: { user: null }, error: { message: "invalid JWT" } },
          ),
      },
      from: () => ({
        select: () => ({
          eq: (_c: string, v: string) => ({
            maybeSingle: () => Promise.resolve({ data: v === USER_A ? credRow : null, error: null }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const server = http.createServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as AddressInfo).port;
    const hub = new SubscriptionHub();
    const m = manager();
    const acquireSpy = vi.spyOn(m, "acquireFor");
    const fanout = new WsFanout({ server, supabase, sessions: m, hub, credKey, path: "/ws", symbols: SYMBOLS });
    let ws: TestWs | null = null;
    try {
      ws = await connectWs(port, "/ws");
      const inbox: RelayOutbound[] = [];
      ws.raw.on("message", (data) => inbox.push(JSON.parse(data.toString()) as RelayOutbound));
      ws.sendAuth("token-a");
      await waitFor(() => inbox.some((f) => f.t === "state" && f.s === "ready"), "ready 상태 프레임");

      expect(acquireSpy.mock.calls.map((c) => c[1])).toEqual(["KB"]);
      expect(kb.sockets).toHaveLength(1);
      expect(kyobo.sockets).toHaveLength(0);
      expect(m.sessionsOf(USER_A).map((s) => s.serverKey)).toEqual(["KB120"]);

      ws.sendRaw(orderNew(SAMPLE_ACCOUNT_NO, "rid-wss"));
      await waitFor(() => orderAccountsOf(kbPayloads).length === 1, "KB 스텁 DirectOrderReq (wss)");
      expect(orderAccountsOf(kyoboPayloads)).toEqual([]);
    } finally {
      await ws?.close();
      await fanout.close();
      hub.closeAll();
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
