/**
 * backfill-launch 모드(quick 261103-pei) — `backfill-launch [--from YYYYMMDD] [--to YYYYMMDD] [--dry-run]`.
 *
 * 목적: 발사 대기열 값 표(launch_piece_queue · 20261104200000)가 생기기 전 날짜(또는 그 사이 격자가 바뀐 날짜)의 발사 조각 값을
 *   이미 있는 격자로 채운다. 새 날짜는 nightly 가 변환 때 함께 쓴다 — 이 모드는 백필용이다(Storage 만 읽는다 · 원본 아카이브 불필요).
 *   격자가 없는 발사 키(예: 대상이 아니던 날의 발사 종목)는 범위 밖이다 — 변환을 요청하지 않고 `no_grid` 로 세기만 한다.
 *
 * 순서(backfill-team.ts 와 같은 꼴):
 *   ① `launch_queue_pending(from, to)` — 그 격자 경로로 계산된 값이 없는 대상 조각이 있는 격자(date 내림차순) + no_grid(warn 로그).
 *   ② 격자마다 **순차**로 Storage 다운로드 → `zstdDecompressSync` → 그 날짜 `launch_queue_inputs`(날짜별 캐시 · 실패면 그 날짜 격자
 *      전부 failed) 중 (exchange, isin) 조각 → `gridLaunchOf`(shared launchQueueOf · object_path = 격자 경로).
 *   ③ 50행마다 · 끝에 `launch_queue_set`(격자 경로 가드). `--dry-run` 은 set 을 부르지 않고 행을 info 로그로 남긴다.
 *
 * 재실행 안전: pending 은 그 격자 경로로 계산된 값이 없는 키만 고르고 set 은 7키 upsert 라 몇 번 돌려도 같은 결과.
 * 시간 예산(TICK_NIGHTLY_BUDGET_MS): 새 격자를 시작하기 직전에 넘었으면 남은 격자 수를 deferred 로 남기고 멈춘다.
 *
 * 종료 코드: 다운로드 · 해제 · inputs · set RPC 실패 = failed(종료 1). 계산 실패 = launch_failed(그 키는 값이 없어 다음 실행이 다시
 *   고른다 · 로그만 · 종료 0). deferred · no_grid 는 실패 아님.
 */
import zlib from "node:zlib";
import { logger } from "../logger";
import { createMeta, type LaunchInputRow, type LaunchSetRow } from "../meta";
import { gridLaunchOf } from "../launch-queue";
import { UsageError, validYmd, type JobDeps } from "./request";

export type BackfillLaunchArgs = { from?: string; to?: string; dryRun: boolean };

export type BackfillLaunchOutcome = {
  mode: "backfill-launch";
  from: string | null;
  to: string | null;
  dryRun: boolean;
  /** 값을 채울 격자 수. */
  pending: number;
  /** 격자도 값도 없는 (날짜, 거래소, isin) 수 — 범위 밖(세기만). */
  noGrid: number;
  /** 계산까지 마친 격자 수. */
  computed: number;
  /** set 이 실제로 쓴 행 수. */
  written: number;
  /** 계산 실패 격자 수(로그만 · 실패 아님). */
  launchFailed: number;
  /** 다운로드 · 해제 · inputs · set 실패 — 0 이 아니면 종료 1. */
  failed: number;
  /** 시간 예산으로 미룬 격자 수. */
  deferred: number;
  durationMs: number;
  /** 계산한 행(dry-run 검증용 · 실행 모드에서도 같은 값을 set 에 넘겼다). */
  rows: LaunchSetRow[];
};

/** set 한 번에 넘기는 행 수. */
export const LAUNCH_BACKFILL_BATCH = 50;

/** `[--from YYYYMMDD] [--to YYYYMMDD] [--dry-run]` — 모르는 플래그 · 형식 오류 · from > to → UsageError(종료 2). */
export function parseBackfillLaunchArgs(args: readonly string[]): BackfillLaunchArgs {
  const out: BackfillLaunchArgs = { dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]!;
    if (flag === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (flag !== "--from" && flag !== "--to") throw new UsageError(`backfill-launch: 모르는 인자 ${flag}`);
    const val = args[i + 1];
    if (val === undefined || !validYmd(val)) throw new UsageError(`backfill-launch: ${flag} YYYYMMDD 가 필요하다 (받은 값 ${val})`);
    if (flag === "--from") out.from = val;
    else out.to = val;
    i += 1;
  }
  if (out.from !== undefined && out.to !== undefined && out.from > out.to) {
    throw new UsageError(`backfill-launch: --from ${out.from} 이 --to ${out.to} 보다 늦다`);
  }
  return out;
}

export async function runBackfillLaunch(deps: JobDeps, args: BackfillLaunchArgs): Promise<BackfillLaunchOutcome> {
  const clock = deps.clock ?? Date.now;
  const t0 = clock();
  const meta = createMeta(deps.sb);
  const out: BackfillLaunchOutcome = {
    mode: "backfill-launch",
    from: args.from ?? null,
    to: args.to ?? null,
    dryRun: args.dryRun,
    pending: 0,
    noGrid: 0,
    computed: 0,
    written: 0,
    launchFailed: 0,
    failed: 0,
    deferred: 0,
    durationMs: 0,
    rows: [],
  };

  const pending = await meta.launchPending(args.from, args.to);
  out.pending = pending.grids.length;
  out.noGrid = pending.no_grid;
  if (out.noGrid > 0) {
    logger.warn({ noGrid: out.noGrid }, `[tick-convert] backfill-launch 격자 없는 발사 키 ${out.noGrid} — 범위 밖 · 세기만`);
  }

  // 날짜별 inputs 캐시 — null = 그 날짜 inputs 실패
  const inputs = new Map<string, LaunchInputRow[] | null>();
  const inputsOf = async (date: string): Promise<LaunchInputRow[] | null> => {
    if (inputs.has(date)) return inputs.get(date)!;
    let v: LaunchInputRow[] | null;
    try {
      v = await meta.launchInputs(date);
    } catch (err) {
      logger.error({ date, err }, "tick-convert backfill-launch inputs failed — 그 날짜 격자 전부 실패");
      v = null;
    }
    inputs.set(date, v);
    return v;
  };

  let batch: LaunchSetRow[] = [];
  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const rows = batch;
    batch = [];
    if (args.dryRun) return;
    try {
      out.written += await meta.launchSet(rows);
    } catch (err) {
      logger.error({ rows: rows.length, err }, "tick-convert backfill-launch set failed");
      out.failed += rows.length;
    }
  };

  for (let i = 0; i < pending.grids.length; i++) {
    if (clock() - t0 > deps.config.nightlyBudgetMs) {
      out.deferred = pending.grids.length - i;
      logger.warn(
        { deferred: out.deferred, budgetMs: deps.config.nightlyBudgetMs },
        `[tick-convert] mode=backfill-launch 시간 예산 초과 — 남은 ${out.deferred}격자는 다음 실행이 잇는다`,
      );
      break;
    }
    const g = pending.grids[i]!;
    const ctx = { date: g.date, isin: g.isin, mode: "backfill", objectPath: g.object_path };
    const day = await inputsOf(g.date);
    if (day === null) {
      out.failed += 1;
      continue;
    }
    const pieces = day.filter((p) => p.isin === g.isin && p.fire_exchange === g.exchange);
    if (pieces.length === 0) continue; // pending 과 inputs 사이에 조각이 바뀌었다 — 할 일 없음
    let raw: Uint8Array;
    try {
      const zst = await deps.store.download(g.object_path);
      const buf = zlib.zstdDecompressSync(zst);
      raw = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch (err) {
      logger.error({ ...ctx, ex: g.exchange, err }, "tick-convert backfill-launch download/decompress failed");
      out.failed += 1;
      continue;
    }
    const lq = gridLaunchOf(raw, g.exchange, g.date, pieces, ctx);
    if (!lq.ok) {
      out.launchFailed += 1;
      continue;
    }
    out.computed += 1;
    out.rows.push(...lq.rows);
    if (args.dryRun) {
      logger.info({ rows: lq.rows, ms: lq.ms }, `[tick-convert] backfill-launch dry-run ${g.date} ${g.exchange} ${g.isin}`);
    }
    batch.push(...lq.rows);
    if (batch.length >= LAUNCH_BACKFILL_BATCH) await flush();
  }
  await flush();

  out.durationMs = Math.max(0, Math.round(clock() - t0));
  logger.info(
    { result: { ...out, rows: undefined } },
    `[tick-convert] mode=backfill-launch from=${out.from ?? "-"} to=${out.to ?? "-"} pending=${out.pending} ` +
      `computed=${out.computed} written=${out.written} launch_failed=${out.launchFailed} failed=${out.failed} ` +
      `deferred=${out.deferred} no_grid=${out.noGrid} dry_run=${out.dryRun} ms=${out.durationMs}`,
  );
  return out;
}
