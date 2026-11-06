import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";

/**
 * quick 261106-ldl — `GET /api/stocks/:code/float` · `GET /api/stocks/float` (gh-trade 호가창 「발행1%」).
 *
 * 두 라우트 모두 DB 왕복 1회(단일 = stocks + stock_float embed, 전 종목 = RPC stock_float_all)이고 키움을
 * 부르지 않는다. mock 은 무엇을 불렀는지만 기록하는 최소 객체(limitup-report.test.ts 와 같은 모양).
 */

type Rec = {
  fromCalls: { table: string; cols?: string; eqCol?: string; eqVal?: unknown }[];
  rpcCalls: { fn: string; params?: unknown }[];
};

function makeSupabase(opts: {
  /** stocks maybeSingle data (null = 종목 없음). */
  row?: unknown;
  rowError?: { message: string };
  rpcData?: unknown;
  rpcError?: { message: string };
}): { client: any; rec: Rec } {
  const rec: Rec = { fromCalls: [], rpcCalls: [] };
  const client = {
    from(table: string) {
      const call: Rec["fromCalls"][number] = { table };
      rec.fromCalls.push(call);
      const builder = {
        select(cols: string) {
          call.cols = cols;
          return builder;
        },
        eq(col: string, val: unknown) {
          call.eqCol = col;
          call.eqVal = val;
          return builder;
        },
        async maybeSingle() {
          if (opts.rowError) return { data: null, error: opts.rowError };
          return { data: opts.row ?? null, error: null };
        },
      };
      return builder;
    },
    async rpc(fn: string, params?: unknown) {
      rec.rpcCalls.push({ fn, params });
      if (opts.rpcError) return { data: null, error: opts.rpcError };
      return { data: opts.rpcData ?? null, error: null };
    },
  };
  return { client, rec };
}

const floatRow = { float_shares: 4500000000, float_rate: "75.38", listed_shares: 5969783000, as_of: "2026-11-06" };

describe("GET /api/stocks/:code/float", () => {
  it("배치 행 있음 → 200 + Cache-Control + 왕복 1회", async () => {
    const { client, rec } = makeSupabase({ row: { code: "005930", stock_float: floatRow } });
    const res = await request(createApp({ supabase: client })).get("/api/stocks/005930/float");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      code: "005930",
      floatShares: 4500000000,
      floatRate: 75.38,
      listedShares: 5969783000,
      asOf: "2026-11-06",
    });
    expect(res.headers["cache-control"]).toContain("public");
    expect(res.headers["cache-control"]).toContain("max-age=3600");
    expect(rec.fromCalls).toHaveLength(1);
    expect(rec.fromCalls[0].table).toBe("stocks");
    expect(rec.fromCalls[0].cols).toContain("stock_float(");
    expect(rec.fromCalls[0].eqVal).toBe("005930");
    expect(rec.rpcCalls).toHaveLength(0);
  });

  it("embed 가 배열 모양이어도 같은 응답", async () => {
    const { client } = makeSupabase({ row: { code: "005930", stock_float: [floatRow] } });
    const res = await request(createApp({ supabase: client })).get("/api/stocks/005930/float");
    expect(res.status).toBe(200);
    expect(res.body.floatShares).toBe(4500000000);
    expect(res.body.floatRate).toBe(75.38);
    expect(res.body.asOf).toBe("2026-11-06");
  });

  it.each([null, []])("stocks 에는 있고 embed %j → 200 + 네 값 null", async (embed) => {
    const { client } = makeSupabase({ row: { code: "069500", stock_float: embed } });
    const res = await request(createApp({ supabase: client })).get("/api/stocks/069500/float");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      code: "069500",
      floatShares: null,
      floatRate: null,
      listedShares: null,
      asOf: null,
    });
  });

  it("stocks 에 없음 → 404 STOCK_NOT_FOUND", async () => {
    const { client } = makeSupabase({ row: null });
    const res = await request(createApp({ supabase: client })).get("/api/stocks/999999/float");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("STOCK_NOT_FOUND");
  });

  it("형식 위반 코드 → 400", async () => {
    const { client, rec } = makeSupabase({ row: null });
    const res = await request(createApp({ supabase: client })).get("/api/stocks/ab$c/float");
    expect(res.status).toBe(400);
    expect(rec.fromCalls).toHaveLength(0);
  });
});

describe("GET /api/stocks/float", () => {
  const FIELDS = ["floatShares", "floatRate", "listedShares"];

  it("RPC 1회 → 압축 JSON + Cache-Control · from 0회", async () => {
    const rows = { "005930": [4500000000, 75.38, 5969783000], "069500": [null, null, 12345000] };
    const { client, rec } = makeSupabase({ rpcData: { asOf: "2026-11-06", rows } });
    const res = await request(createApp({ supabase: client })).get("/api/stocks/float");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ asOf: "2026-11-06", fields: FIELDS, rows });
    expect(res.headers["cache-control"]).toContain("public");
    expect(res.headers["cache-control"]).toContain("max-age=3600");
    expect(rec.rpcCalls).toHaveLength(1);
    expect(rec.rpcCalls[0].fn).toBe("stock_float_all");
    expect(rec.fromCalls).toHaveLength(0);
  });

  it.each([{ asOf: null, rows: {} }, null])("빈 표(%j) → asOf null · rows {}", async (rpcData) => {
    const { client } = makeSupabase({ rpcData });
    const res = await request(createApp({ supabase: client })).get("/api/stocks/float");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ asOf: null, fields: FIELDS, rows: {} });
  });

  it("rpc error → 500", async () => {
    const { client } = makeSupabase({ rpcError: { message: "boom" } });
    const res = await request(createApp({ supabase: client })).get("/api/stocks/float");
    expect(res.status).toBe(500);
  });
});
