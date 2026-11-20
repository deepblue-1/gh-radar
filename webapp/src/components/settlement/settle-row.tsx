"use client";

import { useId } from "react";
import {
  SETTLEMENT_POOLS,
  formatEokManMinus,
  formatEokManSigned,
  profitTone,
  settlementStampLabel,
  settlementTimeLabel,
  type SettlementPerson,
  type SettlementSettleRow,
} from "@gh-radar/shared";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { AccountTable } from "./account-table";
import {
  ACTIVITY_ACTIONS,
  ACTIVITY_ITEM,
  ACTIVITY_ROW_BUTTON,
  ACTIVITY_ROW_OPEN,
  ACTIVITY_SMALL_BUTTON,
  ACTIVITY_SUB,
  RowChevron,
  WhoMeta,
  settleDateLabel,
} from "./ledger-row";
import { PersonDot } from "./open-pools-card";
import { personName } from "./settlement-format";

/**
 * SettleRow — 활동 카드(⑥)의 정산 기록 줄 하나(UI-SPEC ⑥ · 목업 `settleRow` · D-17 · D-27).
 *
 * - 줄: 「M/D(확정한 날)」 · 묶음 이름 · 「HH:MM 예수금으로 확정 · 메모」(HH:MM = 예수금 읽은 시각) · 정산 수익(방향색).
 *   좁으면 두 줄(설명이 둘째 줄) · 정산 본문 ≥ 768 이면 한 줄.
 * - 펼침 상자 둘: ① 사람 줄(그 묶음 비율 순 · 점 · 이름 · 비율 · 「그날 출금」 / 「계좌에 남겨 둠」 · 저장된 몫 — 다시 계산하지 않는다)
 *   ② 「확정한 순간의 계좌」 표(그때 값 · 누적 줄 · 못 읽음 줄 「…으로 확정했어요」 · 읽은 시각 줄) · 적은 사람 · 단추 줄.
 * - 취소는 묶음별 가장 최근 정산만(D-17) — 가장 최근이면 `onCancel`(44-11 이 단다)이 있을 때만 「정산 취소」,
 *   아니면 「더 최근 정산부터 차례로 취소할 수 있어요」.
 */

const TONE_CLASS = { up: "text-[var(--up)]", down: "text-[var(--down)]" } as const;

export interface SettleRowProps {
  settle: SettlementSettleRow;
  /** 그날 「바로 출금」 한 사람(그 정산이 만든 거래 줄의 사람). */
  outsWho: readonly SettlementPerson[];
  /** 그 묶음에서 가장 최근 정산인가. */
  isLatest: boolean;
  open: boolean;
  onToggle: () => void;
  nowIso: string;
  onCancel?: (settle: SettlementSettleRow) => void;
}

export function SettleRow({ settle, outsWho, isLatest, open, onToggle, nowIso, onCancel }: SettleRowProps) {
  const subId = useId();
  const pool = SETTLEMENT_POOLS[settle.pool];
  const tone = profitTone(settle.profitKrw);
  const people = Object.keys(pool.ratio) as SettlementPerson[];
  const { cumKrw, prevKrw } = settle.snapshot;

  return (
    <div data-slot="settlement-settle-item" data-id={settle.id} className={ACTIVITY_ITEM}>
      <button
        type="button"
        data-slot="settlement-settle-row"
        aria-expanded={open}
        aria-controls={open ? subId : undefined}
        onClick={onToggle}
        className={cn(
          ACTIVITY_ROW_BUTTON,
          "grid-cols-[52px_minmax(0,1fr)_auto_16px] @min-[768px]/settle:grid-cols-[56px_108px_minmax(0,1fr)_auto_16px]",
          open && ACTIVITY_ROW_OPEN,
        )}
      >
        <span
          data-slot="settlement-row-date"
          className="col-start-1 row-span-2 row-start-1 whitespace-nowrap text-[12px] text-[var(--muted-fg)] @min-[768px]/settle:row-span-1"
        >
          {settleDateLabel(settle, nowIso)}
        </span>
        <span className="col-start-2 row-start-1 min-w-0 break-keep font-semibold text-[var(--fg)]">{pool.name}</span>
        <span className="col-span-3 col-start-2 row-start-2 min-w-0 break-keep text-[12px] text-[var(--muted-fg)] @min-[768px]/settle:col-span-1 @min-[768px]/settle:col-start-3 @min-[768px]/settle:row-start-1">
          {settlementTimeLabel(settle.readAt)} 예수금으로 확정{settle.memo ? ` · ${settle.memo}` : ""}
        </span>
        <span
          className={cn(
            "col-start-3 row-start-1 whitespace-nowrap text-right font-semibold tabular-nums @min-[768px]/settle:col-start-4",
            tone ? TONE_CLASS[tone] : "text-[var(--fg)]",
          )}
        >
          {formatEokManSigned(settle.profitKrw)}
        </span>
        <RowChevron open={open} className="col-start-4 row-start-1 @min-[768px]/settle:col-start-5" />
      </button>

      {open && (
        <div id={subId} data-slot="settlement-settle-sub">
          <div className={ACTIVITY_SUB}>
            {people.map((p) => (
              <div
                key={p}
                data-slot="settlement-settle-person"
                className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] py-2 text-[14px] first:border-t-0"
              >
                <span className="min-w-0 text-[var(--fg)]">
                  <PersonDot person={p} />
                  {personName(p)} <span className="text-[12px] text-[var(--muted-fg)]">{pool.ratio[p]}%</span>
                </span>
                <span className="flex items-baseline gap-3 whitespace-nowrap">
                  <span className="text-[12px] text-[var(--muted-fg)]">
                    {outsWho.includes(p) ? "그날 출금" : "계좌에 남겨 둠"}
                  </span>{" "}
                  <span className="font-semibold tabular-nums text-[var(--fg)]">
                    {formatEokManMinus(settle.shares[p] ?? 0)}
                  </span>
                </span>
              </div>
            ))}
          </div>

          <div className={ACTIVITY_SUB}>
            <p className="pt-2 text-[12px] text-[var(--muted-fg)]">확정한 순간의 계좌</p>
            <AccountTable
              rows={settle.snapshot.accounts}
              cum={prevKrw > 0 ? { cumKrw, prevKrw } : null}
              mode="past"
              readLine={`예수금 읽은 시각 ${settlementStampLabel(settle.readAt)}`}
              nowIso={nowIso}
              compact
            />
            <WhoMeta by={settle.createdBy} at={settle.createdAt} />
            {isLatest ? (
              onCancel && (
                <div data-slot="settlement-settle-actions" className={ACTIVITY_ACTIONS}>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => onCancel(settle)}
                    className={cn(ACTIVITY_SMALL_BUTTON, "text-[var(--destructive)]")}
                  >
                    정산 취소
                  </Button>
                </div>
              )
            ) : (
              <div data-slot="settlement-settle-actions" className={ACTIVITY_ACTIONS}>
                <span className="text-[var(--muted-fg)]">더 최근 정산부터 차례로 취소할 수 있어요</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
