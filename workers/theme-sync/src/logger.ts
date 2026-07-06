import pino from "pino";

/**
 * Phase 10 — theme-sync logger.
 * T-10-01-01 (Information Disclosure) mitigation: 외부 스크랩 폴백(Bright Data) /
 * Supabase service-role 시크릿이 구조화 로그에 흘러들어도
 * redact paths 로 '[REDACTED]' 치환. discussion-sync 선례 + theme-sync 시크릿에 맞춤.
 *
 * retry.ts 는 named export `logger` 를 사용하므로(master-sync 선례) factory 가 아닌
 * 단일 인스턴스로 export 한다.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "cfg.brightdataApiKey",
      "cfg.supabaseServiceRoleKey",
      "headers.authorization",
      "headers.Authorization",
      "*.brightdataApiKey",
      "*.supabaseServiceRoleKey",
      "*.BRIGHTDATA_API_KEY",
      "*.SUPABASE_SERVICE_ROLE_KEY",
      "*.access_token",
      "*.token",
    ],
    censor: "[REDACTED]",
  },
});
