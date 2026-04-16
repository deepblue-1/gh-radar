"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * /login 페이지 — Phase 06.2 Plan 03
 *
 * D-07, D-14, D-15 이행:
 * - Google OAuth 전용 로그인 (signInWithOAuth + prompt=select_account)
 * - Card 중앙 정렬 레이아웃 (AppShell 감싸지 않음 — full-bleed)
 * - ?error= 4종 한글 메시지 매핑 (auth_failed / oauth_denied / session_expired / unknown)
 * - Suspense 래핑 (useSearchParams 필수 조건 — Next.js 15)
 * - Open redirect 이중 방어 (?next= 파라미터 safeNext 가드 — T-06.2-11)
 */

const ERROR_MESSAGES: Record<string, string> = {
  "auth_failed": "로그인 처리에 실패했습니다. 잠시 후 다시 시도해주세요.",
  "oauth_denied":
    "Google 로그인을 취소하셨습니다. 계속하려면 다시 시도해주세요.",
  "session_expired": "세션이 만료되었습니다. 다시 로그인해주세요.",
  "unknown": "문제가 발생했습니다. 잠시 후 다시 시도해주세요.",
};

function LoginForm() {
  const searchParams = useSearchParams();
  const errorKey = searchParams.get("error");
  const rawNext = searchParams.get("next");

  // Open redirect 방어 (T-06.2-11, ASVS V4.1.1 / V5.1.5) — /auth/callback 과 동일 가드
  // - `/` 로 시작
  // - `//` 로 시작하는 protocol-relative URL 차단
  const safeNext =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/scanner";

  // 알 수 없는 에러 키는 unknown fallback (T-06.2-15 — 내부 상태 유출 없음)
  const errorMessage = errorKey
    ? ERROR_MESSAGES[errorKey] ?? ERROR_MESSAGES.unknown
    : null;

  const handleGoogleLogin = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
        queryParams: { prompt: "select_account" },
      },
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-[var(--s-6)]">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="mt-4 text-xl">gh-radar에 로그인</CardTitle>
          <p className="text-sm text-[var(--muted-fg)]">
            Google 계정으로 로그인하고 관심종목을 저장하세요
          </p>
        </CardHeader>
        <CardContent>
          {errorMessage ? (
            <div
              role="alert"
              aria-live="polite"
              className="mb-4 rounded-md bg-[var(--destructive)]/10 p-3 text-center text-sm text-[var(--destructive)]"
            >
              {errorMessage}
            </div>
          ) : null}
          <Button
            onClick={handleGoogleLogin}
            className="w-full"
            size="lg"
            aria-label="Google로 로그인"
          >
            <svg
              className="mr-2 size-5"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Google로 로그인
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
