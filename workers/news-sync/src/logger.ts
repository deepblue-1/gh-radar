import pino from "pino";

/**
 * Phase 07 — news-sync logger.
 * T-01 / T-07 mitigation: Naver client secret / Supabase service role key 가 구조화 로그에
 * 포함되더라도 redact paths 로 '[Redacted]' 치환. master-sync 의 logger.ts 패턴을 확장해
 * Naver 헤더까지 커버.
 */
export function createLogger(level = "info") {
  return pino({
    level,
    redact: {
      paths: [
        "cfg.naverClientSecret",
        "cfg.supabaseServiceRoleKey",
        'headers["X-Naver-Client-Secret"]',
        "headers.authorization",
        "*.NAVER_CLIENT_SECRET",
        "*.SUPABASE_SERVICE_ROLE_KEY",
        "*.naverClientSecret",
        "*.supabaseServiceRoleKey",
      ],
      censor: "[Redacted]",
    },
  });
}
