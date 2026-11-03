/**
 * request 모드(D-03) — `request --date YYYYMMDD --ex KRX|NXT`.
 *
 * 웹의 「변환 요청」 이 server → `tick_request_convert_for_user`(should_trigger) → Admin API jobs:run 으로 이 Job 을 깨운다.
 * 한 실행 = (날짜, 거래소) 하나:
 *   ① `tick_request_claim` — 그 (날짜, 거래소) pending 전부를 running 으로 가져온다(빈 배열이면 실행 기록만 남기고 끝).
 *   ①' 업로드 판정(통독 전 · 근거는 archive.ts isLabelReady 머리 주석) — 그 라벨만 본다:
 *        08~20시 객체 0개                               → 통독 없이 전부 failed `NOT_UPLOADED`(ready=none)
 *        일부만 ∧ 날짜 ≥ KST 오늘 − READY_GRACE_DAYS(2)  → 통독 없이 전부 failed `NOT_UPLOADED`(ready=partial · 업로드 중일 수
 *                                                         있다 — 잘린 격자를 쓰지 않는다)
 *        일부만 ∧ 더 오래됨                             → 있는 객체로 변환 · 실행 기록 error `partial`(ready=partial)
 *        08~20시 전부                                    → 그대로 변환(ready=full)
 *      `NOT_UPLOADED` 는 37-04 가 하루 상한에서 빼고 다음 23:30 KST 까지 같은 키 재트리거를 막는다(웹 「자료 없음 · 업로드 전」).
 *      실패가 아니다 — 실행 기록 ok · 종료 0(알림 정책이 울리지 않게).
 *   ② 그 라벨의 05~20시 원본을 **한 번 통독**하며 claim 된 ISIN 키만 원시 버퍼에 담는다(스테이징 없음 · 메모리 = 그 종목들만).
 *      같은 패스에서 A3 ∧ 보드 G1 체결로 `DayRateTracker`(기준가 최빈값 · 고가 · 마지막 등락률)를 갱신한다.
 *   ③ 종목마다 격자 파일(`pcapns-rec+zstd/1`) → Storage 업로드(`grid/<D>/<EX>/<isin>.request.ticks.zst`) —
 *      **업로드 성공 키만** `tick_grid_upsert('request', rows)`(nightly 행은 RPC 모드 규칙이 지킨다).
 *      크기 판정 뒤 · 업로드 전에 팀 값(team-day.ts gridTeamOf · quick 261103-j4d)을 행에 싣는다 — 계산 실패는 그 행 팀 값만 null.
 *   ④ `tick_request_finish` — 종목마다 done | failed(`NO_RECORDS` · 업로드/메타 실패 메시지).
 *   ⑤ `tick_convert_run_record` + 요약 로그 한 줄.
 *
 * 종료 코드(main): 업로드 · 메타 · 통독 실패가 하나라도 있으면 1(알림 정책 — 37-18). `NO_RECORDS` · `NOT_UPLOADED` 는 실패가 아니다 —
 * 사용자가 고른 ISIN 이 그날 그 거래소에 전문이 없는 정상 결과다(claim 된 종목이 전부 NO_RECORDS 여도 0).
 * 통독이 throw 하면(깨진 원본) claim 된 종목 전부를 failed 로 닫아 25분 JOB_TIMEOUT 회수를 기다리지 않게 한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { A3_LAYOUT, DayRateTracker, TICK_FMT, decodeFields, layoutOf } from "@gh-radar/shared";
import type { Config } from "../config";
import { logger } from "../logger";
import {
  READY_GRACE_DAYS,
  hasReadyWindowObjects,
  isLabelReady,
  kstYmdDaysAgo,
  listDayObjects,
  type Label,
} from "../archive";
import { scanObjects } from "../scan";
import { RecordSink, buildGridFile } from "../grid-file";
import { GRID_MAX_BYTES, gridObjectPath, type Exchange, type GridStore } from "../store";
import { NOT_UPLOADED, NO_RECORDS, TOO_LARGE, createMeta, type FinishResult, type GridRow, type Meta } from "../meta";
import { gridTeamOf } from "../team-day";

/** 모드 공용 의존성 — main 이 만들고 테스트가 가짜를 넣는다(37-18 nightly · 37-12 promote 가 같은 모양을 쓴다). */
export type JobDeps = {
  sb: SupabaseClient;
  store: GridStore;
  config: Config;
  /** KST 날짜 산술 기준 시각. */
  now: Date;
  /** 소요 측정 시계(ms) — 기본 Date.now. */
  clock?: () => number;
};

export type RequestArgs = { date: string; ex: Exchange };

/** 업로드 판정 결과 — full(08~20시 전부) · partial(일부) · none(08~20시 0개). */
export type Ready = "full" | "partial" | "none";

export type RequestRunResult = {
  mode: "request";
  date: string;
  exchange: Exchange;
  /** 업로드 판정 — claim 이 비면 null(판정 안 함). */
  ready: Ready | null;
  targets: number;
  written: number;
  noRecords: number;
  /** NOT_UPLOADED 로 닫은 종목 수(실패 아님). */
  notUploaded: number;
  /** TOO_LARGE 로 닫은 종목 수(`GRID_MAX_BYTES` 초과 · 실패 아님). */
  tooLarge: number;
  /** 실패로 세는 종목 수(업로드 · 메타 · 통독) — NO_RECORDS 제외. 0 이 아니면 종료 1. */
  failed: number;
  bytesRead: number;
  packets: number;
  /** 팀 값 계산 실패 키 수(그 행 팀 값만 null · 실패 아님 · quick 261103-j4d). */
  teamFailed: number;
  /** 팀 값 계산 소요 합(ms). */
  teamMs: number;
  durationMs: number;
  error: string | null;
};

/** 잘못된 인자 · 모르는 모드 — main 이 종료 2. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export function validYmd(s: string): boolean {
  if (!/^\d{8}$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** `--date YYYYMMDD --ex KRX|NXT` (순서 무관). 모르는 플래그 · 빠진 값 · 형식 오류 → UsageError. */
export function parseRequestArgs(args: readonly string[]): RequestArgs {
  let date: string | undefined;
  let ex: string | undefined;
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const val = args[i + 1];
    if (val === undefined || val.startsWith("--")) throw new UsageError(`request: ${flag} 값이 없다`);
    if (flag === "--date") date = val;
    else if (flag === "--ex") ex = val;
    else throw new UsageError(`request: 모르는 인자 ${flag}`);
  }
  if (date === undefined || !validYmd(date)) throw new UsageError(`request: --date YYYYMMDD 가 필요하다 (받은 값 ${date})`);
  if (ex !== "KRX" && ex !== "NXT") throw new UsageError(`request: --ex KRX|NXT 가 필요하다 (받은 값 ${ex})`);
  return { date, ex };
}

/**
 * 업로드 판정(그 라벨만) — `convert` 가 false 면 통독하지 않고 NOT_UPLOADED 로 닫는다.
 * 근거 · 비용은 archive.ts `isLabelReady` 머리 주석.
 */
export function judgeReady(root: string, label: Label, date: string, now: Date): { ready: Ready; convert: boolean } {
  if (!hasReadyWindowObjects(root, label, date)) return { ready: "none", convert: false };
  if (isLabelReady(root, label, date)) return { ready: "full", convert: true };
  return { ready: "partial", convert: date < kstYmdDaysAgo(now, READY_GRACE_DAYS) };
}

/** 키 하나의 원시 레코드 · 등락률 추적. */
type KeyState = { sink: RecordSink; rate: DayRateTracker };

function toNum(v: unknown): number {
  return typeof v === "bigint" ? Number(v) : Number(v);
}

/**
 * ②~③ claim 된 종목을 한 번 통독해 격자 파일 → 업로드 → (성공 키만) 메타. 종목마다 결과를 `results` 에 넣는다.
 * 반환 = 통독 실패 메시지(깨진 원본 등 — 결과가 없는 종목은 SCAN_FAILED 로 닫았다) 또는 null.
 */
async function convertClaimed(
  deps: JobDeps,
  meta: Meta,
  args: RequestArgs,
  isins: readonly string[],
  res: RequestRunResult,
  results: FinishResult[],
): Promise<string | null> {
  const { date, ex } = args;
  const label = ex.toLowerCase() as Label;
  try {
    // ② 통독 — claim 된 ISIN 키만 담는다
    const want = new Map<string, KeyState>();
    for (const isin of isins) want.set(isin, { sink: new RecordSink(), rate: new DayRateTracker() });
    const files = listDayObjects(deps.config.archiveDir, label, date);
    const stats = await scanObjects(files, label, (key, recvNs, payload) => {
      const st = want.get(key.slice(0, key.indexOf("|")));
      if (!st) return;
      st.sink.append(recvNs, payload);
      if (layoutOf(payload) === A3_LAYOUT) {
        const row = decodeFields(A3_LAYOUT, payload, recvNs, label);
        if (row.board_id === "G1") st.rate.add(String(row.price_change_type), toNum(row.price_change), toNum(row.trade_price));
      }
    });
    res.bytesRead = stats.bytesRead;
    res.packets = stats.packets;

    // ③ 격자 파일 → 업로드 → (성공 키만) 메타
    const rows: GridRow[] = [];
    for (const isin of isins) {
      const st = want.get(isin)!;
      if (st.sink.count === 0) {
        results.push({ isin, ok: false, error: NO_RECORDS });
        res.noRecords += 1;
        continue;
      }
      const path = gridObjectPath(date, ex, isin, "request");
      try {
        const raw = st.sink.bytes();
        const g = buildGridFile(raw, deps.config.zstdLevel);
        if (g.bytes.length > GRID_MAX_BYTES) {
          logger.warn({ date, ex, isin, bytes: g.bytes.length, max: GRID_MAX_BYTES }, "tick-convert request grid too large — TOO_LARGE(실패 아님)");
          results.push({ isin, ok: false, error: TOO_LARGE });
          res.tooLarge += 1;
          want.delete(isin);
          continue;
        }
        const tm = gridTeamOf(raw, ex, { date, isin, mode: "request" });
        res.teamMs += tm.ms;
        if (!tm.ok) res.teamFailed += 1;
        await deps.store.upload(path, g.bytes);
        rows.push({
          date,
          exchange: ex,
          isin,
          sources: ["request"],
          object_path: path,
          bytes: g.bytes.length,
          records: g.records,
          a3_count: g.a3Count,
          first_recv_ms: g.firstRecvMs,
          last_recv_ms: g.lastRecvMs,
          base_px: st.rate.base(),
          high_rate: st.rate.highRate(),
          last_rate: st.rate.lastRate(),
          fmt: TICK_FMT,
          ...tm.team,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ date, ex, isin, path, err }, "tick-convert request upload failed — 그 종목만 실패");
        results.push({ isin, ok: false, error: msg });
        res.failed += 1;
      }
      want.delete(isin); // 올린 키의 원시 버퍼는 바로 놓는다
    }
    if (rows.length > 0) {
      try {
        await meta.upsertGrids("request", rows);
        for (const r of rows) results.push({ isin: r.isin, ok: true, error: null });
        res.written = rows.length;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ date, ex, isins: rows.map((r) => r.isin), err }, "tick-convert request meta upsert failed");
        for (const r of rows) results.push({ isin: r.isin, ok: false, error: msg });
        res.failed += rows.length;
      }
    }
    return null;
  } catch (err) {
    // 통독 실패(깨진 원본 등) — 아직 결과가 없는 종목 전부를 실패로 닫는다(25분 JOB_TIMEOUT 회수를 기다리지 않게)
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ date, ex, err }, "tick-convert request scan failed");
    const done = new Set(results.map((r) => r.isin));
    for (const isin of isins) {
      if (done.has(isin)) continue;
      results.push({ isin, ok: false, error: `SCAN_FAILED: ${msg}` });
      res.failed += 1;
    }
    return msg;
  }
}

export async function runRequest(deps: JobDeps, args: RequestArgs): Promise<RequestRunResult> {
  const clock = deps.clock ?? Date.now;
  const t0 = clock();
  const meta = createMeta(deps.sb);
  const { date, ex } = args;
  const label = ex.toLowerCase() as Label;
  const res: RequestRunResult = {
    mode: "request",
    date,
    exchange: ex,
    ready: null,
    targets: 0,
    written: 0,
    noRecords: 0,
    notUploaded: 0,
    tooLarge: 0,
    failed: 0,
    bytesRead: 0,
    packets: 0,
    teamFailed: 0,
    teamMs: 0,
    durationMs: 0,
    error: null,
  };

  // ① claim
  const isins = await meta.claim(date, ex);
  res.targets = isins.length;
  const results: FinishResult[] = [];
  const notes: string[] = [];

  if (isins.length > 0) {
    // ①' 업로드 판정 — 통독 전에(업로드 전이면 GCS 읽기 0 · 잘린 격자 0)
    const judged = judgeReady(deps.config.archiveDir, label, date, deps.now);
    res.ready = judged.ready;
    if (judged.convert) {
      if (judged.ready === "partial") notes.push("partial");
      const scanErr = await convertClaimed(deps, meta, args, isins, res, results);
      if (scanErr !== null) notes.push(scanErr);
    } else {
      for (const isin of isins) results.push({ isin, ok: false, error: NOT_UPLOADED });
      res.notUploaded = isins.length;
      notes.push(NOT_UPLOADED);
    }
    // ④ 종목마다 닫는다(claim 순서대로)
    const order = new Map(isins.map((s, i) => [s, i]));
    results.sort((a, b) => order.get(a.isin)! - order.get(b.isin)!);
    await meta.finish(date, ex, results);
  }

  // ⑤ 실행 기록 + 요약 한 줄
  res.durationMs = Math.max(0, Math.round(clock() - t0));
  // 실패 수는 다른 사유(통독 실패 메시지)가 없을 때만 적는다 — partial 은 함께 남긴다
  if (res.failed > 0 && !notes.some((n) => n !== "partial")) notes.push(`failed ${res.failed}`);
  res.error = notes.length > 0 ? notes.join("; ") : null;
  await meta.runRecord({
    date,
    exchange: ex,
    mode: "request",
    ok: res.failed === 0,
    targets: res.targets,
    written: res.written,
    bytes_read: res.bytesRead,
    duration_ms: res.durationMs,
    error: res.error,
  });
  logger.info(
    { result: res },
    `[tick-convert] mode=request date=${date} ex=${ex} ready=${res.ready ?? "-"} targets=${res.targets} ` +
      `written=${res.written} no_records=${res.noRecords} not_uploaded=${res.notUploaded} too_large=${res.tooLarge} failed=${res.failed} ` +
      `bytes_read=${res.bytesRead} team_failed=${res.teamFailed} team_ms=${res.teamMs} ms=${res.durationMs}`,
  );
  return res;
}
