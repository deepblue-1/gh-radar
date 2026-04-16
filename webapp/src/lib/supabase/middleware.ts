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
 * updateSession — @supabase/ssr 공식 패턴 기반 세션 쿠키 동기화 helper.
 *
 * 핵심 책임 (Plan 06.2-01 scope):
 * 1. 3단 쿠키 동기화 (request → response 재생성 → response.cookies.set)
 *    → Pitfall 1 방지 (stale session → 무한 리다이렉트 루프)
 * 2. `supabase.auth.getUser()` 호출로 JWT refresh rotation 트리거
 *    → `getSession()` 금지 (Anti-pattern: 서명 미검증)
 * 3. PUBLIC_PREFIXES / PUBLIC_EXACT 상수 정의 (가드 로직은 Plan 03 에서 활성화)
 *
 * NOTE: 리다이렉트 가드(미인증 차단)는 Plan 03 에서 활성화된다.
 * 이번 plan 은 세션 쿠키 동기화 전용 — `supabaseResponse` 그대로 반환.
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
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  // TODO(Plan 06.2-03): 아래 가드 블록을 활성화하여 미인증 차단 수행.
  // 현재는 세션 쿠키 동기화 전용 — PUBLIC 판별만 계산해두고 리다이렉트는 생략.
  // if (!user && !isPublic) {
  //   const url = request.nextUrl.clone();
  //   url.pathname = "/login";
  //   return NextResponse.redirect(url);
  // }
  // if (user && pathname.startsWith("/login")) {
  //   const url = request.nextUrl.clone();
  //   url.pathname = "/scanner";
  //   return NextResponse.redirect(url);
  // }
  void user;
  void isPublic;

  return supabaseResponse;
}
