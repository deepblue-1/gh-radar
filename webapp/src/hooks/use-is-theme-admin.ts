'use client';

import { useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';
import { currentUserIsThemeAdmin } from '@/lib/theme-api';

/**
 * 현재 로그인 사용자가 테마 운영자(admin 허용목록)인지 — SECURITY DEFINER RPC is_theme_admin() 1회 조회.
 *
 * 비로그인 / 조회 전 / 실패 시 false(보수적 — UI 게이트는 false 면 편집 버튼 숨김). 권한의
 * 실 강제는 RLS(admin_update_system_themes / admin_write_system_theme_stocks)가 DB 레벨에서
 * 수행하므로, 이 훅은 어디까지나 표시용. user 변경 시 재조회.
 */
export function useIsThemeAdmin(): boolean {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createClient();
        const ok = await currentUserIsThemeAdmin(supabase);
        if (!cancelled) setIsAdmin(ok);
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return isAdmin;
}
