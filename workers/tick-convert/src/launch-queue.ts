/**
 * 발사 조각 대기열 값(quick 261103-pei · D-3) — 해제된 격자 바이트 + 그 (ISIN, 거래소) 접수 조각 → `launch_queue_set` 행.
 * 계산은 shared `launchQueueOf` 한 벌(16:00 FIFO 대기열 · 09:00 체결 런 — 실측 골든이 잠근다). 웹 · 서버는 저장값만 읽는다.
 *
 * 행 = value 가 null 아닌 조각마다 하나(matched false 도 쓴다 — 웹 「—」 · 다시 고르지 않게). object_path = ctx.objectPath
 * (null = GRID_MAX_BYTES 를 넘어 올리지 않은 격자의 원시 바이트로 계산 · design_decisions 8).
 *
 * 실패는 절대 throw 하지 않는다 — 격자 변환 · 업로드 · upsert · 실행 기록 ok 는 그대로 간다(j4d team-day.ts 와 같은 급).
 * 조용히 삼키지도 않는다(무로그 fail-safe 금지): 계산 throw · 이상값(수량 · 금액이 안전한 정수가 아님)이면 그 키 행 없음 +
 * logger.error(date · ex · isin · mode · err). matched false 가 있으면 info 한 줄(수). 1초를 넘기면 info(느림).
 */
import { launchQueueOf, type LaunchPieceQueue, type LaunchQueueOut, type TickExchange } from "@gh-radar/shared";
import { logger } from "./logger";
import type { LaunchInputRow, LaunchSetRow } from "./meta";

export type LaunchCtx = { date: string; isin: string; mode: string; objectPath: string | null };

export type LaunchCompute = (
  buf: Uint8Array,
  ex: TickExchange,
  date: string,
  pieces: readonly LaunchInputRow[],
) => LaunchQueueOut[];

/** 소요가 이보다 길면 info 한 줄. */
const SLOW_MS = 1000;

const NUM_KEYS = [
  "rank",
  "ahead_n",
  "ahead_qty",
  "ahead_amt",
  "end_n",
  "end_qty",
  "end_amt",
  "fill_qty",
  "fill_px_min",
  "fill_px_max",
] as const satisfies readonly (keyof LaunchPieceQueue)[];

const nowMs = (): number => performance.now();

/** 값 검사 — 숫자 칸이 null 이거나 안전한 정수(bigint 칸 · NaN · 소수 금지). 문제면 사유 문자열. */
function badOf(v: LaunchPieceQueue): string | null {
  for (const k of NUM_KEYS) {
    const x = v[k];
    if (x !== null && !Number.isSafeInteger(x)) return `${k} ${x}`;
  }
  return null;
}

/**
 * 격자 바이트 → 값 행. `ok` false = 계산 실패(rows 빈 배열 · 에러 로그). `unmatched` = matched false 행 수.
 * `compute` 는 테스트 주입용(기본 shared launchQueueOf).
 */
export function gridLaunchOf(
  raw: Uint8Array,
  ex: TickExchange,
  date: string,
  pieces: readonly LaunchInputRow[],
  ctx: LaunchCtx,
  compute: LaunchCompute = launchQueueOf as LaunchCompute,
): { rows: LaunchSetRow[]; ms: number; ok: boolean; unmatched: number } {
  const t0 = nowMs();
  const log = { date: ctx.date, ex, isin: ctx.isin, mode: ctx.mode };
  let out: LaunchQueueOut[];
  try {
    out = compute(raw, ex, date, pieces);
  } catch (err) {
    const ms = Math.round(nowMs() - t0);
    logger.error({ ...log, err, ms }, "tick-convert launch queue failed — 그 키 발사 값만 없음(변환은 계속)");
    return { rows: [], ms, ok: false, unmatched: 0 };
  }
  const ms = Math.round(nowMs() - t0);
  const rows: LaunchSetRow[] = [];
  let unmatched = 0;
  for (const { piece, value } of out) {
    if (value === null) continue;
    const bad = badOf(value);
    if (bad !== null) {
      logger.error({ ...log, bad, ms }, "tick-convert launch queue 이상값 — 그 키 발사 값만 없음(변환은 계속)");
      return { rows: [], ms, ok: false, unmatched: 0 };
    }
    if (!value.matched) unmatched += 1;
    const p = piece as LaunchInputRow;
    rows.push({
      trade_date: p.trade_date,
      gateway: p.gateway,
      profile: p.profile,
      fire_exchange: p.fire_exchange,
      fire_base: p.fire_base,
      market: p.market,
      wire: p.wire,
      object_path: ctx.objectPath,
      ...value,
    });
  }
  if (unmatched > 0) {
    logger.info({ ...log, unmatched, rows: rows.length }, "tick-convert launch queue — 격자에서 못 찾은 조각(matched false)");
  }
  if (ms > SLOW_MS) logger.info({ ...log, bytes: raw.length, ms }, "tick-convert launch queue 느림");
  return { rows, ms, ok: true, unmatched };
}
