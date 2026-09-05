/**
 * Phase 15 Plan 12 — relay wss 엔드포인트 해석 (RELAY-01, D-41).
 *
 * `webapp/src/lib/api.ts` 의 `resolveBaseUrl()` 과 **동일한 규약**이다:
 *   `.trim()` → 비어 있지 않으면 사용 → 아니면 모듈 스코프 1회 경고 후 로컬 폴백.
 *
 * ⚠️ `.trim()` 을 빼면 안 된다. Vercel 대시보드에 환경변수를 붙여넣을 때 끝에 개행이
 *    함께 들어가 클라이언트 번들이 깨진 전례가 있다(자동 메모리
 *    `feedback_vercel_env_paste_newline`). `NEXT_PUBLIC_*` 값은 빌드 시점에 번들로
 *    인라인되므로 개행 하나가 런타임에 `new WebSocket("wss://…\n")` 이 되어
 *    `SyntaxError` 로 터진다. 배포 후 `vercel env pull` → `tail -c1 | xxd -p` 가
 *    `0a` 인지 확인하는 절차를 함께 둔다(15-RESEARCH Pitfall 14).
 *
 * 스킴 검증도 여기서 한다 — `https://` 같은 오설정을 연결 시점이 아니라 **해석 시점에**
 * 터뜨려야 "왜 호가창이 조용히 안 뜨지" 를 디버깅하지 않는다.
 */

/** 로컬 relay 개발 서버(`relay/` 기본 포트 8090). 미설정 시 폴백. */
const DEV_FALLBACK_RELAY_WS_URL = "ws://localhost:8090/ws";

/** 경고는 모듈 수명당 1회만 — 호가창은 재접속마다 이 함수를 호출한다. */
let warnedMissingRelayWsUrl = false;

/**
 * relay wss URL 을 해석한다.
 *
 * @returns `NEXT_PUBLIC_RELAY_WS_URL` 을 trim 한 값, 미설정이면 로컬 개발 폴백
 * @throws 스킴이 `ws:` / `wss:` 가 아니면 즉시 throw (오설정 조기 발견)
 */
export function resolveRelayWsUrl(): string {
  const raw = process.env.NEXT_PUBLIC_RELAY_WS_URL?.trim();

  if (raw && raw.length > 0) {
    assertWsScheme(raw);
    return raw;
  }

  if (!warnedMissingRelayWsUrl) {
    warnedMissingRelayWsUrl = true;
    console.warn(
      `[gh-radar] NEXT_PUBLIC_RELAY_WS_URL 미설정 — 개발용 ${DEV_FALLBACK_RELAY_WS_URL} 로 fallback. Vercel/로컬 .env.local 에 relay wss URL 을 설정하세요.`,
    );
  }
  return DEV_FALLBACK_RELAY_WS_URL;
}

/** `ws:` / `wss:` 이외의 스킴이면 throw. `URL` 파싱 실패도 오설정으로 간주한다. */
function assertWsScheme(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `[gh-radar] NEXT_PUBLIC_RELAY_WS_URL 값을 URL 로 해석할 수 없습니다: ${JSON.stringify(url)}`,
    );
  }
  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw new Error(
      `[gh-radar] NEXT_PUBLIC_RELAY_WS_URL 은 ws:// 또는 wss:// 여야 합니다 (현재 ${parsed.protocol}).`,
    );
  }
}
