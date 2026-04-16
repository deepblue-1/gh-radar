import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StockRow, StockMasterRow, StockQuoteRow } from "../../src/mappers/stock";

type TopMoverRow = {
  code: string;
  rank: number;
  ranked_at: string;
  scan_id?: string;
};

type State = {
  stocks?: StockRow[];
  masters?: StockMasterRow[];
  quotes?: StockQuoteRow[];
  topMovers?: TopMoverRow[];
  upserts?: { table: string; rows: any[] }[];
};

export function mockSupabase(state: State): SupabaseClient {
  const upsertCalls: { table: string; rows: any[] }[] = [];
  state.upserts = upsertCalls;

  const datasetFor = (t: string): any[] => {
    if (t === "stocks") return state.stocks ?? state.masters ?? [];
    if (t === "stock_quotes") return state.quotes ?? [];
    if (t === "top_movers") return state.topMovers ?? [];
    return [];
  };

  const makeBuilder = (table: string) => {
    let filtered: any[] = [...datasetFor(table)];
    let orderCol: string | null = null;
    let orderAsc = true;
    let limitN: number | null = null;

    const exec = () => {
      let rows = [...filtered];
      if (orderCol) {
        rows.sort((a, b) => {
          const av = (a as any)[orderCol!];
          const bv = (b as any)[orderCol!];
          if (typeof av === "string" && typeof bv === "string")
            return orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
          const an = Number(av) || 0;
          const bn = Number(bv) || 0;
          return orderAsc ? an - bn : bn - an;
        });
      }
      if (limitN != null) rows = rows.slice(0, limitN);
      return rows;
    };

    const builder: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockImplementation((col: string, val: unknown) => {
        filtered = filtered.filter((r) => (r as any)[col] === val);
        return builder;
      }),
      gte: vi.fn().mockImplementation((col: string, val: number) => {
        filtered = filtered.filter(
          (r) => Number((r as any)[col]) >= Number(val),
        );
        return builder;
      }),
      in: vi.fn().mockImplementation((col: string, vals: any[]) => {
        const set = new Set(vals);
        filtered = filtered.filter((r) => set.has((r as any)[col]));
        return builder;
      }),
      or: vi.fn().mockImplementation((expr: string) => {
        const parts = expr.split(",");
        const patterns = parts
          .map((p) => {
            const m = p.match(/^(\w+)\.ilike\.%(.*)%$/);
            return m ? { col: m[1], q: m[2].toLowerCase() } : null;
          })
          .filter(Boolean) as { col: string; q: string }[];
        filtered = filtered.filter((r) =>
          patterns.some((p) =>
            String((r as any)[p.col]).toLowerCase().includes(p.q),
          ),
        );
        return builder;
      }),
      order: vi
        .fn()
        .mockImplementation((col: string, opts?: { ascending?: boolean }) => {
          orderCol = col;
          orderAsc = opts?.ascending ?? true;
          return builder;
        }),
      limit: vi.fn().mockImplementation((n: number) => {
        limitN = n;
        return builder;
      }),
      maybeSingle: vi.fn().mockImplementation(async () => {
        const rows = exec();
        return { data: rows[0] ?? null, error: null };
      }),
      upsert: vi.fn().mockImplementation((rows: any) => {
        const arr = Array.isArray(rows) ? rows : [rows];
        upsertCalls.push({ table, rows: arr });
        if (table === "stock_quotes") {
          const existing = state.quotes ?? (state.quotes = []);
          for (const r of arr) {
            const i = existing.findIndex((x) => x.code === r.code);
            if (i >= 0) existing[i] = r as StockQuoteRow;
            else existing.push(r as StockQuoteRow);
          }
        }
        return Promise.resolve({ error: null, data: arr });
      }),
      then: (resolve: any) => resolve({ data: exec(), error: null }),
    };
    return builder;
  };

  return {
    from: vi.fn().mockImplementation((table: string) => makeBuilder(table)),
  } as unknown as SupabaseClient;
}

// kisClient mock -- inquirePrice 흐름 테스트용
export function mockKisClient(
  impl: (code: string) => Promise<any>,
): any {
  return {
    get: vi.fn().mockImplementation(async (_path: string, opts: any) => {
      const code = opts?.params?.fid_input_iscd;
      const output = await impl(code);
      return { data: { rt_cd: "0", msg_cd: "MCA00000", msg1: "OK", output } };
    }),
  };
}
