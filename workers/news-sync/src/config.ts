import "dotenv/config";

export interface NewsSyncConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  naverClientId: string;
  naverClientSecret: string;
  naverBaseUrl: string;
  naverDailyBudget: number;
  newsSyncConcurrency: number;
  appVersion: string;
  logLevel: string;
}

function req(key: string): string {
  const v = process.env[key];
  if (!v || v.length === 0) throw new Error(`missing env: ${key}`);
  return v;
}

export function loadConfig(): NewsSyncConfig {
  return {
    supabaseUrl: req("SUPABASE_URL"),
    supabaseServiceRoleKey: req("SUPABASE_SERVICE_ROLE_KEY"),
    naverClientId: req("NAVER_CLIENT_ID"),
    naverClientSecret: req("NAVER_CLIENT_SECRET"),
    naverBaseUrl: process.env.NAVER_BASE_URL ?? "https://openapi.naver.com",
    naverDailyBudget: Number(process.env.NEWS_SYNC_DAILY_BUDGET ?? "24500"),
    newsSyncConcurrency: Number(process.env.NEWS_SYNC_CONCURRENCY ?? "3"),
    appVersion: process.env.APP_VERSION ?? "dev",
    logLevel: process.env.LOG_LEVEL ?? "info",
  };
}
