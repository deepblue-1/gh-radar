import pino from "pino";

/**
 * Phase 10 — theme-sync logger.
 * T-10-01-01 (Information Disclosure) mitigation: 외부 스크랩 폴백(Bright Data) /
 * Supabase service-role 시크릿이 구조화 로그에 흘러들어도
 * redact paths 로 '[REDACTED]' 치환. discussion-sync 선례 + theme-sync 시크릿에 맞춤.
 *
 * retry.ts 는 named export `logger` 를 사용하므로(master-sync 선례) factory 가 아닌
 * 단일 인스턴스로 export 한다.
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

export function buildLoggerOptions(
  level = process.env.LOG_LEVEL ?? "info",
): pino.LoggerOptions {
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
  };
}

export const logger = pino(buildLoggerOptions());
