export type Config = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  logLevel: string;
  appVersion: string;
  lookbackMonths: number; // LOOKBACK_MONTHS env, default 24 (D-04)
};

export function loadConfig(): Config {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  const lm = Number(process.env.LOOKBACK_MONTHS ?? "24");
  if (!Number.isFinite(lm)) throw new Error(`Invalid LOOKBACK_MONTHS: ${process.env.LOOKBACK_MONTHS}`);
  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    logLevel: process.env.LOG_LEVEL ?? "info",
    appVersion: process.env.APP_VERSION ?? "0.0.0",
    lookbackMonths: lm,
  };
}
