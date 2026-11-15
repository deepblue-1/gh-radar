import "dotenv/config";
import type { RunModeSetting } from "./pipeline/cadence.js";

export interface NewsSyncConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  naverClientId: string;
  naverClientSecret: string;
  naverBaseUrl: string;
  naverDailyBudget: number;
  /** quick-260915-h3p: auto(KST 시각 판정) | tiered | full. env NEWS_SYNC_MODE. */
  newsSyncMode: RunModeSetting;
  newsSyncConcurrency: number;
  appVersion: string;
  logLevel: string;
}

function req(key: string): string {
  const v = process.env[key];
  if (!v || v.length === 0) throw new Error(`missing env: ${key}`);
  return v;
}

function parseMode(raw: string | undefined): RunModeSetting {
  const v = raw ?? "auto";
  if (v === "auto" || v === "tiered" || v === "full") return v;
  throw new Error(`invalid NEWS_SYNC_MODE: ${v}`);
}

export function loadConfig(): NewsSyncConfig {
  return {
    supabaseUrl: req("SUPABASE_URL"),
    supabaseServiceRoleKey: req("SUPABASE_SERVICE_ROLE_KEY"),
    naverClientId: req("NAVER_CLIENT_ID"),
    naverClientSecret: req("NAVER_CLIENT_SECRET"),
    naverBaseUrl: process.env.NAVER_BASE_URL ?? "https://openapi.naver.com",
    // 공식 25,000/일의 98% — 2026-11-15 사용자 결정(75% 규칙의 네이버 예외 ·
    // server NAVER_DAILY_BUDGET 과 같은 선 · 같은 카운터) — quick-261115-r4f
    naverDailyBudget: Number(process.env.NEWS_SYNC_DAILY_BUDGET ?? "24500"),
    newsSyncMode: parseMode(process.env.NEWS_SYNC_MODE),
    newsSyncConcurrency: Number(process.env.NEWS_SYNC_CONCURRENCY ?? "3"),
    appVersion: process.env.APP_VERSION ?? "dev",
    logLevel: process.env.LOG_LEVEL ?? "info",
  };
}
