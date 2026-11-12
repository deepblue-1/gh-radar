import pino, { type DestinationStream } from "pino";

/**
 * Phase 43-03 — dart-alert 로거(비밀 가림).
 *
 * OpenDART 키(`crtfc_key` — 쿼리 인자로 실려 URL · params 에 같이 남는다) · 봇 토큰(`/bot<토큰>/sendMessage`
 * 경로에 실린다) · 방 id(`chat_id`) · 요청 URL · 쿼리 인자 · 요청 헤더 · axios 설정(`config`) · 요청 객체
 * (`request`) · 설정 객체(DartAlertConfig)의 비밀 필드를 로그 단계에서 「[redacted]」 로 가린다.
 *
 * - 이것은 마지막 그물이다 — 실패 로그는 그래도 `safeErrorFields` 의 안전 필드(상태 · 코드 · 짧은 문구 ·
 *   종류)만 쓴다.
 * - `url` · `chat_id` 를 통째로 가리므로, 방 id 끝자리처럼 보여야 하는 값은 `newChatIdTail` 같은 다른
 *   필드 이름으로 쓴다.
 * - 경로는 맨 위와 한 단계 아래(`*.`)를 덮는다(pino 의 `*` 는 한 단계만 매칭).
 */
const SECRET_KEYS = [
  "crtfc_key",
  "token",
  "botToken",
  "authorization",
  "url",
  "params",
  "chat_id",
  // 설정 객체(cfg)를 통째로 로그로 써도 새지 않게 — DartAlertConfig 의 비밀 필드
  "dartApiKey",
  "telegramBotToken",
  "telegramChatId",
  "supabaseServiceRoleKey",
] as const;

/** 요청 헤더 · axios 설정 · 요청 객체는 통째로 가린다(URL · 쿼리 인자 · 본문을 품는다) */
const SECRET_CONTAINERS = ["headers", "config", "request"] as const;

export const REDACT_PATHS: string[] = [...SECRET_KEYS, ...SECRET_CONTAINERS].flatMap((k) => [k, `*.${k}`]);

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
