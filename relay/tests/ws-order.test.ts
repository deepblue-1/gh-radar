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
 *   · 대기와 매칭되지 않는 자동주문 통보는 `order.result` 를 만들지 않고 Hub 팬아웃만 탄다
 *   · 중복 rid·중복 파라미터는 거부 (T-16-10)
 *
 * Phase 19 D-01 — relay 사용자 세션 경로는 DB 에 쓰지 않는다. 기록 창구 스텁과 DB 단언은
 * 걷어냈고(기록은 관찰자 기록기 단독), 이 파일은 rid 즉시응답 상관만 본다.
 *
 * 스텁은 둘뿐이다 — Supabase(토큰·자격증명) · 종목마스터.
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
import { createOrderHandler, narrowPending, type PendingOrder } from "../src/ws/order-handler.js";
import { SubscriptionHub } from "../src/hub/subscription-hub.js";
import { SessionManager } from "../src/dma/session-manager.js";
import { encryptDmaPassword } from "../src/store/credentials.js";
import { resetDroppedEnvelopeCount, type ParsedOrderResp } from "../src/dma/envelope.js";
import { ORDER_RESP_TIMEOUT_MS } from "../src/order/notice-status.js";
import { MSG } from "../src/dma/msg-type.js";
import { logger } from "../src/logger.js";
import { Envelope } from "../src/generated/stock-dma/envelope.js";
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
/**
 * 당일 신규상장 — Supabase `stocks` 에 없고 게이트웨이 종목마스터(57) 보조 원천에서만 풀린다
 * (quick-260923-cqj).
 */
const GATEWAY_ISIN = "KR70010S0000";

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

/** 종목마스터 스텁. 「모르는 종목」과 「시장 미상」을 둘 다 만든다. */
const SYMBOLS: SymbolLookup = {
  lookup: (isin: string): SymbolInfo | undefined => {
    if (isin === SAMPLE_ISIN) return { code: "005930", name: "삼성전자", market: "K" };
    if (isin === SECOND_ISIN) return { code: "035720", name: "카카오", market: "Q" };
    if (isin === NO_MARKET_ISIN) return { code: "000660", name: "시장미상", market: null };
    if (isin === GATEWAY_ISIN) {
      return { code: "0010S0", name: "신규상장", market: "Q", source: "gateway" };
    }
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

/** 정상 정정 인바운드 (Phase 18 D-21). 원주문번호 + 정정 후 방향·수량·가격. */
function orderModify(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    t: "order.modify",
    rid: "rid-m",
    isin: SAMPLE_ISIN,
    exchange: "KRX",
    orgOrderNo: "0000012345",
    side: "B",
    qty: 10,
    price: 71_000,
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
    expect(req?.orderType()).toBe("N");

    gateway.pushOrderResp(gatewaySocket(), { noticeType: "A", orderNo: "0000012345" });
    await waitFor(() => framesOf(inbox, "order.result").length === 1, "order.result 수신");

    const result = framesOf(inbox, "order.result")[0];
    expect(result).toMatchObject({ rid: "rid-1", orderNo: "0000012345", status: "accepted" });
  });

  it("①-b 게이트웨이 보조 원천 종목(당일 신규상장)은 market Q 로 나간다 (quick-260923-cqj D-06)", async () => {
    const { ws } = await authed("token-a");

    ws.sendRaw(orderNew({ isin: GATEWAY_ISIN }));
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 1, "DirectOrderReq(2) 송신");

    // 주문 자체는 게이트웨이로 나간다 — ISIN 과 보조 원천의 시장으로 조립된다.
    const req = orderReqsOf(gatewayPayloads)[0]?.directOrderReq();
    expect(req?.stockCode()).toBe(GATEWAY_ISIN);
    expect(req?.market()).toBe("Q");
  });

  it("①-c 대기와 매칭되지 않는 자동주문(상따) 통보는 order.result 를 만들지 않는다 — Hub 팬아웃·감사 사본은 그대로다 (Phase 19 D-01·D-03)", async () => {
    const infoSpy = vi.spyOn(logger, "info");
    const a = await authed("token-a");
    const b = await authed("token-a"); // 같은 사용자의 두 번째 탭

    // A 탭에는 다른 종목의 수동 주문이 대기 중이다 — 자동주문 통보가 그 대기를 정산하면 안 된다.
    a.ws.sendRaw(orderNew({ rid: "rid-manual", isin: SECOND_ISIN }));
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 1, "수동 주문 송신");

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      // 주문을 낸 적이 없는 종목 — 상따 전략이 알아서 발주한 상황이다.
      gateway.pushOrderResp(gatewaySocket(), {
        isin: GATEWAY_ISIN,
        noticeType: "A",
        orderNo: "0000077777",
        origin: "LimitChaser",
        quantity: 5,
        price: 15_000,
      });
      // 51 푸시(`{t:"order"}`)는 **사용자 전 연결**이다 — 토스트·전략 로그 표면 (D-03).
      await waitFor(() => framesOf(a.inbox, "order").length === 1, "A 탭 51 푸시");
      await waitFor(() => framesOf(b.inbox, "order").length === 1, "B 탭 51 푸시");
      await flushIo(20);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }

    expect(framesOf(a.inbox, "order")[0]).toMatchObject({ no: "0000077777", nt: "A" });
    // ★ 대기 밖 통보는 즉시응답 상관 대상이 아니다 — 어느 탭에도 `order.result` 가 없다.
    expect(framesOf(a.inbox, "order.result")).toHaveLength(0);
    expect(framesOf(b.inbox, "order.result")).toHaveLength(0);
    // 기록 경로가 사라졌으므로 예외도, 프로세스를 내릴 rejection 도 없다.
    expect(unhandled).toHaveLength(0);

    // Hub 의 감사 사본은 유지된다 (Open Q7) — 계좌번호는 싣지 않는다 (T-16-45).
    const infoed = JSON.stringify(infoSpy.mock.calls);
    expect(infoed).toContain("감사 사본");
    expect(infoed).toContain("0000077777");
    expect(infoed).not.toContain(SAMPLE_ACCOUNT_NO);

    // 수동 대기는 그대로 살아 있다가 5초 뒤 「결과 모름」으로 끝난다 — 오정산이 없었다.
    await vi.advanceTimersByTimeAsync(ORDER_RESP_TIMEOUT_MS);
    await waitFor(() => framesOf(a.inbox, "order.result").length === 1, "수동 대기 timeout");
    expect(framesOf(a.inbox, "order.result")[0]).toMatchObject({
      rid: "rid-manual",
      status: "timeout",
    });
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
    // 결과를 모르는 것이지 코드를 아는 것이 아니다 — 음수는 relay 자체 판정이라는 표지다.
    expect(result?.resultCode).toBeLessThan(0);
  });

  it("⑨ 늦게 온 통보가 이미 정산된 요청에 두 번째 order.result 를 만들지 않는다", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
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

    // 그리고 5초가 지나도 timeout 프레임이 추가로 오지 않는다(타이머가 정리됐다).
    await vi.advanceTimersByTimeAsync(ORDER_RESP_TIMEOUT_MS * 2);
    await flushIo();
    expect(framesOf(inbox, "order.result")).toHaveLength(1);
  });

  it("⑪ 연결이 끊기면 그 연결의 대기열·타이머가 정리된다 (누수 0)", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const { ws, inbox } = await authed("token-a");

    ws.sendRaw(orderNew());
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 1, "주문 송신");

    await ws.close();
    await flushIo();

    await vi.advanceTimersByTimeAsync(ORDER_RESP_TIMEOUT_MS * 2);
    await flushIo();

    // ★ 프레임 부재만으로는 아무것도 증명하지 못한다 — 닫힌 소켓에는 어차피 `#send` 가
    //   `readyState` 를 보고 아무것도 쓰지 않기 때문이다(타이머가 살아 있어도 통과한다).
    //   타이머가 **실제로 정리됐는지**는 `finish(null)` 이 send 보다 **먼저** 남기는
    //   「첫 주문 통보 미수신」 error 로그로만 관측된다.
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("첫 주문 통보 미수신");
    expect(framesOf(inbox, "order.result")).toHaveLength(0);
  });

  // ----------------------------------------------------------
  // 핸들러 단위 — wss 스키마가 가려 주는 마지막 관문
  // ----------------------------------------------------------

  it("⑮ ③ 원주문번호 재확인은 스키마 뒤의 마지막 관문이다 (직접 호출 경로)", async () => {
    // wss 로는 ④ 가 보였듯 스키마에서 끊긴다. 그래도 조립 단계 앞의 방어를 남겨 두는 이유는
    // 「모든 호출 경로의 마지막 관문」이어야 하기 때문이다 — 여기서 그 분기를 직접 친다.
    const sent: unknown[] = [];
    const handler = createOrderHandler<object>({
      sessions: {
        get: () => ({
          isReady: true,
          allowedAccounts: [{ accountNo: SAMPLE_ACCOUNT_NO, name: "위탁종합" }],
          send: () => true,
        }),
      },
      hub: { on: () => undefined },
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
    handler.close();
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
  });

  it("㉑ 같은 방향 2건을 좁히지 못한 통보는 아무것도 정산하지 않는다 — 대기는 살아서 타임아웃으로 끝난다 (gap 2)", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
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
    //   잘못 귀속된 결과는 결과가 없는 것보다 나쁘므로 **아무것도** 정산하지 않는다.
    expect(framesOf(inbox, "order.result")).toHaveLength(0);

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
  });

  // ----------------------------------------------------------
  // 표기·미지 값 — R2-WR-03 / R2-WR-06
  // ----------------------------------------------------------

  it("㉜ 원주문번호의 표기가 달라도 취소는 정산된다 — 선행 0 하나로 timeout 이 되지 않는다 (R2-WR-03①)", async () => {
    const { ws, inbox } = await authed("token-a");

    // 요청은 미체결 목록의 표기를 그대로 싣는다 — 와이어 주문번호는 10자리 고정폭 0 패딩이다.
    ws.sendRaw(orderCancel({ rid: "rid-cancel", orgOrderNo: "0000012345" }));
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 1, "취소 송신");

    // 통보는 **다른 단말이 만든 표기**로 온다. 같은 주문번호이고 패딩만 없다 —
    // 원장 유입분·재기동 복원분이 섞이는 미체결 목록에서 실제로 갈리는 자리다.
    gateway.pushOrderResp(gatewaySocket(), {
      noticeType: "C",
      orderNo: "0000012399",
      orgOrderNo: "12345",
      quantity: 10,
      price: 70_000,
    });
    await waitFor(() => framesOf(inbox, "order.result").length === 1, "취소확인 order.result");

    // ★ 정규화가 없으면 하드 필터가 후보를 0건으로 만들고 `null` 을 돌려준다 — 5초 뒤
    //   `finish(null)` 이 `status:"timeout"` 을 보내, **실제로 확인된 취소가 요청 탭에
    //   「결과를 확인하지 못했습니다」로 끝난다.** 그것이 이 케이스의 의미다.
    expect(framesOf(inbox, "order.result")[0]).toMatchObject({
      rid: "rid-cancel",
      status: "cancelled",
      orderNo: "0000012399",
    });

    // 5초가 지나도 timeout 은 나가지 않는다 — 대기는 이미 걷혔다.
    await vi.advanceTimersByTimeAsync(ORDER_RESP_TIMEOUT_MS);
    await flushIo(20);
    expect(framesOf(inbox, "order.result")).toHaveLength(1);
  });

  it("㉝ 정규화 후에도 어긋나는 원주문번호는 축 전멸 로그를 남긴다 — 원문은 싣지 않는다 (R2-WR-03②)", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const { ws, inbox } = await authed("token-a");

    ws.sendRaw(orderCancel({ rid: "rid-cancel", orgOrderNo: "0000012345" }));
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 1, "취소 송신");

    // 표기가 아니라 **값**이 다르다 — 남의 취소확인이다. 정산하지 않는 것이 옳다.
    gateway.pushOrderResp(gatewaySocket(), {
      noticeType: "C",
      orderNo: "0000012399",
      orgOrderNo: "0000099999",
      quantity: 10,
      price: 70_000,
    });
    await waitFor(() => framesOf(inbox, "order").length === 1, "51 푸시");
    await flushIo(20);

    // (a) 아무것도 정산되지 않는다.
    expect(framesOf(inbox, "order.result")).toHaveLength(0);

    // (b) 축이 후보를 **전부** 지운 사실이 전용 로그로 남는다. 바깥의 「좁히지 못했다」만
    //     있으면 표기 어긋남과 남의 통보를 구분할 수 없다 — 실계좌에서 원인을 못 짚는다.
    const warned = JSON.stringify(warnSpy.mock.calls);
    expect(warned).toContain("강한 축이 후보를 전부 지웠다");
    // 원인 축이 로그만으로 특정된다: 원주문번호 축이 지웠다(취소성 축 이전에 이미 0건).
    expect(warned).toContain('"afterOrgOrderNo":0');
    expect(warned).toContain('"orgOrderNoApplied":true');
    // 비식별 신호는 싣는다 — 정규화 후 길이("99999")로 패딩 문제와 값 불일치를 가른다.
    expect(warned).toContain('"orgOrderNoLen":5');

    // (c) 주문번호 **원문**은 어느 쪽도 로그에 없다 (T-16-45 — ㉑ 과 같은 규율).
    expect(warned).not.toContain("0000099999");
    expect(warned).not.toContain("0000012345");
    expect(warned).not.toContain(SAMPLE_ACCOUNT_NO);
  });

  // ----------------------------------------------------------
  // 정정 (Phase 18 D-21 / T-18-01 · T-18-02)
  // ----------------------------------------------------------

  it("㉟ 정정은 orderType \"M\" + 원주문번호 + 요청 방향으로 송신되고 정정확인으로 정산된다", async () => {
    const { ws, inbox } = await authed("token-a");

    ws.sendRaw(orderModify());
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 1, "정정 DirectOrderReq(2)");

    const req = orderReqsOf(gatewayPayloads)[0]?.directOrderReq();
    expect(req?.orderType()).toBe("M");
    expect(req?.orgOrderNo()).toBe("0000012345");
    expect(req?.side()).toBe("B");
    expect(req?.price()).toBe(71_000);

    // 정정확인("M")은 원주문번호를 실어 온다 — 정정 대기가 원주문 참조 대기로 등록돼 있어야
    // 원주문번호 하드 필터를 통과한다(신규처럼 등록되면 여기서 5초 timeout 이 된다).
    gateway.pushOrderResp(gatewaySocket(), {
      noticeType: "M",
      orderNo: "0000012400",
      orgOrderNo: "0000012345",
    });
    await waitFor(() => framesOf(inbox, "order.result").length === 1, "정정확인 order.result");
    expect(framesOf(inbox, "order.result")[0]).toMatchObject({ rid: "rid-m", status: "accepted" });
  });

  it("㊱ 같은 값의 정정 연타는 거부, 가격을 바꾼 재정정은 통과한다 — 정정 키는 원주문번호+가격+수량 (T-18-02)", async () => {
    const { ws, inbox } = await authed("token-a");

    ws.sendRaw(orderModify({ rid: "rid-m1", price: 71_000 }));
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 1, "첫 정정 송신");

    // 같은 원주문·같은 값 = 같은 정정이다. rid 가 달라도 거부한다.
    ws.sendRaw(orderModify({ rid: "rid-m2", price: 71_000 }));
    await waitFor(() => framesOf(inbox, "order.result").length === 1, "중복 정정 거부");
    expect(framesOf(inbox, "order.result")[0]).toMatchObject({
      rid: "rid-m2",
      status: "rejected",
      message: "같은 주문이 이미 처리 중입니다. 결과를 기다려 주세요.",
    });

    // 가격 추적 — 같은 원주문을 다른 가격으로 곧바로 재정정하는 것은 정상 조작이다.
    ws.sendRaw(orderModify({ rid: "rid-m3", price: 71_500 }));
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 2, "재정정 송신");
    const prices = orderReqsOf(gatewayPayloads).map((e) => e.directOrderReq()?.price());
    expect(prices).toEqual([71_000, 71_500]);
  });

  it("㊲ 정정도 계좌 화이트리스트 게이트를 지난다 — 우회 분기 없음 (T-18-01)", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const { ws, inbox } = await authed("token-a");

    ws.sendRaw(orderModify({ accountNo: FOREIGN_ACCOUNT_NO }));
    await waitFor(() => framesOf(inbox, "order.result").length === 1, "거부 order.result");

    expect(framesOf(inbox, "order.result")[0]).toMatchObject({
      rid: "rid-m",
      status: "rejected",
      message: "이 세션에서 사용할 수 없는 계좌입니다.",
    });
    expect(orderReqsOf(gatewayPayloads)).toHaveLength(0);
  });

  it("㊴ 조각 수·시간외종가 세션은 와이어에 실린다 — 조각 수 1 이하는 비운다 (D-22/D-23)", async () => {
    const infoSpy = vi.spyOn(logger, "info");
    const { ws } = await authed("token-a");

    ws.sendRaw(orderNew({ rid: "rid-g3", price: 0, krxSession: "G3", pieceCount: 3 }));
    ws.sendRaw(orderNew({ rid: "rid-p1", price: 70_100, pieceCount: 1 }));
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 2, "두 신규 송신");

    const [g3, p1] = orderReqsOf(gatewayPayloads).map((e) => e.directOrderReq());
    expect(g3?.price()).toBe(0);
    expect(g3?.krxSession()).toBe("G3");
    expect(g3?.pieceCount()).toBe(3);
    expect(p1?.pieceCount()).toBe(0);
    expect(p1?.krxSession()).toBeNull();

    // 무성 소실 방어 로그 — 조립 직전 두 값이 남고 계좌번호 원문은 없다 (T-18-06/07).
    const logged = JSON.stringify(infoSpy.mock.calls);
    expect(logged).toContain("조각 수·시간외종가 세션");
    expect(logged).not.toContain(SAMPLE_ACCOUNT_NO);
  });

  it("㊳ 원주문번호 없는 정정은 스키마에서 끊긴다 — 게이트웨이로 0바이트", async () => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const { ws } = await authed("token-a");

    ws.sendRaw(orderModify({ orgOrderNo: "" }));
    await waitFor(() => ws.closeInfo !== null, "스키마 위반 close");

    expect(ws.closeInfo?.code).toBe(4400);
    expect(orderReqsOf(gatewayPayloads)).toHaveLength(0);
  });

  it("㊵ 가격 0 취소(시간외종가 원주문)가 orderType C · price 0 으로 송신되고 취소확인으로 정산된다 (CR-01)", async () => {
    const { ws, inbox } = await authed("token-a");

    // 브라우저 모양 그대로 — 호출부는 원주문 가격을 싣고, 시간외종가 원주문은 가격 0 이다.
    ws.sendRaw({
      t: "order.cancel",
      rid: "rid-c0",
      isin: SAMPLE_ISIN,
      exchange: "KRX",
      orgOrderNo: "0000012345",
      qty: 10,
      price: 0,
      accountNo: SAMPLE_ACCOUNT_NO,
    });
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 1, "가격 0 취소 DirectOrderReq(2)");

    // 스키마에서 끊기지 않았다 — 옛 규칙이면 여기서 close(4400) 로 소켓째 끊겼다.
    expect(ws.closeInfo).toBeNull();
    const req = orderReqsOf(gatewayPayloads)[0]?.directOrderReq();
    expect(req?.orderType()).toBe("C");
    expect(req?.orgOrderNo()).toBe("0000012345");
    expect(req?.price()).toBe(0);

    gateway.pushOrderResp(gatewaySocket(), {
      noticeType: "C",
      orderNo: "0000012399",
      orgOrderNo: "0000012345",
    });
    await waitFor(() => framesOf(inbox, "order.result").length === 1, "취소확인 order.result");
    expect(framesOf(inbox, "order.result")[0]).toMatchObject({ rid: "rid-c0", status: "cancelled" });
  });

  it("㊶ 취소 가격 −1 과 정정 가격 0 은 스키마에서 끊긴다 — 게이트웨이로 0바이트 (CR-01)", async () => {
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);

    // 취소는 0 까지만 연다 — 음수는 여전히 스키마 위반이다.
    const cancelConn = await authed("token-a");
    cancelConn.ws.sendRaw({
      t: "order.cancel",
      rid: "rid-cneg",
      isin: SAMPLE_ISIN,
      exchange: "KRX",
      orgOrderNo: "0000012345",
      qty: 10,
      price: -1,
      accountNo: SAMPLE_ACCOUNT_NO,
    });
    await waitFor(() => cancelConn.ws.closeInfo !== null, "취소 −1 스키마 위반 close");
    expect(cancelConn.ws.closeInfo?.code).toBe(4400);

    // 신규 전용 0 규칙이 정정으로 새지 않는다 (D-23).
    const modifyConn = await authed("token-a");
    modifyConn.ws.sendRaw(orderModify({ rid: "rid-m0", price: 0 }));
    await waitFor(() => modifyConn.ws.closeInfo !== null, "정정 0 스키마 위반 close");
    expect(modifyConn.ws.closeInfo?.code).toBe(4400);

    expect(orderReqsOf(gatewayPayloads)).toHaveLength(0);
  });

  it("㊷ 같은 원주문의 취소와 값이 다른 정정이 겹쳐도 취소확인은 **취소 대기만** 정산한다 (WR-03 f)", async () => {
    const { ws, inbox } = await authed("token-a");

    // 정정을 내놓고 곧바로 마음을 바꿔 같은 원주문을 취소한다 — 두 대기의 원주문번호가 같다.
    // 정정 가격(71,000)이 취소확인이 실어 올 값과 **우연히 맞게** 둔다: 수량·가격 축만으로
    // 가르면 취소확인이 정정 대기를 「취소됨」으로 정산하는 교차 오정산이 정확히 이 조건이다.
    ws.sendRaw(orderCancel({ rid: "rid-c", qty: 10, price: 70_000 }));
    ws.sendRaw(orderModify({ rid: "rid-m", qty: 10, price: 71_000 }));
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 2, "취소·정정 2건 송신");

    gateway.pushOrderResp(gatewaySocket(), {
      noticeType: "C",
      orderNo: "0000012399",
      orgOrderNo: "0000012345",
      side: "B",
      quantity: 10,
      price: 71_000,
    });
    await waitFor(() => framesOf(inbox, "order.result").length >= 1, "취소확인 order.result");
    await flushIo(8);

    const results = framesOf(inbox, "order.result");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ rid: "rid-c", status: "cancelled", orderNo: "0000012399" });
    // 정정 대기는 취소확인으로 정산되지 않는다 — 그 정정은 자기 통보(정정확인)를 기다린다.
    expect(results.map((f) => f.rid)).not.toContain("rid-m");
  });

  it("㊸ 정정 대기 + 체결 E(org X, requestKind Modify) 가 첫 통보여도 정정이 정산된다 — timeout 이 아니다 (GC-WR-01)", async () => {
    const { ws, inbox } = await authed("token-a");

    ws.sendRaw(orderModify({ rid: "rid-m", qty: 10, price: 71_000 }));
    await waitFor(() => orderReqsOf(gatewayPayloads).length === 1, "정정 DirectOrderReq(2)");

    // 정정확인(M)이 유실·지연되고, 정정된 주문의 체결이 **첫 통보**로 온다. 통보는 원주문번호와
    // `requestKind:"Modify"` 를 둘 다 명시한다 — 가장 모호하지 않은 통보다. wire 값이 요청 종류의
    // 정본이므로(D-21 · D-27) 통보 종류 휴리스틱(E→신규)이 이것을 버리면 안 된다.
    gateway.pushOrderResp(gatewaySocket(), {
      noticeType: "E",
      orderNo: "0000012400",
      orgOrderNo: "0000012345",
      requestKind: "Modify",
      side: "B",
      quantity: 4,
      price: 71_000,
    });
    await waitFor(() => framesOf(inbox, "order.result").length >= 1, "정정 체결 order.result");
    await flushIo(8);

    const results = framesOf(inbox, "order.result");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ rid: "rid-m", status: "partially_filled", orderNo: "0000012400" });
    expect(results[0]?.status).not.toBe("timeout");
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
    isin: SAMPLE_ISIN,
    qty: 10,
    price: 70_000,
    // 신규 대기의 기본은 매수다. 취소 대기(`refersOrg: true`)를 만들 때는 `side: ""` 를
    // 함께 넘긴다 — 취소 요청에는 매매구분이 없다 (GC-WR-03).
    side: "B",
    refersOrg: false,
    // 요청 종류 (WR-03). 취소 대기는 `kind: "C"`, 정정 대기는 `kind: "M"` 을 함께 넘긴다.
    kind: "N",
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
    // 17-02 신규 3필드의 기본은 **구 서버**(전부 빈 값)다 — 이 픽스처를 쓰는 매칭 축
    // 테스트가 「오늘 서버」로 갈아타면 구 서버 회귀를 더 이상 잡지 못한다 (D-08).
    board: "",
    requestKind: "",
    requester: "",
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
    const cancel = mkPending({
      rid: "cancel",
      side: "",
      refersOrg: true,
      orgOrderNo: "0000012345",
      kind: "C",
    });
    expect(
      narrowPending([cancel], mkNotice({ noticeType: "C", orgOrderNo: "0000099999" })),
    ).toBeNull();
  });

  it("① 취소 축 — 원주문번호가 있으면 그 취소 대기로 좁힌다", () => {
    const fresh = mkPending({ rid: "new" });
    const cancel = mkPending({
      rid: "cancel",
      side: "",
      refersOrg: true,
      orgOrderNo: "0000012345",
      kind: "C",
    });

    const picked = narrowPending(
      [fresh, cancel],
      mkNotice({ noticeType: "C", orgOrderNo: "0000012345" }),
    );
    expect(picked).toBe(cancel);
  });

  it("② 통보 종류 축 — 구 서버가 원주문번호를 비워도 취소확인은 취소 대기로 간다", () => {
    const fresh = mkPending({ rid: "new" });
    const cancel = mkPending({
      rid: "cancel",
      side: "",
      refersOrg: true,
      orgOrderNo: "0000012345",
      kind: "C",
    });

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
    const cancel = mkPending({
      rid: "cancel",
      side: "",
      refersOrg: true,
      orgOrderNo: "0000012345",
      kind: "C",
    });
    const buy = mkPending({ rid: "buy", side: "B" });

    // 취소확인의 매매구분은 브로커가 채울 값이 없다(MockBroker 는 "B" 를 남긴다). 축을
    // 걸면 `!p.refersOrg` 이 취소 대기를 지워 정상 매칭이 깨진다 — `sideTrusted` 가 그 경계다.
    expect(
      narrowPending([buy, cancel], mkNotice({ noticeType: "C", side: "B", sideTrusted: false })),
    ).toBe(cancel);
    // 정정확인도 같다. 정정확인의 짝은 **정정 대기**다 — 취소 대기(`kind: "C"`)를 정정확인으로
    // 정산하는 것은 WR-03 이 막는 교차 정산이라, 이 단언은 정정 대기 픽스처로 선다.
    const modify = mkPending({
      rid: "modify",
      side: "B",
      refersOrg: true,
      orgOrderNo: "0000012345",
      kind: "M",
    });
    expect(
      narrowPending([buy, modify], mkNotice({ noticeType: "M", side: "B", sideTrusted: false })),
    ).toBe(modify);
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

  it("원주문번호는 표기가 달라도 같은 값으로 읽는다 — 선행 0·공백 (R2-WR-03①)", () => {
    const fresh = mkPending({ rid: "new" });
    const padded = mkPending({
      rid: "padded",
      side: "",
      refersOrg: true,
      orgOrderNo: "0000012345",
      kind: "C",
    });

    // 통보 쪽만 패딩이 없다. 완전일치였다면 하드 필터가 후보를 0건으로 만들고 `null` 이다.
    expect(narrowPending([fresh, padded], mkNotice({ noticeType: "C", orgOrderNo: "12345" }))).toBe(
      padded,
    );

    // 반대 방향(요청 쪽에 패딩이 없다)과 공백 패딩도 같은 값으로 읽는다.
    const bare = mkPending({
      rid: "bare",
      side: "",
      refersOrg: true,
      orgOrderNo: "12345",
      kind: "C",
    });
    expect(
      narrowPending([fresh, bare], mkNotice({ noticeType: "C", orgOrderNo: " 0000012345 " })),
    ).toBe(bare);

    // 관대해진 것은 **표기**뿐이다 — 값이 실제로 다르면 여전히 정산하지 않는다.
    expect(
      narrowPending([fresh, padded], mkNotice({ noticeType: "C", orgOrderNo: "0000099999" })),
    ).toBeNull();

    // 0 으로만 채워진 고정폭 필드는 「값 없음」이다. 이것을 축으로 쓰면 신규 통보가 취소
    // 대기만 남기고 0건이 되어 **통째로 미정산**된다.
    expect(narrowPending([fresh], mkNotice({ noticeType: "A", orgOrderNo: "0000000000" }))).toBe(
      fresh,
    );
  });

  it("모르는 통보 종류는 축으로 쓰이지 않는다 — 신규 쪽으로 단정하지 않는다 (R2-IN-03)", () => {
    const fresh = mkPending({ rid: "new" });
    const cancel = mkPending({
      rid: "cancel",
      side: "",
      refersOrg: true,
      orgOrderNo: "0000012345",
      kind: "C",
    });

    // 블랙리스트(`noticeType !== "" && !== "R"`)였을 때 이 통보들은 `p.refersOrg === false`
    // 로 좁혀져 **신규 대기를 정산**했다. 장래에 추가될 종류(부분취소·예약확인 등)가 전부
    // 그 경로로 떨어진다 — 확장될 때마다 조용히 오분류하는 형태다.
    expect(narrowPending([fresh, cancel], mkNotice({ noticeType: "P" }))).toBeNull();
    expect(narrowPending([fresh, cancel], mkNotice({ noticeType: "X", side: "B" }))).toBeNull();

    // 아는 값은 그대로 축이다 — 화이트리스트가 기존 정산을 좁히지 않았다.
    expect(narrowPending([fresh, cancel], mkNotice({ noticeType: "A" }))).toBe(fresh);
    expect(narrowPending([fresh, cancel], mkNotice({ noticeType: "E", quantity: 3 }))).toBe(fresh);
  });
  // WR-03 — 취소·정정 대기의 요청 종류 (18-19). 같은 원주문번호로 취소 대기와 정정 대기가
  // 동시에 있을 때, 원주문번호·수량·가격만으로는 둘을 가르지 못하거나 **교차해서** 가른다.
  // 대기 픽스처는 요청 종류(`kind`)를 싣는다 — 통보 종류 C/M/E · `requestKind` 와 맞출 축이다.
  describe("WR-03 — 취소·정정 대기의 요청 종류", () => {
    const X = "0000012345";
    const cancelAt = (price: number): PendingOrder =>
      mkPending({ rid: "cancel", side: "", refersOrg: true, orgOrderNo: X, kind: "C", qty: 10, price });
    const modifyAt = (price: number): PendingOrder =>
      mkPending({ rid: "modify", side: "B", refersOrg: true, orgOrderNo: X, kind: "M", qty: 10, price });

    it("(a) 같은 값의 취소·정정 대기 — 취소확인(C)은 취소 대기를 정산한다", () => {
      const cancel = cancelAt(70_000);
      const modify = modifyAt(70_000);
      expect(
        narrowPending(
          [cancel, modify],
          mkNotice({ noticeType: "C", orgOrderNo: X, quantity: 10, price: 70_000, sideTrusted: false }),
        ),
      ).toBe(cancel);
    });

    it("(b) 같은 값의 취소·정정 대기 — 정정확인(M)은 정정 대기를 정산한다", () => {
      const cancel = cancelAt(70_000);
      const modify = modifyAt(70_000);
      expect(
        narrowPending(
          [cancel, modify],
          mkNotice({ noticeType: "M", orgOrderNo: X, quantity: 10, price: 70_000, sideTrusted: false }),
        ),
      ).toBe(modify);
    });

    it("(c) 값이 교차해도 종류가 이긴다 — 정정 가격을 실어 온 취소확인도 취소 대기의 것이다", () => {
      const cancel = cancelAt(70_000);
      const modify = modifyAt(71_000);
      expect(
        narrowPending(
          [cancel, modify],
          mkNotice({ noticeType: "C", orgOrderNo: X, quantity: 10, price: 71_000, sideTrusted: false }),
        ),
      ).toBe(cancel);
    });

    it("(d) 원주문의 체결(E)은 정정 대기를 정산하지 않는다 — 후보가 1건이어도", () => {
      const modify = modifyAt(71_000);
      expect(
        narrowPending(
          [modify],
          mkNotice({ noticeType: "E", orderNo: X, orgOrderNo: "", requestKind: "", quantity: 3 }),
        ),
      ).toBeNull();
    });

    it("(e) 통보가 실어 온 requestKind 는 하드 필터다 — Cancel → 취소 대기 · Modify → 정정 대기", () => {
      const cancel = cancelAt(70_000);
      const modify = modifyAt(70_000);
      expect(
        narrowPending(
          [cancel, modify],
          mkNotice({ noticeType: "A", orgOrderNo: X, requestKind: "Cancel" }),
        ),
      ).toBe(cancel);
      expect(
        narrowPending(
          [cancel, modify],
          mkNotice({ noticeType: "A", orgOrderNo: X, requestKind: "Modify" }),
        ),
      ).toBe(modify);
    });

    // GC-WR-01 — wire `requestKind` 가 화이트리스트 값이면 그것이 요청 종류의 **정본**이다.
    // 통보 종류 → 요청 종류 휴리스틱(E→신규)은 wire 가 비었을 때(구 서버)만 쓴다. 통보 종류는
    // 「답일 수 있는 요청 종류 집합」으로만 읽고, 그 밖의 wire 값은 모순이라 0건이다.
    it("(f) 정정된 주문의 체결 — E(org X, Modify) 는 정정 대기를 정산한다", () => {
      const modify = modifyAt(71_000);
      expect(
        narrowPending(
          [modify],
          mkNotice({ noticeType: "E", orderNo: "0000012400", orgOrderNo: X, requestKind: "Modify", quantity: 4 }),
        ),
      ).toBe(modify);
    });

    it("(g) 모순 — 취소확인 C 가 requestKind Modify 를 실어 오면 아무것도 정산하지 않는다", () => {
      const cancel = cancelAt(70_000);
      const modify = modifyAt(70_000);
      expect(
        narrowPending(
          [cancel, modify],
          mkNotice({ noticeType: "C", orgOrderNo: X, requestKind: "Modify", sideTrusted: false }),
        ),
      ).toBeNull();
    });

    it("(h) 모순 — 체결 E 는 취소 요청의 답이 될 수 없다 (E + Cancel → 0건)", () => {
      const cancel = cancelAt(70_000);
      expect(
        narrowPending(
          [cancel],
          mkNotice({ noticeType: "E", orgOrderNo: X, requestKind: "Cancel", quantity: 3 }),
        ),
      ).toBeNull();
    });

    it("(i) wire 가 정본 — 접수 A(org 없음, New) 는 신규 대기를 정산한다", () => {
      const fresh = mkPending({ rid: "new" });
      const modify = modifyAt(71_000);
      expect(
        narrowPending(
          [fresh, modify],
          mkNotice({ noticeType: "A", orgOrderNo: "", requestKind: "New" }),
        ),
      ).toBe(fresh);
    });
  });
});
