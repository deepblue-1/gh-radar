import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSafeInternalPath } from "@/lib/safe-path";

/**
 * OAuth callback route — Supabase PKCE code exchange.
 *
 * 책임:
 * 1. `?code` 로 `exchangeCodeForSession(code)` 실행 → 세션 쿠키 저장
 * 2. `?error=access_denied` (Google 취소) → `/login?error=oauth_denied`
 * 3. 실패 → `/login?error=auth_failed`
 * 4. 성공 → `${origin}${safeNext}` 리다이렉트
 *
 * Security (T-06.2-02 Open redirect mitigation):
 * - `next` 파라미터는 `/` 로 시작하는 상대 경로만 허용
 * - `//attacker.com` 같은 protocol-relative URL 차단 · 역슬래시·제어문자 차단(`lib/safe-path.ts` — WR-01)
 * - fallback: `/` (홈 — 홈이 인증 표면이라 로그인 직후 착지점이다)
 *
 * [Phase 06.2 변경사항] whitelist/role 체크 없음 (D-04).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");

  // Google OAuth 취소 처리 (Pattern 4)
  if (oauthError === "access_denied") {
    return NextResponse.redirect(`${origin}/login?error=oauth_denied`);
  }

  // Open redirect 방어 (T-06.2-02, ASVS V4.1.1, V5.1.5) — WR-01: 판정은 lib/safe-path.ts 한 곳
  // (로그인 · 네이티브 navigate 와 같은 함수). `/` 시작 · `//` 금지 · 역슬래시·제어문자 금지.
  const rawNext = searchParams.get("next");
  const safeNext = isSafeInternalPath(rawNext) ? rawNext : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
