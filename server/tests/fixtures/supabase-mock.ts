import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StockRow } from "../../src/mappers/stock";

type State = { stocks: StockRow[] };

export function mockSupabase(state: State): SupabaseClient {
  const makeBuilder = () => {
    let filtered: StockRow[] = [...state.stocks];
    let orderCol: string | null = null;
    let orderAsc = true;
    let limitN: number | null = null;

    const exec = () => {
      let rows = [...filtered];
      if (orderCol) {
        rows.sort((a, b) => {
          const av = Number((a as any)[orderCol!]) || 0;
          const bv = Number((b as any)[orderCol!]) || 0;
          return orderAsc ? av - bv : bv - av;
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
      then: (resolve: any) => resolve({ data: exec(), error: null }),
    };
    return builder;
  };

  return {
    from: vi.fn().mockImplementation(() => makeBuilder()),
  } as unknown as SupabaseClient;
}
