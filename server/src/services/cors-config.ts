import type { CorsOptions } from "cors";

export function parseAllowedOrigins(
  raw: string | undefined,
): Array<string | RegExp> {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item) => {
      const m = item.match(/^\/(.*)\/([gimsuy]*)$/);
      return m ? new RegExp(m[1], m[2]) : item;
    });
}

export function corsOptions(): CorsOptions {
  const allowed = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
  return {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const ok = allowed.some((rule) =>
        typeof rule === "string" ? rule === origin : rule.test(origin),
      );
      cb(ok ? null : new Error("CORS_NOT_ALLOWED"), ok);
    },
    credentials: false,
    maxAge: 600,
    exposedHeaders: ["X-Last-Updated-At", "X-Request-Id"],
  };
}
