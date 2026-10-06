/**
 * 역할 게이트 판정 — Phase 29 D-01 · D-04 · D-21 (ADMIN-02).
 *
 * **판정 표의 정본은 이 파일 하나다 — middleware(`middleware.ts`)는 호출만 한다.**
 * 로그인한 사용자의 비공개 요청마다 middleware 가 `my_app_access()` RPC 를 1회 불러 역할을 얻고,
 * 그 결과를 여기에 넘겨 통과 / 리다이렉트를 받는다.
 *
 * - D-01: 허용 표(`app_users`)에 없는 로그인 사용자(역할 null)는 앱 어디서든 승인 대기 화면만 본다.
 *   역할 조회 오류도 같다 — fail closed. 조회 실패를 「허용」 으로 위장하지 않는다.
 * - D-04: 매 요청 판정이라 강등 · 허용 해제는 다음 페이지 이동부터 막힌다(JWT 클레임 · 캐시 없음).
 * - D-02: `/admin` 은 admin 만. trader 는 Admin 을 뺀 전부.
 * - D-21: viewer 는 스캐너 · 뉴스 · 테마만 — 트레이딩 · 분석 · 챗봇 · My page 는 홈으로 돌린다.
 *
 * 접두 판정은 `public-path.ts` 와 같은 경계 비교(「prefix 와 같거나 prefix + `/` 로 시작」)라 이름이 비슷한
 * 이웃 경로(`/administrator` · `/mentor`)는 영향받지 않는다.
 *
 * 미들웨어에서 분리한 이유(`public-path.ts` 선례): middleware 는 `next/server` · `@supabase/ssr` 를 import 해
 * jsdom 단위 테스트가 무겁다 — 이 모듈은 import 가 없는 순수 함수라 판정 표를 바로 테스트할 수 있다.
 */

/** `@gh-radar/shared` 의 `AppRole` 과 같은 값 — import 없이 두어 순수 모듈을 유지한다. */
export type AccessRole = "admin" | "trader" | "viewer";

export type AccessDecision = { kind: "next" } | { kind: "redirect"; to: string };

/** 승인 대기 화면 — 로그인은 필요하지만 역할은 필요 없다(공개 prefix 아님). */
export const PENDING_PATH = "/pending";

/** Admin 표면 — admin 역할만. */
export const ADMIN_PREFIX = "/admin";

/** viewer 가 열 수 없는 표면(D-21) — 트레이딩 · 분석 · 챗봇 · My page. */
export const VIEWER_BLOCKED_PREFIXES: readonly string[] = [
  "/trading",
  "/analytics",
  "/chat",
  "/me",
];

const HOME_PATH = "/";

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * 로그인한 사용자의 비공개 요청 하나를 판정한다.
 *
 * 규칙 순서(먼저 맞는 것이 이긴다):
 * 1. 역할 조회 오류 또는 역할 없음 → `/pending` 자체만 통과, 나머지는 `/pending`
 * 2. 역할이 있는데 `/pending` → `/`
 * 3. `/admin` 접두이고 admin 이 아님 → `/`
 * 4. viewer 이고 차단 접두 → `/`
 * 5. 통과
 */
export function decideAccess(input: {
  pathname: string;
  role: AccessRole | null;
  roleError: boolean;
}): AccessDecision {
  const { pathname, role, roleError } = input;

  if (roleError || role === null) {
    return pathname === PENDING_PATH
      ? { kind: "next" }
      : { kind: "redirect", to: PENDING_PATH };
  }

  if (pathname === PENDING_PATH) {
    return { kind: "redirect", to: HOME_PATH };
  }

  if (matchesPrefix(pathname, ADMIN_PREFIX) && role !== "admin") {
    return { kind: "redirect", to: HOME_PATH };
  }

  if (
    role === "viewer" &&
    VIEWER_BLOCKED_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))
  ) {
    return { kind: "redirect", to: HOME_PATH };
  }

  return { kind: "next" };
}
