/**
 * backfill-team 모드(quick 261103-j4d 결정 5) — `backfill-team [--from YYYYMMDD] [--to YYYYMMDD] [--dry-run]`.
 *
 * 목적: 팀 값 칸(20261103230000)이 생기기 전에 만든 격자의 팀 3칸(team_fills · team_day_net_krw · team_day_pnl_krw)을 채운다.
 *   새 격자는 nightly · request · promote 가 변환 때 함께 쓴다 — 이 모드는 1회 백필용이다(Storage 만 읽는다 · 원본 아카이브 불필요).
 *
 * 순서:
 *   ① `tick_grid_team_pending(from, to)` — team_fills IS NULL 격자(date 내림차순).
 *   ② 키마다 **순차**로 Storage 다운로드(object_path) → `zstdDecompressSync`(격자는 zstd 한 프레임) → `gridTeamOf`
 *      (shared teamDaySummaryOf — 상세 「팀 거래정보」 끝 틱 값) → 결과 행을 모은다. 한 번에 격자 하나만 메모리에 둔다.
 *   ③ 50행마다 · 끝에 `tick_grid_team_set`(같은 object_path ∧ 아직 미계산 행만 — 그 사이 격자가 바뀌었으면 안 쓴다).
 *      `--dry-run` 은 set 을 부르지 않고 키별 값을 info 로그로 남긴다.
 *
 * 재실행 안전: pending 은 null 인 행만 고르고 set 도 null 인 행만 쓴다 — 몇 번 돌려도 같은 결과 · 이미 값 있는 행은 안 덮는다.
 * 시간 예산(TICK_NIGHTLY_BUDGET_MS): 새 키를 시작하기 직전에 넘었으면 남은 키 수를 deferred 로 남기고 멈춘다(다음 실행이 잇는다).
 *
 * 종료 코드: 다운로드 · 해제 · set RPC 실패 = failed(종료 1). 계산 실패 = team_failed(그 행은 null 로 남아 다음 실행이 다시 고른다 ·
 *   로그만 · 종료 0 — 결정 4 와 같은 급). deferred 는 실패 아님.
 */
import zlib from "node:zlib";
import { logger } from "../logger";
import { createMeta, type TeamSetRow } from "../meta";
import { gridTeamOf } from "../team-day";
import { UsageError, validYmd, type JobDeps } from "./request";

export type BackfillTeamArgs = { from?: string; to?: string; dryRun: boolean };

export type BackfillTeamOutcome = {
  mode: "backfill-team";
  from: string | null;
  to: string | null;
  dryRun: boolean;
  pending: number;
  /** 계산까지 마친 키 수(성공). */
  computed: number;
  /** set 이 실제로 갱신한 행 수. */
  written: number;
  /** 계산 실패(그 행 null 유지 · 실패 아님). */
  teamFailed: number;
  /** 다운로드 · 해제 · set 실패 — 0 이 아니면 종료 1. */
  failed: number;
  /** 시간 예산으로 미룬 키 수. */
  deferred: number;
  durationMs: number;
  /** dry-run 에서 계산한 값(검증용 · 실행 모드에서도 같은 값을 set 에 넘겼다). */
  rows: TeamSetRow[];
};

/** set 한 번에 넘기는 행 수. */
export const TEAM_SET_BATCH = 50;

/** `[--from YYYYMMDD] [--to YYYYMMDD] [--dry-run]` — 모르는 플래그 · 형식 오류 · from > to → UsageError(종료 2). */
export function parseBackfillTeamArgs(args: readonly string[]): BackfillTeamArgs {
  const out: BackfillTeamArgs = { dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]!;
    if (flag === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (flag !== "--from" && flag !== "--to") throw new UsageError(`backfill-team: 모르는 인자 ${flag}`);
    const val = args[i + 1];
    if (val === undefined || !validYmd(val)) throw new UsageError(`backfill-team: ${flag} YYYYMMDD 가 필요하다 (받은 값 ${val})`);
    if (flag === "--from") out.from = val;
    else out.to = val;
    i += 1;
  }
  if (out.from !== undefined && out.to !== undefined && out.from > out.to) {
    throw new UsageError(`backfill-team: --from ${out.from} 이 --to ${out.to} 보다 늦다`);
  }
  return out;
}

function msgOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function runBackfillTeam(deps: JobDeps, args: BackfillTeamArgs): Promise<BackfillTeamOutcome> {
  const clock = deps.clock ?? Date.now;
  const t0 = clock();
  const meta = createMeta(deps.sb);
  const out: BackfillTeamOutcome = {
    mode: "backfill-team",
    from: args.from ?? null,
    to: args.to ?? null,
    dryRun: args.dryRun,
    pending: 0,
    computed: 0,
    written: 0,
    teamFailed: 0,
    failed: 0,
    deferred: 0,
    durationMs: 0,
    rows: [],
  };

  const pending = await meta.teamPending(args.from, args.to);
  out.pending = pending.length;

  let batch: TeamSetRow[] = [];
  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const rows = batch;
    batch = [];
    if (args.dryRun) return;
    try {
      out.written += await meta.teamSet(rows);
    } catch (err) {
      logger.error({ rows: rows.length, err }, "tick-convert backfill-team set failed");
      out.failed += rows.length;
    }
  };

  for (let i = 0; i < pending.length; i++) {
    // 시간 예산 — 새 키를 시작하기 직전에만 본다
    if (clock() - t0 > deps.config.nightlyBudgetMs) {
      out.deferred = pending.length - i;
      logger.warn(
        { deferred: out.deferred, budgetMs: deps.config.nightlyBudgetMs },
        `[tick-convert] mode=backfill-team 시간 예산 초과 — 남은 ${out.deferred}키는 다음 실행이 잇는다`,
      );
      break;
    }
    const p = pending[i]!;
    const ctx = { date: p.date, isin: p.isin, mode: "backfill" };
    let raw: Uint8Array;
    try {
      const zst = await deps.store.download(p.object_path);
      const buf = zlib.zstdDecompressSync(zst);
      raw = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch (err) {
      logger.error({ ...ctx, ex: p.exchange, path: p.object_path, err }, "tick-convert backfill-team download/decompress failed");
      out.failed += 1;
      continue;
    }
    const tm = gridTeamOf(raw, p.exchange, ctx);
    if (!tm.ok) {
      out.teamFailed += 1;
      continue;
    }
    out.computed += 1;
    const row: TeamSetRow = { date: p.date, exchange: p.exchange, isin: p.isin, object_path: p.object_path, ...tm.team };
    out.rows.push(row);
    if (args.dryRun) {
      logger.info({ row, ms: tm.ms }, `[tick-convert] backfill-team dry-run ${p.date} ${p.exchange} ${p.isin}`);
    }
    batch.push(row);
    if (batch.length >= TEAM_SET_BATCH) await flush();
  }
  await flush();

  out.durationMs = Math.max(0, Math.round(clock() - t0));
  logger.info(
    { result: { ...out, rows: undefined } },
    `[tick-convert] mode=backfill-team from=${out.from ?? "-"} to=${out.to ?? "-"} pending=${out.pending} ` +
      `computed=${out.computed} written=${out.written} team_failed=${out.teamFailed} failed=${out.failed} ` +
      `deferred=${out.deferred} dry_run=${out.dryRun} ms=${out.durationMs}`,
  );
  return out;
}
