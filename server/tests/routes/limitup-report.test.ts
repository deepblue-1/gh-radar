import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { ApiError } from "../../src/errors";
import { getLimitupGridUrls, getLimitupReport } from "../../src/services/limitup-report";

/**
 * `GET /api/limitup/report` · `GET /api/limitup/grid-urls` — 상한가 보고서 조회 (Phase 28 D-10 · D-11 · D-15 · D-17).
 *
 * server 는 RPC 를 **왕복 1회**(`limitup_report_for_user` / `limitup_grid_isins_for_user`) 부르고, 격자는 Storage
 * `createSignedUrls` 를 **1회** 부른다. 게이트(dma_visible_accounts)와 날짜 규칙은 RPC 안이 정본이라 mock 은 흉내 내지
 * 않고 **무엇을 넘겼는지**만 기록한다(strategy-events.test.ts 와 같은 모양의 최소 mock).
 */

let userSeq = 0;
const nextUser = () => ({ id: `00000000-0000-4000-8000-${String(2800 + ++userSeq).padStart(12, "0")}` });

type Rec = {
  rpcCalls: { fn: string; params: Record<string, unknown> }[];
  signCalls: { bucket: string; paths: string[]; expiresIn: number }[];
};

function makeSupabase(opts: {
  user?: { id: string } | null;
  /** RPC data 그대로. */
  rpcData?: unknown;
  rpcError?: { message: string; code?: string };
  signError?: { message: string };
  /** createSignedUrls data 를 덮는다(기본 = 경로마다 https://signed/<path>). */
  signData?: (paths: string[]) => unknown;
}): { client: any; rec: Rec } {
  const rec: Rec = { rpcCalls: [], signCalls: [] };
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
      if (fn === "limitup_report_for_user" || fn === "limitup_grid_isins_for_user") {
        return { data: opts.rpcData ?? null, error: null };
      }
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    },
    storage: {
      from(bucket: string) {
        return {
          async createSignedUrls(paths: string[], expiresIn: number) {
            rec.signCalls.push({ bucket, paths, expiresIn });
            if (opts.signError) return { data: null, error: opts.signError };
            const data = opts.signData
              ? opts.signData(paths)
              : paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}?token=t`, error: null }));
            return { data, error: null };
          },
        };
      },
    },
  };
  return { client, rec };
}

const auth = (r: request.Test) => r.set("Authorization", "Bearer tok");

/** RPC 가 돌려주는 loaded 보고서 — 행 키 snake_case 그대로 통과해야 한다. */
const loadedReport = {
  access: true,
  dates: ["20261002", "20261001"],
  date: "20261002",
  loaded: true,
  day: {
    entries: [{ date: "20261002", isin: "KR7000000001", short_code: null, name: null, d1_ret: -0.115 }],
    locks: [{ date: "20261002", isin: "KR7000000001", lock_id: 1, outcome: "깨짐" }],
    facts: [{ date: "20261002", isin: "KR7000000001", event_no: 1, fact_no: 1, values: { krw: 1 }, source: "실측" }],
    summaries: [{ date: "20261002", isin: "KR7000000001", step_s: 10, sec0: 32400, q_krw: [0, 120, null] }],
    marks: [{ isin: "KR7000000001", jump_no: 3, t_ms: 1, kind: "burst_sell", qty: 1, krw: 9, q_before: 2, q_after: 1 }],
    rows: { entries: 1 },
  },
  prev: { date: "20261001", locks: [] },
  fingerprint: [{ member: "00002", name: "신한증권", n: 3 }],
};

describe("GET /api/limitup/report (Phase 28 D-10 · D-11)", () => {
  it("① 미인증 → 401 · RPC 0회", async () => {
    const { client, rec } = makeSupabase({ user: nextUser() });
    const r = await request(createApp({ supabase: client })).get("/api/limitup/report");
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("UNAUTHENTICATED");
    expect(rec.rpcCalls).toHaveLength(0);
  });

  it("② 형식 위반 d(2026-10-02 · abc · 2026100) · 날짜 아닌 값(20261340 · 20260230) → 400 VALIDATION_FAILED · RPC 0회", async () => {
    for (const bad of ["2026-10-02", "abc", "2026100", "20261340", "20260230", "20261000"]) {
      const { client, rec } = makeSupabase({ user: nextUser() });
      const r = await auth(request(createApp({ supabase: client })).get(`/api/limitup/report?d=${bad}`));
      expect(r.status, bad).toBe(400);
      expect(r.body.error.code, bad).toBe("VALIDATION_FAILED");
      expect(rec.rpcCalls, bad).toHaveLength(0);
    }
  });

  it("③ d 생략 → RPC 1회 {p_user_id: 인증 사용자, p_date: null} · 쿼리 user_id 무시 (T-19-17)", async () => {
    const user = nextUser();
    const other = nextUser();
    const { client, rec } = makeSupabase({
      user,
      rpcData: { access: true, dates: [], date: null, loaded: false },
    });
    const r = await auth(
      request(createApp({ supabase: client })).get(`/api/limitup/report?user_id=${other.id}&p_user_id=${other.id}`),
    );
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ access: true, dates: [], date: null, loaded: false });
    expect(rec.rpcCalls).toEqual([{ fn: "limitup_report_for_user", params: { p_user_id: user.id, p_date: null } }]);
  });

  it("④ d=20261002 → p_date 그대로 · loaded 보고서 200 그대로(행 키 snake_case 유지)", async () => {
    const user = nextUser();
    const { client, rec } = makeSupabase({ user, rpcData: loadedReport });
    const r = await auth(request(createApp({ supabase: client })).get("/api/limitup/report?d=20261002"));
    expect(r.status).toBe(200);
    expect(r.body).toEqual(loadedReport);
    expect(rec.rpcCalls).toEqual([{ fn: "limitup_report_for_user", params: { p_user_id: user.id, p_date: "20261002" } }]);
  });

  it("⑤ 적재 안 된 날짜 → 200 loaded false (빈 상태 원천)", async () => {
    const data = { access: true, dates: ["20261002"], date: "20261003", loaded: false };
    const { client } = makeSupabase({ user: nextUser(), rpcData: data });
    const r = await auth(request(createApp({ supabase: client })).get("/api/limitup/report?d=20261003"));
    expect(r.status).toBe(200);
    expect(r.body).toEqual(data);
  });

  it("⑥ RPC {access:false} → 403 DMA_UNMAPPED (D-10)", async () => {
    const { client, rec } = makeSupabase({ user: nextUser(), rpcData: { access: false } });
    const r = await auth(request(createApp({ supabase: client })).get("/api/limitup/report"));
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("DMA_UNMAPPED");
    expect(rec.rpcCalls).toHaveLength(1);
  });

  it("⑦ RPC error → 500 DB_ERROR · 원문 비노출", async () => {
    const { client } = makeSupabase({ user: nextUser(), rpcError: { message: "relation secret_table does not exist" } });
    const r = await auth(request(createApp({ supabase: client })).get("/api/limitup/report"));
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe("DB_ERROR");
    expect(JSON.stringify(r.body)).not.toContain("secret_table");
  });

  it("⑧ 결과가 객체가 아니면(null · 배열 · 문자열) → 500 DB_ERROR", async () => {
    for (const bad of [null, [], "x"]) {
      const { client } = makeSupabase({ user: nextUser(), rpcData: bad });
      const r = await auth(request(createApp({ supabase: client })).get("/api/limitup/report"));
      expect(r.status, JSON.stringify(bad)).toBe(500);
      expect(r.body.error.code).toBe("DB_ERROR");
    }
  });
});

describe("GET /api/limitup/grid-urls (Phase 28 D-10)", () => {
  it("① 미인증 → 401 · RPC 0회 · 서명 0회", async () => {
    const { client, rec } = makeSupabase({ user: nextUser() });
    const r = await request(createApp({ supabase: client })).get("/api/limitup/grid-urls?d=20261002");
    expect(r.status).toBe(401);
    expect(rec.rpcCalls).toHaveLength(0);
    expect(rec.signCalls).toHaveLength(0);
  });

  it("② d 생략 · 형식 위반 · 날짜 아닌 값 → 400 · RPC 0회", async () => {
    for (const q of ["", "?d=2026-10-02", "?d=abc", "?d=20261340"]) {
      const { client, rec } = makeSupabase({ user: nextUser() });
      const r = await auth(request(createApp({ supabase: client })).get(`/api/limitup/grid-urls${q}`));
      expect(r.status, q).toBe(400);
      expect(r.body.error.code, q).toBe("VALIDATION_FAILED");
      expect(rec.rpcCalls, q).toHaveLength(0);
    }
  });

  it("③ access false → 403 DMA_UNMAPPED · 서명 0회", async () => {
    const { client, rec } = makeSupabase({ user: nextUser(), rpcData: { access: false } });
    const r = await auth(request(createApp({ supabase: client })).get("/api/limitup/grid-urls?d=20261002"));
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("DMA_UNMAPPED");
    expect(rec.signCalls).toHaveLength(0);
  });

  it("④ isins 2개 → RPC 1회 · createSignedUrls 1회(grid/<D>/<isin>.json.gz · 600초) · urls[isin]", async () => {
    const user = nextUser();
    const { client, rec } = makeSupabase({
      user,
      rpcData: { access: true, date: "20261002", isins: ["KR7000000001", "KR7000000002"] },
    });
    const r = await auth(
      request(createApp({ supabase: client })).get(`/api/limitup/grid-urls?d=20261002&user_id=${nextUser().id}`),
    );
    expect(r.status).toBe(200);
    expect(rec.rpcCalls).toEqual([
      { fn: "limitup_grid_isins_for_user", params: { p_user_id: user.id, p_date: "20261002" } },
    ]);
    expect(rec.signCalls).toEqual([
      {
        bucket: "limitup-grid",
        paths: ["grid/20261002/KR7000000001.json.gz", "grid/20261002/KR7000000002.json.gz"],
        expiresIn: 600,
      },
    ]);
    expect(r.body).toEqual({
      date: "20261002",
      expiresIn: 600,
      urls: {
        KR7000000001: "https://signed/grid/20261002/KR7000000001.json.gz?token=t",
        KR7000000002: "https://signed/grid/20261002/KR7000000002.json.gz?token=t",
      },
    });
  });

  it("⑤ isins 빈 배열 → createSignedUrls 0회 · urls {}", async () => {
    const { client, rec } = makeSupabase({
      user: nextUser(),
      rpcData: { access: true, date: "20261003", isins: [] },
    });
    const r = await auth(request(createApp({ supabase: client })).get("/api/limitup/grid-urls?d=20261003"));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ date: "20261003", expiresIn: 600, urls: {} });
    expect(rec.signCalls).toHaveLength(0);
  });

  it("⑥ 서명 항목 error · signedUrl 없음은 뺀다", async () => {
    const { client } = makeSupabase({
      user: nextUser(),
      rpcData: { access: true, date: "20261002", isins: ["KR7000000001", "KR7000000002"] },
      signData: (paths) => [
        { path: paths[0], signedUrl: "https://signed/a", error: null },
        { path: paths[1], signedUrl: "", error: "Object not found" },
      ],
    });
    const r = await auth(request(createApp({ supabase: client })).get("/api/limitup/grid-urls?d=20261002"));
    expect(r.status).toBe(200);
    expect(r.body.urls).toEqual({ KR7000000001: "https://signed/a" });
  });

  it("⑦ Storage error → 500 DB_ERROR · 원문 비노출", async () => {
    const { client } = makeSupabase({
      user: nextUser(),
      rpcData: { access: true, date: "20261002", isins: ["KR7000000001"] },
      signError: { message: "bucket secret-bucket missing" },
    });
    const r = await auth(request(createApp({ supabase: client })).get("/api/limitup/grid-urls?d=20261002"));
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe("DB_ERROR");
    expect(JSON.stringify(r.body)).not.toContain("secret-bucket");
  });

  it("⑧ RPC error · 비객체 · isins 배열 아님 → 500 DB_ERROR · 서명 0회", async () => {
    for (const o of [
      { rpcError: { message: "boom" } },
      { rpcData: null },
      { rpcData: { access: true, date: "20261002", isins: "x" } },
    ]) {
      const { client, rec } = makeSupabase({ user: nextUser(), ...o });
      const r = await auth(request(createApp({ supabase: client })).get("/api/limitup/grid-urls?d=20261002"));
      expect(r.status, JSON.stringify(o)).toBe(500);
      expect(r.body.error.code).toBe("DB_ERROR");
      expect(rec.signCalls).toHaveLength(0);
    }
  });
});

describe("상한가 서비스 — DB · Storage 원인을 cause 로 싣는다(로그 전용 · WR-B03)", () => {
  const caught = async (p: Promise<unknown>): Promise<ApiError> => {
    try {
      await p;
    } catch (e) {
      return e as ApiError;
    }
    throw new Error("throw 하지 않았다");
  };

  it("RPC error → DB_ERROR + cause { code, message } · 메시지는 고정 문구", async () => {
    const { client } = makeSupabase({ rpcError: { code: "57014", message: "canceling statement due to statement timeout" } });
    const e = await caught(getLimitupReport(client, "u1"));
    expect(e).toBeInstanceOf(ApiError);
    expect(e.code).toBe("DB_ERROR");
    expect(e.message).toBe("상한가 보고서 조회에 실패했습니다.");
    expect(e.cause).toMatchObject({ code: "57014", message: "canceling statement due to statement timeout" });
  });

  it("응답 모양 위반 → cause 에 RPC 이름 · 타입", async () => {
    const { client } = makeSupabase({ rpcData: [] });
    const e = await caught(getLimitupReport(client, "u1"));
    expect(e.cause).toEqual({ reason: "limitup_report_for_user 모양 위반", type: "array" });
  });

  it("Storage 서명 실패 → cause 에 Storage 메시지 · 경로 수", async () => {
    const { client } = makeSupabase({
      rpcData: { access: true, isins: ["KR7000000001", "KR7000000002"] },
      signError: { message: "Bucket not found" },
    });
    const e = await caught(getLimitupGridUrls(client, "u1", "20261002"));
    expect(e.message).toBe("상한가 격자 주소 발급에 실패했습니다.");
    expect(e.cause).toEqual({ storage: "Bucket not found", count: 2 });
  });
});
