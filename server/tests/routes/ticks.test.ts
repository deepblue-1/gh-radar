import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp, type AppDeps } from "../../src/app";
import { TICK_GRID_BUCKET, TICK_GRID_URL_TTL_S } from "../../src/services/ticks";

/**
 * `/api/ticks/{day,today,open}` — 틱 전문 뷰어 과거 경로 (Phase 37 D-08 · D-09 · D-15).
 *
 * server 는 경로마다 RPC 를 **왕복 1회** 부르고(open 은 격자가 있을 때만 `createSignedUrl` 1회 더), 게이트 · 날짜 규칙은
 * RPC 안이 정본이라 mock 은 흉내 내지 않고 **무엇을 넘겼는지**만 기록한다(accum-report.test.ts 와 같은 최소 mock).
 */

let userSeq = 0;
const nextUser = () => ({ id: `00000000-0000-4000-8000-${String(3700 + ++userSeq).padStart(12, "0")}` });

type Rec = {
  rpcCalls: { fn: string; params: Record<string, unknown> }[];
  signCalls: { bucket: string; path: string; ttl: number }[];
};

type RpcReply = { data: unknown; error: { message: string; code?: string } | null };

function makeSupabase(opts: {
  user?: { id: string } | null;
  /** RPC 이름 → data(또는 함수). 없으면 unexpected rpc 오류. */
  rpc?: Record<string, unknown | ((params: Record<string, unknown>) => RpcReply)>;
  rpcError?: { message: string; code?: string };
  signError?: { message: string };
}): { client: any; rec: Rec } {
  const rec: Rec = { rpcCalls: [], signCalls: [] };
  const client = {
    auth: {
      getUser: async (_token: string) =>
        opts.user
          ? { data: { user: opts.user }, error: null }
          : { data: { user: null }, error: { message: "invalid token" } },
    },
    async rpc(fn: string, params: Record<string, unknown>): Promise<RpcReply> {
      rec.rpcCalls.push({ fn, params });
      if (opts.rpcError) return { data: null, error: opts.rpcError };
      const v = opts.rpc?.[fn];
      if (v === undefined) return { data: null, error: { message: `unexpected rpc ${fn}` } };
      if (typeof v === "function") return (v as (p: Record<string, unknown>) => RpcReply)(params);
      return { data: v, error: null };
    },
    storage: {
      from(bucket: string) {
        return {
          async createSignedUrl(path: string, ttl: number) {
            rec.signCalls.push({ bucket, path, ttl });
            if (opts.signError) return { data: null, error: opts.signError };
            return { data: { signedUrl: `https://sb.example/sign/${bucket}/${path}?token=t` }, error: null };
          },
        };
      },
    },
    from() {
      throw new Error("server 는 표를 from() 으로 읽지 않는다 — RPC 만");
    },
  };
  return { client, rec };
}

const auth = (r: request.Test) => r.set("Authorization", "Bearer tok");
const app = (client: unknown, extra: Partial<AppDeps> = {}) => createApp({ supabase: client as any, ...extra });

const CXI = "KYG2114A1094";
const CHUNIL = "KR7000650002";
const OBJ = `grid/20261014/KRX/${CHUNIL}.nightly.ticks.zst`;

const gridRow = {
  date: "20261014",
  exchange: "KRX",
  isin: CHUNIL,
  mode: "nightly",
  sources: ["accum", "up15"],
  object_path: OBJ,
  bytes: 1234567,
  records: 40211,
  a3_count: 37454,
  first_recv_ms: 1760400000000,
  last_recv_ms: 1760428800000,
  base_px: 10000,
  high_rate: 30,
  last_rate: 29.9,
  fmt: "pcapns-rec+zstd/1",
  created_at: "2026-10-14T16:31:00+00:00",
  updated_at: "2026-10-14T16:31:00+00:00",
};

const openWithGrid = {
  access: true,
  date: "20261014",
  exchange: "KRX",
  isin: CHUNIL,
  grid: gridRow,
  request: null,
  accum: { reg_time_ms: 1760403600000, pos_net: [[1760403600000, 100]] },
  stock: { code: "000650", name: "천일고속" },
  eta_s: 300,
};

const pendingReq = {
  exchange: "KRX",
  isin: CHUNIL,
  status: "pending",
  requested_at: "2026-10-30T01:00:00+00:00",
  triggered_at: null,
  started_at: null,
  finished_at: null,
  error: null,
  stale: true,
};

const openNoGrid = { ...openWithGrid, grid: null, request: pendingReq, accum: null };

const dayData = {
  access: true,
  dates: ["20261014", "20261013"],
  date: "20261014",
  rows: [
    {
      date: "20261014",
      exchange: "KRX",
      isin: CHUNIL,
      code: "000650",
      name: "천일고속",
      mode: "nightly",
      sources: ["accum"],
      bytes: 1234567,
      records: 40211,
      a3_count: 37454,
      high_rate: 30,
      last_rate: 29.9,
      created_at: "2026-10-14T16:31:00+00:00",
    },
  ],
  requests: [],
  eta_s: { KRX: 300, NXT: 240 },
};

const todayData = {
  access: true,
  date: "20261102",
  rows: [{ isin: CXI, code: "900120", name: "씨엑스아이", sources: ["up15"], rate: 12.5, high_rate: 16.1 }],
};

const OPEN = (q: string) => `/api/ticks/open?${q}`;
const okOpenQ = `isin=${CHUNIL}&d=20261014&ex=KRX`;

describe("GET /api/ticks/{day,today,open} — 인증 · 게이트 · 입력 (D-08)", () => {
  it("① 미인증 → 401 · RPC 0회 (세 경로)", async () => {
    for (const path of ["/api/ticks/day", "/api/ticks/today", OPEN(okOpenQ)]) {
      const { client, rec } = makeSupabase({ user: nextUser() });
      const r = await request(app(client)).get(path);
      expect(r.status, path).toBe(401);
      expect(r.body.error.code, path).toBe("UNAUTHENTICATED");
      expect(rec.rpcCalls, path).toHaveLength(0);
    }
  });

  it("② RPC access:false → 403 DMA_UNMAPPED · 서명 0회 (세 경로)", async () => {
    const denied = { access: false };
    for (const path of ["/api/ticks/day", "/api/ticks/today", OPEN(okOpenQ)]) {
      const { client, rec } = makeSupabase({
        user: nextUser(),
        rpc: { tick_day_for_user: denied, tick_today_for_user: denied, tick_open_for_user: denied },
      });
      const r = await auth(request(app(client)).get(path));
      expect(r.status, path).toBe(403);
      expect(r.body.error.code, path).toBe("DMA_UNMAPPED");
      expect(rec.rpcCalls, path).toHaveLength(1);
      expect(rec.signCalls, path).toHaveLength(0);
    }
  });

  it("③ 잘못된 isin · 날짜 · 거래소 → 400 VALIDATION_FAILED · RPC 0회", async () => {
    const bads = [
      OPEN(`isin=kr7000650002&d=20261014&ex=KRX`), // 소문자
      OPEN(`isin=KR700065000&d=20261014&ex=KRX`), // 11자
      OPEN(`isin=${CHUNIL}&d=20261332&ex=KRX`), // 실재 아닌 날짜
      OPEN(`isin=${CHUNIL}&d=2026101&ex=KRX`),
      OPEN(`isin=${CHUNIL}&d=20261014&ex=KOSPI`),
      OPEN(`isin=${CHUNIL}&d=20261014`), // ex 누락
      OPEN(`d=20261014&ex=KRX`), // isin 누락
      "/api/ticks/day?d=20260230",
      "/api/ticks/day?d=2026-10-14",
    ];
    for (const path of bads) {
      const { client, rec } = makeSupabase({ user: nextUser(), rpc: { tick_open_for_user: openWithGrid } });
      const r = await auth(request(app(client)).get(path));
      expect(r.status, path).toBe(400);
      expect(r.body.error.code, path).toBe("VALIDATION_FAILED");
      expect(rec.rpcCalls, path).toHaveLength(0);
    }
  });

  it("④ 모양 위반(access 누락 · data null) → 500 DB_ERROR (게이트로 숨기지 않는다)", async () => {
    for (const data of [null, { dates: [] }, { access: "yes" }]) {
      const { client } = makeSupabase({ user: nextUser(), rpc: { tick_day_for_user: data } });
      const r = await auth(request(app(client)).get("/api/ticks/day"));
      expect(r.status).toBe(500);
      expect(r.body.error.code).toBe("DB_ERROR");
    }
  });

  it("⑤ RPC 오류 → 500 DB_ERROR · 원문 비노출", async () => {
    const { client } = makeSupabase({
      user: nextUser(),
      rpcError: { message: "function tick_open_for_user does not exist", code: "42883" },
    });
    const r = await auth(request(app(client)).get(OPEN(okOpenQ)));
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe("DB_ERROR");
    expect(JSON.stringify(r.body)).not.toContain("42883");
  });
});

describe("GET /api/ticks/open — 서명 URL (D-09 · 트레이서)", () => {
  it("격자 있음 → RPC 1회 {p_user_id: 인증 사용자 · 쿼리 user_id 무시} · createSignedUrl(tick-grid, object_path, 600) 1회", async () => {
    const user = nextUser();
    const other = nextUser();
    const { client, rec } = makeSupabase({ user, rpc: { tick_open_for_user: openWithGrid } });
    const r = await auth(request(app(client)).get(OPEN(`${okOpenQ}&user_id=${other.id}&p_user_id=${other.id}`)));
    expect(r.status).toBe(200);
    expect(rec.rpcCalls).toEqual([
      { fn: "tick_open_for_user", params: { p_user_id: user.id, p_date: "20261014", p_isin: CHUNIL, p_ex: "KRX" } },
    ]);
    expect(TICK_GRID_BUCKET).toBe("tick-grid");
    expect(TICK_GRID_URL_TTL_S).toBe(600);
    expect(rec.signCalls).toEqual([{ bucket: "tick-grid", path: OBJ, ttl: 600 }]);

    expect(r.body.grid).toEqual({
      url: `https://sb.example/sign/tick-grid/${OBJ}?token=t`,
      expiresIn: 600,
      bytes: 1234567,
      records: 40211,
      a3_count: 37454,
      mode: "nightly",
      sources: ["accum", "up15"],
      fmt: "pcapns-rec+zstd/1",
      first_recv_ms: 1760400000000,
      last_recv_ms: 1760428800000,
      created_at: "2026-10-14T16:31:00+00:00",
    });
    expect(r.body.stock).toEqual({ code: "000650", name: "천일고속" });
    expect(r.body.accum).toEqual(openWithGrid.accum);
    expect(r.body.eta_s).toBe(300);
    expect(r.body.request).toBeNull();
    // Storage 경로는 응답 어디에도 없다.
    expect(JSON.stringify(r.body)).not.toContain("object_path");
    expect(JSON.stringify(r.body)).not.toContain(`${CHUNIL}.nightly.ticks.zst"`);
  });

  it("비 KR ISIN(KYG2114A1094) · NXT 도 통과", async () => {
    const { client, rec } = makeSupabase({ user: nextUser(), rpc: { tick_open_for_user: { ...openNoGrid, isin: CXI, exchange: "NXT" } } });
    const r = await auth(request(app(client)).get(OPEN(`isin=${CXI}&d=20261014&ex=NXT`)));
    expect(r.status).toBe(200);
    expect(rec.rpcCalls[0].params).toMatchObject({ p_isin: CXI, p_ex: "NXT" });
  });

  it("격자 null → 서명 0회 · grid null · request(stale) 그대로 통과", async () => {
    const { client, rec } = makeSupabase({ user: nextUser(), rpc: { tick_open_for_user: openNoGrid } });
    const r = await auth(request(app(client)).get(OPEN(okOpenQ)));
    expect(r.status).toBe(200);
    expect(rec.rpcCalls).toHaveLength(1);
    expect(rec.signCalls).toHaveLength(0);
    expect(r.body.grid).toBeNull();
    expect(r.body.request).toEqual(pendingReq);
    expect(r.body.accum).toBeNull();
  });

  it("서명 실패 → 500 DB_ERROR · 원문 비노출", async () => {
    const { client, rec } = makeSupabase({
      user: nextUser(),
      rpc: { tick_open_for_user: openWithGrid },
      signError: { message: "Object not found" },
    });
    const r = await auth(request(app(client)).get(OPEN(okOpenQ)));
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe("DB_ERROR");
    expect(JSON.stringify(r.body)).not.toContain("Object not found");
    expect(rec.rpcCalls).toHaveLength(1);
    expect(rec.signCalls).toHaveLength(1);
  });

  it("grid 모양 위반(배열 · object_path 없음) → 500 · 서명 0회", async () => {
    for (const grid of [[gridRow], { ...gridRow, object_path: undefined }]) {
      const { client, rec } = makeSupabase({ user: nextUser(), rpc: { tick_open_for_user: { ...openWithGrid, grid } } });
      const r = await auth(request(app(client)).get(OPEN(okOpenQ)));
      expect(r.status).toBe(500);
      expect(rec.signCalls).toHaveLength(0);
    }
  });
});

describe("GET /api/ticks/day · /today — 통과 모양 (D-15)", () => {
  it("day — RPC 1회 {p_user_id, p_date} · 생략 = null · 본문 그대로", async () => {
    const user = nextUser();
    const { client, rec } = makeSupabase({ user, rpc: { tick_day_for_user: dayData } });
    const r = await auth(request(app(client)).get("/api/ticks/day?d=20261014"));
    expect(r.status).toBe(200);
    expect(rec.rpcCalls).toEqual([{ fn: "tick_day_for_user", params: { p_user_id: user.id, p_date: "20261014" } }]);
    expect(r.body).toEqual(dayData);

    const b = makeSupabase({ user, rpc: { tick_day_for_user: { ...dayData, dates: [], date: null, rows: [] } } });
    const r2 = await auth(request(app(b.client)).get("/api/ticks/day"));
    expect(r2.status).toBe(200);
    expect(b.rec.rpcCalls).toEqual([{ fn: "tick_day_for_user", params: { p_user_id: user.id, p_date: null } }]);
    expect(r2.body.date).toBeNull();
  });

  it("today — RPC 1회 {p_user_id} · live false(tickgw 미결선) · 결선되면 true", async () => {
    const user = nextUser();
    const { client, rec } = makeSupabase({ user, rpc: { tick_today_for_user: todayData } });
    const r = await auth(request(app(client)).get("/api/ticks/today"));
    expect(r.status).toBe(200);
    expect(rec.rpcCalls).toEqual([{ fn: "tick_today_for_user", params: { p_user_id: user.id } }]);
    expect(r.body).toEqual({ ...todayData, live: false });

    const b = makeSupabase({ user, rpc: { tick_today_for_user: todayData } });
    const a = app(b.client);
    a.locals.tickgw = {}; // 37-15 결선 흉내
    const r2 = await auth(request(a).get("/api/ticks/today"));
    expect(r2.body.live).toBe(true);
  });
});
