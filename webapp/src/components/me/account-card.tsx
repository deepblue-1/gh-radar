"use client";

import { LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import {
  THEME_SWITCH_LABEL,
  ThemeSwitchIcon,
  type ThemeValue,
} from "@/components/layout/theme-toggle";
import { useAuth } from "@/lib/auth-context";

/**
 * AccountCard — `/me` 상단 계정 카드 A (Phase 21 D-08 · D-08a · 스케치 005 채택안).
 *
 * ① 한 줄 카드다: 아바타 44 · 이름 16/700 · 이메일 12.5 muted | 테마 · 로그아웃 아이콘 버튼
 *   40×40. `--card` radius 16 · padding 14/16 · 높이 72. 웹·앱 공통으로 보인다 — 앱 「마이」
 *   탭에서 사이드바 드로어 없이 로그아웃·테마 전환을 하려는 것이 목적이다.
 *
 * ② 사이드바 하단 `UserSection` · `ThemeToggle` 은 **그대로 둔다**(D-08). 이 카드는 같은
 *   정보를 한 번 더 보이는 자리이고, 아바타 폴백 체인은 `UserSection` 과 같다:
 *   `user_metadata.avatar_url`(<img>) → 로드 실패 시 `imgError` 로 잠그고 이메일 첫 글자 이니셜.
 *
 * ③ 테마 해석은 `ThemeToggle` 과 같다 — 하이드레이션 전(mounted 가드)에는 다크로 읽는다.
 *   아이콘·접근 이름 규칙은 ThemeToggle 과 같은 정의(D-08b)를 가져다 쓴다 —
 *   `theme-toggle.tsx` 의 `ThemeSwitchIcon` · `THEME_SWITCH_LABEL`(아이콘 = 누르면 바뀔 테마 ·
 *   접근 이름 = 행동 문구). 여기에 따로 적지 않는다(적으면 다시 갈라진다).
 *
 * ④ 토큰 대응: 스케치의 `--raised` = 웹 `--muted`(카드 안 컨트롤 면). 버튼은 흰(라이트)/
 *   `--card`(다크) 카드 **안**에 놓이므로 라이트 `--muted`(#f2f4f6) 가 본문면과 겹쳐 사라지는
 *   21-08 함정에 걸리지 않는다. 아바타 이니셜 바탕은 `--raised-2`.
 *
 * ⑤ 로그아웃은 기존 `useAuth().signOut`(하드 리다이렉트 `/login`) 그대로다.
 */
export function AccountCard() {
  const { user, displayName, signOut } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!user) return null;

  const email = user.email ?? "";
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
  const initial = (email[0] ?? "?").toUpperCase();
  const name = displayName ?? "사용자";
  const showImage = Boolean(avatarUrl) && !imgError;

  const current: ThemeValue = mounted && resolvedTheme === "light" ? "light" : "dark";
  const nextTheme: ThemeValue = current === "light" ? "dark" : "light";

  const iconButton =
    "grid size-10 shrink-0 place-items-center rounded-[12px] bg-[var(--muted)] transition-colors hover:bg-[var(--raised-2)]";

  return (
    <section
      data-slot="account-card"
      aria-label="계정"
      className="flex min-h-[72px] items-center gap-3 rounded-[16px] bg-[var(--card)] px-4 py-3.5"
    >
      {showImage ? (
        // next/image 대신 <img> — 외부 provider avatar URL 은 domain 화이트리스트 관리 비용이
        // 이득보다 크다(UserSection 과 같은 판단).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          onError={() => setImgError(true)}
          className="size-11 shrink-0 rounded-full object-cover"
          aria-hidden="true"
        />
      ) : (
        <span
          data-slot="account-avatar-initial"
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--raised-2)] text-[17px] font-bold text-[var(--fg)]"
        >
          {initial}
        </span>
      )}

      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[16px] font-bold text-[var(--fg)]">{name}</span>
        <span className="truncate text-[12.5px] text-[var(--muted-fg)]">{email}</span>
      </div>

      <div className="ml-auto flex shrink-0 gap-1.5">
        <button
          type="button"
          aria-label={THEME_SWITCH_LABEL[nextTheme]}
          title={THEME_SWITCH_LABEL[nextTheme]}
          onClick={() => setTheme(nextTheme)}
          className={`${iconButton} text-[var(--fg)]`}
          suppressHydrationWarning
        >
          <ThemeSwitchIcon next={nextTheme} className="size-[18px]" />
        </button>
        <button
          type="button"
          aria-label="로그아웃"
          onClick={() => {
            void signOut();
          }}
          className={`${iconButton} text-[var(--up)]`}
        >
          <LogOut className="size-[18px]" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
