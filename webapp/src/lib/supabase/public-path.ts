/**
 * 공개 prefix — 로그인 없이 접근 가능한 경로 시작부.
 *
 * - D-10: `/login` 로그인 화면 · `/auth` OAuth callback
 * - Phase 22 D-11: `/privacy` 개인정보처리방침 — 스토어·테스터가 로그인 없이 연다
 *
 * 판정은 「prefix 와 같거나 prefix + `/` 로 시작」 하는 경계 비교라, 이름이 비슷한
 * 이웃 경로(`/privacy-x` · `/loginx` 등)는 열리지 않는다.
 *
 * 미들웨어(`middleware.ts`)에서 분리한 이유: 미들웨어는 `next/server`·`@supabase/ssr` 를
 * import 해 jsdom 단위 테스트가 무겁다 — 이 모듈은 import 가 없는 순수 함수라 판정 표를
 * 바로 테스트할 수 있다.
 */
export const PUBLIC_PREFIXES: readonly string[] = ["/login", "/auth", "/privacy"];

/** `pathname` 이 공개 prefix 와 같거나 `prefix/` 로 시작하면 true. */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
