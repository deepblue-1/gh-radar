/**
 * nightly 모드(D-02 · D-04) — `nightly [--date YYYYMMDD]`. Scheduler 23:30 · 01:30 KST 두 번(오버라이드 없이 이미지 CMD).
 *
 * 날짜 고르기(Pitfall 6 · `nightlyDatesOf`):
 *   후보 = KST 오늘 포함 최근 `TICK_CATCHUP_DAYS`(10)일 중 평일 ∧ !isKrxHoliday − ok nightly 기록이 KRX · NXT 둘 다 있는 날
 *   − 실패 nightly 기록(ok false)이 `NIGHTLY_MAX_FAILED_RUNS`(2)회를 넘은 날(WR-36 — 키 하나의 영구 실패 · 깨진 원본 하나로
 *   그 날짜 두 라벨 전량(≈9GB ARCHIVE 꺼내기)을 하루 두 번 · 10일 동안 다시 읽지 않는다. 포기한 날짜는 실행마다 warn 로그 ·
 *   이미 올린 격자는 그대로 · 빠진 키는 요청 변환 또는 `--date D` 수동 재변환).
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
 *      크기 판정 뒤 · 업로드 전에 팀 값(team-day.ts gridTeamOf — 상세 「팀 거래정보」 끝 틱 · quick 261103-j4d)을 계산해 행에 싣는다.
 *      계산 실패는 그 행 팀 값만 null + 에러 로그(team_failed) — 업로드 · upsert · 실행 기록 ok 에 영향 없음.
 *      발사 대기열 값(quick 261103-pei · D-3): candidates.launch(그날 접수 발사 조각 ISIN)가 있으면 `launch_queue_inputs(D)` 를
 *      한 번 불러 (isin, 거래소)로 묶고, 격자 파일을 만든 직후(크기 판정 전) 그 키 조각이 있으면 launch-queue.ts gridLaunchOf
 *      (shared launchQueueOf)로 값을 계산한다 — 너무 큰 격자도 손에 있는 원시 바이트로 계산해 object_path null 로 싣는다.
 *      발사 ISIN 은 출처 칩 없이(sources []) 대상에 들어간다(select.ts). inputs · 계산 · set 실패는 에러 로그 + launch_failed —
 *      격자 업로드 · upsert · 실행 기록 ok 에는 영향 없음(day.failed 에 넣지 않는다).
 *   ⑤ 업로드 성공 행만 `tick_grid_upsert('nightly')`(nightly 는 승격 · 요청 격자를 덮는다 — RPC 모드 규칙). 그 뒤 모은 발사 값을
 *      50행씩 `launch_queue_set`(격자 경로 가드 — upsert 가 먼저여야 새 경로가 통과한다).
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
import { GRID_MAX_BYTES, gridObjectPath, type Exchange } from "../store";
import { createMeta, type GridRow, type LaunchInputRow, type LaunchSetRow, type Meta, type RunSince } from "../meta";
import { gridTeamOf } from "../team-day";
import { gridLaunchOf } from "../launch-queue";
import { UsageError, validYmd, type JobDeps } from "./request";

/** 실행 기록 코드 — 2일 유예가 지났는데 두 라벨 모두 08~20시 객체가 없다(ok · 다시 고르지 않는다). */
export const NO_OBJECTS = "NO_OBJECTS";
/** 실행 기록 코드 — 2일 유예가 지났는데 일부 시각만 있어 있는 객체로 변환했다(ok). */
export const PARTIAL = "partial";

const EXCHANGES: readonly Exchange[] = ["KRX", "NXT"];

/**
 * 날짜 하나의 실패 nightly 실행을 몇 번까지 다시 고르는가(WR-36). 거래소별 ok false 기록 수의 최댓값이 이 값을 넘으면
 * 그 날짜를 더 고르지 않는다 — 일시 오류(Storage · RPC)는 다음 실행 · 다음 밤에 다시 잡히고, 영구 실패는 3번째에서 멈춘다.
 */
export const NIGHTLY_MAX_FAILED_RUNS = 2;

/** launch_queue_set 한 번에 넘기는 행 수. */
export const LAUNCH_SET_BATCH = 50;

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

/** 날짜별 실패 nightly 실행 수 — 거래소별 ok false 기록 수의 최댓값(실행 하나가 거래소마다 한 행을 쓴다). */
export function failedNightlyRunsOf(runs: readonly RunSince[]): Map<string, number> {
  const byKey = new Map<string, number>();
  for (const r of runs) {
    if (r.mode !== "nightly" || r.ok !== false) continue;
    const k = `${r.date}|${r.exchange}`;
    byKey.set(k, (byKey.get(k) ?? 0) + 1);
  }
  const out = new Map<string, number>();
  for (const [k, n] of byKey) {
    const date = k.slice(0, 8);
    out.set(date, Math.max(out.get(date) ?? 0, n));
  }
  return out;
}

/**
 * 고를 날짜(최신부터 · 순수 함수). 후보 = KST 오늘 포함 최근 catchupDays 일 중 평일 ∧ 휴장 아님 − ok nightly 기록이
 * KRX · NXT 둘 다 있는 날 − 실패 nightly 실행이 `maxFailed` 회를 넘은 날(WR-36).
 * `runs` 는 `tick_convert_runs_since` 결과(모든 모드 — nightly 만 센다).
 */
export function nightlyDatesOf(
  now: Date,
  catchupDays: number,
  runs: readonly RunSince[],
  maxFailed: number = NIGHTLY_MAX_FAILED_RUNS,
): string[] {
  const done = new Map<string, Set<string>>();
  for (const r of runs) {
    if (r.mode !== "nightly" || r.ok !== true) continue;
    let s = done.get(r.date);
    if (!s) done.set(r.date, (s = new Set()));
    s.add(r.exchange);
  }
  const failed = failedNightlyRunsOf(runs);
  const out: string[] = [];
  for (let i = 0; i < catchupDays; i++) {
    const ymd = kstYmdDaysAgo(now, i);
    const iso = isoOf(ymd);
    const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    if (isKrxHoliday(iso)) continue;
    const ex = done.get(ymd);
    if (ex && EXCHANGES.every((e) => ex.has(e))) continue;
    if ((failed.get(ymd) ?? 0) > maxFailed) continue; // 반복 실패 — 포기(runNightly 가 warn)
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
  /** `GRID_MAX_BYTES` 를 넘어 건너뛴 키 수(실패 아님). */
  tooLarge: number;
  failed: number;
  bytesRead: number;
  /** 팀 값 계산 실패 키 수(그 행 팀 값만 null · 실패 아님 · quick 261103-j4d). */
  teamFailed: number;
  /** 팀 값 계산 소요 합(ms). */
  teamMs: number;
  /** 발사 대기열 값 행 수(계산해 set 에 넘긴 조각 · quick 261103-pei). */
  launchRows: number;
  /** 발사 값 실패 — inputs 실패(거래소마다 1) · 키 계산 실패 · set 실패 행(실패 아님 · 로그만). */
  launchFailed: number;
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
  return {
    exchange,
    targets: 0,
    written: 0,
    tooLarge: 0,
    failed: 0,
    bytesRead: 0,
    teamFailed: 0,
    teamMs: 0,
    launchRows: 0,
    launchFailed: 0,
    error: null,
  };
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
  const byEx = new Map<Exchange, ExchangeResult>(day.exchanges.map((e) => [e.exchange, e]));

  // 발사 조각(quick 261103-pei) — 그날 접수 조각이 있을 때만 inputs 1회. 실패하면 그 날짜 발사 값만 건너뛴다(로그).
  const launchByKey = new Map<string, LaunchInputRow[]>();
  if (cands.launch.length > 0) {
    try {
      for (const p of await meta.launchInputs(date)) {
        const k = `${p.isin}|${p.fire_exchange}`;
        const list = launchByKey.get(k);
        if (list) list.push(p);
        else launchByKey.set(k, [p]);
      }
    } catch (err) {
      logger.error({ date, err }, "tick-convert nightly launch inputs failed — 그 날짜 발사 값만 건너뜀(변환은 계속)");
      for (const er of day.exchanges) er.launchFailed += 1;
    }
  }

  // ③ 단일 통독 — 모든 키 스테이징 + A3 ∧ G1 등락 추적
  const stager = new KeyStager(cfg.stageChunkBytes);
  const rates = new Map<string, DayRateTracker>();
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
  const launchRows: LaunchSetRow[] = [];
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
        const raw = stager.take(key);
        const g = buildGridFile(raw, cfg.zstdLevel);
        const tooLarge = g.bytes.length > GRID_MAX_BYTES;
        // 발사 값 — 너무 큰 격자도 원시 바이트로 계산(object_path null). 올리는 격자는 업로드 성공 뒤에만 싣는다.
        const pieces = launchByKey.get(key);
        let keyLaunch: LaunchSetRow[] = [];
        if (pieces) {
          const lq = gridLaunchOf(raw, ex, date, pieces, { date, isin, mode: "nightly", objectPath: tooLarge ? null : path });
          if (lq.ok) keyLaunch = lq.rows;
          else er.launchFailed += 1;
        }
        if (tooLarge) {
          logger.warn({ date, ex, isin, bytes: g.bytes.length, max: GRID_MAX_BYTES }, "tick-convert nightly grid too large — 건너뜀(실패 아님)");
          er.tooLarge += 1;
          launchRows.push(...keyLaunch);
          continue;
        }
        const tm = gridTeamOf(raw, ex, { date, isin, mode: "nightly" });
        er.teamMs += tm.ms;
        if (!tm.ok) er.teamFailed += 1;
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
          ...tm.team,
        });
        launchRows.push(...keyLaunch);
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
  // ⑤' 발사 값 — upsert 뒤(격자 경로 가드). 실패는 로그 + launch_failed 만(day.failed · 실행 기록 ok 불변).
  for (let i = 0; i < launchRows.length; i += LAUNCH_SET_BATCH) {
    const batch = launchRows.slice(i, i + LAUNCH_SET_BATCH);
    for (const r of batch) byEx.get(r.fire_exchange as Exchange)!.launchRows += 1;
    try {
      await meta.launchSet(batch);
    } catch (err) {
      logger.error({ date, rows: batch.length, err }, "tick-convert nightly launch_queue_set failed — 발사 값만 실패(변환은 그대로)");
      for (const r of batch) byEx.get(r.fire_exchange as Exchange)!.launchFailed += 1;
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
      `[tick-convert] mode=nightly date=${date} ex=${er.exchange} targets=${er.targets} written=${er.written} too_large=${er.tooLarge} ` +
        `bytes_read=${er.bytesRead} staged=${day.stagedPeak} ready=${day.ready} team_failed=${er.teamFailed} team_ms=${er.teamMs} ` +
        `launch=${er.launchRows} launch_failed=${er.launchFailed} ` +
        `ms=${day.durationMs}` +
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

  let dates: string[];
  if (args.date !== undefined) {
    dates = [args.date];
  } else {
    const runs = await meta.runsSince(kstYmdDaysAgo(deps.now, cfg.catchupDays - 1));
    dates = nightlyDatesOf(deps.now, cfg.catchupDays, runs);
    // WR-36 — 반복 실패로 포기한 날짜(ok 기록 없이 실패만 쌓인 날)를 실행마다 남긴다(무로그 손실 금지)
    const uncapped = nightlyDatesOf(deps.now, cfg.catchupDays, runs, Infinity);
    const gaveUp = uncapped.filter((d) => !dates.includes(d));
    if (gaveUp.length > 0) {
      logger.warn(
        { gaveUp, maxFailed: NIGHTLY_MAX_FAILED_RUNS },
        `[tick-convert] mode=nightly 실패 ${NIGHTLY_MAX_FAILED_RUNS}회 초과 날짜 ${gaveUp.join(",")} — 다시 고르지 않는다` +
          ` (원인 확인 뒤 nightly --date D 로 수동 재변환)`,
      );
    }
  }

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
