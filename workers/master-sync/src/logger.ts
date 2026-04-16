import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.appkey",
      "req.headers.appsecret",
      "*.access_token",
      "*.refresh_token",
      "*.cano",
      "*.acnt_prdt_cd",
      "*.kisAppSecret",
      "*.supabaseServiceRoleKey",
    ],
    censor: "[REDACTED]",
  },
});
