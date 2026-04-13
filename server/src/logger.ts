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
          "*.supabase_service_role_key",
          "*.access_token",
          "*.refresh_token",
        ],
        censor: "[REDACTED]",
      },
    },
  ),
);
