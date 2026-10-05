/**
 * Phase 27 Plan 02 — 자동매도 바로시작/중지(41) · 사용자 설정 저장(42) wss 경로 통합 테스트.
 *
 * `ws-latch.test.ts` 동형 하네스다 — 스텁은 Supabase(토큰 · 자격증명) 하나뿐이고 실제 ws 서버 · 실제 TCP 로 붙는
 * 가짜 게이트웨이 · 실제 `SessionManager`/`SubscriptionHub` 가 전부 진짜다. 검증 대상:
 *   · `{t:"autosell.cmd", …, action:"start"|"stop"}` → `Envelope{msg_type=41, auto_sell_command_req={…, action 1|2}}`
 *   · `{t:"user.settings.set", s:{11값}}` → `Envelope{msg_type=42, user_settings={11값 · present 슬롯 없음}}`
 *   · 가드 — Ready 세션 · 세션 계좌(41 만 · IDOR · D-09). 거부는 언제나 「게이트웨이 수신 0」과 함께 단언한다
 *   · relay 는 서버 진실을 지어내지 않는다 — 42 에 대해 84 를 합성하지 않고, 54 본문을 해석하지 않는다(교훈 24)
 *   · 41/42 는 pending FIFO 에 들어가지 않는다(T-16-10)
 *
 * ⚠️ 게이트웨이로 나간 요청은 **디코드해서** 본다(`readAutoSellCommandRequest` · `readSetUserSettingsRequest`).
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import net from "node:net";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RelayOutbound, RelayUserSettingsValues } from "@gh-radar/shared";

import { WsFanout, type WsFanoutDeps } from "../src/ws/fanout.js";
import { SubscriptionHub } from "../src/hub/subscription-hub.js";
import { SessionManager } from "../src/dma/session-manager.js";
import { encryptDmaPassword } from "../src/store/credentials.js";
import { resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
import { MSG } from "../src/dma/msg-type.js";
import { logger } from "../src/logger.js";
import type { SymbolInfo, SymbolLookup } from "../src/store/symbols.js";
import {
  readAutoSellCommandRequest,
  readSetUserSettingsRequest,
  startFakeGateway,
  type AutoSellCommandRequest,
  type FakeGateway,
  type SetUserSettingsRequest,
} from "./helpers/fake-gateway.js";
import { connectWs, type TestWs } from "./helpers/ws-client.js";
import {
  SAMPLE_ACCOUNT_NO,
  SAMPLE_ISIN,
  buildServerMessageFrame,
  buildSetVITriggerRespFrame,
} from "./helpers/frames.js";

const WS_PATH = "/ws";

/** `SAMPLE_ACCOUNTS` 에 **없는** 계좌 — 화이트리스트 밖 요청을 만든다 (IDOR · D-09). */
const FOREIGN_ACCOUNT_NO = "9999999999";

const USER_A = "3f1c2b7a-9d40-4a11-8e55-00000000000a";
/** 로그인은 되지만 `dma_credentials` 매핑이 없는 사용자 — 세션이 서지 않는다. */
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

/** `user.settings.set` 11값 — 서버 범위 안(fbs 주석). 기본값과 다른 칸을 섞어 왕복을 본다. */
const SETTINGS: RelayUserSettingsValues = {
  preBuyAmount: 5000,
  addBuyAmount: 3000,
  postBuyAmount: 2000,
  postBuyMaxCount: 4,
  postBuyFloorQty: 120_000,
  postBuyReboundPct: 25,
  sellQtyTrackRatio: 40,
  autoSellPeriodSec: 3,
  auctionSellRatioPct: 20,
  autoSellRatioDefaultPct: 10,
  autoSellMethodDefault: 3,
};

describe("Phase 27 autosell.cmd · user.settings.set", () => {
  let gateway: FakeGateway;
  let server: http.Server;
  let fanout: WsFanout;
  let hub: SubscriptionHub;
  let sessions: SessionManager;
  let port: number;
  /** 게이트웨이가 받은 프레임 원문(요청 대역 포함). */
  let gatewayFrames: { msgType: number; payload: Buffer }[];
  const sockets: TestWs[] = [];

  /** 게이트웨이로 나간 41 만 디코드해 좁힌다 — msg_type 만 세면 「보냈다」까지밖에 못 본다. */
  function autoSellReqs(): AutoSellCommandRequest[] {
    return gatewayFrames
      .map((f) => readAutoSellCommandRequest(f.payload))
      .filter((r): r is AutoSellCommandRequest => r !== null);
  }

  /** 게이트웨이로 나간 42 만 디코드해 좁힌다. */
  function settingsReqs(): SetUserSettingsRequest[] {
    return gatewayFrames
      .map((f) => readSetUserSettingsRequest(f.payload))
      .filter((r): r is SetUserSettingsRequest => r !== null);
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
   * 그것을 기다리지 않으면 「41 왕복에서 새 `t` 값이 생기지 않는다」류의 단언이 남은
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
  // ① autosell.cmd → 41
  // ==========================================================

  it("①-1 start 는 msg_type 41 · action 1 로 나간다 — isin/계좌/거래소가 그대로", async () => {
    const { ws } = await authed("token-a");

    ws.sendRaw({ t: "autosell.cmd", isin: SAMPLE_ISIN, accountNo: SAMPLE_ACCOUNT_NO, exchange: "KRX", action: "start" });
    await waitFor(() => autoSellReqs().length === 1, "41 송신");

    expect(gateway.strategyRequests().filter((r) => r.msgType === MSG.AutoSellCommandReq)).toHaveLength(1);
    expect(autoSellReqs()[0]).toEqual({ isin: SAMPLE_ISIN, accountNo: SAMPLE_ACCOUNT_NO, exchange: "KRX", action: 1 });
  });

  it("①-2 stop 은 action 2 로 나간다 — NXT 도 그대로", async () => {
    const { ws } = await authed("token-a");

    ws.sendRaw({ t: "autosell.cmd", isin: SAMPLE_ISIN, accountNo: SAMPLE_ACCOUNT_NO, exchange: "NXT", action: "stop" });
    await waitFor(() => autoSellReqs().length === 1, "41 송신");

    expect(autoSellReqs()[0]).toEqual({ isin: SAMPLE_ISIN, accountNo: SAMPLE_ACCOUNT_NO, exchange: "NXT", action: 2 });
  });

  it("①-3 성공은 기존 lc(60 에코)로 말한다 — 41 왕복에서 새 t 값이 생기지 않는다", async () => {
    const { ws, inbox } = await authed("token-a");
    const before = inbox.length;

    ws.sendRaw({ t: "autosell.cmd", isin: SAMPLE_ISIN, accountNo: SAMPLE_ACCOUNT_NO, exchange: "KRX", action: "start" });
    await waitFor(() => autoSellReqs().length === 1, "41 송신");
    gateway.pushLimitChaserEcho(gatewaySocket(), {
      isin: SAMPLE_ISIN,
      accountNo: SAMPLE_ACCOUNT_NO,
      exchange: "KRX",
      autoSellEnabled: true,
      autoSellState: 3,
    });
    await waitFor(() => framesOf(inbox, "lc").length === 1, "60 에코");
    await flushIo(30);

    expect(framesOf(inbox, "lc")[0]?.item.autoSellState).toBe(3);
    expect(new Set(inbox.slice(before).map((m) => m.t))).toEqual(new Set(["lc"]));
  });

  it("①-4 action 열거 밖(「pause」)은 zod 위반 close(4400) · 게이트웨이 0바이트", async () => {
    const { ws } = await authed("token-a");

    ws.sendRaw({ t: "autosell.cmd", isin: SAMPLE_ISIN, accountNo: SAMPLE_ACCOUNT_NO, exchange: "KRX", action: "pause" });
    await waitFor(() => ws.closeInfo !== null, "프로토콜 위반 close");
    await flushIo(30);

    expect(ws.closeInfo?.code).toBe(4400);
    expect(autoSellReqs()).toHaveLength(0);
  });

  // ==========================================================
  // ② 가드 — 세션 계좌(IDOR) · Ready 세션. 거부는 전부 「게이트웨이 41 0건」과 함께.
  // ==========================================================

  it("②-1 세션 계좌 목록 밖 계좌는 거부 프레임 · 게이트웨이 41 0건 · 로그 계좌 마스킹 (IDOR · D-09)", async () => {
    const errSpy = vi.spyOn(logger, "error");
    const { ws, inbox } = await authed("token-a");

    ws.sendRaw({ t: "autosell.cmd", isin: SAMPLE_ISIN, accountNo: FOREIGN_ACCOUNT_NO, exchange: "KRX", action: "start" });
    await waitFor(() => framesOf(inbox, "msg").length === 1, "계좌 거부 통지");
    await flushIo(30);

    expect(autoSellReqs()).toHaveLength(0);
    expect(gateway.strategyRequests().filter((r) => r.msgType === MSG.AutoSellCommandReq)).toHaveLength(0);
    const [rejected] = framesOf(inbox, "msg");
    // 사유는 lc.set · lc.arm 과 **같은 문구**다 — 가드가 한 벌(`#accountAllowed`)이라는 증거.
    expect(rejected?.m).toContain("이 세션에서 사용할 수 없는 계좌입니다");
    expect(rejected?.src).toBe("Relay");
    // 출처 태그(IN-01) — relay 거부는 전략 키를 싣지 않으므로 브라우저가 「41 의 답」을 이 값으로 가른다.
    expect(rejected?.kind).toBe("autosell.cmd");
    const logged = errSpy.mock.calls.find((call) => String(call[1] ?? "").includes("세션 계좌 목록 밖"));
    expect(logged).toBeDefined();
    expect(JSON.stringify(logged?.[0] ?? {})).not.toContain(FOREIGN_ACCOUNT_NO);
    expect(ws.closeInfo).toBeNull();
  });

  it("②-2 전략 세션이 없으면(dma_credentials 미등록) autosell.cmd · user.settings.set 모두 0바이트", async () => {
    const { ws, inbox } = await open();
    ws.sendAuth("token-none");
    await waitFor(() => inbox.length > 0, "unauthorized 상태 프레임");

    ws.sendRaw({ t: "autosell.cmd", isin: SAMPLE_ISIN, accountNo: SAMPLE_ACCOUNT_NO, exchange: "KRX", action: "start" });
    ws.sendRaw({ t: "user.settings.set", s: SETTINGS });
    await waitFor(() => inbox.length > 2, "거부 상태 프레임 2건");
    await flushIo(30);

    expect(inbox.slice(1)).toEqual([
      { t: "state", s: "unauthorized" },
      { t: "state", s: "unauthorized" },
    ]);
    expect(autoSellReqs()).toHaveLength(0);
    expect(settingsReqs()).toHaveLength(0);
  });

  it("②-3 세션이 Ready 가 아니면 거부 상태 프레임 · 41 · 42 0건", async () => {
    gateway.silenceLogin();
    const { ws, inbox } = await open();
    ws.sendAuth("token-a");
    await waitFor(() => framesOf(inbox, "state").length > 0, "상태 프레임");

    ws.sendRaw({ t: "autosell.cmd", isin: SAMPLE_ISIN, accountNo: SAMPLE_ACCOUNT_NO, exchange: "KRX", action: "start" });
    ws.sendRaw({ t: "user.settings.set", s: SETTINGS });
    await waitFor(
      () => framesOf(inbox, "state").filter((m) => m.msg !== undefined).length >= 2,
      "세션 미준비 거부 2건",
    );
    await flushIo(30);

    expect(autoSellReqs()).toHaveLength(0);
    expect(settingsReqs()).toHaveLength(0);
    expect(framesOf(inbox, "state").every((m) => m.s !== "ready")).toBe(true);
  });

  it("②-4 41 은 pending FIFO 를 늘리지 않는다 — 3연타 뒤 귀속 근거 없는 빈 61 은 어느 칸도 건드리지 않는다 (T-16-10)", async () => {
    const { ws, inbox } = await authed("token-a");
    await flushIo(30);
    const viBefore = framesOf(inbox, "vi").length;

    for (const action of ["start", "stop", "start"] as const) {
      ws.sendRaw({ t: "autosell.cmd", isin: SAMPLE_ISIN, accountNo: SAMPLE_ACCOUNT_NO, exchange: "KRX", action });
    }
    await waitFor(() => autoSellReqs().length === 3, "41 3연타 송신");

    gateway.sendFrame(gatewaySocket(), buildSetVITriggerRespFrame(null));
    await flushIo(50);

    expect(framesOf(inbox, "vi")).toHaveLength(viBefore);
    expect(framesOf(inbox, "lc")).toHaveLength(0);
    // 재전송 경로가 없다 — 보낸 만큼만 나갔다.
    expect(autoSellReqs()).toHaveLength(3);
  });

  // ==========================================================
  // ③ user.settings.set → 42 · relay 는 84 를 지어내지 않는다
  // ==========================================================

  it("③-1 user.settings.set 은 msg_type 42 1건 · 11값 그대로 · present 슬롯 없음", async () => {
    const { ws } = await authed("token-a");

    ws.sendRaw({ t: "user.settings.set", s: { ...SETTINGS, present: true } });
    await waitFor(() => settingsReqs().length === 1, "42 송신");

    expect(gateway.strategyRequests().filter((r) => r.msgType === MSG.SetUserSettingsReq)).toHaveLength(1);
    const { presentSlotEmpty, ...values } = settingsReqs()[0]!;
    expect(values).toEqual(SETTINGS);
    expect(presentSlotEmpty).toBe(true);
  });

  it("③-2 relay 는 42 에 대해 84 를 내지 않는다 — 게이트웨이가 84 를 밀 때만 user.settings 가 온다", async () => {
    const { ws, inbox } = await authed("token-a");

    ws.sendRaw({ t: "user.settings.set", s: SETTINGS });
    await waitFor(() => settingsReqs().length === 1, "42 송신");
    await flushIo(50);
    expect(framesOf(inbox, "user.settings")).toHaveLength(0);

    // 서버의 42 뒤 브로드캐스트 재현 — 받은 그대로 팬아웃한다.
    gateway.sendUserSettings(gatewaySocket(), { ...SETTINGS, autoSellPeriodSec: 5, present: true });
    await waitFor(() => framesOf(inbox, "user.settings").length === 1, "84 팬아웃");
    await flushIo(30);

    expect(framesOf(inbox, "user.settings")).toEqual([
      { t: "user.settings", present: true, ...SETTINGS, autoSellPeriodSec: 5 },
    ]);
  });

  it("③-3 범위 밖(매도 주기 61)은 zod 위반 close(4400) · 게이트웨이 42 0건", async () => {
    const { ws } = await authed("token-a");

    ws.sendRaw({ t: "user.settings.set", s: { ...SETTINGS, autoSellPeriodSec: 61 } });
    await waitFor(() => ws.closeInfo !== null, "프로토콜 위반 close");
    await flushIo(30);

    expect(ws.closeInfo?.code).toBe(4400);
    expect(settingsReqs()).toHaveLength(0);
  });

  it("③-4 seedUserSettings 를 켜면 Ready 의 43 에 84 1프레임이 와 탭에 user.settings 로 팬아웃된다(기본 null = 무응답)", async () => {
    gateway.seedUserSettings({ present: true, autoSellRatioDefaultPct: 15 });
    const { inbox } = await authed("token-a");
    await waitFor(() => framesOf(inbox, "user.settings").length >= 1, "43 → 84 → user.settings");
    await flushIo(30);

    expect(gatewayFrames.filter((f) => f.msgType === MSG.GetUserSettingsReq)).toHaveLength(1);
    expect(framesOf(inbox, "user.settings")).toHaveLength(1);
    expect(framesOf(inbox, "user.settings")[0]).toMatchObject({ present: true, autoSellRatioDefaultPct: 15 });
    expect(hub.getUserSettings(USER_A)).toMatchObject({ present: true, autoSellRatioDefaultPct: 15 });
  });

  // ==========================================================
  // ④ 54 새 src 3종 통과 — relay 에 54 src 허용목록이 없다(교훈 24 · Phase 24 D-13)
  //
  // 문구는 gh-trade `limit-chaser.md` §9-3 원문이다. **동등 비교**로 relay 가 한 글자도 고치지 않았음을 굳힌다.
  // ==========================================================

  it.each([
    ["ERROR", "AutoSellCommand", SAMPLE_ISIN, SAMPLE_ACCOUNT_NO, "자동매도 바로시작 거부 — 보유수량 0"],
    ["ERROR", "SetUserSettings", "", "", "매도 주기는 1~60초여야 합니다(받은 값 99)"],
    ["INFO", "AutoSell", SAMPLE_ISIN, SAMPLE_ACCOUNT_NO, "자동매도 대기 → 매도중 (바로시작)"],
  ] as const)(
    "④ Phase 27 54 새 src 통과 — %s %s 는 msg 1프레임으로 src · lv · i · a · m 그대로",
    async (level, source, isin, accountNo, message) => {
      const { inbox } = await authed("token-a");

      gateway.sendFrame(
        gatewaySocket(),
        buildServerMessageFrame({ level, message, isin, accountNo, source, kind: "" }),
      );
      await waitFor(() => framesOf(inbox, "msg").length === 1, "54 수신");
      await flushIo(30);

      const msgs = framesOf(inbox, "msg");
      expect(msgs).toHaveLength(1);
      expect({ src: msgs[0]?.src, lv: msgs[0]?.lv, i: msgs[0]?.i, a: msgs[0]?.a, m: msgs[0]?.m }).toEqual({
        src: source,
        lv: level,
        i: isin,
        a: accountNo,
        m: message,
      });
    },
  );
});
