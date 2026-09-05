import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { createApp } from "../../src/app";
import { createRelayClient } from "../../src/services/relay-client";

/**
 * Phase 15 Plan 17 — `/api/orders` 라우트 테스트 (RELAY-02).
 *
 * **relay 를 `vi.mock` 으로 스텁하지 않는다.** 이 플랜에서 가장 값비싼 실수는
 * relay 응답 3분류(200 / 202+`ORDER_TIMEOUT` / 4xx)를 잘못 매핑하는 것이고, 그 매핑은
 * `relay-client.ts` 안에 있다. 클라이언트를 통째로 스텁하면 정작 검증해야 할 코드가
 * 테스트에서 빠진다 — 특히 **axios 는 202 를 성공으로 처리**하므로 "202 를 실패로 읽지
 * 않는가"는 실제 HTTP 왕복 위에서만 증명된다.
 *
 * 그래서 `node:http` 로 **루프백 가짜 relay** 를 띄우고 진짜 클라이언트를 붙인다.
 * 외부 네트워크는 없다(127.0.0.1). 이렇게 하면 공유 비밀 헤더·서버가 채운 종목 키까지
 * relay 가 실제로 받은 바디에서 단언할 수 있다.
 *
 * supabase 는 `auth.getUser` + `dma_credentials` + `stocks` + `dma_orders` 만 지원하는
 * 최소 mock 이며, insert/update/조회 필터를 기록해 감사·소유권을 단언한다.
 */

const ORDER_ROW_ID = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";

const KOSPI_STOCK = { code: "005930", isin: "KR7005930003", market: "KOSPI" };
const KOSDAQ_STOCK = { code: "035720", isin: "KR7035720002", market: "KOSDAQ" };

const SECRET = "test-relay-secret";

/** 정상 주문 바디. `isin` 은 **보내지 않는다** — 서버가 채운다 (T-15-50). */
const VALID_BODY = {
  code: "005930",
  accountNo: "12345678901",
  exchange: "KRX",
  side: "B",
  orderType: "N",
  qty: 10,
  price: 70000,
};

// 라우트 rate-limit(30/60s)은 모듈 단위로 공유된다. 테스트마다 사용자를 새로 만들어
// 한 사용자의 카운터에 전 케이스가 누적되지 않게 한다.
let userSeq = 0;
const nextUser = () => ({ id: `00000000-0000-4000-8000-${String(++userSeq).padStart(12, "0")}` });

// ============================================================
// supabase mock
// ============================================================

type SupabaseOpts = {
  user?: { id: string } | null;
  /** `dma_credentials` 매핑 행 존재 여부 (D-12 allowlist). */
  credential?: boolean;
  stock?: { code: string; isin: string | null; market: string } | null;
  orders?: Record<string, unknown>[];
};

type Recorder = {
  inserts: { table: string; row: any }[];
  updates: { table: string; patch: any; filters: Record<string, any> }[];
  listFilters: Record<string, any>[];
  /** allowlist 조회가 실제로 select 한 컬럼 목록 (암호문 미조회 단언용). */
  selectedCols: { table: string; cols: string }[];
};

function makeSupabase(opts: SupabaseOpts): { client: any; rec: Recorder } {
  const rec: Recorder = { inserts: [], updates: [], listFilters: [], selectedCols: [] };

  const rowFor = (table: string, filters: Record<string, any>) => {
    if (table === "dma_credentials") {
      return opts.credential ? { user_id: filters.user_id } : null;
    }
    if (table === "stocks") {
      return opts.stock && opts.stock.code === filters.code ? opts.stock : null;
    }
    return null;
  };

  const client = {
    auth: {
      getUser: async (_token: string) =>
        opts.user
          ? { data: { user: opts.user }, error: null }
          : { data: { user: null }, error: { message: "invalid token" } },
    },
    from(table: string) {
      let mode: "select" | "insert" | "update" = "select";
      let patch: any = null;
      const filters: Record<string, any> = {};

      const b: any = {
        select: (cols?: string) => {
          if (cols) rec.selectedCols.push({ table, cols });
          return b;
        },
        insert: (row: any) => {
          mode = "insert";
          patch = row;
          rec.inserts.push({ table, row });
          return b;
        },
        update: (row: any) => {
          mode = "update";
          patch = row;
          return b;
        },
        eq: (col: string, val: any) => {
          filters[col] = val;
          return b;
        },
        gte: (col: string, val: any) => {
          filters[`gte:${col}`] = val;
          return b;
        },
        lt: (col: string, val: any) => {
          filters[`lt:${col}`] = val;
          return b;
        },
        order: () => b,
        maybeSingle: async () => ({ data: rowFor(table, filters), error: null }),
        single: async () =>
          mode === "insert"
            ? { data: { id: ORDER_ROW_ID }, error: null }
            : { data: rowFor(table, filters), error: null },
        then: (resolve: any) => {
          if (mode === "update") {
            rec.updates.push({ table, patch, filters });
            return resolve({ data: null, error: null });
          }
          if (table === "dma_orders") {
            rec.listFilters.push({ ...filters });
            const rows = (opts.orders ?? []).filter((r) => r.user_id === filters.user_id);
            return resolve({ data: rows, error: null });
          }
          return resolve({ data: [], error: null });
        },
      };
      return b;
    },
  };

  return { client, rec };
}

// ============================================================
// 루프백 가짜 relay
// ============================================================

type RelayReply = { status: number; body: unknown };

type FakeRelay = {
  url: string;
  requests: { headers: http.IncomingHttpHeaders; body: any; url?: string }[];
  close: () => Promise<void>;
};

async function startFakeRelay(reply: RelayReply | (() => RelayReply)): Promise<FakeRelay> {
  const requests: FakeRelay["requests"] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      requests.push({ headers: req.headers, body: raw ? JSON.parse(raw) : null, url: req.url });
      const out = typeof reply === "function" ? reply() : reply;
      res.writeHead(out.status, { "content-type": "application/json" });
      res.end(JSON.stringify(out.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

/** 아무도 듣지 않는 주소 — 연결 실패(ECONNREFUSED) 재현용. */
async function closedPortUrl(): Promise<string> {
  const relay = await startFakeRelay({ status: 200, body: {} });
  await relay.close();
  return relay.url;
}

function clientFor(url: string) {
  return createRelayClient({
    baseUrl: url,
    secret: SECRET,
    timeoutMs: 1000,
    nodeEnv: "test",
  });
}

const ACCEPTED = {
  orderNo: "0000123",
  resultCode: 0,
  message: "정상처리",
  status: "accepted",
};

const relays: FakeRelay[] = [];
async function relayWith(reply: RelayReply | (() => RelayReply)): Promise<FakeRelay> {
  const r = await startFakeRelay(reply);
  relays.push(r);
  return r;
}

beforeEach(() => {
  process.env.NODE_ENV = "test";
});

afterEach(async () => {
  while (relays.length) await relays.pop()!.close();
});

// ============================================================
// POST /api/orders — 인증·설정 관문
// ============================================================

describe("POST /api/orders — 관문", () => {
  it("① 미인증(Authorization 없음) → 401 UNAUTHENTICATED", async () => {
    const { client } = makeSupabase({ user: nextUser(), credential: true });
    const relay = await relayWith({ status: 200, body: ACCEPTED });
    const app = createApp({ supabase: client, relayClient: clientFor(relay.url) });

    const r = await request(app).post("/api/orders").send(VALID_BODY);

    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("UNAUTHENTICATED");
    // 인증 전에 relay 로 아무것도 나가지 않는다.
    expect(relay.requests).toHaveLength(0);
  });

  it("② 잘못된 토큰 → 401", async () => {
    const { client } = makeSupabase({ user: null });
    const relay = await relayWith({ status: 200, body: ACCEPTED });
    const app = createApp({ supabase: client, relayClient: clientFor(relay.url) });

    const r = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer bad")
      .send(VALID_BODY);

    expect(r.status).toBe(401);
    expect(relay.requests).toHaveLength(0);
  });

  it("③ relayClient 미주입(env 없음) → 503 RELAY_UNAVAILABLE", async () => {
    const { client, rec } = makeSupabase({ user: nextUser(), credential: true });
    const app = createApp({ supabase: client });

    const r = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer tok")
      .send(VALID_BODY);

    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe("RELAY_UNAVAILABLE");
    // 주문 기능이 꺼져 있으면 감사 행도 만들지 않는다.
    expect(rec.inserts).toHaveLength(0);
  });
});

// ============================================================
// POST /api/orders — 형식 검사 (D-20 — 한도 없음, 형식만)
// ============================================================

describe("POST /api/orders — 형식", () => {
  async function postBody(body: unknown) {
    const { client, rec } = makeSupabase({
      user: nextUser(),
      credential: true,
      stock: KOSPI_STOCK,
    });
    const relay = await relayWith({ status: 200, body: ACCEPTED });
    const app = createApp({ supabase: client, relayClient: clientFor(relay.url) });
    const r = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer tok")
      .send(body as object);
    return { r, relay, rec };
  }

  it("④ 종목코드 5자리 → 400 VALIDATION_FAILED", async () => {
    const { r, relay } = await postBody({ ...VALID_BODY, code: "00593" });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("VALIDATION_FAILED");
    expect(relay.requests).toHaveLength(0);
  });

  it("⑤-a 수량 0 → 400", async () => {
    const { r } = await postBody({ ...VALID_BODY, qty: 0 });
    expect(r.status).toBe(400);
  });

  it("⑤-b 가격 -1 → 400", async () => {
    const { r } = await postBody({ ...VALID_BODY, price: -1 });
    expect(r.status).toBe(400);
  });

  it("⑤-c 수량 1.5(소수) → 400", async () => {
    const { r } = await postBody({ ...VALID_BODY, qty: 1.5 });
    expect(r.status).toBe(400);
  });

  it("⑥ 취소인데 원주문번호 없음 → 400", async () => {
    const { r, relay } = await postBody({ ...VALID_BODY, orderType: "C" });
    expect(r.status).toBe(400);
    expect(relay.requests).toHaveLength(0);
  });

  it("⑮ 금액·수량 한도 없음 — qty 1000000 / price 999999 가 relay 까지 간다 (D-20)", async () => {
    const { r, relay } = await postBody({ ...VALID_BODY, qty: 1_000_000, price: 999_999 });
    expect(r.status).toBe(200);
    expect(relay.requests).toHaveLength(1);
    expect(relay.requests[0].body).toMatchObject({ qty: 1_000_000, price: 999_999 });
  });
});

// ============================================================
// POST /api/orders — allowlist · 종목 키 (D-12 / D-28)
// ============================================================

describe("POST /api/orders — allowlist·종목 키", () => {
  it("⑦ dma_credentials 매핑 없음 → 403 DMA_NOT_ALLOWED", async () => {
    const { client, rec } = makeSupabase({
      user: nextUser(),
      credential: false,
      stock: KOSPI_STOCK,
    });
    const relay = await relayWith({ status: 200, body: ACCEPTED });
    const app = createApp({ supabase: client, relayClient: clientFor(relay.url) });

    const r = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer tok")
      .send(VALID_BODY);

    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("DMA_NOT_ALLOWED");
    expect(relay.requests).toHaveLength(0);
    expect(rec.inserts).toHaveLength(0);
  });

  it("⑦-b allowlist 조회는 암호문 컬럼을 select 하지 않는다 (T-15-05)", async () => {
    const { client, rec } = makeSupabase({
      user: nextUser(),
      credential: true,
      stock: KOSPI_STOCK,
    });
    const relay = await relayWith({ status: 200, body: ACCEPTED });
    const app = createApp({ supabase: client, relayClient: clientFor(relay.url) });

    await request(app).post("/api/orders").set("Authorization", "Bearer tok").send(VALID_BODY);

    const credSelects = rec.selectedCols.filter((s) => s.table === "dma_credentials");
    expect(credSelects.length).toBeGreaterThan(0);
    for (const s of credSelects) expect(s.cols).not.toContain("password");
  });

  it("⑧ stocks.isin 이 null → 422 ISIN_UNAVAILABLE (실제로 남아 있는 42건)", async () => {
    const { client, rec } = makeSupabase({
      user: nextUser(),
      credential: true,
      stock: { code: "005930", isin: null, market: "KOSPI" },
    });
    const relay = await relayWith({ status: 200, body: ACCEPTED });
    const app = createApp({ supabase: client, relayClient: clientFor(relay.url) });

    const r = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer tok")
      .send(VALID_BODY);

    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("ISIN_UNAVAILABLE");
    // 종목 키가 없으면 relay 로 내려가지 않는다 — null 을 흘려보내지 않는다.
    expect(relay.requests).toHaveLength(0);
    expect(rec.inserts).toHaveLength(0);
  });

  it("⑧-b 없는 종목 → 404 STOCK_NOT_FOUND", async () => {
    const { client } = makeSupabase({ user: nextUser(), credential: true, stock: null });
    const relay = await relayWith({ status: 200, body: ACCEPTED });
    const app = createApp({ supabase: client, relayClient: clientFor(relay.url) });

    const r = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer tok")
      .send({ ...VALID_BODY, code: "999999" });

    expect(r.status).toBe(404);
    expect(relay.requests).toHaveLength(0);
  });
});

// ============================================================
// POST /api/orders — 정상 경로
// ============================================================

describe("POST /api/orders — 정상", () => {
  it("⑨ 서버가 종목 키를 채워 relay 로 보내고 200 + 감사 insert/update 각 1회", async () => {
    const user = nextUser();
    const { client, rec } = makeSupabase({ user, credential: true, stock: KOSPI_STOCK });
    const relay = await relayWith({ status: 200, body: ACCEPTED });
    const app = createApp({ supabase: client, relayClient: clientFor(relay.url) });

    const r = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer tok")
      .send(VALID_BODY);

    expect(r.status).toBe(200);
    expect(r.body).toMatchObject(ACCEPTED);

    // 바디에 없던 종목 키를 **서버가** 채웠다 (T-15-50).
    expect(VALID_BODY).not.toHaveProperty("isin");
    expect(relay.requests).toHaveLength(1);
    expect(relay.requests[0].body).toMatchObject({
      userId: user.id,
      orderRowId: ORDER_ROW_ID,
      isin: KOSPI_STOCK.isin,
      market: "K",
      exchange: "KRX",
      side: "B",
      orderType: "N",
      accountNo: VALID_BODY.accountNo,
    });
    // 공유 비밀 관문 (T-15-06).
    expect(relay.requests[0].headers["x-relay-secret"]).toBe(SECRET);
    expect(relay.requests[0].url).toBe("/internal/orders");

    // 감사: 요청 insert 1회 + 결과 update 1회, 둘 다 소유권 필터.
    expect(rec.inserts.filter((i) => i.table === "dma_orders")).toHaveLength(1);
    expect(rec.inserts[0].row).toMatchObject({
      user_id: user.id,
      isin: KOSPI_STOCK.isin,
      stock_code: "005930",
      market: "K",
    });
    // status 를 넣지 않는다 — DB 기본값 'requested' 가 유일한 정본이다.
    expect(rec.inserts[0].row).not.toHaveProperty("status");
    const updates = rec.updates.filter((u) => u.table === "dma_orders");
    expect(updates).toHaveLength(1);
    expect(updates[0].patch).toMatchObject({ status: "accepted", order_no: "0000123" });
    expect(updates[0].filters).toMatchObject({ id: ORDER_ROW_ID, user_id: user.id });
  });

  it("⑨-b KOSDAQ 종목은 market \"Q\" 로 변환된다 (D-21)", async () => {
    const { client } = makeSupabase({ user: nextUser(), credential: true, stock: KOSDAQ_STOCK });
    const relay = await relayWith({ status: 200, body: ACCEPTED });
    const app = createApp({ supabase: client, relayClient: clientFor(relay.url) });

    const r = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer tok")
      .send({ ...VALID_BODY, code: KOSDAQ_STOCK.code });

    expect(r.status).toBe(200);
    expect(relay.requests[0].body).toMatchObject({ market: "Q", isin: KOSDAQ_STOCK.isin });
  });
});

// ============================================================
// POST /api/orders — relay 응답 3분류 (이 플랜의 핵심)
// ============================================================

describe("POST /api/orders — relay 응답 매핑", () => {
  async function withRelay(reply: RelayReply | string) {
    const user = nextUser();
    const { client, rec } = makeSupabase({ user, credential: true, stock: KOSPI_STOCK });
    const url = typeof reply === "string" ? reply : (await relayWith(reply)).url;
    const app = createApp({ supabase: client, relayClient: clientFor(url) });
    const r = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer tok")
      .send(VALID_BODY);
    return { r, rec };
  }

  it("⑩ relay 409 → 409 SESSION_NOT_READY", async () => {
    const { r } = await withRelay({
      status: 409,
      body: { error: { code: "SESSION_NOT_READY", message: "실시간 세션이 없습니다." } },
    });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("SESSION_NOT_READY");
  });

  it("⑪ relay 403 → 403 ACCOUNT_NOT_ALLOWED (계좌 판정은 relay 세션 목록, T-15-01)", async () => {
    const { r } = await withRelay({
      status: 403,
      body: { error: { code: "ACCOUNT_NOT_ALLOWED", message: "이 세션에서 사용할 수 없는 계좌입니다." } },
    });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("ACCOUNT_NOT_ALLOWED");
  });

  it("⑫ relay 202 ORDER_TIMEOUT → ORDER_TIMEOUT + status='timeout' 기록 + 문구에 \"실패\" 없음", async () => {
    const { r, rec } = await withRelay({
      status: 202,
      body: {
        error: {
          code: "ORDER_TIMEOUT",
          message: "주문 결과를 확인하지 못했습니다. 미체결 목록을 확인해 주세요.",
        },
      },
    });

    // 202 는 axios 가 "성공"으로 처리하는 상태코드다 — 그대로 흘리면 결과를 모르는
    // 주문이 접수 성공으로 둔갑한다.
    expect(r.body.error.code).toBe("ORDER_TIMEOUT");
    expect(r.status).not.toBe(200);
    // 재시도 신호(504)를 쓰지 않는다 — 중복 주문의 경로다.
    expect(r.status).not.toBe(504);

    // **"실패"로 단정하지 않는다** (Pitfall 9 / UI-SPEC C9).
    expect(r.body.error.message).not.toContain("실패");

    const updates = rec.updates.filter((u) => u.table === "dma_orders");
    expect(updates).toHaveLength(1);
    expect(updates[0].patch.status).toBe("timeout");
    expect(updates[0].filters).toMatchObject({ id: ORDER_ROW_ID });
  });

  it("⑬ relay 연결 실패 → 502 RELAY_UNAVAILABLE + 행은 rejected (나가지 않았다)", async () => {
    const { r, rec } = await withRelay(await closedPortUrl());
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe("RELAY_UNAVAILABLE");

    // 연결이 서지 않았다 = 주문은 나가지 않았다. timeout 과 구분해 기록한다.
    const updates = rec.updates.filter((u) => u.table === "dma_orders");
    expect(updates).toHaveLength(1);
    expect(updates[0].patch.status).toBe("rejected");
  });

  it("⑭ relay 401(비밀 불일치) → 500 generic, 응답에 비밀·기대값·relay 원문 없음", async () => {
    const { r } = await withRelay({
      status: 401,
      body: { error: { code: "UNAUTHORIZED_RELAY", message: "Unauthorized" } },
    });

    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe("INTERNAL_ERROR");

    const raw = JSON.stringify(r.body);
    expect(raw).not.toContain("X-Relay-Secret");
    expect(raw).not.toContain("x-relay-secret");
    expect(raw).not.toContain(SECRET);
    expect(raw).not.toContain("UNAUTHORIZED_RELAY");
    expect(raw).not.toContain("Unauthorized");
  });

  it("⑭-b relay 400 → 400 VALIDATION_FAILED, relay 원문 미노출", async () => {
    const { r } = await withRelay({
      status: 400,
      body: { error: { code: "VALIDATION_FAILED", message: "isin 길이가 12자가 아닙니다" } },
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("VALIDATION_FAILED");
    expect(JSON.stringify(r.body)).not.toContain("12자가 아닙니다");
  });

  it("⑭-c relay 200 이지만 본문을 해석할 수 없음 → 결과 모름(ORDER_TIMEOUT), 실패 아님", async () => {
    const { r, rec } = await withRelay({ status: 200, body: { unexpected: true } });
    expect(r.body.error.code).toBe("ORDER_TIMEOUT");
    const updates = rec.updates.filter((u) => u.table === "dma_orders");
    expect(updates[0].patch.status).toBe("timeout");
  });
});

// ============================================================
// GET /api/orders
// ============================================================

describe("GET /api/orders", () => {
  const orderRow = (userId: string, id: string) => ({
    id,
    user_id: userId,
    account_no: "12345678901",
    isin: KOSPI_STOCK.isin,
    stock_code: "005930",
    exchange: "KRX",
    market: "K",
    side: "B",
    order_type: "N",
    org_order_no: null,
    qty: 10,
    price: 70000,
    order_no: "0000123",
    status: "accepted",
    result_code: 0,
    notice_type: "A",
    message: "정상처리",
    filled_qty: 0,
    created_at: "2026-09-06T00:30:00Z",
    updated_at: "2026-09-06T00:30:01Z",
  });

  it("⑯-a 미인증 → 401", async () => {
    const { client } = makeSupabase({ user: nextUser() });
    const r = await request(createApp({ supabase: client })).get("/api/orders");
    expect(r.status).toBe(401);
  });

  it("⑯-b 정상 → bare array + camelCase 매핑", async () => {
    const user = nextUser();
    const { client } = makeSupabase({
      user,
      orders: [orderRow(user.id, ORDER_ROW_ID), orderRow("other-user", "bbbb")],
    });

    const r = await request(createApp({ supabase: client }))
      .get("/api/orders")
      .set("Authorization", "Bearer tok");

    expect(r.status).toBe(200);
    // 코드베이스 규약: list 는 bare array (webapp 이 envelope 을 벗기지 않는다).
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body).toHaveLength(1);
    expect(r.body[0]).toMatchObject({
      id: ORDER_ROW_ID,
      accountNo: "12345678901",
      orderNo: "0000123",
      status: "accepted",
      filledQty: 0,
    });
    // 응답에 타 사용자 식별자를 싣지 않는다.
    expect(r.body[0]).not.toHaveProperty("userId");
  });

  it("⑯-c WHERE user_id 필터가 요청자 id 로 걸린다 (T-15-01)", async () => {
    const user = nextUser();
    const { client, rec } = makeSupabase({ user, orders: [orderRow(user.id, ORDER_ROW_ID)] });

    await request(createApp({ supabase: client }))
      .get("/api/orders")
      .set("Authorization", "Bearer tok");

    expect(rec.listFilters).toHaveLength(1);
    expect(rec.listFilters[0].user_id).toBe(user.id);
    // KST 하루 경계가 함께 걸린다.
    expect(rec.listFilters[0]["gte:created_at"]).toBeDefined();
    expect(rec.listFilters[0]["lt:created_at"]).toBeDefined();
  });

  it("⑯-d date 는 KST 하루 반열린 구간으로 변환된다", async () => {
    const user = nextUser();
    const { client, rec } = makeSupabase({ user, orders: [] });

    const r = await request(createApp({ supabase: client }))
      .get("/api/orders?date=2026-09-06")
      .set("Authorization", "Bearer tok");

    expect(r.status).toBe(200);
    // 2026-09-06 00:00 KST = 2026-09-05 15:00 UTC
    expect(rec.listFilters[0]["gte:created_at"]).toBe("2026-09-05T15:00:00.000Z");
    expect(rec.listFilters[0]["lt:created_at"]).toBe("2026-09-06T15:00:00.000Z");
  });

  it("⑯-e 형식은 맞지만 존재하지 않는 날짜 → 400 (500 이 아니다)", async () => {
    const { client } = makeSupabase({ user: nextUser(), orders: [] });

    const r = await request(createApp({ supabase: client }))
      .get("/api/orders?date=2026-13-45")
      .set("Authorization", "Bearer tok");

    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("VALIDATION_FAILED");
  });
});
