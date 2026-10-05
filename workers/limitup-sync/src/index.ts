import "dotenv/config";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadConfig } from "./config";
import { logger } from "./logger";
import { createSupabaseClient } from "./services/supabase";
import { KNOWN_SCHEMA_VERSION, filesSig, listExportDates, readManifest, verifyFiles } from "./manifest";
import { EXPORT_TABLES, commitDay, readNdjsonGz, stageDay, type ExportTbl, type Row } from "./load";

export { KNOWN_SCHEMA_VERSION } from "./manifest";

/**
 * limitup-sync entry — gh-trade 밤 export(인박스 「(C)」)를 Supabase limitup 표에 날짜 단위로 원자 교체한다.
 *
 * 한 날짜: manifest → files sha256 대조 → 6 ndjson.gz 읽기(행 수 == manifest rows) →
 *   `limitup_stage_clear` → `limitup_stage` 청크 insert → `limitup_commit_day` 1회.
 *
 * 이 파일은 정상 경로(28-03 트레이서)만 한다 — 깨진 manifest · 모르는 schema_version · sha 불일치는 사유를 담아
 * throw 하고 main 이 로그 + 종료 1(무로그 fail-safe 금지). 날짜 skip · 「바뀐 날짜만」(files_sig 같으면 넘어감) ·
 * 3연속 skip 종료 코드는 28-16, 파생 표 · 격자 업로드 · 보존 정리는 28-06 이 더한다.
 *
 * `--dry-run`: Supabase 무접촉(env 불필요) — 날짜별 행 수 · 합계만 낸다.
 * vitest import 시에는 main() 미실행 — CLI 진입점만 동작.
 */

export type DispatchResult = {
  dryRun: boolean;
  since: string;
  dates: string[];
  loaded: string[];
  rows: Record<string, Record<ExportTbl, number>>;
  totals: Record<ExportTbl, number>;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 기준 `now − days` 날짜의 `YYYYMMDD`. */
export function kstYmdDaysAgo(now: Date, days: number): string {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const day0 = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate());
  return new Date(day0 - days * DAY_MS).toISOString().slice(0, 10).replace(/-/g, "");
}

function emptyCounts(): Record<ExportTbl, number> {
  return Object.fromEntries(EXPORT_TABLES.map((t) => [t, 0])) as Record<ExportTbl, number>;
}

export async function dispatch(opts: { dryRun?: boolean; now?: Date } = {}): Promise<DispatchResult> {
  const dryRun = opts.dryRun ?? false;
  const config = loadConfig({ dryRun });
  const log = logger.child({ app: "limitup-sync", version: config.appVersion });
  const since = kstYmdDaysAgo(opts.now ?? new Date(), config.keepDays);
  const dates = listExportDates(config.exportDir, since);

  let sb: SupabaseClient | null = null;
  const prevSig = new Map<string, string | null>();
  if (!dryRun) {
    sb = createSupabaseClient(config);
    const { data, error } = await sb.from("limitup_loads").select("date, files_sig, skip_streak").gte("date", since);
    if (error) throw new Error(`limitup_loads select: ${error.message}`);
    for (const r of (data ?? []) as { date: string; files_sig: string | null }[]) prevSig.set(r.date, r.files_sig);
  }

  const result: DispatchResult = { dryRun, since, dates, loaded: [], rows: {}, totals: emptyCounts() };

  for (const date of dates) {
    const mr = readManifest(config.exportDir, date);
    if (!mr.ok) throw new Error(`${date}: ${mr.reason}`);
    const m = mr.manifest;
    if (m.schema_version !== KNOWN_SCHEMA_VERSION) {
      throw new Error(`${date}: unknown schema_version ${String(m.schema_version)} (known ${KNOWN_SCHEMA_VERSION})`);
    }
    const bad = await verifyFiles(config.exportDir, date, m);
    if (bad.length > 0) throw new Error(`${date}: sha256 mismatch or missing: ${bad.join(", ")}`);

    const tables: Partial<Record<ExportTbl, Row[]>> = {};
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
    result.rows[date] = counts;
    for (const t of EXPORT_TABLES) result.totals[t] += counts[t];

    if (dryRun || !sb) continue;

    const sig = filesSig(m);
    const { error: clearErr } = await sb.rpc("limitup_stage_clear", { p_date: date });
    if (clearErr) throw new Error(`limitup_stage_clear ${date}: ${clearErr.message}`);
    await stageDay(sb, date, tables, config.stageChunk);
    await commitDay(sb, {
      date,
      manifestSha256: mr.sha256,
      filesSig: sig,
      schemaVersion: m.schema_version,
      expected: counts,
    });
    log.info({ date, rows: counts, replaced: prevSig.has(date), sigChanged: prevSig.get(date) !== sig }, "limitup day committed");
    result.loaded.push(date);
  }

  return result;
}

async function main(): Promise<void> {
  try {
    const result = await dispatch({ dryRun: process.argv.includes("--dry-run") });
    logger.info({ result }, "limitup-sync complete");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "limitup-sync failed");
    process.exit(1);
  }
}

// CLI 진입점 — node dist/index.js · tsx src/index.ts(dry-run) 둘 다. vitest import 시에는 실행 안 함.
if (/index\.(js|ts)$/.test(process.argv[1] ?? "")) {
  void main();
}
