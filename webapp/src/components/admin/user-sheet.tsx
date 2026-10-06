"use client";

import type { AdminUsersOverview, AdminUserView, AppRole } from "@gh-radar/shared";

import { Button } from "@/components/ui/button";
import { patchAdminRole } from "@/lib/admin-api";
import { ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";

import { AdminSheet } from "./admin-sheet";
import { ADMIN_BUTTON_SECONDARY, ADMIN_CHIP_BASE } from "./reflect-chip";
import { RoleSegment } from "./role-segment";
import { defaultSaveErrorText, useFieldSave } from "./use-field-save";
import { ROLE_CHIP_CLASS } from "./user-row";

/**
 * UserSheet — `/admin/users` 편집 시트 (Phase 29 D-14 · D-15 · 목업 A `editor()`).
 *
 * `AdminSheet`(폰 바텀시트 · 데스크톱 우측 440px — 목록은 남는다) 안: 머리(이메일 · 역할 칩 · 닫기) → 역할 세그먼트 →
 * DMA 사용자 id → 계좌 · 등록 서버 → 하단 「사용자 삭제」 · 「다시 반영」.
 *
 * **「저장」 버튼이 없다(D-15 — 목업 A 의 저장 버튼은 CONTEXT 가 이긴다).** 필드마다 누르는 즉시 한 요청이 가고
 * (`useFieldSave` — 필드당 1건 비행 · 마지막 값 대기), 응답이 오면 그 자리가 플래시하고 목록을 다시 읽는다(`onChanged`).
 */

export const USER_SHEET_TEXT = {
  dmaLabel: "DMA 사용자 id (모든 서버 공통)",
  noDma: "DMA 연결 없음",
  accountsLabel: "계좌 · 등록 서버",
  deleteUser: "사용자 삭제",
  reconcile: "다시 반영",
  selfLockout: "본인 관리자 권한은 내릴 수 없어요",
} as const;

/** 필드 틀 — 목업 `.fld`(12px 0 · hairline) · `.lb`(12px muted · 아래 6px). */
export const ADMIN_FIELD = "border-b border-[var(--border-subtle)] py-3 last:border-b-0";
export const ADMIN_FIELD_LABEL = "mb-1.5 text-[12px] text-[var(--muted-fg)]";
export const ADMIN_NOTE = "mt-1.5 text-[12px] leading-[1.5] break-keep text-[var(--muted-fg)]";
/** 위험 버튼 — 목업 `.btn.danger`(옅은 빨강 면 · 빨강 글자). `secondary` 위에 면 · 글자색을 다시 준다. */
export const ADMIN_BUTTON_DANGER =
  "bg-[color-mix(in_srgb,var(--destructive)_14%,transparent)] text-[12px] font-semibold text-[var(--destructive)] hover:bg-[color-mix(in_srgb,var(--destructive)_22%,transparent)]";

function roleErrorText(err: unknown): string {
  if (err instanceof ApiClientError && err.code === "SELF_LOCKOUT") return USER_SHEET_TEXT.selfLockout;
  return defaultSaveErrorText(err);
}

export interface UserSheetProps {
  user: AdminUserView;
  /** 서버 레지스트리(`AdminUsersOverview.servers`) — 계좌 줄의 등록 서버 토글 후보. */
  servers: AdminUsersOverview["servers"];
  /** 쓰기 성공 뒤 목록 재조회. */
  onChanged: () => void;
  onClose: () => void;
}

export function UserSheet({ user, onChanged, onClose }: UserSheetProps) {
  const role = useFieldSave<AppRole>(
    async (next) => {
      await patchAdminRole(user.email, next);
    },
    { onSuccess: () => onChanged(), describeError: roleErrorText },
  );
  const shownRole = role.value ?? user.role;

  return (
    <AdminSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={user.email}
      titleAside={
        <span data-slot="admin-role-chip" data-role={shownRole} className={cn(ADMIN_CHIP_BASE, ROLE_CHIP_CLASS[shownRole], "flex-none")}>
          {shownRole}
        </span>
      }
      description={`${user.email} 편집`}
      footer={
        <>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-slot="admin-user-delete"
            disabled
            className={ADMIN_BUTTON_DANGER}
          >
            {USER_SHEET_TEXT.deleteUser}
          </Button>
          <span className="flex-1" />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-slot="admin-user-reconcile"
            disabled
            className={ADMIN_BUTTON_SECONDARY}
          >
            {USER_SHEET_TEXT.reconcile}
          </Button>
        </>
      }
    >
      <div data-slot="admin-user-sheet" data-email={user.email}>
        <section aria-label="역할" className={ADMIN_FIELD}>
          <div className={ADMIN_FIELD_LABEL}>역할</div>
          <RoleSegment value={shownRole} onChange={role.run} state={role.state} error={role.error} />
        </section>

        <section aria-label={USER_SHEET_TEXT.dmaLabel} data-slot="admin-field-dma" className={ADMIN_FIELD}>
          <div className={ADMIN_FIELD_LABEL}>{USER_SHEET_TEXT.dmaLabel}</div>
          {user.dmaUserId === null ? (
            <p className="text-[15px] text-[var(--faint)]">{USER_SHEET_TEXT.noDma}</p>
          ) : (
            <p className="text-[15px] font-bold text-[var(--fg)]">{user.dmaUserId}</p>
          )}
        </section>
      </div>
    </AdminSheet>
  );
}
