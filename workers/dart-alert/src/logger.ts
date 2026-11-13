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
 * - 경로는 맨 위와 한 단계 아래(`*.`)를 덮는다(pino 의 `*` 는 한 단계만 매칭). 그보다 깊은 곳(진짜 AxiosError 의
 *   `err.response.config` 등)과 문자열 안의 토큰 경로 · `crtfc_key=` 는 `formatters.log` 의 `redactDeep` 이 가린다(리뷰 WR-55).
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
  "dartApiKey2",
  "telegramBotToken",
  "telegramChatId",
  "supabaseServiceRoleKey",
] as const;

/** 요청 헤더 · axios 설정 · 요청 객체는 통째로 가린다(URL · 쿼리 인자 · 본문을 품는다) */
const SECRET_CONTAINERS = ["headers", "config", "request"] as const;

export const REDACT_PATHS: string[] = [...SECRET_KEYS, ...SECRET_CONTAINERS].flatMap((k) => [k, `*.${k}`]);

const CENSOR = "[redacted]";
const SECRET_NAMES = new Set<string>([...SECRET_KEYS, ...SECRET_CONTAINERS].map((k) => k.toLowerCase()));
/** 이보다 깊은 값은 「[depth]」 — 소켓 같은 큰 객체를 끝없이 걷지 않게 */
const MAX_DEPTH = 8;

/**
 * 문자열 안의 비밀 꼴을 가린다 — 봇 토큰(`/bot<숫자>:<토큰>` 경로 · 토큰 꼴 그대로) · OpenDART 키 쿼리(`crtfc_key=…`).
 * 오류 문구 · 스택 · 메모가 URL 을 품고 들어와도 새지 않게.
 */
export function scrubSecrets(s: string): string {
  return s
    .replace(/bot\d+:[A-Za-z0-9_-]+/g, `bot${CENSOR}`)
    .replace(/\b\d{5,}:[A-Za-z0-9_-]{20,}/g, CENSOR)
    .replace(/(crtfc_key=)[^&\s"'#]+/gi, `$1${CENSOR}`);
}

function isPlainObject(v: object): boolean {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * 깊이와 상관없이 비밀 이름(SECRET_KEYS · SECRET_CONTAINERS)의 값을 가리고 문자열을 scrubSecrets 로 걸러 **복사본**을 만든다(리뷰 WR-55).
 * pino redact 경로는 맨 위와 한 단계 아래(`*.`)만 맞아, 진짜 AxiosError 의 `err.response.config.params.crtfc_key` ·
 * `err.response.request`(경로 `/bot<토큰>/…`) 같은 두 단계 아래가 그대로 나갔다.
 * - Error 는 같은 프로토타입의 복사본으로 — pino 의 err 직렬화(type · message · stack · cause)가 그대로 동작한다.
 * - toJSON 이 있는 객체(Date · URL · Buffer 등)는 그 JSON 꼴을 거른다. 그 밖 객체는 JSON 이 쓰는 자기 열거 속성만 옮긴다.
 * - 원본은 바꾸지 않는다 · 순환 참조는 「[circular]」.
 */
export function redactDeep(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof value === "string") return scrubSecrets(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  if (depth >= MAX_DEPTH) return "[depth]";
  seen.add(value);
  const walk = (v: unknown) => redactDeep(v, depth + 1, seen);
  const copyEntries = (src: object, out: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(src)) out[k] = SECRET_NAMES.has(k.toLowerCase()) ? CENSOR : walk(v);
    return out;
  };
  if (Array.isArray(value)) return value.map(walk);
  if (value instanceof Error) {
    const out = Object.create(Object.getPrototypeOf(value) as object) as Record<string, unknown>;
    for (const k of ["name", "message", "stack", "cause"] as const) {
      if (Object.prototype.hasOwnProperty.call(value, k)) {
        // 대개 열거되지 않는 자기 속성 — 같은 모양으로 옮긴다(JSON 에 두 번 나오지 않게)
        Object.defineProperty(out, k, { value: walk((value as unknown as Record<string, unknown>)[k]), enumerable: false, writable: true, configurable: true });
      }
    }
    return copyEntries(value, out);
  }
  const toJSON = (value as { toJSON?: unknown }).toJSON;
  if (!isPlainObject(value) && typeof toJSON === "function") return walk((toJSON as () => unknown).call(value));
  return copyEntries(value, {});
}

/**
 * @param destination 테스트가 출력 문자열을 받을 때만 넘긴다(기본 stdout).
 */
export function createLogger(level = "info", destination?: DestinationStream) {
  const options: pino.LoggerOptions = {
    level,
    // 깊은 가림(redactDeep) 뒤에 pino redact 경로가 한 번 더 — 둘 다 마지막 그물이다(1차는 safeErrorFields · telegramSafeFields)
    formatters: { log: (obj) => redactDeep(obj) as Record<string, unknown> },
    redact: { paths: REDACT_PATHS, censor: CENSOR },
  };
  return destination ? pino(options, destination) : pino(options);
}
