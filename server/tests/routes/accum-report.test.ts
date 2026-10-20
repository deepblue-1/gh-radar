import { describe, it, expect } from "vitest";
import request from "supertest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createApp } from "../../src/app";
import { ApiError } from "../../src/errors";
import { getAccumDetail, getAccumReport } from "../../src/services/accum-report";

/**
 * `GET /api/accum/report` · `GET /api/accum/report/:date/:isin` — 매집감지 보고서 조회 (Phase 34 D-06 · D-07).
 *
 * server 는 경로마다 RPC(`accum_report_for_user` · `accum_detail_for_user`)를 **왕복 1회** 부른다. 게이트(dma_visible_accounts)와
 * 날짜 규칙은 RPC 안이 정본이라 mock 은 흉내 내지 않고 **무엇을 넘겼는지**만 기록한다(teamflow-report.test.ts 와 같은 최소 mock).
 * 행은 10/14 실측 픽스처(workers/limitup-sync/tests/fixtures/accum_flow · 34-01) — export 행 모양이 그대로 통과하는지 본다.
 */

const AF_FIXTURE = join(
  __dirname,
  "../../../workers/limitup-sync/tests/fixtures/accum_flow/20261014/accum_flow.ndjson.gz",
);
const fixtureRows = gunzipSync(readFileSync(AF_FIXTURE))
  .toString("utf8")
  .split("\n")
  .filter((l) => l.trim() !== "")
  .map((l) => JSON.parse(l) as Record<string, unknown>);

const CXI = "KYG2114A1094";
const cxiRow = fixtureRows.find((r) => r.isin === CXI)!;
/** 목록 행 = payload 키 없는 평평한 열(RPC 가 37열 명시 서브쿼리로 만든다). */
const listRows = fixtureRows.map(({ payload: _p, ...flat }) => flat);

let userSeq = 0;
const nextUser = () => ({ id: `00000000-0000-4000-8000-${String(3400 + ++userSeq).padStart(12, "0")}` });

type Rec = { rpcCalls: { fn: string; params: Record<string, unknown> }[] };

function makeSupabase(opts: {
  user?: { id: string } | null;
  /** 목록 RPC data 그대로. */
  listData?: unknown;
  /** 상세 RPC data 그대로. */
  detailData?: unknown;
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
      if (fn === "accum_report_for_user") return { data: opts.listData ?? null, error: null };
      if (fn === "accum_detail_for_user") return { data: opts.detailData ?? null, error: null };
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    },
    from() {
      throw new Error("server 는 표를 from() 으로 읽지 않는다 — RPC 만");
    },
  };
  return { client, rec };
}

const auth = (r: request.Test) => r.set("Authorization", "Bearer tok");

const LIST = "/api/accum/report";
const detailPath = (date: string, isin: string) => `/api/accum/report/${date}/${isin}`;

/** RPC 가 돌려주는 하루 목록 — 행 키 snake_case · payload 없음. */
const dayList = { access: true, dates: ["20261014", "20261013"], date: "20261014", rows: listRows };
/** RPC 가 돌려주는 한 종목 상세 — 평평한 열 + payload(cycles · pnl 등) 그대로. */
const cxiDetail = { access: true, row: cxiRow };

describe("GET /api/accum/report · /report/:date/:isin (Phase 34 D-06 · D-07)", () => {
  it("① 미인증 → 401 · RPC 0회 (두 경로)", async () => {
    for (const path of [LIST, detailPath("20261014", CXI)]) {
      const { client, rec } = makeSupabase({ user: nextUser() });
      const r = await request(createApp({ supabase: client })).get(path);
      expect(r.status, path).toBe(401);
      expect(r.body.error.code, path).toBe("UNAUTHENTICATED");
      expect(rec.rpcCalls, path).toHaveLength(0);
    }
  });

  it("② 형식 위반 · 실재 아닌 날짜 · 잘못된 isin → 400 VALIDATION_FAILED · RPC 0회", async () => {
    const bads = [
      `${LIST}?d=2026101`,
      `${LIST}?d=20260230`,
      `${LIST}?d=2026-10-14`,
      detailPath("20260230", CXI),
      detailPath("2026101", CXI),
      detailPath("20261014", "kr7000650002"), // 소문자
      detailPath("20261014", "KR700065000"), // 11자
      detailPath("20261014", "KR70006500021"), // 13자
      detailPath("20261014", "KR700065000-"),
    ];
    for (const path of bads) {
      const { client, rec } = makeSupabase({ user: nextUser() });
      const r = await auth(request(createApp({ supabase: client })).get(path));
      expect(r.status, path).toBe(400);
      expect(r.body.error.code, path).toBe("VALIDATION_FAILED");
      expect(rec.rpcCalls, path).toHaveLength(0);
    }
  });

  it("③ 목록 RPC 정확히 1회 · accum_report_for_user {p_user_id: 인증 사용자, p_date} · 생략 = null · 쿼리 user_id 무시", async () => {
    const user = nextUser();
    const { client, rec } = makeSupabase({ user, listData: dayList });
    const r = await auth(request(createApp({ supabase: client })).get(`${LIST}?d=20261014`));
    expect(r.status).toBe(200);
    expect(rec.rpcCalls).toEqual([{ fn: "accum_report_for_user", params: { p_user_id: user.id, p_date: "20261014" } }]);

    const user2 = nextUser();
    const other = nextUser();
    const b = makeSupabase({ user: user2, listData: dayList });
    const r2 = await auth(
      request(createApp({ supabase: b.client })).get(`${LIST}?user_id=${other.id}&p_user_id=${other.id}`),
    );
    expect(r2.status).toBe(200);
    expect(b.rec.rpcCalls).toEqual([{ fn: "accum_report_for_user", params: { p_user_id: user2.id, p_date: null } }]);
  });

  it("③ 상세 RPC 정확히 1회 · accum_detail_for_user {p_user_id, p_date, p_isin} — 비 KR ISIN KYG2114A1094 200", async () => {
    const user = nextUser();
    const { client, rec } = makeSupabase({ user, detailData: cxiDetail });
    const r = await auth(request(createApp({ supabase: client })).get(detailPath("20261014", CXI)));
    expect(r.status).toBe(200);
    expect(rec.rpcCalls).toEqual([
      { fn: "accum_detail_for_user", params: { p_user_id: user.id, p_date: "20261014", p_isin: CXI } },
    ]);
  });

  it("④ 200 본문 snake_case 그대로 — 목록 pos_net_krw(payload 없음) · 상세 payload.cycles", async () => {
    const a = makeSupabase({ user: nextUser(), listData: dayList });
    const r = await auth(request(createApp({ supabase: a.client })).get(`${LIST}?d=20261014`));
    expect(r.status).toBe(200);
    expect(r.body).toEqual(dayList);
    expect(r.body.rows).toHaveLength(6);
    expect(r.body.rows[0].pos_net_krw).toBe(162312900);
    expect("payload" in r.body.rows[0]).toBe(false);

    const b = makeSupabase({ user: nextUser(), detailData: cxiDetail });
    const r2 = await auth(request(createApp({ supabase: b.client })).get(detailPath("20261014", CXI)));
    expect(r2.status).toBe(200);
    expect(r2.body).toEqual(cxiDetail);
    expect(r2.body.row.pos_net_krw).toBe(162312900);
    expect(Array.isArray(r2.body.row.payload.cycles)).toBe(true);
    expect(r2.body.row.payload.cycles[0].pos_reg_px).toBe(205500);
  });

  it("⑤ 빈 이력 {access:true, dates:[], date:null, rows:[]} 200 그대로 · 상세 row: null 200 그대로", async () => {
    const empty = { access: true, dates: [], date: null, rows: [] };
    const a = makeSupabase({ user: nextUser(), listData: empty });
    const r = await auth(request(createApp({ supabase: a.client })).get(LIST));
    expect(r.status).toBe(200);
    expect(r.body).toEqual(empty);

    const missing = { access: true, row: null };
    const b = makeSupabase({ user: nextUser(), detailData: missing });
    const r2 = await auth(request(createApp({ supabase: b.client })).get(detailPath("20261014", "KR7000650002")));
    expect(r2.status).toBe(200);
    expect(r2.body).toEqual(missing);
  });

  it("⑥ RPC {access:false} → 403 DMA_UNMAPPED (두 경로) · RPC 1회", async () => {
    for (const path of [LIST, detailPath("20261014", CXI)]) {
      const { client, rec } = makeSupabase({
        user: nextUser(),
        listData: { access: false },
        detailData: { access: false },
      });
      const r = await auth(request(createApp({ supabase: client })).get(path));
      expect(r.status, path).toBe(403);
      expect(r.body.error.code, path).toBe("DMA_UNMAPPED");
      expect(rec.rpcCalls, path).toHaveLength(1);
    }
  });

  it("⑦ RPC error → 500 DB_ERROR · 원문 비노출 (두 경로)", async () => {
    for (const path of [LIST, detailPath("20261014", CXI)]) {
      const { client } = makeSupabase({ user: nextUser(), rpcError: { message: "relation secret_table does not exist" } });
      const r = await auth(request(createApp({ supabase: client })).get(path));
      expect(r.status, path).toBe(500);
      expect(r.body.error.code, path).toBe("DB_ERROR");
      expect(JSON.stringify(r.body), path).not.toContain("secret_table");
    }
  });

  it("⑧ 모양 위반 → 500 DB_ERROR — 비객체 · access 누락/문자열 · rows/dates 비배열 · row 가 수/배열/누락", async () => {
    const listBads = [
      null,
      [],
      "x",
      {},
      { access: "true", dates: [], date: null, rows: [] },
      { access: true, dates: null, date: null, rows: [] },
      { access: true, dates: [], date: null, rows: {} },
      { access: true, dates: [], date: null },
    ];
    for (const bad of listBads) {
      const { client } = makeSupabase({ user: nextUser(), listData: bad });
      const r = await auth(request(createApp({ supabase: client })).get(LIST));
      expect(r.status, JSON.stringify(bad)).toBe(500);
      expect(r.body.error.code, JSON.stringify(bad)).toBe("DB_ERROR");
    }
    const detailBads = [null, [], "x", {}, { access: "true", row: null }, { access: true, row: 1 }, { access: true, row: [] }, { access: true }];
    for (const bad of detailBads) {
      const { client } = makeSupabase({ user: nextUser(), detailData: bad });
      const r = await auth(request(createApp({ supabase: client })).get(detailPath("20261014", CXI)));
      expect(r.status, JSON.stringify(bad)).toBe(500);
      expect(r.body.error.code, JSON.stringify(bad)).toBe("DB_ERROR");
    }
  });
});

describe("매집감지 서비스 — DB 원인을 cause 로 싣는다(로그 전용)", () => {
  const caught = async (p: Promise<unknown>): Promise<ApiError> => {
    try {
      await p;
    } catch (e) {
      return e as ApiError;
    }
    throw new Error("throw 하지 않았다");
  };

  it("RPC error → DB_ERROR + cause { code } · 메시지는 고정 문구", async () => {
    const { client } = makeSupabase({ rpcError: { code: "42883", message: "function accum_report_for_user does not exist" } });
    for (const p of [getAccumReport(client, "u1"), getAccumDetail(client, "u1", "20261014", CXI)]) {
      const e = await caught(p);
      expect(e).toBeInstanceOf(ApiError);
      expect(e.code).toBe("DB_ERROR");
      expect(e.message).toBe("매집감지 보고서 조회에 실패했습니다.");
      expect(e.cause).toMatchObject({ code: "42883" });
    }
  });

  it("모양 위반 → cause 에 RPC 이름 · 필드 · 타입", async () => {
    const a = makeSupabase({ listData: { access: true, dates: [], rows: {} } });
    expect((await caught(getAccumReport(a.client, "u1"))).cause).toEqual({
      reason: "accum_report_for_user.rows 모양 위반",
      type: "object",
    });
    const b = makeSupabase({ detailData: { access: true, row: 7 } });
    expect((await caught(getAccumDetail(b.client, "u1", "20261014", CXI))).cause).toEqual({
      reason: "accum_detail_for_user.row 모양 위반",
      type: "number",
    });
  });
});
