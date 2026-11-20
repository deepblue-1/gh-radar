"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { clearQueryCache } from "@/lib/query-cache";
import { unregisterThisDeviceBeforeSignOut } from "@/lib/push/push-devices-api";
import type { User } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  displayName: string | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const NOOP_SIGN_OUT = async () => {
  /* Provider 바깥 기본 no-op */
};

const EMPTY: AuthState = {
  user: null,
  displayName: null,
  isLoading: false,
  signOut: NOOP_SIGN_OUT,
};

const AuthContext = createContext<AuthState | null>(null);

function resolveDisplayName(user: User | null): string | null {
  if (!user) return null;
  const metaName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined);
  if (metaName) return metaName;
  const email = user.email;
  if (email) return email.split("@")[0] ?? email;
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    ...EMPTY,
    isLoading: true,
  });

  useEffect(() => {
    const supabase = createClient();

    // signOut helper — weekly-wine-bot UX 와 동일 (hard redirect)
    const signOut = async () => {
      // Phase 40 D-15 — 앱이면 이 기기 푸시 행을 먼저 지운다(같은 폰 다른 계정에 앞 사람 체결이 가지 않게). 3초 상한 ·
      // throw 없음 — 실패해도 로그아웃은 진행되고, 기기 키를 버리고 표시를 남겨 다음 로그인 때 앱 시작 정리(push-session
      // handover · 리뷰 WR-07)가 서버에 남은 행을 지운다. 세션이 살아 있을 때 불러야
      // 인증된 DELETE 가 되므로 supabase signOut 보다 앞이다.
      await unregisterThisDeviceBeforeSignOut();
      await supabase.auth.signOut();
      window.location.href = "/login";
    };

    // 페이지 이동 캐시(lib/query-cache)에는 사용자별 데이터(내 테마)가 있다 — 사용자가
    // 바뀌면 비운다. TOKEN_REFRESHED 처럼 같은 사용자로 다시 불리는 경우는 유지.
    let lastUserId: string | null | undefined;

    function handleSession(session: { user: User } | null) {
      const user = session?.user ?? null;
      const userId = user?.id ?? null;
      if (lastUserId !== undefined && lastUserId !== userId) clearQueryCache();
      lastUserId = userId;
      if (!user) {
        setState({ ...EMPTY, signOut });
        return;
      }
      setState({
        user,
        displayName: resolveDisplayName(user),
        isLoading: false,
        signOut,
      });
    }

    /*
      `getSession()` 결과 반영 — ★ `error` 가 있으면 상태를 바꾸지 않는다.
      auth-js 는 만료 토큰 갱신이 **망에 막히면** 세션을 스토리지에 그대로 둔 채 `{session:null, error}` 를 준다
      (GoTrueClient.__loadSession). 이것을 로그아웃으로 받으면 앱 복귀 직후 망이 아직 안 붙은 순간 `user` 가 null 로
      떨어져 사이드바의 트레이딩 · 분석 · My page · Admin · 계정 줄이 사라지고 relay 소켓까지 닫혔다(debug
      ios-resume-sidebar-stall · relay 쪽은 mobile-bg-resume-gaps 3b 에서 같은 이유로 이미 고쳤다).
      진짜 로그아웃(무효 refresh token)은 auth-js 가 세션을 지우고 SIGNED_OUT 을 내므로 아래 구독이 null 로 받는다.
    */
    const applyGetSession = ({
      data: { session },
      error,
    }: Awaited<ReturnType<typeof supabase.auth.getSession>>) => {
      if (error) {
        console.warn("[auth] 세션 확인 실패 — 로그인 상태 유지", error.name);
        return;
      }
      handleSession(session);
    };

    // 초기 로딩: 쿠키에서 세션 읽기 (실패면 아래 2초 안전장치가 isLoading 을 푼다)
    supabase.auth.getSession().then(applyGetSession);

    // 후속 이벤트 구독: SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSession(session);
    });

    // 안전장치: 2초 내 resolve 안 되면 강제 해제
    const timeout = setTimeout(() => {
      setState((prev) =>
        prev.isLoading ? { ...EMPTY, signOut } : prev
      );
    }, 2000);

    // bfcache 복원 시 세션 재검증 (외부 링크 → 뒤로가기)
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        supabase.auth.getSession().then(applyGetSession);
      }
    };
    window.addEventListener("pageshow", handlePageShow);

    // 탭 복귀 시 세션 재검증
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        supabase.auth.getSession().then(applyGetSession);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return <AuthContext value={state}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  return ctx ?? EMPTY;
}
