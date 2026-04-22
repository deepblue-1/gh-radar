import pino from "pino";

/**
 * Phase 08 — discussion-sync logger.
 * T-03 mitigation: Bright Data API key / Supabase service role key 가 구조화 로그에
 * 포함되더라도 redact paths 로 '[Redacted]' 치환.
 *
 * Phase 08.1 (Plan 03) 확장: Anthropic API key + x-api-key 헤더 redact 추가.
 */
export function createLogger(level = "info") {
  return pino({
    level,
    redact: {
      paths: [
        "cfg.brightdataApiKey",
        "cfg.supabaseServiceRoleKey",
        "cfg.anthropicApiKey",
        "headers.authorization",
        "headers.x-api-key",
        "*.BRIGHTDATA_API_KEY",
        "*.SUPABASE_SERVICE_ROLE_KEY",
        "*.ANTHROPIC_API_KEY",
        "*.brightdataApiKey",
        "*.supabaseServiceRoleKey",
        "*.anthropicApiKey",
      ],
      censor: "[Redacted]",
    },
  });
}
