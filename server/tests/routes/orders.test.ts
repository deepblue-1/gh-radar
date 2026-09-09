import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";

/**
 * Phase 16 Plan 16 — `/api/orders` **조회 전용** 라우트 테스트 (D-02 / D-24).
 *
 * 15-17 이 두었던 POST 케이스 15종(관문·형식·allowlist·relay 응답 매핑)은 이 plan 에서
 * 라우트와 함께 제거했다. 주문 접수의 검증 정본은 이제 `relay/tests/ws-order.test.ts`
 * 17종이다 — 같은 규율을 두 하네스에서 절반씩 흉내 내면 어느 쪽도 진실이 아니게 된다.
 *
 * 남기는 것은 **조회**와 **접수 경로가 정말 사라졌다는 사실** 두 가지다.
 * 케이스 ⓪ 이 후자를 잠근다: `POST /api/orders` 가 라우터를 통과해 404 로 떨어져야 한다
 * (403·503·400 이면 라우트가 아직 살아 있다는 뜻이다).
 *
 * supabase 는 `auth.getUser` + `dma_orders` 조회만 지원하는 최소 mock 이며, 조회 필터를
 * 기록해 소유권(T-15-01)·KST 하루 경계를 단언한다. relay 스텁은 더 이상 필요 없다 —
 * 이 라우트는 relay 를 부르지 않는다.
 */

const ORDER_ROW_ID = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const KOSPI_ISIN = "KR7005930003";

let userSeq = 0;
const nextUser = () => ({ id: `00000000-0000-4000-8000-${String(++userSeq).padStart(12, "0")}` });

// ============================================================
// supabase mock
// ============================================================

type SupabaseOpts = {
  user?: { id: string } | null;
  orders?: Record<string, unknown>[];
};

type Recorder = {
  /** `dma_orders` 조회에 실제로 걸린 필터 (소유권·날짜 경계 단언용). */
  listFilters: Record<string, any>[];
  /** `select(...)` 에 넘어간 컬럼 목록 원문 (화이트리스트 회귀 잠금용). */
  selects: { table: string; cols: string }[];
  /** 쓰기가 한 번도 일어나지 않음을 단언하기 위한 기록. */
  writes: { table: string; kind: "insert" | "update" }[];
};

function makeSupabase(opts: SupabaseOpts): { client: any; rec: Recorder } {
  const rec: Recorder = { listFilters: [], selects: [], writes: [] };

  const client = {
    auth: {
      getUser: async (_token: string) =>
        opts.user
          ? { data: { user: opts.user }, error: null }
          : { data: { user: null }, error: { message: "invalid token" } },
    },
    from(table: string) {
      const filters: Record<string, any> = {};

      const b: any = {
        select: (cols?: string) => {
          rec.selects.push({ table, cols: cols ?? "*" });
          return b;
        },
        insert: () => {
          rec.writes.push({ table, kind: "insert" });
          return b;
        },
        update: () => {
          rec.writes.push({ table, kind: "update" });
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
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
        then: (resolve: any) => {
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

const orderRow = (userId: string, id: string) => ({
  id,
  user_id: userId,
  account_no: "12345678901",
  isin: KOSPI_ISIN,
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
  // 자동주문 출처. 수동(manual)이 DEFAULT 라 픽스처를 manual 로 두면 "매핑이 빠져도
  // 통과"하는 케이스가 된다 — 일부러 자동주문 값을 넣어 왕복을 잠근다 (WR-05).
  origin: "limit_chaser",
  created_at: "2026-09-06T00:30:00Z",
  updated_at: "2026-09-06T00:30:01Z",
});

// ============================================================
// 접수 경로 제거 회귀 (D-02 / T-16-11)
// ============================================================

describe("POST /api/orders — 제거됐다 (D-02)", () => {
  it("⓪ 인증된 요청이어도 404 다 — 라우트 자체가 없다", async () => {
    const user = nextUser();
    const { client, rec } = makeSupabase({ user });

    const r = await request(createApp({ supabase: client }))
      .post("/api/orders")
      .set("Authorization", "Bearer tok")
      .send({
        code: "005930",
        accountNo: "12345678901",
        exchange: "KRX",
        side: "B",
        orderType: "N",
        qty: 10,
        price: 70000,
      });

    // 404 여야 한다. 403(allowlist)·503(relay 미설정)·400(형식)이 오면 라우트가 살아 있다.
    expect(r.status).toBe(404);
    // 접수 경로가 없으므로 감사 행도, 갱신도 일어나지 않는다.
    expect(rec.writes).toHaveLength(0);
  });

  it("⓪-b 미인증 POST 도 404 다 — 401 이면 아직 requireAuth 가 붙은 라우트가 있다는 뜻", async () => {
    const { client } = makeSupabase({ user: nextUser() });

    const r = await request(createApp({ supabase: client })).post("/api/orders").send({});

    expect(r.status).toBe(404);
  });
});

// ============================================================
// GET /api/orders
// ============================================================

describe("GET /api/orders", () => {
  it("⑯-a 미인증 → 401", async () => {
    const { client } = makeSupabase({ user: nextUser() });
    const r = await request(createApp({ supabase: client })).get("/api/orders");
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("⑯-a2 잘못된 토큰 → 401 (POST 제거로 인증 검사가 느슨해지지 않았다)", async () => {
    const { client } = makeSupabase({ user: null });
    const r = await request(createApp({ supabase: client }))
      .get("/api/orders")
      .set("Authorization", "Bearer bad");
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
      isin: KOSPI_ISIN,
      stockCode: "005930",
      orderNo: "0000123",
      status: "accepted",
      filledQty: 0,
      // 자동주문/수동주문 구분이 API 층까지 도달한다 (WR-05 / T-16-23).
      // 표시 층(주문 이력 표)은 D-20 deferred 라 아직 없다 — 계약만 먼저 완성한 상태다.
      origin: "limit_chaser",
    });
    // 응답에 타 사용자 식별자를 싣지 않는다.
    expect(r.body[0]).not.toHaveProperty("userId");
  });

  it("⑯-b2 조회 컬럼 목록에 origin 이 있고 user_id 는 없다 (T-16-22)", async () => {
    const user = nextUser();
    const { client, rec } = makeSupabase({ user, orders: [orderRow(user.id, ORDER_ROW_ID)] });

    await request(createApp({ supabase: client }))
      .get("/api/orders")
      .set("Authorization", "Bearer tok");

    const sel = rec.selects.find((s) => s.table === "dma_orders");
    expect(sel).toBeDefined();
    const cols = sel!.cols.split(",");
    // 화이트리스트로 명시 조회한다 — `*` 면 컬럼이 늘 때마다 응답이 조용히 넓어진다.
    expect(sel!.cols).not.toBe("*");
    expect(cols).toContain("origin");
    // ★ `user_id` 는 `WHERE` 로만 쓰고 응답에는 싣지 않는다. 컬럼 추가가 이 규율을
    //   흐리지 않았음을 회귀 잠금한다.
    expect(cols).not.toContain("user_id");
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

  it("⑯-f 형식 위반 date(2026-9-6) → 400 — zod 가 먼저 거른다", async () => {
    const { client, rec } = makeSupabase({ user: nextUser(), orders: [] });

    const r = await request(createApp({ supabase: client }))
      .get("/api/orders?date=2026-9-6")
      .set("Authorization", "Bearer tok");

    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("VALIDATION_FAILED");
    // 형식이 틀리면 DB 를 두드리지 않는다.
    expect(rec.listFilters).toHaveLength(0);
  });

  it("⑯-g 조회는 쓰기를 만들지 않는다 (insert/update 0회)", async () => {
    const user = nextUser();
    const { client, rec } = makeSupabase({ user, orders: [orderRow(user.id, ORDER_ROW_ID)] });

    await request(createApp({ supabase: client }))
      .get("/api/orders")
      .set("Authorization", "Bearer tok");

    expect(rec.writes).toHaveLength(0);
  });
});
