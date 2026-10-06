"use client";

import { useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

/**
 * 승인 대기 카드 — Phase 29 D-01 (ADMIN-02).
 *
 * 허용 표(`app_users`)에 없는 로그인 사용자가 앱 어디로 가든 middleware 가 `/pending` 으로 보낸다.
 * 이 카드는 안내 한 줄 · 로그인한 이메일 · 로그아웃 버튼 1개만 둔다(CONTEXT 재량 권고 — 토스트 · 힌트 없음).
 * 승인되면 다음 이동에서 middleware 가 `/pending` → `/` 로 돌려보낸다(D-04 · 매 요청 판정).
 */
export function PendingCard() {
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await signOut();
  };

  return (
    <div
      data-slot="pending-card"
      className="flex w-full flex-col items-center gap-5 text-center"
    >
      <p className="text-[16px] font-semibold leading-[1.5] tracking-[-0.01em]">
        관리자 승인을 기다리고 있어요 — 승인되면 바로 열려요
      </p>
      <p
        data-slot="pending-email"
        className="break-all text-[14px] text-[var(--muted-fg)]"
      >
        {user?.email ?? " "}
      </p>
      <Button
        variant="outline"
        size="lg"
        onClick={handleSignOut}
        disabled={signingOut}
        aria-busy={signingOut}
        className="h-12 w-full rounded-[var(--r-md)] text-[15px] font-semibold"
      >
        로그아웃
      </Button>
    </div>
  );
}
