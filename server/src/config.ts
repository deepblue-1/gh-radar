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
  // Phase 08 — Bright Data Web Unlocker (on-demand discussion refresh).
  // 모두 optional. 미설정 시 server.ts 가 brightdataClient=undefined 로 시작하고
  // POST /api/stocks/:code/discussions/refresh 만 503 PROXY_UNAVAILABLE 반환.
  brightdataApiKey: string | undefined;
  brightdataZone: string;
  brightdataUrl: string;
  discussionDailyBudget: number;
  discussionRefreshCooldownSeconds: number;
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
    // Bright Data Web Unlocker (Phase 08 — on-demand 토론방 새로고침).
    brightdataApiKey: process.env.BRIGHTDATA_API_KEY,
    brightdataZone: process.env.BRIGHTDATA_ZONE ?? "gh_radar_naver",
    brightdataUrl:
      process.env.BRIGHTDATA_URL ?? "https://api.brightdata.com/request",
    discussionDailyBudget: Number(process.env.DISCUSSION_DAILY_BUDGET ?? "5000"),
    discussionRefreshCooldownSeconds: Number(
      process.env.DISCUSSION_REFRESH_COOLDOWN_SECONDS ?? "30",
    ),
  };
}
