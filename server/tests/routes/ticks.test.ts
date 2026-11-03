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

// ── 요청 변환 · 취소 (D-03) ──────────────────────────────────────────
type RunResult = { ok: true; execution: string | null } | { ok: false; status: number; error: string };

function fakeTrigger(result: RunResult = { ok: true, execution: "exec-1" }) {
  const runs: { date: string; ex: string }[] = [];
  return {
    runs,
    trigger: {
      async run(date: string, ex: "KRX" | "NXT"): Promise<RunResult> {
        runs.push({ date, ex });
        return result;
      },
    },
  };
}

/** 요청 행(open 이 아니라 stale 키 없음). */
const { stale: _stale, ...convReq } = { ...pendingReq, triggered_at: "2026-10-30T01:00:00+00:00" };

/** tick_request_convert_for_user 반환 — 분기와 상관없이 같은 키 집합(37-04). */
const convReply = (over: Record<string, unknown>) => ({
  access: true,
  should_trigger: false,
  capped: false,
  grid_ready: false,
  not_uploaded: false,
  retry_after: null,
  eta_s: 300,
  request: convReq,
  ...over,
});

const CONVERT = "/api/ticks/convert";
const CANCEL = "/api/ticks/convert/cancel";
const body = { isin: CHUNIL, d: "20261030", ex: "KRX" };

describe("POST /api/ticks/convert — should_trigger 일 때만 Job 실행 (D-03)", () => {
  it("should_trigger true → RPC {p_user_id, p_date, p_isin, p_ex, p_daily_cap} 1회 · trigger.run(날짜, 거래소) 1회 · triggered true", async () => {
    const user = nextUser();
    const { client, rec } = makeSupabase({ user, rpc: { tick_request_convert_for_user: convReply({ should_trigger: true }) } });
    const t = fakeTrigger();
    const r = await auth(
      request(app(client, { tickConvertTrigger: t.trigger })).post(CONVERT).send({ ...body, user_id: "x" }),
    );
    expect(r.status).toBe(200);
    expect(rec.rpcCalls).toEqual([
      {
        fn: "tick_request_convert_for_user",
        params: { p_user_id: user.id, p_date: "20261030", p_isin: CHUNIL, p_ex: "KRX", p_daily_cap: 20 },
      },
    ]);
    expect(t.runs).toEqual([{ date: "20261030", ex: "KRX" }]);
    expect(r.body).toEqual({
      access: true,
      grid_ready: false,
      capped: false,
      triggered: true,
      not_uploaded: false,
      retry_after: null,
      request: convReq,
      eta_s: 300,
    });
    expect("should_trigger" in r.body).toBe(false);
  });

  it("should_trigger false(같은 (날짜, 거래소) 앞 요청이 깨움) → run 0회 · triggered false", async () => {
    const { client } = makeSupabase({ user: nextUser(), rpc: { tick_request_convert_for_user: convReply({}) } });
    const t = fakeTrigger();
    const r = await auth(request(app(client, { tickConvertTrigger: t.trigger })).post(CONVERT).send(body));
    expect(r.status).toBe(200);
    expect(r.body.triggered).toBe(false);
    expect(t.runs).toHaveLength(0);
  });

  it("하루 상한 → 429 TICK_CONVERT_CAPPED · run 0회 · p_daily_cap 은 주입값", async () => {
    const { client, rec } = makeSupabase({ user: nextUser(), rpc: { tick_request_convert_for_user: convReply({ capped: true }) } });
    const t = fakeTrigger();
    const r = await auth(
      request(app(client, { tickConvertTrigger: t.trigger, tickRequestDailyCap: 7 })).post(CONVERT).send(body),
    );
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe("TICK_CONVERT_CAPPED");
    expect(rec.rpcCalls[0].params.p_daily_cap).toBe(7);
    expect(t.runs).toHaveLength(0);
  });

  it("grid_ready → 200 grid_ready true · run 0회", async () => {
    const { client } = makeSupabase({
      user: nextUser(),
      rpc: { tick_request_convert_for_user: convReply({ grid_ready: true, request: null }) },
    });
    const t = fakeTrigger();
    const r = await auth(request(app(client, { tickConvertTrigger: t.trigger })).post(CONVERT).send(body));
    expect(r.status).toBe(200);
    expect(r.body.grid_ready).toBe(true);
    expect(r.body.triggered).toBe(false);
    expect(t.runs).toHaveLength(0);
  });

  it("not_uploaded → 200 {not_uploaded: true, retry_after} · run 0회 · tick_request_trigger_failed 0회", async () => {
    const retry = "2026-10-30T14:30:00+00:00";
    const { client, rec } = makeSupabase({
      user: nextUser(),
      rpc: { tick_request_convert_for_user: convReply({ not_uploaded: true, retry_after: retry }) },
    });
    const t = fakeTrigger();
    const r = await auth(request(app(client, { tickConvertTrigger: t.trigger })).post(CONVERT).send(body));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ not_uploaded: true, retry_after: retry, triggered: false });
    expect(t.runs).toHaveLength(0);
    expect(rec.rpcCalls.map((c) => c.fn)).toEqual(["tick_request_convert_for_user"]);
  });

  it("run 실패(HTTP 403 · 네트워크) → tick_request_trigger_failed(date, ex, 메시지) 1회 · 502 TICK_CONVERT_TRIGGER_FAILED", async () => {
    const fails: RunResult[] = [
      { ok: false, status: 403, error: "Permission 'run.jobs.runWithOverrides' denied" },
      { ok: false, status: 0, error: "fetch failed" },
    ];
    for (const fail of fails) {
      const { client, rec } = makeSupabase({
        user: nextUser(),
        rpc: { tick_request_convert_for_user: convReply({ should_trigger: true }), tick_request_trigger_failed: 1 },
      });
      const t = fakeTrigger(fail);
      const r = await auth(request(app(client, { tickConvertTrigger: t.trigger })).post(CONVERT).send(body));
      expect(r.status).toBe(502);
      expect(r.body.error.code).toBe("TICK_CONVERT_TRIGGER_FAILED");
      expect(JSON.stringify(r.body)).not.toContain("runWithOverrides");
      expect(t.runs).toHaveLength(1);
      expect(rec.rpcCalls).toHaveLength(2);
      expect(rec.rpcCalls[1]).toEqual({
        fn: "tick_request_trigger_failed",
        params: { p_date: "20261030", p_ex: "KRX", p_error: `TRIGGER_FAILED:${fail.ok ? "" : fail.status}` },
      });
    }
  });

  it("run 타임아웃(status 0 · TIMEOUT) → 되돌리지 않는다(실행이 시작됐을 수 있다) · 200 triggered true(IN-31)", async () => {
    const { client, rec } = makeSupabase({
      user: nextUser(),
      rpc: { tick_request_convert_for_user: convReply({ should_trigger: true }), tick_request_trigger_failed: 1 },
    });
    const t = fakeTrigger({ ok: false, status: 0, error: "TIMEOUT" });
    const r = await auth(request(app(client, { tickConvertTrigger: t.trigger })).post(CONVERT).send(body));
    expect(r.status).toBe(200);
    expect(r.body.triggered).toBe(true);
    expect(t.runs).toHaveLength(1);
    expect(rec.rpcCalls.map((c) => c.fn)).toEqual(["tick_request_convert_for_user"]);
  });

  it("trigger 미주입(TICK_CONVERT_JOB 없음)인데 should_trigger → trigger_failed(…, TRIGGER_DISABLED) · 503 TICK_CONVERT_UNAVAILABLE", async () => {
    const { client, rec } = makeSupabase({
      user: nextUser(),
      rpc: { tick_request_convert_for_user: convReply({ should_trigger: true }), tick_request_trigger_failed: 1 },
    });
    const r = await auth(request(app(client)).post(CONVERT).send(body));
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe("TICK_CONVERT_UNAVAILABLE");
    expect(rec.rpcCalls[1]).toEqual({
      fn: "tick_request_trigger_failed",
      params: { p_date: "20261030", p_ex: "KRX", p_error: "TRIGGER_DISABLED" },
    });
  });

  it("되돌림 RPC 자체가 실패해도 502 는 그대로(원문 비노출)", async () => {
    const { client } = makeSupabase({
      user: nextUser(),
      rpc: {
        tick_request_convert_for_user: convReply({ should_trigger: true }),
        tick_request_trigger_failed: () => ({ data: null, error: { message: "boom", code: "57014" } }),
      },
    });
    const t = fakeTrigger({ ok: false, status: 500, error: "x" });
    const r = await auth(request(app(client, { tickConvertTrigger: t.trigger })).post(CONVERT).send(body));
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.body)).not.toContain("57014");
  });

  it("trigger 미주입이어도 should_trigger false 면 200(앞 Job 에 실림)", async () => {
    const { client } = makeSupabase({ user: nextUser(), rpc: { tick_request_convert_for_user: convReply({}) } });
    const r = await auth(request(app(client)).post(CONVERT).send(body));
    expect(r.status).toBe(200);
  });

  it("미인증 401 · access false 403 · 본문 위반 400(RPC 0회)", async () => {
    const a = makeSupabase({ user: nextUser() });
    expect((await request(app(a.client)).post(CONVERT).send(body)).status).toBe(401);
    expect(a.rec.rpcCalls).toHaveLength(0);

    const b = makeSupabase({ user: nextUser(), rpc: { tick_request_convert_for_user: { access: false } } });
    const t = fakeTrigger();
    const rb = await auth(request(app(b.client, { tickConvertTrigger: t.trigger })).post(CONVERT).send(body));
    expect(rb.status).toBe(403);
    expect(rb.body.error.code).toBe("DMA_UNMAPPED");
    expect(t.runs).toHaveLength(0);

    const bads: Record<string, unknown>[] = [
      { ...body, isin: "kr7000650002" },
      { ...body, d: "20261332" },
      { ...body, ex: "KOSPI" },
      { isin: CHUNIL, d: "20261030" },
      {},
    ];
    for (const bad of bads) {
      const c = makeSupabase({ user: nextUser(), rpc: { tick_request_convert_for_user: convReply({}) } });
      const rc = await auth(request(app(c.client)).post(CONVERT).send(bad));
      expect(rc.status, JSON.stringify(bad)).toBe(400);
      expect(c.rec.rpcCalls).toHaveLength(0);
    }
  });
});

describe("POST /api/ticks/convert/cancel — 본인 pending 만 (D-03)", () => {
  it("RPC tick_cancel_convert_for_user {p_user_id, p_date, p_isin, p_ex} 1회 · 본문 그대로", async () => {
    const user = nextUser();
    const reply = { access: true, cancelled: true, request: { ...convReq, status: "cancelled" } };
    const { client, rec } = makeSupabase({ user, rpc: { tick_cancel_convert_for_user: reply } });
    const r = await auth(request(app(client)).post(CANCEL).send(body));
    expect(r.status).toBe(200);
    expect(rec.rpcCalls).toEqual([
      { fn: "tick_cancel_convert_for_user", params: { p_user_id: user.id, p_date: "20261030", p_isin: CHUNIL, p_ex: "KRX" } },
    ]);
    expect(r.body).toEqual(reply);
  });

  it("access false → 403 · 본문 위반 → 400(RPC 0회)", async () => {
    const a = makeSupabase({ user: nextUser(), rpc: { tick_cancel_convert_for_user: { access: false } } });
    const r = await auth(request(app(a.client)).post(CANCEL).send(body));
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("DMA_UNMAPPED");

    const b = makeSupabase({
      user: nextUser(),
      rpc: { tick_cancel_convert_for_user: { access: true, cancelled: false, request: null } },
    });
    const r2 = await auth(request(app(b.client)).post(CANCEL).send({ ...body, ex: "X" }));
    expect(r2.status).toBe(400);
    expect(b.rec.rpcCalls).toHaveLength(0);
  });
});

/**
 * Phase 38 — `/api/ticks/own` (D-01 · D-14). 가시성 · 어드민 · 켜진 서버는 RPC 안이 정본(pgTAP tick_own.test.sql)이라
 * 여기서는 server 가 지키는 것만 잠근다: 인증 · 입력 400 · 게이트 403 · 오류/모양 500(원문 비노출) · RPC 정확히 1회 ·
 * 인자 키 정확히 4개 · 클라이언트가 계좌 · 사용자 · 어드민 류 쿼리를 더해도 RPC 인자에 실리지 않음 · no-store.
 */
describe("GET /api/ticks/own (Phase 38 D-01 · D-14)", () => {
  const OWN = (q: string) => `/api/ticks/own?${q}`;
  const okOwnQ = `isin=${CHUNIL}&d=20261030&ex=KRX`;
  const ownData = {
    access: true,
    date: "20261030",
    exchange: "KRX",
    isin: CHUNIL,
    servers: ["KB120", "KYOBO119"],
    fills: [
      {
        gateway: "KB120",
        seq: 1,
        gw_time_ms: 1793332800130,
        account_no: "1234563801",
        order_no: "0000380101",
        side: "B",
        exec_price: 16400,
        exec_qty: 300,
      },
    ],
    events: [
      {
        gateway: "KB120",
        seq: 1,
        gw_time_ms: 1793332800100,
        kind: 3,
        group: 1,
        account_no: "1234563801",
        order_no: "0000380101",
        price: 16400,
        qty: 300,
        reason_code: "",
        cond_metric: 0,
        cond_threshold: 0,
        cond_actual: 0,
        ev_kind: 0,
        ev_price: 0,
        ev_qty_before: 0,
        ev_qty_after: 0,
        ev_trade_qty: 0,
        cum_volume: 1064,
      },
    ],
    orders: [
      {
        gateway: "KB120",
        account_no: "1234563801",
        order_no: "0000380101",
        side: "B",
        price: 16400,
        qty: 300,
        origin: "limit_chaser",
        created_ms: 1793332800100,
      },
    ],
  };

  it("① Authorization 없음 → 401 · RPC 0회", async () => {
    const { client, rec } = makeSupabase({ user: nextUser(), rpc: { tick_own_for_user: ownData } });
    const r = await request(app(client)).get(OWN(okOwnQ));
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("UNAUTHENTICATED");
    expect(rec.rpcCalls).toHaveLength(0);
  });

  it("② isin 소문자 · d 하이픈 · ex KOSPI → 각각 400 VALIDATION_FAILED · RPC 0회", async () => {
    const bads = [
      OWN(`isin=kr7000650002&d=20261030&ex=KRX`),
      OWN(`isin=${CHUNIL}&d=2026-10-30&ex=KRX`),
      OWN(`isin=${CHUNIL}&d=20261030&ex=KOSPI`),
    ];
    for (const path of bads) {
      const { client, rec } = makeSupabase({ user: nextUser(), rpc: { tick_own_for_user: ownData } });
      const r = await auth(request(app(client)).get(path));
      expect(r.status, path).toBe(400);
      expect(r.body.error.code, path).toBe("VALIDATION_FAILED");
      expect(rec.rpcCalls, path).toHaveLength(0);
    }
  });

  it("③ RPC {access:false} → 403 DMA_UNMAPPED · RPC 1회", async () => {
    const { client, rec } = makeSupabase({ user: nextUser(), rpc: { tick_own_for_user: { access: false } } });
    const r = await auth(request(app(client)).get(OWN(okOwnQ)));
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("DMA_UNMAPPED");
    expect(rec.rpcCalls).toHaveLength(1);
  });

  it("④ RPC 오류 → 500 DB_ERROR · 원문(boom) 비노출", async () => {
    const { client, rec } = makeSupabase({ user: nextUser(), rpcError: { message: "boom" } });
    const r = await auth(request(app(client)).get(OWN(okOwnQ)));
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe("DB_ERROR");
    expect(JSON.stringify(r.body)).not.toContain("boom");
    expect(rec.rpcCalls).toHaveLength(1);
  });

  it("⑤ 배열 모양 위반(fills null · orders 없음) → 500 DB_ERROR", async () => {
    const { orders: _omit, ...noOrders } = ownData;
    for (const data of [{ ...ownData, fills: null }, noOrders]) {
      const { client } = makeSupabase({ user: nextUser(), rpc: { tick_own_for_user: data } });
      const r = await auth(request(app(client)).get(OWN(okOwnQ)));
      expect(r.status).toBe(500);
      expect(r.body.error.code).toBe("DB_ERROR");
    }
  });

  it("⑥ 성공 → 200 · 본문 = RPC data 그대로 · RPC 정확히 1회 · 인자 키 4개 · p_user_id = 인증 사용자", async () => {
    const user = nextUser();
    const { client, rec } = makeSupabase({ user, rpc: { tick_own_for_user: ownData } });
    const r = await auth(request(app(client)).get(OWN(okOwnQ)));
    expect(r.status).toBe(200);
    expect(r.body).toEqual(ownData);
    expect(rec.rpcCalls.length).toBe(1);
    expect(rec.rpcCalls[0].fn).toBe("tick_own_for_user");
    expect(Object.keys(rec.rpcCalls[0].params).sort()).toEqual(["p_date", "p_ex", "p_isin", "p_user_id"]);
    expect(rec.rpcCalls[0].params).toEqual({ p_user_id: user.id, p_date: "20261030", p_isin: CHUNIL, p_ex: "KRX" });
  });

  it("⑦ 쿼리에 p_all_accounts · user_id · account_no 를 더해도 200 · 인자 키 4개 그대로 · p_user_id = 인증 사용자", async () => {
    const user = nextUser();
    const other = nextUser();
    const { client, rec } = makeSupabase({ user, rpc: { tick_own_for_user: ownData } });
    const r = await auth(
      request(app(client)).get(OWN(`${okOwnQ}&p_all_accounts=true&user_id=${other.id}&account_no=1`)),
    );
    expect(r.status).toBe(200);
    expect(rec.rpcCalls).toHaveLength(1);
    expect(Object.keys(rec.rpcCalls[0].params).sort()).toEqual(["p_date", "p_ex", "p_isin", "p_user_id"]);
    expect(rec.rpcCalls[0].params.p_user_id).toBe(user.id);
    expect(JSON.stringify(rec.rpcCalls[0].params)).not.toContain(other.id);
  });

  it("⑧ 응답 헤더 Cache-Control: no-store", async () => {
    const { client } = makeSupabase({ user: nextUser(), rpc: { tick_own_for_user: ownData } });
    const r = await auth(request(app(client)).get(OWN(okOwnQ)));
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toContain("no-store");
  });
});
