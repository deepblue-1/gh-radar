import pino from "pino";

/**
 * Phase 08 — discussion-sync logger.
 * T-03 mitigation: Bright Data API key / Supabase service role key 가 구조화 로그에
 * 포함되더라도 redact paths 로 '[Redacted]' 치환.
 *
 * Phase 08.1 (Plan 03) 확장: Anthropic API key + x-api-key 헤더 redact 추가.
 *
 * quick-260927-u9t: Cloud Logging severity 매핑 — 각 줄에 `severity`(INFO/ERROR 등)를
 * 내보내 LogEntry.severity 로 올라가게 한다. 숫자 `level` 은 기존 조회·알림 필터
 * (jsonPayload.level>=50) 호환을 위해 함께 유지한다.
 */
const CLOUD_SEVERITY: Record<string, string> = {
  trace: "DEBUG",
  debug: "DEBUG",
  info: "INFO",
  warn: "WARNING",
  error: "ERROR",
  fatal: "CRITICAL",
};

export function toCloudSeverity(label: string): string {
  return CLOUD_SEVERITY[label] ?? "DEFAULT";
}

export function buildLoggerOptions(level = "info"): pino.LoggerOptions {
  return {
    level,
    formatters: {
      level: (label: string, number: number) => ({
        severity: toCloudSeverity(label),
        level: number,
      }),
    },
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
  };
}

export function createLogger(level = "info") {
  return pino(buildLoggerOptions(level));
}
