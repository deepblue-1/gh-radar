'use client';

/**
 * OrderPanel — 주문 패널 (UI-SPEC C8·C9, 확정 L4 = 매수/매도 탭 전환 · 단일 폼 · 단일 제출).
 *
 * ① 무엇을 어디에
 *   호가주문 탭 그리드의 **우측 "내 계좌 축" 첫 블록**(≥900px). 좁은 폭에서는 호가 사다리
 *   바로 아래(M1 순서 ③)이며 sticky 가 아니다(M2).
 *
 * ② ★ 오조작 방지 5규율 — 이 파일의 존재 이유 (UI-SPEC §오조작 방지, T-15-14)
 *   1. **색·위치·문구 3중 일치** — 매수 = `--up`(빨강) · **왼쪽** 탭 · `매수`,
 *      매도 = `--down`(파랑) · **오른쪽** 탭 · `매도`. 제출 버튼이 활성 탭 색을 그대로 잇는다.
 *   2. **단일 제출 버튼** — 매수·매도 버튼을 나란히 두지 않는다. 인접 오클릭이 구조적으로
 *      불가능해진다. 화면에 `매수 주문`과 `매도 주문`이 동시에 존재하지 않는다.
 *   3. **확인 다이얼로그 필수** — 제출은 언제나 다이얼로그를 거친다. 기본 포커스는 취소다.
 *   4. **제출 후 즉시 재활성 금지** — 응답 전까지 비활성 + `주문 전송 중…` + 중복 제출 가드.
 *   5. (취소 버튼 채움 금지는 `account-panel.tsx` · `order-confirm-dialog.tsx` 소관)
 *
 * ③ ★ 결과는 세 가지다 — 접수 / **결과 모름** / 거부 (15-RESEARCH Pitfall 9)
 *   `ORDER_TIMEOUT`(그리고 브라우저측 타임아웃·네트워크 오류)은 **실패가 아니다.**
 *   주문이 이미 게이트웨이까지 갔을 수 있으므로
 *     - "실패"라는 단어를 쓰지 않고(문구 정본은 아래 `ResultBanner` 한 곳뿐),
 *     - 미체결 목록에서 접수 여부를 확인하도록 안내하며,
 *     - **제출 버튼을 다시 열지 않는다**(`blocked`). 재주문 경로를 주면 그 자리에서
 *       중복 체결이 난다. 잠금 해제는 탭 이동(패널 언마운트)·새로고침·종목 전환뿐이고,
 *       셋 다 "미체결을 확인하러 가는" 의도적 행동이라 클릭 한 번으로 풀리지 않는다.
 *
 * ④ ★ LOCKED 색 규칙 (UI-SPEC §토큰 충돌 경보)
 *   shadcn 의 기본 accent 파랑 토큰은 `--down`(매도 파랑)과 값이 **완전히 같다**. 그래서
 *   이 파일에는 그 토큰 이름이 **한 글자도 등장하지 않는다** — 전경색 변형(`-fg`)도 쓰지
 *   않고, 값이 완전히 동일한 `--destructive-fg`(light #FFFFFF / dark oklch(0.10 0 0))로
 *   대체한다. 채움 버튼의 글자색은 그 하나뿐이고, 그 사실을 grep 이 강제한다.
 *   accent 는 "가격 클릭 반영 플래시"(`--ring`) 한 곳에만 쓴다.
 *
 * ⑤ 토스트를 쓰지 않는다
 *   저장소에 토스트 라이브러리가 없고 D-36 이 알림 채널을 상태 바 누적으로 이미 고정했다.
 *   주문 결과는 **패널 하단 인라인 배너**(C9) 하나로만 알린다.
 *
 * ⑥ 매수 비율 버튼을 만들지 않는다
 *   `AccountState` 에 주문가능금액이 없다. 근거 데이터 없이 비율을 계산하면 그 숫자가
 *   곧 오주문이다. 비율 버튼은 **매도 탭에서만**, 기준은 잔고의 `sellableQty` 다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import type {
  CreateOrderResponse,
  OrderSide,
  RelayAccount,
  RelayExchange,
} from '@gh-radar/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Number as UiNumber } from '@/components/ui/number';
import {
  OrderConfirmDialog,
  type NewOrderConfirmDetail,
} from '@/components/orderbook/order-confirm-dialog';
import {
  createOrder,
  isUnknownOutcome,
  orderErrorCode,
  orderErrorMessage,
} from '@/lib/orders-api';
import type { RelayStatus } from '@/lib/use-relay-socket';
import { cn } from '@/lib/utils';

const KRW = new Intl.NumberFormat('ko-KR');

/** 가격 클릭 반영 플래시 지속(ms) — UI-SPEC §Accent 3번 항목. */
const PRICE_FLASH_MS = 260;

/** 매도 비율 버튼 (매수는 근거 데이터가 없어 만들지 않는다). */
const SELL_RATIOS = [10, 25, 50, 100] as const;

/**
 * KRX 호가 단위 표(2023-01-25 개정) — **폴백 전용**이다.
 *
 * 실호가(`quote.ap`/`bp`)의 인접 단계 간격이 거래소가 실제로 쓰는 단위이므로 그쪽이
 * 1순위이고(`deriveTickSize`), 이 표는 호가가 아직 없을 때만 쓴다. 시장(코스피/코스닥)별
 * 고가 구간 차이가 있어 표를 단독 정본으로 삼지 않는다 — 어긋나면 게이트웨이가 거부하고
 * 그 거부 문구가 사용자에게 그대로 전달된다.
 */
const TICK_TABLE: readonly [limit: number, tick: number][] = [
  [2_000, 1],
  [5_000, 5],
  [20_000, 10],
  [50_000, 50],
  [200_000, 100],
  [500_000, 500],
];

/** 표 기반 호가 단위. `price` 가 0 이하이면 1원. */
function tickFromTable(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 1;
  for (const [limit, tick] of TICK_TABLE) {
    if (price < limit) return tick;
  }
  return 1_000;
}

/**
 * 호가 단위 추정 — **관측값 우선**.
 * 사다리 가격 배열의 인접 단계 최소 양수 간격이 곧 그 종목의 호가 단위다.
 * 관측할 수 없으면(호가 없음·전부 0) 표로 폴백한다.
 */
export function deriveTickSize(
  askPrices: readonly number[] | undefined,
  bidPrices: readonly number[] | undefined,
  referencePrice: number,
): number {
  let best = Number.POSITIVE_INFINITY;
  for (const prices of [askPrices, bidPrices]) {
    if (!prices) continue;
    for (let i = 1; i < prices.length; i += 1) {
      const a = prices[i - 1];
      const b = prices[i];
      if (!(a > 0) || !(b > 0)) continue;
      const gap = Math.abs(a - b);
      if (gap > 0 && gap < best) best = gap;
    }
  }
  return Number.isFinite(best) ? best : tickFromTable(referencePrice);
}

/** 상태별 제출 버튼 문구 (UI-SPEC §연결 상태 배지 표의 "주문 버튼" 열). */
const DISABLED_LABEL: Partial<Record<RelayStatus, string>> = {
  idle: '연결 중…',
  connecting: '연결 중…',
  logging_in: '연결 중…',
  declaring: '연결 중…',
  reconnecting: '재접속 중…',
  failed: '연결 실패',
  manual_required: '연결 실패',
  session_rejected: '로그인 거부됨',
};

/** 주문 결과 배너 상태. `unknown` 은 **거부가 아니다**. */
type OrderResult =
  | { kind: 'accepted'; orderNo: string }
  | { kind: 'rejected'; title: string; detail: string }
  | { kind: 'unknown' };

/** 거부 코드별 다음 행동 안내 (UI-SPEC 결과-거부 `{해결 안내}`). */
function guidanceFor(code: string): string {
  switch (code) {
    case 'SESSION_NOT_READY':
      return '주문은 호가창이 연결된 상태에서만 보낼 수 있어요. 페이지를 새로고침하면 다시 연결돼요.';
    case 'DMA_NOT_ALLOWED':
      return '증권사 계정이 연결된 사용자만 주문할 수 있어요. 관리자에게 문의해 주세요.';
    case 'ACCOUNT_NOT_ALLOWED':
      return '이 계좌로는 주문할 수 없어요. 계좌를 다시 선택해 주세요.';
    case 'ISIN_UNAVAILABLE':
      return '이 종목은 주문에 필요한 표준코드가 없어요. 관리자에게 문의해 주세요.';
    case 'RELAY_UNAVAILABLE':
      return '주문 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
    case 'VALIDATION_FAILED':
      return '가격·수량을 다시 확인해 주세요.';
    case 'UNAUTHENTICATED':
      return '로그인이 필요해요. 다시 로그인한 뒤 시도해 주세요.';
    default:
      return '잠시 후 다시 시도해 주세요.';
  }
}

export interface OrderPanelProps {
  /** 6자 단축코드 — 주문 요청 키(server 가 ISIN 을 채운다). */
  code: string;
  /** 종목명 — 확인 다이얼로그 요약에 쓴다. */
  name: string;
  /** 허용 계좌 목록(`{t:"state"}.accounts`). 화면에는 **전체 표시**한다(D2). */
  accounts: RelayAccount[];
  /** 선택된 계좌번호. 섹션이 소유하고 계좌 패널과 공유한다. */
  selectedAccountNo: string;
  onAccountChange: (accountNo: string) => void;
  /** 주문 거래소 — 섹션의 KRX/NXT 토글 값을 그대로 따른다(패널에 별도 토글 없음). */
  exchange: RelayExchange;
  /** 사다리에서 클릭한 가격. 변경되면 입력에 반영되고 테두리가 1회 플래시한다. */
  selectedPrice: number | null;
  /** 호가 단위. 스텝퍼 증감폭이자 blur 스냅 기준. */
  tick: number;
  /** 이 종목의 매도가능수량 — 매도 비율 버튼의 기준값. */
  sellableQty: number;
  /** 세션 상태. 제출 버튼 문구·비활성의 정본이다. */
  status: RelayStatus;
  /** 제출이 끝났을 때(접수·거부 무관) 부모에게 알린다. */
  onSubmitted?: (res: CreateOrderResponse) => void;
  className?: string;
}

export function OrderPanel({
  code,
  name,
  accounts,
  selectedAccountNo,
  onAccountChange,
  exchange,
  selectedPrice,
  tick,
  sellableQty,
  status,
  onSubmitted,
  className,
}: OrderPanelProps) {
  const [side, setSide] = useState<OrderSide>('B');
  const [priceText, setPriceText] = useState('');
  const [qtyText, setQtyText] = useState('');
  const [snapHint, setSnapHint] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [confirm, setConfirm] = useState<NewOrderConfirmDetail | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OrderResult | null>(null);
  /** 결과를 모르는 주문이 하나라도 나가면 이 패널의 제출을 잠근다(중복 체결 방지). */
  const [blocked, setBlocked] = useState(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const price = digitsToNumber(priceText);
  const qty = digitsToNumber(qtyText);
  const amount = price * qty;
  const isBuy = side === 'B';

  /*
    종목 전환 방어 — 종목 상세는 remount 없이 props 만 바뀐다.
    리셋하지 않으면 **다른 종목의 가격·수량·결과 배너가 그대로 남는다**(T-15-40).
  */
  useEffect(() => {
    setPriceText('');
    setQtyText('');
    setSnapHint(null);
    setResult(null);
    setBlocked(false);
    setConfirm(null);
  }, [code]);

  // 사다리 가격 클릭 반영 + 테두리 1회 플래시(260ms). 매매 구분은 **바꾸지 않는다**(T-15-52).
  useEffect(() => {
    if (selectedPrice == null) return;
    setPriceText(KRW.format(selectedPrice));
    setSnapHint(null);
    setFlash(true);
    if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => {
      flashTimerRef.current = null;
      setFlash(false);
    }, PRICE_FLASH_MS);
  }, [selectedPrice]);

  useEffect(
    () => () => {
      if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current);
    },
    [],
  );

  const handlePriceChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setSnapHint(null);
    setPriceText(formatDigits(e.target.value));
  }, []);

  /** blur 스냅 — 가장 가까운 호가 단위로 맞추고, 맞췄으면 힌트를 1회 교체한다. */
  const handlePriceBlur = useCallback(() => {
    if (price <= 0 || tick <= 0) return;
    const snapped = Math.max(tick, Math.round(price / tick) * tick);
    if (snapped === price) return;
    setPriceText(KRW.format(snapped));
    setSnapHint(
      `호가 단위(${KRW.format(tick)}원)에 맞춰 ${KRW.format(snapped)}원으로 맞췄어요`,
    );
  }, [price, tick]);

  const stepPrice = useCallback(
    (dir: 1 | -1) => {
      setSnapHint(null);
      setPriceText((prev) => {
        const current = digitsToNumber(prev);
        if (current <= 0) return KRW.format(tick);
        const next = Math.max(tick, current + dir * tick);
        return KRW.format(next);
      });
    },
    [tick],
  );

  const applyRatio = useCallback(
    (ratio: number) => {
      const next = Math.floor((sellableQty * ratio) / 100);
      setQtyText(next > 0 ? KRW.format(next) : '');
    },
    [sellableQty],
  );

  const submitLabel = submitting
    ? '주문 전송 중…'
    : (DISABLED_LABEL[status] ?? (isBuy ? '매수 주문' : '매도 주문'));

  const gateDisabled = status !== 'ready';
  const submitDisabled =
    gateDisabled ||
    submitting ||
    blocked ||
    price <= 0 ||
    qty <= 0 ||
    selectedAccountNo.length === 0;

  const handleSubmitClick = useCallback(() => {
    if (submitting || blocked) return; // 중복 제출 가드 ①
    setConfirm({
      mode: 'new',
      side,
      stockName: name,
      code,
      accountNo: selectedAccountNo,
      exchange,
      price,
      qty,
    });
  }, [submitting, blocked, side, name, code, selectedAccountNo, exchange, price, qty]);

  const handleConfirmed = useCallback(async () => {
    if (submitting || blocked) return; // 중복 제출 가드 ②
    setSubmitting(true);
    setConfirm(null);
    setResult(null);
    try {
      const res = await createOrder({
        code,
        accountNo: selectedAccountNo,
        exchange,
        side,
        orderType: 'N',
        qty,
        price,
      });
      if (res.status === 'timeout') {
        // 서버가 200 으로 "결과 모름"을 실어 보낸 경우 — 실패가 아니다.
        setResult({ kind: 'unknown' });
        setBlocked(true);
      } else if (res.status === 'rejected' || res.resultCode !== 0) {
        setResult({
          kind: 'rejected',
          title: `주문이 거부됐어요 · ${res.message}`,
          detail: `가격·수량을 다시 확인해 주세요. (코드 ${res.resultCode})`,
        });
      } else {
        setResult({ kind: 'accepted', orderNo: res.orderNo });
      }
      onSubmitted?.(res);
    } catch (err) {
      if (isUnknownOutcome(err)) {
        // ★ 여기가 이 파일에서 가장 중요한 분기다. 결과를 모르면 잠근다.
        setResult({ kind: 'unknown' });
        setBlocked(true);
      } else {
        const errCode = orderErrorCode(err);
        setResult({
          kind: 'rejected',
          title:
            errCode === 'SESSION_NOT_READY'
              ? '호가창을 먼저 열어 주세요'
              : `주문이 거부됐어요 · ${orderErrorMessage(err)}`,
          detail: `${guidanceFor(errCode)} (코드 ${errCode})`,
        });
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    submitting,
    blocked,
    code,
    selectedAccountNo,
    exchange,
    side,
    qty,
    price,
    onSubmitted,
  ]);

  const accountOptions = useMemo(
    () => accounts.map((a) => ({ value: a.accountNo, label: `${a.accountNo} · ${a.name}` })),
    [accounts],
  );

  // 권한이 없으면 패널 자체를 렌더하지 않는다(주문 진입점 미노출, T-15-21).
  if (status === 'unauthorized') return null;

  return (
    <div
      data-testid="order-panel"
      className={cn('flex flex-col bg-[var(--card)]', className)}
    >
      <div className="flex items-center gap-[var(--s-2)] border-b border-[var(--border-subtle)] px-[var(--s-3)] py-[var(--s-2)]">
        <span className="text-[length:var(--t-caption)] font-semibold text-[var(--fg)]">주문</span>
        <span className="flex-1" />
        {/* 주문 유형 고정 칩 — 시장가·정정은 v1 범위 밖이다(D-21). 변경 경로 없음. */}
        <span className="rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--muted)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--muted-fg)]">
          지정가 · 보통
        </span>
      </div>

      <div className="flex flex-col gap-[var(--s-2)] p-[var(--s-3)]">
        {/*
          매매 구분 탭 — 매수가 **왼쪽**, 매도가 **오른쪽**. 위치는 색·문구와 함께 고정이다.
          `ui/toggle-group.tsx`(Radix) 대신 순수 버튼을 쓰는 이유: 단일선택 ToggleGroup 은
          항목에 `role="radio"` 를 강제해 UI-SPEC 이 요구하는 `tablist`/`tab` 대응이 깨진다.
        */}
        <div role="tablist" aria-label="매매 구분" className="grid grid-cols-2 gap-[var(--s-1)]">
          {(['B', 'S'] as const).map((s) => {
            const active = side === s;
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSide(s)}
                className={cn(
                  'h-8 rounded-[var(--r)] border text-[length:var(--t-sm)] font-semibold transition-[background,border-color] duration-[120ms]',
                  active && s === 'B' &&
                    'border-[var(--up)] bg-[var(--up-bg)] text-[var(--up)]',
                  active && s === 'S' &&
                    'border-[var(--down)] bg-[var(--down-bg)] text-[var(--down)]',
                  !active && 'border-[var(--border)] bg-transparent text-[var(--muted-fg)] hover:bg-[var(--muted)]',
                )}
              >
                {s === 'B' ? '매수' : '매도'}
              </button>
            );
          })}
        </div>

        <FormRow htmlFor="order-account" label="계좌">
          <select
            id="order-account"
            value={selectedAccountNo}
            onChange={(e) => onAccountChange(e.target.value)}
            disabled={accountOptions.length === 0}
            className="mono h-8 w-full min-w-0 rounded-[var(--r)] border border-[var(--input)] bg-[var(--bg)] px-2 text-[length:var(--t-caption)] text-[var(--fg)] disabled:opacity-50"
          >
            {accountOptions.length === 0 ? (
              <option value="">계좌 확인 중…</option>
            ) : (
              accountOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))
            )}
          </select>
        </FormRow>

        <FormRow label="거래소">
          <span className="mono text-[length:var(--t-caption)] text-[var(--fg)]">{exchange}</span>
          <span className="text-[11px] text-[var(--muted-fg)]">호가창에서 고른 거래소로 나가요</span>
        </FormRow>

        <FormRow htmlFor="order-price" label="가격">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="호가 한 단계 내리기"
            className="w-8 px-0"
            onClick={() => stepPrice(-1)}
          >
            −
          </Button>
          <Input
            id="order-price"
            size="sm"
            inputMode="numeric"
            value={priceText}
            onChange={handlePriceChange}
            onBlur={handlePriceBlur}
            aria-describedby="order-price-hint"
            data-flash={flash ? 'true' : undefined}
            className={cn(
              'mono flex-1 text-right',
              flash &&
                'border-[var(--ring)] motion-safe:shadow-[0_0_0_3px_color-mix(in_oklch,var(--ring)_28%,transparent)]',
            )}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="호가 한 단계 올리기"
            className="w-8 px-0"
            onClick={() => stepPrice(1)}
          >
            ＋
          </Button>
        </FormRow>
        <p id="order-price-hint" className="text-[11px] text-[var(--muted-fg)]">
          {snapHint ??
            `호가 단위 ${KRW.format(tick)}원 · 사다리의 가격을 클릭하면 여기에 채워져요`}
        </p>

        <FormRow htmlFor="order-qty" label="수량">
          <Input
            id="order-qty"
            size="sm"
            inputMode="numeric"
            value={qtyText}
            onChange={(e) => setQtyText(formatDigits(e.target.value))}
            className="mono flex-1 text-right"
          />
          <span className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">주</span>
        </FormRow>

        {/* 비율 버튼은 매도 탭에만 — 매수는 주문가능금액이 없어 근거가 없다. */}
        {!isBuy && (
          <div
            aria-label="보유 수량 비율"
            className="grid grid-cols-4 gap-[var(--s-1)]"
          >
            {SELL_RATIOS.map((r) => (
              <Button
                key={r}
                type="button"
                variant="outline"
                size="sm"
                className="px-0 text-[11px]"
                onClick={() => applyRatio(r)}
              >
                {r}%
              </Button>
            ))}
          </div>
        )}

        <div className="flex items-baseline justify-between rounded-[var(--r-md)] bg-[var(--muted)] px-[var(--s-3)] py-[var(--s-2)]">
          <span className="text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)]">
            주문금액
          </span>
          <span className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
            <UiNumber value={amount} format="price" />원
          </span>
        </div>

        {/* 제출 버튼은 **하나뿐**이다. 활성 탭 색을 그대로 잇는다. */}
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={handleSubmitClick}
          disabled={submitDisabled}
          data-side={side}
          className={cn(
            'w-full border-transparent text-[var(--destructive-fg)]',
            isBuy
              ? 'bg-[var(--up)] hover:bg-[color-mix(in_oklch,var(--up)_88%,black)]'
              : 'bg-[var(--down)] hover:bg-[color-mix(in_oklch,var(--down)_88%,black)]',
          )}
        >
          {submitLabel}
        </Button>

        {result && <ResultBanner result={result} />}

        <p className="text-[11px] text-[var(--muted-fg)]">
          신규 매수/매도와 취소만 지원해요 · 정정은 취소 후 다시 주문해 주세요
        </p>
      </div>

      <OrderConfirmDialog
        detail={confirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        onConfirm={handleConfirmed}
      />
    </div>
  );
}

/**
 * 주문 결과 배너 (C9).
 * - 접수 = `role="status"` 중립 톤
 * - **결과 모름 = `role="status"` 중립 톤** — 거부와 같은 톤을 쓰면 그게 곧 "실패"로 읽힌다
 * - 거부 = `role="alert"` + `--destructive` 테두리
 */
function ResultBanner({ result }: { result: OrderResult }) {
  if (result.kind === 'unknown') {
    return (
      <div
        role="status"
        data-testid="order-result-unknown"
        className="flex flex-col gap-0.5 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--muted)] px-[var(--s-3)] py-[var(--s-2)]"
      >
        <span className="text-[length:var(--t-caption)] font-semibold text-[var(--fg)]">
          접수 응답이 늦어지고 있어요
        </span>
        <span className="text-[11px] text-[var(--muted-fg)]">
          주문이 이미 나갔을 수 있어요. 미체결 목록에서 접수 여부를 확인한 뒤 다시 주문해 주세요.
        </span>
      </div>
    );
  }

  if (result.kind === 'rejected') {
    return (
      <div
        role="alert"
        data-testid="order-result-rejected"
        className="flex flex-col gap-0.5 rounded-[var(--r-md)] border border-[var(--destructive)] px-[var(--s-3)] py-[var(--s-2)]"
      >
        <span className="text-[length:var(--t-caption)] font-semibold text-[var(--destructive)]">
          {result.title}
        </span>
        <span className="text-[11px] text-[var(--muted-fg)]">{result.detail}</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      data-testid="order-result-accepted"
      className="flex flex-col gap-0.5 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--muted)] px-[var(--s-3)] py-[var(--s-2)]"
    >
      <span className="text-[length:var(--t-caption)] font-semibold text-[var(--fg)]">
        주문이 접수됐어요 · 주문번호 {result.orderNo}
      </span>
      <span className="text-[11px] text-[var(--muted-fg)]">
        체결되면 미체결·잔고가 자동으로 갱신돼요.
      </span>
    </div>
  );
}

/** 폼 한 행 — 라벨 고정폭 + 컨트롤. 라벨은 `htmlFor` 로 명시 연결한다. */
function FormRow({
  htmlFor,
  label,
  children,
}: {
  htmlFor?: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-[var(--s-2)]">
      <label
        htmlFor={htmlFor}
        className="w-9 shrink-0 text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)]"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

/** 입력 문자열에서 숫자만 남겨 천단위 구분자로 다시 포맷한다. 빈 입력은 빈 문자열. */
function formatDigits(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
  return digits.length === 0 ? '' : KRW.format(parseDigits(digits));
}

/** 포맷된 입력 문자열을 숫자로. 빈 값·비숫자는 0. */
function digitsToNumber(text: string): number {
  return parseDigits(text.replace(/[^0-9]/g, ''));
}

/**
 * 숫자 문자열 → number.
 * 이 파일은 `ui/number.tsx` 를 `Number` 라는 이름으로 import 하지 않고 `UiNumber` 로
 * 별칭했지만, 전역 `Number` 를 직접 부르면 읽는 사람이 매번 그 사실을 확인해야 한다.
 * 의도를 이름에 박아 둔다.
 */
function parseDigits(digits: string): number {
  return digits.length === 0 ? 0 : globalThis.Number(digits);
}
