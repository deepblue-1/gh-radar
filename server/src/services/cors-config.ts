import type { CorsOptions } from "cors";
import { TICK_LIVE_HEADERS } from "@gh-radar/shared";

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

// 로컬 dev 편의: env 미설정 + NODE_ENV !== production 이면 localhost 자동 허용.
// production 배포에서는 반드시 CORS_ALLOWED_ORIGINS 환경변수로 명시 (Phase 2 D-18).
const DEV_DEFAULT_ORIGINS: Array<string | RegExp> = [
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
];

export function corsOptions(): CorsOptions {
  const raw = process.env.CORS_ALLOWED_ORIGINS;
  let allowed = parseAllowedOrigins(raw);
  if (allowed.length === 0 && process.env.NODE_ENV !== "production") {
    allowed = DEV_DEFAULT_ORIGINS;
  }
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
    // Phase 37 D-07 (37-15) — /api/ticks/live 의 X-Tick-* 8종(As-Of · More 는 옛 tickgw 면 없음). 브라우저가 epoch · offset 커서 · 상태 · 더 있음(WR-32)을 읽어야
    // 37-19 훅이 증분을 잇는다(교차 출처 응답 헤더는 노출 목록에 없으면 JS 에서 안 보인다).
    exposedHeaders: ["X-Last-Updated-At", "X-Request-Id", "Retry-After", ...Object.values(TICK_LIVE_HEADERS)],
  };
}
