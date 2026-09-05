/**
 * Phase 15 Plan 05 — RELAY-01/RELAY-03. 내부 HTTP 표면 통합 테스트.
 *
 * 검증 대상은 **관문 그 자체**다 — 비밀이 없거나 틀리면 아무 라우트에도 닿지 않고,
 * `/healthz` 만 예외로 통과하며, 실패 응답이 기대값을 흘리지 않는다는 것.
 *
 * 실제 `http.Server` 에 붙여 `fetch` 로 두드린다(supertest 대신). 15-04 가 세운 규율
 * — "이 계층의 리스크는 배선이므로 스텁을 최소화하고 진짜를 쓴다" — 을 따른 것이고,
 * 헤더 부재/오타/길이 불일치는 실제 HTTP 왕복으로 봐야 의미가 있다. relay 의
 * devDependency 도 늘지 않는다.
 *
 * 가짜 타이머를 쓰지 않는다 — 이 파일은 실제 소켓 왕복만 한다.
 */
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import * as flatbuffers from "flatbuffers";

import type { RelayAccount, RelayOrderMsg } from "@gh-radar/shared";

import {
  createOrderApi,
  type OrderApiSession,
  type OrderApiSessions,
} from "../src/order/order-api.js";
import type { SessionStats } from "../src/dma/session-manager.js";
import {
  SubscriptionHub,
  type HubFanoutEvent,
  type HubSession,
} from "../src/hub/subscription-hub.js";
import type { OrderUpdate } from "../src/store/orders.js";
import type { TransportFrameEvent } from "../src/dma/dma-client.js";
import { MSG } from "../src/dma/msg-type.js";
import { tryParseEnvelope } from "../src/dma/envelope.js";
import { Envelope } from "../src/generated/stock-dma/envelope.js";
import { SAMPLE_ACCOUNT_NO, SAMPLE_ISIN, buildOrderRespFrame } from "./helpers/frames.js";

const SECRET = "test-relay-order-secret-0123456789";
const USER_ID = "11111111-2222-4333-8444-555555555555";
const OTHER_USER_ID = "99999999-8888-4777-8666-555555555555";
const ROW_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_ISIN = "KR7000660001";

/** 정상 주문 바디. 각 테스트가 필요한 필드만 덮어쓴다. */
const VALID_ORDER = {
  userId: USER_ID,
  orderRowId: ROW_ID,
  isin: SAMPLE_ISIN,
  exchange: "KRX",
  market: "K",
  side: "B",
  orderType: "N",
  qty: 10,
  price: 70_000,
  accountNo: SAMPLE_ACCOUNT_NO,
} as const;

/**
 * `HubSession` 과 `OrderApiSession` 을 동시에 만족하는 가짜 세션.
 *
 * 하나로 합친 이유: 주문 라우트가 보는 세션과 Hub 가 프레임을 받는 세션이 **같은 객체**
 * 여야 "주문을 보낸 그 세션의 통보"라는 상관이 실제 배선과 같아진다.
 */
class FakeSession extends EventEmitter implements HubSession, OrderApiSession {
  readonly sent: Uint8Array[] = [];
  isReady = true;
  sendResult = true;

  constructor(
    readonly userId: string,
    public allowedAccounts: RelayAccount[] = [{ accountNo: SAMPLE_ACCOUNT_NO, name: "위탁종합" }],
  ) {
    super();
  }

  send(payload: Uint8Array): boolean {
    if (!this.sendResult) return false;
    this.sent.push(payload);
    return true;
  }

  /** 게이트웨이가 통보를 밀어 넣는 상황. */
  pushFrame(payload: Uint8Array): void {
    const parsed = tryParseEnvelope(Buffer.from(payload));
    if (parsed === null) throw new Error("테스트 프레임이 수신 화이트리스트를 통과하지 못했습니다");
    const event: TransportFrameEvent = { ...parsed, generation: 1 };
    this.emit("frame", event);
  }

  /** 나간 `DirectOrderReq(2)` 를 되읽는다. 요청 대역이라 화이트리스트를 우회한다. */
  orderReqs(): Envelope[] {
    return this.sent
      .map((p) => Envelope.getRootAsEnvelope(new flatbuffers.ByteBuffer(p)))
      .filter((env) => env.msgType() === MSG.DirectOrderReq);
  }
}

type Harness = {
  url: (path: string) => string;
  close: () => Promise<void>;
  hub: SubscriptionHub;
  updates: OrderUpdate[];
  fanout: HubFanoutEvent[];
  sessions: Map<string, FakeSession>;
};

type StartOptions = {
  stats?: SessionStats;
  nodeEnv?: string;
  /** 주문 라우트를 쓰는 테스트가 등록할 세션들. */
  sessions?: FakeSession[];
  orderTimeoutMs?: number;
};

async function start(opts: StartOptions = {}): Promise<Harness> {
  const stats = opts.stats ?? { sessionCount: 0, readyCount: 0 };
  const sessions = new Map<string, FakeSession>();
  for (const s of opts.sessions ?? []) sessions.set(s.userId, s);

  const hub = new SubscriptionHub();
  const fanout: HubFanoutEvent[] = [];
  hub.on("fanout", (e) => fanout.push(e));
  for (const s of sessions.values()) hub.attach(s);

  const updates: OrderUpdate[] = [];

  const apiSessions: OrderApiSessions = {
    stats: () => stats,
    get: (userId) => sessions.get(userId),
  };

  const app = createOrderApi({
    relayOrderSecret: SECRET,
    appVersion: "test-sha",
    nodeEnv: opts.nodeEnv ?? "test",
    sessions: apiSessions,
    orders: hub,
    orderStore: { enqueueUpdate: (u) => updates.push(u) },
    orderTimeoutMs: opts.orderTimeoutMs,
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const { port } = server.address() as AddressInfo;

  return {
    url: (path) => `http://127.0.0.1:${port}${path}`,
    close: async () => {
      hub.closeAll();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
    hub,
    updates,
    fanout,
    sessions,
  };
}

/** 공유 비밀을 실은 주문 POST. */
function postOrder(h: Harness, body: unknown): Promise<Response> {
  return fetch(h.url("/internal/orders"), {
    method: "POST",
    headers: { "x-relay-secret": SECRET, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("createOrderApi — /healthz + 공유 비밀 관문", () => {
  let h: Harness;

  beforeEach(async () => {
    h = await start();
  });

  afterEach(async () => {
    await h.close();
  });

  it("① /healthz 는 비밀 헤더 없이 200 이다 (uptime check 대상)", async () => {
    const res = await fetch(h.url("/healthz"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(body.version).toBe("test-sha");
  });

  it("② /healthz 응답에 식별자 계열 키가 없다 (T-15-22)", async () => {
    const res = await fetch(h.url("/healthz"));
    const body = (await res.json()) as Record<string, unknown>;

    // 필드 화이트리스트 — 늘어나면 이 테스트가 먼저 깨져야 한다.
    expect(Object.keys(body).sort()).toEqual([
      "dma",
      "sessionCount",
      "status",
      "version",
      "vpn",
    ]);

    const dumped = JSON.stringify(body).toLowerCase();
    for (const forbidden of ["accountno", "account_no", "userid", "user_id", "dmauserid"]) {
      expect(dumped).not.toContain(forbidden);
    }
  });

  it("③ 비밀 헤더가 없으면 401 이고 본문이 기대값을 흘리지 않는다 (T-15-06)", async () => {
    const res = await fetch(h.url("/internal/anything"), { method: "POST" });

    expect(res.status).toBe(401);
    const raw = await res.text();
    expect(JSON.parse(raw)).toEqual({
      error: { code: "UNAUTHORIZED_RELAY", message: "Unauthorized" },
    });
    // 기대 비밀도, 그 조각도 응답에 없다.
    expect(raw).not.toContain(SECRET);
    expect(raw).not.toContain(SECRET.slice(0, 8));
  });

  it("④ 비밀이 틀리면 401 이다 (길이는 같고 내용만 다른 경우)", async () => {
    const wrong = `${SECRET.slice(0, -1)}X`;
    expect(wrong).toHaveLength(SECRET.length);

    const res = await fetch(h.url("/internal/anything"), {
      method: "POST",
      headers: { "x-relay-secret": wrong },
    });

    expect(res.status).toBe(401);
    expect((await res.json()) as unknown).toMatchObject({
      error: { code: "UNAUTHORIZED_RELAY" },
    });
  });

  it("⑤ 올바른 비밀은 관문을 통과해 라우트까지 도달한다 (401 이 아니다)", async () => {
    const res = await postOrder(h, { hello: "world" });

    // 관문을 통과했으므로 401 이 아니라 **바디 검증**에서 걸린다.
    expect(res.status).toBe(400);
    expect((await res.json()) as unknown).toMatchObject({
      error: { code: "VALIDATION_FAILED" },
    });
  });

  it("⑤-b 없는 경로는 여전히 404 다", async () => {
    const res = await fetch(h.url("/internal/nope"), {
      method: "POST",
      headers: { "x-relay-secret": SECRET },
    });

    expect(res.status).toBe(404);
    expect((await res.json()) as unknown).toEqual({
      error: { code: "NOT_FOUND", message: "Route not found" },
    });
  });

  it("⑥ 길이가 다른 비밀도 throw 없이 401 이다 (timingSafeEqual 길이 함정)", async () => {
    for (const wrong of ["", "x", `${SECRET}-extra-suffix`]) {
      const res = await fetch(h.url("/internal/anything"), {
        method: "POST",
        headers: { "x-relay-secret": wrong },
      });
      // 길이 불일치로 `timingSafeEqual` 이 터졌다면 500 이 온다.
      expect(res.status).toBe(401);
    }
  });

  it("⑦ 세션이 0개면 degraded 가 아니다 (장 시작 전이 정상 상태)", async () => {
    const res = await fetch(h.url("/healthz"));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ status: "ok", vpn: true, dma: true, sessionCount: 0 });
  });

  it("⑧ 세션이 있는데 Ready 가 0개면 degraded + HTTP 503 (Assumption A7)", async () => {
    const degraded = await start({ stats: { sessionCount: 2, readyCount: 0 } });
    try {
      const res = await fetch(degraded.url("/healthz"));
      const body = (await res.json()) as Record<string, unknown>;

      // 본문만 degraded 로 두면 uptime check 가 못 잡는다 — 상태 코드로도 내려야 한다.
      expect(res.status).toBe(503);
      expect(body).toMatchObject({ status: "degraded", vpn: false, dma: false, sessionCount: 2 });
    } finally {
      await degraded.close();
    }
  });

  it("⑨ Ready 세션이 하나라도 있으면 ok 다", async () => {
    const ready = await start({ stats: { sessionCount: 3, readyCount: 1 } });
    try {
      const res = await fetch(ready.url("/healthz"));
      expect(res.status).toBe(200);
      expect((await res.json()) as unknown).toMatchObject({ status: "ok", sessionCount: 3 });
    } finally {
      await ready.close();
    }
  });

  it("⑩ 관문은 GET·DELETE 등 모든 메서드에 걸린다 (POST 전용이 아니다)", async () => {
    for (const method of ["GET", "PUT", "DELETE", "PATCH"]) {
      const res = await fetch(h.url("/internal/anything"), { method });
      expect(res.status).toBe(401);
    }
  });
});

describe("POST /internal/orders — 세션·계좌·형식 3단 검증 (D-15/D-20/D-21/D-22)", () => {
  let h: Harness;
  let session: FakeSession;

  beforeEach(async () => {
    session = new FakeSession(USER_ID);
    h = await start({ sessions: [session] });
  });

  afterEach(async () => {
    await h.close();
  });

  it("① 비밀 헤더가 없으면 주문 라우트에도 닿지 않는다 (401)", async () => {
    const res = await fetch(h.url("/internal/orders"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(VALID_ORDER),
    });

    expect(res.status).toBe(401);
    expect(session.orderReqs()).toHaveLength(0);
  });

  it("② 형식 위반은 400 VALIDATION_FAILED 이고 응답이 바디를 되비추지 않는다", async () => {
    const bad = [
      { ...VALID_ORDER, isin: "005930" }, // 단축코드 (D-28 — 산술 유도 금지)
      { ...VALID_ORDER, exchange: "NASDAQ" },
      { ...VALID_ORDER, market: "X" },
      { ...VALID_ORDER, side: "BUY" },
      { ...VALID_ORDER, orderType: "M" }, // 정정은 v1 범위 밖 (D-21)
      { ...VALID_ORDER, price: 0 },
      { ...VALID_ORDER, userId: "not-a-uuid" },
      { ...VALID_ORDER, orderRowId: "not-a-uuid" },
    ];

    for (const body of bad) {
      const res = await postOrder(h, body);
      expect(res.status).toBe(400);
      const raw = await res.text();
      expect(JSON.parse(raw)).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
      // 계좌번호가 응답에 되비치지 않는다 (T-15-15).
      expect(raw).not.toContain(SAMPLE_ACCOUNT_NO);
    }
    expect(session.orderReqs()).toHaveLength(0);
  });

  it("③ 세션이 없으면 409 SESSION_NOT_READY 다 — 대신 로그인하지 않는다 (D-15)", async () => {
    const res = await postOrder(h, { ...VALID_ORDER, userId: OTHER_USER_ID });

    expect(res.status).toBe(409);
    expect((await res.json()) as unknown).toMatchObject({
      error: { code: "SESSION_NOT_READY" },
    });
  });

  it("④ 세션은 있으나 Ready 가 아니면 409 다", async () => {
    session.isReady = false;

    const res = await postOrder(h, VALID_ORDER);

    expect(res.status).toBe(409);
    expect((await res.json()) as unknown).toMatchObject({
      error: { code: "SESSION_NOT_READY" },
    });
    expect(session.orderReqs()).toHaveLength(0);
  });

  it("⑤ 세션 계좌 목록 밖의 계좌는 403 ACCOUNT_NOT_ALLOWED — 게이트웨이로 나가지 않는다 (T-15-01)", async () => {
    // 세션이 확정한 목록은 SAMPLE_ACCOUNT_NO 하나뿐이다.
    const res = await postOrder(h, { ...VALID_ORDER, accountNo: "9999999999" });

    expect(res.status).toBe(403);
    expect((await res.json()) as unknown).toMatchObject({
      error: { code: "ACCOUNT_NOT_ALLOWED" },
    });
    expect(session.orderReqs()).toHaveLength(0);

    // 허용 목록이 바뀌면 판정도 바뀐다 — 판정의 원천이 `allowedAccounts` 임을 고정한다.
    // (403 을 "계좌번호 문자열이 특정 값이라서"가 아니라 "목록에 없어서"로 증명한다.)
    session.allowedAccounts = [{ accountNo: "9999999999", name: "추가계좌" }];
    const pending = postOrder(h, { ...VALID_ORDER, accountNo: "9999999999" });
    await vi.waitFor(() => expect(session.orderReqs()).toHaveLength(1));
    session.pushFrame(buildOrderRespFrame({ noticeType: "A" }));

    const allowed = await pending;
    expect(allowed.status).toBe(200);
  });

  it("⑥ 취소인데 원주문번호가 없으면 400 이다", async () => {
    const res = await postOrder(h, { ...VALID_ORDER, orderType: "C" });

    expect(res.status).toBe(400);
    expect((await res.json()) as unknown).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
    expect(session.orderReqs()).toHaveLength(0);
  });

  it("⑦ 취소 수량 0 은 400 이다 — 전량취소가 아니라 즉시 거부다 (Pitfall 7)", async () => {
    const res = await postOrder(h, {
      ...VALID_ORDER,
      orderType: "C",
      orgOrderNo: "0000012345",
      qty: 0,
    });

    expect(res.status).toBe(400);
    expect(session.orderReqs()).toHaveLength(0);
  });

  it("⑧ 정상 신규 → DirectOrderReq 송신 + OrderResp(\"A\") → 200 accepted", async () => {
    const pending = postOrder(h, VALID_ORDER);

    // 송신 바이트를 되읽어 무엇을 보냈는지 본다.
    await vi.waitFor(() => expect(session.orderReqs()).toHaveLength(1));
    const req = session.orderReqs()[0]?.directOrderReq();
    expect(req?.stockCode()).toBe(SAMPLE_ISIN);
    expect(req?.accountNo()).toBe(SAMPLE_ACCOUNT_NO);
    expect(req?.orderType()).toBe("N");
    expect(req?.orderCondition()).toBe("0");
    expect(req?.quantity()).toBe(10);

    session.pushFrame(buildOrderRespFrame({ noticeType: "A", orderNo: "0000012345" }));

    const res = await pending;
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({
      orderNo: "0000012345",
      resultCode: 0,
      message: "정상처리",
      status: "accepted",
    });

    // `dma_orders` 갱신은 큐로 나간다 — 상관 1순위 키는 행 id 다 (A10).
    expect(h.updates).toContainEqual(
      expect.objectContaining({
        orderRowId: ROW_ID,
        orderNo: "0000012345",
        status: "accepted",
        noticeType: "A",
      }),
    );
  });

  it("⑨ OrderResp(\"R\") → 200 rejected + resultCode·message 전달", async () => {
    const pending = postOrder(h, VALID_ORDER);
    await vi.waitFor(() => expect(session.orderReqs()).toHaveLength(1));

    session.pushFrame(
      buildOrderRespFrame({ noticeType: "R", orderNo: "", resultCode: -7, message: "증거금 부족" }),
    );

    const res = await pending;
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({
      orderNo: "",
      resultCode: -7,
      message: "증거금 부족",
      status: "rejected",
    });
    expect(h.updates).toContainEqual(
      expect.objectContaining({ orderRowId: ROW_ID, status: "rejected", resultCode: -7 }),
    );
  });

  it("⑩ 5초 무응답 → ORDER_TIMEOUT + dma_orders 큐에 status:'timeout' (실패로 단정하지 않는다)", async () => {
    const fast = await start({ sessions: [new FakeSession(USER_ID)], orderTimeoutMs: 30 });
    try {
      const res = await postOrder(fast, VALID_ORDER);

      // 504 를 쓰지 않는다 — 인프라·호출자가 재시도 대상으로 읽으면 중복 주문이 난다.
      expect(res.status).toBe(202);
      expect(res.status).not.toBe(504);
      expect((await res.json()) as unknown).toMatchObject({
        error: { code: "ORDER_TIMEOUT" },
      });
      expect(fast.updates).toContainEqual(
        expect.objectContaining({ orderRowId: ROW_ID, status: "timeout" }),
      );
    } finally {
      await fast.close();
    }
  });

  it("⑪ 체결 통보는 주문자 소켓에만 간다 — 다른 사용자에게는 오지 않는다 (T-15-02)", async () => {
    const other = new FakeSession(OTHER_USER_ID);
    const two = await start({ sessions: [new FakeSession(USER_ID), other] });
    try {
      const mine = two.sessions.get(USER_ID);
      if (mine === undefined) throw new Error("세션 등록 실패");

      const pending = postOrder(two, VALID_ORDER);
      await vi.waitFor(() => expect(mine.orderReqs()).toHaveLength(1));
      mine.pushFrame(buildOrderRespFrame({ noticeType: "A", orderNo: "0000012345" }));
      await pending;

      // 접수 후 체결 통보 — HTTP 는 이미 끝났고 이제 wss 푸시만 남는다.
      mine.pushFrame(
        buildOrderRespFrame({ noticeType: "E", orderNo: "0000012345", quantity: 10 }),
      );

      const orderFrames = two.fanout.filter((e) => e.msg.t === "order");
      expect(orderFrames.length).toBeGreaterThanOrEqual(2);
      // 대상은 전부 주문자 하나다. 전역 브로드캐스트 경로가 없다.
      expect(new Set(orderFrames.map((e) => e.userId))).toEqual(new Set([USER_ID]));
      expect(two.fanout.some((e) => e.userId === OTHER_USER_ID)).toBe(false);

      const last = orderFrames.at(-1)?.msg as RelayOrderMsg;
      expect(last).toMatchObject({ t: "order", nt: "E", no: "0000012345", q: 10 });
      // 접수 이후 통보는 order_no 로 좁혀 갱신한다 (셀렉터 2순위).
      expect(two.updates).toContainEqual(
        expect.objectContaining({ orderNo: "0000012345", noticeType: "E", filledQty: 10 }),
      );
    } finally {
      await two.close();
      await other.removeAllListeners();
    }
  });

  it("⑫ 금액·수량에 정책 상한이 없다 — 100만주도 형식 검사만 통과한다 (D-20)", async () => {
    const pending = postOrder(h, { ...VALID_ORDER, qty: 1_000_000, price: 1_000_000 });

    await vi.waitFor(() => expect(session.orderReqs()).toHaveLength(1));
    const req = session.orderReqs()[0]?.directOrderReq();
    expect(req?.quantity()).toBe(1_000_000);
    expect(req?.price()).toBe(1_000_000);

    session.pushFrame(buildOrderRespFrame({ noticeType: "A", quantity: 1_000_000 }));
    expect((await pending).status).toBe(200);
  });

  it("⑬ 상관은 ISIN 으로 좁힌다 — 다른 종목 통보는 대기 중인 주문을 깨우지 않는다", async () => {
    const fast = await start({ sessions: [new FakeSession(USER_ID)], orderTimeoutMs: 60 });
    try {
      const mine = fast.sessions.get(USER_ID);
      if (mine === undefined) throw new Error("세션 등록 실패");

      const pending = postOrder(fast, VALID_ORDER);
      await vi.waitFor(() => expect(mine.orderReqs()).toHaveLength(1));

      // 같은 사용자의 **다른 종목** 통보 — 이 주문의 결과가 아니다.
      mine.pushFrame(buildOrderRespFrame({ isin: OTHER_ISIN, noticeType: "A", orderNo: "OTHER" }));

      const res = await pending;
      expect(res.status).toBe(202); // 타임아웃 — 남의 통보로 응답하지 않았다
      expect(fast.updates).toContainEqual(
        expect.objectContaining({ orderNo: "OTHER", status: "accepted" }),
      );
    } finally {
      await fast.close();
    }
  });

  it("⑭ 게이트웨이 송신 실패는 5초를 기다리지 않고 즉시 409 다", async () => {
    session.sendResult = false;

    const res = await postOrder(h, VALID_ORDER);

    expect(res.status).toBe(409);
    expect((await res.json()) as unknown).toMatchObject({
      error: { code: "SESSION_NOT_READY" },
    });
  });
});
