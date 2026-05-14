import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "*.supabaseServiceRoleKey",
      "*.kiwoomAppkey",
      "*.kiwoomSecretkey",
      "headers.authorization",       // Bearer token
      "*.token",
      "*.access_token",
      "*.accessToken",
    ],
    censor: "[REDACTED]",
  },
});
