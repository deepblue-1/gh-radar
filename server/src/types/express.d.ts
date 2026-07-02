import "express";

declare global {
  namespace Express {
    interface Request {
      id: string;
      // Phase 14 (D-02) — requireAuth 가 supabase.auth.getUser 검증 후 설정.
      // 인증 미적용 라우트에서는 undefined 이므로 optional.
      userId?: string;
    }
  }
}

export {};
