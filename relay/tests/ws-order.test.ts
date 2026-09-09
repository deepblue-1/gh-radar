/**
 * Phase 16 Plan 08 — TRADE-03. **wss 주문 경로** 통합 테스트 (D-02).
 *
 * `order-api.test.ts`(HTTP 하네스)를 wss 하네스로 재작성한 것이다. REST 라우트는 16-16
 * 까지 살아 있으므로 그 파일은 **회귀 테스트로 그대로 남긴다** — 두 경로가 공존하는 기간에
 * 한쪽만 검증하면 나머지 한쪽이 조용히 썩는다.
 *
 * 검증 대상은 **돈이 걸린 경계**다:
 *   · 5초 상관 — 접수/거부/취소는 `order.result` 로, 5초 초과는 「실패」가 아니라 `timeout`
 *   · 상관은 **연결 스코프** — `order.result` 는 요청한 연결에만, 51 푸시는 전 연결 (T-16-03)
 *   · 계좌 대조의 근거는 `session.allowedAccounts` 하나 — 거부 시 게이트웨이로 **0바이트** (T-16-01)
 *   · ISIN → 시장 해석 실패는 거부다. 기본값 "K" 로 메우지 않는다 (T-16-05)
 *   · 자동주문 통보는 대기열에 없어도 **새 행**으로 남는다 (T-16-07 / Pitfall 18)
 *   · 중복 rid·중복 파라미터는 거부 (T-16-10)
 *
 * 스텁은 셋뿐이다 — Supabase(토큰·자격증명) · `dma_orders` 쓰기 창구 · 종목마스터.
 * 나머지는 전부 진짜다(실제 ws 서버, 실제 TCP 로 붙는 가짜 게이트웨이, 실제 `SessionManager`
 * /`SubscriptionHub`). 이 경로가 **이어지는지**가 이 plan 의 핵심 리스크라 중간을 가짜로
 * 채우면 검증이 아무것도 증명하지 못한다.
 *
 * ⚠️ 게이트웨이로 나간 주문은 **디코드해서** 본다. 스텁이 요청을 해석해 주면 그 해석이 곧
 *    프로덕션 조립기의 정답지가 되어 검증이 순환한다 (fanout.test.ts 와 같은 규율).
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import net from "node:net";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as flatbuffers from "flatbuffers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RelayOutbound } from "@gh-radar/shared";

import { WsFanout, type WsFanoutDeps } from "../src/ws/fanout.js";
import {
  createOrderHandler,
  narrowPending,
  type PendingOrder,
} from "../src/ws/order-handler.js";
import { SubscriptionHub } from "../src/hub/subscription-hub.js";
import { SessionManager } from "../src/dma/session-manager.js";
import { encryptDmaPassword } from "../src/store/credentials.js";
import { resetDroppedEnvelopeCount, type ParsedOrderResp } from "../src/dma/envelope.js";
import { ORDER_RESP_TIMEOUT_MS } from "../src/order/notice-status.js";
import { MSG } from "../src/dma/msg-type.js";
import { logger } from "../src/logger.js";
import { Envelope } from "../src/generated/stock-dma/envelope.js";
import type { OrderInsertRow, OrderUpdate } from "../src/store/orders.js";
import type { SymbolInfo, SymbolLookup } from "../src/store/symbols.js";
import { startFakeGateway, type FakeGateway } from "./helpers/fake-gateway.js";
import { connectWs, type TestWs } from "./helpers/ws-client.js";
import { SAMPLE_ACCOUNT_NO, SAMPLE_ISIN } from "./helpers/frames.js";

const WS_PATH = "/ws";
/** `SAMPLE_ACCOUNTS` 에 **없는** 계좌 — 화이트리스트 밖 요청을 만든다 (T-16-01). */
const FOREIGN_ACCOUNT_NO = "9999999999";
/** 종목마스터에 있지만 `market` 이 null 인 종목 (T-16-05). */
const NO_MARKET_ISIN = "KR7000660001";
/** 두 번째 정상 종목 — 두 연결이 **서로 다른 주문**을 대기시키는 상황을 만든다 (②). */
const SECOND_ISIN = "KR7035720002";
/** 종목마스터에 아예 없는 종목. */
const UNKNOWN_ISIN = "KR7999999999";

const USER_A = "3f1c2b7a-9d40-4a11-8e55-00000000000a";
const USER_B = "3f1c2b7a-9d40-4a11-8e55-00000000000b";

const CRED_KEY = randomBytes(32).toString("base64");

const TOKENS = new Map<string, string>([
  ["token-a", USER_A],
  ["token-b", USER_B],
]);

type CredRow = { dma_user_id: string; dma_password_enc: string };

const CRED_ROWS = new Map<string, CredRow>([
  [USER_A, { dma_user_id: "kb-a", dma_password_enc: encryptDmaPassword("pw-a", USER_A, CRED_KEY) }],
  [USER_B, { dma_user_id: "kb-b", dma_password_enc: encryptDmaPassword("pw-b", USER_B, CRED_KEY) }],
]);

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

/**
 * `dma_orders` 쓰기 창구 스텁.
 *
 * 여기만 가짜인 이유: 이 테스트가 보려는 것은 SQL 이 아니라 **어떤 값이 어떤 경로로 기록에
 * 닿는가**다. insert 인지 update 인지, 그리고 그 인자가 무엇인지가 전부다.
 */
function mkOrderStore(
  opts: { existingId?: string | null; insertFails?: boolean; insertGate?: Promise<void> } = {},
) {
  const inserts: OrderInsertRow[] = [];
  const updates: OrderUpdate[] = [];
  const lookups: { userId: string; orderNo: string }[] = [];
  /** insert **진입** 횟수. `insertGate` 로 왕복을 붙잡은 동안 경주를 관측하는 창이다 (WR-01). */
  const started = { insert: 0 };
  let nextId = 1;
  return {
    inserts,
    updates,
    lookups,
    started,
    store: {
      insertRequest: async (row: OrderInsertRow): Promise<string> => {
        started.insert += 1;
        // 게이트가 있으면 그것이 풀릴 때까지 왕복이 끝나지 않는다 — 실제 Supabase 지연을
        // 타이머 없이(가짜 타이머 환경이다) 결정론적으로 재현한다.
        if (opts.insertGate !== undefined) await opts.insertGate;
        await Promise.resolve();
        if (opts.insertFails === true) throw new Error("supabase insert down");
        inserts.push(row);
        return `row-${nextId++}`;
      },
      enqueueUpdate: (u: OrderUpdate): void => {
        updates.push(u);
      },
      findIdByOrderNo: async (userId: string, orderNo: string): Promise<string | null> => {
        lookups.push({ userId, orderNo });
        await Promise.resolve();
        return opts.existingId ?? null;
      },
    },
  };
}

/** 종목마스터 스텁. 「모르는 종목」과 「시장 미상」을 둘 다 만든다. */
const SYMBOLS: SymbolLookup = {
  lookup: (isin: string): SymbolInfo | undefined => {
    if (isin === SAMPLE_ISIN) return { code: "005930", name: "삼성전자", market: "K" };
    if (isin === SECOND_ISIN) return { code: "035720", name: "카카오", market: "Q" };
    if (isin === NO_MARKET_ISIN) return { code: "000660", name: "시장미상", market: null };
    return undefined;
  },
};

/** 나간 `DirectOrderReq(2)` 를 되읽는다. 요청 대역이라 수신 화이트리스트를 우회한다. */
function orderReqsOf(payloads: Buffer[]): Envelope[] {
  return payloads
    .map((p) =>
      Envelope.getRootAsEnvelope(
        new flatbuffers.ByteBuffer(new Uint8Array(p.buffer, p.byteOffset, p.length)),
      ),
    )
    .filter((env) => env.msgType() === MSG.DirectOrderReq);
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

/** 정상 신규 주문 인바운드. 각 케이스가 필요한 필드만 덮어쓴다. */
function orderNew(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    t: "order.new",
    rid: "rid-1",
    isin: SAMPLE_ISIN,
    exchange: "KRX",
    side: "B",
    qty: 10,
    price: 70_000,
    accountNo: SAMPLE_ACCOUNT_NO,
    ...overrides,
  };
}

/** 정상 취소 인바운드. 미체결 1행의 취소를 그대로 흉내 낸다 (UI D-21 — 잔량 전부). */
function orderCancel(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    t: "order.cancel",
    rid: "rid-c",
    isin: SAMPLE_ISIN,
    exchange: "KRX",
    orgOrderNo: "0000012345",
    qty: 10,
    price: 70_000,
    accountNo: SAMPLE_ACCOUNT_NO,
    ...overrides,
  };
}

describe("wss 주문 경로 (D-02)", () => {
  let gateway: FakeGateway;
  let server: http.Server;
  let fanout: WsFanout;
  let hub: SubscriptionHub;
  let sessions: SessionManager;
  let port: number;
  let orders: ReturnType<typeof mkOrderStore>;
  /** 게이트웨이가 받은 프레임(요청 대역 포함) 원문. */
  let gatewayPayloads: Buffer[];
  const sockets: TestWs[] = [];

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
      orderStore: orders.store,
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

  async function authed(token: string): Promise<{ ws: TestWs; inbox: RelayOutbound[] }> {
    const conn = await open();
    conn.ws.sendAuth(token);
    await waitFor(
      () => conn.inbox.some((m) => m.t === "state" && m.s === "ready"),
      `${token} ready 상태 프레임`,
    );
    return conn;
  }

  /** 그 사용자의 DMA 소켓. 51 통보를 밀어 넣을 대상이다. */
  function gatewaySocket(): net.Socket {
    const sock = gateway.sockets[0];
    if (sock === undefined) throw new Error("게이트웨이 연결이 없습니다");
    return sock;
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    resetDroppedEnvelopeCount();
    gatewayPayloads = [];
    orders = mkOrderStore();
    gateway = await startFakeGateway({ autoLogin: true, loginResp: { success: true } });
    gateway.onFrame((_t, payload) => gatewayPayloads.push(Buffer.from(payload)));
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

  // ----------------------------------------------------------
  // 정상 왕복
  // ----------------------------------------------------------

  it("① 신규 주문이 게이트웨이로 나가고 51 접수 통보가 order.result 로 돌아온다", async () => {
    const { ws, inbox } = await authed("token-a");

    ws.sendRaw(orderNew());
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 1, "DirectOrderReq(2) 송신");

    // 조립 결과를 **디코드해서** 본다 — ISIN·시장·수량이 그대로 실렸는가.
    const req = orderReqsOf(gatewayPayloads)[0]?.directOrderReq();
    expect(req?.stockCode()).toBe(SAMPLE_ISIN);
    expect(req?.accountNo()).toBe(SAMPLE_ACCOUNT_NO);
    // 브라우저는 시장을 보내지 않았다 — relay 가 SymbolMap 으로 채운 값이다 (D-28).
    expect(req?.market()).toBe("K");
    expect(req?.quantity()).toBe(10);

    // 송신 **전에** 감사 기록이 남는다 (T-15-32) — 그 사이에 죽어도 흔적이 있어야 한다.
    expect(orders.inserts).toHaveLength(1);
    expect(orders.inserts[0]).toMatchObject({
      userId: USER_A,
      isin: SAMPLE_ISIN,
      code: "005930",
      market: "K",
      side: "B",
      orderType: "N",
      origin: "manual",
    });

    gateway.pushOrderResp(gatewaySocket(), { noticeType: "A", orderNo: "0000012345" });
    await waitFor(() => framesOf(inbox, "order.result").length === 1, "order.result 수신");

    const result = framesOf(inbox, "order.result")[0];
    expect(result).toMatchObject({ rid: "rid-1", orderNo: "0000012345", status: "accepted" });

    // 상관 1순위 키(orderRowId)로 좁혀 갱신하고, 이번에 알게 된 주문번호를 같이 채운다.
    expect(orders.updates).toContainEqual(
      expect.objectContaining({ orderRowId: "row-1", orderNo: "0000012345", status: "accepted" }),
    );
  });

  it("② order.result 는 요청한 연결에만 간다 — 51 푸시는 두 연결 모두 받는다 (T-16-03)", async () => {
    const a = await authed("token-a");
    const b = await authed("token-a"); // 같은 사용자의 두 번째 탭

    // ★ **두 연결 모두 주문을 대기시킨다.** 한쪽만 주문하면 다른 쪽은 애초에 핸들러의
    //   상관 자료구조에 등록되지 않아, 「전 연결로 브로드캐스트」 회귀를 넣어도 이 단언이
    //   그냥 통과한다(변이 주입으로 실측한 결함이다). 종목을 갈라 두면 통보가 A 의 대기
    //   항목에만 매칭되므로, B 에 프레임이 닿는 유일한 경로는 잘못된 브로드캐스트뿐이다.
    a.ws.sendRaw(orderNew({ rid: "rid-a", isin: SAMPLE_ISIN }));
    b.ws.sendRaw(orderNew({ rid: "rid-b", isin: SECOND_ISIN }));
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 2, "두 연결의 DirectOrderReq(2)");

    gateway.pushOrderResp(gatewaySocket(), {
      isin: SAMPLE_ISIN,
      noticeType: "A",
      orderNo: "0000012345",
    });
    await waitFor(() => framesOf(a.inbox, "order.result").length === 1, "요청 연결 order.result");
    await waitFor(() => framesOf(b.inbox, "order").length === 1, "두 번째 연결 51 푸시");

    // 상관 응답은 **요청한 연결에만** 간다. 전역 rid 맵이나 사용자 단위 팬아웃을 쓰면
    // 여기가 무너지고, 그 순간 다른 탭이 남의 요청 결과를 받는다.
    expect(framesOf(a.inbox, "order.result")[0]).toMatchObject({ rid: "rid-a" });
    expect(framesOf(b.inbox, "order.result")).toHaveLength(0);
    // 반대로 51 푸시(체결 통보)는 **사용자 전 연결**이다 — 기존 규약을 바꾸지 않았다.
    expect(framesOf(a.inbox, "order")).toHaveLength(1);
  });

  it("③ 취소 주문은 orderType \"C\" + 원주문번호로 나간다", async () => {
    const { ws, inbox } = await authed("token-a");

    ws.sendRaw({
      t: "order.cancel",
      rid: "rid-c",
      isin: SAMPLE_ISIN,
      exchange: "KRX",
      orgOrderNo: "0000012345",
      qty: 10,
      price: 70_000,
      accountNo: SAMPLE_ACCOUNT_NO,
    });
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 1, "취소 DirectOrderReq(2)");

    const req = orderReqsOf(gatewayPayloads)[0]?.directOrderReq();
    expect(req?.orderType()).toBe("C");
    expect(req?.orgOrderNo()).toBe("0000012345");
    expect(orders.inserts[0]).toMatchObject({ orderType: "C", orgOrderNo: "0000012345" });

    gateway.pushOrderResp(gatewaySocket(), {
      noticeType: "C",
      orderNo: "0000012399",
      orgOrderNo: "0000012345",
    });
    await waitFor(() => framesOf(inbox, "order.result").length === 1, "취소확인 order.result");
    expect(framesOf(inbox, "order.result")[0]).toMatchObject({ rid: "rid-c", status: "cancelled" });
  });

  it("④ 원주문번호 없는 취소는 스키마에서 끊긴다 — 게이트웨이로 0바이트", async () => {
    const { ws } = await authed("token-a");

    ws.sendRaw({
      t: "order.cancel",
      rid: "rid-c",
      isin: SAMPLE_ISIN,
      exchange: "KRX",
      orgOrderNo: "",
      qty: 10,
      price: 70_000,
      accountNo: SAMPLE_ACCOUNT_NO,
    });
    await waitFor(() => ws.closeInfo !== null, "스키마 위반 close");

    expect(ws.closeInfo?.code).toBe(4400);
    expect(orderReqsOf(gatewayPayloads)).toHaveLength(0);
    expect(orders.inserts).toHaveLength(0);
  });

  // ----------------------------------------------------------
  // 거부 경로 — 어느 것도 게이트웨이에 닿지 않는다
  // ----------------------------------------------------------

  it("⑤ 화이트리스트 밖 계좌는 거부다 — 게이트웨이로 0바이트, 로그에 계좌 원문 없음 (T-16-01)", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const { ws, inbox } = await authed("token-a");

    ws.sendRaw(orderNew({ accountNo: FOREIGN_ACCOUNT_NO }));
    await waitFor(() => framesOf(inbox, "order.result").length === 1, "거부 order.result");

    expect(framesOf(inbox, "order.result")[0]).toMatchObject({ rid: "rid-1", status: "rejected" });
    // ★ 실계좌 방어선 — 거부는 **보내기 전에** 이뤄져야 한다.
    expect(orderReqsOf(gatewayPayloads)).toHaveLength(0);
    // 기록도 만들지 않는다. 권한 없는 요청의 행이 남으면 감사가 오염된다.
    expect(orders.inserts).toHaveLength(0);

    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).toContain("계좌 목록 밖");
    // 로그는 마스킹, 화면은 전체가 규율이다 (T-16-09).
    expect(logged).not.toContain(FOREIGN_ACCOUNT_NO);
  });

  it("⑥ ISIN 을 못 풀거나 market 이 null 이면 거부다 — 기본값 \"K\" 로 메우지 않는다 (T-16-05)", async () => {
    const { ws, inbox } = await authed("token-a");

    ws.sendRaw(orderNew({ rid: "rid-unknown", isin: UNKNOWN_ISIN }));
    await waitFor(() => framesOf(inbox, "order.result").length === 1, "미지 ISIN 거부");

    ws.sendRaw(orderNew({ rid: "rid-nomarket", isin: NO_MARKET_ISIN }));
    await waitFor(() => framesOf(inbox, "order.result").length === 2, "시장 미상 거부");

    expect(framesOf(inbox, "order.result").map((f) => f.status)).toEqual(["rejected", "rejected"]);
    // ★ 시장 미상을 "K" 로 메우면 코스닥 주문이 코스피로 나간다. 0바이트가 그 방어의 증거다.
    expect(orderReqsOf(gatewayPayloads)).toHaveLength(0);
    expect(orders.inserts).toHaveLength(0);
  });

  it("⑦ 같은 rid 재전송·같은 파라미터 더블클릭은 거부된다 (T-16-10)", async () => {
    const { ws, inbox } = await authed("token-a");

    ws.sendRaw(orderNew({ rid: "rid-dup" }));
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 1, "첫 주문 송신");

    // 같은 rid — 재전송.
    ws.sendRaw(orderNew({ rid: "rid-dup" }));
    // 다른 rid 지만 같은 (계좌,ISIN,side,가격,수량) — 더블클릭.
    ws.sendRaw(orderNew({ rid: "rid-dup-2" }));
    await waitFor(() => framesOf(inbox, "order.result").length === 2, "중복 거부 2건");

    const results = framesOf(inbox, "order.result");
    expect(results.map((r) => r.rid)).toEqual(["rid-dup", "rid-dup-2"]);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    // ★ 중복 체결이 이 파일 최악의 결과다 — 게이트웨이로 나간 것은 여전히 1건뿐이다.
    expect(orderReqsOf(gatewayPayloads)).toHaveLength(1);
    expect(orders.inserts).toHaveLength(1);
  });

  // ----------------------------------------------------------
  // 타임아웃 · 송신 실패
  // ----------------------------------------------------------

  it("⑧ 5초 안에 통보가 없으면 timeout 이다 — 「실패」라고 말하지 않는다 (Pitfall 9 / S-8)", async () => {
    const { ws, inbox } = await authed("token-a");

    ws.sendRaw(orderNew());
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 1, "주문 송신");

    await vi.advanceTimersByTimeAsync(ORDER_RESP_TIMEOUT_MS);
    await waitFor(() => framesOf(inbox, "order.result").length === 1, "timeout order.result");

    const result = framesOf(inbox, "order.result")[0];
    expect(result?.status).toBe("timeout");
    // ★ 「실패」로 단정하면 사용자가 재주문해 중복 체결이 난다.
    expect(result?.message).not.toContain("실패");
    expect(result?.message).toContain("미체결 목록");
    // 주문번호는 **없는 것이 진실**이다 — 지어내지 않는다.
    expect(result?.orderNo).toBe("");

    expect(orders.updates).toContainEqual(
      expect.objectContaining({ orderRowId: "row-1", status: "timeout" }),
    );
    // 결과를 모르는 것이지 코드를 아는 것이 아니다 — DB 에는 result_code 를 쓰지 않는다.
    const timeoutUpdate = orders.updates.find((u) => u.status === "timeout");
    expect(timeoutUpdate?.resultCode).toBeUndefined();
  });

  it("⑨ 늦게 온 통보가 이미 정산된 요청에 두 번째 order.result 를 만들지 않는다", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const { ws, inbox } = await authed("token-a");

    ws.sendRaw(orderNew());
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 1, "주문 송신");
    await vi.advanceTimersByTimeAsync(ORDER_RESP_TIMEOUT_MS);
    await waitFor(() => framesOf(inbox, "order.result").length === 1, "timeout");

    // 6초 뒤에 도착한 접수 통보 — 대기열은 이미 비었다.
    gateway.pushOrderResp(gatewaySocket(), { noticeType: "A", orderNo: "0000012345" });
    await waitFor(() => framesOf(inbox, "order").length === 1, "51 푸시");

    // 상관 응답은 한 번뿐이다. 두 번 오면 브라우저가 상태를 되돌려 그린다.
    expect(framesOf(inbox, "order.result")).toHaveLength(1);
    // 기록 경로는 **조회를 거친다** (GC-CR-02). 이 행은 접수 전에 만들어져 `order_no` 가
    // 비어 있으므로 조회는 「없음」이고, 그 상태에서 `order_no` 셀렉터로 보내는 갱신은
    // **0행**이다 — 옛 코드는 그것을 성공처럼 보내고 침묵했다(Pitfall 18). 이제 보내지 않고
    // 통보 원문을 error 로 남긴다.
    expect(orders.lookups).toEqual([{ userId: USER_A, orderNo: "0000012345" }]);
    expect(orders.updates.filter((u) => u.orderRowId === undefined)).toHaveLength(0);
    expect(JSON.stringify(errorSpy.mock.calls)).toContain("붙지 않는 수동 통보");
  });

  it("⑩ 송신 실패는 대기열을 즉시 걷는다 — 5초를 기다리지 않는다", async () => {
    const { ws, inbox } = await authed("token-a");

    const session = sessions.get(USER_A);
    if (session === undefined) throw new Error("세션이 없습니다");
    vi.spyOn(session, "send").mockReturnValue(false);

    ws.sendRaw(orderNew());
    await waitFor(() => framesOf(inbox, "order.result").length === 1, "송신 실패 거부");

    // ★ 타이머를 전혀 진행시키지 않았는데 답이 왔다는 것이 「즉시」의 증거다.
    expect(framesOf(inbox, "order.result")[0]).toMatchObject({ status: "rejected" });
    expect(orders.updates).toContainEqual(
      expect.objectContaining({ orderRowId: "row-1", status: "rejected" }),
    );

    // 그리고 5초가 지나도 timeout 프레임이 추가로 오지 않는다(타이머가 정리됐다).
    await vi.advanceTimersByTimeAsync(ORDER_RESP_TIMEOUT_MS * 2);
    await flushIo();
    expect(framesOf(inbox, "order.result")).toHaveLength(1);
  });

  it("⑪ 연결이 끊기면 그 연결의 대기열·타이머가 정리된다 (누수 0)", async () => {
    const { ws, inbox } = await authed("token-a");

    ws.sendRaw(orderNew());
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 1, "주문 송신");

    await ws.close();
    await flushIo();

    await vi.advanceTimersByTimeAsync(ORDER_RESP_TIMEOUT_MS * 2);
    await flushIo();

    // ★ 프레임 부재만으로는 아무것도 증명하지 못한다 — 닫힌 소켓에는 어차피 `#send` 가
    //   `readyState` 를 보고 아무것도 쓰지 않기 때문이다(타이머가 살아 있어도 통과한다).
    //   타이머가 **실제로 정리됐는지**는 `finish(null)` 이 send 보다 **먼저** 부르는
    //   `enqueueUpdate({status:"timeout"})` 으로만 관측된다.
    expect(orders.updates.filter((u) => u.status === "timeout")).toHaveLength(0);
    expect(framesOf(inbox, "order.result")).toHaveLength(0);
  });

  // ----------------------------------------------------------
  // 자동주문 (상따 · VI) — T-16-07 / Pitfall 18
  // ----------------------------------------------------------

  it("⑫ 대기열에 없는 상따 통보는 **새 행**으로 기록된다 (origin: limit_chaser)", async () => {
    await authed("token-a");

    // 주문을 낸 적이 없다 — 상따 전략이 알아서 발주한 상황이다.
    gateway.pushOrderResp(gatewaySocket(), {
      noticeType: "A",
      orderNo: "0000099999",
      origin: "LimitChaser",
      quantity: 7,
      price: 12_345,
    });
    await waitFor(() => orders.inserts.length === 1, "자동주문 insert");

    // ★ PostgREST 의 update 는 0행이어도 에러가 아니다 — 조회 없이 갱신만 하면 이 기록이
    //   조용히 사라지고, 사용자는 자기 계좌에서 나간 주문을 어디서도 볼 수 없다.
    // 조회는 **소유자와 함께** 나간다 — `order_no` 는 일별 재사용 시퀀스라 단독으로는
    // 남의 행·어제 행을 매치시킨다 (gap 1 / T-16-14).
    expect(orders.lookups).toEqual([{ userId: USER_A, orderNo: "0000099999" }]);
    expect(orders.inserts[0]).toMatchObject({
      userId: USER_A,
      origin: "limit_chaser",
      isin: SAMPLE_ISIN,
      orderNo: "0000099999",
      qty: 7,
      price: 12_345,
      status: "accepted",
      // 51 에는 계좌번호가 없다 — 세션의 단일 허용 계좌에서 왔다.
      accountNo: SAMPLE_ACCOUNT_NO,
    });
    // 수명주기 필드는 큐로 넘어간다(경계 유지).
    expect(orders.updates).toContainEqual(
      expect.objectContaining({ orderRowId: "row-1", noticeType: "A" }),
    );
  });

  it("⑬ 같은 order_no 로 행이 이미 있으면 insert 가 아니라 update 다", async () => {
    orders = mkOrderStore({ existingId: "row-existing" });
    await fanout.close();
    await sessions.closeAll();
    hub.closeAll();
    await new Promise<void>((r) => server.close(() => r()));
    await startHarness();
    await authed("token-a");

    gateway.pushOrderResp(gatewaySocket(), {
      noticeType: "E",
      orderNo: "0000099999",
      origin: "LimitChaser",
      quantity: 7,
    });
    await waitFor(() => orders.updates.length > 0, "기존 행 갱신");

    // 두 번째 행을 만들면 같은 주문이 감사 기록에 두 번 남는다.
    expect(orders.inserts).toHaveLength(0);
    expect(orders.updates).toContainEqual(
      expect.objectContaining({ orderRowId: "row-existing", filledQty: 7 }),
    );
  });

  it("⑭ 수동 통보는 조회를 거쳐 orderRowId 로 갱신한다 — insert 는 하지 않는다 (GC-CR-02)", async () => {
    // `finish` 가 이미 접수 주문번호를 채워 둔 행이 있는 상황이다 — 조회가 그것을 찾는다.
    orders = mkOrderStore({ existingId: "row-manual" });
    await restartHarness();
    await authed("token-a");

    gateway.pushOrderResp(gatewaySocket(), {
      noticeType: "E",
      orderNo: "0000012345",
      origin: "Manual",
      quantity: 10,
    });
    await waitFor(() => orders.updates.length > 0, "수동 통보 갱신");
    await flushIo();

    // 조회는 **소유자와 함께** 나간다 (gap 1 / T-16-14).
    expect(orders.lookups).toEqual([{ userId: USER_A, orderNo: "0000012345" }]);
    // 수동 주문의 행은 요청 시점에 relay 가 이미 만들었다 — 여기서 두 번째 행을 만들지 않는다.
    expect(orders.inserts).toHaveLength(0);
    // ★ 셀렉터가 `order_no` 가 아니라 **확인된 행의 id** 다 (A10 1순위).
    expect(orders.updates).toContainEqual(
      expect.objectContaining({ orderRowId: "row-manual", orderNo: "0000012345", origin: "manual" }),
    );
    expect(orders.updates.filter((u) => u.orderRowId === undefined)).toHaveLength(0);
  });

  // ----------------------------------------------------------
  // 핸들러 단위 — wss 스키마가 가려 주는 마지막 관문
  // ----------------------------------------------------------

  it("⑮ ③ 원주문번호 재확인은 스키마 뒤의 마지막 관문이다 (직접 호출 경로)", async () => {
    // wss 로는 ④ 가 보였듯 스키마에서 끊긴다. 그래도 조립 단계 앞의 방어를 남겨 두는 이유는
    // 「모든 호출 경로의 마지막 관문」이어야 하기 때문이다 — 여기서 그 분기를 직접 친다.
    const sent: unknown[] = [];
    const store = mkOrderStore();
    const handler = createOrderHandler<object>({
      sessions: {
        get: () => ({
          isReady: true,
          allowedAccounts: [{ accountNo: SAMPLE_ACCOUNT_NO, name: "위탁종합" }],
          send: () => true,
        }),
      },
      hub: { on: () => undefined, getLimitChasers: () => [], getViTrigger: () => null },
      orderStore: store.store,
      symbols: SYMBOLS,
      send: (_conn, msg) => sent.push(msg),
    });

    const conn = {};
    await handler.handle(conn, USER_A, {
      t: "order.cancel",
      rid: "rid-x",
      isin: SAMPLE_ISIN,
      exchange: "KRX",
      orgOrderNo: "",
      qty: 10,
      price: 70_000,
      accountNo: SAMPLE_ACCOUNT_NO,
    });

    expect(sent).toEqual([
      expect.objectContaining({ t: "order.result", rid: "rid-x", status: "rejected" }),
    ]);
    // 조립 단계에 닿지 않았으므로 기록도 만들지 않는다.
    expect(store.inserts).toHaveLength(0);
    handler.close();
  });

  it("⑯ dma_orders 기록에 실패하면 주문을 보내지 않는다 (감사 없는 실주문 금지)", async () => {
    orders = mkOrderStore({ insertFails: true });
    await fanout.close();
    await sessions.closeAll();
    hub.closeAll();
    await new Promise<void>((r) => server.close(() => r()));
    await startHarness();

    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const { ws, inbox } = await authed("token-a");

    ws.sendRaw(orderNew());
    await waitFor(() => framesOf(inbox, "order.result").length === 1, "기록 실패 거부");

    expect(framesOf(inbox, "order.result")[0]).toMatchObject({ status: "rejected" });
    // ★ 감사 기록 없는 실주문을 만드는 것보다 지금 못 보낸다고 말하는 편이 낫다 (D-24).
    expect(orderReqsOf(gatewayPayloads)).toHaveLength(0);
    expect(JSON.stringify(errorSpy.mock.calls)).toContain("dma_orders 기록 실패");
  });

  it("⑰ 다른 사용자의 51 통보는 이 사용자의 대기 주문을 정산하지 않는다 (T-15-02)", async () => {
    const a = await authed("token-a");
    await authed("token-b");

    a.ws.sendRaw(orderNew());
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 1, "A 주문 송신");

    // B 의 세션(두 번째 게이트웨이 소켓)에 같은 ISIN 통보를 밀어 넣는다.
    const bSock = gateway.sockets[1];
    if (bSock === undefined) throw new Error("두 번째 게이트웨이 연결이 없습니다");
    gateway.pushOrderResp(bSock, { noticeType: "A", orderNo: "0000077777" });
    await flushIo(20);

    // ★ ISIN 이 같아도 사용자가 다르면 상관되지 않는다. 여기가 무너지면 남의 주문 결과를 받는다.
    expect(framesOf(a.inbox, "order.result")).toHaveLength(0);
  });

  // ----------------------------------------------------------
  // 자동주문 경주 · 소유자 경계 — WR-01 / gap 1
  // ----------------------------------------------------------

  /** 하네스를 새 `orders` 스텁으로 다시 세운다 (⑬ 과 같은 절차). */
  async function restartHarness(): Promise<void> {
    await fanout.close();
    await sessions.closeAll();
    hub.closeAll();
    await new Promise<void>((r) => server.close(() => r()));
    await startHarness();
  }

  it("⑱ 같은 자동주문의 접수·체결 통보가 insert 왕복 중에 겹쳐도 insert 는 1회다 (WR-01)", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    orders = mkOrderStore({ insertGate: gate });
    await restartHarness();
    await authed("token-a");

    const sock = gatewaySocket();
    // ① 접수(A) 통보 — 조회는 「행 없음」이고 insert 왕복이 시작된다.
    gateway.pushOrderResp(sock, {
      noticeType: "A",
      orderNo: "0000099999",
      origin: "LimitChaser",
      quantity: 7,
      price: 12_345,
    });
    await waitFor(() => orders.started.insert === 1, "첫 insert 진입");

    // ② 그 왕복이 **끝나기 전에** 체결(E) 통보가 도착한다. 가드가 없으면 여기서 두 번째
    //    조회가 다시 「행 없음」을 보고 두 번째 insert 를 시작한다 — 같은 주문이 감사
    //    기록에 두 벌 남는다.
    gateway.pushOrderResp(sock, {
      noticeType: "E",
      orderNo: "0000099999",
      origin: "LimitChaser",
      quantity: 7,
      price: 12_345,
    });
    await flushIo(20);
    expect(orders.started.insert).toBe(1);

    release?.();
    await waitFor(() => orders.updates.length >= 2, "두 통보 모두 기록");

    // ★ 행은 1건, 조회도 1회다 — 두 번째 통보는 진행 중인 Promise 를 재사용했다.
    expect(orders.inserts).toHaveLength(1);
    expect(orders.lookups).toHaveLength(1);
    // 그러면서 두 통보의 수명주기 값은 **둘 다** 같은 행에 붙는다.
    expect(orders.updates.filter((u) => u.orderRowId === "row-1")).toHaveLength(2);
    expect(orders.updates).toContainEqual(expect.objectContaining({ noticeType: "A" }));
    expect(orders.updates).toContainEqual(expect.objectContaining({ noticeType: "E" }));
  });

  it("⑲ 자동주문 조회는 그 연결의 userId 를 첫 인자로 싣는다 (gap 1 / T-16-14)", async () => {
    // B 만 붙인다 — 조회 인자가 하드코딩이 아니라 **그 연결의 소유자**임을 보이기 위해서다.
    await authed("token-b");

    gateway.pushOrderResp(gatewaySocket(), {
      noticeType: "A",
      orderNo: "0000088888",
      origin: "LimitChaser",
      quantity: 3,
      price: 5_000,
    });
    await waitFor(() => orders.lookups.length === 1, "자동주문 조회");

    expect(orders.lookups[0]?.userId).toBe(USER_B);
    expect(orders.lookups[0]?.orderNo).toBe("0000088888");
    // insert 행의 소유자도 같은 사용자다 — 조회와 기록이 다른 사용자를 가리키면 그것이 곧
    // 테넌트 경계 붕괴다.
    await waitFor(() => orders.inserts.length === 1, "자동주문 insert");
    expect(orders.inserts[0]?.userId).toBe(USER_B);
  });

  // ----------------------------------------------------------
  // 통보 매칭 축 — gap 2 / T-16-29 / T-16-30
  // ----------------------------------------------------------

  it("⑳ 같은 ISIN 의 신규·취소가 겹치면 취소확인은 **취소 대기**를 정산한다 (gap 2)", async () => {
    const { ws, inbox } = await authed("token-a");

    // 「취소하고 다시 걸기」 — 호가주문 탭에서 주문 패널과 계좌 패널이 나란히 놓인
    // 이 phase 의 가장 흔한 조작이다. 두 대기의 ISIN 은 같다.
    ws.sendRaw(orderNew({ rid: "rid-new" }));
    ws.sendRaw({
      t: "order.cancel",
      rid: "rid-cancel",
      isin: SAMPLE_ISIN,
      exchange: "KRX",
      orgOrderNo: "0000012345",
      qty: 10,
      price: 70_000,
      accountNo: SAMPLE_ACCOUNT_NO,
    });
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 2, "신규·취소 2건 송신");

    gateway.pushOrderResp(gatewaySocket(), {
      noticeType: "C",
      orderNo: "0000012399",
      orgOrderNo: "0000012345",
      quantity: 10,
      price: 70_000,
    });
    await waitFor(() => framesOf(inbox, "order.result").length === 1, "취소확인 order.result");

    // ★ ISIN 하나로 고르던 시절에는 여기서 **먼저 등록된 신규 대기**가 정산됐다 —
    //   살아 있는 매수 주문이 화면에 「취소됨」으로 뜨는 정확한 조건이다.
    expect(framesOf(inbox, "order.result")[0]).toMatchObject({
      rid: "rid-cancel",
      status: "cancelled",
      orderNo: "0000012399",
    });
    // 신규 대기는 아직 정산되지 않았다 — 그 주문은 살아 있다.
    expect(framesOf(inbox, "order.result").map((f) => f.rid)).not.toContain("rid-new");

    // 기록도 교차하지 않는다: `cancelled` 는 **취소 행**에만 붙는다.
    const cancelRowNo = orders.inserts.findIndex((r) => r.orderType === "C") + 1;
    expect(cancelRowNo).toBeGreaterThan(0);
    expect(orders.updates.find((u) => u.status === "cancelled")?.orderRowId).toBe(
      `row-${cancelRowNo}`,
    );
  });

  it("㉑ 같은 방향 2건을 좁히지 못한 통보는 아무것도 정산하지 않는다 — 대기는 살아서 타임아웃으로 끝난다 (gap 2)", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const { ws, inbox } = await authed("token-a");

    // **매수 2건**이다. 옛 형태(매수+매도)는 ②-1 매매구분 축이 생긴 뒤로 갈리므로(GC-WR-03)
    // 더 이상 「좁히지 못하는」 예가 아니다 — 그 조합은 아래 ㉙ 이 「갈린다」 쪽으로 잠근다.
    //
    // 같은 방향 2건을 통합 경로에서 만들려면 수량이나 가격이 달라야 한다. 완전히 동일한
    // 신규 2건은 **dup 키가 같아 애초에 두 번째가 거부**되기 때문이다(16-22 truth 25) —
    // 즉 「신규 대기 2건이 모든 축에서 같은」 상태는 이 경로에 존재할 수 없다. 대신 축을
    // 죽이는 것은 **부분체결**이다: 체결("E") 통보의 수량·가격은 주문값이 아니라 체결값이라
    // ③④ 를 건너뛰고, 방향은 둘 다 매수라 ②-1 도 갈라 주지 못한다.
    ws.sendRaw(orderNew({ rid: "rid-b1", side: "B", qty: 10 }));
    ws.sendRaw(orderNew({ rid: "rid-b2", side: "B", qty: 5 }));
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 2, "신규 2건 송신");

    gateway.pushOrderResp(gatewaySocket(), {
      noticeType: "E",
      side: "B",
      quantity: 3,
      orderNo: "0000012345",
    });
    await waitFor(() => framesOf(inbox, "order").length === 1, "51 푸시");
    await flushIo(20);

    // ★ 「가장 오래된 것」 폴백이 있으면 여기서 rid-b1 이 정산된다 — 그것이 gap 2 다.
    //   잘못 귀속된 기록은 없는 기록보다 나쁘므로 **아무것도** 정산하지 않는다.
    expect(framesOf(inbox, "order.result")).toHaveLength(0);
    // 정산하지 않았으므로 통보는 기록 경로(`recordUnmatched`)로 간다. 그 경로가 지금까지
    // 관찰되지 않던 **뒷부분**이 여기부터다 (GC-CR-02).
    //
    // 좁히기에 실패한 수동 통보는 이제 조회를 한 번 거친다. 대기 2건의 행은 접수 전에
    // 만들어져 `order_no` 가 비어 있으므로 조회는 「없음」이고 — 그 상태에서 `order_no`
    // 셀렉터 갱신을 보내면 **0행**이다. PostgREST 는 0행 update 를 에러로 주지 않으므로
    // 옛 코드에서는 이 기록이 로그 한 줄 없이 사라졌다.
    expect(orders.lookups).toEqual([{ userId: USER_A, orderNo: "0000012345" }]);
    // ★ `orderRowId` 없는 갱신 = `order_no` 셀렉터 갱신이다. **한 건도 나가지 않는다.**
    expect(orders.updates.filter((u) => u.orderRowId === undefined)).toHaveLength(0);
    // 대신 통보 원문이 stdout 에 남는다 — 이 경로의 유일한 기록이다 (D-24 / S-5).
    const errored = JSON.stringify(errorSpy.mock.calls);
    expect(errored).toContain("붙지 않는 수동 통보");
    expect(errored).toContain("0000012345");
    // 감사 사본이므로 통보 원문은 싣되, 계좌번호는 여기에도 없다 (T-16-45).
    expect(errored).not.toContain(SAMPLE_ACCOUNT_NO);

    const warned = JSON.stringify(warnSpy.mock.calls);
    expect(warned).toContain("좁히지 못했다");
    // 좁히기 실패 로그에 계좌번호·주문번호 원문은 없다 (T-16-32).
    expect(warned).not.toContain(SAMPLE_ACCOUNT_NO);
    expect(warned).not.toContain("0000012345");

    // 대기 2건은 **그대로 살아 있다** — 5초 뒤 각자 「결과 모름」으로 끝난다.
    await vi.advanceTimersByTimeAsync(ORDER_RESP_TIMEOUT_MS);
    await waitFor(() => framesOf(inbox, "order.result").length === 2, "두 대기의 timeout");
    expect(framesOf(inbox, "order.result").map((f) => f.status)).toEqual(["timeout", "timeout"]);
  });

  it("㉒ 두 연결이 같은 ISIN 으로 대기해도 통보는 좁혀진 연결로만 간다 (T-16-30)", async () => {
    const a = await authed("token-a");
    const b = await authed("token-a"); // 같은 사용자의 두 번째 탭

    // 같은 종목, 수량만 다르다. 후보를 **전 연결에서 모아** 좁혀야 B 가 나온다.
    a.ws.sendRaw(orderNew({ rid: "rid-a", qty: 10 }));
    b.ws.sendRaw(orderNew({ rid: "rid-b", qty: 5 }));
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 2, "두 탭의 주문 송신");

    gateway.pushOrderResp(gatewaySocket(), {
      noticeType: "A",
      orderNo: "0000012345",
      quantity: 5,
      price: 70_000,
    });
    await waitFor(() => framesOf(b.inbox, "order.result").length === 1, "B 연결 order.result");
    await flushIo(20);

    expect(framesOf(b.inbox, "order.result")[0]).toMatchObject({ rid: "rid-b" });
    // ★ 「ISIN 이 맞는 첫 연결」을 고르던 시절에는 A 가 이 통보를 가져갔다 — 탭 A 의 화면이
    //   탭 B 의 주문 결과를 그리고, 기록도 A 의 행에 붙었다.
    expect(framesOf(a.inbox, "order.result")).toHaveLength(0);
  });

  // ----------------------------------------------------------
  // 중복 판정의 축 — WR-02 / T-16-31 / T-16-33
  // ----------------------------------------------------------

  it("㉓ 두 번째 탭의 완전히 동일한 주문은 거부된다 — 중복 판정은 사용자 스코프다 (WR-02)", async () => {
    const a = await authed("token-a");
    const b = await authed("token-a"); // `RelayProvider` 는 탭당 소켓 1개를 연다

    a.ws.sendRaw(orderNew({ rid: "rid-tab-a" }));
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 1, "첫 탭 주문 송신");

    // 같은 (계좌, ISIN, side, 가격, 수량). rid 만 다르다 — 두 번째 탭의 더블클릭이다.
    b.ws.sendRaw(orderNew({ rid: "rid-tab-b" }));
    await waitFor(() => framesOf(b.inbox, "order.result").length === 1, "두 번째 탭 거부");
    await flushIo(20);

    expect(framesOf(b.inbox, "order.result")[0]).toMatchObject({
      rid: "rid-tab-b",
      status: "rejected",
    });
    // ★ 연결 스코프 가드는 여기서 무력했다(가드가 `ConnState` 안에 있었다) — 게이트웨이로
    //   나간 것이 여전히 1건이라는 사실이 사용자 축으로 올라갔다는 증거다.
    expect(orderReqsOf(gatewayPayloads)).toHaveLength(1);
    expect(orders.inserts).toHaveLength(1);
    // 첫 탭의 주문은 멀쩡히 살아 있다 — 거부가 엉뚱한 쪽으로 가지 않았다.
    expect(framesOf(a.inbox, "order.result")).toHaveLength(0);
  });

  it("㉔ 첫 연결을 닫으면 같은 주문을 다시 낼 수 있다 — 가드가 leak 되지 않는다 (T-16-33)", async () => {
    const a = await authed("token-a");

    a.ws.sendRaw(orderNew({ rid: "rid-first" }));
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 1, "첫 주문 송신");

    // 탭을 닫는다 → `closeConn` 이 그 연결이 잡은 dup 키를 사용자 맵에서 회수해야 한다.
    await a.ws.close();
    await flushIo(20);

    const b = await authed("token-a");
    b.ws.sendRaw(orderNew({ rid: "rid-second" }));
    // ★ 회수가 없으면 여기서 영원히 거부된다 — 사용자는 그 주문을 다시 낼 수 없다.
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 2, "닫은 뒤 같은 주문 재송신");

    expect(framesOf(b.inbox, "order.result").filter((f) => f.status === "rejected")).toHaveLength(
      0,
    );
    expect(orders.inserts).toHaveLength(2);
  });

  it("㉕ await 중 연결 종료 — insert 왕복 도중 탭을 닫으면 게이트웨이로 나가지 않는다 (GC-CR-03)", async () => {
    let openGate: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    orders = mkOrderStore({ insertGate: gate });
    await restartHarness();

    const a = await authed("token-a");
    a.ws.sendRaw(orderNew({ rid: "rid-toctou" }));
    await waitFor(() => orders.started.insert === 1, "insert 왕복 진입");

    // 아직 왕복이 끝나지 않았다 — 이 순간에 사용자가 탭을 닫는다.
    expect(orderReqsOf(gatewayPayloads)).toHaveLength(0);
    await a.ws.close();
    await flushIo(20);

    // 이제 Supabase 가 응답한다. 가드가 없으면 여기서 고아 `ConnState` 에 대기가 붙고
    // **주문이 실제로 게이트웨이로 나간다**.
    openGate?.();
    await flushIo(20);

    // ★ 송신 0건. 받을 소켓이 없는 주문을 실계좌로 내보내지 않는다.
    expect(orderReqsOf(gatewayPayloads)).toHaveLength(0);
    // 행은 `requested` 로 남지 않는다 — 나가지 않았다는 사실이 상태로 남는다.
    expect(orders.updates.filter((u) => u.status === "rejected")).toHaveLength(1);
    expect(orders.updates[0]?.message).toContain("요청 처리 중 연결이 끊겨");

    // ★ 5초를 넘겨도 `timeout` 이 **추가로** 확정되지 않는다 — 고아 타이머가 아예 없다.
    //   (여기가 무너지면 접수·체결된 주문이 감사 기록에 `timeout` 으로 남는다.)
    await vi.advanceTimersByTimeAsync(ORDER_RESP_TIMEOUT_MS * 2);
    await flushIo(20);
    expect(orders.updates.filter((u) => u.status === "timeout")).toHaveLength(0);
    expect(orders.updates).toHaveLength(1);
  });

  it("㉖ 연결 종료 후 도착한 수동 통보 — 후보 0건이어도 사라지지 않는다, 0행 갱신 대신 error 다 (GC-CR-02)", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => undefined);
    // 탭 2개를 연다. 하나를 닫아도 DMA 세션이 살아 있어야 51 통보를 밀어 넣을 수 있다.
    const a = await authed("token-a");
    await authed("token-a");

    a.ws.sendRaw(orderNew({ rid: "rid-closed" }));
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 1, "주문 송신");

    // 주문을 낸 탭을 닫는다 → `closeConn` 이 `state.pending` 을 비운다. 이후 도착하는
    // 통보는 **후보 0건**이라 좁히기 warn 조차 나지 않는다 — 옛 코드에서 이 경로는
    // 경고도 기록도 없이 통째로 침묵했다.
    await a.ws.close();
    await flushIo(20);

    gateway.pushOrderResp(gatewaySocket(), { noticeType: "A", orderNo: "0000012345" });
    await waitFor(() => orders.lookups.length === 1, "수동 통보 조회");
    await flushIo(20);

    // 후보가 0건이므로 좁히기 warn 은 없다. 그래도 기록 경로는 돌았다.
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain("좁히지 못했다");
    expect(orders.lookups).toEqual([{ userId: USER_A, orderNo: "0000012345" }]);
    // 0행 갱신을 보내지 않는다. 수동 통보는 새 행도 만들지 않는다(행은 ③-2 가 이미 만들었다).
    expect(orders.updates.filter((u) => u.orderRowId === undefined)).toHaveLength(0);
    expect(orders.inserts).toHaveLength(1);

    const errored = JSON.stringify(errorSpy.mock.calls);
    expect(errored).toContain("붙지 않는 수동 통보");
    expect(errored).toContain("0000012345");
    expect(errored).not.toContain(SAMPLE_ACCOUNT_NO);

    // ★ D-24 의 **두 번째 감사 사본**. `dma_orders` 에 붙지 못한 통보라도 Hub 가 수신
    //   사실을 stdout 에 남긴다 — 이 한 줄이 브로커 주문번호와 대조할 유일한 근거다.
    const infoed = JSON.stringify(infoSpy.mock.calls);
    expect(infoed).toContain("감사 사본");
    expect(infoed).toContain("0000012345");
    // 계좌번호·자격증명은 싣지 않는다 (D-19 승계 / T-16-45).
    expect(infoed).not.toContain(SAMPLE_ACCOUNT_NO);
  });

  it("㉗ 행 생성 경로의 예외가 프로세스를 내리지 않는다 — error 로그로 끝난다 (GC-WR-01)", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => undefined);
    await authed("token-a");

    // `autoInsertRow` 가 계좌·시장을 물어보는 자리다. 여기서 터지면 예전에는 그 reject 가
    // `void recordUnmatched(...)` 를 지나 `index.ts` 의 `unhandledRejection` 까지 올라갔고,
    // 그 핸들러는 `logger.fatal` + **프로세스 종료**다 — 접속한 전 사용자의 DMA 세션이 끊긴다.
    vi.spyOn(hub, "getLimitChasers").mockImplementation(() => {
      throw new Error("전략 캐시 파손");
    });

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      gateway.pushOrderResp(gatewaySocket(), {
        noticeType: "A",
        orderNo: "0000077777",
        origin: "LimitChaser",
        quantity: 7,
        price: 12_345,
      });
      // 기다리는 조건을 **기록 결과가 아니라 통보 수신**에 건다 — 결과에 걸면 회귀가
      // 생겼을 때 단언이 아니라 타임아웃으로 죽어 아래 두 단언이 아예 실행되지 않는다.
      await waitFor(
        () => JSON.stringify(infoSpy.mock.calls).includes("감사 사본"),
        "통보 수신 감사 사본",
      );
      await flushIo(30);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }

    // ★ 프로세스를 내릴 rejection 이 하나도 없다.
    expect(unhandled).toHaveLength(0);
    // 행은 만들어지지 않았고(지어내지 않는다), 그 사실이 stdout 에 남는다 — 기록이 0 은 아니다.
    expect(orders.inserts).toHaveLength(0);
    expect(orders.updates).toHaveLength(0);
    expect(JSON.stringify(errorSpy.mock.calls)).toContain("감사 기록 결손");
  });

  it("㉘ 빈 주문번호 거부 2건은 서로 다른 행으로 기록된다 — in-flight 으로 합치지 않는다 (GC-WR-02)", async () => {
    let openGate: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    orders = mkOrderStore({ insertGate: gate });
    await restartHarness();
    await authed("token-a");

    const sock = gatewaySocket();
    // 접수 **전** 거부라 주문번호가 없다 — 두 건 다 `orderNo === ""` 로 온다.
    gateway.pushOrderResp(sock, {
      noticeType: "R",
      orderNo: "",
      origin: "LimitChaser",
      quantity: 7,
      price: 12_345,
      message: "증거금 부족",
    });
    await waitFor(() => orders.started.insert === 1, "첫 insert 진입");

    // 그 왕복이 끝나기 전에 **다른** 자동주문의 거부가 도착한다. 키를 `"user|"` 하나로
    // 합치면 두 번째가 첫 번째의 Promise 를 재사용해 같은 `row.id` 를 받고, 두 patch 가
    // 그 한 행에 차례로 덮어써진다 — 거부 1건이 감사 기록에서 사라진다.
    gateway.pushOrderResp(sock, {
      noticeType: "R",
      orderNo: "",
      origin: "LimitChaser",
      isin: SECOND_ISIN,
      quantity: 3,
      price: 5_000,
      message: "주문가능금액 초과",
    });
    await waitFor(() => orders.started.insert === 2, "두 번째 insert 진입 (합쳐지지 않았다)");

    openGate?.();
    await waitFor(() => orders.updates.length >= 2, "두 거부 모두 기록");
    await flushIo(20);

    // ★ 행 2건, 서로 다른 id 2건. 조회는 한 번도 하지 않는다 — 빈 주문번호에서
    //   `findIdByOrderNo` 는 항상 `null` 이라 왕복이 순손실이다.
    expect(orders.inserts).toHaveLength(2);
    expect(orders.lookups).toHaveLength(0);
    const rowIds = orders.updates.map((u) => u.orderRowId);
    expect(new Set(rowIds).size).toBe(2);
    expect(rowIds).toEqual(expect.arrayContaining(["row-1", "row-2"]));
    // 두 거부의 사유가 각자의 행에 남는다.
    expect(orders.updates).toContainEqual(expect.objectContaining({ message: "증거금 부족" }));
    expect(orders.updates).toContainEqual(
      expect.objectContaining({ message: "주문가능금액 초과" }),
    );
  });

  it("㉙ 매수/매도 동시 대기는 접수 통보의 매매구분으로 갈린다 — 둘 다 「결과 모름」이 아니다 (GC-WR-03)", async () => {
    const { ws, inbox } = await authed("token-a");

    // 같은 종목·같은 수량·같은 가격. `orgOrderNo`·`noticeType`·수량·가격 어느 축으로도
    // 갈리지 않고, **방향만이** 이 둘을 가른다. 축이 없던 시절에는 실제로 접수된 주문
    // 2건이 모두 5초 뒤 「결과를 확인하지 못했습니다」로 끝났다.
    ws.sendRaw(orderNew({ rid: "rid-buy", side: "B" }));
    ws.sendRaw(orderNew({ rid: "rid-sell", side: "S" }));
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 2, "신규 2건 송신");

    gateway.pushOrderResp(gatewaySocket(), {
      noticeType: "A",
      side: "S",
      orderNo: "0000012345",
    });
    await waitFor(() => framesOf(inbox, "order").length === 1, "51 푸시");
    await waitFor(() => framesOf(inbox, "order.result").length === 1, "매도 대기 정산");
    await flushIo(20);

    // ★ 매도 쪽 **하나만** 정산된다. 매수 대기까지 정산하면 살아 있는 주문이 「접수됨」으로
    //   확정돼 사용자가 재주문할 근거가 되고, 아무것도 정산하지 않으면 GC-WR-03 그대로다.
    const settled = framesOf(inbox, "order.result");
    expect(settled).toHaveLength(1);
    expect(settled[0]).toMatchObject({ rid: "rid-sell", status: "accepted", orderNo: "0000012345" });
    // 정산했으므로 기록 경로(`recordUnmatched`)로 새지 않았다 — 조회 0건.
    expect(orders.lookups).toHaveLength(0);
    expect(orders.updates).toHaveLength(1);
    expect(orders.updates[0]).toMatchObject({ orderRowId: "row-2", orderNo: "0000012345" });

    // 반대쪽 매수 대기는 **그대로 살아 있다** — 자기 통보가 오지 않았으므로 5초 뒤
    // 「결과 모름」으로 끝나는 것이 이 상황의 진실이다 (Pitfall 9).
    await vi.advanceTimersByTimeAsync(ORDER_RESP_TIMEOUT_MS);
    await waitFor(() => framesOf(inbox, "order.result").length === 2, "매수 대기의 timeout");
    expect(framesOf(inbox, "order.result")[1]).toMatchObject({
      rid: "rid-buy",
      status: "timeout",
    });
  });

  it("㉚ 같은 가격·같은 잔량의 미체결 2건을 연달아 취소할 수 있다 — 취소 키는 원주문번호다 (GC-WR-10)", async () => {
    const { ws, inbox } = await authed("token-a");

    // 같은 종목·같은 가격·같은 잔량의 미체결 2건은 흔하다(다른 단말·전일 잔여·자동주문).
    // 취소 수량은 언제나 미체결 잔량 전부이므로(UI D-21) 가격·수량 키로는 두 취소가
    // **같은 주문**으로 보인다 — 그러면 급락 국면의 일괄 취소가 최대 5초 막힌다.
    ws.sendRaw(orderCancel({ rid: "rid-c1", orgOrderNo: "0000012345" }));
    ws.sendRaw(orderCancel({ rid: "rid-c2", orgOrderNo: "0000067890" }));
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 2, "취소 2건 송신");

    // ★ 둘 다 게이트웨이로 나간다. 거부 프레임은 한 건도 없다.
    const reqs = orderReqsOf(gatewayPayloads).map((e) => e.directOrderReq());
    expect(reqs.map((r) => r?.orgOrderNo())).toEqual(["0000012345", "0000067890"]);
    expect(reqs.every((r) => r?.orderType() === "C")).toBe(true);
    expect(framesOf(inbox, "order.result")).toHaveLength(0);
    expect(orders.inserts).toHaveLength(2);
  });

  it("㉛ 같은 원주문번호 취소를 연타하면 두 번째는 거부다 — 가드를 없앤 것이 아니다 (GC-WR-10)", async () => {
    const { ws, inbox } = await authed("token-a");

    ws.sendRaw(orderCancel({ rid: "rid-c1", orgOrderNo: "0000012345" }));
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 1, "첫 취소 송신");

    // 같은 원주문번호 = 같은 취소다. rid 가 달라도(다른 탭·다른 클릭) 거부한다.
    ws.sendRaw(orderCancel({ rid: "rid-c2", orgOrderNo: "0000012345" }));
    await waitFor(() => framesOf(inbox, "order.result").length === 1, "중복 취소 거부");

    expect(framesOf(inbox, "order.result")[0]).toMatchObject({
      rid: "rid-c2",
      status: "rejected",
      message: "같은 주문이 이미 처리 중입니다. 결과를 기다려 주세요.",
    });
    // 게이트웨이로 나간 것은 여전히 1건뿐이다.
    expect(orderReqsOf(gatewayPayloads)).toHaveLength(1);
    expect(orders.inserts).toHaveLength(1);
  });
});

// ============================================================
// `narrowPending` 순수 단위 — 축별 좁히기 (gap 2 / T-16-29)
// ============================================================

/** 대기 1건. 타이머는 즉시 걷는다 — 이 구역은 매칭 규칙만 본다. */
function mkPending(over: Partial<PendingOrder> = {}): PendingOrder {
  const timer = setTimeout(() => undefined, 0);
  clearTimeout(timer);
  return {
    rid: "rid",
    orderRowId: "row",
    isin: SAMPLE_ISIN,
    qty: 10,
    price: 70_000,
    // 신규 대기의 기본은 매수다. 취소 대기(`isCancel: true`)를 만들 때는 `side: ""` 를
    // 함께 넘긴다 — 취소 요청에는 매매구분이 없다 (GC-WR-03).
    side: "B",
    isCancel: false,
    orgOrderNo: "",
    timer,
    settle: () => undefined,
    ...over,
  };
}

/** 통보 1건. 게이트웨이 파싱 결과를 그대로 흉내 낸다. */
function mkNotice(over: Partial<ParsedOrderResp> = {}): ParsedOrderResp {
  return {
    orderNo: "0000012345",
    noticeType: "A",
    resultCode: 0,
    message: "정상처리",
    isin: SAMPLE_ISIN,
    side: "B",
    sideTrusted: true,
    price: 70_000,
    quantity: 10,
    orgOrderNo: "",
    exchange: "KRX",
    origin: "Manual",
    originKind: "manual",
    ...over,
  };
}

describe("narrowPending — 통보 매칭 축 (gap 2)", () => {
  it("유일 후보라도 취소확인은 신규 대기를 정산하지 않는다 (GC-CR-01)", () => {
    expect(narrowPending([], mkNotice())).toBeNull();

    // 통보가 **실어 온** 강한 축은 후보 수와 무관한 하드 필터다. 신규 대기 1건 앞에
    // 취소확인이 오면(다른 탭·자동주문·세션 합류로 들어온 남의 통보) 아무것도 정산하지
    // 않는다 — 정산하면 살아 있는 매수 주문이 화면에 「취소됨」으로 뜨고, 사용자가 그것을
    // 믿고 재주문하면 중복 체결이다.
    const fresh = mkPending({ rid: "new" });
    expect(
      narrowPending([fresh], mkNotice({ noticeType: "C", orgOrderNo: "0000012345" })),
    ).toBeNull();

    // 비어 있는 축은 여전히 건너뛴다 — 구 게이트웨이 호환·정상 경로 회귀 방지.
    // 수량·가격이 어긋나도 ③④ 는 단계적 좁히기라 그 대기가 그대로 나온다.
    const only = mkPending({ qty: 3, price: 111 });
    expect(narrowPending([only], mkNotice({ noticeType: "A", quantity: 999, price: 999 }))).toBe(
      only,
    );

    // 취소 대기 1건 + **다른** 원주문번호의 취소확인 → 그 취소 대기의 것이 아니다.
    const cancel = mkPending({ rid: "cancel", side: "", isCancel: true, orgOrderNo: "0000012345" });
    expect(
      narrowPending([cancel], mkNotice({ noticeType: "C", orgOrderNo: "0000099999" })),
    ).toBeNull();
  });

  it("① 취소 축 — 원주문번호가 있으면 그 취소 대기로 좁힌다", () => {
    const fresh = mkPending({ rid: "new" });
    const cancel = mkPending({ rid: "cancel", side: "", isCancel: true, orgOrderNo: "0000012345" });

    const picked = narrowPending(
      [fresh, cancel],
      mkNotice({ noticeType: "C", orgOrderNo: "0000012345" }),
    );
    expect(picked).toBe(cancel);
  });

  it("② 통보 종류 축 — 구 서버가 원주문번호를 비워도 취소확인은 취소 대기로 간다", () => {
    const fresh = mkPending({ rid: "new" });
    const cancel = mkPending({ rid: "cancel", side: "", isCancel: true, orgOrderNo: "0000012345" });

    expect(narrowPending([fresh, cancel], mkNotice({ noticeType: "C" }))).toBe(cancel);
    // 접수는 반대쪽이다.
    expect(narrowPending([fresh, cancel], mkNotice({ noticeType: "A" }))).toBe(fresh);
    // 거부("R")는 신규·취소 어느 쪽에도 오므로 이 축을 쓰지 않는다 — 좁히지 못한다.
    expect(narrowPending([fresh, cancel], mkNotice({ noticeType: "R" }))).toBeNull();
  });

  it("②-1 매매구분 축 — 매수/매도 동시 대기는 접수 통보의 방향으로 갈린다 (GC-WR-03)", () => {
    const buy = mkPending({ rid: "buy", side: "B" });
    const sell = mkPending({ rid: "sell", side: "S" });

    // ③④ 로는 영원히 갈리지 않는 조합이다(수량·가격이 같다). 방향이 유일한 축이고
    // 접수 통보는 그것을 실어 온다 — 축이 없으면 **둘 다** 타임아웃으로 끝난다.
    expect(narrowPending([buy, sell], mkNotice({ noticeType: "A", side: "B" }))).toBe(buy);
    expect(narrowPending([buy, sell], mkNotice({ noticeType: "A", side: "S" }))).toBe(sell);
    // 체결 통보도 방향은 변하지 않는다 — 수량·가격 축이 죽는 부분체결에서 더욱 그렇다.
    expect(
      narrowPending([buy, sell], mkNotice({ noticeType: "E", side: "S", quantity: 3 })),
    ).toBe(sell);
    // 원문이 "S" 계열 접두여도 첫 글자로 판정한다 (`fromWireSide`).
    expect(narrowPending([buy, sell], mkNotice({ noticeType: "A", side: "SELL" }))).toBe(sell);
    // 모르는 값은 매수로 지어내지 않는다 — 축을 건너뛰고 좁히지 못한 채 끝난다.
    expect(narrowPending([buy, sell], mkNotice({ noticeType: "A", side: "?" }))).toBeNull();
  });

  it("②-1 매매구분 축은 취소·정정·거부 통보에 적용되지 않는다 (Pitfall 8)", () => {
    const cancel = mkPending({ rid: "cancel", side: "", isCancel: true, orgOrderNo: "0000012345" });
    const buy = mkPending({ rid: "buy", side: "B" });

    // 취소확인의 매매구분은 브로커가 채울 값이 없다(MockBroker 는 "B" 를 남긴다). 축을
    // 걸면 `!p.isCancel` 이 취소 대기를 지워 정상 매칭이 깨진다 — `sideTrusted` 가 그 경계다.
    expect(
      narrowPending([buy, cancel], mkNotice({ noticeType: "C", side: "B", sideTrusted: false })),
    ).toBe(cancel);
    // 정정확인도 같다.
    expect(
      narrowPending([buy, cancel], mkNotice({ noticeType: "M", side: "B", sideTrusted: false })),
    ).toBe(cancel);
    // 거부("R")는 `sideTrusted` 가 true 로 오지만(파서는 C/M 만 false 로 둔다) **취소
    // 대기에도 온다.** 취소 요청에는 매매구분이 없으므로 그 통보의 side 는 브로커 기본값이고,
    // 축을 걸면 살아 있는 신규 주문이 「거부됨」으로 뜬다 — ② 가 "R" 을 건너뛰는 것과 같은 근거다.
    expect(narrowPending([buy, cancel], mkNotice({ noticeType: "R", side: "B" }))).toBeNull();
    // 구 서버의 빈 `noticeType` 도 같은 이유로 축을 쓰지 않는다.
    expect(narrowPending([buy, cancel], mkNotice({ noticeType: "", side: "B" }))).toBeNull();
  });

  it("③ 수량 축 · ④ 가격 축 — 접수 통보는 주문값을 그대로 싣는다", () => {
    const ten = mkPending({ rid: "ten", qty: 10 });
    const five = mkPending({ rid: "five", qty: 5 });
    expect(narrowPending([ten, five], mkNotice({ quantity: 5 }))).toBe(five);

    const cheap = mkPending({ rid: "cheap", price: 70_000 });
    const dear = mkPending({ rid: "dear", price: 71_000 });
    expect(narrowPending([cheap, dear], mkNotice({ price: 71_000 }))).toBe(dear);
  });

  it("체결(\"E\") 통보는 수량·가격 축을 쓰지 않는다 — 부분체결이면 주문값과 다르다", () => {
    const ten = mkPending({ rid: "ten", qty: 10 });
    const five = mkPending({ rid: "five", qty: 5 });

    // 3주 부분체결. 하드 필터였다면 후보가 0이 되어 정상 통보를 버렸을 것이다.
    expect(narrowPending([ten, five], mkNotice({ noticeType: "E", quantity: 3 }))).toBeNull();
  });

  it("축이 후보를 전부 지우면 그 축은 적용하지 않는다 — 다음 축이 계속 좁힌다", () => {
    const a = mkPending({ rid: "a", qty: 10, price: 70_000 });
    const b = mkPending({ rid: "b", qty: 5, price: 71_000 });

    // 수량 7 은 어느 후보와도 맞지 않는다(축이 틀렸다). 그 축을 버리고 가격으로 좁힌다.
    expect(narrowPending([a, b], mkNotice({ quantity: 7, price: 71_000 }))).toBe(b);
  });

  it("같은 방향 2건은 좁혀지지 않는다 — 「가장 오래된 것」 폴백은 없다", () => {
    const first = mkPending({ rid: "first", side: "B" });
    const second = mkPending({ rid: "second", side: "B" });

    // 축이 전부 같다(방향까지). 폴백이 있으면 `first` 가 나오고, 그것이 gap 2 의 재발이다.
    // ②-1 축이 생긴 뒤에도 **가를 수 없는 것은 여전히 가르지 않는다**는 규율을 잠근다.
    expect(narrowPending([first, second], mkNotice())).toBeNull();
    // 매수 2건에 매도 접수 통보가 오면 축이 후보를 전부 지운다 → `refine` 이므로 건너뛰고,
    // 남은 축으로도 갈리지 않아 결국 `null` 이다 (하드 필터였다면 여기서도 `null` 이지만
    // 정상 통보를 버리는 다른 경로들이 함께 깨진다).
    expect(narrowPending([first, second], mkNotice({ noticeType: "A", side: "S" }))).toBeNull();
  });
});
