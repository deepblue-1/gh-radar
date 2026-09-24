import { describe, it, expect } from "vitest";
import request from "supertest";
import { kstDateIso } from "@gh-radar/shared";
import { createApp } from "../../src/app";

/**
 * `/api/orders` **조회 전용** 라우트 테스트 (Phase 16 D-02 / D-24 → Phase 19 D-05 · D-06 · D-08).
 *
 * 15-17 이 두었던 POST 케이스 15종은 16-16 에서 라우트와 함께 제거했다. 주문 접수의 검증 정본은
 * `relay/tests/ws-order.test.ts` 다. 케이스 ⓪ 이 「접수 경로가 정말 사라졌다」 를 잠근다.
 *
 * Phase 19 부터 조회 원천은 계좌 기준 저널 테이블이다 — server 는 `dma_journal_orders_for_user`
 * RPC 를 **왕복 1회** 부르고 공유 매퍼 `toJournalOrderRow` 로 camelCase 행을 만든다. 가시성 필터는
 * RPC 안의 조인이 정본이라(D-06) mock 은 필터를 흉내 내지 않고 **무엇을 넘겼는지**만 기록한다:
 * 함수 이름·파라미터(p_user_id = 인증 사용자 · p_trade_date = KST 거래일), 그리고 `from()` 호출
 * (구 `dma_orders` 조회가 0 임을 단언).
 *
 * ★ 이 파일의 응답 단언과 webapp 쪽 테스트는 **같은 shared 타입 `JournalOrderRow`** 를 계약으로 삼는다
 *   (tasks/lessons.md 「프론트↔서버 응답 계약 드리프트」).
 */

const ORDER_ROW_ID = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const ORDER_ROW_ID_2 = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const KOSPI_ISIN = "KR7005930003";

let userSeq = 0;
const nextUser = () => ({ id: `00000000-0000-4000-8000-${String(++userSeq).padStart(12, "0")}` });

// ============================================================
// supabase mock
// ============================================================

type SupabaseOpts = {
  user?: { id: string } | null;
  /** `dma_journal_orders_for_user` 가 돌려줄 행(snake_case 원문). */
  rows?: Record<string, unknown>[];
  /** 주면 rpc 가 이 오류를 돌려준다. */
  rpcError?: { message: string };
};

type Recorder = {
  /** rpc 호출 이름·파라미터 원문. */
  rpcCalls: { fn: string; params: Record<string, unknown> }[];
  /** `from(table)` 호출 기록 — 구 `dma_orders` 조회 0 단언용. */
  fromTables: string[];
  /** 쓰기가 한 번도 일어나지 않음을 단언하기 위한 기록. */
  writes: { table: string; kind: "insert" | "update" }[];
};

function makeSupabase(opts: SupabaseOpts): { client: any; rec: Recorder } {
  const rec: Recorder = { rpcCalls: [], fromTables: [], writes: [] };

  const client = {
    auth: {
      getUser: async (_token: string) =>
        opts.user
          ? { data: { user: opts.user }, error: null }
          : { data: { user: null }, error: { message: "invalid token" } },
    },
    async rpc(fn: string, params: Record<string, unknown>) {
      rec.rpcCalls.push({ fn, params });
      if (opts.rpcError) return { data: null, error: opts.rpcError };
      if (fn === "dma_journal_orders_for_user") return { data: opts.rows ?? [], error: null };
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    },
    from(table: string) {
      rec.fromTables.push(table);
      const b: any = {
        select: () => b,
        insert: () => {
          rec.writes.push({ table, kind: "insert" });
          return b;
        },
        update: () => {
          rec.writes.push({ table, kind: "update" });
          return b;
        },
        eq: () => b,
        gte: () => b,
        lt: () => b,
        order: () => b,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
        then: (resolve: any) => resolve({ data: [], error: null }),
      };
      return b;
    },
  };

  return { client, rec };
}

/**
 * RPC 반환 행 1건 — 공개 컬럼 25종 snake_case. `dma_user_id` 는 RPC 가 내지 않으므로 픽스처에도 없다.
 * `last_seq` 는 bigint 직렬화 방어를 잠그려고 문자열로 둔다.
 */
const journalRow = (over: Record<string, unknown> = {}) => ({
  id: ORDER_ROW_ID,
  trade_date: "2026-09-28",
  account_no: "12345678901",
  isin: KOSPI_ISIN,
  stock_code: "005930",
  exchange: "KRX",
  board: "G1",
  side: "B",
  order_type: "N",
  org_order_no: null,
  qty: 10,
  price: 70000,
  order_no: "0000123",
  filled_qty: 4,
  modified_qty: 0,
  status: "partially_filled",
  result_code: 0,
  notice_type: "E",
  message: "정상처리",
  // 자동주문 출처 — manual 로 두면 「매핑이 빠져도 통과」 하는 케이스가 된다 (WR-05).
  origin: "limit_chaser",
  requester: "hts",
  request_kind: "new",
  last_seq: "42",
  created_at: "2026-09-28T00:30:00Z",
  updated_at: "2026-09-28T00:30:05Z",
  ...over,
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

  it("⑯-b 정상 → RPC 1회 · bare array · camelCase 매핑(origin null 보존 · lastSeq number)", async () => {
    const user = nextUser();
    const { client, rec } = makeSupabase({
      user,
      rows: [
        journalRow(),
        // 출처 미상 행 — null 이 「수동」 으로 채워지면 안 된다 (D-08 보충).
        journalRow({
          id: ORDER_ROW_ID_2,
          origin: null,
          side: null,
          qty: null,
          stock_code: null,
          last_seq: 7,
        }),
      ],
    });

    const r = await request(createApp({ supabase: client }))
      .get("/api/orders")
      .set("Authorization", "Bearer tok");

    expect(r.status).toBe(200);
    // 코드베이스 규약: list 는 bare array (webapp 이 envelope 을 벗기지 않는다).
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body).toHaveLength(2);
    // 새 테이블 RPC 왕복 1회 (D-05 · Cloud Run 왕복 비용).
    expect(rec.rpcCalls).toHaveLength(1);
    expect(rec.rpcCalls[0].fn).toBe("dma_journal_orders_for_user");

    expect(r.body[0]).toEqual({
      id: ORDER_ROW_ID,
      tradeDate: "2026-09-28",
      accountNo: "12345678901",
      isin: KOSPI_ISIN,
      stockCode: "005930",
      exchange: "KRX",
      board: "G1",
      side: "B",
      orderType: "N",
      orgOrderNo: null,
      qty: 10,
      price: 70000,
      orderNo: "0000123",
      filledQty: 4,
      modifiedQty: 0,
      status: "partially_filled",
      resultCode: 0,
      noticeType: "E",
      message: "정상처리",
      origin: "limit_chaser",
      requester: "hts",
      requestKind: "new",
      lastSeq: 42,
      createdAt: "2026-09-28T00:30:00Z",
      updatedAt: "2026-09-28T00:30:05Z",
    });
    expect(typeof r.body[0].lastSeq).toBe("number");
    expect(r.body[1]).toMatchObject({
      id: ORDER_ROW_ID_2,
      origin: null,
      side: null,
      qty: null,
      stockCode: null,
      lastSeq: 7,
    });
  });

  it("⑯-b2 응답에 주문자 식별자가 없다 (D-08 · T-19-08)", async () => {
    const user = nextUser();
    const { client } = makeSupabase({ user, rows: [journalRow()] });

    const r = await request(createApp({ supabase: client }))
      .get("/api/orders")
      .set("Authorization", "Bearer tok");

    expect(r.status).toBe(200);
    expect(r.text).not.toContain("dma_user_id");
    expect(r.text).not.toContain("dmaUserId");
    expect(r.body[0]).not.toHaveProperty("userId");
  });

  it("⑯-c p_user_id = 인증 사용자 · p_trade_date = KST 오늘 (T-19-17)", async () => {
    const user = nextUser();
    const { client, rec } = makeSupabase({ user, rows: [] });

    const r = await request(createApp({ supabase: client }))
      .get("/api/orders")
      .set("Authorization", "Bearer tok");

    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
    expect(rec.rpcCalls).toEqual([
      {
        fn: "dma_journal_orders_for_user",
        params: { p_user_id: user.id, p_trade_date: kstDateIso() },
      },
    ]);
  });

  it("⑯-c2 쿼리의 user_id 는 무시된다 — p_user_id 는 인증 사용자 (T-19-17)", async () => {
    const user = nextUser();
    const other = nextUser();
    const { client, rec } = makeSupabase({ user, rows: [] });

    const r = await request(createApp({ supabase: client }))
      .get(`/api/orders?user_id=${other.id}&p_user_id=${other.id}`)
      .set("Authorization", "Bearer tok");

    expect(r.status).toBe(200);
    expect(rec.rpcCalls).toHaveLength(1);
    expect(rec.rpcCalls[0].params.p_user_id).toBe(user.id);
  });

  it("⑯-d date 는 거래일 그대로 넘어간다", async () => {
    const user = nextUser();
    const { client, rec } = makeSupabase({ user, rows: [] });

    const r = await request(createApp({ supabase: client }))
      .get("/api/orders?date=2026-09-28")
      .set("Authorization", "Bearer tok");

    expect(r.status).toBe(200);
    expect(rec.rpcCalls[0].params).toEqual({ p_user_id: user.id, p_trade_date: "2026-09-28" });
  });

  it("⑯-e 형식은 맞지만 존재하지 않는 날짜 → 400 (500 이 아니다) · RPC 0회", async () => {
    for (const bad of ["2026-13-45", "2026-02-30"]) {
      const { client, rec } = makeSupabase({ user: nextUser(), rows: [] });

      const r = await request(createApp({ supabase: client }))
        .get(`/api/orders?date=${bad}`)
        .set("Authorization", "Bearer tok");

      expect(r.status, bad).toBe(400);
      expect(r.body.error.code).toBe("VALIDATION_FAILED");
      expect(rec.rpcCalls).toHaveLength(0);
    }
  });

  it("⑯-f 형식 위반 date(2026-9-6 · abc) → 400 — zod 가 먼저 거른다", async () => {
    for (const bad of ["2026-9-6", "abc"]) {
      const { client, rec } = makeSupabase({ user: nextUser(), rows: [] });

      const r = await request(createApp({ supabase: client }))
        .get(`/api/orders?date=${bad}`)
        .set("Authorization", "Bearer tok");

      expect(r.status, bad).toBe(400);
      expect(r.body.error.code).toBe("VALIDATION_FAILED");
      // 형식이 틀리면 DB 를 두드리지 않는다.
      expect(rec.rpcCalls).toHaveLength(0);
    }
  });

  it("⑯-g RPC 오류 → 500 DB_ERROR · 원문 비노출 (T-19-24)", async () => {
    const { client } = makeSupabase({
      user: nextUser(),
      rpcError: { message: "permission denied for function dma_journal_orders_for_user" },
    });

    const r = await request(createApp({ supabase: client }))
      .get("/api/orders")
      .set("Authorization", "Bearer tok");

    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe("DB_ERROR");
    expect(r.text).not.toContain("permission denied");
  });

  it("⑯-h 구 dma_orders 를 조회하지 않고 쓰기도 없다 (D-05)", async () => {
    const user = nextUser();
    const { client, rec } = makeSupabase({ user, rows: [journalRow()] });

    await request(createApp({ supabase: client }))
      .get("/api/orders")
      .set("Authorization", "Bearer tok");

    expect(rec.fromTables).not.toContain("dma_orders");
    expect(rec.writes).toHaveLength(0);
  });
});
