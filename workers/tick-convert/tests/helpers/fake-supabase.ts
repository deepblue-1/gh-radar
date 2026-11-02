/**
 * 가짜 Supabase — 워커가 부르는 rpc · storage 호출을 순서대로 기록하고 응답은 테스트가 정한다(limitup-sync 꼴 · tick 전용).
 *
 * tick RPC 기본 응답(37-04 실제 반환 모양):
 *   tick_request_claim → [] · tick_request_finish → p_results 길이 · tick_grid_upsert → p_rows 길이 ·
 *   tick_convert_run_record → 1 · tick_convert_runs_since → [] · tick_convert_candidates → {accum: [], live16: []} ·
 *   tick_purge_old → {cutoff: "", grids: 0, requests: 0, runs: 0, dates: []}
 * `rpc` 키로 덮는다(함수면 args 로 계산). `storage` 는 (bucket, op, args) 로 응답 — undefined 면 기본(성공 · list 는 []).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type Call =
  | { kind: "rpc"; name: string; args: Record<string, unknown> }
  | { kind: "storage"; bucket: string; op: "upload" | "list" | "remove"; args: unknown[] };

type Resp = { data?: unknown; error?: { message: string } | null };

export type FakeOptions = {
  rpc?: Record<string, Resp | ((args: Record<string, unknown>) => Resp)>;
  storage?: (bucket: string, op: "upload" | "list" | "remove", args: unknown[]) => Resp | undefined;
  /** tick_request_claim 이 돌려줄 isin 배열(편의 — `rpc.tick_request_claim` 이 있으면 그쪽이 이긴다). */
  claim?: string[];
};

const lenOf = (v: unknown) => (Array.isArray(v) ? v.length : 0);

export function makeFakeSupabase(opts: FakeOptions = {}): { sb: SupabaseClient; calls: Call[] } {
  const calls: Call[] = [];
  const rpcs: NonNullable<FakeOptions["rpc"]> = {
    tick_request_claim: { data: opts.claim ?? [] },
    tick_request_finish: (a) => ({ data: lenOf(a.p_results) }),
    tick_grid_upsert: (a) => ({ data: lenOf(a.p_rows) }),
    tick_convert_run_record: { data: 1 },
    tick_convert_runs_since: { data: [] },
    tick_convert_candidates: { data: { accum: [], live16: [] } },
    tick_purge_old: { data: { cutoff: "", grids: 0, requests: 0, runs: 0, dates: [] } },
    ...opts.rpc,
  };
  const done = (r: Resp | undefined, fallback: Resp) => Promise.resolve({ data: null, error: null, ...(r ?? fallback) });

  const sb = {
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

export function rpcCalls(calls: Call[], name: string): Record<string, unknown>[] {
  return calls.flatMap((c) => (c.kind === "rpc" && c.name === name ? [c.args] : []));
}

export function uploads(calls: Call[]): { bucket: string; path: string; bytes: Uint8Array; opts: unknown }[] {
  return calls.flatMap((c) =>
    c.kind === "storage" && c.op === "upload"
      ? [{ bucket: c.bucket, path: c.args[0] as string, bytes: c.args[1] as Uint8Array, opts: c.args[2] }]
      : [],
  );
}
