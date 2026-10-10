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
import { connectAdminDma, deleteAdminUser, patchAdminRole, reconcileDmaUser } from "@/lib/admin-api";
import { ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";

import { AccountEditor, BusyLines, chipOfResult, ResultChips } from "./account-editor";
import { AdminSheet } from "./admin-sheet";
import {
  clearChangedErrors,
  dmaConnectFailure,
  DmaConnectFields,
  EMPTY_DMA_CONNECT,
  toDmaInput,
  validateDmaConnect,
  type DmaConnectErrors,
  type DmaConnectValue,
} from "./dma-connect-fields";
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
 * 등록 서버 중 꺼진 서버가 있으면(29-34 WR-04) 같은 확인 설명에 「꺼진 서버(KB121)의 등록은 DB 에서만 지워요 — 서버를 켜면
 * 「서버에만 있음」 으로 보여요」 를 더하고, 확인하면 `skipDisabled` 로 보낸다(꺼진 서버에는 op 없이 DB 의도만 지운다).
 *
 * DMA 연결이 없는 사용자는 「DMA 연결 없음」 을 그리고, trader/admin 이면 그 아래 「DMA 연결」 그룹(`DmaConnectFields` —
 * 생성 시트와 같은 필드) + 버튼 「DMA 유저 + 첫 계좌 만들기 · 서버 N대에 반영」 을 둔다(29-19 · D-16 — viewer 로 만든 뒤
 * trader 로 올린 사용자의 연결 자리). 누르면 `POST /api/admin/users/:email/dma` 1건 → 서버별 결과 칩 → 재조회(재조회가
 * DMA id 를 채우면 계좌 줄이 같은 결과 칩으로 이어 그린다).
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
  connectFailed: "연결하지 못했어요",
  deletePartial: "일부 서버에서 지우지 못해 사용자가 남아 있어요.",
  deleteAfter: "정리 뒤 다시 삭제",
  /** 꺼진 등록 서버가 있을 때 확인 설명에 더하는 문장(29-34 WR-04 — 새 다이얼로그 없이 기존 확인 1회에). */
  disabledServersNote: (keys: readonly string[]) =>
    `꺼진 서버(${keys.join(" · ")})의 등록은 DB 에서만 지워요 — 서버를 켜면 「서버에만 있음」 으로 보여요`,
} as const;

/**
 * 사용자의 등록 서버(의도 계좌 servers) 중 레지스트리에서 꺼진 · 없는 서버 키(레지스트리 순 · 없는 키는 뒤 · 중복 없음).
 * 있으면 삭제 확인이 안내 문장을 보이고 요청이 `skipDisabled` 로 간다(29-34 WR-04 — relay 가 꺼진 서버에는 op 를 보내지 않고
 * DB 의도만 지운다).
 */
export function disabledServerKeysOf(user: AdminUserView, servers: AdminUsersOverview["servers"]): string[] {
  const enabled = new Map(servers.map((s) => [s.key, s.enabled] as const));
  const order = new Map(servers.map((s, i) => [s.key, i] as const));
  const keys = new Set<string>();
  for (const a of user.accounts) for (const s of a.servers) if (enabled.get(s.serverKey) !== true) keys.add(s.serverKey);
  const rank = (k: string) => order.get(k) ?? Number.MAX_SAFE_INTEGER;
  return [...keys].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** 필드 틀 — 목업 `.fld`(12px 0 · hairline) · `.lb`(12px muted · 아래 6px). */
export const ADMIN_FIELD = "border-b border-[var(--border-subtle)] py-3 last:border-b-0";
export const ADMIN_FIELD_LABEL = "mb-1.5 text-[12px] text-[var(--muted-fg)]";
/** 위험 버튼 — 목업 `.btn.danger`(옅은 빨강 면 · 빨강 글자). `secondary` 위에 면 · 글자색을 다시 준다. */
export const ADMIN_BUTTON_DANGER =
  "bg-[color-mix(in_srgb,var(--destructive)_14%,transparent)] text-[12px] font-semibold text-[var(--destructive)] hover:bg-[color-mix(in_srgb,var(--destructive)_22%,transparent)]";

const ERROR_LINE = "mt-2 text-[12.5px] break-keep text-[var(--destructive)]";

/** 연결 버튼 문구 — 목업 B 3단계 버튼(「DMA 유저 + 첫 계좌 만들기 · 서버 N대에 반영」) · 체크 수를 그대로 말한다. */
export function connectDmaLabel(serverCount: number): string {
  return `DMA 유저 + 첫 계좌 만들기 · 서버 ${serverCount}대에 반영`;
}

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
    // IN-03(29-34) — 성공 뒤 첫 재조회(새 user 객체)부터는 재조회 role 이 정본(다른 Admin 의 변경 · 서버 보정을 따른다).
    { onSuccess: () => onChanged(), describeError: roleErrorText, releaseOn: user },
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

  // 꺼진 등록 서버 — 확인 설명에 안내를 더하고 그때만 「DB 등록만 지우고 삭제」(skipDisabled). 없으면 문구 · 요청 종전.
  const disabledKeys = disabledServerKeysOf(user, servers);
  const confirmDescription =
    disabledKeys.length > 0
      ? `${user.email} — ${USER_SHEET_TEXT.confirmDescription} ${USER_SHEET_TEXT.disabledServersNote(disabledKeys)}`
      : `${user.email} — ${USER_SHEET_TEXT.confirmDescription}`;

  const runDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res =
        disabledKeys.length > 0
          ? await deleteAdminUser(user.email, { skipDisabled: true })
          : await deleteAdminUser(user.email);
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
            <>
              <p className="text-[15px] text-[var(--faint)]">{USER_SHEET_TEXT.noDma}</p>
              {shownRole !== "viewer" && (
                <DmaConnect
                  email={user.email}
                  servers={servers}
                  onConnected={(results) => {
                    setReconcileBatch((prev) => ({ id: (prev?.id ?? 0) + 1, results }));
                    onChanged();
                  }}
                />
              )}
            </>
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
        description={confirmDescription}
        busy={deleting}
        error={deleteError}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void runDelete()}
      />
    </AdminSheet>
  );
}

interface DmaConnectProps {
  email: string;
  servers: AdminUsersOverview["servers"];
  /** 성공 — 서버별 결과(계좌 칩 초기값으로 이어진다) · 부모가 재조회. */
  onConnected: (results: AdminServerResult[]) => void;
}

/** DMA 연결 없는 trader/admin 의 「DMA 연결」 — 생성 시트와 같은 필드 · 버튼 1개 · 요청 1건. */
function DmaConnect({ email, servers, onConnected }: DmaConnectProps) {
  const [value, setValue] = useState<DmaConnectValue>(EMPTY_DMA_CONNECT);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<DmaConnectErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AdminServerResult[] | null>(null);

  const ready = validateDmaConnect(value, servers).valid && !submitting;

  const submit = async () => {
    if (!ready) return;
    const body = toDmaInput(value, servers);
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await connectAdminDma(email, body);
      // 비밀번호를 들고 있지 않는다(D-06) — 재조회가 이 폼을 내리기 전까지 빈 폼 + 결과 칩.
      setValue(EMPTY_DMA_CONNECT);
      setResults(res.results);
      onConnected(res.results);
    } catch (err) {
      const failure = dmaConnectFailure(err, USER_SHEET_TEXT.connectFailed);
      setFieldErrors(failure.fields);
      setError(failure.line);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div data-slot="admin-dma-connect-form">
      <DmaConnectFields
        servers={servers}
        value={value}
        onChange={(next) => {
          setFieldErrors((prev) => clearChangedErrors(prev, value, next));
          setValue(next);
        }}
        errors={fieldErrors}
        disabled={submitting}
        idPrefix="admin-user-sheet-dma"
      />
      <Button
        type="button"
        data-slot="admin-dma-connect-submit"
        disabled={!ready}
        onClick={() => void submit()}
        className="mt-3 h-11 w-full rounded-[12px] text-[14px] font-semibold text-[var(--primary-fg)]"
      >
        {connectDmaLabel(value.servers.length)}
      </Button>
      {results && results.length > 0 && (
        <div data-slot="admin-dma-connect-results" className="mt-2">
          <ResultChips results={results} />
        </div>
      )}
      {error && (
        <p role="alert" data-slot="admin-dma-connect-error" className={ERROR_LINE}>
          {error}
        </p>
      )}
    </div>
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
