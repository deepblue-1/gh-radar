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
  /** 마지막 수집 후 N시간 초과면 backfill 모드 진입 (그 미만은 incremental 모드). */
  discussionSyncIncrementalHours: number;
  /** Incremental 모드의 최대 페이지 cap — 1시간 cron 사이 누적된 글이 pageSize 초과할 때 안전 버퍼. */
  discussionSyncIncrementalMaxPages: number;
  /**
   * Phase 08.1 — Claude Haiku inline classify 모듈 (08.1-03) 전용.
   *
   * `anthropicApiKey`: Anthropic SDK 호출용. classify 기능 활성화 시 필수.
   * `classifyConcurrency`: p-limit 동시 Claude 호출 수 제한 (approved plan §8 default 5).
   * `classifyModel`: approved plan §Decisions §1 로 "claude-haiku-4-5" 고정.
   *   env override 는 엔지니어링 안전망(테스트용, 배포 시 기본값 유지).
   */
  anthropicApiKey: string;
  classifyConcurrency: number;
  classifyModel: string;
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
    discussionSyncBackfillMaxPages: Number(process.env.DISCUSSION_SYNC_BACKFILL_MAX_PAGES ?? "30"),
    discussionSyncBackfillDays: Number(process.env.DISCUSSION_SYNC_BACKFILL_DAYS ?? "7"),
    discussionSyncIncrementalHours: Number(process.env.DISCUSSION_SYNC_INCREMENTAL_HOURS ?? "24"),
    discussionSyncIncrementalMaxPages: Number(process.env.DISCUSSION_SYNC_INCREMENTAL_MAX_PAGES ?? "5"),
    // Phase 08.1 — Claude Haiku inline classify (08.1-03).
    anthropicApiKey: req("ANTHROPIC_API_KEY"),
    classifyConcurrency: Number(process.env.DISCUSSION_SYNC_CLASSIFY_CONCURRENCY ?? "5"),
    classifyModel: process.env.DISCUSSION_SYNC_CLASSIFY_MODEL ?? "claude-haiku-4-5",
    appVersion: process.env.APP_VERSION ?? "dev",
    logLevel: process.env.LOG_LEVEL ?? "info",
  };
}
