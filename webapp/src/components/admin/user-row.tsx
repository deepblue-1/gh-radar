import type { AdminServerOnlyUser, AdminUserView, AppRole } from "@gh-radar/shared";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

import { ADMIN_CHIP_BASE, ADMIN_TONE_CLASS, ReflectChip } from "./reflect-chip";

/**
 * UserRow — `/admin/users` 목록 1행 (Phase 29 D-14 · 목업 A `row()`).
 *
 * 구조: 이니셜 원 · 이메일 · 메타 줄(역할 칩 · `DMA <id>` 또는 「DMA 연결 없음」 · 「· 계좌 N」 · 서버별 반영 칩) · `›`.
 * 행 전체가 버튼이다 — 누르면 `onOpen`(편집 시트는 29-17 이 연다).
 *
 * 「서버에만 있음」 행(`ServerOnlyRow`)은 87 에만 있고 어떤 웹 사용자에도 연결되지 않은 DMA id 다 — 편집 대상이
 * 아니라 보기만이다(목업 하단 문장). 그래서 버튼이 아니고 `aria-disabled` 이며 `›` 도 없다. 제목은 DMA id,
 * 역할 칩 자리에 흐린 점선 「웹 유저 없음」.
 */

/** 역할 칩 톤 — admin 만 주색 면(목업 `.ch.admin`), trader · viewer 는 muted 면(`.ch.role`). */
export const ROLE_CHIP_CLASS: Readonly<Record<AppRole, string>> = {
  admin: "bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] text-[var(--primary)]",
  trader: "bg-[var(--muted)] text-[var(--fg-2)]",
  viewer: "bg-[var(--muted)] text-[var(--fg-2)]",
};

/** 행 틀 — 목업 `.row`(12px 16/20 · hairline · hover surface). 데스크톱은 좌우 20. */
const ROW_BOX = "flex w-full items-center gap-2.5 px-4 py-3 text-left sm:px-5";
const ROW_HOVER = "transition-colors hover:bg-[color-mix(in_oklab,var(--muted)_55%,transparent)]";
const AVATAR =
  "grid size-9 flex-none place-items-center rounded-full bg-[var(--muted)] text-[14px] font-bold text-[var(--fg)]";
const TITLE = "block truncate text-[14px] font-semibold text-[var(--fg)]";
const META = "mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-[var(--muted-fg)]";

function initialOf(text: string): string {
  return (text.trim()[0] ?? "?").toUpperCase();
}

function DmaLabel({ dmaUserId }: { dmaUserId: string | null }) {
  if (dmaUserId === null) {
    return <span className="text-[var(--faint)]">DMA 연결 없음</span>;
  }
  return (
    <span>
      DMA <b className="font-semibold text-[var(--fg)]">{dmaUserId}</b>
    </span>
  );
}

export interface UserRowProps {
  user: AdminUserView;
  /** 편집 시트가 이 사용자를 보고 있다(목업 `.row.sel`). */
  selected?: boolean;
  onOpen?: (email: string) => void;
}

export function UserRow({ user, selected = false, onOpen }: UserRowProps) {
  return (
    <button
      type="button"
      data-slot="admin-user-row"
      data-email={user.email}
      data-selected={selected ? "true" : undefined}
      aria-label={`${user.email} 편집`}
      onClick={() => onOpen?.(user.email)}
      className={cn(
        ROW_BOX,
        ROW_HOVER,
        selected &&
          "bg-[color-mix(in_oklab,var(--muted)_55%,transparent)] shadow-[inset_3px_0_0_var(--primary)]",
      )}
    >
      <span aria-hidden="true" className={AVATAR}>
        {initialOf(user.email)}
      </span>
      <span className="min-w-0 flex-1">
        <span className={TITLE}>{user.email}</span>
        <span className={META}>
          <span data-slot="admin-role-chip" data-role={user.role} className={cn(ADMIN_CHIP_BASE, ROLE_CHIP_CLASS[user.role])}>
            {user.role}
          </span>
          <DmaLabel dmaUserId={user.dmaUserId} />
          {user.accountCount > 0 && <span>· 계좌 {user.accountCount}</span>}
          {user.servers.length > 0 && (
            <span className="inline-flex flex-wrap gap-1">
              {user.servers.map((chip) => (
                <ReflectChip key={chip.serverKey} serverKey={chip.serverKey} tone={chip.tone} message={chip.message} />
              ))}
            </span>
          )}
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="size-4 flex-none text-[var(--faint)]" />
    </button>
  );
}

export function ServerOnlyRow({ entry }: { entry: AdminServerOnlyUser }) {
  return (
    <div
      data-slot="admin-user-row"
      data-server-only="true"
      data-dma={entry.dmaUserId}
      aria-disabled="true"
      className={ROW_BOX}
    >
      <span aria-hidden="true" className={AVATAR}>
        {initialOf(entry.dmaUserId)}
      </span>
      <span className="min-w-0 flex-1">
        <span className={TITLE}>{entry.dmaUserId}</span>
        <span className={META}>
          <span data-slot="admin-role-chip" className={cn(ADMIN_CHIP_BASE, ADMIN_TONE_CLASS.only)}>
            웹 유저 없음
          </span>
          <DmaLabel dmaUserId={entry.dmaUserId} />
          {entry.accountCount > 0 && <span>· 계좌 {entry.accountCount}</span>}
          {entry.servers.length > 0 && (
            <span className="inline-flex flex-wrap gap-1">
              {entry.servers.map((key) => (
                <ReflectChip key={key} serverKey={key} tone="only" />
              ))}
            </span>
          )}
        </span>
      </span>
    </div>
  );
}
