'use client';

/**
 * AccountPanel — 계좌 패널: 미체결(취소) · 잔고 (UI-SPEC C10·C11, 확정 L5 · M3 · D2).
 *
 * ① 무엇을 어디에
 *   호가주문 탭 그리드 **우측 컬럼의 주문 패널 아래**(≥900px). 주문 → 미체결 확인 → 취소가
 *   같은 컬럼 안에서 끝나는 것이 L1=B 채택 이유다.
 *   - ≥900px: `미체결` / `잔고` **탭 전환**(기본 `미체결`, 라벨에 건수).
 *   - <900px: 탭이 아니라 **독립 2섹션 세로 나열**(M3), 순서는 잔고 → 미체결(M1 ⑤⑥).
 *   두 표는 항상 DOM 에 있고 **브레이크포인트 판정은 전부 CSS** 다 — JS 는 뷰포트를 재지 않는다.
 *
 * ② ★ 취소 버튼은 채우지 않는다 (UI-SPEC §토큰 충돌 경보)
 *   `--destructive` 와 `--up`(매수)의 oklch 값이 완전히 같다. 채움 빨강으로 만들면 매수
 *   버튼과 구분되지 않는다. **테두리 + `--destructive` 텍스트 + `✕`** 가 유일한 표현이다.
 *
 * ③ ★ 미체결 잔량 0 행에는 취소 버튼을 렌더하지 않는다
 *   취소 수량은 언제나 **미체결 잔량 전부**이고, 잔량 0 의 취소는 게이트웨이가 즉시 거부한다
 *   (D-21). 누를 수 있지만 반드시 실패하는 버튼은 오조작을 부르는 UI 다.
 *
 * ④ ★ 취소 가능 판정의 근거는 **그 행의 단축코드**다 (2026-09-06 완화)
 *   `AccountState.unf` 는 **계좌 전체**의 미체결이라 다른 종목 주문도 들어온다. 그런데
 *   `POST /api/orders` 는 6자 **단축코드**를 받는다(server 가 ISIN 을 채운다, D-28).
 *   예전에는 브라우저에 ISIN→단축코드 역매핑이 없어 "현재 종목만 취소 가능" 이었지만,
 *   이제 relay 가 `stocks.isin` 으로 풀어 `unf[].code`·`unf[].name` 을 실어 준다
 *   (`relay/src/store/symbols.ts`). 그래서 **`row.code` 가 있으면 어느 종목이든 취소된다.**
 *   요청에도 반드시 `row.code` 를 쓴다 — 화면에 열린 종목 코드를 쓰면 엉뚱한 종목이
 *   취소된다. 코드를 못 푼 행(마스터에 없는 신규 상장 등)만 버튼을 닫고, 마이크로 라벨도
 *   **그런 행이 남아 있을 때만** 띄운다(항상 띄우면 사실이 아닌 제약을 광고하게 된다).
 *
 * ⑤ ★ 평가금액·평가손익·수익률은 현재가를 아는 행에서만 계산한다
 *   `HoldingState` 에는 현재가가 없다. 실시간가는 지금 구독 중인 **한 종목**만 안다.
 *   모르는 행에 값을 지어내면 그 숫자로 매도 판단을 하게 된다 — 모르면 `—` 로 둔다.
 *
 * ⑥ 취소 결과도 세 갈래다 — 접수 / **결과 모름** / 거부
 *   주문과 같은 규율이다. 결과를 모르면 "실패"라고 쓰지 않고 그 주문번호의 취소 버튼을
 *   다시 열지 않는다(같은 취소를 두 번 보내 봐야 두 번째는 거부되지만, 그때 사용자가 보는
 *   "거부"가 첫 취소의 성패를 오해하게 만든다).
 *
 * ⑦ 계좌번호는 **전체 표시**한다 (D2). 마스킹은 relay 로그에서만 한다.
 */

import { useCallback, useMemo, useState } from 'react';
import type {
  CreateOrderResponse,
  RelayAccount,
  RelayAccountState,
  RelayHolding,
  RelayUnfilled,
} from '@gh-radar/shared';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Number as UiNumber } from '@/components/ui/number';
import {
  OrderConfirmDialog,
  type CancelOrderConfirmDetail,
} from '@/components/orderbook/order-confirm-dialog';
import { createOrder, isUnknownOutcome, orderErrorMessage } from '@/lib/orders-api';
import type { RelayStatus } from '@/lib/use-relay-socket';
import { cn } from '@/lib/utils';

const KRW = new Intl.NumberFormat('ko-KR');

type AccountTab = 'unfilled' | 'holdings';

/** 취소 결과 배너. 주문 패널과 같은 3분류다. */
type CancelResult =
  | { kind: 'accepted'; orderNo: string }
  | { kind: 'rejected'; title: string; detail: string }
  | { kind: 'unknown' };

export interface AccountPanelProps {
  /** 허용 계좌 목록. 계좌 셀렉터의 원천이다. */
  accounts: RelayAccount[];
  /** 선택된 계좌번호(섹션이 소유 · 주문 패널과 공유). */
  selectedAccountNo: string;
  onAccountChange: (accountNo: string) => void;
  /** 훅의 병합된 계좌 상태. null 이면 아직 스냅샷 전이다. */
  account: RelayAccountState | null;
  /** 현재 종목 6자 단축코드 — 취소 요청 키. */
  code: string;
  /** 현재 종목명 — 행 표기·확인 다이얼로그용. */
  name: string;
  /** 현재 종목 12자 ISIN. 행 귀속 판정의 유일한 근거다. */
  isin: string | null;
  /** 현재 종목 실시간가. 평가금액·평가손익·수익률 계산에만 쓴다. */
  currentPrice?: number;
  /** 세션 상태. `ready` 가 아니면 표를 흐리고 취소를 막는다. */
  status: RelayStatus;
  /** 취소 요청이 끝났을 때(접수·거부 무관) 부모에게 알린다. */
  onCancelSubmitted?: (res: CreateOrderResponse) => void;
  className?: string;
}

export function AccountPanel({
  accounts,
  selectedAccountNo,
  onAccountChange,
  account,
  code,
  name,
  isin,
  currentPrice,
  status,
  onCancelSubmitted,
  className,
}: AccountPanelProps) {
  const [tab, setTab] = useState<AccountTab>('unfilled');
  const [cancelTarget, setCancelTarget] = useState<
    (CancelOrderConfirmDetail & { row: RelayUnfilled }) | null
  >(null);
  const [cancelResult, setCancelResult] = useState<CancelResult | null>(null);
  /** 결과를 모르는 취소가 나간 주문번호 — 다시 누를 수 없게 잠근다. */
  const [lockedOrderNos, setLockedOrderNos] = useState<ReadonlySet<string>>(new Set());

  const unfilled = useMemo(() => account?.unf ?? [], [account]);
  const holdings = useMemo(() => account?.hold ?? [], [account]);
  const sessionReady = status === 'ready';
  /**
   * 취소 버튼을 열 수 없는 미체결이 남아 있는가.
   *
   * relay 가 `stocks` 역매핑으로 `code` 를 채우면(대부분) 다른 종목도 여기서 취소된다.
   * 마스터에 없는 ISIN(신규 상장 직후 등)만 예외로 남으므로, 안내 문구도 그때만 띄운다 —
   * 항상 띄우면 이제는 사실이 아닌 제약을 계속 광고하게 된다.
   */
  const hasUnresolvedRow = useMemo(
    () =>
      unfilled.some(
        (r) => r.unfilledQty > 0 && r.code == null && !(isin != null && r.isin === isin),
      ),
    [unfilled, isin],
  );

  const handleCancelConfirmed = useCallback(async () => {
    if (!cancelTarget) return;
    const row = cancelTarget.row;
    setCancelTarget(null);
    setCancelResult(null);
    try {
      const res = await createOrder({
        // 그 **행의** 단축코드를 쓴다. 화면에 열려 있는 종목(`code`)을 쓰면 다른 종목의
        // 미체결을 취소할 때 엉뚱한 종목으로 취소가 나간다. relay 가 `row.code` 를
        // 채우지 못한 행은 애초에 취소 버튼을 열지 않으므로 여기 폴백은 도달하지 않는다.
        code: row.code ?? code,
        accountNo: selectedAccountNo,
        exchange: row.exchange,
        side: row.side,
        orderType: 'C',
        orgOrderNo: row.orderNo,
        // 취소 수량은 **미체결 잔량 전부**다 (D-21). 부분 취소 경로는 만들지 않는다.
        qty: row.unfilledQty,
        price: row.price,
      });
      if (res.status === 'timeout') {
        setCancelResult({ kind: 'unknown' });
        setLockedOrderNos((prev) => new Set(prev).add(row.orderNo));
      } else if (res.status === 'rejected' || res.resultCode !== 0) {
        setCancelResult({
          kind: 'rejected',
          title: `주문 취소가 거부됐어요 · ${res.message}`,
          detail: `미체결 목록을 다시 확인해 주세요. (코드 ${res.resultCode})`,
        });
      } else {
        setCancelResult({ kind: 'accepted', orderNo: res.orderNo || row.orderNo });
      }
      onCancelSubmitted?.(res);
    } catch (err) {
      if (isUnknownOutcome(err)) {
        setCancelResult({ kind: 'unknown' });
        setLockedOrderNos((prev) => new Set(prev).add(row.orderNo));
      } else {
        setCancelResult({
          kind: 'rejected',
          title: `주문 취소가 거부됐어요 · ${orderErrorMessage(err)}`,
          detail: '미체결 목록을 다시 확인해 주세요.',
        });
      }
    }
  }, [cancelTarget, code, selectedAccountNo, onCancelSubmitted]);

  const openCancel = useCallback(
    (row: RelayUnfilled, displayName: string) => {
      setCancelTarget({
        mode: 'cancel',
        orderNo: row.orderNo,
        side: row.side,
        // 확인 다이얼로그에는 **그 행의** 종목명이 떠야 한다. 현재 종목명을 고정으로
        // 쓰면 다른 종목을 취소하면서 이 종목 이름을 읽고 확인을 누르게 된다.
        stockName: displayName,
        price: row.price,
        unfilledQty: row.unfilledQty,
        row,
      });
    },
    [],
  );

  return (
    <div
      data-testid="account-panel"
      data-density="default"
      className={cn('flex flex-col bg-[var(--card)]', className)}
    >
      {/* 계좌 셀렉터 — 주문 패널과 같은 상태를 공유한다(D2: 전체 표시, 마스킹 없음). */}
      <div className="flex items-center gap-[var(--s-2)] border-b border-[var(--border-subtle)] px-[var(--s-3)] py-[var(--s-2)]">
        <label
          htmlFor="account-panel-account"
          className="text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)]"
        >
          계좌
        </label>
        <select
          id="account-panel-account"
          value={selectedAccountNo}
          onChange={(e) => onAccountChange(e.target.value)}
          disabled={accounts.length === 0}
          className="mono h-8 min-w-0 flex-1 rounded-[var(--r)] border border-[var(--input)] bg-[var(--bg)] px-2 text-[length:var(--t-caption)] text-[var(--fg)] disabled:opacity-50"
        >
          {accounts.length === 0 ? (
            <option value="">계좌 확인 중…</option>
          ) : (
            accounts.map((a) => (
              <option key={a.accountNo} value={a.accountNo}>
                {a.accountNo} · {a.name}
              </option>
            ))
          )}
        </select>
      </div>

      {/* ≥900px 전용 탭. 좁은 폭에서는 두 표를 그냥 나열하므로 탭 자체가 사라진다(M3). */}
      <div
        role="tablist"
        aria-label="계좌 정보"
        className="flex gap-[var(--s-1)] px-[var(--s-3)] py-[var(--s-2)] max-[899px]:hidden"
      >
        {(
          [
            ['unfilled', `미체결 (${unfilled.length})`],
            ['holdings', `잔고 (${holdings.length})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              'h-7 rounded-[var(--r)] border px-2.5 text-[length:var(--t-caption)] font-semibold transition-[background,border-color] duration-[120ms]',
              tab === value
                ? 'border-[var(--border)] bg-[var(--muted)] text-[var(--fg)]'
                : 'border-transparent bg-transparent text-[var(--muted-fg)] hover:bg-[var(--muted)]',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col">
        {/* ── 미체결 ── (모바일은 잔고 다음 = order-2) */}
        <section
          data-testid="account-unfilled"
          aria-label="미체결 주문"
          className={cn(
            'flex flex-col gap-[var(--s-1)] px-[var(--s-3)] pb-[var(--s-3)] max-[899px]:order-2 max-[899px]:pt-[var(--s-3)]',
            tab === 'unfilled' ? '' : 'min-[900px]:hidden',
            !sessionReady && 'opacity-[.55]',
          )}
        >
          <h4 className="text-[length:var(--t-caption)] font-semibold text-[var(--fg)] min-[900px]:hidden">
            미체결
          </h4>
          {unfilled.length === 0 ? (
            <EmptyState
              title="미체결 주문이 없어요"
              body="주문을 넣으면 여기에 표시되고, 여기서 바로 취소할 수 있어요."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">주문번호</TableHead>
                    <TableHead scope="col">구분</TableHead>
                    <TableHead scope="col">종목</TableHead>
                    <TableHead scope="col" className="num">주문가</TableHead>
                    <TableHead scope="col" className="num">주문</TableHead>
                    <TableHead scope="col" className="num">미체결</TableHead>
                    <TableHead scope="col" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unfilled.map((row) => {
                    const sameStock = isin != null && row.isin === isin;
                    // 표시명 우선순위: relay 가 푼 이름 → 현재 종목이면 그 이름 → ISIN 원문.
                    const displayName = row.name ?? (sameStock ? name : null);
                    // 취소 키는 **단축코드**다(D-28). relay 가 `row.code` 를 채웠거나
                    // 지금 보고 있는 종목이면 그 코드를 안다 — 그때만 버튼을 연다.
                    const cancellable =
                      row.unfilledQty > 0 &&
                      (row.code != null || sameStock) &&
                      !lockedOrderNos.has(row.orderNo);
                    return (
                      <TableRow key={row.orderNo}>
                        <TableCell className="mono text-[length:var(--t-caption)]">
                          {row.orderNo}
                        </TableCell>
                        <TableCell>
                          <SideTag side={row.side} />
                        </TableCell>
                        <TableCell className="text-[length:var(--t-caption)]">
                          {displayName ?? <span className="mono">{row.isin}</span>}
                        </TableCell>
                        <TableCell className="num mono text-[length:var(--t-caption)]">
                          {KRW.format(row.price)}
                        </TableCell>
                        <TableCell className="num mono text-[length:var(--t-caption)]">
                          {KRW.format(row.orderQty)}
                        </TableCell>
                        <TableCell className="num mono text-[length:var(--t-caption)]">
                          {KRW.format(row.unfilledQty)}
                        </TableCell>
                        <TableCell className="num">
                          {cancellable ? (
                            /*
                              C11 — 26px(36px 행 안), 좁은 폭에서는 `size="sm"`(32px).
                              채움 금지: `--destructive` 테두리 + 텍스트 + `✕` 뿐이다.
                            */
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!sessionReady}
                              aria-label={`주문번호 ${row.orderNo} 취소`}
                              onClick={() => openCancel(row, displayName ?? row.isin)}
                              className="h-[26px] border-[var(--destructive)] px-2 text-[11px] text-[var(--destructive)] hover:bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)] max-[899px]:h-8"
                            >
                              ✕ 취소
                            </Button>
                          ) : (
                            <span className="text-[11px] text-[var(--muted-fg)]">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {hasUnresolvedRow && (
                <p className="text-[11px] text-[var(--muted-fg)]">
                  종목을 확인하지 못한 미체결은 그 종목 페이지에서 취소할 수 있어요
                </p>
              )}
            </>
          )}
          {cancelResult && <CancelBanner result={cancelResult} />}
        </section>

        {/* ── 잔고 ── (모바일은 미체결보다 위 = order-1) */}
        <section
          data-testid="account-holdings"
          aria-label="잔고"
          className={cn(
            'flex flex-col gap-[var(--s-1)] px-[var(--s-3)] pb-[var(--s-3)] max-[899px]:order-1 max-[899px]:pt-[var(--s-3)]',
            tab === 'holdings' ? '' : 'min-[900px]:hidden',
            !sessionReady && 'opacity-[.55]',
          )}
        >
          <h4 className="text-[length:var(--t-caption)] font-semibold text-[var(--fg)] min-[900px]:hidden">
            잔고
          </h4>
          {holdings.length === 0 ? (
            <EmptyState
              title="보유 종목이 없어요"
              body="체결된 주문이 있으면 잔고에 반영돼요."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">종목</TableHead>
                  <TableHead scope="col" className="num">보유</TableHead>
                  <TableHead scope="col" className="num">매도가능</TableHead>
                  <TableHead scope="col" className="num">평단가</TableHead>
                  <TableHead scope="col" className="num">평가금액</TableHead>
                  <TableHead scope="col" className="num">평가손익</TableHead>
                  <TableHead scope="col" className="num">수익률</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holdings.map((row) => (
                  <HoldingRow
                    key={row.isin}
                    row={row}
                    name={row.name ?? (isin != null && row.isin === isin ? name : null)}
                    currentPrice={isin != null && row.isin === isin ? currentPrice : undefined}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </div>

      <OrderConfirmDialog
        detail={cancelTarget}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        onConfirm={handleCancelConfirmed}
      />
    </div>
  );
}

/**
 * 잔고 한 행. 평가금액·평가손익·수익률은 **현재가를 아는 행에서만** 계산한다.
 * 방향색은 평가손익·수익률에만 허용된다(UI-SPEC §Color 열거표).
 */
function HoldingRow({
  row,
  name,
  currentPrice,
}: {
  row: RelayHolding;
  name: string | null;
  currentPrice?: number;
}) {
  const priced = currentPrice != null && currentPrice > 0 && row.avgPrice > 0;
  const value = priced ? currentPrice * row.qty : null;
  const pnl = priced ? (currentPrice - row.avgPrice) * row.qty : null;
  const rate = priced ? (currentPrice - row.avgPrice) / row.avgPrice : null;

  return (
    <TableRow>
      <TableCell className="text-[length:var(--t-caption)]">
        {name ?? <span className="mono">{row.isin}</span>}
      </TableCell>
      <TableCell className="num mono text-[length:var(--t-caption)]">
        {KRW.format(row.qty)}
      </TableCell>
      <TableCell className="num mono text-[length:var(--t-caption)]">
        {KRW.format(row.sellableQty)}
      </TableCell>
      <TableCell className="num mono text-[length:var(--t-caption)]">
        {KRW.format(Math.round(row.avgPrice))}
      </TableCell>
      <TableCell className="num mono text-[length:var(--t-caption)]">
        {value == null ? '—' : KRW.format(Math.round(value))}
      </TableCell>
      <TableCell className="num text-[length:var(--t-caption)]">
        {pnl == null ? (
          '—'
        ) : (
          <UiNumber value={Math.round(pnl)} format="price" showSign withColor />
        )}
      </TableCell>
      <TableCell className="num text-[length:var(--t-caption)]">
        {rate == null ? '—' : <UiNumber value={rate} format="percent" showSign withColor />}
      </TableCell>
    </TableRow>
  );
}

/** 매수/매도 구분 — **부호 + 라벨 병기**로 색에 의존하지 않는다(WCAG 1.4.1). */
function SideTag({ side }: { side: RelayUnfilled['side'] }) {
  const buy = side === 'B';
  return (
    <span
      className={cn(
        'text-[length:var(--t-caption)] font-semibold',
        buy ? 'text-[var(--up)]' : 'text-[var(--down)]',
      )}
    >
      {buy ? '▲ 매수' : '▼ 매도'}
    </span>
  );
}

/** 취소 결과 배너 — 주문 패널과 동일한 3분류 규율. */
function CancelBanner({ result }: { result: CancelResult }) {
  if (result.kind === 'unknown') {
    return (
      <div
        role="status"
        data-testid="cancel-result-unknown"
        className="flex flex-col gap-0.5 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--muted)] px-[var(--s-3)] py-[var(--s-2)]"
      >
        <span className="text-[length:var(--t-caption)] font-semibold text-[var(--fg)]">
          취소 응답이 늦어지고 있어요
        </span>
        <span className="text-[11px] text-[var(--muted-fg)]">
          취소가 이미 나갔을 수 있어요. 미체결 목록이 갱신되는지 확인해 주세요.
        </span>
      </div>
    );
  }
  if (result.kind === 'rejected') {
    return (
      <div
        role="alert"
        data-testid="cancel-result-rejected"
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
      data-testid="cancel-result-accepted"
      className="flex flex-col gap-0.5 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--muted)] px-[var(--s-3)] py-[var(--s-2)]"
    >
      <span className="text-[length:var(--t-caption)] font-semibold text-[var(--fg)]">
        취소 주문이 접수됐어요 · 주문번호 {result.orderNo}
      </span>
      <span className="text-[11px] text-[var(--muted-fg)]">
        취소가 확인되면 미체결 목록에서 사라져요.
      </span>
    </div>
  );
}

/** 빈 상태 — 중립색만 쓴다(방향색 금지). */
function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-[var(--r-md)] border border-dashed border-[var(--border)] px-[var(--s-4)] py-[var(--s-5)] text-center">
      <p className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">{title}</p>
      <p className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">{body}</p>
    </div>
  );
}
