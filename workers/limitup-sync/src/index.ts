import "dotenv/config";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadConfig } from "./config";
import { logger } from "./logger";
import { createSupabaseClient } from "./services/supabase";
import { KNOWN_SCHEMA_VERSION, filesSig, listExportDates, readManifest, verifyFiles } from "./manifest";
import { EXPORT_TABLES, commitDay, readNdjsonGz, stageDay, type ExportTbl, type Row, type StageTbl } from "./load";
import { gridSummaryOf, memberDailyOf } from "./derive";
import { GRID_NAME_RE, readGridGz, uploadGrids } from "./grid";
import { kstYmdDaysAgo, purgeOld, type PurgeResult } from "./purge";

export { KNOWN_SCHEMA_VERSION } from "./manifest";
export { kstYmdDaysAgo } from "./purge";

/**
 * limitup-sync entry — gh-trade 밤 export(인박스 「(C)」)를 Supabase limitup 표에 날짜 단위로 원자 교체한다.
 *
 * 한 날짜 판정 순서(고정 — 28-16 · D-14):
 *   manifest 읽기(깨지면 skip "manifest") → `schema_version`(모르면 skip "schema" — 파일을 읽지 않는다) →
 *   `files_sig` 가 이력과 같으면 `skipped.unchanged`(verify · stage · commit · record_skip 없음) →
 *   files sha256 대조(불일치 · 없는 파일이면 skip "sha") → 6 ndjson.gz 읽기(행 수 == manifest rows) →
 *   격자 `grid/<isin>.json.gz` 읽기 → 파생 2표(`gridSummaryOf` · `memberDailyOf` — D-17, gh-trade 정의) →
 *   `limitup_stage_clear` → 격자 Storage 업로드(commit **앞** — D-14 · grid.ts 순서 계약) →
 *   `limitup_stage` 청크 insert(6표 + grid_summary + member_daily) → `limitup_commit_day` 1회(기대 수 8키 ·
 *   성공 commit 이 skip_streak 를 0 으로).
 *
 * skip(D-20) = warn 로그 + (dryRun 이 아니면) `limitup_record_skip(date, reason)` — 돌아온 streak 가
 * `ALERT_SKIP_STREAK`(3) 이상이면 `alertDates`. 한 날짜의 skip 은 다른 날짜를 막지 않는다 — run 은 끝까지 돈 뒤
 * main 이 종료 코드를 정한다: skip 만 → 0 · alert → 1(알림 정책이 실패 실행을 잡는다) · 예외 → 사유 로그 + 1
 * (무로그 fail-safe 금지 — 행 수 불일치 · stage/commit/RPC 오류는 사유를 담아 throw).
 * 날짜 루프 뒤(날짜 0개여도) 보존 정리 `purgeOld` 1회(D-16 · D-19 · D-08 — purge.ts). 정리 오류는 적재된 날짜를
 * 사유와 함께 error 로그로 남기고 throw → 종료 1.
 *
 * `--dry-run`: Supabase 무접촉(env 불필요 · record_skip · 업로드 · 정리 없음) — 날짜별 행 수(파생 2표 포함) · 합계 ·
 * 격자 수 · skip 만 낸다.
 * vitest import 시에는 main() 미실행 — CLI 진입점만 동작.
 */

/** 같은 날짜가 이 횟수 이상 연속 skip 되면 run 을 실패(종료 1)로 끝낸다(D-20). */
export const ALERT_SKIP_STREAK = 3;

export type SkipReason = "schema" | "sha" | "manifest";

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
  };

  /** warn + (dryRun 이 아니면) record_skip → 새 streak 가 임계 이상이면 alertDates. RPC 오류는 throw. */
  const skip = async (date: string, reason: SkipReason, detail: Record<string, unknown>): Promise<void> => {
    result.skipped[reason].push(date);
    log.warn({ date, reason, detail }, `limitup-sync skip — ${SKIP_TEXT[reason]}`);
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

  for (const date of dates) {
    const mr = readManifest(config.exportDir, date);
    if (!mr.ok) {
      await skip(date, "manifest", { error: mr.reason });
      continue;
    }
    const m = mr.manifest;
    if (m.schema_version !== KNOWN_SCHEMA_VERSION) {
      await skip(date, "schema", { schema_version: m.schema_version, known: KNOWN_SCHEMA_VERSION });
      continue;
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
      continue;
    }
    const bad = await verifyFiles(config.exportDir, date, m);
    if (bad.length > 0) {
      await skip(date, "sha", { files: bad });
      continue;
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
      continue;
    }

    const { error: clearErr } = await sb.rpc("limitup_stage_clear", { p_date: date });
    if (clearErr) throw new Error(`limitup_stage_clear ${date}: ${clearErr.message}`);
    result.grids += await uploadGrids(sb, date, grids);
    await stageDay(sb, date, { ...tables, grid_summary: gridSummary, member_daily: memberDaily }, config.stageChunk);
    await commitDay(sb, {
      date,
      manifestSha256: mr.sha256,
      filesSig: sig,
      schemaVersion: m.schema_version,
      expected: counts,
    });
    log.info({ date, rows: counts, replaced: prev.has(date), sigChanged: p?.sig !== sig }, "limitup day committed");
    result.loaded.push(date);
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
      log.error({ loaded: result.loaded, grids: result.grids, err }, "limitup purge failed — 적재는 끝남");
      throw err;
    }
  }
  return result;
}

/** 실행 1회 → 종료 코드(D-20): skip 만 0 · 같은 날짜 3연속 skip 1 · 예외 1(사유 로그). */
export async function main(argv: string[] = process.argv): Promise<number> {
  try {
    const result = await dispatch({ dryRun: argv.includes("--dry-run") });
    if (result.alert) {
      logger.error({ result }, "limitup-sync alert — 같은 날짜 3회 연속 skip");
      return 1;
    }
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
