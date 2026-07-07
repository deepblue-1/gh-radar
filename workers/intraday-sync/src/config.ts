// intraday-sync config — RESEARCH §9.2 기준
// candle-sync 의 MODE dispatch 없음 (단일 cycle).

export type Config = {
  // 공통
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  logLevel: string;
  appVersion: string;

  // 키움 (D-26, RESEARCH §1.1)
  kiwoomBaseUrl: string;          // KIWOOM_BASE_URL, default "https://api.kiwoom.com"
  kiwoomAppkey: string;           // KIWOOM_APPKEY (secret)
  kiwoomSecretkey: string;        // KIWOOM_SECRETKEY (secret)
  kiwoomTokenType: string;        // KIWOOM_TOKEN_TYPE, default "live"

  // tuning (RESEARCH §9.2)
  paginationHardCap: number;      // PAGINATION_HARD_CAP, default 5000
  hotSetTopN: number;             // HOT_SET_TOP_N, default 100 (D-11, 2026-05-15 200→100 — top_movers 와 일치 + rate limit 안전마진 2배)
  ka10001RateLimitPerSec: number; // KA10001_RATE_LIMIT, default 4 (2026-05-15 실측 5 → 2026-07-03 키움 실효 한도 축소 관측으로 4 재하향, deploy 스크립트와 일치)
};

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
  const kiwoomAppkey = process.env.KIWOOM_APPKEY;
  const kiwoomSecretkey = process.env.KIWOOM_SECRETKEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  if (!kiwoomAppkey || !kiwoomSecretkey) {
    throw new Error("KIWOOM_APPKEY and KIWOOM_SECRETKEY must be set");
  }

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    logLevel: process.env.LOG_LEVEL ?? "info",
    appVersion: process.env.APP_VERSION ?? "0.0.0",
    kiwoomBaseUrl: process.env.KIWOOM_BASE_URL ?? "https://api.kiwoom.com",
    kiwoomAppkey,
    kiwoomSecretkey,
    kiwoomTokenType: process.env.KIWOOM_TOKEN_TYPE ?? "live",
    paginationHardCap: parseNumberEnv(process.env.PAGINATION_HARD_CAP, 5000),
    hotSetTopN: parseNumberEnv(process.env.HOT_SET_TOP_N, 100),
    ka10001RateLimitPerSec: parseNumberEnv(process.env.KA10001_RATE_LIMIT, 4),
  };
}
