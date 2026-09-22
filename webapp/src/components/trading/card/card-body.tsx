'use client';

/**
 * CardBody — 전략 카드 본문 = 종목상세 호가 탭 본문 (Phase 18 D-12 · D-19 · D-23 · D-24 · D-28, TRADE-07/09).
 *
 * ① 무엇인가
 *   **좌 호가(+최근 체결) | 우 옵션 세팅 4그룹 + 적응형 수동주문.** 어느 밴드에서도 세로 스택이
 *   없다 — 좁아지면 두 칸의 폭이 줄 뿐 좌우 배치는 그대로다(D-12). 좌 pane 이 오른쪽 테두리를 갖는다.
 *   작업대 카드(`strategy-card.tsx` 의 `body` 렌더 prop)와 종목상세 호가 탭
 *   (`stock-orderbook-section.tsx`)이 **이 컴포넌트 하나**를 쓴다(D-24). 두 표면의 차이 셋 중
 *   본문에 들어오는 것은 ② 주문유형 콤보 하나뿐이고 `variant` 가 그것을 가른다 — ① 거래소 자리
 *   (헤더 vs 상태줄) ③ 미체결 범위는 상위가 담당한다.
 *
 * ② ★ 밴드는 **카드(탭 본문) 폭**이다 — 뷰포트가 아니다 (D-28)
 *   여기 쓰는 `@min-[Npx]/lc:` 는 가장 가까운 `@container/lc` 조상(카드 래퍼 · 호가 탭 본문 래퍼)의
 *   폭을 잰다. 새 경계 숫자를 도입하지 않고 뷰포트 브레이크포인트를 섞지 않는다 — 섞으면 §2.2b 가
 *   기록한 255px 역전이 되살아난다. 밴드 수치의 정본은 `webapp/src/styles/globals.css` §2.2b 다.
 *   2·3단 격자에서 카드 안 밀도가 폰 밴드로 떨어지는 것은 사용자가 확인한 의도된 결과다.
 *
 * ③ ★ 섹션 라벨이 없다 (D-12)
 *   「호가」「체결」「옵션 세팅」 같은 제목을 넣지 않는다 — 사용자가 「쓸데없는 라벨링, 공간만
 *   차지」라고 명시적으로 뺐다. 그룹 제목(「매수주문」…)과 그 옆 보조문은 남는다. 접근성 이름은
 *   사다리의 `aria-label`(「호가 10단 …」)과 체결 테이프 표의 `aria-label` 이 잇는다.
 *
 * ④ ★ 호가 사다리를 새로 만들지 않는다
 *   `OrderbookLadder variant="chaser"` 의 3트리 배타 조건과 색·바 정규화 규칙을 공유한다.
 *   시세가 없으면 **빈 호가(`EMPTY_LADDER_QUOTE`)** 를 넘겨 10단 행을 「—」로 그린다(E9 empty) —
 *   안내 카드로 바꾸면 행 수가 흔들리고 본문 높이가 튄다. 스피너도 없다(E9 loading).
 *   가격 있는 행을 누르면 그 가격이 수동주문 폼에 채워지고, **값 없는 행은 no-op** 다(T-18-47).
 *
 * ⑤ 상태를 소유하지 않는다
 *   서버 전략 · 시세 · 전송/에코 콜백은 카드 상태 훅(`useStrategyCardState`)이 들고 `card` 로
 *   건넨다. 본문이 들고 있는 것은 화면 국소 상태 둘뿐이다 — 폰 밴드 옵션 탭, 호가 클릭 가격.
 *   ★ 본문은 넘겨받은 **단일** `isin`/`exchange` 의 시세만 그리고, 수동주문 폼도 같은 값을 쓴다
 *     (T-18-48 — 다른 종목 호가로 주문하는 경로가 없다).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  RelayExchange,
  RelayLimitChaser,
  RelayQueuedWindowMsg,
  RelayQuote,
  RelayUnfilled,
} from '@gh-radar/shared';

import { CHAT_FAB_CLEARANCE_CLASS } from '@/components/chat/fab-clearance';
import { OrderbookLadder } from '@/components/orderbook/orderbook-ladder';
import type { PriceSelection } from '@/components/orderbook/order-panel';
import { latchLedStateOf } from '@/components/trading/latch-led';
import {
  LIMIT_CHASER_DIRTY_HINT,
  LimitChaserForm,
} from '@/components/trading/limit-chaser-form';
import {
  ManualOrderEntry,
  ManualOrderForm,
} from '@/components/trading/card/manual-order-form';
import type { StrategyCardState } from '@/components/trading/card/strategy-card';
import type { RelayStatus } from '@/lib/use-relay-socket';
import { cn } from '@/lib/utils';

/** 사다리 단 수 — 계약상 `ap/aq/bp/bq` 는 길이 10 고정. */
const LEVELS = 10;
const ZEROS: number[] = Array.from({ length: LEVELS }, () => 0);

/**
 * 시세 미수신용 빈 호가 — 10단 행을 「—」로 그리게 하는 값이다(④ · E9 empty · loading · error).
 * ★ 가격이 전부 0 이라 어떤 행도 클릭에 반응하지 않는다(`onPriceSelect` 는 0 을 거른다).
 * ★ 이 값이 서버에서 온 것처럼 쓰이는 곳은 없다 — 본문 사다리 **표시**에만 들어간다.
 */
const EMPTY_LADDER_QUOTE: RelayQuote = {
  t: 'q',
  i: '',
  x: 'KRX',
  snap: true,
  p: 0,
  o: 0,
  h: 0,
  l: 0,
  c: 0,
  cs: '',
  cr: 0,
  v: 0,
  va: 0,
  ap: ZEROS,
  aq: ZEROS,
  bp: ZEROS,
  bq: ZEROS,
  ta: 0,
  tb: 0,
  ul: 0,
  ll: 0,
  base: 0,
  viu: 0,
  vid: 0,
  kc: 0,
  ls: 0,
  et: '',
};

/**
 * 호가 탭 더티 바의 오른쪽 끝 — 종목상세(`/stocks/{code}`)에는 AI FAB(`fixed right-6 bottom-6`)
 * 이 떠 있어 바의 「수정」 버튼을 덮는다. FAB 폭은 종목명 라벨 길이로 달라지므로(실측 134px ·
 * 「삼성전자」) 고정 숫자가 아니라 FAB 이 싣는 실측 폭 변수만큼 바를 줄인다(`chat/fab-clearance.ts`).
 * `dirty-action-bar.tsx` ⑥ⓒⓙ 가 지목한 대로 **이 표면에서만** `className` 으로 감싼다 — 공유
 * 컴포넌트와 작업대 카드(FAB 없음)는 전폭 그대로다. z-index 로 FAB 을 덮지 않는다.
 */
const ORDERBOOK_DIRTY_BAR_CLASS = CHAT_FAB_CLEARANCE_CLASS;

/** 더티 바 문구에서 종목명이 차지할 최대 글자 수 — 넘치면 한 줄 말줄임(…)이다(E15 long-text). */
const DIRTY_NAME_MAX = 16;

/** 그룹 제목 옆 보조문 4개 — UI-SPEC §카드 「그룹 보조문」 5문구 중 하나씩. */
export interface CardGroupStatus {
  buy: string;
  sweep: string;
  sell: string;
  cancel: string;
}

/**
 * 서버 에코 → 그룹 보조문 (**순수 함수**, 목업 `18-workbench-mockup.html` `:934-937` 동형).
 *
 * ★ 판정 입력은 **서버 에코 하나**다(D-27) — 폼 더티값·스위치 표시값을 읽지 않는다. 래치
 *   단계(대기 ↔ 감시)는 `latchLedStateOf`(17-07) 가 소유하고 여기서는 문구로 옮기기만 한다 —
 *   LED 칩과 보조문이 같은 무장을 서로 다르게 말하는 순간을 만들지 않는다.
 * ★ `fired` 는 와이어 필드가 아니라 카드가 아는 사실이다(Pitfall 10). 발주로 무장이 풀린 매수만
 *   「발주 완료 · 무장 해제」이고, 사용자가 끈 것은 「꺼짐」이다.
 */
export function cardGroupStatusOf(
  server: RelayLimitChaser | null,
  fired: boolean,
): CardGroupStatus {
  const led = server === null ? null : { ...server, hadOrder: fired };
  const stage = (kind: 'buy' | 'sell' | 'cancel') =>
    latchLedStateOf(kind, led).tone === 'armed' ? '감시 중' : '무장 · 대기';
  const cancelOff = latchLedStateOf('cancel', led).tone === 'off';
  return {
    buy:
      server?.buyEnabled === true
        ? stage('buy')
        : fired
          ? '발주 완료 · 무장 해제'
          : '꺼짐',
    sweep: server?.sweepEnabled === true ? '켜짐' : '꺼짐',
    sell: server?.sellEnabled === true ? stage('sell') : '꺼짐',
    cancel: cancelOff ? '꺼짐' : stage('cancel'),
  };
}

/**
 * 더티 바 보조문 — 「{종목명} · {N}개 미반영」 + 상따 안내 문장 (UI-SPEC §카드 더티 바 원문).
 *
 * ★ 카드가 여럿이면 바가 전부 화면 하단 같은 자리에 뜬다 — **어느 카드의 바인지는 이 문구만이
 *   말한다.** 공유 바의 `hint` 는 문자열 prop 이라 종목명만 따로 말줄임할 수 없으므로 여기서
 *   글자 수로 자른다(1줄 말줄임). 안내 문장은 자르지 않는다 — 폰에서 두 줄로 접히는 것이 허용이다.
 */
export function cardDirtyHint(name: string, dirtyCount: number): string {
  const chars = Array.from(name);
  const shown =
    chars.length > DIRTY_NAME_MAX ? `${chars.slice(0, DIRTY_NAME_MAX - 1).join('')}…` : name;
  return `${shown} · ${dirtyCount}개 미반영 · ${LIMIT_CHASER_DIRTY_HINT}`;
}

export interface CardBodyProps {
  /** `'card'` = 작업대 카드 · `'orderbook'` = 종목상세 호가 탭(주문유형 콤보 있음, D-23). */
  variant: 'card' | 'orderbook';
  /** 카드 상태 — `useStrategyCardState` 의 반환 그대로(⑤). */
  card: StrategyCardState;
  isin: string;
  accountNo: string;
  exchange: RelayExchange;
  /** 표시 종목명. 빈 문자열이면 ISIN 을 쓴다. */
  name: string;
  /** 6자 단축코드 — 수동주문 확인 다이얼로그 표시용. 모르면 `null`. */
  code: string | null;
  /** 세션 상태 — `ready` 가 아니면 옵션 폼·수동주문 버튼이 잠긴다. */
  status: RelayStatus;
  /** 77 창 힌트(`relay-provider` 의 `queuedWindow`). `undefined` = 모름. */
  queuedWindow: RelayQueuedWindowMsg | undefined;
  /** 실시간 기준가가 없을 때의 폴백(호가 탭의 REST 스냅샷). 실시간 `quote.base` 가 이긴다. */
  basePrice?: number;
  /** 실시간 상한가가 없을 때의 폴백. 실시간 `quote.ul` 이 이긴다. */
  upperLimit?: number;
  /** 시간외종가 「참고 종가」 — 호가 탭 수동주문 표시 전용. */
  referenceClose?: number | null;
  /** 미체결 표에서 선택된 원주문(D-21) — 선택은 상위가 소유한다. */
  selectedUnfilled?: RelayUnfilled | null;
  onClearSelection?: () => void;
  className?: string;
}

export function CardBody({
  variant,
  card,
  isin,
  accountNo,
  exchange,
  name,
  code,
  status,
  queuedWindow,
  basePrice: basePriceFallback,
  upperLimit: upperLimitFallback,
  referenceClose,
  selectedUnfilled,
  onClearSelection,
  className,
}: CardBodyProps) {
  const {
    key,
    server,
    quote,
    tape,
    isStale,
    fired,
    resetSeq,
    liveSeed,
    answerSeq,
    dirtyCount,
    setDirtyCount,
    handleSent,
    handleServerEcho,
  } = card;

  /** 폰 밴드 3탭 중 옵션 쪽 선택 — 옵션 폼의 pane 을 **제어형**으로 가른다(D-19). */
  const [optionsTab, setOptionsTab] = useState<'buy' | 'sell'>('buy');
  /** 호가 클릭 가격. `seq` 가 있어 같은 호가를 다시 눌러도 폼이 다시 반영한다. */
  const [selectedPrice, setSelectedPrice] = useState<PriceSelection | null>(null);
  const priceSeqRef = useRef(0);

  /*
    종목·거래소가 바뀌면 고른 가격을 버린다 — 호가 탭은 remount 없이 props 만 바뀐다.
    리셋하지 않으면 **다른 종목의 호가 가격**이 다음 폼 가격으로 남는다(T-15-40 · T-18-48).
  */
  useEffect(() => {
    setSelectedPrice(null);
  }, [isin, exchange]);

  const handlePriceSelect = useCallback((price: number) => {
    if (!(price > 0)) return; // 값 없는 셀 — no-op(T-18-47). 사다리도 거르지만 여기서 한 번 더.
    priceSeqRef.current += 1;
    setSelectedPrice({ price, seq: priceSeqRef.current });
  }, []);

  // 실시간 값이 정본이고 폴백은 스냅샷 전의 임시값이다(옛 상따 화면과 같은 규칙).
  const upperLimit = quote !== null && quote.ul > 0 ? quote.ul : (upperLimitFallback ?? 0);
  const basePrice = quote !== null && quote.base > 0 ? quote.base : (basePriceFallback ?? 0);
  const displayName = name === '' ? isin : name;
  const groups = cardGroupStatusOf(server, fired);

  const options = (
    <LimitChaserForm
      /* remount 키 — 옛 화면과 같다(삭제 에코 `resetSeq` · 실시간 상한가 재시딩 `liveSeed`). */
      key={`${isin}|${accountNo}|${exchange}|${resetSeq}|${liveSeed}`}
      isin={isin}
      accountNo={accountNo}
      exchange={exchange}
      server={server}
      upperLimit={upperLimit}
      disabled={isin === '' || accountNo === '' || status !== 'ready'}
      buyStatusText={groups.buy}
      sellStatusText={groups.sell}
      sweepStatusText={groups.sweep}
      cancelStatusText={groups.cancel}
      onDirtyCountChange={setDirtyCount}
      serverAnswerSeq={answerSeq}
      onSent={handleSent}
      onServerEcho={handleServerEcho}
      dirtyHint={cardDirtyHint(displayName, dirtyCount)}
      dirtyBarClassName={variant === 'orderbook' ? ORDERBOOK_DIRTY_BAR_CLASS : undefined}
      tab={optionsTab}
      hideTabs
    />
  );

  const form = (
    <ManualOrderForm
      variant={variant}
      isin={isin}
      code={code ?? ''}
      name={displayName}
      accountNo={accountNo}
      exchange={exchange}
      queuedWindow={queuedWindow}
      status={status}
      selectedPrice={selectedPrice}
      referenceClose={referenceClose}
      selectedUnfilled={selectedUnfilled}
      onClearSelection={onClearSelection}
    />
  );

  /*
    본문 그리드 — 좌 호가 | 우 옵션. 밴드 수치의 정본은 `webapp/src/styles/globals.css` §2.2b.
    ★ 그리드 자식 전부 `min-w-0` — 빠지면 스크롤이 아니라 **조용한 잘림**이 된다(lessons.md).
  */
  return (
    <div
      data-slot="card-body"
      data-variant={variant}
      className={cn(
        'grid min-w-0 grid-cols-[42%_minmax(0,1fr)] [&>*]:min-w-0',
        '@min-[700px]/lc:grid-cols-[260px_minmax(0,1fr)]',
        '@min-[830px]/lc:grid-cols-[400px_minmax(0,1fr)]',
        '@min-[992px]/lc:grid-cols-[460px_minmax(0,1fr)]',
        variant === 'card' && 'border-t border-[var(--border)]',
        className,
      )}
    >
      <div
        data-slot="card-body-orderbook"
        className="min-w-0 border-r border-[var(--border)] p-2 @min-[700px]/lc:p-2.5"
      >
        <OrderbookLadder
          variant="chaser"
          quote={quote ?? EMPTY_LADDER_QUOTE}
          depth={10}
          isStale={isStale}
          basePrice={basePrice}
          upperLimit={upperLimit}
          recentTrades={tape}
          onPriceSelect={handlePriceSelect}
        />
        {/*
          체결 수량 색의 근거(UI-SPEC §호가·체결). **3단 표 밴드에서만** 이 줄을 둔다 — 2단·1단
          트리는 사다리 아래 compact 체결 테이프가 같은 근거 문장을 이미 달고 있어, 여기서도
          그리면 같은 말이 두 줄로 선다(브라우저 실측).
        */}
        <p className="m-0 mt-1 hidden text-[11px] leading-snug text-[var(--muted-fg)] @min-[830px]/lc:block">
          수량 색(빨강 매수 · 파랑 매도)은 거래소 체결구분 기준이에요
        </p>
      </div>
      <div data-slot="card-body-options" className="min-w-0 p-2 @min-[700px]/lc:p-2.5">
        <ManualOrderEntry
          options={options}
          form={form}
          keyLabel={key !== '' ? key : `${isin}:${accountNo}:${exchange}`}
          onOptionsTab={setOptionsTab}
        />
      </div>
    </div>
  );
}
