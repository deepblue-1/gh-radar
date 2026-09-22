'use client';

/**
 * StockOrderbookSection — 종목상세 호가주문 탭 (Phase 18 D-24 · D-23 · D-28, TRADE-07/09).
 *
 * ① 무엇을 조립하는가 (레이아웃 정본 `18-orderbook-tab-mockup.html` — 목업이 코드와 다르면 목업이 이긴다)
 *   히어로 · 갱신줄 · 4탭 바는 상위(`stock-detail-client` · `stock-detail-tabs`)가 그린다. 이 섹션은
 *   **상태줄 → 종목정보 10칸 → 본문(좌 호가 | 우 옵션 4그룹 + 적응형 수동주문) → 미체결/잔고** 순서다.
 *   ★ 본문은 작업대 전략 카드와 **같은 컴포넌트**(`CardBody variant="orderbook"`)다 — 여기서 배운
 *     조작이 카드에서 그대로 통한다. 이 파일은 사다리·체결·옵션 4그룹을 **다시 조립하지 않는다.**
 *   ★ 카드와 다른 점은 셋뿐이다:
 *     ① 거래소가 헤더가 아니라 **상태줄**에 있다(아래 `OrderbookStatusBar`)
 *     ② 수동주문 폼에 **주문유형 콤보**가 있다(`variant="orderbook"` 이 가른다)
 *     ③ 미체결이 **이 종목만**이다(계좌 상태를 이 종목으로 걸러 넘긴다 — T-18-51)
 *
 * ② ★ 이 섹션 루트가 `@container/lc` 컨테이너다 (D-28)
 *   카드와 **같은 이름**을 선언해야 본문·10칸·폼의 `@min-[Npx]/lc:` 유틸리티가 이 탭의 폭을 잰다
 *   (선언의 출처는 `card/strategy-card.tsx` 의 `LC_CONTAINER_CLASS` 한 곳 — 문자열을 다시 적지 않는다).
 *   이 래퍼가 빠지거나 이름이 어긋나면 안쪽 모든 밴드 분기가 **에러 없이** 폰 밴드로 떨어진다.
 *   밴드 수치의 정본은 `webapp/src/styles/globals.css` §2.2b 다. 뷰포트 브레이크포인트를 섞지 않는다
 *   (`AccountPanel` 은 자기 파일의 뷰포트 규칙을 그대로 쓴다 — 이 파일의 판정이 아니다).
 *   ★ 컨테이너는 layout containment 를 걸어 `position:fixed` 자손의 컨테이닝 블록이 된다 — 그래서
 *     옵션 폼의 더티 바는 `document.body` 로 포털된다(`limit-chaser-form`).
 *
 * ③ 구독과 언마운트
 *   `useRelaySubscription` 으로 **전역 relay 연결** 위에 이 종목 구독만 얹는다(참조계수 +1/-1).
 *   탭이 Radix Tabs 라 `호가주문` 을 떠나면 **언마운트**되고(`stock-detail-tabs` T8), 구독 훅의
 *   cleanup 이 해제한다 — 보이지 않는 탭에서 실시간 호가를 유지하지 않는다. 카드 상태 훅
 *   (`useStrategyCardState`)도 같은 키를 구독하지만 참조계수라 업스트림 구독은 하나다.
 *
 * ④ 빈 · 에러 · 게이트
 *   - `unauthorized` 또는 `isin === null` → 권한 없음 게이트가 본문을 **대체**한다. 섹션은 숨기지 않는다.
 *   - 연결 중 · 복구 불가 실패 → 본문은 그대로 두고 가격이 「—」다(E9 loading/error — 스피너·
 *     안내 카드로 바꾸지 않는다). 연결 상태는 상태줄 DMA 필이 말하고, 복구 불가면 그 줄에
 *     「다시 연결」이 선다.
 *   - NXT 호가가 비면 본문 위 한 줄로 알린다(D3). 문구 정본은 아래 JSX 한 곳뿐이다.
 *
 * ⑤ ★ 계좌는 섹션이 소유한다
 *   상태줄의 계좌 선택이 옵션 폼(전략 키) · 수동주문 · 미체결/잔고가 보는 **단일 계좌**다. 각자 들면
 *   「주문한 계좌」와 「미체결을 보고 있는 계좌」가 어긋나고, 그것이 곧 엉뚱한 계좌의 주문을
 *   취소하는 사고다(CR-01).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { RELAY_STATE_LABELS, serverMsgBadge } from '@gh-radar/shared';
import type { RelayAccount, RelayExchange } from '@gh-radar/shared';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AccountPanel } from '@/components/orderbook/account-panel';
import { CardBody } from '@/components/trading/card/card-body';
import { QuoteGrid10 } from '@/components/trading/card/quote-grid-10';
import {
  LC_CONTAINER_CLASS,
  useStrategyCardState,
  type StrategyCardState,
} from '@/components/trading/card/strategy-card';
import { LatchLed } from '@/components/trading/latch-led';
import { queuedWindowBadgeOf } from '@/lib/queued-window';
import { useRelayContext, useRelaySubscription } from '@/lib/relay-provider';
import type { RelayStatus } from '@/lib/use-relay-socket';
import { cn } from '@/lib/utils';

/** 거래소 전환 후 이 시간까지 스냅샷이 없으면 "빈 호가"로 판정한다(D3). */
const EXCHANGE_SWITCH_GRACE_MS = 3_000;

/** 아직 아무 프레임도 못 받은 진행 상태들. */
const CONNECTING_STATES: ReadonlySet<string> = new Set([
  'idle',
  'connecting',
  'logging_in',
  'declaring',
]);
/** 자동 복구를 기대할 수 없는 상태들 — 상태줄에 「다시 연결」을 준다. */
const UNRECOVERABLE_STATES: ReadonlySet<string> = new Set([
  'failed',
  'manual_required',
  'session_rejected',
]);

const EXCHANGES: readonly RelayExchange[] = ['KRX', 'NXT'];

export interface StockOrderbookSectionProps {
  /** 6자 단축코드. 표시·확인 다이얼로그용. */
  code: string;
  /** 종목명. */
  name: string;
  /**
   * 12자 KRX 표준코드. **게이트웨이 구독 키 · 주문 키**(D-28).
   * null 이면 이 종목은 DMA 구독·주문 대상이 아니므로 게이트 카드를 띄운다.
   */
  isin: string | null;
  /** 기준가(전일 종가) 스냅샷. 실시간 `quote.base` 가 오면 그쪽이 우선한다. */
  basePrice: number;
  /** 상한가 스냅샷. 실시간 `quote.ul` 이 오면 그쪽이 우선한다. */
  upperLimit?: number;
  /** 하한가 스냅샷. 실시간 `quote.ll` 이 오면 그쪽이 우선한다. */
  lowerLimit?: number;
  className?: string;
}

export function StockOrderbookSection({
  code,
  name,
  isin,
  basePrice,
  upperLimit,
  lowerLimit,
  className,
}: StockOrderbookSectionProps) {
  /*
    ISIN 정규화 — 빈 문자열·undefined 를 전부 null 로 좁힌다. 필드가 아예 빠진 응답(구 서버·
    E2E 픽스처)에서 `undefined !== null` 이라 게이트를 통과한 뒤 연결도 하지 않는 경로를 막는다.
  */
  const subscriptionIsin = isin != null && isin.length > 0 ? isin : null;

  const [exchange, setExchange] = useState<RelayExchange>('KRX');
  const [switching, setSwitching] = useState(false);
  const [selectedAccountNo, setSelectedAccountNo] = useState('');
  /** 미체결 행 선택(D-21) — 주문번호만 든다. 행 값은 매 렌더 최신 계좌 상태에서 다시 찾는다. */
  const [selectedOrderNo, setSelectedOrderNo] = useState<string | null>(null);
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { status, statusLabel, accounts, quote, accountStates, reconnect } = useRelaySubscription({
    isin: subscriptionIsin ?? '',
    exchange,
    enabled: subscriptionIsin !== null,
  });
  const { queuedWindow } = useRelayContext();

  /*
    ★ 옵션 4그룹의 상태는 작업대 카드와 **같은 훅**이다 — 전략 키(ISIN:계좌:거래소) 필터 ·
      전송↔에코 상관 · 로그 · LED 가 한 벌이다. 이 탭에서 따로 조립하지 않는다.
  */
  const card = useStrategyCardState({
    isin: subscriptionIsin ?? '',
    accountNo: selectedAccountNo,
    exchange,
  });

  const selectedAccount =
    selectedAccountNo === '' ? null : (accountStates.get(selectedAccountNo) ?? null);
  /*
    ★ 다른 점 ③ — 미체결/잔고는 **이 종목만**이다(T-18-51). `AccountPanel` 은 받은 계좌 상태를
      전부 그리므로(My page · 상따 화면이 그 동작에 기대고 있다) 걸러서 넘긴다 — 공용 패널을
      고치지 않는다. 다른 종목의 주문번호가 이 화면에 노출되지 않고, 그 행으로 정정·취소가
      시작될 경로도 없다. 잔고도 같은 축으로 거른다(목업 정본 — 「잔고 (1)」 = 이 종목).
  */
  const stockAccount = useMemo(
    () =>
      selectedAccount === null || subscriptionIsin === null
        ? null
        : {
            ...selectedAccount,
            unf: selectedAccount.unf.filter((u) => u.isin === subscriptionIsin),
            hold: selectedAccount.hold.filter((h) => h.isin === subscriptionIsin),
          },
    [selectedAccount, subscriptionIsin],
  );
  /*
    선택된 원주문은 **지금의** 미체결에서 다시 찾는다 — 부분체결로 잔량이 바뀌면 그 값이 폼으로
    가고, 전량 체결·취소로 행이 사라지면 선택도 저절로 풀린다(없는 주문을 정정하는 경로가 없다).
    이 종목·이 계좌의 행만 대상이다(T-18-51).
  */
  const selectedUnfilled =
    selectedOrderNo === null || subscriptionIsin === null
      ? null
      : (stockAccount?.unf.find((u) => u.orderNo === selectedOrderNo) ?? null);

  /*
    종목 전환 state sticky 방어 (WR-04 관례 · T-15-40). 종목 상세는 같은 동적 라우트라 종목 간
    이동에서 remount 없이 props 만 갱신된다 — 거래소·원주문 선택을 되돌리지 않으면 새 종목에서도
    NXT 에 갇히거나 다른 종목의 원주문이 폼에 남는다. 호가 클릭 가격은 본문(`CardBody`)이 같은
    이유로 스스로 버린다. ★ 계좌는 리셋하지 않는다 — 종목을 옮길 때마다 고른 계좌가 튕긴다.
  */
  useEffect(() => {
    setExchange('KRX');
    setSwitching(false);
    setSelectedOrderNo(null);
    if (switchTimerRef.current !== null) {
      clearTimeout(switchTimerRef.current);
      switchTimerRef.current = null;
    }
  }, [code, isin]);

  // 계좌를 바꾸면 선택한 원주문을 버린다 — 주문번호는 계좌별 시퀀스다(CR-01).
  useEffect(() => {
    setSelectedOrderNo(null);
  }, [selectedAccountNo]);

  /*
    계좌 목록 동기화. 재접속·계좌 재선언으로 목록이 바뀌면 **선택값이 목록에 없을 때만**
    첫 계좌로 되돌린다. 무조건 리셋하면 사용자가 고른 계좌가 재접속마다 튕겨 나간다.
  */
  useEffect(() => {
    if (accounts.length === 0) return;
    setSelectedAccountNo((prev) =>
      accounts.some((a) => a.accountNo === prev) ? prev : accounts[0].accountNo,
    );
  }, [accounts]);

  // 새 거래소 스냅샷이 도착하면 전환 중 표식을 즉시 내린다(캐시 복원 포함).
  useEffect(() => {
    if (!quote) return;
    if (switchTimerRef.current !== null) {
      clearTimeout(switchTimerRef.current);
      switchTimerRef.current = null;
    }
    setSwitching(false);
  }, [quote]);

  useEffect(
    () => () => {
      if (switchTimerRef.current !== null) clearTimeout(switchTimerRef.current);
    },
    [],
  );

  const handleExchangeChange = useCallback(
    (next: RelayExchange) => {
      if (next === exchange) return;
      setExchange(next);
      setSelectedOrderNo(null);
      setSwitching(true);
      if (switchTimerRef.current !== null) clearTimeout(switchTimerRef.current);
      switchTimerRef.current = setTimeout(() => {
        switchTimerRef.current = null;
        setSwitching(false);
      }, EXCHANGE_SWITCH_GRACE_MS);
    },
    [exchange],
  );

  // 선택 토글 — 같은 행을 다시 누르면 해제(작업대 공용 패널과 같은 계약).
  const handleSelectUnfilled = useCallback((row: { orderNo: string }) => {
    setSelectedOrderNo((prev) => (prev === row.orderNo ? null : row.orderNo));
  }, []);
  const handleClearSelection = useCallback(() => setSelectedOrderNo(null), []);

  const isGated = subscriptionIsin === null || status === 'unauthorized';
  const isLoading = !quote && CONNECTING_STATES.has(status);
  const isBroken = UNRECOVERABLE_STATES.has(status);
  // 전환 유예가 끝났는데도 호가가 없으면 그 거래소에 호가가 없는 것이다(D3).
  const isNxtEmpty =
    !isGated && !quote && exchange === 'NXT' && !switching && !isBroken && !isLoading;

  return (
    <section
      aria-label="실시간 호가·주문"
      data-slot="stock-orderbook-section"
      data-testid="stock-orderbook-section"
      /* ② — 카드와 같은 컨테이너 이름. 선언의 출처는 `LC_CONTAINER_CLASS` 한 곳이다. */
      className={cn(LC_CONTAINER_CLASS, 'flex min-w-0 flex-col gap-[var(--s-3)]', className)}
    >
      {isGated ? (
        <OrderbookAccessGate />
      ) : (
        <>
          <OrderbookStatusBar
            status={status}
            statusLabel={statusLabel}
            accounts={accounts}
            accountNo={selectedAccountNo}
            onAccountChange={setSelectedAccountNo}
            exchange={exchange}
            onExchangeChange={handleExchangeChange}
            card={card}
            windowBadge={queuedWindowBadgeOf(queuedWindow)}
            onReconnect={isBroken ? reconnect : undefined}
          />

          <TabNotices card={card} exchange={exchange} switching={switching} nxtEmpty={isNxtEmpty} />

          <div className="min-w-0 overflow-clip rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card)]">
            <QuoteGrid10
              quote={quote}
              basePrice={quote !== null && quote.base > 0 ? quote.base : basePrice}
              upperLimit={quote !== null && quote.ul > 0 ? quote.ul : (upperLimit ?? 0)}
              lowerLimit={quote !== null && quote.ll > 0 ? quote.ll : (lowerLimit ?? 0)}
              currentPrice={quote?.p ?? 0}
            />
          </div>

          <CardBody
            variant="orderbook"
            card={card}
            isin={subscriptionIsin}
            accountNo={selectedAccountNo}
            exchange={exchange}
            name={name}
            code={code}
            status={status}
            queuedWindow={queuedWindow}
            basePrice={basePrice}
            upperLimit={upperLimit}
            referenceClose={quote !== null && quote.kc > 0 ? quote.kc : null}
            selectedUnfilled={selectedUnfilled}
            onClearSelection={handleClearSelection}
            className="overflow-clip rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card)]"
          />

          {/*
            ③ 다른 점 — 미체결/잔고는 **이 종목만**(위 `stockAccount`). 행 선택 → 수동주문 정정/취소.
            ★ `code` 를 넘기지 않는다 — 넘기면 패널이 「종목 축 모드」가 되어 **자기 계좌 셀렉터**를
              그린다. 계좌는 상태줄 하나가 소유하므로(파일 상단 ⑤) 패널은 그 계좌번호를 글자로만
              되읽는 계좌 전용 머리를 쓴다(옛 상따 화면과 같은 배선). 셀렉터가 둘이면 어느 쪽이
              주문 계좌인지 흐려진다.
          */}
          <AccountPanel
            selectedAccountNo={selectedAccountNo}
            accountName={accounts.find((a) => a.accountNo === selectedAccountNo)?.name}
            account={stockAccount}
            name={name}
            isin={subscriptionIsin}
            currentPrice={quote?.p}
            status={status}
            onSelectUnfilled={handleSelectUnfilled}
            selectedOrderNo={selectedUnfilled?.orderNo ?? null}
            className="rounded-[var(--r-lg)] border border-[var(--border)]"
          />
        </>
      )}
    </section>
  );
}

/**
 * 호가 탭 상태줄 — DMA · 계좌 · 거래소 KRX|NXT · LED 3칩 · 구간 배지 · (거부) · 반영 시각.
 *
 * ★ 거래소 세그먼트가 **여기** 있다(카드는 헤더) — 다른 점 ①. 이 탭에서 거래소를 바꾸면 다른
 *   전략 키(ISIN:계좌:거래소)를 보는 것이지 등록된 전략의 거래소를 바꾸는 것이 아니므로 잠그지 않는다.
 * ★ 무장 상태를 말하는 표기는 래치 LED 3개뿐이다(D-22) — 판정은 `latchLedStateOf` 한 곳.
 * ★ 연결 상태 문구는 `RELAY_STATE_LABELS` 한 곳에서 온다(D-36). 방향색을 쓰지 않는다.
 * ★ `flex-wrap` 이라 좁은 폭에서 두 줄로 접힌다 — 뷰포트 분기를 두지 않는다.
 */
function OrderbookStatusBar({
  status,
  statusLabel,
  accounts,
  accountNo,
  onAccountChange,
  exchange,
  onExchangeChange,
  card,
  windowBadge,
  onReconnect,
}: {
  status: RelayStatus;
  statusLabel: string;
  accounts: RelayAccount[];
  accountNo: string;
  onAccountChange: (accountNo: string) => void;
  exchange: RelayExchange;
  onExchangeChange: (exchange: RelayExchange) => void;
  card: StrategyCardState;
  windowBadge: ReturnType<typeof queuedWindowBadgeOf>;
  onReconnect?: () => void;
}) {
  const label = statusLabel === '' ? RELAY_STATE_LABELS.connecting : statusLabel;
  const { ledServer, handleArm, lastError, appliedAt } = card;

  return (
    <div
      data-slot="orderbook-status-bar"
      data-status={status}
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--muted)] px-[var(--s-3)] py-1.5 text-[length:var(--t-caption)] text-[var(--muted-fg)]"
    >
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          data-tone={status === 'ready' ? 'ok' : 'off'}
          className={cn(
            'block size-[7px] shrink-0 rounded-full',
            status === 'ready' ? 'bg-[var(--led-armed)]' : 'bg-[var(--flat)]',
            CONNECTING_STATES.has(status) && 'animate-pulse motion-reduce:animate-none',
          )}
        />
        DMA <b className="font-semibold text-[var(--fg)]">{label}</b>
      </span>

      {/*
        계좌 — 옵션 폼(전략 키) · 수동주문 · 미체결/잔고가 **이 값 하나**를 본다(파일 상단 ⑤).
        ★ `appearance-none` 을 쓰지 않는다 — 네이티브 캐럿과 OS 선택 UI 를 잃는다.
        ★ 계좌번호는 마스킹하지 않는다(D2 · S-5).
      */}
      <span className="inline-flex min-w-0 items-center gap-1.5">
        계좌
        <select
          aria-label="계좌"
          value={accountNo}
          onChange={(e) => onAccountChange(e.target.value)}
          disabled={accounts.length === 0}
          className="mono h-6 max-w-full min-w-0 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--card)] px-1.5 text-[11px] font-semibold text-[var(--fg)] disabled:opacity-50"
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
      </span>

      {/*
        거래소 세그먼트 — 카드 헤더와 같은 `ToggleGroup type="single"`(라디오형 · ←/→ 로빙 포커스).
        빈 값(`""`)은 무시한다 — single 그룹은 선택된 항목을 다시 누르면 해제를 알린다.
        연결 전에는 잠근다 — 구독할 소켓이 없는데 전환하면 「불러오는 중」만 남는다.
      */}
      <ToggleGroup
        type="single"
        value={exchange}
        onValueChange={(v) => {
          if (v === 'KRX' || v === 'NXT') onExchangeChange(v);
        }}
        disabled={status !== 'ready'}
        aria-label="거래소"
        data-slot="orderbook-exchange-segment"
        className="h-5 gap-0 overflow-hidden rounded-[var(--r-sm)] border border-[var(--border)]"
      >
        {EXCHANGES.map((ex) => (
          <ToggleGroupItem
            key={ex}
            value={ex}
            className="h-5 min-w-0 rounded-none bg-[var(--card)] px-1.5 text-[10px] font-bold tracking-[0.02em] text-[var(--muted-fg)] not-first:border-l not-first:border-[var(--border)] data-[state=on]:bg-[var(--accent)] data-[state=on]:text-[var(--accent-fg)]"
          >
            {ex}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <span className="inline-flex flex-wrap items-center gap-1.5">
        {(['buy', 'sell', 'cancel'] as const).map((kind) => (
          <LatchLed key={kind} kind={kind} server={ledServer} onArm={handleArm} />
        ))}
      </span>

      {/* 구간 배지 — 모름이면 **없음**(「정규」로 위장하지 않는다 · `queuedWindowBadgeOf`). */}
      {windowBadge !== null && (
        <span
          data-slot="orderbook-window-badge"
          data-tone={windowBadge.tone}
          className={cn(
            'inline-flex h-[18px] items-center rounded-full border px-[7px] text-[10px] font-bold',
            windowBadge.tone === 'regular' &&
              'border-[var(--border)] bg-[var(--card)] text-[var(--fg)]',
            windowBadge.tone === 'queued' &&
              'border-[var(--new-bd)] bg-[var(--new-bg)] text-[var(--fg)]',
            windowBadge.tone === 'offhours' &&
              'border-transparent bg-[var(--accent)] text-[var(--accent-fg)]',
          )}
        >
          {windowBadge.text}
        </span>
      )}

      {lastError !== null && (
        <span
          role="alert"
          data-slot="orderbook-server-error"
          className="min-w-0 text-[var(--destructive)]"
        >
          {/* 출처 배지 판정은 `serverMsgBadge` 하나 — 텍스트 접두라 색 단독 전달이 아니다(WCAG 1.4.1). */}
          <span className="font-semibold">{serverMsgBadge(lastError.src)}</span> {lastError.text}
        </span>
      )}

      <span className="ml-auto inline-flex items-center gap-3">
        {onReconnect !== undefined && (
          <Button variant="outline" size="sm" className="h-6 px-2" onClick={onReconnect}>
            다시 연결
          </Button>
        )}
        <span className="mono">반영 {appliedAt ?? '—'}</span>
      </span>
    </div>
  );
}

/**
 * 본문 위 인라인 고지 — 토스트 없이 `role="status"` 로만 말한다(카드 `CardNotices` 와 같은 원문).
 * 거래소 전환 중 · NXT 빈 호가 · 다른 단말 변경 배너 · 3초 미반영.
 */
function TabNotices({
  card,
  exchange,
  switching,
  nxtEmpty,
}: {
  card: StrategyCardState;
  exchange: RelayExchange;
  switching: boolean;
  nxtEmpty: boolean;
}) {
  const { banner, unacked } = card;
  if (!switching && !nxtEmpty && banner === null && !unacked) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1 text-[length:var(--t-caption)]">
      {switching && (
        <p role="status" className="m-0 text-[var(--muted-fg)]">
          {exchange} 호가 불러오는 중
        </p>
      )}
      {nxtEmpty && (
        <p role="status" data-slot="orderbook-nxt-empty" className="m-0 text-[var(--muted-fg)]">
          <b className="font-semibold text-[var(--fg)]">이 종목은 NXT 호가가 없어요</b> · KRX 로
          전환하면 실시간 호가를 볼 수 있어요.
        </p>
      )}
      {banner !== null && (
        <p role="status" data-slot="orderbook-echo-banner" className="m-0 text-[var(--fg)]">
          {banner}
        </p>
      )}
      {unacked && (
        <p
          role="status"
          data-slot="orderbook-unacked"
          className="m-0 font-semibold text-[var(--destructive)]"
        >
          미반영 · 서버 응답을 기다리고 있어요
        </p>
      )}
    </div>
  );
}

/**
 * 권한 없음 게이트. **행동 버튼이 없다** — v1 은 관리자 수기 등록이라 셀프서비스 경로 자체가
 * 존재하지 않는다. 문구는 UI-SPEC §Copywriting verbatim. 색은 전부 중립(방향색 금지).
 */
function OrderbookAccessGate() {
  return (
    <Card
      variant="plain"
      data-testid="orderbook-access-gate"
      className="items-center gap-[var(--s-2)] px-[var(--s-5)] py-[var(--s-6)] text-center"
    >
      <Lock aria-hidden="true" className="size-6 text-[var(--muted-fg)]" />
      <p className="text-[length:var(--t-base)] font-semibold text-[var(--fg)]">
        실시간 호가·주문 권한이 없어요
      </p>
      <p className="max-w-[46ch] text-[length:var(--t-sm)] text-[var(--muted-fg)]">
        실시간 호가와 주문은 증권사 계정이 연결된 사용자만 이용할 수 있어요. 연결이 필요하면
        관리자에게 문의해 주세요.
      </p>
      <p className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
        이 종목의 차트·뉴스·종목토론방은 그대로 이용할 수 있어요.
      </p>
    </Card>
  );
}
