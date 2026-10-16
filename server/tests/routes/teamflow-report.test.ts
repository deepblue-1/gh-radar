import { describe, it, expect } from "vitest";
import request from "supertest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createApp } from "../../src/app";
import { ApiError } from "../../src/errors";
import { getTeamflowReport } from "../../src/services/teamflow-report";

/**
 * `GET /api/teamflow/report` — 팀 매집 보고서 조회 (Phase 33 D-05 · D-07).
 *
 * server 는 RPC `teamflow_report_for_user` 를 **왕복 1회** 부른다. 게이트(dma_visible_accounts)와 날짜 규칙은 RPC 안이
 * 정본이라 mock 은 흉내 내지 않고 **무엇을 넘겼는지**만 기록한다(limitup-report.test.ts 와 같은 모양의 최소 mock).
 * 행은 10/14 실측 픽스처(workers/limitup-sync/tests/fixtures/team_flow) 첫 줄 — export 행 모양이 그대로 통과하는지 본다.
 */

const TF_FIXTURE = join(
  __dirname,
  "../../../workers/limitup-sync/tests/fixtures/team_flow/20261014/team_flow.ndjson.gz",
);
const fixtureRows = gunzipSync(readFileSync(TF_FIXTURE))
  .toString("utf8")
  .split("\n")
  .filter((l) => l.trim() !== "")
  .map((l) => JSON.parse(l) as Record<string, unknown>);

let userSeq = 0;
const nextUser = () => ({ id: `00000000-0000-4000-8000-${String(3300 + ++userSeq).padStart(12, "0")}` });

type Rec = { rpcCalls: { fn: string; params: Record<string, unknown> }[] };

function makeSupabase(opts: {
  user?: { id: string } | null;
  /** RPC data 그대로. */
  rpcData?: unknown;
  rpcError?: { message: string; code?: string };
}): { client: any; rec: Rec } {
  const rec: Rec = { rpcCalls: [] };
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
      if (fn === "teamflow_report_for_user") return { data: opts.rpcData ?? null, error: null };
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    },
  };
  return { client, rec };
}

const auth = (r: request.Test) => r.set("Authorization", "Bearer tok");

/** RPC 가 돌려주는 하루 번들 — 행 키 snake_case · payload 중첩 그대로 통과해야 한다. */
const dayReport = {
  access: true,
  dates: ["20261014", "20261013"],
  date: "20261014",
  rows: [fixtureRows[0]],
};

describe("GET /api/teamflow/report (Phase 33 D-05 · D-07)", () => {
  it("① 미인증 → 401 · RPC 0회", async () => {
    const { client, rec } = makeSupabase({ user: nextUser() });
    const r = await request(createApp({ supabase: client })).get("/api/teamflow/report");
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("UNAUTHENTICATED");
    expect(rec.rpcCalls).toHaveLength(0);
  });

  it("② 형식 위반 d(2026101 · 2026-10-14 · abc) · 날짜 아닌 값(20260230 · 20261340) → 400 VALIDATION_FAILED · RPC 0회", async () => {
    for (const bad of ["2026101", "2026-10-14", "abc", "20260230", "20261340"]) {
      const { client, rec } = makeSupabase({ user: nextUser() });
      const r = await auth(request(createApp({ supabase: client })).get(`/api/teamflow/report?d=${bad}`));
      expect(r.status, bad).toBe(400);
      expect(r.body.error.code, bad).toBe("VALIDATION_FAILED");
      expect(rec.rpcCalls, bad).toHaveLength(0);
    }
  });

  it("③ RPC 정확히 1회 · 이름 teamflow_report_for_user · {p_user_id: 인증 사용자, p_date} · 생략 = null · 쿼리 user_id 무시", async () => {
    const user = nextUser();
    const { client, rec } = makeSupabase({ user, rpcData: dayReport });
    const r = await auth(request(createApp({ supabase: client })).get("/api/teamflow/report?d=20261014"));
    expect(r.status).toBe(200);
    expect(rec.rpcCalls).toEqual([{ fn: "teamflow_report_for_user", params: { p_user_id: user.id, p_date: "20261014" } }]);

    const user2 = nextUser();
    const other = nextUser();
    const b = makeSupabase({ user: user2, rpcData: dayReport });
    const r2 = await auth(
      request(createApp({ supabase: b.client })).get(`/api/teamflow/report?user_id=${other.id}&p_user_id=${other.id}`),
    );
    expect(r2.status).toBe(200);
    expect(b.rec.rpcCalls).toEqual([{ fn: "teamflow_report_for_user", params: { p_user_id: user2.id, p_date: null } }]);
  });

  it("④ 하루 번들 200 그대로 — 행 키 snake_case(team_net_val · payload.bands) 유지", async () => {
    const { client } = makeSupabase({ user: nextUser(), rpcData: dayReport });
    const r = await auth(request(createApp({ supabase: client })).get("/api/teamflow/report?d=20261014"));
    expect(r.status).toBe(200);
    expect(r.body).toEqual(dayReport);
    const row = r.body.rows[0];
    expect(typeof row.team_net_val).toBe("number");
    expect(Array.isArray(row.payload.bands)).toBe(true);
    expect(row.payload.bands.at(-1).label).toBe("하루 합계");
    expect(Array.isArray(row.payload.summary_lines)).toBe(true);
  });

  it("⑤ 적재 이력 0 {access:true, dates:[], date:null, rows:[]} → 200 그대로(빈 상태 원천)", async () => {
    const data = { access: true, dates: [], date: null, rows: [] };
    const { client } = makeSupabase({ user: nextUser(), rpcData: data });
    const r = await auth(request(createApp({ supabase: client })).get("/api/teamflow/report"));
    expect(r.status).toBe(200);
    expect(r.body).toEqual(data);
  });

  it("⑥ RPC {access:false} → 403 DMA_UNMAPPED", async () => {
    const { client, rec } = makeSupabase({ user: nextUser(), rpcData: { access: false } });
    const r = await auth(request(createApp({ supabase: client })).get("/api/teamflow/report"));
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("DMA_UNMAPPED");
    expect(rec.rpcCalls).toHaveLength(1);
  });

  it("⑦ RPC error → 500 DB_ERROR · 원문 비노출", async () => {
    const { client } = makeSupabase({ user: nextUser(), rpcError: { message: "relation secret_table does not exist" } });
    const r = await auth(request(createApp({ supabase: client })).get("/api/teamflow/report"));
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe("DB_ERROR");
    expect(JSON.stringify(r.body)).not.toContain("secret_table");
  });

  it("⑧ 결과가 객체가 아니면(null · 배열 · 문자열) → 500 DB_ERROR", async () => {
    for (const bad of [null, [], "x"]) {
      const { client } = makeSupabase({ user: nextUser(), rpcData: bad });
      const r = await auth(request(createApp({ supabase: client })).get("/api/teamflow/report"));
      expect(r.status, JSON.stringify(bad)).toBe(500);
      expect(r.body.error.code).toBe("DB_ERROR");
    }
  });

  it("⑨ 모양 위반은 403 이 아니라 500 DB_ERROR — access 누락 · 문자열 · dates/rows 가 배열 아님 (IN-01)", async () => {
    const bads = [
      {},
      { access: "true", dates: [], date: null, rows: [] },
      { access: null, dates: [], date: null, rows: [] },
      { access: true, date: null, rows: [] },
      { access: true, dates: null, date: null, rows: [] },
      { access: true, dates: [], date: null },
      { access: true, dates: [], date: null, rows: {} },
    ];
    for (const bad of bads) {
      const { client } = makeSupabase({ user: nextUser(), rpcData: bad });
      const r = await auth(request(createApp({ supabase: client })).get("/api/teamflow/report"));
      expect(r.status, JSON.stringify(bad)).toBe(500);
      expect(r.body.error.code, JSON.stringify(bad)).toBe("DB_ERROR");
    }
  });
});

describe("팀 매집 서비스 — DB 원인을 cause 로 싣는다(로그 전용)", () => {
  const caught = async (p: Promise<unknown>): Promise<ApiError> => {
    try {
      await p;
    } catch (e) {
      return e as ApiError;
    }
    throw new Error("throw 하지 않았다");
  };

  it("RPC error → DB_ERROR + cause { code, message } · 메시지는 고정 문구", async () => {
    const { client } = makeSupabase({ rpcError: { code: "42883", message: "function teamflow_report_for_user does not exist" } });
    const e = await caught(getTeamflowReport(client, "u1"));
    expect(e).toBeInstanceOf(ApiError);
    expect(e.code).toBe("DB_ERROR");
    expect(e.message).toBe("팀 매집 보고서 조회에 실패했습니다.");
    expect(e.cause).toMatchObject({ code: "42883" });
  });

  it("응답 모양 위반 → cause 에 RPC 이름 · 타입", async () => {
    const { client } = makeSupabase({ rpcData: [] });
    const e = await caught(getTeamflowReport(client, "u1"));
    expect(e.cause).toEqual({ reason: "teamflow_report_for_user 모양 위반", type: "array" });
  });

  it("access · dates · rows 모양 위반 → cause 에 어느 필드인지 · 타입 (IN-01)", async () => {
    const cases: [unknown, unknown][] = [
      [{ access: "true" }, { reason: "teamflow_report_for_user.access 모양 위반", type: "string" }],
      [{ access: true, dates: null, rows: [] }, { reason: "teamflow_report_for_user.dates 모양 위반", type: "null" }],
      [{ access: true, dates: [], rows: {} }, { reason: "teamflow_report_for_user.rows 모양 위반", type: "object" }],
    ];
    for (const [rpcData, cause] of cases) {
      const { client } = makeSupabase({ rpcData });
      const e = await caught(getTeamflowReport(client, "u1"));
      expect(e.code).toBe("DB_ERROR");
      expect(e.cause).toEqual(cause);
    }
  });
});
