/**
 * 메타 RPC 래퍼 — 마이그레이션 20261102200000 · 20261102200100(37-04)의 Job 용 RPC. 전부 service_role.
 *
 * 모든 래퍼는 error → throw(RPC 이름 · 메시지) · 반환 모양을 검사해 어긋나면 throw — 조용히 빈 값으로 진행하지 않는다.
 *
 *   tick_request_claim(p_date, p_ex)            → isin jsonb 배열(없으면 [])     — 그 (날짜, 거래소) pending 전부 → running
 *   tick_request_finish(p_date, p_ex, p_results) → 바뀐 행 수                      — {isin, ok, error} · running 행만
 *   tick_grid_upsert(p_mode, p_rows)             → 쓴 행 수                        — 모드 규칙(request 는 nightly 를 못 덮음)
 *   tick_convert_run_record(p_run)               → 새 id
 *   tick_convert_runs_since(p_since)             → [{date, exchange, mode, ok, finished_at}]   (37-18 nightly)
 *   tick_convert_candidates(p_date)              → {accum: isin[], live16: isin[]}             (37-18 nightly)
 *   tick_purge_old(p_keep_days)                  → {cutoff, grids, requests, runs, dates}      (37-18 nightly)
 *   tick_grid_team_pending(p_from, p_to)         → [{date, exchange, isin, object_path, bytes}] (261103-j4d backfill-team)
 *   tick_grid_team_set(p_rows)                   → 갱신 수 — 같은 object_path ∧ 미계산 행만     (261103-j4d backfill-team)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Exchange, GridMode } from "./store";
import type { GridTeam } from "./team-day";

/** 요청 결과 코드 — 종목에 그날 그 거래소 전문이 없다(정상 결과 · 실패 아님). */
export const NO_RECORDS = "NO_RECORDS";
/** 요청 결과 코드 — 그 (날짜, 라벨) 원본이 아직 다 올라오지 않았다(업로드 전 · 하루 상한 비소모 · 37-04). */
export const NOT_UPLOADED = "NOT_UPLOADED";
/** 요청 결과 코드 — 격자가 `GRID_MAX_BYTES` 를 넘어 올리지 않았다(실패 아님 · 웹은 재시도 없이 「너무 큼」 카드). */
export const TOO_LARGE = "TOO_LARGE";

export type FinishResult = { isin: string; ok: boolean; error: string | null };

export type GridRow = {
  date: string;
  exchange: Exchange;
  isin: string;
  sources: string[];
  object_path: string;
  bytes: number;
  records: number;
  a3_count: number;
  first_recv_ms: number | null;
  last_recv_ms: number | null;
  base_px: number | null;
  high_rate: number | null;
  last_rate: number | null;
  fmt: string;
} & GridTeam;

/** 팀 값 미계산 격자(backfill-team 입력 · 20261103230000). */
export type TeamPendingRow = { date: string; exchange: Exchange; isin: string; object_path: string; bytes: number };
/** 팀 값 채우기 한 행 — object_path 가 그 사이 바뀌었으면 RPC 가 쓰지 않는다. */
export type TeamSetRow = { date: string; exchange: Exchange; isin: string; object_path: string } & GridTeam;

export type RunRow = {
  date: string;
  exchange: string;
  mode: GridMode;
  started_at?: string;
  finished_at?: string;
  ok: boolean;
  targets: number;
  written: number;
  bytes_read: number;
  duration_ms: number;
  error: string | null;
};

export type RunSince = { date: string; exchange: string; mode: GridMode; ok: boolean | null; finished_at: string | null };
export type Candidates = { accum: string[]; live16: string[] };
export type PurgeOut = { cutoff: string; grids: number; requests: number; runs: number; dates: string[] };

export interface Meta {
  claim(date: string, ex: Exchange): Promise<string[]>;
  finish(date: string, ex: Exchange, results: readonly FinishResult[]): Promise<number>;
  upsertGrids(mode: GridMode, rows: readonly GridRow[]): Promise<number>;
  runRecord(run: RunRow): Promise<number>;
  runsSince(since: string): Promise<RunSince[]>;
  candidates(date: string): Promise<Candidates>;
  purgeOld(keepDays: number): Promise<PurgeOut>;
  teamPending(from?: string, to?: string): Promise<TeamPendingRow[]>;
  teamSet(rows: readonly TeamSetRow[]): Promise<number>;
}

function isStrArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isPendingRow(v: unknown): v is TeamPendingRow {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.date === "string" &&
    (r.exchange === "KRX" || r.exchange === "NXT") &&
    typeof r.isin === "string" &&
    typeof r.object_path === "string" &&
    typeof r.bytes === "number"
  );
}

function intOf(name: string, v: unknown): number {
  const n = Number(v);
  if (v === null || v === undefined || !Number.isInteger(n)) throw new Error(`${name}: bad count ${String(v)}`);
  return n;
}

export function createMeta(sb: SupabaseClient): Meta {
  const call = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    const { data, error } = await sb.rpc(name, args);
    if (error) throw new Error(`${name}: ${error.message}`);
    return data;
  };
  return {
    async claim(date, ex) {
      const d = await call("tick_request_claim", { p_date: date, p_ex: ex });
      if (!isStrArray(d)) throw new Error(`tick_request_claim: isin 배열이 아니다 ${JSON.stringify(d)}`);
      return d;
    },
    async finish(date, ex, results) {
      return intOf("tick_request_finish", await call("tick_request_finish", { p_date: date, p_ex: ex, p_results: results }));
    },
    async upsertGrids(mode, rows) {
      return intOf("tick_grid_upsert", await call("tick_grid_upsert", { p_mode: mode, p_rows: rows }));
    },
    async runRecord(run) {
      return intOf("tick_convert_run_record", await call("tick_convert_run_record", { p_run: run }));
    },
    async runsSince(since) {
      const d = await call("tick_convert_runs_since", { p_since: since });
      if (!Array.isArray(d)) throw new Error(`tick_convert_runs_since: 배열이 아니다 ${JSON.stringify(d)}`);
      return d as RunSince[];
    },
    async candidates(date) {
      const d = (await call("tick_convert_candidates", { p_date: date })) as Partial<Candidates> | null;
      if (!d || !isStrArray(d.accum) || !isStrArray(d.live16)) {
        throw new Error(`tick_convert_candidates: {accum, live16} 이 아니다 ${JSON.stringify(d)}`);
      }
      return { accum: d.accum, live16: d.live16 };
    },
    async purgeOld(keepDays) {
      const d = (await call("tick_purge_old", { p_keep_days: keepDays })) as Partial<PurgeOut> | null;
      if (!d || typeof d.cutoff !== "string" || !isStrArray(d.dates)) {
        throw new Error(`tick_purge_old: {cutoff, dates} 가 아니다 ${JSON.stringify(d)}`);
      }
      return {
        cutoff: d.cutoff,
        grids: intOf("tick_purge_old.grids", d.grids),
        requests: intOf("tick_purge_old.requests", d.requests),
        runs: intOf("tick_purge_old.runs", d.runs),
        dates: d.dates,
      };
    },
    async teamPending(from, to) {
      const d = await call("tick_grid_team_pending", { p_from: from ?? null, p_to: to ?? null });
      if (!Array.isArray(d) || !d.every(isPendingRow)) {
        throw new Error(`tick_grid_team_pending: [{date, exchange, isin, object_path, bytes}] 가 아니다 ${JSON.stringify(d).slice(0, 300)}`);
      }
      return d;
    },
    async teamSet(rows) {
      return intOf("tick_grid_team_set", await call("tick_grid_team_set", { p_rows: rows }));
    },
  };
}
