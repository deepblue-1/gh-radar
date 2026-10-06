"use client";

import { useState } from "react";
import type { AdminCreateUserBody, AdminServerResult, AdminUsersOverview, AppRole } from "@gh-radar/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { upsertAdminUser } from "@/lib/admin-api";
import { ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";

import { AdminSheet } from "./admin-sheet";
import {
  ADMIN_INPUT,
  DmaConnectFields,
  EMPTY_DMA_CONNECT,
  toDmaInput,
  validateDmaConnect,
  type DmaConnectErrors,
  type DmaConnectValue,
} from "./dma-connect-fields";
import { ADMIN_SEGMENT_ITEM, ADMIN_SEGMENT_ROOT, ROLE_CHOICES } from "./role-segment";

/**
 * UserCreateSheet — 「+ 사용자」 생성 시트 (Phase 29 D-16 · ADMIN-09 · 목업 A `createSheet()`).
 *
 * **한 시트다(D-16 — 2단계로 나누지 않는다).** gmail · 역할 세그먼트가 위, trader/admin 을 고르면 「DMA 연결 · 필수」
 * 그룹(`DmaConnectFields`)이 펼쳐지고 전부 채워야 버튼이 켜진다. 버튼은 하나다 —
 * 「사용자 + DMA 유저 만들기 · 서버 N대에 반영」(N = 체크한 서버 수). viewer 는 gmail · 역할만이고 버튼은 「사용자 만들기」.
 *
 * 제출 = `POST /api/admin/users { email, role, dma? }` 1건(허용 표 + DMA 유저 + 첫 계좌를 서버가 한 번에 만든다).
 * 성공하면 `onCreated(email, results)` — 부모가 이 시트를 닫고 목록을 다시 읽은 뒤 **만들어진 사용자의 편집 시트를 열어
 * 서버별 결과를 칩으로** 보인다(결과 표시는 편집 시트 몫). 실패하면 시트는 남고 그 칸 아래 또는 하단에 한 줄.
 *
 * 이메일은 다듬기(trim)만 해서 보낸다 — 소문자 정규화는 서버가 한다(편집 시트 선택은 소문자 키로).
 */

export const USER_CREATE_TEXT = {
  title: "사용자 만들기",
  email: "gmail",
  emailPlaceholder: "name@gmail.com",
  emailNote: "가입 전이면 사전 등록으로 남고, 이미 가입했으면 승인 대기에서 빠진다.",
  role: "역할",
  submitViewer: "사용자 만들기",
  failed: "만들지 못했어요",
} as const;

/** trader/admin 버튼 문구 — 체크한 서버 수를 그대로 말한다. */
export function createWithDmaLabel(serverCount: number): string {
  return `사용자 + DMA 유저 만들기 · 서버 ${serverCount}대에 반영`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FIELD = "border-b border-[var(--border-subtle)] py-3";
const LABEL = "mb-1.5 flex items-center gap-1.5 text-[12px] text-[var(--muted-fg)]";
const NOTE = "mt-1.5 text-[12px] leading-[1.5] break-keep text-[var(--muted-fg)]";
const ERROR_LINE = "mt-3 text-[12.5px] break-keep text-[var(--destructive)]";
/** 목업 `.btn.pri.big` — 폭 전체 · 15px · r12. */
const BIG_BUTTON = "h-12 w-full rounded-[12px] text-[15px] font-semibold text-[var(--primary-fg)]";

export function needsDma(role: AppRole): boolean {
  return role !== "viewer";
}

function failedText(err: unknown): string {
  const detail = err instanceof ApiClientError ? err.message : null;
  return detail ? `${USER_CREATE_TEXT.failed} · ${detail}` : USER_CREATE_TEXT.failed;
}

export interface UserCreateSheetProps {
  /** 서버 레지스트리(`AdminUsersOverview.servers`) — 등록 서버 후보. */
  servers: AdminUsersOverview["servers"];
  /** 성공 — 이메일(소문자) · 서버별 결과(dma 를 실었을 때만). 부모가 시트를 닫고 재조회 → 편집 시트를 연다. */
  onCreated: (email: string, results: AdminServerResult[] | null) => void;
  /** 실패 — 서버가 허용 행을 이미 썼을 수 있다(relay 409 · 502 는 upsert 뒤) → 부모가 목록을 다시 읽는다. */
  onFailed?: () => void;
  onClose: () => void;
}

export function UserCreateSheet({ servers, onCreated, onFailed, onClose }: UserCreateSheetProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("trader");
  const [dma, setDma] = useState<DmaConnectValue>(EMPTY_DMA_CONNECT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors] = useState<DmaConnectErrors>({});

  const withDma = needsDma(role);
  const emailOk = EMAIL_RE.test(email.trim());
  const dmaOk = !withDma || validateDmaConnect(dma, servers).valid;
  const ready = emailOk && dmaOk && !submitting;

  const submit = async () => {
    if (!ready) return;
    const trimmed = email.trim();
    const body: AdminCreateUserBody = withDma
      ? { email: trimmed, role, dma: toDmaInput(dma, servers) }
      : { email: trimmed, role };
    setSubmitting(true);
    setError(null);
    try {
      const res = await upsertAdminUser(body);
      // 성공하면 부모가 이 시트를 내린다 — 여기서 상태를 더 만지지 않는다.
      onCreated(trimmed.toLowerCase(), res.results ?? null);
    } catch (err) {
      setSubmitting(false);
      setError(failedText(err));
      onFailed?.();
    }
  };

  return (
    <AdminSheet
      open
      onOpenChange={(open) => {
        if (!open && !submitting) onClose();
      }}
      title={USER_CREATE_TEXT.title}
      footer={
        <Button
          type="button"
          data-slot="admin-user-create-submit"
          disabled={!ready}
          onClick={() => void submit()}
          className={BIG_BUTTON}
        >
          {withDma ? createWithDmaLabel(dma.servers.length) : USER_CREATE_TEXT.submitViewer}
        </Button>
      }
    >
      <form
        data-slot="admin-user-create"
        data-role={role}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className={FIELD}>
          <label htmlFor="admin-user-create-email" className={LABEL}>
            {USER_CREATE_TEXT.email} <span className="text-[var(--destructive)]">*</span>
          </label>
          <Input
            id="admin-user-create-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={USER_CREATE_TEXT.emailPlaceholder}
            disabled={submitting}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={ADMIN_INPUT}
          />
          <p className={NOTE}>{USER_CREATE_TEXT.emailNote}</p>
        </div>

        <div className="pt-3">
          <div className={LABEL}>{USER_CREATE_TEXT.role}</div>
          <ToggleGroup
            type="single"
            variant="outline"
            value={role}
            aria-label={USER_CREATE_TEXT.role}
            disabled={submitting}
            onValueChange={(v) => {
              if (v === "viewer" || v === "trader" || v === "admin") setRole(v);
            }}
            className={ADMIN_SEGMENT_ROOT}
          >
            {ROLE_CHOICES.map((r) => (
              <ToggleGroupItem key={r} value={r} className={ADMIN_SEGMENT_ITEM}>
                {r}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {withDma && (
          <DmaConnectFields
            servers={servers}
            value={dma}
            onChange={setDma}
            errors={fieldErrors}
            disabled={submitting}
            idPrefix="admin-user-create-dma"
          />
        )}

        {error && (
          <p role="alert" data-slot="admin-user-create-error" className={cn(ERROR_LINE)}>
            {error}
          </p>
        )}
      </form>
    </AdminSheet>
  );
}
