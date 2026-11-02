/**
 * tick-convert 설정 — env 검증(limitup-sync config 동형).
 *
 * - `TICK_ARCHIVE_DIR` — GCS 원본 아카이브 마운트 루트(`<root>/<krx|nxt>/<YYYYMMDD>/<YYYYMMDD>-HHMM[-N].pcap.zst`).
 *   Cloud Run = GCS 볼륨 마운트(ro) `/mnt/tick/raw` · 로컬 = 내려받은 사본. dry-run 이 아니면 필수.
 * - dry-run 이 아니면 `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` 필수(dry-run 은 Supabase 무접촉).
 * - 숫자 env 는 양의 정수만 — 잘못된 값으로 조용히 기본값을 쓰지 않는다(throw).
 *   `TICK_KEEP_DAYS` · `TICK_CATCHUP_DAYS` · `TICK_UP_PCT` · `TICK_STAGE_CHUNK_BYTES` · `TICK_NIGHTLY_BUDGET_MS` 는
 *   nightly 모드(37-18)가 쓴다 — 이 플랜은 읽기 · 검증만 한다.
 */
export type Config = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  archiveDir: string;
  keepDays: number; // TICK_KEEP_DAYS — 격자 · 메타 보존(D-04, 기본 90)
  catchupDays: number; // TICK_CATCHUP_DAYS — nightly 따라잡기 창(기본 10)
  upPct: number; // TICK_UP_PCT — nightly 15% 대상 임계(기본 15)
  zstdLevel: number; // TICK_ZSTD_LEVEL — 격자 파일 zstd 레벨(기본 9 · 1..22)
  stageChunkBytes: number; // TICK_STAGE_CHUNK_BYTES — nightly 메모리 스테이징 원시 청크(기본 65536)
  nightlyBudgetMs: number; // TICK_NIGHTLY_BUDGET_MS — nightly 한 실행의 날짜 시작 마감(기본 2,400,000 = 40분)
  logLevel: string;
  appVersion: string;
  dryRun: boolean;
};

/** zstd 압축 레벨 상한(libzstd ZSTD_maxCLevel). */
export const ZSTD_MAX_LEVEL = 22;

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = Number(raw ?? String(fallback));
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return n;
}

export function loadConfig({ dryRun = false }: { dryRun?: boolean } = {}): Config {
  const archiveDir = process.env.TICK_ARCHIVE_DIR ?? "";
  if (!dryRun && !archiveDir) throw new Error("TICK_ARCHIVE_DIR must be set");

  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!dryRun && (!supabaseUrl || !supabaseServiceRoleKey)) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  const zstdLevel = positiveInt("TICK_ZSTD_LEVEL", 9);
  if (zstdLevel > ZSTD_MAX_LEVEL) throw new Error(`Invalid TICK_ZSTD_LEVEL: ${zstdLevel} (1..${ZSTD_MAX_LEVEL})`);

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    archiveDir,
    keepDays: positiveInt("TICK_KEEP_DAYS", 90),
    catchupDays: positiveInt("TICK_CATCHUP_DAYS", 10),
    upPct: positiveInt("TICK_UP_PCT", 15),
    zstdLevel,
    stageChunkBytes: positiveInt("TICK_STAGE_CHUNK_BYTES", 65536),
    nightlyBudgetMs: positiveInt("TICK_NIGHTLY_BUDGET_MS", 2_400_000),
    logLevel: process.env.LOG_LEVEL ?? "info",
    appVersion: process.env.APP_VERSION ?? "0.0.0",
    dryRun,
  };
}
