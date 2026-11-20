'use client';

import { useRef, type ReactNode } from 'react';
import {
  SETTLEMENT_POOLS,
  formatEokMan,
  formatEokManSigned,
  kstDateIso,
  settlementDateLabel,
  type SettlementLedgerRow,
  type SettlementSettleRow,
} from '@gh-radar/shared';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ReflectBox, type ReflectBoxProps } from '@/components/settlement/reflect-box';
import { ledgerFlowParts, ledgerKindLabel } from '@/components/settlement/settlement-format';

/**
 * Phase 44 — 「거래 지우기」 · 「정산 취소」 확인 창(⑨ · D-17 · D-23 · UI E9).
 *
 * user-sheet `ConfirmDialog` 와 같은 꼴(alertdialog · × 없음 · 비행 중 닫힘 막기)이지만 ⑩ 상자를 품어야 해서 정산 쪽에 따로 둔다.
 * 상태(켜짐 · 비행 중 · 오류)는 호출부(44-10 지우기 · 44-11 정산 취소)가 쥔다. 토스트 · alert 창은 쓰지 않는다 —
 * 성공은 호출부가 창을 닫고 목록을 다시 불러오는 것으로, 실패는 이 창 안 오류 줄로 말한다.
 */

export const CONFIRM_TEXT = {
  deleteTitle: '거래 지우기',
  deleteBody: '이 거래를 지워요. 넣은 돈 · 몫 계산에서 빠져요.',
  cancelTitle: '정산 취소',
  close: '닫기',
  delete: '지우기',
  cancel: '정산 취소',
  deleteFailed: '지우지 못했어요',
  cancelFailed: '정산을 취소하지 못했어요',
} as const;

/** 「거래 지우기」 문단 — 「9/13 · KB 정근형 → 교보 김현중 · 계좌 옮김 **4억**」 + 흐린 둘째 문단. */
export function deleteConfirmText(
  row: Pick<SettlementLedgerRow, 'txDate' | 'kind' | 'who' | 'fromAcc' | 'toAcc' | 'amountKrw'>,
  nowIso: string,
): ReactNode {
  const flow = ledgerFlowParts(row);
  const head = `${settlementDateLabel(row.txDate, nowIso)} · ${flow.from} → ${flow.to} · ${ledgerKindLabel(row.kind)} `;
  return (
    <>
      <p>
        {head}
        <b className="font-semibold">{formatEokMan(row.amountKrw)}</b>
      </p>
      <p className="mt-1 text-[var(--muted-fg)]">{CONFIRM_TEXT.deleteBody}</p>
    </>
  );
}

/**
 * 「정산 취소」 문단 — 「11/19 현중 · 근형 정산 **+10억 4,900만** 을 취소해요. 이 수익은 「정산 전 수익」 으로 돌아가요.」
 * + 바로 출금 줄이 있으면 「 그날 「바로 출금」 N건도 함께 사라져요.」. 날짜는 정산을 확정한 시각(`createdAt`)의 KST 날짜.
 */
export function cancelConfirmText(
  settle: Pick<SettlementSettleRow, 'pool' | 'profitKrw' | 'createdAt'>,
  outCount: number,
  nowIso: string,
): ReactNode {
  const date = settlementDateLabel(kstDateIso(new Date(settle.createdAt)), nowIso);
  const tail = outCount > 0 ? ` 그날 「바로 출금」 ${outCount}건도 함께 사라져요.` : '';
  return (
    <p>
      {`${date} ${SETTLEMENT_POOLS[settle.pool].name} 정산 `}
      <b className="font-semibold">{formatEokManSigned(settle.profitKrw)}</b>
      {` 을 취소해요. 이 수익은 「정산 전 수익」 으로 돌아가요.${tail}`}
    </p>
  );
}

export interface SettleConfirmProps {
  open: boolean;
  title: string;
  /** `deleteConfirmText` · `cancelConfirmText` 결과. */
  body: ReactNode;
  confirmLabel: string;
  /** 예수금에 반영했던 것이 있을 때만(`appliedEffect` 결과가 비어 있지 않을 때만 · D-23) — 없으면 null 이고 상자 자체가 없다. */
  reflect: Pick<ReflectBoxProps, 'on' | 'onToggle' | 'lines' | 'marketHours'> | null;
  /** 지우는 · 취소하는 중 — 두 버튼 · 스위치 비활성 · 바깥 클릭 · Esc 로 닫히지 않는다. */
  busy: boolean;
  /** 「지우지 못했어요 · <message>」 꼴 완성 문장 — 문단 아래 `role="alert"` 줄. */
  error: string | null;
  /** 확정 버튼만 잠근다(지운 뒤 되돌리기 실패 문장을 보일 때 · 44-10). */
  confirmDisabled?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const FOOT_BUTTON = 'h-11 flex-1 text-[14px] font-semibold';

export function SettleConfirm({
  open,
  title,
  body,
  confirmLabel,
  reflect,
  busy,
  error,
  confirmDisabled = false,
  onClose,
  onConfirm,
}: SettleConfirmProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const block = (e: Event) => {
    if (busy) e.preventDefault();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent
        ref={contentRef}
        role="alertdialog"
        showCloseButton={false}
        data-slot="settle-confirm"
        className="sm:max-w-sm dark:bg-[var(--card)]"
        // 열릴 때 포커스는 컨테이너로 — 첫 버튼에 포커스 링이 뜨거나 터치에서 화면이 밀리지 않게.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          contentRef.current?.focus({ preventScroll: true });
        }}
        onEscapeKeyDown={block}
        onInteractOutside={block}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="min-w-0">
          <DialogDescription
            asChild
            className="text-[length:var(--t-sm)] leading-[1.5] break-keep text-[var(--fg)]"
          >
            <div data-slot="settle-confirm-body" className="rounded-[12px] bg-[var(--muted)] px-4 py-3">
              {body}
            </div>
          </DialogDescription>
          {reflect && (
            <div className="mt-4">
              <ReflectBox {...reflect} disabled={busy} />
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="mt-3 text-[length:var(--t-caption)] leading-[1.5] break-keep text-[var(--destructive)]"
            >
              {error}
            </p>
          )}
        </div>
        <DialogFooter className="flex-row">
          <Button type="button" variant="secondary" className={FOOT_BUTTON} disabled={busy} onClick={onClose}>
            {CONFIRM_TEXT.close}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className={FOOT_BUTTON}
            aria-busy={busy}
            disabled={busy || confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
