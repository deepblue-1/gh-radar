"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
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
      await supabase.auth.signOut();
      window.location.href = "/login";
    };

    function handleSession(session: { user: User } | null) {
      const user = session?.user ?? null;
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

    // 초기 로딩: 쿠키에서 세션 읽기
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session);
    });

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
        supabase.auth.getSession().then(({ data: { session } }) => {
          handleSession(session);
        });
      }
    };
    window.addEventListener("pageshow", handlePageShow);

    // 탭 복귀 시 세션 재검증
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        supabase.auth.getSession().then(({ data: { session } }) => {
          handleSession(session);
        });
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
  if (!ctx) {
    throw new Error("useAuth must be used within <AuthProvider>");
  }
  return ctx;
}
