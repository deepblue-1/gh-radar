import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * 공개 prefix — 로그인 없이 접근 가능한 경로 시작부
 * (D-10: /login 로그인 화면, /auth OAuth callback 등)
 */
const PUBLIC_PREFIXES = ["/login", "/auth"];

/**
 * 공개 exact 매치 — 정확히 일치해야 공개인 경로
 * (루트 "/" 는 공개)
 */
const PUBLIC_EXACT = ["/"];

/**
 * updateSession — @supabase/ssr 공식 패턴 기반 세션 쿠키 동기화 + 라우트 가드.
 *
 * 핵심 책임:
 * 1. 3단 쿠키 동기화 (request → response 재생성 → response.cookies.set)
 *    → Pitfall 1 방지 (stale session → 무한 리다이렉트 루프)
 * 2. `supabase.auth.getUser()` 호출로 JWT refresh rotation 트리거
 *    → `getSession()` 금지 (Anti-pattern: 서명 미검증)
 * 3. PUBLIC_PREFIXES / PUBLIC_EXACT 공개 whitelist 기반 기본 차단
 *    - D-10: 비로그인 사용자가 비공개 경로 접근 → /login?next=<원래경로> 302
 *    - D-12: 로그인 사용자가 /login 접근 → /scanner 302 (루프 방지)
 *    - D-13: /api/* 는 webapp middleware 대상 외 (Express Cloud Run 별도 도메인)
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Pitfall 1 Anti-Pattern 준수: getSession() 대신 getUser() 사용
  // — Auth 서버 JWT 서명 검증 + refresh rotation 동반
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublic =
    PUBLIC_EXACT.includes(pathname) ||
    PUBLIC_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );

  // D-10: 기본 차단 + 공개 whitelist — 비로그인 사용자가 비공개 경로 접근 시
  //       /login?next=<원래경로+쿼리> 로 302 리다이렉트
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // D-12: 로그인 상태에서 /login 접근 시 → /scanner 리다이렉트 (루프 방지)
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/scanner";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
