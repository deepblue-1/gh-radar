'use client';

/**
 * AccountPanel — 계좌 패널: 미체결(취소) · 잔고 (UI-SPEC C10·C11·C7, 확정 L5 · M3 · D2 · R6).
 *
 * ① 무엇을 어디에 — **3표면 + 1이 공유하는 한 벌**이다 (D-20 / D-21)
 *   호가주문 탭(종목 축 있음) · 상따 페이지 · VI 페이지 · My page(종목 축 없음)가 전부 이
 *   컴포넌트를 쓴다. 그래서 리플로우·취소 규율을 **여기 한 번만** 구현한다 — 표면마다
 *   베끼면 한 곳만 고쳐지고 나머지는 조용히 갈린다.
 *   - 호가주문 탭: 그리드 우측 컬럼의 주문 패널 아래. 주문 → 미체결 확인 → 취소가 한 컬럼 안.
 *     ≥900px 은 `미체결`/`잔고` **탭 전환**(기본 미체결, 라벨에 건수), <900px 은 독립 2섹션
 *     세로 나열(M3, 순서 잔고 → 미체결).
 *   - **계좌 전용 모드**(종목 축 없음): 탭이 없다. 미체결 → 잔고를 그대로 나열하고
 *     ≥1280px 에서만 2열이다(R4). My page 는 이 모드로 **계좌마다 한 벌씩** 렌더한다.
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
 * ④ ★ 취소 키는 **그 행의 ISIN** 이다 (D-02 / D-28, 2026-09-08 갱신)
 *   `AccountState.unf` 는 **계좌 전체**의 미체결이라 다른 종목 주문도 들어온다. wss 이관
 *   이후 취소는 `{t:"order.cancel"}` 이고 종목 키가 **12자 ISIN** 인데, `unf[].isin` 은
 *   언제나 실려 온다 — 그래서 **어느 종목이든 취소할 수 있다.** 단축코드(`row.code`)는
 *   relay 가 `stocks` 역매핑으로 채우는 **표시 전용** 값이고, 없다고 버튼을 잠그지 않는다
 *   (예전의 「코드 없으면 취소 불가」 서술은 폐기됐다 — 사실이 아닌 제약이었다).
 *   요청에는 반드시 **`row.isin`** 을 쓴다. 화면에 열린 종목의 값을 쓰면 다른 종목의
 *   미체결을 취소할 때 엉뚱한 종목으로 취소가 나간다 (T-16-01).
 *
 * ⑤ ★ 평가금액·평가손익·수익률은 현재가를 아는 행에서만 계산한다
 *   `HoldingState` 에는 현재가가 없다. 실시간가는 지금 구독 중인 **한 종목**만 안다
 *   (계좌 전용 모드에서는 하나도 모른다). 모르는 행에 값을 지어내면 그 숫자로 매도 판단을
 *   하게 된다 — 모르면 `—` 로 둔다.
 *
 * ⑥ 취소 결과도 세 갈래다 — 접수 / **결과 모름** / 거부
 *   주문과 같은 규율이다. `sendOrder` 는 **어떤 경로에서도 reject 하지 않으므로**(16-10)
 *   이 파일에 취소 실패용 `catch` 가 없다. 결과를 모르면 "실패"라고 쓰지 않고 그 주문번호의
 *   취소 버튼을 다시 열지 않는다(같은 취소를 두 번 보내 봐야 두 번째는 거부되지만, 그때
 *   사용자가 보는 "거부"가 첫 취소의 성패를 오해하게 만든다).
 *
 * ⑦ 계좌번호는 **전체 표시**한다 (D2 / S-5). 마스킹은 relay 로그에서만 한다.
 *   계좌 전용 모드에는 계좌 `<select>` 가 없다 — 세로 반복(계좌마다 한 벌)이 계좌 구분이고,
 *   패널 안에서 계좌를 바꿀 수 있으면 "지금 보는 카드"와 "선택된 계좌"가 어긋난다.
 *
 * ⑧ ★ 모바일은 표가 아니라 **2줄 카드 행**(`.rlist`)이다 (UI-SPEC C7 / R6)
 *   미체결 표의 콘텐츠 최소폭(439px)·잔고(444px)가 모바일 가용폭(338px)을 넘는다. 표로 두면
 *   `overflow` 아래에서 가로 스크롤이 생기거나 **조용히 잘린다**. 그래서 <1280px 에서는 표를
 *   숨기고 카드 행을 그린다(≥1280 은 반대).
 *   ★ 카드 행에서 **`flex:1 1 auto; min-width:0` 은 종목명 하나뿐**이고 나머지는 전부
 *     `flex:none` 이다. 이게 어긋나면 긴 종목명이 숫자를 밀어내 잘린다 — 플렉스/그리드
 *     자식의 `min-w-0` 누락은 `tasks/lessons.md` 에 등재된 함정이다.
 */

import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  RelayAccount,
  RelayAccountState,
  RelayHolding,
  RelayOrderResultMsg,
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
import { useRelayContext } from '@/lib/relay-provider';
import type { RelayStatus } from '@/lib/use-relay-socket';
import { cn } from '@/lib/utils';

const KRW = new Intl.NumberFormat('ko-KR');

type AccountTab = 'unfilled' | 'holdings';

/** 취소 결과 배너. 주문 패널과 같은 3분류다. */
type CancelResult =
  | { kind: 'accepted'; orderNo: string }
  | { kind: 'rejected'; title: string; detail: string }
  | { kind: 'unknown' };

/**
 * 미체결 행의 **출처 태그**(UI-SPEC C7). 값의 원천은 `dma_orders.origin` 이 아니라
 * **화면 컨텍스트**다 — 상따 페이지가 그린 목록은 상따, VI 페이지는 VI. 수동 주문 표면
 * (호가주문 탭·My page)은 태그를 붙이지 않는다.
 */
export type AccountOriginTag = '상따' | 'VI';

export interface AccountPanelProps {
  /**
   * 허용 계좌 목록. 계좌 셀렉터의 원천이다.
   * **계좌 전용 모드에서는 넘기지 않는다** — 셀렉터 자체가 없다(파일 상단 ⑦).
   */
  accounts?: RelayAccount[];
  /** 이 패널이 보여 주는 계좌번호. 계좌 전용 모드에서는 헤더에 **전체 표시**된다(D2). */
  selectedAccountNo: string;
  /**
   * 상품명(계좌 종류). **계좌 전용 모드 헤더 우측**에 붙는다 (UI-SPEC C5 — My page 계좌
   * 카드 머리 = `계좌 {전체번호}`(mono) + 우측 `{상품명}`). 종목 축이 있을 때는 셀렉터
   * 옵션이 이미 `{번호} · {이름}` 을 보여주므로 쓰이지 않는다.
   */
  accountName?: string;
  /** 계좌 셀렉터의 변경 창구. 계좌 전용 모드에서는 넘기지 않는다. */
  onAccountChange?: (accountNo: string) => void;
  /** 훅의 병합된 계좌 상태. null 이면 아직 스냅샷 전이다. */
  account: RelayAccountState | null;
  /**
   * 현재 종목 6자 단축코드 — **표시 전용**이다(취소 키가 아니다, 파일 상단 ④).
   * `undefined` 면 **계좌 전용 모드**(종목 축 없음)로 그린다.
   */
  code?: string;
  /** 현재 종목명 — 그 종목 행의 표기·확인 다이얼로그용. */
  name?: string;
  /** 현재 종목 12자 ISIN. 「이 행이 지금 보는 종목인가」 판정에만 쓴다. */
  isin?: string | null;
  /** 현재 종목 실시간가. 그 종목의 평가금액·평가손익·수익률 계산에만 쓴다. */
  currentPrice?: number;
  /** 미체결 행에 붙일 출처 태그. 없으면 태그를 그리지 않는다(= 수동). */
  originTag?: AccountOriginTag;
  /**
   * 계좌 전용 모드의 ≥1280px 배치를 **세로 스택**으로 고정한다 (16-14 · R3).
   *
   * 기본(false)은 My page 규율인 2열(477/477)이다. VI 페이지는 이 패널이 992px 전폭이
   * 아니라 **오른쪽 556px 컬럼** 안에 들어가므로, 그 안에서 2열로 쪼개지면 한 칸이
   * 270px 이 되어 표가 조용히 잘린다. 뷰포트 기준 미디어쿼리라 컨테이너 폭을 모르는
   * 패널이 스스로 판단할 수 없어 **호출부가 알려 준다.**
   */
  stack?: boolean;
  /**
   * 미체결 섹션 헤더 우측에 붙일 컨트롤 (UI-SPEC B7 — 거래소 필터 · 「전체 취소」).
   *
   * 패널이 필터·일괄취소를 **소유하지 않는다.** 필터는 어떤 행을 넘길지의 문제라
   * `account` 를 만들어 주는 호출부의 몫이고, 일괄 취소는 표면마다 확인 문구가 다르다.
   * 여기서는 **자리만** 내준다 — 넘기지 않으면 아무것도 그리지 않는다.
   */
  unfilledHeaderActions?: ReactNode;
  /** 세션 상태. `ready` 가 아니면 표를 흐리고 취소를 막는다. */
  status: RelayStatus;
  /** 취소 요청이 끝났을 때(접수·거부·결과 모름 무관) 부모에게 알린다. */
  onCancelSubmitted?: (res: RelayOrderResultMsg) => void;
  className?: string;
}

/** 미체결 한 행의 표시 파생값 — **표와 카드가 같은 값을 쓰도록** 한 곳에서 만든다. */
interface UnfilledView {
  row: RelayUnfilled;
  /** 사람이 읽는 종목명. relay 가 못 풀었고 지금 보는 종목도 아니면 null(ISIN 원문 표기). */
  label: string | null;
  cancellable: boolean;
}

/** 잔고 한 행의 표시 파생값. 현재가를 모르면 `value`/`pnl`/`rate` 가 전부 null 이다(⑤). */
interface HoldingView {
  row: RelayHolding;
  label: string | null;
  price: number | null;
  value: number | null;
  pnl: number | null;
  rate: number | null;
}

export function AccountPanel({
  accounts,
  selectedAccountNo,
  accountName,
  onAccountChange,
  account,
  code,
  name,
  isin,
  currentPrice,
  originTag,
  stack = false,
  unfilledHeaderActions,
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
  const { sendOrder } = useRelayContext();

  /**
   * 종목 축이 있는가. `code` 유무 **하나로** 판정한다 — 판정 근거가 둘이면
   * (`code` 없고 `isin` 있음 같은) 중간 상태에서 절반만 종목 UI 가 그려진다.
   */
  const stockScoped = code !== undefined;
  const sessionReady = status === 'ready';

  const unfilled = useMemo<UnfilledView[]>(
    () =>
      (account?.unf ?? []).map((row) => {
        const sameStock = isin != null && row.isin === isin;
        return {
          row,
          label: row.name ?? (sameStock ? (name ?? null) : null),
          // ★ 취소 키는 ISIN 이고 언제나 실려 온다 — 단축코드 유무로 잠그지 않는다(④).
          cancellable: row.unfilledQty > 0 && !lockedOrderNos.has(row.orderNo),
        };
      }),
    [account, isin, name, lockedOrderNos],
  );

  const holdings = useMemo<HoldingView[]>(
    () =>
      (account?.hold ?? []).map((row) => {
        const sameStock = isin != null && row.isin === isin;
        const price = sameStock && currentPrice != null ? currentPrice : null;
        const priced = price != null && price > 0 && row.avgPrice > 0;
        return {
          row,
          label: row.name ?? (sameStock ? (name ?? null) : null),
          price,
          value: priced ? price * row.qty : null,
          pnl: priced ? (price - row.avgPrice) * row.qty : null,
          rate: priced ? (price - row.avgPrice) / row.avgPrice : null,
        };
      }),
    [account, isin, name, currentPrice],
  );

  const handleCancelConfirmed = useCallback(async () => {
    if (!cancelTarget) return;
    const row = cancelTarget.row;
    setCancelTarget(null);
    setCancelResult(null);

    /*
      `catch` 가 없는 것이 의도다 — `sendOrder` 는 실패도 결과 프레임으로 돌려준다(16-10).
      catch 를 두면 그 분기가 「실패」 문구를 쓰게 되고, 결과를 모르는 취소에 「실패」를
      쓰면 사용자가 다시 취소를 눌러 첫 취소의 성패를 오해한다(S-8).
    */
    const res = await sendOrder({
      kind: 'cancel',
      // ★ 그 **행의** ISIN 이다. 화면에 열려 있는 종목을 쓰면 다른 종목의 미체결을
      //   취소할 때 엉뚱한 종목으로 취소가 나간다(T-16-01).
      isin: row.isin,
      accountNo: selectedAccountNo,
      exchange: row.exchange,
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
  }, [cancelTarget, sendOrder, selectedAccountNo, onCancelSubmitted]);

  const openCancel = useCallback((row: RelayUnfilled, displayName: string) => {
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
  }, []);

  /** 취소 버튼 1개 — 표 행과 카드 행이 **같은 버튼**을 쓴다(규율이 갈리지 않게). */
  const cancelButton = (view: UnfilledView, className?: string) =>
    view.cancellable ? (
      /*
        C11 — 26px(36px 행 안), 좁은 폭에서는 `size="sm"`(32px).
        채움 금지: `--destructive` 테두리 + 텍스트 + `✕` 뿐이다.
      */
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!sessionReady}
        aria-label={`주문번호 ${view.row.orderNo} 취소`}
        onClick={() => openCancel(view.row, view.label ?? view.row.isin)}
        className={cn(
          'h-[26px] border-[var(--destructive)] px-2 text-[11px] text-[var(--destructive)] hover:bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)] max-[899px]:h-8',
          className,
        )}
      >
        ✕ 취소
      </Button>
    ) : (
      <span className="text-[11px] text-[var(--muted-fg)]">—</span>
    );

  return (
    <div
      data-testid="account-panel"
      data-density="default"
      data-mode={stockScoped ? 'stock' : 'account'}
      className={cn('flex flex-col bg-[var(--card)]', className)}
    >
      {/* 계좌 머리 — 종목 축이 있으면 셀렉터, 없으면 그 계좌번호를 **전체 표시**한다(D2 · ⑦). */}
      <div className="flex items-center gap-[var(--s-2)] border-b border-[var(--border-subtle)] px-[var(--s-3)] py-[var(--s-2)]">
        <label
          htmlFor={stockScoped ? 'account-panel-account' : undefined}
          className="text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)]"
        >
          계좌
        </label>
        {stockScoped ? (
          <select
            id="account-panel-account"
            value={selectedAccountNo}
            onChange={(e) => onAccountChange?.(e.target.value)}
            disabled={(accounts?.length ?? 0) === 0}
            className="mono h-8 min-w-0 flex-1 rounded-[var(--r)] border border-[var(--input)] bg-[var(--bg)] px-2 text-[length:var(--t-caption)] text-[var(--fg)] disabled:opacity-50"
          >
            {(accounts?.length ?? 0) === 0 ? (
              <option value="">계좌 확인 중…</option>
            ) : (
              (accounts ?? []).map((a) => (
                <option key={a.accountNo} value={a.accountNo}>
                  {a.accountNo} · {a.name}
                </option>
              ))
            )}
          </select>
        ) : (
          <>
            <span
              data-testid="account-panel-account-no"
              className="mono min-w-0 flex-1 truncate text-[length:var(--t-caption)] font-semibold text-[var(--fg)]"
            >
              {selectedAccountNo}
            </span>
            {/* 상품명은 **있을 때만** 그린다 — 없는 이름을 「-」로 채우지 않는다(C5). */}
            {accountName !== undefined && accountName !== '' && (
              <span
                data-testid="account-panel-account-name"
                className="shrink-0 text-[length:var(--t-caption)] text-[var(--muted-fg)]"
              >
                {accountName}
              </span>
            )}
          </>
        )}
      </div>

      {/*
        ≥900px 전용 탭. 좁은 폭에서는 두 표를 그냥 나열하므로 탭 자체가 사라진다(M3).
        계좌 전용 모드에는 탭이 아예 없다 — My page 는 미체결·잔고를 함께 본다(⑦ / R4).
      */}
      {stockScoped && (
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
      )}

      <div
        className={cn(
          'flex flex-col',
          // R4 — 계좌 전용 모드는 ≥1280px 에서만 2열이고, 그 자식에 `min-w-0` 이 **필수**다.
          // `stack` 이면 그 2열을 만들지 않는다(좁은 컬럼 안에 놓일 때, 위 props 주석).
          !stockScoped &&
            !stack &&
            'min-[1280px]:grid min-[1280px]:grid-cols-2 min-[1280px]:gap-[var(--s-3)] min-[1280px]:[&>*]:min-w-0',
        )}
      >
        {/* ── 미체결 ── (호가주문 탭 모바일은 잔고 다음 = order-2) */}
        <section
          data-testid="account-unfilled"
          aria-label="미체결 주문"
          className={cn(
            'flex flex-col gap-[var(--s-1)] px-[var(--s-3)] pb-[var(--s-3)] pt-[var(--s-3)]',
            stockScoped && 'max-[899px]:order-2 min-[900px]:pt-0',
            stockScoped && tab !== 'unfilled' && 'min-[900px]:hidden',
            !sessionReady && 'opacity-[.55]',
          )}
        >
          <div
            className={cn(
              'flex min-w-0 flex-wrap items-center gap-[var(--s-2)]',
              // 종목 축 모드에서는 ≥900 에 탭이 있어 이 머리가 통째로 사라진다.
              stockScoped && 'min-[900px]:hidden',
            )}
          >
            <h4 className="text-[length:var(--t-caption)] font-semibold text-[var(--fg)]">
              미체결
            </h4>
            {unfilledHeaderActions !== undefined && (
              <span
                data-slot="account-unfilled-actions"
                className="ml-auto flex flex-none items-center gap-[var(--s-2)]"
              >
                {unfilledHeaderActions}
              </span>
            )}
          </div>
          {unfilled.length === 0 ? (
            <EmptyState
              title="미체결 주문이 없어요"
              body="주문을 넣으면 여기에 표시되고, 여기서 바로 취소할 수 있어요."
            />
          ) : (
            <>
              {/* 데스크톱(≥1280) — 표 */}
              <div className="max-[1279px]:hidden">
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
                    {unfilled.map((view) => (
                      <TableRow key={view.row.orderNo}>
                        <TableCell className="mono text-[length:var(--t-caption)]">
                          {view.row.orderNo}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1">
                            <SideTag side={view.row.side} />
                            <OriginTag tag={originTag} />
                          </span>
                        </TableCell>
                        <TableCell className="text-[length:var(--t-caption)]">
                          {view.label ?? <span className="mono">{view.row.isin}</span>}
                        </TableCell>
                        <TableCell className="num mono text-[length:var(--t-caption)]">
                          {KRW.format(view.row.price)}
                        </TableCell>
                        <TableCell className="num mono text-[length:var(--t-caption)]">
                          {KRW.format(view.row.orderQty)}
                        </TableCell>
                        <TableCell className="num mono text-[length:var(--t-caption)]">
                          {KRW.format(view.row.unfilledQty)}
                        </TableCell>
                        <TableCell className="num">{cancelButton(view)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* 모바일(<1280) — 2줄 카드 행 (C7) */}
              <div
                data-slot="account-unfilled-list"
                className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--r-md)] border border-[var(--border)] min-[1280px]:hidden"
              >
                {unfilled.map((view) => (
                  <div
                    key={view.row.orderNo}
                    data-slot="account-unfilled-row"
                    className="min-w-0 px-[var(--s-3)] py-[var(--s-2)]"
                  >
                    {/* ①줄 — 종목명(유일한 신축 항목) · 구분/출처 태그 · (우) 주문번호 */}
                    <div className="flex min-w-0 items-center gap-[var(--s-2)]">
                      <span className="min-w-0 flex-1 truncate text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
                        {view.label ?? <span className="mono">{view.row.isin}</span>}
                      </span>
                      <span className="flex flex-none items-center gap-1">
                        <SideTag side={view.row.side} />
                        <OriginTag tag={originTag} />
                      </span>
                      <span className="ml-auto flex flex-none items-center gap-1">
                        <RowKey>주문</RowKey>
                        <RowValue>{view.row.orderNo}</RowValue>
                      </span>
                    </div>
                    {/* ②줄 — 주문가 · 미체결 {잔량}/{주문량} · (우) 취소 */}
                    <div className="mt-1 flex min-w-0 items-center gap-[var(--s-2)]">
                      <span className="flex flex-none items-center gap-1">
                        <RowKey>주문가</RowKey>
                        <RowValue>{KRW.format(view.row.price)}</RowValue>
                      </span>
                      <span className="flex flex-none items-center gap-1">
                        <RowKey>미체결</RowKey>
                        <RowValue>
                          {KRW.format(view.row.unfilledQty)}/{KRW.format(view.row.orderQty)}
                        </RowValue>
                      </span>
                      <span className="ml-auto flex-none">{cancelButton(view)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {cancelResult && <CancelBanner result={cancelResult} />}
        </section>

        {/* ── 잔고 ── (호가주문 탭 모바일은 미체결보다 위 = order-1) */}
        <section
          data-testid="account-holdings"
          aria-label="잔고"
          className={cn(
            'flex flex-col gap-[var(--s-1)] px-[var(--s-3)] pb-[var(--s-3)] pt-[var(--s-3)]',
            stockScoped && 'max-[899px]:order-1 min-[900px]:pt-0',
            stockScoped && tab !== 'holdings' && 'min-[900px]:hidden',
            !sessionReady && 'opacity-[.55]',
          )}
        >
          <h4
            className={cn(
              'text-[length:var(--t-caption)] font-semibold text-[var(--fg)]',
              stockScoped && 'min-[900px]:hidden',
            )}
          >
            잔고
          </h4>
          {holdings.length === 0 ? (
            <EmptyState title="보유 종목이 없어요" body="체결된 주문이 있으면 잔고에 반영돼요." />
          ) : (
            <>
              {/* 데스크톱(≥1280) — 표 */}
              <div className="max-[1279px]:hidden">
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
                    {holdings.map((view) => (
                      <TableRow key={view.row.isin}>
                        <TableCell className="text-[length:var(--t-caption)]">
                          {view.label ?? <span className="mono">{view.row.isin}</span>}
                        </TableCell>
                        <TableCell className="num mono text-[length:var(--t-caption)]">
                          {KRW.format(view.row.qty)}
                        </TableCell>
                        <TableCell className="num mono text-[length:var(--t-caption)]">
                          {KRW.format(view.row.sellableQty)}
                        </TableCell>
                        <TableCell className="num mono text-[length:var(--t-caption)]">
                          {KRW.format(Math.round(view.row.avgPrice))}
                        </TableCell>
                        <TableCell className="num mono text-[length:var(--t-caption)]">
                          {view.value == null ? '—' : KRW.format(Math.round(view.value))}
                        </TableCell>
                        <TableCell className="num text-[length:var(--t-caption)]">
                          {view.pnl == null ? (
                            '—'
                          ) : (
                            <UiNumber
                              value={Math.round(view.pnl)}
                              format="price"
                              showSign
                              withColor
                            />
                          )}
                        </TableCell>
                        <TableCell className="num text-[length:var(--t-caption)]">
                          {view.rate == null ? (
                            '—'
                          ) : (
                            <UiNumber value={view.rate} format="percent" showSign withColor />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* 모바일(<1280) — 2줄 카드 행 (C7) */}
              <div
                data-slot="account-holding-list"
                className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--r-md)] border border-[var(--border)] min-[1280px]:hidden"
              >
                {holdings.map((view) => (
                  <div
                    key={view.row.isin}
                    data-slot="account-holding-row"
                    className="min-w-0 px-[var(--s-3)] py-[var(--s-2)]"
                  >
                    {/* ①줄 — 종목명(유일한 신축 항목) · 보유 · 매도 · (우) 평가 */}
                    <div className="flex min-w-0 items-center gap-[var(--s-2)]">
                      <span className="min-w-0 flex-1 truncate text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
                        {view.label ?? <span className="mono">{view.row.isin}</span>}
                      </span>
                      <span className="flex flex-none items-center gap-1">
                        <RowKey>보유</RowKey>
                        <RowValue>{KRW.format(view.row.qty)}</RowValue>
                      </span>
                      <span className="flex flex-none items-center gap-1">
                        <RowKey>매도</RowKey>
                        <RowValue>{KRW.format(view.row.sellableQty)}</RowValue>
                      </span>
                      <span className="ml-auto flex flex-none items-center gap-1">
                        <RowKey>평가</RowKey>
                        <RowValue>
                          {view.value == null ? '—' : KRW.format(Math.round(view.value))}
                        </RowValue>
                      </span>
                    </div>
                    {/* ②줄 — 평단 → 현재 · (우) 손익 · 손익률 */}
                    <div className="mt-1 flex min-w-0 items-center gap-[var(--s-2)]">
                      <span className="flex flex-none items-center gap-1">
                        <RowKey>평단</RowKey>
                        <RowValue>{KRW.format(Math.round(view.row.avgPrice))}</RowValue>
                        <RowKey>→</RowKey>
                        <RowValue>{view.price == null ? '—' : KRW.format(view.price)}</RowValue>
                      </span>
                      <span className="ml-auto flex flex-none items-center gap-1 text-[length:var(--t-caption)]">
                        {view.pnl == null ? (
                          <RowValue>—</RowValue>
                        ) : (
                          <UiNumber
                            value={Math.round(view.pnl)}
                            format="price"
                            showSign
                            withColor
                          />
                        )}
                        {view.rate == null ? (
                          <RowValue>—</RowValue>
                        ) : (
                          <UiNumber value={view.rate} format="percent" showSign withColor />
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
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

/** 카드 행의 라벨(11px 중립). **`flex:none`** 이라 숫자를 밀어내지 않는다. */
function RowKey({ children }: { children: ReactNode }) {
  return <span className="text-[11px] text-[var(--muted-fg)]">{children}</span>;
}

/** 카드 행의 값(mono·tabular). 이것도 `flex:none` 이어야 잘리지 않는다. */
function RowValue({ children }: { children: ReactNode }) {
  return (
    <span className="mono whitespace-nowrap text-[length:var(--t-caption)] font-semibold text-[var(--fg)]">
      {children}
    </span>
  );
}

/** 매수/매도 구분 — **부호 + 라벨 병기**로 색에 의존하지 않는다(WCAG 1.4.1). */
function SideTag({ side }: { side: RelayUnfilled['side'] }) {
  const buy = side === 'B';
  return (
    <span
      className={cn(
        'whitespace-nowrap text-[length:var(--t-caption)] font-semibold',
        buy ? 'text-[var(--up)]' : 'text-[var(--down)]',
      )}
    >
      {buy ? '▲ 매수' : '▼ 매도'}
    </span>
  );
}

/**
 * 출처 태그 — 상따/VI 페이지가 내려 준 화면 컨텍스트다. 수동 주문은 태그가 **없다**
 * (「수동」이라는 태그를 붙이면 대부분의 행에 의미 없는 배지가 하나씩 붙는다).
 */
function OriginTag({ tag }: { tag?: AccountOriginTag }) {
  if (tag === undefined) return null;
  return (
    <span
      data-slot="account-origin-tag"
      className="whitespace-nowrap rounded-[var(--r-sm)] bg-[var(--muted)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--muted-fg)]"
    >
      {tag}
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
