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

  // 1차 dt 가드 (quick-260817-f1a)
  /**
   * DT_GUARD_ENABLED, default true. **킬 스위치** —
   * "거래일 정규장에는 오늘 dt 봉이 실시간 생성된다"(가정 A2)가 틀리면 정상 거래일이 전량 skip 되는
   * 치명적 역방향 오탐이 발생한다. 그 경우 코드 변경 없이 env 만 false 로 재배포해 즉시 원복한다
   * (0차 캘린더 가드는 계속 동작).
   */
  dtGuardEnabled: boolean;
  /**
   * DT_GUARD_PROBE_CODES, default ["005930", "069500"].
   * 단일 종목 의존은 거래정지 리스크가 있어 2종목 이상. 069500(KODEX 200)은 상시 거래되어 봉 생성이 안정적.
   */
  dtGuardProbeCodes: string[];
};

function parseNumberEnv(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid numeric env value: "${raw}"`);
  }
  return n;
}

/** 콤마 구분 종목코드 리스트 파싱 — trim + 빈 항목 제거. 결과가 비면 fallback. */
function parseCodeListEnv(raw: string | undefined, fallback: string[]): string[] {
  if (!raw) return fallback;
  const codes = raw
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  return codes.length > 0 ? codes : fallback;
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
    // 명시적으로 "false" 일 때만 off — 미설정/오타는 가드 on 쪽으로 안전하게 기운다.
    dtGuardEnabled: process.env.DT_GUARD_ENABLED !== "false",
    dtGuardProbeCodes: parseCodeListEnv(process.env.DT_GUARD_PROBE_CODES, [
      "005930", // 삼성전자
      "069500", // KODEX 200 (상시 거래 ETF — 거래정지 리스크 분산)
    ]),
  };
}
