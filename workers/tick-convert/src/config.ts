/**
 * tick-convert 설정 — env 검증(limitup-sync config 동형).
 *
 * - `TICK_ARCHIVE_DIR` — GCS 원본 아카이브 마운트 루트(`<root>/<krx|nxt>/<YYYYMMDD>/<YYYYMMDD>-HHMM[-N].pcap.zst`).
 *   Cloud Run = GCS 볼륨 마운트(ro) `/mnt/tick/raw` · 로컬 = 내려받은 사본. dry-run 이 아니면 필수.
 * - dry-run 이 아니면 `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` 필수(dry-run 은 Supabase 무접촉).
 * - 숫자 env 는 양의 정수만 — 잘못된 값으로 조용히 기본값을 쓰지 않는다(throw).
 *   `TICK_KEEP_DAYS` · `TICK_CATCHUP_DAYS` · `TICK_UP_PCT` · `TICK_STAGE_CHUNK_BYTES` · `TICK_NIGHTLY_BUDGET_MS` 는
 *   nightly 모드(37-18)가 쓴다 — 이 플랜은 읽기 · 검증만 한다.
 * - `TICKGW_URL` · `TICKGW_SECRET`(37-12 promote) — radar-gw tickgw 내부 HTTP(Direct VPC). 값이 있으면 URL 은 사설 대역
 *   `http://10.…` · `http://127.…` 만(공인 주소로 비밀 헤더를 내보내지 않는다 — relay-admin-client 가드 정신). promote 모드는
 *   둘 다 필수(없으면 ConfigError → 종료 2) · TICK_ARCHIVE_DIR 은 promote 에서 필요 없다(승격 Job 은 GCS 볼륨이 없다).
 * - backfill-team(quick 261103-j4d)도 TICK_ARCHIVE_DIR 이 필요 없다(Storage 격자만 읽는다).
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
  /** TICKGW_URL — 끝 `/` 를 뗀 사설 대역 URL(promote 만 씀 · 다른 모드에선 비어 있을 수 있다). */
  tickgwUrl?: string;
  /** TICKGW_SECRET — `X-Tickgw-Secret` 값(로그 금지). */
  tickgwSecret?: string;
};

/** 설정 오류 중 인자 오류와 같은 급(종료 2) — 잘못된 TICKGW_URL · promote 에 TICKGW 설정 없음. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/** tickgw 는 radar-gw 사설 주소(Direct VPC private-ranges-only) 또는 로컬 시험(127.)만 — 공인 주소로 비밀을 보내지 않는다. */
export const TICKGW_URL_RE = /^http:\/\/(10\.|127\.)/;

/** TICKGW_URL 검사 — 빈 값이면 "" · 사설 대역이 아니면 ConfigError. 끝 `/` 는 뗀다. */
export function checkTickgwUrl(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (v === "") return "";
  const bad = (): never => {
    throw new ConfigError(`Invalid TICKGW_URL: 사설 대역(http://10.… · http://127.…)만 허용`);
  };
  if (!TICKGW_URL_RE.test(v)) bad();
  // 접두사만 보면 `http://10.0.0.1@evil.example` 처럼 userinfo 로 호스트를 바꿔치기할 수 있다 — 파싱한 hostname 을 다시 본다
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return bad();
  }
  if (u.username !== "" || u.password !== "" || !/^(10|127)\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(u.hostname)) bad();
  if (u.search !== "" || u.hash !== "") bad();
  return v.replace(/\/+$/, "");
}

/** promote 가 쓰는 tickgw 설정 — 둘 중 하나라도 없으면 ConfigError(종료 2). 주입된 Config 도 같은 검사를 거친다. */
export function requireTickgw(cfg: Pick<Config, "tickgwUrl" | "tickgwSecret">): { url: string; secret: string } {
  const url = checkTickgwUrl(cfg.tickgwUrl);
  const secret = cfg.tickgwSecret ?? "";
  if (url === "" || secret === "") throw new ConfigError("promote: TICKGW_URL and TICKGW_SECRET must be set");
  return { url, secret };
}

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

export function loadConfig({ dryRun = false, mode }: { dryRun?: boolean; mode?: string } = {}): Config {
  const archiveDir = process.env.TICK_ARCHIVE_DIR ?? "";
  // 승격 Job 은 원본 아카이브를 읽지 않는다(tickgw export 만) · backfill-team 은 Storage 격자만 읽는다 — GCS 볼륨이 없어도 된다
  if (!dryRun && mode !== "promote" && mode !== "backfill-team" && !archiveDir) throw new Error("TICK_ARCHIVE_DIR must be set");
  const tickgwUrl = checkTickgwUrl(process.env.TICKGW_URL);
  const tickgwSecret = process.env.TICKGW_SECRET ?? "";
  if (mode === "promote") requireTickgw({ tickgwUrl, tickgwSecret });

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
    tickgwUrl,
    tickgwSecret,
  };
}
