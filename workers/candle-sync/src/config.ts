export type Mode = "backfill" | "daily" | "recover";

export type Config = {
  // 공통 (master-sync 동일)
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  krxAuthKey: string;
  krxBaseUrl: string;
  logLevel: string;
  appVersion: string;

  // candle-sync 신규
  mode: Mode;                  // MODE env, default "daily"
  backfillFrom?: string;       // BACKFILL_FROM env (YYYY-MM-DD) — backfill mode 만 사용
  backfillTo?: string;         // BACKFILL_TO env (YYYY-MM-DD) — backfill mode 만 사용
  recoverLookback: number;     // RECOVER_LOOKBACK env, default 10 — recover mode lookback 영업일 수
  recoverThreshold: number;    // RECOVER_THRESHOLD env, default 0.9 — 활성 비율 임계
  recoverMaxCalls: number;     // RECOVER_MAX_CALLS env, default 20 — calls 상한
  minExpectedRows: number;     // MIN_EXPECTED_ROWS env, default 1400 — MIN_EXPECTED 가드 (T-09-02)
  basDd?: string;              // BAS_DD env (YYYYMMDD) — daily mode override (테스트/수동 재실행용, default todayKstYYYYMMDD)
};

function parseMode(raw: string | undefined): Mode {
  const m = (raw ?? "daily").toLowerCase();
  if (m !== "backfill" && m !== "daily" && m !== "recover") {
    throw new Error(`Unknown MODE: ${raw}. Expected: backfill | daily | recover`);
  }
  return m;
}

function parseNumberEnv(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid numeric env value: "${raw}"`);
  }
  return n;
}

export function loadConfig(): Config {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const krxAuthKey = process.env.KRX_AUTH_KEY;
  // RESEARCH §1.1 — production 검증된 URL 직접 잠금 (master-sync default 와 의도적 차이)
  const krxBaseUrl =
    process.env.KRX_BASE_URL ?? "https://data-dbg.krx.co.kr/svc/apis";

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  if (!krxAuthKey) {
    throw new Error("KRX_AUTH_KEY must be set");
  }

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    krxAuthKey,
    krxBaseUrl,
    logLevel: process.env.LOG_LEVEL ?? "info",
    appVersion: process.env.APP_VERSION ?? "0.0.0",
    mode: parseMode(process.env.MODE),
    backfillFrom: process.env.BACKFILL_FROM,
    backfillTo: process.env.BACKFILL_TO,
    recoverLookback: parseNumberEnv(process.env.RECOVER_LOOKBACK, 10),
    recoverThreshold: parseNumberEnv(process.env.RECOVER_THRESHOLD, 0.9),
    recoverMaxCalls: parseNumberEnv(process.env.RECOVER_MAX_CALLS, 20),
    minExpectedRows: parseNumberEnv(process.env.MIN_EXPECTED_ROWS, 1400),
    basDd: process.env.BAS_DD,
  };
}
