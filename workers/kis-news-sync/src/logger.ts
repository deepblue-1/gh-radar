import pino, { type DestinationStream } from "pino";

/**
 * Phase 41-06 — kis-news-sync 로거 (SC-5 안전 로그).
 *
 * 한투 앱키 · 시크릿 · 접근 토큰 · 요청 헤더 · axios 설정(`config` — 헤더와 본문을 품는다)을
 * 로그 단계에서 「[redacted]」 로 가린다. 뒤 플랜(41-12 · 41-13 · 41-08)이 어떤 객체를 로그로
 * 써도 키 · 토큰이 출력에 실리지 않게 하는 마지막 그물이다 — 실패 로그는 그래도 41-13
 * `safeErrorFields` 의 안전 필드만 쓴다.
 *
 * 경로는 맨 위와 한 단계 아래(`*.`)를 덮는다(pino 의 `*` 는 한 단계만 매칭).
 */
const SECRET_KEYS = [
  "appkey",
  "appsecret",
  "access_token",
  "authorization",
  "token",
  // 설정 객체(cfg)를 통째로 로그로 써도 새지 않게 — KisNewsConfig 의 비밀 필드
  "kisAppKey",
  "kisAppSecret",
  "supabaseServiceRoleKey",
] as const;

/** 요청 헤더 · axios 설정은 통째로 가린다 */
const SECRET_CONTAINERS = ["headers", "config"] as const;

export const REDACT_PATHS: string[] = [...SECRET_KEYS, ...SECRET_CONTAINERS].flatMap((k) => [
  k,
  `*.${k}`,
]);

/**
 * @param destination 테스트가 출력 문자열을 받을 때만 넘긴다(기본 stdout).
 */
export function createLogger(level = "info", destination?: DestinationStream) {
  const options: pino.LoggerOptions = {
    level,
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
  };
  return destination ? pino(options, destination) : pino(options);
}
