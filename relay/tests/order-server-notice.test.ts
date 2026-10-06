/**
 * Phase 29 Plan 22 — ADMIN-06 · D-10. 「주문 서버 바뀜」 상태 프레임(`{t:"order.server"}`).
 *
 * 경로: 레지스트리(흉내 — 증권사 → 주문 서버 표) 변경 → `fanout.notifyOrderServers(orderServerOf)` → 열린 세션 서버 ≠ 주문
 * 서버인 사용자의 연결마다 `{ t: "order.server", broker, current, next }` 1건. 세션은 끊지도 옮기지도 않는다(D-10).
 *
 * 실 `WsFanout` · 실 `SessionManager`(`resolveTarget` = 아래 주문 서버 표) · 실 `SubscriptionHub` · TCP 로 붙는 스텁 게이트웨이
 * 3대(KB120 · KB121 · KYOBO119). 가짜는 Supabase 토큰 검증 · 자격증명 공급자 · 교보 매핑(`brokersFor`) 셋뿐이다.
 *
 * 검증 대상 (29-22 Task 1 behavior — relay):
 *   ① KB 세션 KB120 · 주문 서버 KB121 로 → 그 사용자 연결마다 `{KB, KB120, KB121}` 1건 · 세션 그대로(LoginReq 증가 0)
 *   ② 같은 표식은 재적재마다 다시 보내지 않는다
 *   ③ KB 세션이 없는 사용자(권한 없음) 0 · 교보 주문 서버만 바뀜(교보 세션 없음) 0
 *   ④ 교보 세션 사용자 · 교보 주문 서버 KYOBO119 → KYOBO127 → `{KYOBO, KYOBO119, KYOBO127}` 만(KB 무관)
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as flatbuffers from "flatbuffers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RelayOrderServerMsg, RelayOutbound, RelayStateMsg } from "@gh-radar/shared";

import { SessionManager, type DmaCredentials, type SessionTarget } from "../src/dma/session-manager.js";
import { resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { MSG } from "../src/dma/msg-type.js";
import { Envelope } from "../src/generated/stock-dma/envelope.js";
import { WsFanout } from "../src/ws/fanout.js";
import { SubscriptionHub } from "../src/hub/subscription-hub.js";
import type { DmaBroker } from "../src/registry/registry.js";
import { startFakeGateway, type FakeGateway } from "./helpers/fake-gateway.js";
import { connectWs, type TestWs } from "./helpers/ws-client.js";

const USER_A = "3f1c2b7a-9d40-4a11-8e55-0000000022a1";
const USER_B = "3f1c2b7a-9d40-4a11-8e55-0000000022b2";
const CREDS: DmaCredentials = { dmaUserId: "dma-d22", password: "pw-절대노출금지" };

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

function envOf(p: Buffer): Envelope {
  return Envelope.getRootAsEnvelope(new flatbuffers.ByteBuffer(new Uint8Array(p.buffer, p.byteOffset, p.length)));
}

function loginCount(payloads: Buffer[]): number {
  return payloads.filter((p) => envOf(p).msgType() === MSG.LoginReq).length;
}

function statesOf(inbox: RelayOutbound[]): RelayStateMsg[] {
  return inbox.filter((m): m is RelayStateMsg => m.t === "state");
}

function noticesOf(inbox: RelayOutbound[]): RelayOrderServerMsg[] {
  return inbox.filter((m): m is RelayOrderServerMsg => m.t === "order.server");
}

function supabaseStub(): SupabaseClient {
  const users: Record<string, string> = { "token-a": USER_A, "token-b": USER_B };
  return {
    auth: {
      getUser: (token: string) =>
        Promise.resolve(
          users[token] !== undefined
            ? { data: { user: { id: users[token] } }, error: null }
            : { data: { user: null }, error: { message: "invalid JWT" } },
        ),
    },
  } as unknown as SupabaseClient;
}

describe("WsFanout — 주문 서버 바뀜 프레임 (29-22 · D-10)", () => {
  let kb120: FakeGateway;
  let kb121: FakeGateway;
  let kyobo: FakeGateway;
  const payloads = new Map<string, Buffer[]>();
  let server: http.Server;
  let port: number;
  let hub: SubscriptionHub;
  let manager: SessionManager;
  let fanout: WsFanout;
  /** 레지스트리 흉내 — 증권사 → 지금 주문 서버. 세션 생성(resolveTarget)과 표식 원천(orderServerOf)이 같은 표를 본다. */
  let orderServers: Map<DmaBroker, SessionTarget>;
  let targets: Map<string, SessionTarget>;
  let kyoboMapped: boolean;
  const sockets: TestWs[] = [];

  const orderServerOf = (broker: DmaBroker): string | undefined => orderServers.get(broker)?.serverKey;

  function switchOrderServer(broker: DmaBroker, serverKey: string): void {
    const t = targets.get(serverKey);
    if (t === undefined) throw new Error(`없는 서버 ${serverKey}`);
    orderServers.set(broker, t);
  }

  async function setup(): Promise<void> {
    kb120 = await startFakeGateway({ autoLogin: true, loginResp: { success: true } });
    kb121 = await startFakeGateway({ autoLogin: true, loginResp: { success: true } });
    kyobo = await startFakeGateway({
      autoLogin: true,
      loginResp: { success: true, accounts: [{ accountNo: "7777777701", name: "교보 위탁" }] },
    });
    payloads.clear();
    for (const [key, gw] of [
      ["KB120", kb120],
      ["KB121", kb121],
      ["KYOBO119", kyobo],
    ] as const) {
      const list: Buffer[] = [];
      payloads.set(key, list);
      gw.onFrame((_t, payload) => list.push(Buffer.from(payload)));
    }
    targets = new Map<string, SessionTarget>([
      ["KB120", { serverKey: "KB120", host: "127.0.0.1", port: kb120.port, broker: "KB" }],
      ["KB121", { serverKey: "KB121", host: "127.0.0.1", port: kb121.port, broker: "KB" }],
      ["KYOBO119", { serverKey: "KYOBO119", host: "127.0.0.1", port: kyobo.port, broker: "KYOBO" }],
      // 교보 예비 서버는 스텁을 세우지 않는다 — 주문 서버로 지정만 하고 세션은 열지 않는 경우만 본다.
      ["KYOBO127", { serverKey: "KYOBO127", host: "127.0.0.1", port: 1, broker: "KYOBO" }],
    ]);
    orderServers = new Map<DmaBroker, SessionTarget>();
    switchOrderServer("KB", "KB120");
    switchOrderServer("KYOBO", "KYOBO119");
    manager = new SessionManager({
      host: "127.0.0.1",
      port: 1,
      broker: "KB",
      resolveTarget: (b) => orderServers.get(b as DmaBroker),
    });
    hub = new SubscriptionHub();
    server = http.createServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as AddressInfo).port;
    fanout = new WsFanout({
      server,
      supabase: supabaseStub(),
      sessions: manager,
      hub,
      credKey: randomBytes(32).toString("base64"),
      credentials: (userId) => Promise.resolve(userId === USER_A ? CREDS : null),
      brokersFor: (dmaUserId): DmaBroker[] => (dmaUserId === CREDS.dmaUserId && kyoboMapped ? ["KB", "KYOBO"] : ["KB"]),
      path: "/ws",
    });
  }

  async function tab(token = "token-a"): Promise<{ ws: TestWs; inbox: RelayOutbound[] }> {
    const ws = await connectWs(port, "/ws");
    sockets.push(ws);
    const inbox: RelayOutbound[] = [];
    ws.raw.on("message", (data) => inbox.push(JSON.parse(data.toString()) as RelayOutbound));
    ws.sendAuth(token);
    await waitFor(() => statesOf(inbox).length > 0, "인증 상태 프레임");
    return { ws, inbox };
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    resetDroppedEnvelopeCount();
    kyoboMapped = false;
  });

  afterEach(async () => {
    for (const ws of sockets.splice(0)) await ws.close();
    await fanout?.close();
    await manager?.closeAll();
    hub?.closeAll();
    await new Promise<void>((r) => server.close(() => r()));
    await kb120.close();
    await kb121.close();
    await kyobo.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("Task 1 — 레지스트리 주문 서버 변경 → order.server", () => {
    it("① KB120 세션 · 주문 서버 KB121 로 → 연결마다 {KB, KB120, KB121} 1건 · 세션 그대로(LoginReq 증가 0)", async () => {
      await setup();
      const a = await tab();
      const b = await tab();
      await waitFor(() => statesOf(b.inbox).some((f) => f.s === "ready"), "ready");
      expect(manager.sessionsOf(USER_A).map((s) => s.serverKey)).toEqual(["KB120"]);
      expect(noticesOf(a.inbox)).toEqual([]);
      const loginsBefore = loginCount(payloads.get("KB120")!);

      switchOrderServer("KB", "KB121");
      const sent = fanout.notifyOrderServers(orderServerOf);
      await waitFor(() => noticesOf(a.inbox).length > 0 && noticesOf(b.inbox).length > 0, "두 탭 표식");
      await flushIo(10);

      const expected: RelayOrderServerMsg = { t: "order.server", broker: "KB", current: "KB120", next: "KB121" };
      expect(sent).toBe(1);
      expect(noticesOf(a.inbox)).toEqual([expected]);
      expect(noticesOf(b.inbox)).toEqual([expected]);
      // 열린 세션은 예전 서버에 그대로 — 끊지도 옮기지도 않는다(D-10).
      expect(manager.sessionsOf(USER_A).map((s) => s.serverKey)).toEqual(["KB120"]);
      expect(manager.sessionsOf(USER_A)[0]?.state).toBe("ready");
      expect(loginCount(payloads.get("KB120")!)).toBe(loginsBefore);
      expect(loginCount(payloads.get("KB121")!)).toBe(0);
      expect(kb121.sockets).toHaveLength(0);
      // 프레임에는 서버 키와 증권사뿐이다 — 계좌 · 식별자 없음.
      expect(Object.keys(noticesOf(a.inbox)[0]!).sort()).toEqual(["broker", "current", "next", "t"]);
    });

    it("② 같은 표식은 재적재마다 다시 보내지 않는다", async () => {
      await setup();
      const a = await tab();
      switchOrderServer("KB", "KB121");
      expect(fanout.notifyOrderServers(orderServerOf)).toBe(1);
      expect(fanout.notifyOrderServers(orderServerOf)).toBe(0);
      expect(fanout.notifyOrderServers(orderServerOf)).toBe(0);
      await flushIo(10);
      expect(noticesOf(a.inbox)).toHaveLength(1);
    });

    it("③ KB 세션이 없는 사용자(권한 없음) 0 · 교보 주문 서버만 바뀜(교보 세션 없음) 0", async () => {
      await setup();
      const a = await tab();
      const other = await tab("token-b");
      expect(statesOf(other.inbox).map((f) => f.s)).toEqual(["unauthorized"]);

      switchOrderServer("KYOBO", "KYOBO127");
      expect(fanout.notifyOrderServers(orderServerOf)).toBe(0);
      switchOrderServer("KB", "KB121");
      expect(fanout.notifyOrderServers(orderServerOf)).toBe(1);
      await flushIo(10);
      expect(noticesOf(other.inbox)).toEqual([]);
      expect(noticesOf(a.inbox).map((n) => n.broker)).toEqual(["KB"]);
    });

    it("④ 교보 세션 사용자 · 교보 주문 서버 KYOBO119 → KYOBO127 → {KYOBO, KYOBO119, KYOBO127} 만", async () => {
      kyoboMapped = true;
      await setup();
      const a = await tab();
      await waitFor(() => manager.sessionsOf(USER_A).length === 2, "세션 2");

      switchOrderServer("KYOBO", "KYOBO127");
      expect(fanout.notifyOrderServers(orderServerOf)).toBe(1);
      await flushIo(10);
      expect(noticesOf(a.inbox)).toEqual([{ t: "order.server", broker: "KYOBO", current: "KYOBO119", next: "KYOBO127" }]);
      expect(manager.sessionsOf(USER_A).map((s) => s.serverKey)).toEqual(["KB120", "KYOBO119"]);
    });
  });
});
