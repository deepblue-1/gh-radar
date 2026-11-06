import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncStockFloat } from "../src/floatSync";
import { configureKiwoomRateLimiter, resetKiwoomRateLimiter } from "../src/kiwoom/rateLimiter";

/**
 * quick 261106-ldl — 유통주식수 야간 배치(JOB_MODE=float) 코어.
 * supabase mock 은 stocks range 페이지 조회와 stock_float upsert 를 기록만 하는 최소 객체,
 * kiwoom mock 은 body.stk_cd 로 응답을 고르는 post.
 */

type StockRow = { code: string; listing_shares: number | null };

type Rec = {
  stockCalls: { select?: string; eq: unknown[][]; not: unknown[][]; order: unknown[][]; range?: [number, number] }[];
  upserts: { table: string; rows: any[]; opts: unknown }[];
};

function makeSupabase(stocks: StockRow[]): { client: any; rec: Rec } {
  const rec: Rec = { stockCalls: [], upserts: [] };
  const client = {
    from(table: string) {
      if (table === "stocks") {
        const call: Rec["stockCalls"][number] = { eq: [], not: [], order: [] };
        rec.stockCalls.push(call);
        const b: any = {
          select(cols: string) {
            call.select = cols;
            return b;
          },
          eq(...args: unknown[]) {
            call.eq.push(args);
            return b;
          },
          not(...args: unknown[]) {
            call.not.push(args);
            return b;
          },
          order(...args: unknown[]) {
            call.order.push(args);
            return b;
          },
          range(from: number, to: number) {
            call.range = [from, to];
            return Promise.resolve({ data: stocks.slice(from, to + 1), error: null });
          },
        };
        return b;
      }
      return {
        upsert(rows: any[], opts: unknown) {
          rec.upserts.push({ table, rows, opts });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { client, rec };
}

type Ka = { flo_stk?: string; dstr_stk?: string; dstr_rt?: string };

function makeKiwoom(responses: Record<string, Ka | Error>) {
  const post = vi.fn(async (_url: string, body: { stk_cd: string }) => {
    const r = responses[body.stk_cd];
    if (r === undefined || r instanceof Error) throw r ?? new Error(`no fixture ${body.stk_cd}`);
    return {
      data: {
        return_code: 0,
        stk_cd: body.stk_cd,
        cur_prc: "+1000",
        open_pric: "1000",
        high_pric: "1000",
        low_pric: "1000",
        ...r,
      },
    };
  });
  return { client: { post } as any, post };
}

const TRADING_NOW = new Date("2026-11-06T12:30:00Z"); // 21:30 KST 금요일

const STOCKS: StockRow[] = [
  { code: "000660", listing_shares: null }, // listing 없음 → run 배수
  { code: "005930", listing_shares: 5969782660 },
  { code: "035720", listing_shares: 444000000 },
  { code: "069500", listing_shares: 12345000 }, // ETF
  { code: "999999", listing_shares: 1000000 }, // 실패
];

const RESPONSES: Record<string, Ka | Error> = {
  "000660": { flo_stk: "728002", dstr_stk: "500000", dstr_rt: "68.68" },
  "005930": { flo_stk: "5969783", dstr_stk: "4500000", dstr_rt: "75.38" },
  "035720": { flo_stk: "444000", dstr_stk: "300000", dstr_rt: "67.57" },
  "069500": { flo_stk: "12345", dstr_stk: "", dstr_rt: "" },
  "999999": new Error("network error"),
};

describe("syncStockFloat", () => {
  beforeEach(() => {
    configureKiwoomRateLimiter({ capacity: 1000, refillRatePerSec: 1000 });
    resetKiwoomRateLimiter();
  });

  it("페이지 조회 · 정규화 · 실패 격리 · 묶음 upsert", async () => {
    const { client: supabase, rec } = makeSupabase(STOCKS);
    const { client: kiwoom, post } = makeKiwoom(RESPONSES);
    const getToken = vi.fn(async () => "TOKEN");

    const out = await syncStockFloat({
      supabase,
      kiwoom,
      getToken,
      now: TRADING_NOW,
      pageSize: 2,
      upsertBatchSize: 2,
      retryAttempts: 1,
    });

    // universe: 2 + 2 + 1(짧은 페이지에서 멈춤)
    expect(rec.stockCalls.map((c) => c.range)).toEqual([[0, 1], [2, 3], [4, 5]]);
    const c0 = rec.stockCalls[0];
    expect(c0.select).toContain("listing_shares");
    expect(c0.eq).toContainEqual(["is_delisted", false]);
    expect(c0.not).toContainEqual(["security_group", "in", '("ELW","ETN")']);
    expect(c0.order).toContainEqual(["code", { ascending: true }]);

    expect(post).toHaveBeenCalledTimes(5);
    expect(out.universe).toBe(5);
    expect(out.failed).toBe(1);
    expect(out.ok).toBe(3);
    expect(out.nullCount).toBe(1);
    expect(out.aborted).toBe(false);
    expect(out.skipped).toBeNull();
    expect(out.multiplier).toBe(1000);
    expect(out.dateIso).toBe("2026-11-06");

    // upsert: stock_float · onConflict code · 4행 / 2 = 2묶음
    expect(rec.upserts).toHaveLength(2);
    for (const u of rec.upserts) {
      expect(u.table).toBe("stock_float");
      expect(u.opts).toEqual({ onConflict: "code" });
    }
    const rows = rec.upserts.flatMap((u) => u.rows);
    expect(out.upserted).toBe(4);
    const byCode = new Map(rows.map((r) => [r.code, r]));
    expect(byCode.has("999999")).toBe(false);
    expect(byCode.get("005930")).toMatchObject({ float_shares: 4500000000, listed_shares: 5969783000, float_rate: 75.38 });
    expect(byCode.get("069500")).toMatchObject({ float_shares: null, float_rate: null, listed_shares: 12345000 });
    expect(byCode.get("000660")).toMatchObject({ float_shares: 500000000, listed_shares: 728002000 });
    for (const r of rows) expect(r.as_of).toBe("2026-11-06");
  });

  it("연속 실패 차단기 → aborted · 남은 호출 중단", async () => {
    const many: StockRow[] = Array.from({ length: 50 }, (_, i) => ({
      code: String(100000 + i),
      listing_shares: 1000000,
    }));
    const { client: supabase, rec } = makeSupabase(many);
    const post = vi.fn(async () => {
      throw new Error("network error");
    });

    const out = await syncStockFloat({
      supabase,
      kiwoom: { post } as any,
      getToken: async () => "TOKEN",
      now: TRADING_NOW,
      concurrency: 4,
      maxConsecutiveFailures: 3,
      retryAttempts: 1,
    });

    expect(out.aborted).toBe(true);
    expect(post.mock.calls.length).toBeLessThanOrEqual(3 + 4);
    expect(rec.upserts).toHaveLength(0);
  });

  it("KRX 휴장일 → kiwoom · DB 호출 없음", async () => {
    const { client: supabase, rec } = makeSupabase(STOCKS);
    const { client: kiwoom, post } = makeKiwoom(RESPONSES);

    const out = await syncStockFloat({
      supabase,
      kiwoom,
      getToken: async () => "TOKEN",
      now: new Date("2026-12-25T12:30:00Z"),
    });

    expect(out.skipped).toBe("holiday");
    expect(post).not.toHaveBeenCalled();
    expect(rec.stockCalls).toHaveLength(0);
    expect(rec.upserts).toHaveLength(0);
  });
});

describe("resolveJobMode", () => {
  it("미설정 → intraday · float → float · 오타 → throw", async () => {
    const { resolveJobMode } = await import("../src/index");
    expect(resolveJobMode(undefined)).toBe("intraday");
    expect(resolveJobMode("")).toBe("intraday");
    expect(resolveJobMode("float")).toBe("float");
    expect(() => resolveJobMode("flaot")).toThrow();
  });
});
