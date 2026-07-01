import pino from "pino";

/**
 * Phase 13 — home-sync logger (theme-sync logger 의 reduced clone).
 * T-13-05 (Information Disclosure) mitigation: Anthropic / Supabase service-role 시크릿이
 * 구조화 로그에 흘러들어도 redact paths 로 '[REDACTED]' 치환.
 * home-sync 는 외부 크롤링이 없으므로 brightdata paths 를 제거하고 anthropic/supabase/token 만 남긴다.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "cfg.anthropicApiKey",
      "cfg.supabaseServiceRoleKey",
      "headers.authorization",
      "headers.Authorization",
      "*.anthropicApiKey",
      "*.supabaseServiceRoleKey",
      "*.ANTHROPIC_API_KEY",
      "*.SUPABASE_SERVICE_ROLE_KEY",
      "*.access_token",
      "*.token",
    ],
    censor: "[REDACTED]",
  },
});
