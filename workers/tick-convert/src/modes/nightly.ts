/**
 * nightly 모드(D-02 · D-04) — `nightly [--date YYYYMMDD]`. Scheduler 23:30 · 01:30 KST 두 번(오버라이드 없이 이미지 CMD).
 *
 * 날짜 고르기(Pitfall 6 · `nightlyDatesOf`):
 *   후보 = KST 오늘 포함 최근 `TICK_CATCHUP_DAYS`(10)일 중 평일 ∧ !isKrxHoliday − ok nightly 기록이 KRX · NXT 둘 다 있는 날.
 *   **최신 날짜부터**(새 날짜가 먼저 격자가 되게 — 미룬 날짜는 01:30 · 다음 밤이 잇는다).
 *   `--date D` 는 그 날 하나만(기록 · 요일 · 휴장 무시 · 다시 쓴다 — 스모크 · 수동 재변환).
 *
 * 시간 예산(Pitfall 5 · task-timeout 3600s): 날짜를 **시작하기 직전** `clock() − 시작 > TICK_NIGHTLY_BUDGET_MS`(40분)면
 * 남은 날짜를 미룬다(`deferred=n` · 실패 아님). 날짜 하나가 3~8분(RESEARCH 추정)이라 40분에 시작한 날짜도 타임아웃 안에 끝난다.
 *
 * 날짜 하나(준비 판정 → 단일 통독 → 대상 선별 → 업로드 → 메타 → 실행 기록):
 *   ① 준비 판정(archive.ts isLabelReady 머리 주석이 근거) —
 *        두 라벨 08~20시 전부                         → 변환(ready=full)
 *        아니고 날짜 ≥ KST 오늘 − READY_GRACE_DAYS(2) → 기록 없이 건너뜀(업로드 중일 수 있다 — 다음 실행이 다시 고른다)
 *        아니고 두 라벨 08~20시 객체 0               → 실행 기록 ok · error `NO_OBJECTS`(다시 고르지 않는다 · ready=none)
 *        아니고 일부                                  → 있는 객체로 변환 · 실행 기록 error `partial`(ok · ready=partial)
 *   ② `tick_convert_candidates(D)` — 매집감지 등록(accum ∪ live16).
 *   ③ KRX → NXT 순서로 05~20시 원본을 **한 번 통독** — 모든 키(isin, 거래소) 레코드를 KeyStager(64KB 원시 → zstd 1 청크)에
 *      스테이징하고, 같은 패스에서 A3 ∧ 보드 G1 체결로 키별 DayRateTracker(15% 판정 · 기준가 · 등락률)를 갱신한다.
 *   ④ selectTargets — 등록 ∪ (KRX G1 ∪ NXT G1 에서 hits15). 비대상 키를 먼저 버리고(메모리), 대상 ISIN 은 레코드가 있는
 *      거래소마다 take → 격자 파일(zstd 9) → 업로드(`grid/<D>/<EX>/<isin>.nightly.ticks.zst`).
 *   ⑤ 업로드 성공 행만 `tick_grid_upsert('nightly')`(nightly 는 승격 · 요청 격자를 덮는다 — RPC 모드 규칙).
 *   ⑥ 거래소별 `tick_convert_run_record` + 요약 로그 한 줄.
 *
 * 실패 격리: 날짜 하나가 throw 해도(깨진 원본 · RPC 오류) 그 날짜만 실패 기록(ok false — 다음 실행이 다시 고른다)하고 다음
 * 날짜로 간다. 모든 날짜 뒤 90일 purge 한 번(purge.ts). 실패 날짜 · purge 실패가 하나라도 있으면 종료 1(알림 정책) —
 * 미룬 날짜 · 건너뛴 날짜 · NO_OBJECTS 는 실패가 아니다.
 */
import { A3_LAYOUT, DayRateTracker, TICK_FMT, decodeFields, isKrxHoliday, layoutOf } from "@gh-radar/shared";
import { logger } from "../logger";
import {
  READY_GRACE_DAYS,
  hasReadyWindowObjects,
  isDayReady,
  kstYmdDaysAgo,
  listDayObjects,
  type Label,
} from "../archive";
import { scanObjects } from "../scan";
import { buildGridFile } from "../grid-file";
import { KeyStager } from "../stage";
import { selectTargets, sourcesOf } from "../select";
import { purgeOld } from "../purge";
import { gridObjectPath, type Exchange } from "../store";
import { createMeta, type GridRow, type Meta, type RunSince } from "../meta";
import { UsageError, validYmd, type JobDeps } from "./request";

/** 실행 기록 코드 — 2일 유예가 지났는데 두 라벨 모두 08~20시 객체가 없다(ok · 다시 고르지 않는다). */
export const NO_OBJECTS = "NO_OBJECTS";
/** 실행 기록 코드 — 2일 유예가 지났는데 일부 시각만 있어 있는 객체로 변환했다(ok). */
export const PARTIAL = "partial";

const EXCHANGES: readonly Exchange[] = ["KRX", "NXT"];

export type NightlyArgs = { date?: string };

/** `[--date YYYYMMDD]`. 모르는 플래그 · 빠진 값 · 형식 오류 → UsageError. */
export function parseNightlyArgs(args: readonly string[]): NightlyArgs {
  let date: string | undefined;
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const val = args[i + 1];
    if (flag !== "--date") throw new UsageError(`nightly: 모르는 인자 ${flag}`);
    if (val === undefined || !validYmd(val)) throw new UsageError(`nightly: --date YYYYMMDD 가 필요하다 (받은 값 ${val})`);
    date = val;
  }
  return date === undefined ? {} : { date };
}

function isoOf(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

/**
 * 고를 날짜(최신부터 · 순수 함수). 후보 = KST 오늘 포함 최근 catchupDays 일 중 평일 ∧ 휴장 아님 − ok nightly 기록이
 * KRX · NXT 둘 다 있는 날. `runs` 는 `tick_convert_runs_since` 결과(모든 모드 — nightly ∧ ok true 만 센다).
 */
export function nightlyDatesOf(now: Date, catchupDays: number, runs: readonly RunSince[]): string[] {
  const done = new Map<string, Set<string>>();
  for (const r of runs) {
    if (r.mode !== "nightly" || r.ok !== true) continue;
    let s = done.get(r.date);
    if (!s) done.set(r.date, (s = new Set()));
    s.add(r.exchange);
  }
  const out: string[] = [];
  for (let i = 0; i < catchupDays; i++) {
    const ymd = kstYmdDaysAgo(now, i);
    const iso = isoOf(ymd);
    const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    if (isKrxHoliday(iso)) continue;
    const ex = done.get(ymd);
    if (ex && EXCHANGES.every((e) => ex.has(e))) continue;
    out.push(ymd);
  }
  return out;
}

/** 준비 판정 — wait = 2일 유예 안의 미준비(기록 없이 건너뜀). */
export type DayReady = "full" | "partial" | "none" | "wait";

export type ExchangeResult = {
  exchange: Exchange;
  /** 격자를 만들려고 한 대상 키 수(그 거래소에 레코드가 있는 대상 ISIN). */
  targets: number;
  written: number;
  failed: number;
  bytesRead: number;
  error: string | null;
};

export type NightlyDayResult = {
  date: string;
  ready: DayReady;
  /** 대상 ISIN 수(등록 ∪ 15%). */
  targets: number;
  exchanges: ExchangeResult[];
  /** 그 날짜를 실패로 세는가(업로드 · 메타 · 통독 · RPC). */
  failed: boolean;
  error: string | null;
  /** 스테이징 최대 바이트 · 원시 바이트(압축률 실측 — SC3). */
  stagedPeak: number;
  rawBytes: number;
  durationMs: number;
};

export type NightlyOutcome = {
  mode: "nightly";
  dates: string[];
  days: NightlyDayResult[];
  /** 시간 예산으로 미룬 날짜 수(실패 아님). */
  deferred: number;
  /** 실패 수 = 실패 날짜 + purge 실패(1) — 0 이 아니면 종료 1. */
  failed: number;
  purgeError: string | null;
};

function toNum(v: unknown): number {
  return typeof v === "bigint" ? Number(v) : Number(v);
}

function msgOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function emptyEx(exchange: Exchange): ExchangeResult {
  return { exchange, targets: 0, written: 0, failed: 0, bytesRead: 0, error: null };
}

function judgeDay(root: string, date: string, now: Date): DayReady {
  if (isDayReady(root, date)) return "full";
  if (date >= kstYmdDaysAgo(now, READY_GRACE_DAYS)) return "wait";
  if (!hasReadyWindowObjects(root, "krx", date) && !hasReadyWindowObjects(root, "nxt", date)) return "none";
  return "partial";
}

/** ②~⑤ 단일 통독 · 대상 선별 · 업로드 · 메타. ready = full | partial. throw 하면 호출자가 날짜 실패로 기록한다. */
async function convertDay(deps: JobDeps, meta: Meta, date: string, day: NightlyDayResult): Promise<void> {
  const cfg = deps.config;
  const cands = await meta.candidates(date);

  // ③ 단일 통독 — 모든 키 스테이징 + A3 ∧ G1 등락 추적
  const stager = new KeyStager(cfg.stageChunkBytes);
  const rates = new Map<string, DayRateTracker>();
  const byEx = new Map<Exchange, ExchangeResult>(day.exchanges.map((e) => [e.exchange, e]));
  for (const ex of EXCHANGES) {
    const label = ex.toLowerCase() as Label;
    const files = listDayObjects(cfg.archiveDir, label, date);
    const stats = await scanObjects(files, label, (key, recvNs, payload) => {
      stager.add(key, recvNs, payload);
      if (layoutOf(payload) !== A3_LAYOUT) return;
      const row = decodeFields(A3_LAYOUT, payload, recvNs, label);
      if (row.board_id !== "G1") return;
      let tr = rates.get(key);
      if (!tr) rates.set(key, (tr = new DayRateTracker(cfg.upPct)));
      tr.add(String(row.price_change_type), toNum(row.price_change), toNum(row.trade_price));
    });
    byEx.get(ex)!.bytesRead = stats.bytesRead;
  }
  day.stagedPeak = stager.peakBytes();
  day.rawBytes = stager.rawBytes();

  // ④ 대상 선별 — 비대상 키부터 버린다(메모리) · 대상은 레코드가 있는 거래소마다 격자
  const targets = selectTargets(cands, rates);
  day.targets = targets.size;
  for (const key of stager.keys()) if (!targets.has(key.slice(0, key.indexOf("|")))) stager.drop(key);

  const rows: GridRow[] = [];
  const errs: string[] = [];
  for (const isin of [...targets.keys()].sort()) {
    const sources = sourcesOf(targets.get(isin)!);
    for (const ex of EXCHANGES) {
      const key = `${isin}|${ex}`;
      if (!stager.has(key)) continue;
      const er = byEx.get(ex)!;
      er.targets += 1;
      const path = gridObjectPath(date, ex, isin, "nightly");
      try {
        const g = buildGridFile(stager.take(key), cfg.zstdLevel);
        await deps.store.upload(path, g.bytes);
        const tr = rates.get(key);
        rows.push({
          date,
          exchange: ex,
          isin,
          sources,
          object_path: path,
          bytes: g.bytes.length,
          records: g.records,
          a3_count: g.a3Count,
          first_recv_ms: g.firstRecvMs,
          last_recv_ms: g.lastRecvMs,
          base_px: tr?.base() ?? null,
          high_rate: tr?.highRate() ?? null,
          last_rate: tr?.lastRate() ?? null,
          fmt: TICK_FMT,
        });
      } catch (err) {
        logger.error({ date, ex, isin, path, err }, "tick-convert nightly upload failed — 그 종목만 실패");
        er.failed += 1;
        errs.push(`${ex} ${isin}: ${msgOf(err)}`);
      }
    }
  }

  // ⑤ 업로드 성공 행만 메타 — 실패하면 그 행 전부 실패(객체는 남지만 메타가 가리키지 않아 무해 · 90일 purge 가 지운다)
  if (rows.length > 0) {
    try {
      await meta.upsertGrids("nightly", rows);
      for (const r of rows) byEx.get(r.exchange)!.written += 1;
    } catch (err) {
      logger.error({ date, rows: rows.length, err }, "tick-convert nightly meta upsert failed");
      for (const r of rows) byEx.get(r.exchange)!.failed += 1;
      errs.push(`tick_grid_upsert: ${msgOf(err)}`);
    }
  }
  for (const er of day.exchanges) {
    if (er.failed > 0) er.error = `failed ${er.failed}`;
  }
  if (errs.length > 0) {
    day.failed = true;
    day.error = errs.slice(0, 5).join(" | ");
  }
}

function withNote(prev: string | null, note: string): string {
  return prev === null ? note : `${prev}; ${note}`;
}

/** 날짜 하나 — 판정 · 변환 · 실행 기록 · 요약 로그. 날짜 단위 예외는 여기서 실패로 닫는다(다음 날짜를 막지 않는다). */
async function runDay(deps: JobDeps, meta: Meta, date: string): Promise<NightlyDayResult> {
  const clock = deps.clock ?? Date.now;
  const t0 = clock();
  const day: NightlyDayResult = {
    date,
    ready: "wait",
    targets: 0,
    exchanges: EXCHANGES.map(emptyEx),
    failed: false,
    error: null,
    stagedPeak: 0,
    rawBytes: 0,
    durationMs: 0,
  };
  let fatal: string | null = null;

  try {
    day.ready = judgeDay(deps.config.archiveDir, date, deps.now);
    if (day.ready === "wait") {
      logger.info({ date }, `[tick-convert] mode=nightly date=${date} ready=wait — 업로드 전/중(유예 ${READY_GRACE_DAYS}일) · 기록 없이 건너뜀`);
      return day;
    }
    if (day.ready === "none") {
      for (const er of day.exchanges) er.error = NO_OBJECTS;
    } else {
      await convertDay(deps, meta, date, day);
      if (day.ready === "partial") for (const er of day.exchanges) er.error = er.error === null ? PARTIAL : `${PARTIAL}; ${er.error}`;
    }
  } catch (err) {
    // 날짜 단위 실패(깨진 원본 · candidates RPC 등) — 두 거래소 모두 실패 기록(다음 실행이 다시 고른다)
    fatal = msgOf(err);
    logger.error({ date, err }, "tick-convert nightly date failed — 그 날짜만 실패");
    day.failed = true;
    day.error = fatal;
    for (const er of day.exchanges) er.error = withNote(er.error, fatal);
  }

  day.durationMs = Math.max(0, Math.round(clock() - t0));
  // ⑥ 거래소별 실행 기록 + 요약 한 줄 — ok 는 거래소별(그 거래소 실패 0 ∧ 날짜 단위 실패 없음). 날짜는 두 거래소 모두 ok 여야
  //    다음 실행이 고르지 않는다. 기록 실패도 그 날짜 실패(ok 기록이 없으면 다음 실행이 다시 고른다).
  for (const er of day.exchanges) {
    try {
      await meta.runRecord({
        date,
        exchange: er.exchange,
        mode: "nightly",
        ok: fatal === null && er.failed === 0,
        targets: er.targets,
        written: er.written,
        bytes_read: er.bytesRead,
        duration_ms: day.durationMs,
        error: er.error,
      });
    } catch (err) {
      logger.error({ date, ex: er.exchange, err }, "tick-convert nightly run record failed");
      day.failed = true;
      day.error = day.error ?? msgOf(err);
    }
    logger.info(
      { date, ex: er.exchange, result: er },
      `[tick-convert] mode=nightly date=${date} ex=${er.exchange} targets=${er.targets} written=${er.written} ` +
        `bytes_read=${er.bytesRead} staged=${day.stagedPeak} ready=${day.ready} ms=${day.durationMs}` +
        (er.error ? ` error=${er.error}` : ""),
    );
  }
  return day;
}

export async function runNightly(deps: JobDeps, args: NightlyArgs = {}): Promise<NightlyOutcome> {
  const clock = deps.clock ?? Date.now;
  const t0 = clock();
  const meta = createMeta(deps.sb);
  const cfg = deps.config;

  const dates =
    args.date !== undefined
      ? [args.date]
      : nightlyDatesOf(deps.now, cfg.catchupDays, await meta.runsSince(kstYmdDaysAgo(deps.now, cfg.catchupDays - 1)));

  const out: NightlyOutcome = { mode: "nightly", dates, days: [], deferred: 0, failed: 0, purgeError: null };
  for (let i = 0; i < dates.length; i++) {
    // 시간 예산 — 새 날짜를 시작하기 직전에만 본다(시작한 날짜는 끝낸다)
    if (clock() - t0 > cfg.nightlyBudgetMs) {
      out.deferred = dates.length - i;
      logger.warn(
        { deferred: dates.slice(i), budgetMs: cfg.nightlyBudgetMs },
        `[tick-convert] mode=nightly 시간 예산 초과 — 남은 ${out.deferred}일은 다음 실행이 잇는다`,
      );
      break;
    }
    const day = await runDay(deps, meta, dates[i]!);
    out.days.push(day);
    if (day.failed) out.failed += 1;
  }

  // 90일 purge — 날짜 0개 · 실패 날짜가 있어도 한 번
  try {
    await purgeOld(deps.sb, deps.store, cfg.keepDays, deps.now);
  } catch (err) {
    out.purgeError = msgOf(err);
    out.failed += 1;
    logger.error({ err }, "tick-convert nightly purge failed");
  }

  const converted = out.days.filter((d) => d.ready === "full" || d.ready === "partial").length;
  const waited = out.days.filter((d) => d.ready === "wait").length;
  const noObjects = out.days.filter((d) => d.ready === "none").length;
  logger.info(
    { dates, deferred: out.deferred, failed: out.failed, purgeError: out.purgeError },
    `[tick-convert] mode=nightly dates=${dates.length} converted=${converted} wait=${waited} no_objects=${noObjects} ` +
      `failed=${out.failed} deferred=${out.deferred} purge=${out.purgeError === null ? "ok" : "error"} ` +
      `ms=${Math.max(0, Math.round(clock() - t0))}`,
  );
  return out;
}
