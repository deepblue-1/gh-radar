import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
 * - `//attacker.com` 같은 protocol-relative URL 차단
 * - fallback: `/scanner`
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

  // Open redirect 방어 (T-06.2-02, ASVS V4.1.1, V5.1.5)
  // - `/` 로 시작하지만 `//` 로 시작하는 protocol-relative URL 은 차단
  const rawNext = searchParams.get("next");
  const safeNext =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/scanner";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
