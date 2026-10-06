import type { Metadata } from "next";

import { PendingCard } from "@/components/auth/pending-card";

export const metadata: Metadata = {
  title: "승인 대기 · GH Trade",
};

/**
 * /pending — 승인 대기 화면 (Phase 29 D-01 · ADMIN-02).
 *
 * - 앱 셸 없음(`/login` 과 같은 단독 화면) — 사이드바 · 데이터 표면을 하나도 띄우지 않는다.
 * - 모바일 우선 가운데 카드 · md 이상 360 폭. 안전영역은 globals.css 의 `--app-safe-*` 만 쓴다.
 * - 공개 prefix 가 아니다 — 미인증은 /login 으로, 역할이 있는 사용자는 / 로 middleware 가 보낸다.
 */
export default function PendingPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[var(--bg)] pb-[var(--app-safe-bottom)] pl-[calc(20px+var(--app-safe-left))] pr-[calc(20px+var(--app-safe-right))] pt-[var(--app-safe-top)] text-[var(--fg)]">
      <div className="flex w-full max-w-[360px] flex-col items-center gap-6">
        {/* SVG 는 next/image 최적화 대상이 아니다 — /login 과 같은 앱 아이콘 원본 재사용. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon.svg"
          alt=""
          aria-hidden="true"
          width={56}
          height={56}
          draggable={false}
          className="size-14 select-none rounded-[22%]"
        />
        <PendingCard />
      </div>
    </main>
  );
}
