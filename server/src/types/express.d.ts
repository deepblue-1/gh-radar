import "express";

declare global {
  namespace Express {
    interface Request {
      id: string;
      // Phase 14 (D-02) — requireAuth 가 supabase.auth.getUser 검증 후 설정.
      // 인증 미적용 라우트에서는 undefined 이므로 optional.
      userId?: string;
      // Phase 29 (D-01 · D-07) — requireAuth 가 함께 싣는 로그인 이메일(원문 · Google 계정에 따라 없을 수 있다).
      userEmail?: string | null;
      // Phase 29 (D-07) — requireAdmin 이 app_users role = admin 을 확인한 뒤 싣는 정규화 이메일(소문자 · trim).
      // 자기 보호(SELF_LOCKOUT) · 감사 로그 · relay `x-admin-email` 은 이 값 하나만 쓴다.
      adminEmail?: string;
    }
  }
}

export {};
