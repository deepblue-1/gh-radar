export type Config = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  krxAuthKey: string;
  krxBaseUrl: string;
  logLevel: string;
  appVersion: string;
  basDd?: string;
};

export function loadConfig(): Config {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const krxAuthKey = process.env.KRX_AUTH_KEY;
  const krxBaseUrl =
    process.env.KRX_BASE_URL ?? "https://openapi.krx.co.kr/svc";

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
    basDd: process.env.BAS_DD,
  };
}
