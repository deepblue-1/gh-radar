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
import { createOrderHandler } from "../src/ws/order-handler.js";
import { SubscriptionHub } from "../src/hub/subscription-hub.js";
import { SessionManager } from "../src/dma/session-manager.js";
import { encryptDmaPassword } from "../src/store/credentials.js";
import { resetDroppedEnvelopeCount } from "../src/dma/envelope.js";
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
function mkOrderStore(opts: { existingId?: string | null; insertFails?: boolean } = {}) {
  const inserts: OrderInsertRow[] = [];
  const updates: OrderUpdate[] = [];
  const lookups: string[] = [];
  let nextId = 1;
  return {
    inserts,
    updates,
    lookups,
    store: {
      insertRequest: async (row: OrderInsertRow): Promise<string> => {
        await Promise.resolve();
        if (opts.insertFails === true) throw new Error("supabase insert down");
        inserts.push(row);
        return `row-${nextId++}`;
      },
      enqueueUpdate: (u: OrderUpdate): void => {
        updates.push(u);
      },
      findIdByOrderNo: async (orderNo: string): Promise<string | null> => {
        lookups.push(orderNo);
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
    // 다만 기록은 남는다 — `order_no` 로 좁힌 갱신이다 (수동 주문이라 insert 분기는 아니다).
    expect(orders.updates).toContainEqual(
      expect.objectContaining({ orderNo: "0000012345", status: "accepted" }),
    );
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
    expect(orders.lookups).toEqual(["0000099999"]);
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

  it("⑭ 수동 통보는 조회도 insert 도 하지 않는다 — 행은 요청 시점에 이미 있다", async () => {
    await authed("token-a");

    gateway.pushOrderResp(gatewaySocket(), {
      noticeType: "E",
      orderNo: "0000012345",
      origin: "Manual",
      quantity: 10,
    });
    await waitFor(() => orders.updates.length > 0, "수동 통보 갱신");
    await flushIo();

    expect(orders.lookups).toHaveLength(0);
    expect(orders.inserts).toHaveLength(0);
    expect(orders.updates).toContainEqual(
      expect.objectContaining({ orderNo: "0000012345", origin: "manual" }),
    );
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
});
