import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * 공개 prefix — 로그인 없이 접근 가능한 경로 시작부
 * (D-10: /login 로그인 화면, /auth OAuth callback 등)
 */
const PUBLIC_PREFIXES = ["/login", "/auth"];

/**
 * updateSession — @supabase/ssr 공식 패턴 기반 세션 쿠키 동기화 + 라우트 가드.
 *
 * 핵심 책임:
 * 1. 3단 쿠키 동기화 (request → response 재생성 → response.cookies.set)
 *    → Pitfall 1 방지 (stale session → 무한 리다이렉트 루프)
 * 2. `supabase.auth.getUser()` 호출로 JWT refresh rotation 트리거
 *    → `getSession()` 금지 (Anti-pattern: 서명 미검증)
 * 3. PUBLIC_PREFIXES 공개 whitelist 기반 기본 차단 — 공개 exact 경로는 **없다**
 *    - D-10: 비로그인 사용자가 비공개 경로 접근 → /login?next=<원래경로> 302
 *    - 홈("/")도 인증 표면이다 — 미인증은 /login?next=%2F 로 튕긴다
 *    - D-12: 로그인 사용자가 /login 접근 → / 302 (루프 방지 — "/" 는 인증 통과 경로)
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
  const isPublic = PUBLIC_PREFIXES.some(
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

  // D-12: 로그인 상태에서 /login 접근 시 → / 리다이렉트 (루프 방지)
  //        홈이 인증 표면이 됐으므로 로그인 직후 착지점은 홈이다. "/" 는 인증
  //        사용자에게 통과되는 경로라 위의 차단 분기로 되돌아오지 않는다.
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
