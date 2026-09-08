'use client';

/**
 * StockOrderbookSection — 호가주문 탭 섹션 셸 (UI-SPEC C1, 확정 L1=B · L6 · M1).
 *
 * ① 무엇을 하는가
 *   `useRelaySubscription` 으로 **전역 relay 연결**(16-09 `RelayProvider`, D-22) 위에 이
 *   종목 구독만 얹어 연결 상태·호가·체결을 받고, 헤더 / 전폭 상태 바 / 본문(게이트·
 *   스켈레톤·에러·정상 4분기)을 조립한다. 거래소 KRX/NXT 토글과 사다리에서 고른
 *   가격(`selectedPrice`)도 이 셸이 소유한다 — 주문 패널(15-18)이 소비한다.
 *   ★ 소켓은 이 섹션이 소유하지 않는다. 여기서 하는 일은 구독 참조계수 +1/-1 뿐이다.
 *
 * ② 어디에 마운트되는가
 *   `stock-detail-client.tsx` 의 `호가주문` 탭 패널 **전체**. 패널 폭은 15-11 이 이미
 *   넓은 컨테이너(`w-full`)로 잡아 뒀고, 좌우 24px 여백은 AppShell `main` 의 `p-6` 이 준다.
 *   탭이 Radix Tabs 라 비활성 시 **언마운트**되며, 구독 훅의 cleanup 이 `unsub`(참조계수
 *   1→0)을 처리한다. 소켓 자체는 앱이 열려 있는 한 유지되므로 탭을 껐다 켜도 DMA 세션이
 *   재수립되지 않는다. 그래서 `enabled` 에 탭 활성 여부를 넘기지 않는다.
 *
 * ③ ★ LOCKED 색 규칙 (UI-SPEC §Color 열거표 · 금지 목록 · 토큰 충돌)
 *   - 섹션 헤더의 등락액·등락률만 방향색(`ui/number.tsx` `withColor`). 나머지 헤더 수치
 *     (기준·상한·하한·VI)는 전부 중립 `--fg` / `--muted-fg` 다.
 *   - 연결 상태 배지·안내 문구·스켈레톤·빈 상태·권한 없음 게이트에는 방향색을 쓰지 않는다.
 *   - 거래소 토글 활성만 accent(`--accent`) — UI-SPEC 이 accent 사용처로 명시한 3곳 중 하나다.
 *
 * ④ 빈 · 에러 · 게이트 상태
 *   - `unauthorized` 또는 `isin === null` → C13 권한 없음 게이트가 **본문을 대체**한다.
 *     **섹션 자체를 숨기지 않는다**(UI-SPEC C1). 그래서 이 파일에는 null 을 돌려주는
 *     경로가 없다 — `stock-comovement-section.tsx` 의 quiet fallback 관례를 따르지 않는다.
 *   - 초기 로딩(호가 없음 + 연결 진행 중) → `orderbook-skeleton.tsx`.
 *   - 복구 불가 실패(`failed` / `manual_required` / `session_rejected`) + 호가 없음 →
 *     `호가를 불러오지 못했어요` + `다시 연결` 버튼(`reconnect()`).
 *   - NXT 호가가 비면 전용 빈 상태로 알린다(D3 — 토글 비활성화는 `GetSymbolMasterReq`
 *     가 필요해 deferred). 문구 정본은 아래 JSX 한 곳뿐이다.
 *   - 재접속 중에는 **본문을 비우지 않는다**. 사다리·테이프가 마지막 값 + `opacity:.55` 다.
 *
 * ⑤ 이중 가격 (D1)
 *   히어로(30px·스냅샷 API·`갱신 HH:MM:SS`)와 이 헤더(20px·실시간 DMA·`체결 HH:MM:SS`)는
 *   **다른 값을 보일 수 있다.** 크기 위계와 `실시간(DMA)` 출처 라벨 상시 노출로 설명한다.
 *   **히어로는 수정하지 않는다**(Phase 6 표면 비침범).
 *
 * ⑥ 레이아웃 — 데스크톱과 모바일이 **일부러 다른 순서**다 (2026-09-07 확정)
 *   ≥900px  `grid-template-columns: 200px 380px minmax(380px,1fr)` / `gap: 1px`
 *           좌 체결 테이프 · 중앙 사다리 10단 · 우측 내 계좌 축.
 *           체결 200px 은 `구분` 열을 없애고(수량 색이 대신한다) 남은 3열 최소폭이다.
 *           세 열 합은 960px 로 유지 — 900~960px 구간 가로 넘침을 더 키우지 않는다.
 *   <900px  호가 → 주문 → 체결 → 잔고 → 미체결.
 *           손이 닿는 순서(호가를 눌러 주문)를 위로 올리고, 참고용인 체결을 뒤로 뺀다.
 *           데스크톱은 좌→우로 훑으니 체결이 먼저여도 시선 비용이 없지만, 모바일은
 *           세로 스크롤이라 체결이 위에 있으면 주문까지 매번 지나가야 한다.
 *   ★ 그래서 `order-*`(모바일)와 소스 순서(데스크톱)가 **의도적으로 어긋나 있다**.
 *     둘 중 하나만 고치면 반대쪽이 조용히 깨지므로, 섹션 테스트가 두 순서를 함께 잠근다.
 *
 * ⑦ ★ `min-w-0` 를 그리드 자식 전부에 건다 — 없으면 호가창이 **잘린다**
 *   그리드 아이템 기본값은 `min-width: auto` 라 콘텐츠 최소폭 아래로 줄지 않는다.
 *   폭이 모자라면 아이템이 그리드 밖으로 삐져나가고, 섹션의 `overflow-hidden` 이 그걸
 *   그대로 **잘라낸다**(스크롤바도 안 생겨 사용자는 잘린 줄만 안다). 실제로 잔량·계좌명이
 *   길어지면 사다리 우측 `매수잔량` 열이 화면 밖으로 밀려나 사라졌다.
 *   `display: contents` 인 계좌 축의 자식(주문·계좌 패널)도 좁은 폭에서는 직접 그리드
 *   아이템이 되므로 **그 둘에도 걸어야 한다** — 래퍼에만 걸면 모바일에서 무효다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Number as UiNumber } from '@/components/ui/number';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AccountPanel } from '@/components/orderbook/account-panel';
import { OrderbookLadder } from '@/components/orderbook/orderbook-ladder';
import { OrderbookSkeleton } from '@/components/orderbook/orderbook-skeleton';
import {
  OrderPanel,
  deriveTickSize,
  type PriceSelection,
} from '@/components/orderbook/order-panel';
import { RelayStatusBar } from '@/components/orderbook/relay-status-bar';
import { TradeTape, formatTapeTime } from '@/components/orderbook/trade-tape';
import { useRelaySubscription } from '@/lib/relay-provider';
import { cn } from '@/lib/utils';
import type { RelayExchange } from '@gh-radar/shared';

/** 거래소 전환 후 이 시간까지 스냅샷이 없으면 "빈 호가"로 판정한다(D3). */
const EXCHANGE_SWITCH_GRACE_MS = 3_000;

/** 아직 아무 프레임도 못 받은 진행 상태들 — 이때만 스켈레톤을 그린다. */
const CONNECTING_STATES = new Set(['idle', 'connecting', 'logging_in', 'declaring']);
/** 자동 복구를 기대할 수 없는 상태들 — 사용자에게 `다시 연결` 을 준다. */
const UNRECOVERABLE_STATES = new Set(['failed', 'manual_required', 'session_rejected']);

const KRW = new Intl.NumberFormat('ko-KR');

function fmt(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? '—' : KRW.format(n);
}

export interface StockOrderbookSectionProps {
  /** 6자 단축코드. 표시·주문 요청 키다. */
  code: string;
  /** 종목명. 헤더 표기용. */
  name: string;
  /**
   * 12자 KRX 표준코드. **게이트웨이 구독 키**(D-28).
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
    ISIN 정규화 — 빈 문자열·undefined 를 전부 null 로 좁힌다.
    `isin === null` 만 게이트 조건으로 쓰면, 필드가 아예 빠진 응답(구 서버·E2E 픽스처)에서
    `undefined !== null` 이라 게이트를 통과한 뒤 `enabled:false` 로 연결도 하지 않아
    **스켈레톤에서 영원히 멈춘다**. 구독 키가 없다는 사실 하나로 판정을 통일한다.
  */
  const subscriptionIsin = isin != null && isin.length > 0 ? isin : null;

  const [exchange, setExchange] = useState<RelayExchange>('KRX');
  const [selectedPrice, setSelectedPrice] = useState<PriceSelection | null>(null);
  const [switching, setSwitching] = useState(false);
  /*
    계좌 선택은 **섹션이 소유**하고 주문 패널·계좌 패널이 같은 값을 본다.
    두 패널이 각자 상태를 들면 "주문한 계좌"와 "미체결을 보고 있는 계좌"가 어긋난다 —
    그 어긋남이 곧 엉뚱한 계좌의 주문을 취소하는 사고다.
  */
  const [selectedAccountNo, setSelectedAccountNo] = useState('');
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 가격 클릭 일련번호 — 같은 호가를 다시 눌러도 주문 패널이 다시 반영하게 한다. */
  const priceSeqRef = useRef(0);

  const {
    status,
    statusMessage,
    attempt,
    accounts,
    quote,
    tape,
    account,
    messages,
    isStale,
    reconnect,
  } = useRelaySubscription({
    isin: subscriptionIsin ?? '',
    exchange,
    enabled: subscriptionIsin !== null,
  });

  /*
   * 종목 전환 state sticky 방어 (WR-04 관례 · T-15-40).
   * 종목 상세는 같은 동적 라우트라 종목 간 이동에서 **remount 없이 props 만 갱신**된다.
   *   - 거래소 리셋 없으면 NXT 를 보던 사용자가 새 종목에서도 NXT 에 갇힌다.
   *   - selectedPrice 리셋 없으면 **다른 종목의 호가 가격이 주문 입력에 남는다** —
   *     이것이 곧 "리셋 누락 = 다른 종목 호가로 주문하는 사고"다.
   *   - 전환 중 인라인 표식(switching) 리셋 없으면 새 종목에서 유령 로딩 문구가 뜬다.
   * 구독 해제(unsub)는 구독 훅이 이미 한다. quote/tape 는 전역 맵에서 **키로** 골라 오므로
   * 종목이 바뀌면 새 키에 값이 없어 자연히 비고, 이전 종목 값이 새어 나올 여지가 없다
   * (16-09 T-16-02 — 승격 전 `wantedKeyRef` 필터가 하던 일을 키 선택이 대신한다).
   * ★ `account`(잔고·미체결)는 **리셋하지 않는다**. 계좌 상태는 종목 축이 없어서, 종목을
   *   옮길 때마다 비우면 다음 델타가 올 때까지 계좌 패널이 빈 채로 남는다.
   */
  useEffect(() => {
    setExchange('KRX');
    setSelectedPrice(null);
    setSwitching(false);
    if (switchTimerRef.current !== null) {
      clearTimeout(switchTimerRef.current);
      switchTimerRef.current = null;
    }
  }, [code, isin]);

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
    (next: string) => {
      // ToggleGroup single 은 같은 항목 재클릭 시 빈 문자열을 준다 — 해제를 허용하지 않는다.
      if (!next || next === exchange) return;
      setExchange(next as RelayExchange);
      setSwitching(true);
      if (switchTimerRef.current !== null) clearTimeout(switchTimerRef.current);
      switchTimerRef.current = setTimeout(() => {
        switchTimerRef.current = null;
        setSwitching(false);
      }, EXCHANGE_SWITCH_GRACE_MS);
    },
    [exchange],
  );

  const handlePriceClick = useCallback((price: number) => {
    // T-15-14 — 가격만 채운다. 매수/매도 구분은 **절대 자동 전환하지 않는다**.
    // 제출도 하지 않는다. 반영 피드백(입력칸 테두리 플래시)은 15-18 주문 패널 소관.
    // `seq` 를 올려 보내는 이유는 `PriceSelection` 주석 참고 — 같은 호가 재클릭도 반영이다.
    priceSeqRef.current += 1;
    setSelectedPrice({ price, seq: priceSeqRef.current });
  }, []);

  const effectiveBase = quote?.base && quote.base > 0 ? quote.base : basePrice;
  const lastTradeAt = useMemo(
    () => (quote?.et ? formatTapeTime(quote.et) : undefined),
    [quote?.et],
  );

  /*
    호가 단위 — 실호가의 인접 단계 간격이 1순위이고 표는 폴백이다(`deriveTickSize` 주석).
    스텝퍼 증감폭과 blur 스냅의 기준이므로 값이 틀리면 게이트웨이가 주문을 거부한다.
  */
  const tick = useMemo(
    () => deriveTickSize(quote?.ap, quote?.bp, quote?.p && quote.p > 0 ? quote.p : effectiveBase),
    [quote?.ap, quote?.bp, quote?.p, effectiveBase],
  );

  /** 이 종목의 매도가능수량 — 매도 비율 버튼의 기준. 잔고에 없으면 0. */
  const sellableQty = useMemo(() => {
    if (subscriptionIsin === null || !account) return 0;
    return account.hold.find((h) => h.isin === subscriptionIsin)?.sellableQty ?? 0;
  }, [account, subscriptionIsin]);

  const isGated = subscriptionIsin === null || status === 'unauthorized';
  const isLoading = !isGated && !quote && CONNECTING_STATES.has(status);
  const isBroken = !isGated && !quote && UNRECOVERABLE_STATES.has(status);
  // 전환 유예가 끝났는데도 호가가 없으면 그 거래소에 호가가 없는 것이다(D3).
  const isNxtEmpty = !isGated && !quote && exchange === 'NXT' && !switching && !isBroken && !isLoading;

  return (
    <section
      aria-label="실시간 호가·주문"
      data-slot="stock-orderbook-section"
      data-testid="stock-orderbook-section"
      className={cn(
        'card-shadow overflow-hidden rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card)]',
        className,
      )}
    >
      {/* ── 헤더 ─────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-[var(--s-3)] px-[var(--s-4)] py-[var(--s-3)]">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="flex items-baseline gap-[var(--s-2)] text-[length:var(--t-caption)] font-semibold text-[var(--muted-fg)]">
            <span className="text-[length:var(--t-sm)] text-[var(--fg)]">{name}</span>
            <span className="mono">{code}</span>
          </p>
          <p className="flex flex-wrap items-baseline gap-[var(--s-2)]">
            {/* 실시간 체결가 20px — 히어로(30px 스냅샷)보다 한 단계 낮은 위계(D1). */}
            <span className="mono text-[length:var(--t-h3)] font-semibold leading-tight">
              {fmt(quote?.p)}
            </span>
            {quote && (
              <>
                <UiNumber
                  value={quote.c}
                  format="price"
                  showSign
                  withColor
                  className="text-[length:var(--t-sm)] font-semibold"
                />
                <UiNumber
                  value={quote.cr / 100}
                  format="percent"
                  showSign
                  withColor
                  className="text-[length:var(--t-sm)] font-semibold"
                />
              </>
            )}
          </p>
          {/* 출처 라벨 — 히어로와 값이 다를 수 있는 이유를 상시 설명한다(D1). */}
          <p className="text-[11px] text-[var(--muted-fg)]">
            실시간(DMA) · 체결 {lastTradeAt ?? '—'}
          </p>
        </div>

        <div className="flex flex-col items-end gap-[var(--s-2)]">
          <ToggleGroup
            type="single"
            value={exchange}
            onValueChange={handleExchangeChange}
            aria-label="거래소 선택"
            size="sm"
            variant="outline"
            disabled={status !== 'ready'}
          >
            {(['KRX', 'NXT'] as const).map((ex) => (
              <ToggleGroupItem
                key={ex}
                value={ex}
                aria-label={`${ex} 호가`}
                className="h-6 px-2.5 text-[11px] font-semibold data-[state=on]:bg-[var(--accent)] data-[state=on]:text-[var(--accent-fg)]"
              >
                {ex}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <dl className="flex flex-wrap justify-end gap-x-[var(--s-3)] gap-y-0.5 text-[11px] text-[var(--muted-fg)]">
            <div className="flex gap-1">
              <dt>기준</dt>
              <dd className="mono text-[var(--fg)]">{fmt(effectiveBase)}</dd>
            </div>
            <div className="flex gap-1">
              <dt>상한</dt>
              <dd className="mono text-[var(--fg)]">{fmt(quote?.ul ?? upperLimit)}</dd>
            </div>
            <div className="flex gap-1">
              <dt>하한</dt>
              <dd className="mono text-[var(--fg)]">{fmt(quote?.ll ?? lowerLimit)}</dd>
            </div>
            <div className="flex gap-1">
              <dt>VI</dt>
              <dd className="mono text-[var(--fg)]">
                {fmt(quote?.viu)} / {fmt(quote?.vid)}
              </dd>
            </div>
          </dl>
        </div>
      </header>

      {/* ── 상태 바 (L6 · 섹션 상단 전폭) ─────────────────────── */}
      <RelayStatusBar
        status={status}
        statusMessage={statusMessage}
        attempt={attempt}
        accounts={accounts}
        messages={messages}
        lastTradeAt={lastTradeAt}
        exchange={exchange}
        className="border-t"
      />

      {/* ── 본문 ─────────────────────────────────────────────── */}
      {isGated ? (
        <OrderbookAccessGate />
      ) : isLoading ? (
        <OrderbookSkeleton className="p-[var(--s-3)]" />
      ) : isBroken ? (
        <OrderbookLoadError onRetry={reconnect} />
      ) : (
        <div className="grid gap-px bg-[var(--border-subtle)] min-[900px]:grid-cols-[200px_380px_minmax(380px,1fr)]">
          {/* 체결 테이프 — 데스크톱 첫 컬럼, 모바일은 주문 아래 3번째 */}
          <div className="order-3 min-w-0 bg-[var(--card)] p-[var(--s-2)] min-[900px]:order-none">
            <TradeTape
              entries={tape}
              isStale={isStale}
              basePrice={effectiveBase}
              bestAsk={quote?.ap[0]}
              bestBid={quote?.bp[0]}
            />
          </div>

          {/* 호가 사다리 — 데스크톱 가운데 컬럼, 모바일은 맨 위 */}
          <div className="order-1 min-w-0 bg-[var(--card)] p-[var(--s-2)] min-[900px]:order-none">
            {switching && (
              <p
                aria-live="polite"
                className="pb-1 text-[11px] text-[var(--muted-fg)]"
              >
                {exchange} 호가 불러오는 중
              </p>
            )}
            {isNxtEmpty ? (
              <div className="flex flex-col items-center justify-center gap-1 rounded-[var(--r-md)] border border-dashed border-[var(--border)] px-[var(--s-4)] py-[var(--s-5)] text-center">
                <p className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
                  이 종목은 NXT 호가가 없어요
                </p>
                <p className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                  KRX 로 전환하면 실시간 호가를 볼 수 있어요.
                </p>
              </div>
            ) : (
              <OrderbookLadder
                quote={quote}
                depth={5}
                isStale={isStale}
                basePrice={effectiveBase}
                onPriceClick={handlePriceClick}
              />
            )}
          </div>

          {/*
            우측 "내 계좌 축" 컬럼 (L1=B). 좁은 폭에서는 `display: contents` 로 그리드
            자식이 흩어져 모바일 순서(호가 → 주문 → 체결 → 잔고 → 미체결)를 만든다.
            주문 패널(order-2)과 계좌 패널(order-4, 내부에서 잔고 → 미체결 순)이 자식이다.
          */}
          <div
            data-testid="orderbook-account-column"
            className="contents min-[900px]:flex min-[900px]:flex-col min-[900px]:gap-px"
          >
            <OrderPanel
              className="order-2 min-w-0 min-[900px]:order-none"
              code={code}
              name={name}
              accounts={accounts}
              selectedAccountNo={selectedAccountNo}
              onAccountChange={setSelectedAccountNo}
              exchange={exchange}
              selectedPrice={selectedPrice}
              tick={tick}
              sellableQty={sellableQty}
              status={status}
            />
            <AccountPanel
              className="order-4 min-w-0 min-[900px]:order-none"
              accounts={accounts}
              selectedAccountNo={selectedAccountNo}
              onAccountChange={setSelectedAccountNo}
              account={account}
              code={code}
              name={name}
              isin={subscriptionIsin}
              currentPrice={quote?.p}
              status={status}
            />
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * C13 권한 없음 게이트. **행동 버튼이 없다** — v1 은 관리자 수기 등록이라 셀프서비스
 * 경로 자체가 존재하지 않는다. 없는 경로로 안내하는 버튼은 사용자를 막다른 길로 보낸다.
 * 문구는 UI-SPEC §Copywriting verbatim. 색은 전부 중립(방향색 금지).
 */
function OrderbookAccessGate() {
  return (
    <Card
      variant="plain"
      data-testid="orderbook-access-gate"
      className="m-[var(--s-3)] items-center gap-[var(--s-2)] px-[var(--s-5)] py-[var(--s-6)] text-center"
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

/** 섹션 로드 실패 — UI-SPEC §Copywriting verbatim + `다시 연결` 버튼. */
function OrderbookLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      data-testid="orderbook-load-error"
      className="flex flex-col items-center gap-[var(--s-2)] px-[var(--s-5)] py-[var(--s-6)] text-center"
    >
      <p className="text-[length:var(--t-base)] font-semibold text-[var(--fg)]">
        호가를 불러오지 못했어요
      </p>
      <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
        연결에 실패했어요. 페이지를 새로고침해 주세요.
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        다시 연결
      </Button>
    </div>
  );
}
