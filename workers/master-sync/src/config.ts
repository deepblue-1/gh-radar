export type Config = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  krxAuthKey: string;
  krxBaseUrl: string;       // default "https://data-dbg.krx.co.kr/svc/apis"
  logLevel: string;
  appVersion: string;
  basDd?: string;           // optional — 미설정 시 today (KST 영업일)
};

export function loadConfig(): Config {
  const required: Record<string, string | undefined> = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    KRX_AUTH_KEY: process.env.KRX_AUTH_KEY,
  };

  for (const [k, v] of Object.entries(required)) {
    if (!v) throw new Error(`${k} must be set`);
  }

  return {
    supabaseUrl: required.SUPABASE_URL!,
    supabaseServiceRoleKey: required.SUPABASE_SERVICE_ROLE_KEY!,
    krxAuthKey: required.KRX_AUTH_KEY!.trim(),
    krxBaseUrl:
      process.env.KRX_BASE_URL ?? "https://data-dbg.krx.co.kr/svc/apis",
    logLevel: process.env.LOG_LEVEL ?? "info",
    appVersion: process.env.APP_VERSION ?? "dev",
    basDd: process.env.BAS_DD,
  };
}
