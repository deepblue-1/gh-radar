import pino from "pino";
import { createGcpLoggingPinoConfig } from "@google-cloud/pino-logging-gcp-config";

/**
 * pino 옵션 — `logger` 와 테스트(redact 검증)가 같은 옵션을 쓰도록 함수로 둔다.
 */
export function loggerOptions() {
  return createGcpLoggingPinoConfig(
    {
      serviceContext: {
        service: "gh-radar-server",
        version: process.env.APP_VERSION ?? "dev",
      },
    },
    {
      level: process.env.LOG_LEVEL ?? "info",
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.headers['x-api-key']",
          "*.supabase_service_role_key",
          "*.access_token",
          "*.refresh_token",
          // Phase 08.1 — Anthropic key redact (로그에 cfg / headers 전체 덤프 시 보호)
          "*.ANTHROPIC_API_KEY",
          "*.anthropicApiKey",
          // Phase 29 (RESEARCH Pitfall 13) — Admin DMA 비밀번호 · relay 공유 비밀이 Express 로그에 남지 않게.
          "*.password",
          "req.body.password",
          'req.headers["x-relay-secret"]',
        ],
        censor: "[REDACTED]",
      },
    },
  );
}

export const logger = pino(loggerOptions());
