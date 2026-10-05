/**
 * 가짜 Supabase — 워커가 부르는 호출을 순서대로 기록하고 응답은 테스트가 정한다.
 *
 * 지원: `from(t).insert(rows)` · `from(t).select(cols).gte(col, v)` · `from(t).update(values).eq(col, v)` · `rpc(name, args)` ·
 * `storage.from(bucket).upload/list/remove`(28-06 격자 업로드 · 보존 정리 — 응답은 `storage` 주입, 기본 성공 ·
 * list 는 빈 배열).
 *
 * 28-06 기본 응답: `limitup_purge_old` → `{ cutoff, alloc_cutoff, deleted: {} }` · `dma_strategy_events_purge_limit_feature`
 * → 0(실 RPC 가 늘 돌려주는 모양 — 정리 단계가 null 을 오류로 본다). `rpc` 키로 덮을 수 있다.
 *
 * 28-16 주입 자리(dispatch.test): `loads`(= limitup_loads select 응답 행) · `recordSkip`(= limitup_record_skip
 * 반환 streak — 함수면 args 로 계산). 같은 이름의 `select` · `rpc` 키를 주면 그쪽이 이긴다.
 * insert error 는 기존 `insert` 자리 그대로.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type Call =
  | { kind: "insert"; table: string; rows: Record<string, unknown>[] }
  | { kind: "select"; table: string; cols: string; gte: [string, unknown] }
  | { kind: "update"; table: string; values: Record<string, unknown>; eq: [string, unknown] }
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
  /** update 응답(표 이름별). 기본 성공. */
  update?: Record<string, Resp>;
  /** `limitup_loads` select 응답 행(이력). `select.limitup_loads` 가 있으면 그쪽이 이긴다. */
  loads?: LoadRow[];
  /** `limitup_record_skip` 반환 streak. `rpc.limitup_record_skip` 이 있으면 그쪽이 이긴다. */
  recordSkip?: number | ((args: Record<string, unknown>) => number);
  /** storage 응답(28-06) — (bucket, op, args) 로 계산. undefined 를 돌려주면 기본(성공 · list 는 []). */
  storage?: (bucket: string, op: "upload" | "list" | "remove", args: unknown[]) => Resp | undefined;
};

export type LoadRow = { date: string; files_sig: string | null; skip_streak: number };

export function makeFakeSupabase(opts: FakeOptions = {}): { sb: SupabaseClient; calls: Call[] } {
  const calls: Call[] = [];
  let inserts = 0;
  const select: Record<string, Resp> = { ...(opts.loads ? { limitup_loads: { data: opts.loads } } : {}), ...opts.select };
  const rs = opts.recordSkip;
  const rpcs: NonNullable<FakeOptions["rpc"]> = {
    limitup_purge_old: { data: { cutoff: "", alloc_cutoff: "", deleted: {} } },
    dma_strategy_events_purge_limit_feature: { data: 0 },
    ...(rs === undefined
      ? {}
      : { limitup_record_skip: (args: Record<string, unknown>) => ({ data: typeof rs === "function" ? rs(args) : rs }) }),
    ...opts.rpc,
  };
  const done = (r: Resp | undefined, fallback: Resp) => Promise.resolve({ data: null, error: null, ...(r ?? fallback) });

  const sb = {
    from(table: string) {
      return {
        insert(rows: Record<string, unknown>[]) {
          calls.push({ kind: "insert", table, rows });
          inserts += 1;
          return done(opts.insert?.(table, rows, inserts), { error: null });
        },
        update(values: Record<string, unknown>) {
          return {
            eq(col: string, v: unknown) {
              calls.push({ kind: "update", table, values, eq: [col, v] });
              return done(opts.update?.[table], { error: null });
            },
          };
        },
        select(cols: string) {
          return {
            gte(col: string, v: unknown) {
              calls.push({ kind: "select", table, cols, gte: [col, v] });
              return done(select[table], { data: [], error: null });
            },
          };
        },
      };
    },
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ kind: "rpc", name, args });
      const r = rpcs[name];
      return done(typeof r === "function" ? r(args) : r, { data: null, error: null });
    },
    storage: {
      from(bucket: string) {
        const rec = (op: "upload" | "list" | "remove") => (...args: unknown[]) => {
          calls.push({ kind: "storage", bucket, op, args });
          return done(opts.storage?.(bucket, op, args), { data: op === "list" ? [] : null, error: null });
        };
        return { upload: rec("upload"), list: rec("list"), remove: rec("remove") };
      },
    },
  };
  return { sb: sb as unknown as SupabaseClient, calls };
}
