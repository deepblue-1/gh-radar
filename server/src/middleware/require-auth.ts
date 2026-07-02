import type { RequestHandler } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Phase 14 (D-02) — gh-radar 서버 최초의 사용자 인증 미들웨어. 챗 라우트에만 적용.
 *
 * `Authorization: Bearer <supabase access_token>` 를 `supabase.auth.getUser(jwt)` 로
 * 검증한다(서명·만료·revoke 처리는 supabase-js 내장 — 신규 JWT 의존성 0). 성공 시
 * `req.userId` 를 설정하고 next() 로 위임한다 (T-14-02 Spoofing mitigate).
 *
 * ⚠️ SSE 라우트는 `res.writeHead(200, ...)` 이후엔 상태코드를 변경할 수 없다 →
 * JWT 검증은 반드시 SSE 헤더를 쓰기 전(미들웨어 단계)에 끝내야 하며, 401 은 스트림이
 * 아니라 일반 JSON 으로 반환한다 (RESEARCH Pattern 3 / Anti-pattern).
 *
 * 히스토리 read/write 는 서비스롤 클라가 `WHERE user_id = req.userId` 명시 필터로 직접
 * 수행한다 — RLS 는 defense-in-depth 방어선이지 서버 경로의 실제 필터가 아니다.
 */
export function requireAuth(): RequestHandler {
  return async (req, res, next) => {
    const auth = req.header("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "로그인이 필요합니다." },
      });
      return;
    }

    const supabase = req.app.locals.supabase as SupabaseClient;
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "세션이 만료되었습니다." },
      });
      return;
    }

    req.userId = data.user.id;
    next();
  };
}
