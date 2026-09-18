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

import { INBOUND_RATE_LIMIT_PER_SEC, WsFanout, type WsFanoutDeps } from "../src/ws/fanout.js";
import { SubscriptionHub } from "../src/hub/subscription-hub.js";
import { SessionManager } from "../src/dma/session-manager.js";
import { encryptDmaPassword } from "../src/store/credentials.js";
import { resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { MSG } from "../src/dma/msg-type.js";
import { logger } from "../src/logger.js";
import type { SymbolInfo, SymbolLookup } from "../src/store/symbols.js";
import { startFakeGateway, readArmLatchRequest, type FakeGateway } from "./helpers/fake-gateway.js";
import { connectWs, type TestWs } from "./helpers/ws-client.js";
import {
  SAMPLE_ACCOUNT_NO,
  SAMPLE_ISIN,
  buildServerMessageFrame,
  buildSetVITriggerRespFrame,
} from "./helpers/frames.js";

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

  // ==========================================================
  // ② 가드 3종 동형 — Ready 세션 · 전략 키 형식 · 세션 계좌
  //
  // 거부 케이스는 **전부** 「게이트웨이 수신 프레임 0」을 함께 단언한다. 거부 로그만 보면
  // 실제로 안 나갔는지 알 수 없고, 래치 ON 은 **발주 판정을 시작**시키므로 잘못 나간 프레임
  // 하나가 남의 전략을 무장시킨다 (T-17-11).
  // ==========================================================

  it("②-1 세션이 Ready 가 아니면 lc.arm 은 게이트웨이로 0바이트다 (T-17-12)", async () => {
    // 게이트웨이가 로그인에 답하지 않는다 — 붙었지만 준비되지 않은 세션이다.
    gateway.silenceLogin();
    const { ws, inbox } = await open();
    ws.sendAuth("token-a");
    await waitFor(() => framesOf(inbox, "state").length > 0, "상태 프레임");

    ws.sendRaw({ t: "lc.arm", key: ARM_KEY, latch: "sell" });
    await waitFor(
      () => framesOf(inbox, "state").some((m) => m.msg !== undefined),
      "세션 미준비 거부",
    );
    await flushIo(30);

    expect(armReqs()).toHaveLength(0);
    // **현재 상태**를 그대로 되돌린다 — 배지와 거부 사유가 한 프레임으로 맞는다.
    expect(framesOf(inbox, "state").every((m) => m.s !== "ready")).toBe(true);
  });

  it("②-2 dma_credentials 미등록 사용자의 lc.arm 도 0바이트다 (D-04)", async () => {
    const { ws, inbox } = await open();
    ws.sendAuth("token-none");
    await waitFor(() => inbox.length > 0, "unauthorized 상태 프레임");

    ws.sendRaw({ t: "lc.arm", key: ARM_KEY, latch: "sell" });
    await waitFor(() => inbox.length > 1, "거부 상태 프레임");
    await flushIo(30);

    expect(inbox[1]).toEqual({ t: "state", s: "unauthorized" });
    expect(armReqs()).toHaveLength(0);
  });

  it("②-3 3토막이 아닌 key 는 거부되고 게이트웨이로 0바이트다", async () => {
    const { ws, inbox } = await authed("token-a");

    ws.sendRaw({ t: "lc.arm", key: `${SAMPLE_ISIN}:${SAMPLE_ACCOUNT_NO}`, latch: "sell" });
    await waitFor(() => framesOf(inbox, "msg").length === 1, "형식 거부 통지");
    await flushIo(30);

    expect(armReqs()).toHaveLength(0);
    expect(framesOf(inbox, "msg")[0]?.m).toContain("전략 키 형식");
  });

  it("②-4 ISIN 이 12자가 아닌 key 는 거부되고 게이트웨이로 0바이트다", async () => {
    const { ws, inbox } = await authed("token-a");

    ws.sendRaw({ t: "lc.arm", key: `KR70059300:${SAMPLE_ACCOUNT_NO}:KRX`, latch: "sell" });
    await waitFor(() => framesOf(inbox, "msg").length === 1, "형식 거부 통지");
    await flushIo(30);

    expect(armReqs()).toHaveLength(0);
  });

  it("②-5 exchange 가 KRX/NXT 밖이면 거부되고 게이트웨이로 0바이트다", async () => {
    const { ws, inbox } = await authed("token-a");

    ws.sendRaw({ t: "lc.arm", key: `${SAMPLE_ISIN}:${SAMPLE_ACCOUNT_NO}:NYSE`, latch: "cancel" });
    await waitFor(() => framesOf(inbox, "msg").length === 1, "형식 거부 통지");
    await flushIo(30);

    expect(armReqs()).toHaveLength(0);
  });

  it("②-6 형식 거부 로그에 계좌번호를 싣지 않는다 — latch 와 사유뿐이다 (T-16-45)", async () => {
    const warnSpy = vi.spyOn(logger, "warn");
    const { ws, inbox } = await authed("token-a");

    ws.sendRaw({ t: "lc.arm", key: `${SAMPLE_ISIN}:${SAMPLE_ACCOUNT_NO}:NYSE`, latch: "buy" });
    await waitFor(() => framesOf(inbox, "msg").length === 1, "형식 거부 통지");
    await flushIo(30);

    const logged = warnSpy.mock.calls.find((call) =>
      String(call[1] ?? "").includes("전략 키 형식 위반"),
    );
    expect(logged).toBeDefined();
    const fields = (logged?.[0] ?? {}) as Record<string, unknown>;
    // 키에는 계좌번호가 들어 있다 — 키째 싣는 것도 금지다.
    expect(fields).not.toHaveProperty("accountNo");
    expect(fields).not.toHaveProperty("key");
    expect(JSON.stringify(fields)).not.toContain(SAMPLE_ACCOUNT_NO);
    expect(fields.latch).toBe("buy");
  });

  it("②-7 세션 계좌 목록 밖 계좌의 lc.arm 은 게이트웨이로 0바이트다 (T-17-11)", async () => {
    const errSpy = vi.spyOn(logger, "error");
    const { ws, inbox } = await authed("token-a");

    ws.sendRaw({
      t: "lc.arm",
      key: `${SAMPLE_ISIN}:${FOREIGN_ACCOUNT_NO}:KRX`,
      latch: "sell",
    });
    await waitFor(() => framesOf(inbox, "msg").length === 1, "계좌 거부 통지");
    await flushIo(30);

    expect(armReqs()).toHaveLength(0);
    // 사유는 `lc.set` 이 쓰는 **같은 문구**다 — 가드가 한 벌이라는 증거다.
    const [rejected] = framesOf(inbox, "msg");
    expect(rejected?.m).toContain("이 세션에서 사용할 수 없는 계좌입니다");
    expect(rejected?.a).toBe(FOREIGN_ACCOUNT_NO);
    // 로그의 계좌번호는 마스킹본이다 (S-5 / T-16-09).
    const logged = errSpy.mock.calls.find((call) =>
      String(call[1] ?? "").includes("세션 계좌 목록 밖"),
    );
    expect(logged).toBeDefined();
    expect(JSON.stringify(logged?.[0] ?? {})).not.toContain(FOREIGN_ACCOUNT_NO);
  });

  it("②-8 lc.arm 은 다른 인바운드와 **같은 버킷**을 쓴다 — 합계가 상한이다 (T-17-13)", async () => {
    const a = await authed("token-a");

    // 절반을 다른 종류로 먼저 태운다. 버킷이 갈렸다면 래치가 상한 전부를 다시 쓴다.
    const half = INBOUND_RATE_LIMIT_PER_SEC / 2;
    for (let i = 0; i < half; i += 1) {
      a.ws.sendRaw({ t: "vi.confirm", orderNo: `000000000${i}`, confirmed: true });
    }
    for (let i = 0; i < INBOUND_RATE_LIMIT_PER_SEC; i += 1) {
      a.ws.sendRaw({ t: "lc.arm", key: ARM_KEY, latch: "sell" });
    }
    await waitFor(() => armReqs().length >= half, "래치 잔여 토큰만큼 통과");
    await flushIo(40);

    // 남은 토큰은 절반뿐이다 — 별도 버킷이면 여기가 10 이 된다.
    expect(armReqs()).toHaveLength(half);
    expect(a.ws.closeInfo).toBeNull();
  });

  // ==========================================================
  // ③ 실패 경로 회귀 — 54 한글 사유 그대로 · 별도 ack 없음 · FIFO 무오염
  //
  // 문구는 gh-trade `server/src/net/Gateway.cpp` 원문이다(실측 2026-09-18). relay 가
  // 문구를 해석·치환하지 않는다는 것을 **문자열 동등 비교**로 굳힌다 — 서버 어휘가 바뀌면
  // 화면이 아니라 이 테스트가 먼저 말해야 한다.
  // ==========================================================

  /** 36 거부 — 전략 없음 (`Gateway.cpp:3040`). */
  const REJECT_SELL = "등록된 상따 전략이 없습니다 — 매도 래치를 켤 수 없습니다";
  /** 37 거부 — 매수 미체결 없음. 매도판에는 없는 두 번째 전제다 (`Gateway.cpp:3136`). */
  const REJECT_CANCEL = "취소할 매수 미체결이 없습니다 — 미체결이 생긴 뒤에 켜세요";
  /**
   * 38 거부 — **매도잔량 기준(side "0")에는 매수 래치가 없다** (`Gateway.cpp:3216` / BL-01).
   *
   * 이 문구가 곧 「매도잔량 기준 매수 래치는 클릭 불가」라는 결정의 **서버측 정본**이다.
   * relay 는 그 전제를 재판정하지 않고(에코 캐시로 `buyWatchSide` 를 보지 않는다) 서버가
   * 내려보낸 사유를 그대로 나른다 — 판정이 두 벌이 되면 캐시가 낡은 순간 갈린다.
   */
  const REJECT_BUY =
    "매도잔량 기준에서는 매수 진입 확인 래치가 없습니다 — 매수잔량 기준일 때만 켤 수 있습니다";

  it.each([
    ["sell", MSG.ArmSellLatchReq, REJECT_SELL],
    ["cancel", MSG.ArmCancelLatchReq, REJECT_CANCEL],
    ["buy", MSG.ArmBuyLatchReq, REJECT_BUY],
  ] as const)(
    "③-1 %s 래치 거부는 서버 한글 문구 그대로 기존 msg 경로로 온다",
    async (latch, msgType, reason) => {
      const { ws, inbox } = await authed("token-a");

      ws.sendRaw({ t: "lc.arm", key: ARM_KEY, latch });
      await waitFor(() => armReqs().length === 1, `${msgType} 송신`);
      expect(armReqs()[0]?.msgType).toBe(msgType);

      // 서버는 별도 거부 응답 번호 없이 `ServerMessage(54)` WARN 으로 사유를 보낸다.
      gateway.sendFrame(
        gatewaySocket(),
        buildServerMessageFrame({ level: "WARN", message: reason, source: "System", kind: "" }),
      );
      await waitFor(() => framesOf(inbox, "msg").length === 1, "54 사유 수신");
      await flushIo(30);

      // **동등 비교**다 — relay 가 한 글자도 고치지 않았다는 뜻이다 (D-36).
      expect(framesOf(inbox, "msg")[0]?.m).toBe(reason);
      expect(framesOf(inbox, "msg")[0]?.lv).toBe("WARN");
    },
  );

  it("③-2 래치 왕복에서 브라우저가 받는 t 는 lc 와 msg 뿐이다 — 전용 ack 프레임이 없다", async () => {
    const { ws, inbox } = await authed("token-a");
    const before = inbox.length;

    ws.sendRaw({ t: "lc.arm", key: ARM_KEY, latch: "sell" });
    await waitFor(() => armReqs().length === 1, "36 송신");
    gateway.pushLimitChaserEcho(gatewaySocket(), {
      isin: SAMPLE_ISIN,
      accountNo: SAMPLE_ACCOUNT_NO,
      exchange: "KRX",
      sellEnabled: true,
      sellEntryLatched: true,
    });
    await waitFor(() => framesOf(inbox, "lc").length === 1, "60 에코");

    ws.sendRaw({ t: "lc.arm", key: ARM_KEY, latch: "buy" });
    await waitFor(() => armReqs().length === 2, "38 송신");
    gateway.sendFrame(
      gatewaySocket(),
      buildServerMessageFrame({ level: "WARN", message: REJECT_BUY, source: "System", kind: "" }),
    );
    await waitFor(() => framesOf(inbox, "msg").length === 1, "54 사유");
    await flushIo(40);

    // 성공은 60 에코가, 실패는 54 문구가 말한다. 그 사이에 새 `t` 값이 끼지 않는다 (D-04).
    expect(new Set(inbox.slice(before).map((m) => m.t))).toEqual(new Set(["lc", "msg"]));
  });

  /*
    Pitfall 3 / T-17-14 — 래치 요청은 pending-key FIFO 에 들어가지 않는다.

    60 에코는 본문에 키가 있어 귀속이 필요 없다. 그런데도 요청을 큐에 넣으면 그 head 를
    아무도 꺼내지 않아, **다음 빈 응답**이 옛 키로 귀속된다(C# VI Get 의 같은 함정).

    지금 relay 의 빈 61 귀속은 「거래소 정보가 없으므로 `"KRX"`」다 — 21 을 KRX 한 번만
    보내는 현행 동작과 같다(`subscription-hub.ts` `#onViTrigger`). 21 을 두 거래소로 넓히고
    요청 거래소 FIFO 를 세우는 것은 17-05 이므로, 여기서는 **17-05 이전의 현행 동작**을
    기준선으로 박는다: 래치를 몇 번 보내든 빈 61 의 귀속이 달라지지 않는다.
  */
  it("③-3 lc.arm 3연타 뒤 빈 61 은 여전히 미등록으로 귀속된다 — FIFO 가 오염되지 않았다", async () => {
    const { ws, inbox } = await authed("token-a");
    const viBefore = framesOf(inbox, "vi").length;

    for (const latch of ["sell", "cancel", "buy"] as const) {
      ws.sendRaw({ t: "lc.arm", key: ARM_KEY, latch });
    }
    await waitFor(() => armReqs().length === 3, "36·37·38 3연타 송신");

    // VI 미등록 = 테이블 없는 빈 61. 본문에 거래소도 키도 없다.
    gateway.sendFrame(gatewaySocket(), buildSetVITriggerRespFrame(null));
    await waitFor(() => framesOf(inbox, "vi").length === viBefore + 1, "빈 61 귀속");
    await flushIo(30);

    // 옛 키(래치 요청의 전략 키)로 귀속되지 않는다 — 미등록 그대로다.
    expect(framesOf(inbox, "vi").at(-1)).toEqual({ t: "vi", x: "KRX", cfg: null });
    // 빈 61 이 상따 에코로 새지도 않는다.
    expect(framesOf(inbox, "lc")).toHaveLength(0);
  });
});
