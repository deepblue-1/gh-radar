/**
 * limitup-sync 설정 — env 검증.
 *
 * - `LIMITUP_EXPORT_DIR` 필수(Cloud Run = GCS 볼륨 마운트 경로 · 로컬 = `~/ticks/research/export`).
 * - dry-run 이 아니면 `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` 필수(dry-run 은 Supabase 무접촉).
 * - 숫자 env 4개는 양의 정수만 — 잘못된 값으로 조용히 기본값을 쓰지 않는다.
 *   `LIMITUP_ALLOC_KEEP_DAYS` · `KIND15_KEEP_DAYS` 는 28-06 의 보존 정리가 쓴다.
 * - `LIMITUP_SKIP_DATES` — 운영 탈출구(CR-B01): 쉼표로 이은 `YYYYMMDD` 날짜는 적재 루프가 읽지 않는다. 형식이
 *   틀리면 throw(조용히 무시하지 않는다).
 */
export type Config = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  exportDir: string;
  keepDays: number; // LIMITUP_KEEP_DAYS — 이 창 밖 날짜는 적재하지 않는다(D-16, 기본 90)
  allocKeepDays: number; // LIMITUP_ALLOC_KEEP_DAYS — member_alloc 보존(28-06, 기본 30)
  stageChunk: number; // LIMITUP_STAGE_CHUNK — stage insert 1요청 행 수(기본 1000)
  kind15KeepDays: number; // KIND15_KEEP_DAYS — kind 15 purge(28-06, 기본 30)
  skipDates: string[]; // LIMITUP_SKIP_DATES — 운영자가 적재에서 뺄 날짜(CR-B01, 기본 없음)
  logLevel: string;
  appVersion: string;
  dryRun: boolean;
};

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = Number(raw ?? String(fallback));
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return n;
}

function skipDates(): string[] {
  const raw = process.env.LIMITUP_SKIP_DATES ?? "";
  const out = raw
    .split(",")
    .map((d) => d.trim())
    .filter((d) => d !== "");
  for (const d of out) {
    if (!/^\d{8}$/.test(d)) throw new Error(`Invalid LIMITUP_SKIP_DATES: ${raw}`);
  }
  return out;
}

export function loadConfig({ dryRun = false }: { dryRun?: boolean } = {}): Config {
  const exportDir = process.env.LIMITUP_EXPORT_DIR;
  if (!exportDir) throw new Error("LIMITUP_EXPORT_DIR must be set");

  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!dryRun && (!supabaseUrl || !supabaseServiceRoleKey)) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    exportDir,
    keepDays: positiveInt("LIMITUP_KEEP_DAYS", 90),
    allocKeepDays: positiveInt("LIMITUP_ALLOC_KEEP_DAYS", 30),
    stageChunk: positiveInt("LIMITUP_STAGE_CHUNK", 1000),
    kind15KeepDays: positiveInt("KIND15_KEEP_DAYS", 30),
    skipDates: skipDates(),
    logLevel: process.env.LOG_LEVEL ?? "info",
    appVersion: process.env.APP_VERSION ?? "0.0.0",
    dryRun,
  };
}
