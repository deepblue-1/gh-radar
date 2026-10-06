"use client";

import { useState } from "react";
import type { AdminPendingUser, AppRole } from "@gh-radar/shared";

import { CARD, ROW_DIVIDER, SECTION_COUNT, SECTION_TITLE } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { upsertAdminUser } from "@/lib/admin-api";
import { ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";

import { ADMIN_BUTTON_PRIMARY, ADMIN_CHIP_BASE, ADMIN_TONE_CLASS } from "./reflect-chip";

/**
 * PendingSection — 「승인 대기 N」 (Phase 29 D-03 · D-14 · 목업 A `pendRow()`).
 *
 * 가입했지만 허용 표(`app_users`)에 없는 사용자. 행 = 「!」 · 이메일 · 「승인 대기」 칩 · 가입 시각 · 「승인」.
 * 「승인」 → 역할 세그먼트(viewer · trader · admin — **기본 선택 없음**: 역할을 대신 정하지 않는다) → 고르는 순간
 * `POST /api/admin/users { email, role }` 1회 → 성공하면 부모가 목록을 다시 읽는다(그 행이 사용자 목록으로 옮겨진다).
 * 실패는 그 행 안 한 줄(토스트 없음 — 메모리 feedback_ui_html_mockups_first) · 세그먼트는 남아 다시 고를 수 있다.
 * 승인 대기가 0 이면 섹션 자체를 그리지 않는다.
 */

const ROLE_CHOICES: readonly AppRole[] = ["viewer", "trader", "admin"];

const KST_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
const KST_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const KST_MONTH_DAY = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });

/** 가입 시각 표기 — KST 오늘이면 「오늘 09:12 가입」, 아니면 「10월 6일 21:40 가입」(목업 `p.at`). */
export function signedUpLabel(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "가입";
  const time = KST_TIME.format(at);
  const day = KST_DATE.format(at) === KST_DATE.format(now) ? "오늘" : KST_MONTH_DAY.format(at);
  return `${day} ${time} 가입`;
}

function failureText(err: unknown): string {
  const detail = err instanceof ApiClientError ? err.message : null;
  return detail ? `승인하지 못했어요 · ${detail}` : "승인하지 못했어요";
}

function PendingRow({ entry, onApproved }: { entry: AdminPendingUser; onApproved: () => void }) {
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approve = async (role: AppRole) => {
    setBusy(true);
    setError(null);
    try {
      await upsertAdminUser({ email: entry.email, role });
      onApproved();
    } catch (err) {
      setError(failureText(err));
      setBusy(false);
    }
  };

  return (
    <li data-slot="admin-pending-row" data-email={entry.email} className={cn(ROW_DIVIDER, "px-4 py-3 sm:px-5")}>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className={cn(
            "grid size-9 flex-none place-items-center rounded-full text-[14px] font-bold",
            ADMIN_TONE_CLASS.warn,
          )}
        >
          !
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-[var(--fg)]">{entry.email}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-[var(--muted-fg)]">
            <span data-slot="admin-pending-chip" className={cn(ADMIN_CHIP_BASE, ADMIN_TONE_CLASS.warn)}>
              승인 대기
            </span>
            <span>{signedUpLabel(entry.signedUpAt)}</span>
          </span>
        </span>
        {!choosing && (
          <Button type="button" size="sm" className={ADMIN_BUTTON_PRIMARY} onClick={() => setChoosing(true)}>
            승인
          </Button>
        )}
      </div>
      {choosing && (
        <div className="mt-2.5 pl-[46px]">
          <ToggleGroup
            type="single"
            value=""
            disabled={busy}
            aria-label="역할"
            data-slot="admin-pending-role"
            onValueChange={(v) => {
              if (v === "viewer" || v === "trader" || v === "admin") void approve(v);
            }}
            className="gap-0.5 rounded-[10px] bg-[var(--muted)] p-0.5"
          >
            {ROLE_CHOICES.map((role) => (
              <ToggleGroupItem
                key={role}
                value={role}
                className="h-7 rounded-[8px]! px-3 text-[13px] font-medium text-[var(--muted-fg)] hover:bg-[var(--card)] hover:text-[var(--fg)]"
              >
                {role}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
      {error && (
        <p
          data-slot="admin-pending-error"
          role="alert"
          className="mt-1.5 pl-[46px] text-[12.5px] break-keep text-[var(--destructive)]"
        >
          {error}
        </p>
      )}
    </li>
  );
}

export interface PendingSectionProps {
  pending: readonly AdminPendingUser[];
  /** 승인 성공 — 부모가 목록을 다시 읽는다. */
  onApproved: () => void;
}

export function PendingSection({ pending, onApproved }: PendingSectionProps) {
  if (pending.length === 0) return null;
  return (
    <section aria-labelledby="admin-pending-title" data-slot="admin-pending" className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2 px-1">
        <h2 id="admin-pending-title" className={SECTION_TITLE}>
          승인 대기
        </h2>
        <span data-slot="admin-pending-count" className={SECTION_COUNT}>
          {pending.length}
        </span>
      </div>
      <ul className={cn(CARD, "m-0 list-none overflow-hidden p-0")}>
        {pending.map((entry) => (
          <PendingRow key={entry.email} entry={entry} onApproved={onApproved} />
        ))}
      </ul>
    </section>
  );
}
