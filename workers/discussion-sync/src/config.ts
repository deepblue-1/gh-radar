import "dotenv/config";

/**
 * Phase 08 — discussion-sync worker 설정.
 *
 * PIVOT: POC 후 Bright Data Web Unlocker 로 확정 (08-POC-PIVOT.md).
 *   - PROXY_API_KEY / PROXY_BASE_URL 제거
 *   - BRIGHTDATA_API_KEY / BRIGHTDATA_ZONE / BRIGHTDATA_URL 도입
 */
export interface DiscussionSyncConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  brightdataApiKey: string;
  brightdataZone: string;
  brightdataUrl: string;
  naverDiscussionApiBase: string;
  discussionSyncDailyBudget: number;
  discussionSyncConcurrency: number;
  discussionSyncPageSize: number;
  appVersion: string;
  logLevel: string;
}

function req(key: string): string {
  const v = process.env[key];
  if (!v || v.length === 0) throw new Error(`missing env: ${key}`);
  return v;
}

export function loadConfig(): DiscussionSyncConfig {
  return {
    supabaseUrl: req("SUPABASE_URL"),
    supabaseServiceRoleKey: req("SUPABASE_SERVICE_ROLE_KEY"),
    brightdataApiKey: req("BRIGHTDATA_API_KEY"),
    brightdataZone: process.env.BRIGHTDATA_ZONE ?? "gh_radar_naver",
    brightdataUrl: process.env.BRIGHTDATA_URL ?? "https://api.brightdata.com/request",
    naverDiscussionApiBase:
      process.env.NAVER_DISCUSSION_API_BASE ??
      "https://stock.naver.com/api/community/discussion/posts/by-item",
    discussionSyncDailyBudget: Number(process.env.DISCUSSION_SYNC_DAILY_BUDGET ?? "5000"),
    discussionSyncConcurrency: Number(process.env.DISCUSSION_SYNC_CONCURRENCY ?? "8"),
    discussionSyncPageSize: Number(process.env.DISCUSSION_SYNC_PAGE_SIZE ?? "50"),
    appVersion: process.env.APP_VERSION ?? "dev",
    logLevel: process.env.LOG_LEVEL ?? "info",
  };
}
