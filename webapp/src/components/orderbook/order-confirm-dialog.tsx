'use client';

/**
 * OrderConfirmDialog — 되돌릴 수 없는 액션 확인 (UI-SPEC C12, 오조작 방지 ③).
 *
 * ① 무엇을 하는가
 *   신규 주문과 미체결 취소, **두 경우 모두** 제출 전에 명시 확인을 강제한다. 확인 없이
 *   나가는 경로는 존재하지 않는다 — 주문은 접수되면 취소 전까지 되돌릴 수 없고, 취소는
 *   그 자체가 되돌릴 수 없는 액션이다.
 *
 * ② ★ 기본 포커스가 취소/닫기다 (`delete-conversation-dialog.tsx` 와 다른 유일한 점)
 *   Radix 는 열릴 때 첫 tabbable 로 포커스를 옮긴다. 그 자리에 실행 버튼이 오면 **Enter
 *   연타 한 번에 주문이 나간다.** 그래서 `onOpenAutoFocus` 를 가로채 취소/닫기 버튼으로
 *   포커스를 보내고(`autoFocus` 는 그 이중 안전장치), 우상단 X 닫기 버튼도 끈다
 *   (`showCloseButton={false}`) — 실행 버튼 옆에 또 다른 클릭 타깃을 두지 않는다.
 *
 * ③ ★ LOCKED 색 규칙 (UI-SPEC §토큰 충돌 경보)
 *   `--destructive` 와 `--up`(매수)의 oklch 값이 **완전히 같다**. 그래서 취소 버튼을
 *   채움 빨강 variant 로 만들면 매수 주문 버튼과 시각적으로 구분되지 않는다.
 *   취소는 반드시 **테두리 + `--destructive` 텍스트 + `✕`**(투명 배경)다.
 *   같은 이유로 실행 버튼의 글자색에는 shadcn 기본 accent 전경 토큰 대신 값이 완전히
 *   동일한 `--destructive-fg`(light #FFFFFF / dark oklch(0.10 0 0))를 쓴다 — accent 파랑
 *   계열 토큰명은 이 표면에 아예 등장시키지 않는다(그 값이 곧 `--down`, 매도 파랑이다).
 *
 * ④ 중복 제출 가드 · 인라인 에러
 *   `delete-conversation-dialog.tsx` 에서 그대로 가져온다 — `busy` 가드, `catch` 인라인
 *   피드백(unhandled rejection 방지), 닫힘 시 에러 리셋.
 *
 * ⑤ 제어형 컴포넌트
 *   `detail` 이 non-null 이면 열린다. 실제 제출은 **부모가 소유**한다(`onConfirm`) —
 *   제출 중 비활성 상태는 다이얼로그가 닫힌 뒤에도 주문 패널에 남아야 하기 때문이다.
 */

import { Fragment, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { OrderSide, RelayExchange } from '@gh-radar/shared';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const KRW = new Intl.NumberFormat('ko-KR');

/** 신규 주문 확인 요약 (UI-SPEC §확인 다이얼로그 — 7항목). */
export interface NewOrderConfirmDetail {
  mode: 'new';
  side: OrderSide;
  stockName: string;
  code: string;
  accountNo: string;
  exchange: RelayExchange;
  price: number;
  qty: number;
}

/** 미체결 취소 확인 요약 (UI-SPEC §확인 다이얼로그 — 4항목). */
export interface CancelOrderConfirmDetail {
  mode: 'cancel';
  orderNo: string;
  side: OrderSide;
  stockName: string;
  price: number;
  unfilledQty: number;
}

export type OrderConfirmDetail = NewOrderConfirmDetail | CancelOrderConfirmDetail;

export interface OrderConfirmDialogProps {
  /** null 이면 닫힘. non-null 이면 그 내용으로 열린다. */
  detail: OrderConfirmDetail | null;
  /** 취소/ESC/overlay 로 닫힐 때 false 로 호출된다. */
  onOpenChange: (open: boolean) => void;
  /** 확인 시 실행할 제출. 부모가 소유하며 예외는 여기서도 흡수한다. */
  onConfirm: () => void | Promise<void>;
}

export function OrderConfirmDialog({
  detail,
  onOpenChange,
  onConfirm,
}: OrderConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  /** 기본 포커스 대상(취소/닫기). 실행 버튼에 포커스가 가면 Enter 한 번에 주문이 나간다. */
  const dismissRef = useRef<HTMLButtonElement>(null);

  const handleConfirm = async () => {
    if (!detail || busy) return; // 중복 제출 가드 — 연타해도 한 번만 나간다.
    setBusy(true);
    setError(false);
    try {
      await onConfirm();
    } catch {
      // 부모가 이미 인라인 배너로 결과를 그리지만, 여기서도 삼켜 unhandled rejection 을 막는다.
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) setError(false); // 닫힘 시 에러 리셋 — 재오픈 시 깨끗한 상태.
    onOpenChange(open);
  };

  const isBuy = detail?.side === 'B';
  const sideLabel = isBuy ? '매수' : '매도';

  return (
    <Dialog open={detail !== null} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-sm"
        data-testid="order-confirm-dialog"
        /*
          ★ 기본 포커스를 실행 버튼에서 떼어낸다. Radix 기본 동작(첫 tabbable)을 막고
            취소/닫기 버튼으로 보낸다 — Enter 연타로 주문이 나가면 안 된다.
        */
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          dismissRef.current?.focus();
        }}
      >
        {detail?.mode === 'cancel' ? (
          <>
            <DialogHeader>
              <DialogTitle>미체결 주문을 취소할까요?</DialogTitle>
              <DialogDescription>취소 수량은 미체결 잔량 전부예요.</DialogDescription>
            </DialogHeader>
            <SummaryList
              rows={[
                ['주문번호', <span key="no" className="mono">{detail.orderNo}</span>],
                [
                  '구분·종목',
                  <span key="side">
                    <span
                      className={cn(
                        'font-semibold',
                        detail.side === 'B'
                          ? 'text-[var(--up)]'
                          : 'text-[var(--down)]',
                      )}
                    >
                      {detail.side === 'B' ? '▲ 매수' : '▼ 매도'}
                    </span>{' '}
                    {detail.stockName}
                  </span>,
                ],
                ['주문가', <span key="px" className="mono">{KRW.format(detail.price)}원</span>],
                [
                  '미체결 수량',
                  <span key="qty" className="mono">{KRW.format(detail.unfilledQty)}주</span>,
                ],
              ]}
            />
          </>
        ) : detail ? (
          <>
            <DialogHeader>
              <DialogTitle>{sideLabel} 주문을 넣을까요?</DialogTitle>
              <DialogDescription>
                접수되면 취소하기 전까지 되돌릴 수 없어요.
              </DialogDescription>
            </DialogHeader>
            <SummaryList
              rows={[
                [
                  '종목',
                  <span key="stock">
                    {detail.stockName} <span className="mono text-[var(--muted-fg)]">{detail.code}</span>
                  </span>,
                ],
                ['계좌', <span key="acct" className="mono">{detail.accountNo}</span>],
                ['거래소', <span key="ex" className="mono">{detail.exchange}</span>],
                ['주문유형', <span key="type">지정가 · 보통</span>],
                ['가격', <span key="px" className="mono">{KRW.format(detail.price)}원</span>],
                ['수량', <span key="qty" className="mono">{KRW.format(detail.qty)}주</span>],
                [
                  '주문금액',
                  <span key="amt" className="mono font-semibold">
                    {KRW.format(detail.price * detail.qty)}원
                  </span>,
                ],
              ]}
            />
            {/*
              D-20 사실 고지 — 서버는 금액·수량 한도를 두지 않는다(정책 결정, accept 된 리스크).
              마지막 방어선이 이 화면이라는 사실을 사용자에게 그대로 알린다.
            */}
            <p
              data-testid="order-confirm-warning"
              className="rounded-[var(--r-md)] border border-[var(--destructive)] bg-[color-mix(in_oklch,var(--destructive)_8%,transparent)] px-[var(--s-3)] py-[var(--s-2)] text-[length:var(--t-caption)] text-[var(--fg)]"
            >
              가격·수량을 다시 확인해 주세요. 서버에는 금액·수량 한도가 없어요.
            </p>
          </>
        ) : null}

        {error && (
          <p role="alert" className="text-[length:var(--t-caption)] text-[var(--destructive)]">
            요청을 보내지 못했어요. 잠시 후 다시 시도해 주세요.
          </p>
        )}

        <DialogFooter>
          {/* 기본 포커스 대상 — 실행 버튼보다 **앞**에 둔다(탭 순서·오클릭 방어). */}
          <Button
            type="button"
            variant="outline"
            autoFocus
            ref={dismissRef}
            onClick={() => handleOpenChange(false)}
            disabled={busy}
          >
            {detail?.mode === 'cancel' ? '닫기' : '취소'}
          </Button>
          {detail?.mode === 'cancel' ? (
            /* 채움 금지 — `--destructive` 는 `--up`(매수)과 같은 색이다. 테두리 + ✕ 로 구분한다. */
            <Button
              type="button"
              variant="outline"
              onClick={handleConfirm}
              disabled={busy}
              className="border-[var(--destructive)] text-[var(--destructive)] hover:bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)]"
            >
              ✕ 주문 취소
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={handleConfirm}
              disabled={busy}
              className={cn(
                'border-transparent text-[var(--destructive-fg)]',
                isBuy
                  ? 'bg-[var(--up)] hover:bg-[color-mix(in_oklch,var(--up)_88%,black)]'
                  : 'bg-[var(--down)] hover:bg-[color-mix(in_oklch,var(--down)_88%,black)]',
              )}
            >
              {sideLabel} 주문
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 요약 정의 목록. 라벨은 `--muted-fg`, 값은 `--fg` — 방향색은 구분 태그에만 쓴다. */
function SummaryList({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-[var(--s-3)] gap-y-[var(--s-1)] text-[length:var(--t-caption)]">
      {rows.map(([label, value]) => (
        <Fragment key={label}>
          <dt className="font-semibold text-[var(--muted-fg)]">{label}</dt>
          <dd className="text-right text-[var(--fg)]">{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
