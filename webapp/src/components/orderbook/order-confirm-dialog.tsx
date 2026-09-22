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
 *
 * ⑥ Phase 18 확장 — 정정 · 예약 · 시간외종가 (18-07, TRADE-07 · UI-SPEC §주문확인 다이얼로그)
 *   D-20 이 단일 제출 버튼 규율을 뒤집어 수동주문 폼에 「매수 · 매도 · 정정 · 취소」가 한 줄에
 *   선다. 그래서 인접 오클릭의 **유일한** 방어선이 이 다이얼로그다(T-18-30) — ②·④ 는
 *   한 글자도 완화하지 않는다.
 *   - 추가 필드는 **전부 optional** 이다. 기존 호출부(`order-panel.tsx` · `account-panel.tsx`)는
 *     수정 없이 컴파일되고 화면도 그대로다.
 *   - 제목 라벨은 호출부가 `affordanceOf` 결과(`buttonMode`)를 실어 보낸 값에서만 나온다.
 *     여기서 창을 다시 판정하지 않는다(판정의 유일 지점은 `lib/queued-window.ts`).
 *   - 정정 확정 버튼은 **원주문 방향 색**(`--up`/`--down`)으로 채운다. 목업의 `--primary` 는
 *     값이 `--down` 과 같아 「매수 정정」이 매도 파랑으로 보이게 되므로 쓰지 않는다(③).
 *   - 취소는 `accountNo` 가 실려 오면(수동주문 폼 경로) UI-SPEC 요약(종목·계좌·거래소·원주문·
 *     취소 수량) + 경고 박스 + 「취소 주문」이다. 실려 오지 않는 기존 미체결 표 경로는 옛
 *     4항목 요약을 유지한다 — 이 phase 에서 기존 화면을 깨지 않는다. 두 경로 모두 닫기 버튼은
 *     「닫기」다(「취소」 버튼과 「취소 주문」 버튼이 나란히 서면 어느 쪽이 주문을 취소하는지
 *     흐려진다).
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
import type { OrderButtonMode } from '@/lib/queued-window';
import { cn } from '@/lib/utils';

const KRW = new Intl.NumberFormat('ko-KR');

/**
 * 시간외종가 가격 표기 — 가격 0 원주문(시간외종가)을 「0」 대신 이 말로 쓴다(CR-01 표시 정합).
 * 이 문자열의 **유일한 정의**다. 수동주문 폼의 선택 칩도 이것을 import 한다(두 벌 금지).
 */
export const OFFHOURS_PRICE_LABEL = '시간외종가';

/**
 * 이 원주문은 **시간외종가 원주문**인가 (GC-IN-03 · D-21 · D-23). `board` 가 `'G2'`/`'G3'` 이거나
 * `price === 0` 이면 그렇다.
 *
 * 근거 둘:
 *  1. 서버 `board` 가 정본이다 — G2/G3 이면 가격이 실려 와도(> 0) 시간외종가 원주문이다.
 *  2. 가격 0 은 DB·zod 불변식상 G2/G3 원주문에서만 나온다(지정가 원주문은 price > 0). 그래서
 *     `board` 를 빈 값으로 내리는 구 서버의 행도 가격 0 으로 보완한다.
 *
 * ★ 근거 2의 범위 (R3-IN-04): 이 불변식은 **relay 가 만든 주문**(DB CHECK · zod)에만 성립한다.
 *   미체결 목록(`RelayAccountState.unf`)은 게이트웨이 계좌 상태라 같은 계좌의 **다른 단말**(세션
 *   합류 · WinForms) 주문도 싣고, 그 단말의 시장가 미체결(단일가 · VI 구간에서 잔존 가능)도 가격 0
 *   으로 올 수 있다. 그때 `board` 가 빈 행이면 칩 · 확인 요약은 「시간외종가」 로, 정정 잠금 사유는
 *   시간외종가 문구로 잘못 말한다. 잠그는 방향이라 보수적이어서(정정만 막고 취소는 연다) 판정식은
 *   그대로 둔다. 중립 표기(「가격 없음」)에는 서버 주문유형 필드가 필요해 deferred 로 넘겼다
 *   (`deferred-items.md` 「18-35 발견」).
 *
 * ★ **판정의 유일 지점**이다 — 수동주문 폼의 선택 칩 표기 · 이 다이얼로그의 원주문 줄/옛 취소 요약
 *   주문가 · 수동주문 폼의 정정 잠금이 모두 이 함수를 부른다. 표시와 잠금이 두 벌이면 같은 행에서
 *   칩과 버튼이 서로 다른 말을 한다. `board` 부재는 빈 값과 같다(가격 규칙만 남는다).
 */
export function isOffhoursOrder(row: { board?: string; price: number }): boolean {
  return row.board === 'G2' || row.board === 'G3' || row.price === 0;
}

/** 신규 주문 확인 요약 (UI-SPEC §주문확인 다이얼로그). Phase 18 필드는 전부 optional. */
export interface NewOrderConfirmDetail {
  mode: 'new';
  side: OrderSide;
  stockName: string;
  code: string;
  accountNo: string;
  exchange: RelayExchange;
  price: number;
  qty: number;
  /** `affordanceOf(...).buttonMode` — `'queued'` 면 제목·확정이 「예약매수/예약매도」. 부재 = 일반. */
  buttonMode?: OrderButtonMode;
  /** 주문유형. 부재 = 지정가. `'offhours'` 면 가격 0 · KRX 세션 요약. */
  orderType?: 'limit' | 'offhours';
  /** 시간외종가 참고 종가(표시 전용). 부재·null = 「—」. */
  referencePrice?: number | null;
  /** 조각 수 — 폼에 스테퍼가 **보였을 때만** 실린다. 부재 = 행 없음. */
  pieceCount?: number;
  /** 서버 상한(`maxPieces`) — `pieceCount` 와 함께만 쓴다. */
  maxPieces?: number;
  /** 예약 안내 줄(`affordanceOf(...).confirmNote`). 부재·null = 없음. */
  confirmNote?: string | null;
}

/** 미체결 정정 확인 요약 (Phase 18 D-21). 방향은 원주문을 승계한다. */
export interface ModifyOrderConfirmDetail {
  mode: 'modify';
  /** 원주문 방향(승계) — 사용자가 고르지 않는다. */
  side: OrderSide;
  stockName: string;
  code: string;
  accountNo: string;
  exchange: RelayExchange;
  orgOrderNo: string;
  orgPrice: number;
  orgQty: number;
  /** 원주문의 보드(`RelayUnfilled.board`). 부재 = 가격 규칙만으로 시간외종가를 판정한다. */
  board?: string;
  /** 정정 후 가격·수량. */
  price: number;
  qty: number;
}

/** 미체결 취소 확인 요약. `accountNo` 가 있으면 수동주문 폼 경로의 확장 요약이다. */
export interface CancelOrderConfirmDetail {
  mode: 'cancel';
  orderNo: string;
  side: OrderSide;
  stockName: string;
  price: number;
  unfilledQty: number;
  code?: string;
  accountNo?: string;
  exchange?: RelayExchange;
  /** 원주문 수량(원주문 행 표기용). 부재 = 미체결 잔량으로 표기. */
  orderQty?: number;
  /** 원주문의 보드(`RelayUnfilled.board`). 부재 = 가격 규칙만으로 시간외종가를 판정한다. */
  board?: string;
}

export type OrderConfirmDetail =
  | NewOrderConfirmDetail
  | ModifyOrderConfirmDetail
  | CancelOrderConfirmDetail;

export interface OrderConfirmDialogProps {
  /** null 이면 닫힘. non-null 이면 그 내용으로 열린다. */
  detail: OrderConfirmDetail | null;
  /** 취소/ESC/overlay 로 닫힐 때 false 로 호출된다. */
  onOpenChange: (open: boolean) => void;
  /** 확인 시 실행할 제출. 부모가 소유하며 예외는 여기서도 흡수한다. */
  onConfirm: () => void | Promise<void>;
}

/** 방향 채움 클래스 — 매수 `--up` · 매도 `--down`. 글자색은 `--destructive-fg`(③). */
function sideFill(side: OrderSide): string {
  return cn(
    'border-transparent text-[var(--destructive-fg)]',
    side === 'B'
      ? 'bg-[var(--up)] hover:bg-[color-mix(in_oklch,var(--up)_88%,black)]'
      : 'bg-[var(--down)] hover:bg-[color-mix(in_oklch,var(--down)_88%,black)]',
  );
}

const sideWord = (side: OrderSide) => (side === 'B' ? '매수' : '매도');

/**
 * 「{No} · {매수|매도} {가격} × {수량}」 — 원주문 행 값.
 * 시간외종가 원주문(`isOffhoursOrder` — board G2/G3 또는 가격 0)은 가격 자리에 「시간외종가」 를
 * 쓴다. 「0원」 이나 서버가 실어 온 참고 가격으로 읽히면 안 된다.
 */
function orgLine(
  orderNo: string,
  side: OrderSide,
  price: number,
  qty: number,
  board: string | undefined,
): ReactNode {
  return (
    <span>
      <span className="mono">{orderNo}</span> · {sideWord(side)}{' '}
      <span className="mono">
        {isOffhoursOrder({ board, price }) ? OFFHOURS_PRICE_LABEL : KRW.format(price)} ×{' '}
        {KRW.format(qty)}
      </span>
    </span>
  );
}

const WARN_BOX =
  'rounded-[var(--r-md)] border border-[var(--destructive)] bg-[color-mix(in_oklch,var(--destructive)_8%,transparent)] px-[var(--s-3)] py-[var(--s-2)] text-[length:var(--t-caption)] text-[var(--fg)] break-words';

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

  return (
    <Dialog open={detail !== null} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        /* 폰에서 요약이 길어지면(정정·예약 줄) 본문이 세로 스크롤된다 — focus trap 은 Radix 그대로. */
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-sm"
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
        {detail ? <DialogBodyFor detail={detail} /> : null}

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
          {detail ? (
            <ConfirmButton detail={detail} busy={busy} onClick={handleConfirm} />
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 확정 버튼 — 주문 성격별 라벨·색. */
function ConfirmButton({
  detail,
  busy,
  onClick,
}: {
  detail: OrderConfirmDetail;
  busy: boolean;
  onClick: () => void;
}) {
  if (detail.mode === 'cancel') {
    /* 채움 금지 — `--destructive` 는 `--up`(매수)과 같은 색이다. 테두리 + ✕ 로 구분한다. */
    const cls =
      'border-[var(--destructive)] text-[var(--destructive)] hover:bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)]';
    return (
      <Button type="button" variant="outline" onClick={onClick} disabled={busy} className={cls}>
        {detail.accountNo !== undefined ? (
          <>
            <span aria-hidden="true">✕</span> 취소 주문
          </>
        ) : (
          '✕ 주문 취소'
        )}
      </Button>
    );
  }
  const label = detail.mode === 'modify' ? '정정' : newLabel(detail);
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={busy}
      className={sideFill(detail.side)}
    >
      {label} 주문
    </Button>
  );
}

/** 신규 라벨 — `buttonMode` 는 호출부가 `affordanceOf` 에서 받아 온 값이다. */
function newLabel(d: NewOrderConfirmDetail): string {
  const base = sideWord(d.side);
  return d.buttonMode === 'queued' && d.orderType !== 'offhours' ? `예약${base}` : base;
}

function DialogBodyFor({ detail }: { detail: OrderConfirmDetail }) {
  if (detail.mode === 'cancel') {
    if (detail.accountNo === undefined) return <LegacyCancelBody detail={detail} />;
    return (
      <>
        <DialogHeader>
          <DialogTitle>미체결 주문을 취소할까요?</DialogTitle>
        </DialogHeader>
        <SummaryList
          rows={[
            ['종목', <StockCell key="s" name={detail.stockName} code={detail.code} />],
            ['계좌', <span key="a" className="mono">{detail.accountNo}</span>],
            ['거래소', <span key="e" className="mono">{detail.exchange ?? '—'}</span>],
            [
              '원주문',
              orgLine(
                detail.orderNo,
                detail.side,
                detail.price,
                detail.orderQty ?? detail.unfilledQty,
                detail.board,
              ),
            ],
            [
              '취소 수량',
              <span key="q">
                <span className="mono">{KRW.format(detail.unfilledQty)}주</span> (미체결 잔량 전부)
              </span>,
            ],
          ]}
        />
        {/* 경고 박스가 곧 Description 이다 — 같은 문장을 두 번 읽히지 않는다. */}
        <DialogDescription data-testid="order-confirm-warning" className={WARN_BOX}>
          취소 수량은 미체결 잔량 전부예요.
        </DialogDescription>
      </>
    );
  }

  const isModify = detail.mode === 'modify';
  const offHours = detail.mode === 'new' && detail.orderType === 'offhours';
  const title = isModify ? '정정' : newLabel(detail);

  const rows: [string, ReactNode][] = [
    ['종목', <StockCell key="s" name={detail.stockName} code={detail.code} />],
    ['계좌', <span key="a" className="mono">{detail.accountNo}</span>],
    ['거래소', <span key="e" className="mono">{detail.exchange}</span>],
  ];
  if (isModify) {
    rows.push([
      '원주문',
      orgLine(detail.orgOrderNo, detail.side, detail.orgPrice, detail.orgQty, detail.board),
    ]);
  }
  rows.push([
    '주문유형',
    <span key="t">{offHours ? `${OFFHOURS_PRICE_LABEL} · 가격 0 (KRX 세션)` : '지정가 · 보통'}</span>,
  ]);
  if (offHours && detail.mode === 'new') {
    const ref = detail.referencePrice;
    rows.push([
      '가격',
      <span key="p" className="mono">
        참고 종가 {ref != null && ref > 0 ? `${KRW.format(ref)}원` : '—'}
      </span>,
    ]);
  } else {
    rows.push(['가격', <span key="p" className="mono">{KRW.format(detail.price)}원</span>]);
  }
  rows.push(['수량', <span key="q" className="mono">{KRW.format(detail.qty)}주</span>]);
  if (detail.mode === 'new' && detail.pieceCount !== undefined) {
    rows.push([
      '조각 수',
      <span key="pc">
        <span className="mono">{detail.pieceCount}</span> (서버 상한 {detail.maxPieces ?? detail.pieceCount})
      </span>,
    ]);
  }
  rows.push([
    '주문금액',
    offHours ? (
      <span key="amt">종가 확정 후</span>
    ) : (
      <span key="amt" className="mono font-semibold">
        {KRW.format(detail.price * detail.qty)}원
      </span>
    ),
  ]);

  const note = detail.mode === 'new' ? (detail.confirmNote ?? null) : null;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title} 주문을 넣을까요?</DialogTitle>
        <DialogDescription>접수되면 취소하기 전까지 되돌릴 수 없어요.</DialogDescription>
      </DialogHeader>
      <SummaryList rows={rows} />
      {note && (
        <p
          data-testid="order-confirm-queued-note"
          className="m-0 rounded-[var(--r-md)] border border-[var(--new-bd)] bg-[var(--new-bg)] px-[var(--s-3)] py-[var(--s-2)] text-[length:var(--t-caption)] font-semibold text-[var(--fg)] break-words"
        >
          {note}
        </p>
      )}
      {/*
        D-20 사실 고지 — 서버는 금액·수량 한도를 두지 않는다(정책 결정, accept 된 리스크).
        마지막 방어선이 이 화면이라는 사실을 사용자에게 그대로 알린다.
      */}
      <p data-testid="order-confirm-warning" className={cn('m-0', WARN_BOX)}>
        가격·수량을 다시 확인해 주세요. 서버에는 금액·수량 한도가 없어요.
      </p>
    </>
  );
}

/** 기존 미체결 표(`account-panel.tsx`) 경로 — 옛 4항목 요약 그대로. */
function LegacyCancelBody({ detail }: { detail: CancelOrderConfirmDetail }) {
  return (
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
                  detail.side === 'B' ? 'text-[var(--up)]' : 'text-[var(--down)]',
                )}
              >
                {detail.side === 'B' ? '▲ 매수' : '▼ 매도'}
              </span>{' '}
              {detail.stockName}
            </span>,
          ],
          [
            '주문가',
            <span key="px" className="mono">
              {/* 시간외종가 원주문(`isOffhoursOrder` — 판정의 유일 지점)은 「0원」·숫자로 쓰지 않는다. */}
              {isOffhoursOrder(detail) ? OFFHOURS_PRICE_LABEL : `${KRW.format(detail.price)}원`}
            </span>,
          ],
          [
            '미체결 수량',
            <span key="qty" className="mono">{KRW.format(detail.unfilledQty)}주</span>,
          ],
        ]}
      />
    </>
  );
}

/** 종목 셀 — 확인 화면이므로 ellipsis 없이 wrap(전체 노출). */
function StockCell({ name, code }: { name: string; code?: string }) {
  return (
    <span>
      {name}
      {code ? (
        <>
          {' '}
          <span className="mono text-[var(--muted-fg)]">{code}</span>
        </>
      ) : null}
    </span>
  );
}

/** 요약 정의 목록. 라벨은 `--muted-fg`, 값은 `--fg` — 방향색은 구분 태그에만 쓴다. */
function SummaryList({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-[var(--s-3)] gap-y-[var(--s-1)] text-[length:var(--t-caption)]">
      {rows.map(([label, value]) => (
        <Fragment key={label}>
          <dt className="font-semibold whitespace-nowrap text-[var(--muted-fg)]">{label}</dt>
          <dd className="m-0 min-w-0 break-words text-right text-[var(--fg)]">{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

