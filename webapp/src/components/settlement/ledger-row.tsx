"use client";

import { useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  formatEokMan,
  hgOf,
  kstDateIso,
  pendAccKeys,
  settlementDateLabel,
  settlementStampLabel,
  type SettlementLedgerRow,
  type SettlementPend,
  type SettlementSettleRow,
} from "@gh-radar/shared";

import { ADMIN_BUTTON_SECONDARY, ADMIN_CHIP_BASE, ADMIN_TONE_CLASS } from "@/components/admin/reflect-chip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { accLabel, ledgerFlowParts, ledgerKindLabel, personName } from "./settlement-format";

/**
 * LedgerRow — 활동 카드(⑥)의 계좌 거래 줄 하나(UI-SPEC ⑥ · 목업 `ledRow` · D-19 · D-20 · D-22 · D-26).
 *
 * - 줄은 `<button aria-expanded>` — 누르면 그 아래에 펼침 상자가 열린다(바로 시트를 열지 않는다 · D-22).
 *   펼침 상자는 버튼의 형제다(「다시 반영」 · 「고치기」 도 버튼이라 안에 넣을 수 없다).
 * - 좁으면 두 줄(「날짜 흐름 금액 셰브론」 / 「날짜 꼬리표」) · 정산 본문 ≥ 768 이면 한 줄.
 * - 꼬리표 조합(목업 그대로): 거래 종류(중립) · 법인 용역이면 「법인 용역 · 개인 이체 아님」(ok) 아니고 명의가 바뀌면 「현중 → 근형」(warn) ·
 *   바로 출금 줄이면 「M/D 정산」(중립) · 못 보낸 예수금이 있으면 「예수금 미반영」(err) · 메모(꼬리표 아님 · 12 `--muted-fg`).
 * - 펼침: 적은 사람(배포 때 넣은 줄은 「배포 때 미리 넣은 내역」) · 고친 사람 · 예수금(반영함 / 그대로 둠 / 사유별 미반영 문장 + 「다시 반영」) ·
 *   단추 줄(바로 출금 줄은 단추 대신 안내 문장 · 아니면 핸들러가 있을 때만 「고치기」 · 「지우기」 — 누를 수 없는 단추를 두지 않는다).
 * - 금액은 부호 · 방향색 없는 `formatEokMan`(거래 금액은 무색).
 */

/** 펼침 줄 버튼 공통 — hover · 열림 면. 포커스 링은 전역 규칙 그대로(이 버튼에 링 클래스를 따로 달지 않는다 — 터치 링 규율). */
export const ACTIVITY_ROW_BUTTON =
  "grid w-full items-center gap-x-3 gap-y-1 rounded-[8px] px-1 py-3 text-left text-[14px] hover:bg-[color-mix(in_oklab,var(--muted)_60%,transparent)]";
export const ACTIVITY_ROW_OPEN = "bg-[color-mix(in_oklab,var(--muted)_60%,transparent)]";
/** 펼침 상자(`.sub`). */
export const ACTIVITY_SUB = "mb-2 rounded-[12px] bg-[var(--muted)] px-4 py-1";
/** 펼침 단추 줄(`.ma`). */
export const ACTIVITY_ACTIONS =
  "flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-2 pb-3 text-[12px] first:border-t-0";
/** 펼친 줄 작은 버튼 — `--muted` 상자 위 `--card` 면 + 테두리(researcher decision 22). */
export const ACTIVITY_SMALL_BUTTON = cn(
  ADMIN_BUTTON_SECONDARY,
  "bg-[var(--card)] ring-1 ring-inset ring-[var(--border-subtle)]",
);
/** 형제 줄 위 hairline · 첫 줄 없음. */
export const ACTIVITY_ITEM = "border-t border-[var(--border-subtle)] first:border-t-0";

const CHIP_NEUTRAL = "bg-[var(--muted)] text-[var(--fg-2)]";

/** 셰브론(장식) — 열림 180° · 200ms. */
export function RowChevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <ChevronDown
      aria-hidden="true"
      className={cn(
        "size-4 text-[var(--faint)] transition-transform duration-200 motion-reduce:transition-none",
        open && "rotate-180",
        className,
      )}
    />
  );
}

/** 펼침 메타 줄(`.mr`) — 라벨 왼쪽 · 값 오른쪽(좁으면 다음 줄 오른쪽). */
export function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      data-slot="settlement-meta"
      className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 border-t border-[var(--border-subtle)] py-2 text-[12px] first:border-t-0"
    >
      <span className="text-[var(--muted-fg)]">{label}</span>
      <span className="ml-auto min-w-0 text-right text-[var(--fg)]">{children}</span>
    </div>
  );
}

/** 「적은 사람」 · (고쳤으면) 「고친 사람」 줄 — 이메일은 `break-all`. */
export function WhoMeta({
  by,
  at,
  seeded = false,
  editedBy = null,
  editedAt = null,
}: {
  by: string | null;
  at: string;
  seeded?: boolean;
  editedBy?: string | null;
  editedAt?: string | null;
}) {
  return (
    <>
      <MetaRow label="적은 사람">
        {seeded ? (
          "배포 때 미리 넣은 내역"
        ) : (
          <>
            <span className="break-all">{by ?? "—"}</span>
            {" · "}
            {settlementStampLabel(at)}
          </>
        )}
      </MetaRow>
      {editedBy !== null && editedAt !== null && (
        <MetaRow label="고친 사람">
          <span className="break-all">{editedBy}</span>
          {" · "}
          {settlementStampLabel(editedAt)}
        </MetaRow>
      )}
    </>
  );
}

/**
 * 못 보낸 예수금 문장(D-26 · 「플랜 단계 보강」) — 사유 `below_one`(반영하면 1원 미만) 계좌와 그 밖 계좌를 따로 묶는다.
 * 계좌 순서는 SETTLEMENT_ACCOUNTS 순서. 「KB 정근형 · 교보 정근형 미반영 — 매매 서버에 보내지 못했어요」.
 */
export function pendLines(pend: SettlementPend): string[] {
  const keys = pendAccKeys(pend);
  const below = keys.filter((k) => pend[k]?.reason === "below_one");
  const other = keys.filter((k) => pend[k]?.reason !== "below_one");
  const out: string[] = [];
  if (other.length > 0) out.push(`${other.map(accLabel).join(" · ")} 미반영 — 매매 서버에 보내지 못했어요`);
  if (below.length > 0) out.push(`${below.map(accLabel).join(" · ")} 미반영 — 예수금이 0 이하가 되어 보내지 않았어요`);
  return out;
}

/** 정산이 만든 줄의 「M/D」 — 정산을 확정한 날(KST). */
export function settleDateLabel(settle: Pick<SettlementSettleRow, "createdAt">, nowIso: string): string {
  return settlementDateLabel(kstDateIso(new Date(settle.createdAt)), nowIso);
}

export interface LedgerRowProps {
  row: SettlementLedgerRow;
  /** 바로 출금 줄이면 그 줄을 만든 정산(없으면 null). */
  settle: SettlementSettleRow | null;
  open: boolean;
  onToggle: () => void;
  nowIso: string;
  /** 44-10 이 단다 — 없으면 단추를 그리지 않는다. */
  onEdit?: (row: SettlementLedgerRow) => void;
  onDelete?: (row: SettlementLedgerRow) => void;
  /** 못 보낸 예수금 다시 반영(D-26) — 없으면 링크를 그리지 않는다. */
  onRetry?: (id: number) => void;
  retrying: boolean;
  /** 「다시 반영하지 못했어요 · …」 완성 문장. */
  retryError: string | null;
}

export function LedgerRow({
  row,
  settle,
  open,
  onToggle,
  nowIso,
  onEdit,
  onDelete,
  onRetry,
  retrying,
  retryError,
}: LedgerRowProps) {
  const subId = useId();
  const flow = ledgerFlowParts(row);
  const hg = hgOf(row);
  const lines = pendLines(row.pend);
  const hasPend = lines.length > 0;
  const fromSettle = row.settleId !== null;
  const settleLabel = settle ? settleDateLabel(settle, nowIso) : null;
  const canEdit = !fromSettle && (onEdit !== undefined || onDelete !== undefined);

  return (
    <div data-slot="settlement-ledger-item" data-id={row.id} className={ACTIVITY_ITEM}>
      <button
        type="button"
        data-slot="settlement-ledger-row"
        aria-expanded={open}
        aria-controls={open ? subId : undefined}
        onClick={onToggle}
        className={cn(
          ACTIVITY_ROW_BUTTON,
          "grid-cols-[52px_minmax(0,1fr)_auto_16px] @min-[768px]/settle:grid-cols-[56px_208px_minmax(0,1fr)_auto_16px]",
          open && ACTIVITY_ROW_OPEN,
        )}
      >
        <span
          data-slot="settlement-row-date"
          className="col-start-1 row-span-2 row-start-1 whitespace-nowrap text-[12px] text-[var(--muted-fg)] @min-[768px]/settle:row-span-1"
        >
          {settlementDateLabel(row.txDate, nowIso)}
        </span>
        <span
          data-slot="settlement-ledger-flow"
          className="col-start-2 row-start-1 min-w-0 break-keep font-semibold text-[var(--fg)]"
        >
          {flow.from}
          <span className="mx-0.5 font-normal text-[var(--faint)]"> → </span>
          {flow.to}
        </span>
        <span className="col-span-3 col-start-2 row-start-2 flex min-w-0 flex-wrap items-center gap-1 @min-[768px]/settle:col-span-1 @min-[768px]/settle:col-start-3 @min-[768px]/settle:row-start-1">
          <Tag className={CHIP_NEUTRAL}>{ledgerKindLabel(row.kind)}</Tag>
          {row.via === "corp_service" ? (
            <Tag className={ADMIN_TONE_CLASS.ok}>법인 용역 · 개인 이체 아님</Tag>
          ) : hg ? (
            <Tag className={cn(ADMIN_TONE_CLASS.warn, "text-[var(--settle-warn-fg)]")}>
              {personName(hg.from).slice(1)} → {personName(hg.to).slice(1)}
            </Tag>
          ) : null}
          {settleLabel && <Tag className={CHIP_NEUTRAL}>{settleLabel} 정산</Tag>}
          {hasPend && <Tag className={ADMIN_TONE_CLASS.err}>예수금 미반영</Tag>}
          {row.memo && (
            <span
              data-slot="settlement-ledger-memo"
              className="min-w-0 break-keep text-[12px] text-[var(--muted-fg)]"
            >
              {row.memo}
            </span>
          )}
        </span>
        <span
          data-slot="settlement-ledger-amt"
          className="col-start-3 row-start-1 whitespace-nowrap text-right font-semibold tabular-nums text-[var(--fg)] @min-[768px]/settle:col-start-4"
        >
          {formatEokMan(row.amountKrw)}
        </span>
        <RowChevron open={open} className="col-start-4 row-start-1 @min-[768px]/settle:col-start-5" />
      </button>

      {open && (
        <div id={subId} data-slot="settlement-ledger-sub" className={ACTIVITY_SUB}>
          <WhoMeta
            by={row.createdBy}
            at={row.createdAt}
            seeded={row.seeded}
            editedBy={row.editedBy}
            editedAt={row.editedAt}
          />
          <MetaRow label="예수금">
            {hasPend
              ? lines.map((line, i) => (
                  <span key={line} className="block break-keep text-[var(--destructive)]">
                    {line}
                    {i === lines.length - 1 && onRetry && (
                      <>
                        {" "}
                        <button
                          type="button"
                          disabled={retrying}
                          aria-busy={retrying || undefined}
                          onClick={() => onRetry(row.id)}
                          className="ml-1 text-[var(--accent-fg)] hover:underline disabled:opacity-50 disabled:hover:no-underline"
                        >
                          다시 반영
                        </button>
                      </>
                    )}
                  </span>
                ))
              : row.reflect
                ? "반영함"
                : "그대로 둠"}
          </MetaRow>
          {retryError && (
            <p
              data-slot="settlement-retry-error"
              role="alert"
              className="pb-2 text-right break-keep text-[12px] text-[var(--destructive)]"
            >
              {retryError}
            </p>
          )}
          {fromSettle ? (
            <div data-slot="settlement-ledger-actions" className={ACTIVITY_ACTIONS}>
              <span className="text-[var(--muted-fg)]">
                {settleLabel ? `${settleLabel} ` : ""}정산 때 만든 줄이에요 — 그 정산을 취소하면 함께 사라져요
              </span>
            </div>
          ) : (
            canEdit && (
              <div data-slot="settlement-ledger-actions" className={ACTIVITY_ACTIONS}>
                {onEdit && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => onEdit(row)}
                    className={ACTIVITY_SMALL_BUTTON}
                  >
                    고치기
                  </Button>
                )}
                {onDelete && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => onDelete(row)}
                    className={cn(ACTIVITY_SMALL_BUTTON, "text-[var(--destructive)]")}
                  >
                    지우기
                  </Button>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function Tag({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span data-slot="settlement-ledger-tag" className={cn(ADMIN_CHIP_BASE, className)}>
      {children}
    </span>
  );
}
