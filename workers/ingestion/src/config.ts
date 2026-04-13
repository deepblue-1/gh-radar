export type Config = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  kisAppKey: string;
  kisAppSecret: string;
  kisCano: string;
  kisAcntPrdtCd: string;
  kisBaseUrl: string;
  logLevel: string;
};

export function loadConfig(): Config {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const kisAppKey = process.env.KIS_APP_KEY;
  const kisAppSecret = process.env.KIS_APP_SECRET;
  const kisAccountNumber = process.env.KIS_ACCOUNT_NUMBER;
  const kisBaseUrl =
    process.env.KIS_BASE_URL ?? "https://openapi.koreainvestment.com:9443";

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  if (!kisAppKey || !kisAppSecret) {
    throw new Error("KIS_APP_KEY and KIS_APP_SECRET must be set");
  }
  if (!kisAccountNumber) {
    throw new Error("KIS_ACCOUNT_NUMBER must be set (format: 00000000-00)");
  }

  const [cano, acntPrdtCd] = kisAccountNumber.split("-");
  if (!cano || !acntPrdtCd) {
    throw new Error(
      "KIS_ACCOUNT_NUMBER must be in format XXXXXXXX-XX (e.g. 44381356-01)"
    );
  }

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    kisAppKey,
    kisAppSecret,
    kisCano: cano,
    kisAcntPrdtCd: acntPrdtCd,
    kisBaseUrl,
    logLevel: process.env.LOG_LEVEL ?? "info",
  };
}
