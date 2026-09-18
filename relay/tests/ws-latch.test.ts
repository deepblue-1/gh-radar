/**
 * Phase 17 Plan 04 — TRADE-05. **상따 래치 수동 점등** wss 경로 통합 테스트 (D-04).
 *
 * 검증 대상은 「브라우저 클릭 1건이 게이트웨이의 36/37/38 요청으로 도달하는가」이고,
 * 그 반대편인 「도달하면 안 되는 것이 정말 안 나갔는가」다:
 *   · `{t:"lc.arm", key, latch}` → `Envelope{msg_type=36|37|38, get_strategy_req={key}}`
 *   · 가드는 `lc.set` 과 **동형** — Ready 세션 · 전략 키 형식 · 세션 계좌 (T-17-11 / T-17-12)
 *   · 거부는 언제나 「게이트웨이 수신 프레임 0」과 함께 단언한다 — 거부 로그만 보면 실제로
 *     안 나갔는지 알 수 없다
 *   · 성공은 기존 `lc`(60 에코), 실패는 기존 `msg`(54) 로만 말한다 — **별도 ack 프레임 없음**
 *   · 래치 요청은 pending-key FIFO 를 오염시키지 않는다 (Pitfall 3 / T-17-14)
 *
 * 하네스는 `ws-order.test.ts` 와 같은 모양이다 — 스텁은 Supabase(토큰·자격증명) 하나뿐이고
 * 실제 ws 서버 · 실제 TCP 로 붙는 가짜 게이트웨이 · 실제 `SessionManager`/`SubscriptionHub`
 * 가 전부 진짜다. 이 경로가 **이어지는지**가 이 plan 의 핵심 리스크라 중간을 가짜로 채우면
 * 검증이 아무것도 증명하지 못한다.
 *
 * ⚠️ 게이트웨이로 나간 요청은 **디코드해서** 본다(`readArmLatchRequest`). 스텁이 요청을
 *    해석해 주면 그 해석이 곧 프로덕션 조립기의 정답지가 되어 검증이 순환한다.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import net from "node:net";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RelayOutbound } from "@gh-radar/shared";

import { WsFanout, type WsFanoutDeps } from "../src/ws/fanout.js";
import { SubscriptionHub } from "../src/hub/subscription-hub.js";
import { SessionManager } from "../src/dma/session-manager.js";
import { encryptDmaPassword } from "../src/store/credentials.js";
import { resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { MSG } from "../src/dma/msg-type.js";
import type { SymbolInfo, SymbolLookup } from "../src/store/symbols.js";
import { startFakeGateway, readArmLatchRequest, type FakeGateway } from "./helpers/fake-gateway.js";
import { connectWs, type TestWs } from "./helpers/ws-client.js";
import { SAMPLE_ACCOUNT_NO, SAMPLE_ISIN } from "./helpers/frames.js";

const WS_PATH = "/ws";

/** 상따 전략 키 — `strategyKey(ISIN, accountNo, exchange)` 와 **같은 값**이다 (D-04). */
const ARM_KEY = `${SAMPLE_ISIN}:${SAMPLE_ACCOUNT_NO}:KRX`;

/** `SAMPLE_ACCOUNTS` 에 **없는** 계좌 — 화이트리스트 밖 요청을 만든다 (T-17-11). */
const FOREIGN_ACCOUNT_NO = "9999999999";

const USER_A = "3f1c2b7a-9d40-4a11-8e55-00000000000a";
/** 로그인은 되지만 `dma_credentials` 매핑이 없는 사용자 — 세션이 서지 않는다 (T-17-12). */
const USER_NONE = "3f1c2b7a-9d40-4a11-8e55-00000000000c";

const CRED_KEY = randomBytes(32).toString("base64");

const TOKENS = new Map<string, string>([
  ["token-a", USER_A],
  ["token-none", USER_NONE],
]);

type CredRow = { dma_user_id: string; dma_password_enc: string };

const CRED_ROWS = new Map<string, CredRow>([
  [USER_A, { dma_user_id: "kb-a", dma_password_enc: encryptDmaPassword("pw-a", USER_A, CRED_KEY) }],
]);

const SYMBOLS: SymbolLookup = {
  lookup: (isin: string): SymbolInfo | undefined =>
    isin === SAMPLE_ISIN ? { code: "005930", name: "삼성전자", market: "K" } : undefined,
};

function fakeSupabase(): SupabaseClient {
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

function framesOf<T extends RelayOutbound["t"]>(
  inbox: RelayOutbound[],
  t: T,
): Extract<RelayOutbound, { t: T }>[] {
  return inbox.filter((m): m is Extract<RelayOutbound, { t: T }> => m.t === t);
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

describe("wss 상따 래치 점등 경로 (D-04)", () => {
  let gateway: FakeGateway;
  let server: http.Server;
  let fanout: WsFanout;
  let hub: SubscriptionHub;
  let sessions: SessionManager;
  let port: number;
  /** 게이트웨이가 받은 프레임 원문(요청 대역 포함). */
  let gatewayFrames: { msgType: number; payload: Buffer }[];
  const sockets: TestWs[] = [];

  /** 게이트웨이로 나간 래치 요청(36/37/38)만 디코드해 좁힌다. */
  function armReqs(): { msgType: number; key: string }[] {
    return gatewayFrames
      .map((f) => ({ msgType: f.msgType, key: readArmLatchRequest(f.msgType, f.payload) }))
      .filter((r): r is { msgType: number; key: string } => r.key !== null);
  }

  async function startHarness(overrides: Partial<WsFanoutDeps> = {}): Promise<void> {
    server = http.createServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as AddressInfo).port;

    hub = new SubscriptionHub();
    sessions = new SessionManager({ host: "127.0.0.1", port: gateway.port, broker: "KB" });

    fanout = new WsFanout({
      server,
      supabase: fakeSupabase(),
      sessions,
      hub,
      credKey: CRED_KEY,
      path: WS_PATH,
      symbols: SYMBOLS,
      ...overrides,
    });
  }

  async function open(): Promise<{ ws: TestWs; inbox: RelayOutbound[] }> {
    const ws = await connectWs(port, WS_PATH);
    sockets.push(ws);
    const inbox: RelayOutbound[] = [];
    ws.raw.on("message", (data) => inbox.push(JSON.parse(data.toString()) as RelayOutbound));
    return { ws, inbox };
  }

  /**
   * 인증 + **인증 직후 스냅샷이 전부 도착할 때까지** 기다린다.
   *
   * 스냅샷(`lc.snap`·`vi`·`vi.list`·`rate.cross.snap`)은 Ready 상태 프레임보다 **뒤에** 온다.
   * 그것을 기다리지 않으면 「`lc.arm` 왕복에서 새 `t` 값이 생기지 않는다」류의 단언이 남은
   * 스냅샷 프레임을 잉여 ack 로 오인한다 — 게이트가 자기 소음을 잡는 셈이 된다.
   */
  async function authed(token: string): Promise<{ ws: TestWs; inbox: RelayOutbound[] }> {
    const conn = await open();
    conn.ws.sendAuth(token);
    await waitFor(
      () => conn.inbox.some((m) => m.t === "state" && m.s === "ready"),
      `${token} ready 상태 프레임`,
    );
    // `vi.list`(72) 는 Ready 프리페치 3종의 마지막 응답이다 — 그것이 왔으면 앞의 둘도 왔다.
    await waitFor(() => conn.inbox.some((m) => m.t === "vi.list"), `${token} 전략 스냅샷`);
    await flushIo(30);
    return conn;
  }

  /** 그 사용자의 DMA 소켓. 에코·통지를 밀어 넣을 대상이다. */
  function gatewaySocket(): net.Socket {
    const sock = gateway.sockets[0];
    if (sock === undefined) throw new Error("게이트웨이 연결이 없습니다");
    return sock;
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    resetDroppedEnvelopeCount();
    gatewayFrames = [];
    gateway = await startFakeGateway({ autoLogin: true, loginResp: { success: true } });
    gateway.onFrame((msgType, payload) =>
      gatewayFrames.push({ msgType, payload: Buffer.from(payload) }),
    );
    await startHarness();
  });

  afterEach(async () => {
    for (const ws of sockets) await ws.close();
    sockets.length = 0;
    await fanout.close();
    await sessions.closeAll();
    hub.closeAll();
    await new Promise<void>((r) => server.close(() => r()));
    await gateway.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ==========================================================
  // ① 한 경로 — zod → 조립기 → 게이트웨이 → 60 에코
  // ==========================================================

  it("①-1 latch:\"sell\" 은 msg_type 36 으로 나가고 get_strategy_req.key 가 전략 키다", async () => {
    const { ws } = await authed("token-a");

    ws.sendRaw({ t: "lc.arm", key: ARM_KEY, latch: "sell" });
    await waitFor(() => armReqs().length === 1, "36 송신");

    expect(armReqs()[0]).toEqual({ msgType: MSG.ArmSellLatchReq, key: ARM_KEY });
  });

  it("①-2 latch:\"cancel\" 은 msg_type 37 로 나간다", async () => {
    const { ws } = await authed("token-a");

    ws.sendRaw({ t: "lc.arm", key: ARM_KEY, latch: "cancel" });
    await waitFor(() => armReqs().length === 1, "37 송신");

    expect(armReqs()[0]).toEqual({ msgType: MSG.ArmCancelLatchReq, key: ARM_KEY });
  });

  it("①-3 latch:\"buy\" 는 msg_type 38 로 나간다", async () => {
    const { ws } = await authed("token-a");

    ws.sendRaw({ t: "lc.arm", key: ARM_KEY, latch: "buy" });
    await waitFor(() => armReqs().length === 1, "38 송신");

    expect(armReqs()[0]).toEqual({ msgType: MSG.ArmBuyLatchReq, key: ARM_KEY });
  });

  it("①-4 세 값 밖의 latch 는 zod 가 거부하고 게이트웨이로 0바이트다", async () => {
    const { ws } = await authed("token-a");

    ws.sendRaw({ t: "lc.arm", key: ARM_KEY, latch: "price" });
    await waitFor(() => ws.closeInfo !== null, "프로토콜 위반 close");
    await flushIo(30);

    // 프로토콜 위반은 close(4400) 다 — 관대하게 무시하면 공격 표면이 늘어난다 (D-11).
    expect(ws.closeInfo?.code).toBe(4400);
    expect(armReqs()).toHaveLength(0);
  });

  it("①-5 빈 key 는 zod 가 거부하고 게이트웨이로 0바이트다 (C# SendArmSellLatch 동형)", async () => {
    const { ws } = await authed("token-a");

    ws.sendRaw({ t: "lc.arm", key: "", latch: "sell" });
    await waitFor(() => ws.closeInfo !== null, "프로토콜 위반 close");
    await flushIo(30);

    expect(ws.closeInfo?.code).toBe(4400);
    expect(armReqs()).toHaveLength(0);
  });

  it("①-6 60 에코는 기존 `lc` 프레임으로 돌아온다 — 새 t 값이 생기지 않는다", async () => {
    const { ws, inbox } = await authed("token-a");
    const before = inbox.length;

    ws.sendRaw({ t: "lc.arm", key: ARM_KEY, latch: "sell" });
    await waitFor(() => armReqs().length === 1, "36 송신");

    // 서버는 전용 응답 번호 없이 **기존 60 에코**로 답한다 (D-04 / protocol.md:65).
    gateway.pushLimitChaserEcho(gatewaySocket(), {
      isin: SAMPLE_ISIN,
      accountNo: SAMPLE_ACCOUNT_NO,
      exchange: "KRX",
      sellEnabled: true,
      sellEntryLatched: true,
    });
    await waitFor(() => framesOf(inbox, "lc").length === 1, "lc 에코 프레임");
    await flushIo(30);

    const echoed = framesOf(inbox, "lc")[0];
    expect(echoed?.item.key).toBe(ARM_KEY);
    expect(echoed?.item.sellEntryLatched).toBe(true);
    // 왕복 전체에서 브라우저가 받은 종류는 `lc` 하나뿐이다 — 별도 ack 프레임이 없다.
    expect(new Set(inbox.slice(before).map((m) => m.t))).toEqual(new Set(["lc"]));
  });
});
