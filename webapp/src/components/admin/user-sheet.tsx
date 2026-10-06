"use client";

import { useState } from "react";
import type { AdminServerResult, AdminUsersOverview, AdminUserView, AppRole } from "@gh-radar/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteAdminUser, patchAdminRole, reconcileDmaUser } from "@/lib/admin-api";
import { ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";

import { AccountEditor, BusyLines, chipOfResult, ResultChips } from "./account-editor";
import { AdminSheet } from "./admin-sheet";
import { PasswordChange } from "./password-change";
import { ADMIN_BUTTON_SECONDARY, ADMIN_CHIP_BASE } from "./reflect-chip";
import { RoleSegment } from "./role-segment";
import { defaultSaveErrorText, useFieldSave } from "./use-field-save";
import { ROLE_CHIP_CLASS } from "./user-row";

/**
 * UserSheet — `/admin/users` 편집 시트 (Phase 29 D-14 · D-15 · D-23 ④ · 목업 A `editor()`).
 *
 * `AdminSheet`(폰 바텀시트 · 데스크톱 우측 440px — 목록은 남는다) 안: 머리(이메일 · 역할 칩 · 닫기) → 역할 세그먼트 →
 * DMA 사용자 id(비밀번호 변경) → 계좌 · 등록 서버 → 하단 「사용자 삭제」 · 「다시 반영」.
 *
 * **「저장」 버튼이 없다(D-15 — 목업 A 의 저장 버튼은 CONTEXT 가 이긴다).** 필드마다 누르는 즉시 한 요청이 가고
 * (`useFieldSave` — 필드당 1건 비행 · 마지막 값 대기), 응답이 오면 그 자리가 플래시 · 칩으로 바뀌고 목록을 다시 읽는다
 * (`onChanged`). 토스트는 없다.
 *
 * 위험 작업은 확인 1회(D-15): 「사용자 삭제」 와 마지막 계좌 「제거」(= 사용자 삭제 — 서버 409 `LAST_ACCOUNT` 를 기다리지
 * 않고 화면이 먼저 안다). 삭제가 일부 서버에서 실패하면(`deleted: false`) 시트를 닫지 않고 서버별 칩 · BUSY 줄로 보인다.
 *
 * DMA 연결이 없는 사용자는 「DMA 연결 없음」 까지만 그린다(연결 폼은 29-19 가 같은 자리에 넣는다).
 */

export const USER_SHEET_TEXT = {
  roleLabel: "역할",
  dmaLabel: "DMA 사용자 id (모든 서버 공통)",
  noDma: "DMA 연결 없음",
  accountsLabel: "계좌 · 등록 서버",
  deleteUser: "사용자 삭제",
  reconcile: "다시 반영",
  selfLockout: "본인 관리자 권한은 내릴 수 없어요",
  confirmUserTitle: "사용자를 삭제할까요?",
  confirmLastTitle: "마지막 계좌를 지우면 사용자가 삭제돼요",
  confirmDescription: "되돌릴 수 없어요.",
  confirmCancel: "취소",
  confirmDelete: "삭제",
  deletePartial: "일부 서버에서 지우지 못해 사용자가 남아 있어요.",
  deleteAfter: "정리 뒤 다시 삭제",
} as const;

/** 필드 틀 — 목업 `.fld`(12px 0 · hairline) · `.lb`(12px muted · 아래 6px). */
export const ADMIN_FIELD = "border-b border-[var(--border-subtle)] py-3 last:border-b-0";
export const ADMIN_FIELD_LABEL = "mb-1.5 text-[12px] text-[var(--muted-fg)]";
/** 위험 버튼 — 목업 `.btn.danger`(옅은 빨강 면 · 빨강 글자). `secondary` 위에 면 · 글자색을 다시 준다. */
export const ADMIN_BUTTON_DANGER =
  "bg-[color-mix(in_srgb,var(--destructive)_14%,transparent)] text-[12px] font-semibold text-[var(--destructive)] hover:bg-[color-mix(in_srgb,var(--destructive)_22%,transparent)]";

const ERROR_LINE = "mt-2 text-[12.5px] break-keep text-[var(--destructive)]";

function roleErrorText(err: unknown): string {
  if (err instanceof ApiClientError && err.code === "SELF_LOCKOUT") return USER_SHEET_TEXT.selfLockout;
  return defaultSaveErrorText(err);
}

function deleteErrorText(err: unknown): string {
  const detail = err instanceof ApiClientError ? err.message : null;
  return detail ? `삭제하지 못했어요 · ${detail}` : "삭제하지 못했어요";
}

type ConfirmKind = "user" | "last-account";

export interface UserSheetProps {
  user: AdminUserView;
  /** 서버 레지스트리(`AdminUsersOverview.servers`) — 계좌 줄의 등록 서버 토글 후보. */
  servers: AdminUsersOverview["servers"];
  /** 쓰기 성공 뒤 목록 재조회. */
  onChanged: () => void;
  onClose: () => void;
  /**
   * 시트를 열 때 이미 손에 든 서버별 결과(29-19 — 「+ 사용자」 생성 응답). 계좌 칩의 초기값으로 한 번 반영한다
   * (「다시 반영」 결과와 같은 길 — 서버 S 의 결과가 S 에 등록된 계좌 칩에 닿는다).
   */
  initialResults?: readonly AdminServerResult[] | null;
}

export function UserSheet({ user, servers, onChanged, onClose, initialResults = null }: UserSheetProps) {
  const dma = user.dmaUserId;

  const role = useFieldSave<AppRole>(
    async (next) => {
      await patchAdminRole(user.email, next);
    },
    { onSuccess: () => onChanged(), describeError: roleErrorText },
  );
  const shownRole = role.value ?? user.role;

  // 「다시 반영」 — 결과는 계좌 칩으로 내려 보낸다(id 가 바뀔 때 한 번 반영).
  const [reconcileBatch, setReconcileBatch] = useState<{ id: number; results: readonly AdminServerResult[] } | null>(
    () => (initialResults && initialResults.length > 0 ? { id: 1, results: initialResults } : null),
  );
  const reconcile = useFieldSave<true>(() => reconcileDmaUser(dma ?? ""), {
    retainValue: false,
    onSuccess: (_v, res) => {
      if (res) setReconcileBatch((prev) => ({ id: (prev?.id ?? 0) + 1, results: res.results }));
      onChanged();
    },
  });

  // 사용자 삭제(확인 1회).
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteResults, setDeleteResults] = useState<AdminServerResult[] | null>(null);

  const runDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await deleteAdminUser(user.email);
      setConfirm(null);
      onChanged();
      if (res.deleted) {
        onClose();
        return;
      }
      setDeleteResults(res.results ?? []);
    } catch (err) {
      setDeleteError(deleteErrorText(err));
    } finally {
      setDeleting(false);
    }
  };

  const deleteChips = (deleteResults ?? []).map((r) => ({ serverKey: r.server, ...chipOfResult(r) }));

  return (
    <AdminSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={user.email}
      titleAside={
        <span
          data-slot="admin-role-chip"
          data-role={shownRole}
          className={cn(ADMIN_CHIP_BASE, ROLE_CHIP_CLASS[shownRole], "flex-none")}
        >
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
            disabled={deleting}
            onClick={() => {
              setDeleteError(null);
              setConfirm("user");
            }}
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
            data-state={reconcile.state}
            disabled={dma === null || reconcile.state === "saving"}
            onClick={() => reconcile.run(true)}
            className={cn(
              ADMIN_BUTTON_SECONDARY,
              reconcile.state === "flash" && "text-[var(--led-armed)]",
            )}
          >
            {USER_SHEET_TEXT.reconcile}
          </Button>
        </>
      }
    >
      <div data-slot="admin-user-sheet" data-email={user.email}>
        <section aria-label={USER_SHEET_TEXT.roleLabel} className={ADMIN_FIELD}>
          <div className={ADMIN_FIELD_LABEL}>{USER_SHEET_TEXT.roleLabel}</div>
          <RoleSegment value={shownRole} onChange={role.run} state={role.state} error={role.error} />
        </section>

        <section aria-label={USER_SHEET_TEXT.dmaLabel} data-slot="admin-field-dma" className={ADMIN_FIELD}>
          <div className={ADMIN_FIELD_LABEL}>{USER_SHEET_TEXT.dmaLabel}</div>
          {dma === null ? (
            <p className="text-[15px] text-[var(--faint)]">{USER_SHEET_TEXT.noDma}</p>
          ) : (
            <PasswordChange dmaUserId={dma} />
          )}
        </section>

        {dma !== null && (
          <section aria-label={USER_SHEET_TEXT.accountsLabel} className={ADMIN_FIELD}>
            <div className={ADMIN_FIELD_LABEL}>{USER_SHEET_TEXT.accountsLabel}</div>
            <AccountEditor
              dmaUserId={dma}
              accounts={user.accounts}
              servers={servers}
              onChanged={onChanged}
              onRemoveLast={() => {
                setDeleteError(null);
                setConfirm("last-account");
              }}
              serverResults={reconcileBatch}
            />
          </section>
        )}

        {deleteResults && (
          <section data-slot="admin-delete-results" className="pt-3">
            <p className="text-[12.5px] break-keep text-[var(--fg)]">{USER_SHEET_TEXT.deletePartial}</p>
            <div className="mt-1.5">
              <ResultChips results={deleteResults} />
            </div>
            <BusyLines chips={deleteChips} after={USER_SHEET_TEXT.deleteAfter} />
          </section>
        )}

        {reconcile.error && (
          <p role="alert" data-slot="admin-sheet-error" className={ERROR_LINE}>
            {reconcile.error}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "last-account" ? USER_SHEET_TEXT.confirmLastTitle : USER_SHEET_TEXT.confirmUserTitle}
        description={`${user.email} — ${USER_SHEET_TEXT.confirmDescription}`}
        busy={deleting}
        error={deleteError}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void runDelete()}
      />
    </AdminSheet>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/** 위험 작업 확인 1회 — 시트 안에 둬 Radix 가 중첩 레이어로 다룬다(시트가 같이 닫히지 않는다). */
function ConfirmDialog({ open, title, description, busy, error, onCancel, onConfirm }: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <DialogContent role="alertdialog" showCloseButton={false} data-slot="admin-confirm" className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-[length:var(--t-sm)] break-keep text-[var(--destructive)]">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            {USER_SHEET_TEXT.confirmCancel}
          </Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={onConfirm}>
            {USER_SHEET_TEXT.confirmDelete}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
