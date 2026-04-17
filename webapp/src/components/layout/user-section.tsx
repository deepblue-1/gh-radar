"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

/**
 * UserSection — UI-SPEC §3 (AppShell Sidebar 하단 유저 섹션).
 *
 * 트리거: 아바타 + 이름 (사이드바 하단 상시 노출).
 * 팝오버: 아바타 + 이름 + 이메일 + Separator + 로그아웃 버튼.
 *
 * 아바타 fallback 체인 (UI-SPEC §3.2):
 * 1순위 — `user.user_metadata.avatar_url` (Google 프로필 이미지, <img>)
 * 2순위 — 이메일 로컬파트 첫 글자 대문자 이니셜
 *
 * a11y:
 * - 트리거: `aria-haspopup="menu"` (Radix 가 `aria-expanded` 자동 관리)
 * - 로그아웃 버튼: `aria-label="로그아웃"`
 * - ESC / 바깥 클릭 / 로그아웃 클릭 시 닫힘 (Radix 기본)
 */
export function UserSection() {
  const { user, displayName, signOut } = useAuth();
  const [imgError, setImgError] = useState(false);

  // middleware 가 비로그인 접근을 /login 으로 리다이렉트하므로 이 컴포넌트는 user != null 전제.
  // 그래도 방어적으로 null 체크 (bfcache / 초기 로딩 1~2 프레임 대비).
  if (!user) return null;

  const email = user.email ?? "";
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
  const initial = (email[0] ?? "?").toUpperCase();
  const name = displayName ?? "사용자";

  const showImage = Boolean(avatarUrl) && !imgError;

  /**
   * 아바타 렌더 (size-8 트리거용 / size-10 팝오버 헤더용 공용 렌더).
   * 이미지 로드 실패 시 onError 로 imgError=true 잠금 → 이니셜 fallback 영구 전환.
   */
  const renderAvatar = (sizeClass: "size-8" | "size-10") =>
    showImage ? (
      // next/image 대신 <img> — 외부 provider (Google / Kakao 등) avatar URL 은 domain 화이트리스트
      // 관리 비용이 이득 대비 커서 눈에 띄지 않는 소형 아바타에는 <img> 채택.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        onError={() => setImgError(true)}
        className={`${sizeClass} rounded-full object-cover`}
        aria-hidden="true"
      />
    ) : (
      <span
        className={`${sizeClass} flex items-center justify-center rounded-full bg-[var(--muted-fg)]/15 text-[length:var(--t-sm)] font-semibold text-[var(--fg)] uppercase`}
        aria-hidden="true"
      >
        {initial}
      </span>
    );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="menu"
          className="flex w-full items-center gap-2 rounded-md p-2 text-left hover:bg-[var(--bg)]"
        >
          {renderAvatar("size-8")}
          <span className="max-w-[140px] truncate text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
            {name}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-56 bg-[var(--card)] p-2 border-[var(--border)] shadow-sm"
      >
        <div className="flex items-center gap-2 px-2 py-2">
          {renderAvatar("size-10")}
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
              {name}
            </span>
            <span className="truncate text-[length:var(--t-caption)] text-[var(--muted-fg)]">
              {email}
            </span>
          </div>
        </div>
        <Separator className="my-1" />
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-[var(--muted-fg)] hover:text-[var(--destructive)]"
          onClick={() => {
            void signOut();
          }}
          aria-label="로그아웃"
        >
          <LogOut className="size-4" aria-hidden="true" />
          로그아웃
        </Button>
      </PopoverContent>
    </Popover>
  );
}
