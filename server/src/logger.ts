import pino from "pino";
import { createGcpLoggingPinoConfig } from "@google-cloud/pino-logging-gcp-config";

export const logger = pino(
  createGcpLoggingPinoConfig(
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
        ],
        censor: "[REDACTED]",
      },
    },
  ),
);
