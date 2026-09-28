'use client';

/**
 * CardBody — 전략 카드 본문 (Phase 18 D-12 · D-19 · D-23 · D-24 · D-28, TRADE-07/09).
 *
 * ① 무엇인가
 *   **좌 호가(+최근 체결) | 우 옵션 세팅 4그룹 + 적응형 수동주문.** 어느 밴드에서도 세로 스택이
 *   없다 — 좁아지면 두 칸의 폭이 줄 뿐 좌우 배치는 그대로다(D-12). 좌 pane 이 오른쪽 테두리를 갖는다.
 *   작업대 카드(`strategy-card.tsx` 의 `body` 렌더 prop)가 쓴다 — 카드 한 표면(D-31). 옛 종목상세 호가 탭도
 *   이 본문을 썼지만(D-24) Phase 21 D-31 로 탭이 사라져 표면 구분(`variant`)과 호가 탭 전용 각주도 지웠다
 *   (21-34). 시간외종가 신규 주문은 카드 수동주문 주문유형이 맡는다(21-33 · G-21-R3-10).
 *
 * ② ★ 밴드는 **카드(탭 본문) 폭**이다 — 뷰포트가 아니다 (D-28)
 *   여기 쓰는 `@min-[Npx]/lc:` 는 가장 가까운 `@container/lc` 조상(카드 래퍼)의
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
 *   ★ 예외 하나 — 호가 단위 잠금 강도(`useTickRule`, D-15a)는 여기서 읽는다. 상따 폼과 수동주문 폼이
 *     **같은 분류 값**을 받는다 — 폼별로 갈라지지 않는다. 종목 마스터를 읽기만 하는 조회다(`lib/tick-rule.ts`).
 *
 * ⑥ ★ 상따 설정에는 더티 바가 없다 (Phase 20 D-04)
 *   옵션 폼은 값 하나를 확정하면 그 한 필드가 곧 전송 1회다 — 더티 누적 · 「수정/되돌리기」 바 ·
 *   종목명 바 문구 · FAB 비켜 가기 클래스를 이 본문에서 걷었다. 카드 상태의 `dirtyCount` 는 폼이
 *   더 이상 보고하지 않아 늘 0 이고, 워크벤치 배관(카드 더티 호스트 · 테두리 · 이탈 경고)은 그래서
 *   스스로 비활성이다(수정하지 않았다). VI 설정 줄의 「수정」은 별개 표면이다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  RelayExchange,
  RelayLimitChaser,
  RelayQueuedWindowMsg,
  RelayQuote,
  RelayUnfilled,
} from '@gh-radar/shared';

import { OrderbookLadder } from '@/components/orderbook/orderbook-ladder';
import type { PriceSelection } from '@/components/orderbook/order-panel';
import { latchLedStateOf } from '@/components/trading/latch-led';
import { LimitChaserForm } from '@/components/trading/limit-chaser-form';
import {
  ManualOrderEntry,
  ManualOrderForm,
} from '@/components/trading/card/manual-order-form';
import type { StrategyCardState } from '@/components/trading/card/strategy-card';
import { isLegacyBuySchema } from '@/lib/limit-chaser';
import type { RelayStatus } from '@/lib/use-relay-socket';
import { useTickRule } from '@/lib/tick-rule';
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

/** 카드 제목 옆 상태 문구 6개 — UI-SPEC §11 상태 문구 표(Phase 24). 키는 `lc-fields.ts` `LcStatusKey`. */
export interface CardGroupStatus {
  buy: string;
  preBuy: string;
  extraBuy: string;
  postBuy: string;
  sell: string;
  cancel: string;
}

/** D-15 — 후매수 발동(단계 2) 중인 매도 · 취소 카드 상태 꼬리. 행 값에는 따로 표시하지 않는다. */
const POST_BUY_FIRED_TAIL = ' · 후매수 발동';

/**
 * WR-02 — 구서버 에코(`isLegacyBuySchema`)의 매수주문 카드 상태. 구서버는 buy3 그룹(선 · 추가 · 후매수)을
 * 모른다 — 마스터 하나로 실제 매수 감시 중일 수 있어 「켜짐 · 켠 매수 없음」은 거짓이다. 이 전략에 할 수 있는
 * 일은 끄기뿐이라(24-12 `lcLegacyBlockOf`) **읽기 전용 사실이 먼저**다 — 마스터 ON/OFF 와 무관하게 이 한 줄.
 */
export const LC_LEGACY_BUY_STATUS = '구서버 전략 · 끄기만 가능';

/**
 * 서버 에코 → 카드 상태 문구 (**순수 함수** · UI-SPEC §11 표 — 위에서부터 첫 일치).
 *
 * ★ 판정 입력은 **서버 에코 하나**다(D-27 · T-24-16) — 폼 더티값 · 스위치 표시값을 읽지 않는다.
 * ★ 매수주문 = 구서버 전략 · 끄기만 가능(구서버 에코 — `isLegacyBuySchema` · WR-02 · 마스터 무관 · 맨 앞) /
 *   꺼짐 / 보유중(`postBuyPhase === 2`) / 켜짐 · 켠 매수 없음(세 그룹 에코 OFF ∧ 마스터 ON —
 *   D-02 후반 가드로 자동 마스터 끔을 보내지 않았거나 그 제출이 나가 있는 잠깐) / 감시 중.
 *   「보유중」을 「무장 · 대기」로 읽던 옛 매핑(Pitfall 13)과 발주 완료 문구는 은퇴했다 — 마스터는 발주로
 *   접히지 않고, 선 · 추가매수가 발주로 꺼진 사실은 서버 사유 줄이 말한다.
 * ★ 매도 · 취소 래치 단계(대기 ↔ 감시)는 `latchLedStateOf`(17-07)가 소유한다 — LED 칩과 상태 문구가 같은
 *   무장을 서로 다르게 말하지 않는다. 후매수 발동 중이면 꺼지지 않은 두 카드에 꼬리(D-15).
 */
export function cardGroupStatusOf(server: RelayLimitChaser | null): CardGroupStatus {
  const s = server;
  const stage = (kind: 'sell' | 'cancel') =>
    latchLedStateOf(kind, s).tone === 'armed' ? '감시 중' : '무장 · 대기';
  const holding = s?.postBuyPhase === 2;
  const tail = (text: string) => (holding && text !== '꺼짐' ? `${text}${POST_BUY_FIRED_TAIL}` : text);

  const noBuyGroup = !s?.preBuyEnabled && !s?.extraBuyEnabled && !s?.postBuyEnabled;
  const buy = isLegacyBuySchema(s)
    ? LC_LEGACY_BUY_STATUS
    : !s?.buyEnabled
      ? '꺼짐'
      : holding
        ? '보유중'
        : noBuyGroup
          ? '켜짐 · 켠 매수 없음'
          : '감시 중';
  const postBuy =
    s?.postBuyPhase === 3 ? '소진' : holding ? '보유중' : s?.postBuyEnabled === true ? '감시 중' : '꺼짐';
  return {
    buy,
    preBuy: s?.preBuyEnabled === true ? '감시 중' : '꺼짐',
    extraBuy: s?.extraBuyAbandoned === true ? '포기' : s?.extraBuyEnabled === true ? '감시 중' : '꺼짐',
    postBuy,
    sell: tail(s?.sellEnabled === true ? stage('sell') : '꺼짐'),
    cancel: tail(latchLedStateOf('cancel', s).tone === 'off' ? '꺼짐' : stage('cancel')),
  };
}

export interface CardBodyProps {
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
  /**
   * 시간외종가 「참고 종가」 덮어쓰기. 넘기지 않으면 이 카드 시세의 KRX 정규장 종가(`quote.kc > 0`)를 쓴다 —
   * 옛 호가 탭이 넘기던 값과 같은 원천이다(D-31 로 탭이 사라져 카드가 스스로 읽는다 · 21-34).
   */
  referenceClose?: number | null;
  /** 미체결 표에서 선택된 원주문(D-21) — 선택은 상위가 소유한다. */
  selectedUnfilled?: RelayUnfilled | null;
  onClearSelection?: () => void;
  className?: string;
}

export function CardBody({
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
    resetSeq,
    liveSeed,
    answerSeq,
    unacked,
    handleSent,
    handleServerEcho,
    pushClientLog,
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
  // 시간외종가 「참고 종가」(스케치 008 ③ — 가격 잠김 · 참고 종가). `kc > 0` 하나가 「종가 확정」 신호다(벽시계 아님).
  const closeRef = referenceClose ?? (quote !== null && quote.kc > 0 ? quote.kc : null);
  const groups = cardGroupStatusOf(server);
  // D-15a — 종목 분류 → 호가 단위 잠금 강도. 조회 중(`undefined`)은 주식 잠금 그대로다.
  const tickRule = useTickRule(isin);

  const options = (
    <LimitChaserForm
      /* remount 키 — 옛 화면과 같다(삭제 에코 `resetSeq` · 실시간 상한가 재시딩 `liveSeed`). */
      key={`${isin}|${accountNo}|${exchange}|${resetSeq}|${liveSeed}`}
      isin={isin}
      accountNo={accountNo}
      exchange={exchange}
      server={server}
      upperLimit={upperLimit}
      // D-17 상장주식수 시딩 원천 — 호가 프레임 `ls` 하나. 모르면(없음 · 0) 0 → 폼은 폴백을 유지하고 뒤 프레임을 기다린다.
      listShares={quote !== null && quote.ls > 0 ? quote.ls : 0}
      disabled={isin === '' || accountNo === '' || status !== 'ready'}
      groupStatus={groups}
      serverAnswerSeq={answerSeq}
      // Phase 20 — 필드 확정 실패 판정(3초 무응답)은 상태줄 「미반영」과 **같은 신호**다(UI-SPEC A10).
      unacked={unacked}
      // 20-03 시트 칩 「현재가」 원천 — 시세가 없거나 0 이면 0(칩 비활성).
      currentPrice={quote !== null && quote.p > 0 ? quote.p : 0}
      tickRule={tickRule}
      onSent={handleSent}
      onServerEcho={handleServerEcho}
      // D-36 판정 입력 — 호가 매수1호가. 호가 미수신 · 0 이면 0(허용 — 상한가로 치환하지 않는다).
      bestBid={quote !== null && quote.bp[0] > 0 ? quote.bp[0] : 0}
      // D-36 판정 입력 — 호가 매수1잔량. 미수신 · 0 이면 0(허용).
      bestBidQty={quote !== null && quote.bq[0] > 0 ? quote.bq[0] : 0}
      // 클라 합성 로그 통로(D-36) — 카드 전략 로그로 흐른다.
      onClientLog={pushClientLog}
      tab={optionsTab}
      hideTabs
    />
  );

  const form = (
    <ManualOrderForm
      isin={isin}
      code={code ?? ''}
      name={displayName}
      accountNo={accountNo}
      exchange={exchange}
      queuedWindow={queuedWindow}
      status={status}
      selectedPrice={selectedPrice}
      referenceClose={closeRef}
      // 20-06 — 수동주문 시트 칩 「현재가」「상한가」 · 인라인 가격 검증(D-15). 같은 카드의 단일
      // isin/exchange 시세다(T-18-48) — 시세가 없거나 0 이면 0(칩 비활성 · 상한 검사 생략).
      currentPrice={quote !== null && quote.p > 0 ? quote.p : 0}
      upperLimit={upperLimit}
      tickRule={tickRule}
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
      className={cn(
        'grid min-w-0 grid-cols-[42%_minmax(0,1fr)] [&>*]:min-w-0',
        '@min-[700px]/lc:grid-cols-[260px_minmax(0,1fr)]',
        '@min-[830px]/lc:grid-cols-[400px_minmax(0,1fr)]',
        '@min-[992px]/lc:grid-cols-[460px_minmax(0,1fr)]',
        'border-t border-[var(--border-subtle)]',
        className,
      )}
    >
      <div
        data-slot="card-body-orderbook"
        className="min-w-0 border-r border-[var(--border-subtle)] p-2 @min-[700px]/lc:p-2.5"
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
