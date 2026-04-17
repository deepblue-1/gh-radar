export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  logLevel: string;
  appVersion: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  corsAllowedOrigins: string;
  kisBaseUrl: string;
  kisAppKey: string;
  kisAppSecret: string;
  naverClientId: string | undefined;
  naverClientSecret: string | undefined;
  naverBaseUrl: string;
  naverDailyBudget: number;
};

export function loadConfig(): AppConfig {
  const get = (k: string): string => {
    const v = process.env[k];
    if (!v) throw new Error(`${k} must be set`);
    return v;
  };
  return {
    nodeEnv: (process.env.NODE_ENV ?? "development") as AppConfig["nodeEnv"],
    port: Number(process.env.PORT ?? 8080),
    logLevel: process.env.LOG_LEVEL ?? "info",
    appVersion: process.env.APP_VERSION ?? "dev",
    supabaseUrl: get("SUPABASE_URL"),
    supabaseServiceRoleKey: get("SUPABASE_SERVICE_ROLE_KEY"),
    corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS ?? "",
    kisBaseUrl: process.env.KIS_BASE_URL ?? "https://openapi.koreainvestment.com:9443",
    kisAppKey: get("KIS_APP_KEY"),
    kisAppSecret: get("KIS_APP_SECRET"),
    // Naver Search API — 선택. 미설정 시 server.ts 가 naverClient=undefined 로 시작.
    naverClientId: process.env.NAVER_CLIENT_ID,
    naverClientSecret: process.env.NAVER_CLIENT_SECRET,
    naverBaseUrl: process.env.NAVER_BASE_URL ?? "https://openapi.naver.com",
    naverDailyBudget: Number(process.env.NAVER_DAILY_BUDGET ?? "24500"),
  };
}
