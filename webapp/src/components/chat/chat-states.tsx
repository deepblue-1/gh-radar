"use client";

/**
 * Phase 14 Plan 08 — 챗 상태 박스 3종 (C11, CHAT-01).
 *
 * 빈 상태 / 로그인 필요 / 에러 — 각각 아이콘 + 제목 + 본문 + 다음 행동 버튼.
 * Copywriting 은 14-UI-SPEC Copywriting Contract verbatim. 사용자 대면 카피 전부 한글.
 *
 * - LoginRequiredState: FAB 비로그인 클릭 게이트(D-01). Google OAuth 는 /login 과 동일하게
 *   `signInWithOAuth` 를 클릭 시점에만 호출(렌더 시 supabase client 생성 안 함 → 테스트 안전).
 * - EmptyState: 새 대화/일반 진입 시. 예시 프롬프트 칩 클릭 → onPromptSelect 로 전송 위임.
 * - ChatErrorState: 스트리밍 실패(D-06 이후). onRetry 로 재시도 위임.
 */

import { MessageSquare, Lock, AlertTriangle } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

/** 상태 박스 공통 셸 — 아이콘 + 제목 + 본문 + 액션. */
function StateBox({
  icon,
  title,
  children,
  destructive = false,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-[var(--s-2)] px-[var(--s-5)] py-[var(--s-6)] text-center">
      <div
        className={
          destructive
            ? "text-[var(--destructive)]"
            : "text-[var(--muted-fg)]"
        }
        aria-hidden="true"
      >
        {icon}
      </div>
      <h3 className="text-[length:var(--t-base)] font-semibold text-[var(--fg)]">
        {title}
      </h3>
      <div className="text-[length:var(--t-sm)] leading-relaxed text-[var(--muted-fg)]">
        {children}
      </div>
    </div>
  );
}

/** 예시 프롬프트 칩 목록 (UI-SPEC Empty state body). */
const EXAMPLE_PROMPTS = ["오늘 주도 테마는?", "상한가 종목 정리"] as const;

/**
 * 빈 상태 — 새 대화/유휴. 예시 프롬프트 칩 제공.
 * @param onPromptSelect 칩 클릭 시 해당 텍스트로 전송(시트가 배선).
 */
export function EmptyState({
  onPromptSelect,
}: {
  onPromptSelect?: (text: string) => void;
}) {
  return (
    <StateBox
      icon={<MessageSquare className="size-6" />}
      title="무엇이든 물어보세요"
    >
      <p>
        오늘 주도 테마, 상한가 종목 분석, 내일 익절 판단까지 상한가 따라잡기
        전략을 도와드릴게요.
      </p>
      <div className="mt-[var(--s-3)] flex flex-wrap justify-center gap-[var(--s-2)]">
        {EXAMPLE_PROMPTS.map((prompt) => (
          <Button
            key={prompt}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPromptSelect?.(prompt)}
          >
            {prompt}
          </Button>
        ))}
      </div>
    </StateBox>
  );
}

/**
 * 로그인 필요 상태 — 비로그인 FAB/입력 게이트(D-01). 체험 모드 없음.
 * Google 로그인 버튼은 /login 과 동일한 signInWithOAuth 플로우.
 */
export function LoginRequiredState() {
  const handleGoogleLogin = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
          window.location.pathname,
        )}`,
        queryParams: { prompt: "select_account" },
      },
    });
  };

  return (
    <StateBox icon={<Lock className="size-6" />} title="로그인이 필요해요">
      <p>
        AI 애널리스트는 로그인 후 이용할 수 있어요. 대화 기록은 계정에 안전하게
        저장됩니다.
      </p>
      <Button
        type="button"
        className="mt-[var(--s-3)]"
        onClick={handleGoogleLogin}
        aria-label="Google로 로그인"
      >
        Google로 로그인
      </Button>
    </StateBox>
  );
}

/**
 * 에러 상태 — 스트리밍 실패. 재시도 행동 제공.
 * @param onRetry 다시 시도 버튼 클릭 핸들러.
 */
export function ChatErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <StateBox
      icon={<AlertTriangle className="size-6" />}
      title="답변을 불러오지 못했어요"
      destructive
    >
      <p>일시적인 오류로 응답이 중단됐어요. 잠시 후 다시 시도해 주세요.</p>
      {onRetry && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-[var(--s-3)]"
          onClick={onRetry}
        >
          다시 시도
        </Button>
      )}
    </StateBox>
  );
}
