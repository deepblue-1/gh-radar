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
  /** First-time/stale 종목 backfill 최대 페이지 (각 페이지 = pageSize posts). */
  discussionSyncBackfillMaxPages: number;
  /** First-time/stale 종목 backfill 최대 일수 (이 기간 도달하면 early stop). */
  discussionSyncBackfillDays: number;
  /** 마지막 수집 후 N시간 초과면 backfill 모드 진입 (그 미만은 incremental 1 페이지). */
  discussionSyncIncrementalHours: number;
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
    discussionSyncPageSize: Number(process.env.DISCUSSION_SYNC_PAGE_SIZE ?? "100"),
    discussionSyncBackfillMaxPages: Number(process.env.DISCUSSION_SYNC_BACKFILL_MAX_PAGES ?? "10"),
    discussionSyncBackfillDays: Number(process.env.DISCUSSION_SYNC_BACKFILL_DAYS ?? "7"),
    discussionSyncIncrementalHours: Number(process.env.DISCUSSION_SYNC_INCREMENTAL_HOURS ?? "24"),
    appVersion: process.env.APP_VERSION ?? "dev",
    logLevel: process.env.LOG_LEVEL ?? "info",
  };
}
