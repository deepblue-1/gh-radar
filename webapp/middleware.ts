import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // 정적 자산 + mockup 디렉터리 제외 (RESEARCH Pattern 2)
    // - _next/static, _next/image: Next.js 내부 자산
    // - favicon.ico: 파비콘
    // - mockup: Phase 06.2 디자인 회귀 허용 경로 (Plan 10 에서 제거 예정)
    // - 정적 이미지 확장자 (svg/png/jpg/jpeg/gif/webp)
    "/((?!_next/static|_next/image|favicon\\.ico|mockup|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
