import "dotenv/config";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadConfig } from "./config";
import { logger } from "./logger";
import { createSupabaseClient } from "./services/supabase";
import { KNOWN_SCHEMA_VERSIONS, filesSig, listExportDates, readManifest, verifyFiles } from "./manifest";
import {
  EXPORT_TABLES,
  OPTIONAL_FILES,
  accumRowProblems,
  commitDay,
  readNdjsonGz,
  stageDay,
  type ExportTbl,
  type OptionalTbl,
  type Row,
  type StageTbl,
} from "./load";
import { gridSummaryOf, memberDailyOf } from "./derive";
import { GRID_NAME_RE, readGridGz, uploadGrids } from "./grid";
import { kstYmdDaysAgo, purgeOld, type PurgeResult } from "./purge";
import { KRX_HOLIDAYS_SEEDED_THROUGH } from "@gh-radar/shared";
import { freshnessOf, STALE_TRADING_DAYS, type Freshness } from "./freshness";

export { KNOWN_SCHEMA_VERSIONS } from "./manifest";
export { kstYmdDaysAgo } from "./purge";

/**
 * limitup-sync entry — gh-trade 밤 export(인박스 「(C)」)를 Supabase limitup 표에 날짜 단위로 원자 교체한다.
 *
 * 한 날짜 판정 순서(고정 — 28-16 · D-14):
 *   manifest 읽기(깨지면 skip "manifest") → `schema_version`(모르는 판(1 · 2 밖)이면 skip "schema" — 파일을 읽지 않는다) →
 *   `files_sig` 가 이력과 같으면 `skipped.unchanged`(verify · stage · commit · record_skip 없음) —
 *   단 manifest 에 선택 파일(`OPTIONAL_FILES` — team_flow · accum_flow)이 있고 이력 `rows.<tbl>` 이 그 rows 와 다르면(키 없음
 *   포함) files_sig 가 같아도 재적재한다(Phase 33 D-03 → Phase 34 D-02 일반화 — 옛 워커가 그 표 없이 실은 날짜 · 수동
 *   files_sig NULL 대체 · reason `<tbl>[+<tbl>]_backfill` · 이 backfill 은
 *   격자 재업로드를 건너뛰고, 실패해도 그 날짜를 unpublish 하지 않는다 — 실패 날짜로만 남는다 · WR-01) →
 *   files sha256 대조(불일치 · 없는 파일이면 skip "sha") → 6 ndjson.gz 읽기(행 수 == manifest rows) →
 *   선택 파일 `OPTIONAL_FILES` 순회(manifest 에 있을 때만 · 행 수 == manifest rows · 없으면 0행 — Phase 33 D-02 ·
 *   Phase 34 D-02): `team_flow.ndjson.gz`(팀 매집) · `accum_flow.ndjson.gz`(매집감지 — 원문 그대로 · 1행 청크 · 결함이면
 *   그 표만 0행 · 기대 수 키 없이 적재하고 `degraded` → 종료 1 — 34 WR-02) →
 *   격자 `grid/<isin>.json.gz` 읽기 → 파생 2표(`gridSummaryOf` · `memberDailyOf` — D-17, gh-trade 정의) →
 *   `limitup_stage_clear` → 격자 Storage 업로드(commit **앞** — D-14 · grid.ts 순서 계약) →
 *   `limitup_stage` 청크 insert(6표 + grid_summary + member_daily · 선택 표는 표마다 자기 작은 청크로 따로) →
 *   `limitup_commit_day` 1회(기대 수 10키 — team_flow · accum_flow 는 0 이어도 키를 싣는다 ·
 *   성공 commit 이 skip_streak 를 0 으로).
 *
 * skip(D-20) = warn 로그 + (dryRun 이 아니면) `limitup_record_skip(date, reason)` — 돌아온 streak 가
 * `ALERT_SKIP_STREAK`(3) 이상이면 `alertDates`. 한 날짜의 skip 은 다른 날짜를 막지 않는다 — run 은 끝까지 돈 뒤
 * main 이 종료 코드를 정한다: skip 만 → 0 · alert → 1(알림 정책이 실패 실행을 잡는다) · 실패 날짜 → 1.
 *
 * 날짜 격리(CR-B01): 한 날짜 안에서 skip 이 아닌 오류(행 수 불일치 · 격자 isin/date 불일치 · JSON 파손 · stage/commit
 * RPC 오류 · statement_timeout)는 그 날짜만 `failed` 로 기록하고(error 로그 + `limitup_record_skip(date, "load")`)
 * 다음 날짜로 간다. sha 대조를 통과한 뒤의 오류는 데이터가 그대로인 한 매일 밤 같은 자리에서 다시 나므로, 루프를
 * 멈추면 그보다 새 날짜와 run 끝 정리(kind 15 purge 포함)가 보존 창(90일)이 끝날 때까지 막힌다.
 * 운영 탈출구 `LIMITUP_SKIP_DATES=YYYYMMDD,…` — 그 날짜는 읽지도 기록하지도 않는다(`excluded` · warn 로그).
 * 신선도(WR-B01): GCS 의 가장 새 export 날짜 뒤로 export 가 없는 KRX 거래일이 `STALE_TRADING_DAYS`(3) 이상이면
 * `freshness.stale` → main 이 error 로그 + 종료 1(119 export · radar-gw 운반이 멈추면 「새 날짜 없음」 정상 종료로 묻힌다).
 * 날짜 루프 뒤(날짜 0개 · 실패 날짜가 있어도) 보존 정리 `purgeOld` 1회(D-16 · D-19 · D-08 — purge.ts). 정리 오류는
 * 적재된 날짜를 사유와 함께 error 로그로 남기고 `result.purgeError` 에 담는다(throw 하지 않음) — main 이 신선도 로그를
 * 먼저 낸 뒤 종료 1(정리 실패가 stale 신호를 가리지 않게 · WR-R2-02).
 * KRX 휴장일 캘린더 seed 가 끝난 날(`freshness.calendarStale`)은 main 이 warn 만 낸다 — 종료 코드 영향 없음(IN-R2-02).
 *
 * `--dry-run`: Supabase 무접촉(env 불필요 · record_skip · 업로드 · 정리 없음) — 날짜별 행 수(파생 2표 포함) · 합계 ·
 * 격자 수 · skip 만 낸다.
 * vitest import 시에는 main() 미실행 — CLI 진입점만 동작.
 */

/**
 * `limitup_commit_day` 소요가 이 값(ms)을 넘으면 warn(WR-B02). RPC 하나가 8표 DELETE · INSERT 를 다 하므로 상한가
 * 종목이 많은 날 member_alloc 이 늘면 statement_timeout 에 다가간다 — 닿기 전에 로그로 보이게 한다.
 * (함수 자체 한도는 마이그레이션 20261006090500 의 `SET statement_timeout` 120s — 이 값은 그 25%.)
 * 운영 실측(10/6 첫 무인 run): member_alloc 5만~9만 행 날에 5.6~10.9초 · 행 수에 비례(~0.1ms/행). 5초였을 때는 평일마다
 * 울려 신호가 못 됐다 — 120s 에 닿으려면 하루 ~100만 행(10/6 밀도로 ~500종목)이어야 한다.
 */
export const COMMIT_WARN_MS = 30_000;

/** 같은 날짜가 이 횟수 이상 연속 skip 되면 run 을 실패(종료 1)로 끝낸다(D-20). */
export const ALERT_SKIP_STREAK = 3;

export type SkipReason = "schema" | "sha" | "manifest";

/** skip 이 아닌 오류로 끝난 날짜 하나(CR-B01) — 사유 메시지와 함께. */
export type FailedDay = { date: string; error: string };

/** 결함으로 0행 적재한 선택 표 하나(34 WR-02) — 그 날짜의 다른 표는 적재됐다. */
export type DegradedTbl = { date: string; tbl: OptionalTbl; problems: string[] };

export type DispatchResult = {
  dryRun: boolean;
  since: string;
  dates: string[];
  loaded: string[];
  /** 날짜별 표 행 수 — export 6 + 파생 2(grid_summary · member_daily) + 선택 2(team_flow · accum_flow · 없으면 0). */
  rows: Record<string, Record<StageTbl, number>>;
  totals: Record<StageTbl, number>;
  /** 격자 파일 수 — 실적재 = 업로드한 수, dry-run = 읽은 수. */
  grids: number;
  /** run 끝 보존 정리 결과 — dry-run 이면 null. */
  purged: PurgeResult | null;
  /** 날짜별 skip 사유 · 「바뀌지 않음」(unchanged 는 막힌 날짜가 아니다 — record_skip 안 함). */
  skipped: Record<SkipReason | "unchanged", string[]>;
  /** `alertDates` 가 하나라도 있으면 true → main 종료 1. */
  alert: boolean;
  /** record_skip 이 돌려준 streak >= ALERT_SKIP_STREAK 인 날짜. */
  alertDates: string[];
  /** skip 이 아닌 오류로 끝난 날짜(CR-B01) — 하나라도 있으면 main 종료 1. 다른 날짜 · 정리는 막지 않는다. */
  failed: FailedDay[];
  /** `LIMITUP_SKIP_DATES` 로 운영자가 뺀 날짜 — 읽지도 기록하지도 않는다. */
  excluded: string[];
  /** 결함 선택 파일(accum_flow)만 0행으로 내리고 적재한 날짜 · 표(34 WR-02) — 하나라도 있으면 main 종료 1(알림). */
  degraded: DegradedTbl[];
  /** export 신선도(WR-B01) — `stale` 이면 main 종료 1. */
  freshness: Freshness;
  /** run 끝 보존 정리 실패 — 적재는 끝났다. main 이 종료 1 로 판정(WR-R2-02). 정상 · dry-run 이면 null. */
  purgeError: { message: string; partial?: PurgeResult } | null;
};

const SKIP_TEXT: Record<SkipReason, string> = {
  manifest: "manifest 파손",
  schema: "모르는 schema_version",
  sha: "파일 sha256 불일치 · 없음",
};

const STAGE_TABLES: readonly StageTbl[] = [...EXPORT_TABLES, "grid_summary", "member_daily", "team_flow", "accum_flow"];


function emptyCounts(): Record<StageTbl, number> {
  return Object.fromEntries(STAGE_TABLES.map((t) => [t, 0])) as Record<StageTbl, number>;
}

/** 이력 `limitup_loads.rows` jsonb → 숫자 값만 남긴 객체(객체가 아니면 null). */
function loadRowsOf(v: unknown): Record<string, number> | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  return Object.fromEntries(Object.entries(v).filter((e): e is [string, number] => typeof e[1] === "number"));
}

function groupByIsin(rows: Row[]): Map<string, Row[]> {
  const out = new Map<string, Row[]>();
  for (const r of rows) {
    const k = String(r.isin);
    const g = out.get(k);
    if (g) g.push(r);
    else out.set(k, [r]);
  }
  return out;
}

export async function dispatch(opts: { dryRun?: boolean; now?: Date } = {}): Promise<DispatchResult> {
  const dryRun = opts.dryRun ?? false;
  const config = loadConfig({ dryRun });
  const log = logger.child({ app: "limitup-sync", version: config.appVersion });
  const now = opts.now ?? new Date();
  const since = kstYmdDaysAgo(now, config.keepDays);
  const dates = listExportDates(config.exportDir, since);

  let sb: SupabaseClient | null = null;
  const prev = new Map<string, { sig: string | null; streak: number; rows: Record<string, number> | null }>();
  if (!dryRun) {
    sb = createSupabaseClient(config);
    const { data, error } = await sb.from("limitup_loads").select("date, files_sig, skip_streak, rows").gte("date", since);
    if (error) throw new Error(`limitup_loads select: ${error.message}`);
    for (const r of (data ?? []) as { date: string; files_sig: string | null; skip_streak: number | null; rows: unknown }[]) {
      prev.set(r.date, { sig: r.files_sig, streak: r.skip_streak ?? 0, rows: loadRowsOf(r.rows) });
    }
  }

  const result: DispatchResult = {
    dryRun,
    since,
    dates,
    loaded: [],
    rows: {},
    totals: emptyCounts(),
    grids: 0,
    purged: null,
    skipped: { schema: [], sha: [], manifest: [], unchanged: [] },
    alert: false,
    alertDates: [],
    failed: [],
    excluded: [],
    degraded: [],
    freshness: freshnessOf(dates, since, now),
    purgeError: null,
  };

  /** `limitup_record_skip` → 새 streak 가 임계 이상이면 alertDates. RPC 오류는 throw. reason 은 DB 에서 자유 텍스트. */
  const recordSkip = async (date: string, reason: SkipReason | "load"): Promise<void> => {
    if (dryRun || !sb) return;
    const { data, error } = await sb.rpc("limitup_record_skip", { p_date: date, p_reason: reason });
    if (error) throw new Error(`limitup_record_skip ${date} ${reason}: ${error.message}`);
    const streak = Number(data);
    if (!Number.isInteger(streak)) throw new Error(`limitup_record_skip ${date} ${reason}: bad streak ${String(data)}`);
    if (streak >= ALERT_SKIP_STREAK) {
      result.alertDates.push(date);
      log.warn({ date, reason, streak }, "limitup-sync skip streak — 알림 임계 도달");
    }
  };

  /** warn + (dryRun 이 아니면) record_skip. */
  const skip = async (date: string, reason: SkipReason, detail: Record<string, unknown>): Promise<void> => {
    result.skipped[reason].push(date);
    log.warn({ date, reason, detail }, `limitup-sync skip — ${SKIP_TEXT[reason]}`);
    await recordSkip(date, reason);
  };

  /** 재적재 실패로 「새 격자 + 옛 행」 이 섞인 날짜를 보고서에서 내린다(WR-B04). 이 갱신의 실패는 로그만 — 원래 오류가 정본. */
  const unpublish = async (date: string): Promise<void> => {
    if (!sb) return;
    const { error } = await sb.from("limitup_loads").update({ files_sig: null }).eq("date", date);
    if (error) {
      log.error({ date, error: error.message }, "limitup day unpublish failed — 보고서에 새 격자 + 옛 행이 섞여 보일 수 있다");
      return;
    }
    log.warn({ date }, "limitup day unpublished — 재적재 실패로 격자만 새 export · 다음 run 이 다시 적재");
  };

  /** 날짜 하나 적재 — skip 은 return, skip 이 아닌 오류는 throw(아래 루프가 그 날짜만 실패로 격리한다 · CR-B01). */
  const loadDay = async (date: string): Promise<void> => {
    const mr = readManifest(config.exportDir, date);
    if (!mr.ok) {
      await skip(date, "manifest", { error: mr.reason });
      return;
    }
    const m = mr.manifest;
    if (!KNOWN_SCHEMA_VERSIONS.has(m.schema_version)) {
      await skip(date, "schema", { schema_version: m.schema_version, known: [...KNOWN_SCHEMA_VERSIONS] });
      return;
    }
    const sig = filesSig(m);
    const p = prev.get(date);
    // D-03(Phase 33) — 선택 파일이 manifest 에 있는데 이력 개수와 다르면(키 없음 = 옛 워커 적재 · Pitfall 1) sig 가 같아도 진행.
    // Phase 34 D-02 — team_flow 하나에서 OPTIONAL_FILES 전부로 일반화(accum_flow 포함 · manifest 에 없는 표는 보지 않는다).
    const optional = OPTIONAL_FILES.map((o) => ({ ...o, entry: m.files.find((f) => f.name === o.file) }));
    const backfillTbls = optional
      .filter((o) => o.entry !== undefined && p?.rows?.[o.tbl] !== o.entry.rows)
      .map((o) => o.tbl);
    if (p?.sig === sig && backfillTbls.length === 0) {
      result.skipped.unchanged.push(date);
      log.info({ date }, "limitup day unchanged — files_sig 같음");
      // 적재본과 같은 export 로 돌아왔다 = 연속 skip 이 끊겼다. streak 를 0 으로 — 띄엄띄엄 skip 이 「3연속」 알림을 내지 않게
      if (p.streak > 0 && sb) {
        const { error } = await sb
          .from("limitup_loads")
          .update({ skip_streak: 0, last_skip_reason: null })
          .eq("date", date);
        if (error) throw new Error(`limitup_loads streak reset ${date}: ${error.message}`);
        log.info({ date, streak: p.streak }, "limitup skip streak reset — 적재본과 같은 export");
      }
      return;
    }
    // 표 하나면 기존 문자열 그대로('team_flow_backfill' · 'accum_flow_backfill'), 둘이면 'team_flow+accum_flow_backfill'.
    const reason = p === undefined ? "new" : p.sig !== sig ? "files_sig" : `${backfillTbls.join("+")}_backfill`;
    const backfill = reason.endsWith("_backfill");
    if (backfill) {
      const tables = optional
        .filter((o) => backfillTbls.includes(o.tbl))
        .map((o) => ({ tbl: o.tbl, prev: p?.rows?.[o.tbl] ?? null, manifest: o.entry!.rows }));
      log.info({ date, tables }, `limitup day ${backfillTbls.join("+")} backfill — files_sig 같음 · 개수 불일치(D-02)`);
    }
    const bad = await verifyFiles(config.exportDir, date, m);
    if (bad.length > 0) {
      await skip(date, "sha", { files: bad });
      return;
    }

    const tables = {} as Record<ExportTbl, Row[]>;
    const counts = emptyCounts();
    for (const t of EXPORT_TABLES) {
      const name = `${t}.ndjson.gz`;
      const entry = m.files.find((f) => f.name === name);
      if (!entry) throw new Error(`${date}: manifest has no ${name}`);
      const rows = readNdjsonGz(join(config.exportDir, date, name));
      if (rows.length !== entry.rows) {
        throw new Error(`${date}: ${name} rows ${rows.length} != manifest ${entry.rows}`);
      }
      tables[t] = rows;
      counts[t] = rows.length;
    }

    // 선택 파일(33 D-02 · 34 D-02) — 있으면 행 수 대조, 없으면 0행. counts.<tbl> 는 늘 기록(0 포함 — commit 이 키를 본다).
    // accum_flow 결함(행 수 불일치 · accumRowProblems — 34 WR-02)은 그 표만 0행으로 내리고 기대 수에서 키를 뺀다 —
    // commit 대조는 coalesce(…, 0) = 0 으로 통과하고 limitup_loads.rows 에 키가 안 남아, 다음 run 이 backfill 경로(격리 ·
    // unpublish 없음)로 다시 본다. 「선택」 파일 하나 때문에 새 날짜의 상한가 6표 · team_flow 까지 그날 비지 않게.
    // 단 backfill 대상이 전부 그 결함 표뿐이면 다시 실어도 바뀌는 것이 없다 — 지금처럼 그 날짜 failed(record_skip load · 종료 1).
    const optionalRows = {} as Record<OptionalTbl, Row[]>;
    const omitTbls = new Set<OptionalTbl>();
    const degraded: DegradedTbl[] = [];
    for (const o of optional) {
      let rows: Row[] = [];
      if (o.entry) {
        rows = readNdjsonGz(join(config.exportDir, date, o.file));
        const countBad = rows.length !== o.entry.rows ? `${o.file} rows ${rows.length} != manifest ${o.entry.rows}` : null;
        if (o.tbl !== "accum_flow") {
          if (countBad) throw new Error(`${date}: ${countBad}`);
        } else {
          const problems = [...(countBad ? [countBad] : []), ...accumRowProblems(date, rows)];
          if (problems.length > 0) {
            if (backfill && backfillTbls.every((t) => t === o.tbl)) {
              throw new Error(`${date}: ${o.file} invalid — ${problems.join("; ")}`);
            }
            log.warn(
              { date, tbl: o.tbl, problems },
              "limitup optional file invalid — 그 표만 0행 · 기대 수 키 없이 적재 · 다음 run backfill 로 재확인",
            );
            degraded.push({ date, tbl: o.tbl, problems });
            omitTbls.add(o.tbl);
            rows = [];
          }
        }
      }
      optionalRows[o.tbl] = rows;
      counts[o.tbl] = rows.length;
    }

    // 격자 · 파생(D-17) — 파생 행은 표 열 이름 그대로 · date = 그 날짜(commit RPC 의 날짜 대조를 통과).
    const grids = m.files.flatMap((f) => {
      const hit = GRID_NAME_RE.exec(f.name);
      if (!hit) return [];
      const g = readGridGz(join(config.exportDir, date, f.name));
      if (g.json.isin !== hit[1]) throw new Error(`${date}: ${f.name} isin ${g.json.isin} != file name`);
      return [{ isin: hit[1], ...g }];
    });
    const locksOf = groupByIsin(tables.locks);
    const gridSummary = grids.map((g) => gridSummaryOf(date, g.json, locksOf.get(g.isin) ?? []));
    const memberDaily = memberDailyOf(date, tables.entries, tables.locks, tables.member_alloc);
    counts.grid_summary = gridSummary.length;
    counts.member_daily = memberDaily.length;

    result.rows[date] = counts;
    for (const t of STAGE_TABLES) result.totals[t] += counts[t];

    if (dryRun || !sb) {
      result.grids += grids.length;
      result.degraded.push(...degraded);
      return;
    }

    const { error: clearErr } = await sb.rpc("limitup_stage_clear", { p_date: date });
    if (clearErr) throw new Error(`limitup_stage_clear ${date}: ${clearErr.message}`);
    // 선택 파일 backfill(33 D-03 · 34 D-02) 은 files_sig 가 같아 들어온다 = 격자 파일이 sha256 까지 같다(filesSig 는 grid/* 도 싣는다).
    // 그래서 격자를 다시 올리지 않고, 실패해도 「새 격자 + 옛 행」 이 섞일 일이 없어 unpublish 하지 않는다(WR-01).
    let commitMs: number;
    try {
      if (!backfill) result.grids += await uploadGrids(sb, date, grids);
      await stageDay(sb, date, { ...tables, grid_summary: gridSummary, member_daily: memberDaily }, config.stageChunk);
      for (const o of optional) {
        await stageDay(sb, date, { [o.tbl]: optionalRows[o.tbl] }, Math.min(config.stageChunk, o.chunk));
      }
      const commitStart = Date.now();
      await commitDay(sb, {
        date,
        manifestSha256: mr.sha256,
        filesSig: sig,
        schemaVersion: m.schema_version,
        // 결함으로 내린 선택 표는 키째 뺀다(34 WR-02 — rows 이력에 키가 안 남아야 다음 run 이 backfill 로 다시 본다).
        expected: Object.fromEntries(Object.entries(counts).filter(([k]) => !omitTbls.has(k as OptionalTbl))),
      });
      commitMs = Date.now() - commitStart;
    } catch (err) {
      // WR-B04 — 격자는 같은 경로를 덮어쓴다(D-14). 이미 적재된 날짜의 재적재가 업로드 뒤 실패하면 DB 는 옛 export,
      // 격자는 새 export 라 보고서가 둘을 겹쳐 그린다. 그 날짜의 files_sig 를 지워 보고서에서 내리고(「적재 안 된
      // 날짜」 — 보고서 RPC 는 files_sig 있는 날짜만 보인다) 다음 run 이 통째로 다시 적재하게 한다.
      // backfill 실패는 내리지 않는다(WR-01) — 격자를 건드리지 않았고 commit 은 원자라 DB 는 이미 게시된 그대로다.
      // 선택 파일(team_flow · accum_flow) 때문에 멀쩡한 상한가 보고서 날짜가 사라지면 안 된다. 그 날짜는 아래 루프에서
      // 그대로 failed(종료 1 · record_skip "load" — files_sig 는 건드리지 않는다)로 남아 운영자에게 보인다.
      if (backfill) {
        log.warn({ date }, `limitup day ${backfillTbls.join("+")} backfill failed — 게시된 날짜는 그대로 둔다(unpublish 없음)`);
      } else if (p?.sig) {
        await unpublish(date);
      }
      throw err;
    }
    log.info(
      { date, rows: counts, commitMs, replaced: prev.has(date), sigChanged: p?.sig !== sig, reason },
      "limitup day committed",
    );
    if (commitMs > COMMIT_WARN_MS) {
      log.warn(
        { date, commitMs, warnMs: COMMIT_WARN_MS, memberAlloc: counts.member_alloc },
        "limitup commit slow — statement_timeout 에 다가간다",
      );
    }
    result.loaded.push(date);
    result.degraded.push(...degraded);
  };

  for (const date of dates) {
    if (config.skipDates.includes(date)) {
      result.excluded.push(date);
      log.warn({ date }, "limitup day excluded — LIMITUP_SKIP_DATES(운영자 제외)");
      continue;
    }
    try {
      await loadDay(date);
    } catch (err) {
      // 날짜 하나의 영구 오류가 그 뒤 날짜 · run 끝 정리를 막지 않게(CR-B01 head-of-line) — 실패로 기록하고 다음 날짜로.
      const error = err instanceof Error ? err.message : String(err);
      result.failed.push({ date, error });
      log.error({ date, err }, "limitup day failed — 다음 날짜로 진행");
      if (!dryRun && sb) {
        try {
          await recordSkip(date, "load");
        } catch (e) {
          log.error({ date, err: e }, "limitup_record_skip(load) failed");
        }
      }
    }
  }

  result.alert = result.alertDates.length > 0;

  if (!dryRun && sb) {
    try {
      result.purged = await purgeOld(sb, {
        keepDays: config.keepDays,
        allocKeepDays: config.allocKeepDays,
        kind15KeepDays: config.kind15KeepDays,
        now,
      });
      log.info({ purged: result.purged }, "limitup purge done");
    } catch (err) {
      // 그날 적재는 이미 끝났다 — 무엇이 적재됐는지 남긴다. 단계는 서로 막지 않는다(WR-B05) — 끝난 단계 결과(partial)도.
      // throw 하지 않는다 — main 이 신선도 판정을 먼저 하고 종료 1(stale 신호가 정리 실패에 가려지지 않게 · WR-R2-02).
      // 알림 정책은 실패 실행 수 metric 이라 종료 1 이면 그대로 울린다.
      const partial = (err as { partial?: PurgeResult }).partial;
      log.error({ loaded: result.loaded, grids: result.grids, partial, err }, "limitup purge failed — 적재는 끝남");
      result.purgeError = { message: err instanceof Error ? err.message : String(err), partial };
    }
  }
  return result;
}

/**
 * 실행 1회 → 종료 코드(D-20): skip 만 0 · 같은 날짜 3연속 skip 1 · 실패 날짜 1(CR-B01) · 결함 선택 파일 1(34 WR-02) ·
 * 정리 실패 1(WR-R2-02) · stale 1(WR-B01) · 예외 1(사유 로그). 캘린더 seed 만료(IN-R2-02)는 warn 만 — 종료 코드 영향 없음.
 * 로그 순서: calendar warn → stale error → (실패 날짜 | alert | 결함 선택 파일 | 정리 실패) error. stale 은 다른 판정에 가려지지 않는다.
 */
export async function main(argv: string[] = process.argv, now?: Date): Promise<number> {
  try {
    const result = await dispatch({ dryRun: argv.includes("--dry-run"), now });
    const { freshness } = result;
    if (freshness.calendarStale) {
      logger.warn(
        { freshness, seededThrough: KRX_HOLIDAYS_SEEDED_THROUGH },
        "limitup-sync calendar stale — KRX 휴장일 seed 갱신 필요 (seed 끝 뒤 휴장일을 거래일로 세어 stale 이 거짓일 수 있다 · packages/shared/src/krxCalendar.ts)",
      );
    }
    if (freshness.stale) {
      // 실패 · alert 와 겹쳐도 따로 남긴다 — 운반 정지는 다른 원인이고, 로그 검색 한 줄로 찾을 수 있어야 한다.
      logger.error(
        { freshness, threshold: STALE_TRADING_DAYS },
        "limitup-sync stale — 최신 export 뒤로 새 export 가 없는 거래일이 임계 이상 (119 export · radar-gw 운반 확인)",
      );
    }
    if (result.failed.length > 0) {
      logger.error({ result }, "limitup-sync day failed — 실패 날짜가 있다(다른 날짜 · 정리는 진행)");
      return 1;
    }
    if (result.alert) {
      logger.error({ result }, "limitup-sync alert — 같은 날짜 3회 연속 skip");
      return 1;
    }
    if (result.degraded.length > 0) {
      // 그날 핵심 표는 적재됐지만 선택 파일이 깨졌다(34 WR-02) — gh-trade export 를 고쳐야 하므로 실패 실행으로 알린다.
      logger.error({ degraded: result.degraded }, "limitup-sync optional file invalid — 그 표만 0행 적재(gh-trade export 확인)");
      return 1;
    }
    if (result.purgeError) {
      logger.error({ result }, "limitup-sync purge failed — 보존 정리 실패(적재는 끝남)");
      return 1;
    }
    if (freshness.stale) return 1;
    logger.info({ result }, "limitup-sync complete");
    return 0;
  } catch (err) {
    logger.error({ err }, "limitup-sync failed");
    return 1;
  }
}

// CLI 진입점 — node dist/index.js · tsx src/index.ts(dry-run) 둘 다. vitest import 시에는 실행 안 함.
if (/index\.(js|ts)$/.test(process.argv[1] ?? "")) {
  void main().then((code) => process.exit(code));
}
