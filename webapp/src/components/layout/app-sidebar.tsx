"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Star } from "lucide-react";

import { cn } from "@/lib/utils";

import { UserSection } from "./user-section";

/**
 * AppSidebar — UI-SPEC §2 (AppShell Sidebar + UserSection).
 *
 * 구조:
 * - `flex h-full flex-col justify-between` → top=nav items, bottom=UserSection
 * - 2 nav 링크: `/scanner` (스캐너), `/watchlist` (관심종목)
 * - 하단 UserSection (Popover 트리거 + 콘텐츠)
 *
 * a11y:
 * - `<nav aria-label="주 메뉴">` (한글 라벨)
 * - active 링크: `aria-current="page"`
 * - 아이콘: `aria-hidden="true"` (의미 없는 장식)
 *
 * 모바일 Drawer 연동:
 * - `data-nav-item` 속성 — AppShell 의 Sheet drawer 가 클릭 감지 후 자동 닫음 (app-shell.tsx 참조)
 */
const NAV = [
  { href: "/scanner", label: "스캐너", icon: Activity },
  { href: "/watchlist", label: "관심종목", icon: Star },
] as const;

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="주 메뉴" className="flex h-full flex-col justify-between">
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                data-nav-item
                className={cn(
                  "flex items-center gap-2 rounded-[var(--r)] px-3 py-2 text-[length:var(--t-sm)]",
                  active
                    ? "bg-[var(--accent)] text-[var(--accent-fg)] font-semibold"
                    : "text-[var(--muted-fg)] hover:bg-[color-mix(in_oklch,var(--muted)_60%,transparent)] hover:text-[var(--fg)]"
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
      <UserSection />
    </nav>
  );
}
