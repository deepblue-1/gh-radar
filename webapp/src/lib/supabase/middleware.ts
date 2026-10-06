import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { decideAccess, type AccessRole } from "./access-gate";
import { isPublicPath } from "./public-path";

/**
 * updateSession — @supabase/ssr 공식 패턴 기반 세션 쿠키 동기화 + 라우트 가드.
 *
 * 핵심 책임:
 * 1. 3단 쿠키 동기화 (request → response 재생성 → response.cookies.set)
 *    → Pitfall 1 방지 (stale session → 무한 리다이렉트 루프)
 * 2. `supabase.auth.getUser()` 호출로 JWT refresh rotation 트리거
 *    → `getSession()` 금지 (Anti-pattern: 서명 미검증)
 * 3. `isPublicPath`(`./public-path.ts` 의 PUBLIC_PREFIXES) 공개 whitelist 기반 기본 차단 — 공개 exact 경로는 **없다**
 *    - D-10: 비로그인 사용자가 비공개 경로 접근 → /login?next=<원래경로> 302
 *    - 홈("/")도 인증 표면이다 — 미인증은 /login?next=%2F 로 튕긴다
 *    - D-12: 로그인 사용자가 /login 접근 → / 302 (루프 방지 — "/" 는 인증 통과 경로)
 *    - D-13: /api/* 는 webapp middleware 대상 외 (Express Cloud Run 별도 도메인)
 * 4. [Phase 29 D-01 · D-04 · D-21] 역할 게이트 — 로그인 사용자의 비공개 요청마다 본인 역할 RPC(아래 호출)를
 *    **1회** 불러 역할을 얻고, 판정은 `./access-gate.ts` 의 `decideAccess`(판정 표의 정본)에 맡긴다.
 *    - 역할 없음 · 조회 오류 → /pending (fail closed) · 역할 있음 + /pending → / · /admin/* 은 admin 만 ·
 *      viewer 는 트레이딩 · 분석 · 챗봇 · My page 에서 /
 *    - JWT 커스텀 클레임 · 캐시 없음 — 강등 · 해제가 다음 페이지 이동부터 막혀야 한다(D-04).
 *      요청당 Supabase 1왕복이 늘어나는 지연은 감수한다(RESEARCH A5).
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
  const isPublic = isPublicPath(pathname);

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

  // [Phase 29 D-01 · D-04 · D-21] 역할 게이트 — 판정 표는 access-gate.ts 가 정본, 여기서는 호출만.
  if (user && !isPublic) {
    const { data, error } = await supabase.rpc("my_app_access");
    const decision = decideAccess({
      pathname,
      role: (data as AccessRole | null) ?? null,
      roleError: error !== null,
    });
    if (decision.kind === "redirect") {
      const url = request.nextUrl.clone();
      url.pathname = decision.to;
      url.search = "";
      const redirect = NextResponse.redirect(url);
      // getUser() 가 이 요청에서 토큰을 회전했다면 새 세션 쿠키가 supabaseResponse 에만 실려 있다 —
      // 리다이렉트 응답으로 옮기지 않으면 브라우저는 이미 소비된 refresh 토큰을 다음 요청에 다시 보낸다.
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirect.cookies.set(cookie);
      });
      return redirect;
    }
  }

  return supabaseResponse;
}
