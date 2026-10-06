'use client';

import { useEffect, useState } from 'react';
import type { AppRole } from '@gh-radar/shared';

import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';

/**
 * 현재 로그인 사용자의 앱 역할 — 본인 역할 RPC `my_app_access()` 1회 (Phase 29 D-01 · D-13).
 *
 * 반환: `undefined` = 아직 모름(세션 판정 전 · 조회 중) · `null` = 로그인 없음 · 허용 표에 없음 · 조회 실패
 * (보수적) · 그 밖 = 역할. 구조는 `use-is-theme-admin.ts` 그대로다(user 변경 시 재조회).
 *
 * ⚠️ **표시용이다 — 권한 장치가 아니다.** 사이드바의 Admin 그룹 노출 같은 오진입 줄이기에만 쓴다. 실제 차단은
 * middleware(`access-gate.ts` — 매 요청 같은 RPC)와 Express `requireAdmin` 이 한다. 그래서 실패를 `null` 로
 * 접어도(메뉴가 안 보일 뿐) 안전하다.
 *
 * 결과는 조회한 사용자 id 에 묶는다 — 계정이 바뀐 직후 이전 사용자의 역할로 한 박자 그리지 않게.
 */

const ROLES: readonly AppRole[] = ['admin', 'trader', 'viewer'];

function asRole(value: unknown): AppRole | null {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value) ? (value as AppRole) : null;
}

export function useAppRole(): AppRole | null | undefined {
  const { user, isLoading } = useAuth();
  const userId = user?.id ?? null;
  const [result, setResult] = useState<{ userId: string; role: AppRole | null } | null>(null);

  useEffect(() => {
    if (userId === null) return;
    let cancelled = false;
    void (async () => {
      let role: AppRole | null = null;
      try {
        const { data, error } = await createClient().rpc('my_app_access');
        role = error ? null : asRole(data);
      } catch {
        role = null;
      }
      if (!cancelled) setResult({ userId, role });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (userId === null) return isLoading ? undefined : null;
  return result?.userId === userId ? result.role : undefined;
}
