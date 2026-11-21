'use client';

import { useEffect, useState } from 'react';
import { ADMIN_MENU_KEYS, type AdminMenu, type AppRole } from '@gh-radar/shared';

import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';

/**
 * 현재 로그인 trader 에게 열린 어드민 메뉴 — 본인 메뉴 RPC `my_admin_menus()` 1회 (quick 261121-n1b).
 *
 * `role` 은 `useAppRole()` 결과를 그대로 넘긴다. trader 일 때만 조회하고, admin · viewer · null · undefined 는 RPC 없이
 * 빈 배열(admin 은 메뉴와 무관하게 전부 — 사이드바가 역할로 판정한다). 결과는 `ADMIN_MENU_KEYS` 밖 값을 지우고 그 순서로 낸다.
 * 실패 · throw 도 빈 배열(메뉴가 안 보일 뿐).
 *
 * ⚠️ **표시용이다 — 권한 장치가 아니다.** 사이드바 노출에만 쓴다. 실제 차단은 middleware(`access-gate.ts` — trader 의
 * `/admin` 요청마다 같은 RPC)와 Express `requireAdminOrMenu` 가 한다.
 *
 * 구조는 `use-app-role.ts` 그대로다 — 결과를 조회한 사용자 id 에 묶어 계정이 바뀐 직후 이전 사용자의 메뉴로 그리지 않는다.
 */

const NONE: readonly AdminMenu[] = [];

function asMenus(value: unknown): readonly AdminMenu[] {
  if (!Array.isArray(value)) return NONE;
  const picked = ADMIN_MENU_KEYS.filter((k) => value.includes(k));
  return picked.length === 0 ? NONE : picked;
}

export function useAdminMenus(role: AppRole | null | undefined): readonly AdminMenu[] {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const enabled = role === 'trader' && userId !== null;
  const [result, setResult] = useState<{ userId: string; menus: readonly AdminMenu[] } | null>(null);

  useEffect(() => {
    if (!enabled || userId === null) return;
    let cancelled = false;
    void (async () => {
      let menus: readonly AdminMenu[] = NONE;
      try {
        const { data, error } = await createClient().rpc('my_admin_menus');
        menus = error ? NONE : asMenus(data);
      } catch {
        menus = NONE;
      }
      if (!cancelled) setResult({ userId, menus });
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, userId]);

  if (!enabled) return NONE;
  return result?.userId === userId ? result.menus : NONE;
}
