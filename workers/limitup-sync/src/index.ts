import "dotenv/config";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadConfig } from "./config";
import { logger } from "./logger";
import { createSupabaseClient } from "./services/supabase";
import { KNOWN_SCHEMA_VERSIONS, filesSig, listExportDates, readManifest, verifyFiles } from "./manifest";
import { EXPORT_TABLES, commitDay, readNdjsonGz, stageDay, type ExportTbl, type Row, type StageTbl } from "./load";
import { gridSummaryOf, memberDailyOf } from "./derive";
import { GRID_NAME_RE, readGridGz, uploadGrids } from "./grid";
import { kstYmdDaysAgo, purgeOld, type PurgeResult } from "./purge";
import { freshnessOf, STALE_TRADING_DAYS, type Freshness } from "./freshness";

export { KNOWN_SCHEMA_VERSIONS } from "./manifest";
export { kstYmdDaysAgo } from "./purge";

/**
 * limitup-sync entry — gh-trade 밤 export(인박스 「(C)」)를 Supabase limitup 표에 날짜 단위로 원자 교체한다.
 *
 * 한 날짜 판정 순서(고정 — 28-16 · D-14):
 *   manifest 읽기(깨지면 skip "manifest") → `schema_version`(모르는 판(1 · 2 밖)이면 skip "schema" — 파일을 읽지 않는다) →
 *   `files_sig` 가 이력과 같으면 `skipped.unchanged`(verify · stage · commit · record_skip 없음) →
 *   files sha256 대조(불일치 · 없는 파일이면 skip "sha") → 6 ndjson.gz 읽기(행 수 == manifest rows) →
 *   격자 `grid/<isin>.json.gz` 읽기 → 파생 2표(`gridSummaryOf` · `memberDailyOf` — D-17, gh-trade 정의) →
 *   `limitup_stage_clear` → 격자 Storage 업로드(commit **앞** — D-14 · grid.ts 순서 계약) →
 *   `limitup_stage` 청크 insert(6표 + grid_summary + member_daily) → `limitup_commit_day` 1회(기대 수 8키 ·
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
 * 적재된 날짜를 사유와 함께 error 로그로 남기고 throw → 종료 1.
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

export type DispatchResult = {
  dryRun: boolean;
  since: string;
  dates: string[];
  loaded: string[];
  /** 날짜별 표 행 수 — export 6 + 파생 2(grid_summary · member_daily). */
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
  /** export 신선도(WR-B01) — `stale` 이면 main 종료 1. */
  freshness: Freshness;
};

const SKIP_TEXT: Record<SkipReason, string> = {
  manifest: "manifest 파손",
  schema: "모르는 schema_version",
  sha: "파일 sha256 불일치 · 없음",
};

const STAGE_TABLES: readonly StageTbl[] = [...EXPORT_TABLES, "grid_summary", "member_daily"];

function emptyCounts(): Record<StageTbl, number> {
  return Object.fromEntries(STAGE_TABLES.map((t) => [t, 0])) as Record<StageTbl, number>;
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
  const prev = new Map<string, { sig: string | null; streak: number }>();
  if (!dryRun) {
    sb = createSupabaseClient(config);
    const { data, error } = await sb.from("limitup_loads").select("date, files_sig, skip_streak").gte("date", since);
    if (error) throw new Error(`limitup_loads select: ${error.message}`);
    for (const r of (data ?? []) as { date: string; files_sig: string | null; skip_streak: number | null }[]) {
      prev.set(r.date, { sig: r.files_sig, streak: r.skip_streak ?? 0 });
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
    freshness: freshnessOf(dates, since, now),
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
    if (p?.sig === sig) {
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
      return;
    }

    const { error: clearErr } = await sb.rpc("limitup_stage_clear", { p_date: date });
    if (clearErr) throw new Error(`limitup_stage_clear ${date}: ${clearErr.message}`);
    let commitMs: number;
    try {
      result.grids += await uploadGrids(sb, date, grids);
      await stageDay(sb, date, { ...tables, grid_summary: gridSummary, member_daily: memberDaily }, config.stageChunk);
      const commitStart = Date.now();
      await commitDay(sb, {
        date,
        manifestSha256: mr.sha256,
        filesSig: sig,
        schemaVersion: m.schema_version,
        expected: counts,
      });
      commitMs = Date.now() - commitStart;
    } catch (err) {
      // WR-B04 — 격자는 같은 경로를 덮어쓴다(D-14). 이미 적재된 날짜의 재적재가 업로드 뒤 실패하면 DB 는 옛 export,
      // 격자는 새 export 라 보고서가 둘을 겹쳐 그린다. 그 날짜의 files_sig 를 지워 보고서에서 내리고(「적재 안 된
      // 날짜」 — 보고서 RPC 는 files_sig 있는 날짜만 보인다) 다음 run 이 통째로 다시 적재하게 한다.
      if (p?.sig) await unpublish(date);
      throw err;
    }
    log.info(
      { date, rows: counts, commitMs, replaced: prev.has(date), sigChanged: p?.sig !== sig },
      "limitup day committed",
    );
    if (commitMs > COMMIT_WARN_MS) {
      log.warn(
        { date, commitMs, warnMs: COMMIT_WARN_MS, memberAlloc: counts.member_alloc },
        "limitup commit slow — statement_timeout 에 다가간다",
      );
    }
    result.loaded.push(date);
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
      // 그날 적재는 이미 끝났다 — 무엇이 적재됐는지 남기고 실패로 끝낸다(알림 정책이 정리 실패를 잡는다).
      // 단계는 서로 막지 않는다(WR-B05) — 끝난 단계 결과(partial)도 같이 남긴다.
      const partial = (err as { partial?: PurgeResult }).partial;
      log.error({ loaded: result.loaded, grids: result.grids, partial, err }, "limitup purge failed — 적재는 끝남");
      throw err;
    }
  }
  return result;
}

/** 실행 1회 → 종료 코드(D-20): skip 만 0 · 같은 날짜 3연속 skip 1 · 실패 날짜 1(CR-B01) · stale 1(WR-B01) · 예외 1(사유 로그). */
export async function main(argv: string[] = process.argv, now?: Date): Promise<number> {
  try {
    const result = await dispatch({ dryRun: argv.includes("--dry-run"), now });
    const { freshness } = result;
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
