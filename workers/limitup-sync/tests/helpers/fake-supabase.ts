/**
 * 가짜 Supabase — 워커가 부르는 호출을 순서대로 기록하고 응답은 테스트가 정한다.
 *
 * 지원: `from(t).insert(rows)` · `from(t).select(cols).gte(col, v)` · `rpc(name, args)` ·
 * `storage.from(bucket).upload/list/remove`(28-06 격자 업로드 · 보존 정리용 자리 — 지금은 기록만).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type Call =
  | { kind: "insert"; table: string; rows: Record<string, unknown>[] }
  | { kind: "select"; table: string; cols: string; gte: [string, unknown] }
  | { kind: "rpc"; name: string; args: Record<string, unknown> }
  | { kind: "storage"; bucket: string; op: "upload" | "list" | "remove"; args: unknown[] };

type Resp = { data?: unknown; error?: { message: string } | null };

export type FakeOptions = {
  /** select 응답(표 이름별). 기본 `{ data: [], error: null }`. */
  select?: Record<string, Resp>;
  /** rpc 응답(이름별 — 함수면 args 로 계산). 기본 `{ data: null, error: null }`. */
  rpc?: Record<string, Resp | ((args: Record<string, unknown>) => Resp)>;
  /** insert 응답 — 함수면 (table, rows, n번째 insert) 로 계산. 기본 성공. */
  insert?: (table: string, rows: Record<string, unknown>[], n: number) => Resp;
};

export function makeFakeSupabase(opts: FakeOptions = {}): { sb: SupabaseClient; calls: Call[] } {
  const calls: Call[] = [];
  let inserts = 0;
  const done = (r: Resp | undefined, fallback: Resp) => Promise.resolve({ data: null, error: null, ...(r ?? fallback) });

  const sb = {
    from(table: string) {
      return {
        insert(rows: Record<string, unknown>[]) {
          calls.push({ kind: "insert", table, rows });
          inserts += 1;
          return done(opts.insert?.(table, rows, inserts), { error: null });
        },
        select(cols: string) {
          return {
            gte(col: string, v: unknown) {
              calls.push({ kind: "select", table, cols, gte: [col, v] });
              return done(opts.select?.[table], { data: [], error: null });
            },
          };
        },
      };
    },
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ kind: "rpc", name, args });
      const r = opts.rpc?.[name];
      return done(typeof r === "function" ? r(args) : r, { data: null, error: null });
    },
    storage: {
      from(bucket: string) {
        const rec = (op: "upload" | "list" | "remove") => (...args: unknown[]) => {
          calls.push({ kind: "storage", bucket, op, args });
          return done(undefined, { data: op === "list" ? [] : null, error: null });
        };
        return { upload: rec("upload"), list: rec("list"), remove: rec("remove") };
      },
    },
  };
  return { sb: sb as unknown as SupabaseClient, calls };
}
