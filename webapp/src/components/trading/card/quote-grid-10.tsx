"use client";

/**
 * QuoteGrid10 — 종목정보 **10칸** (D-11 · TRADE-09).
 *
 * 옛 상따 화면(`limit-chaser-client.tsx`) 헤더 카드 아래의 `lc-quote-grid` 를 **그대로 옮긴**
 * 컴포넌트다. 라벨 10개(기준 · 시가 · 고가 · 저가 · 상한 · 하한 · 상승VI · 거래 · 시총 ·
 * 발행1%)도, 색 규칙도, 밴드별 `order` 번호도 한 글자 바꾸지 않았다 — 같은 값이 카드·호가 탭
 * 어디서든 **같은 컴포넌트가 같은 문자열**로 그려야 하기 때문이다.
 *
 * ★ 배치는 §2.2b 밴드를 **카드 폭 기준**으로 산다(`@min-[Npx]/lc:`). `lc` 컨테이너 선언은
 *   18-06 에서 페이지 본문에서 카드 래퍼(`strategy-card.tsx`)로 옮겨졌다 — 이 파일의
 *   유틸리티는 선언 위치와 무관하게 「가장 가까운 `lc` 조상」을 잰다. 밴드 표와 경계 셋의
 *   실측 근거는 `webapp/src/styles/globals.css` §2.2b 가 정본이다. 여기에 복사하지 마라.
 * ★ 숫자 포맷은 `lib/quote-format.ts` 헬퍼를 그대로 쓴다. 카드 전용 포맷 함수를 만들지
 *   않는다 — 같은 값이 카드·스트립·표에서 다른 문자열이 되면 안 된다.
 */

import type { RelayQuote } from "@gh-radar/shared";

import {
  formatMarketCap,
  formatOnePercentShares,
  formatTradeValue,
} from "@/lib/quote-format";
import { cn } from "@/lib/utils";

const KRW = new Intl.NumberFormat("ko-KR");

export interface QuoteGrid10Props {
  /** 자기 키로 구독한 실시간 호가 프레임. 아직 안 왔으면 `null`. */
  quote: RelayQuote | null;
  /**
   * 가격 4값의 호출부 결정값 — 넘기지 않으면 `quote` 의 값(없으면 0)을 쓴다.
   *
   * 옛 상따 화면은 실시간 프레임이 오기 전 REST 상세값으로 이 넷을 메운다(「실시간이 오면
   * 그쪽이 이긴다」). 그 폴백 판단은 **호출부의 것**이라 여기서 다시 하지 않는다 — 두 곳에서
   * 판단하면 사다리·폼과 10칸이 서로 다른 상한가를 말하게 된다.
   */
  basePrice?: number;
  upperLimit?: number;
  lowerLimit?: number;
  currentPrice?: number;
}

export function QuoteGrid10({
  quote,
  basePrice: basePriceProp,
  upperLimit: upperLimitProp,
  lowerLimit: lowerLimitProp,
  currentPrice: currentPriceProp,
}: QuoteGrid10Props) {
  const basePrice = basePriceProp ?? quote?.base ?? 0;
  const upperLimit = upperLimitProp ?? quote?.ul ?? 0;
  const lowerLimit = lowerLimitProp ?? quote?.ll ?? 0;
  const currentPrice = currentPriceProp ?? quote?.p ?? 0;
  /**
   * KRX 정규장 종가(`QuoteState.krx_close_price`). **오늘 종가가 아니면 `0`** 이다 (D-11).
   *
   * ★ 스냅샷 props 로 폴백하지 않는다 — `0` 은 「아직 안 왔다」가 아니라 「오늘 종가가
   *   아니다」라는 **서버의 답**이라, 다른 출처로 메우면 없는 사실을 지어내는 것이 된다.
   * ★ **벽시계로 판정하지 않는다.** 「지금이 장 마감 뒤인가」를 클라가 계산해 라벨을 바꾸면
   *   서버 진실과 갈린다 — 이 갈래에 현재 시각·장 시간 상수를 들이지 말 것.
   *   (`stock-orderbook-section` 이 17-08 에서 같은 규칙을 먼저 적용했다.)
   */
  const closePrice = quote?.kc ?? 0;

  /*
    종목정보 **10칸** — 본문 폭 3밴드 배치다 (260912-k2x · 목업 `260912-chaser-breakpoints.html`).
      폰(~699)        : 2열 5행
      컴팩트·와이드(700~991) : **5열 2행** — 윗줄은 일중 가격, 아랫줄은 경계와 규모
      데스크톱(992~)  : 한 줄 가로 나열(`flex-wrap` — 넘치면 잘리지 않고 다음 줄로 흐른다)
    ★ 18-06 부터 「본문 폭」은 **카드 폭**이다 — `@container/lc` 가 카드 래퍼로 이동했다.
    ★ 배치 분기는 **CSS 로만** 한다 — 같은 10칸이 클래스만 갈아입고, 배열도 JSX 도 한
      벌이다. 두 벌로 렌더하면 언젠가 한쪽만 고쳐지고 그때 사용자는 폭에 따라 다른
      숫자를 본다(T-k2x-02). 뷰포트 폭을 JS 로 재는 훅도 두지 않는다 — SSR 과 첫
      페인트에서 배치가 튄다.
    ★ 5열 배치의 **순서 차이도 CSS `order` 하나로만** 낸다. 배열을 두 벌로 내면 같은
      함정이 순서 쪽에서 다시 열린다. 그래서 10칸 **전부**가 700 밴드의 `order` 를 갖고
      992 에서 전부 0 으로 돌아온다 — 일부만 붙이면 값이 없는 칸(`order:0`)이 지정한
      칸보다 **앞**으로 몰린다.
    ★ 데스크톱 `gap-x-[20px]` · `px-3.5`(14px) · `py-2`(8px) 는 목업 정본과 동형이다
      (칸이 8 → 10 으로 늘어 가로 예산이 2px 좁아졌다). `flex` 가 켜지면 `grid-cols-*`
      는 무시되므로 따로 해제하지 않는다.
    ★ 값의 원천은 **이미 구독으로 오는 `RelayQuote` 프레임 하나뿐**이다 — `기준`(`base`)·
      `거래`(`va`) 도 그 프레임의 필드라 새 API·새 조회 경로가 0개다.
    ★ 값이 0 이거나 아직 안 왔으면 `—` 다 — 0 을 그리면 그 숫자로 매도 판단이 이뤄진다.
      스켈레톤·「불러오는 중」으로 위장하지 않는다(E8 loading).
  */
  return (
    <div
      data-slot="lc-quote-grid"
      className="grid grid-cols-2 border-t border-[var(--border-subtle)] py-1 @min-[700px]/lc:grid-cols-5 @min-[992px]/lc:flex @min-[992px]/lc:flex-wrap @min-[992px]/lc:items-baseline @min-[992px]/lc:gap-x-[20px] @min-[992px]/lc:gap-y-0 @min-[992px]/lc:px-3.5 @min-[992px]/lc:py-2"
    >
      {/*
        ★ `기준` 의 방향색은 **자기 자신과의 비교**라 언제나 보합이다. 새 분기를 만들지
          않고 같은 `priceTone` 에 같은 값을 두 번 넘긴다 — 분기를 하나 더 만들면
          기준가 색 규칙이 두 곳이 되고, 언젠가 한쪽만 고쳐진다.
      */}
      <QuoteCell
        label="기준"
        value={priceText(basePrice)}
        tone={priceTone(basePrice, basePrice)}
        order="@min-[700px]/lc:order-[1] @min-[992px]/lc:order-[0]"
      />
      <QuoteCell
        label="시가"
        value={priceText(quote?.o ?? 0)}
        tone={priceTone(quote?.o ?? 0, basePrice)}
        order="@min-[700px]/lc:order-[2] @min-[992px]/lc:order-[0]"
      />
      <QuoteCell
        label="고가"
        value={priceText(quote?.h ?? 0)}
        tone={priceTone(quote?.h ?? 0, basePrice)}
        order="@min-[700px]/lc:order-[3] @min-[992px]/lc:order-[0]"
      />
      <QuoteCell
        label="저가"
        value={priceText(quote?.l ?? 0)}
        tone={priceTone(quote?.l ?? 0, basePrice)}
        order="@min-[700px]/lc:order-[4] @min-[992px]/lc:order-[0]"
      />
      <QuoteCell
        label="상한"
        value={priceText(upperLimit)}
        tone="text-[var(--up)]"
        order="@min-[700px]/lc:order-[6] @min-[992px]/lc:order-[0]"
      />
      {/*
        ★ `하한` 칸은 KRX 정규장 종가에 자리를 내준다 (17-11 / D-11 개정 · 사용자 결정
          2026-09-18 「헤더 배치 유지하고, 종가가 있을땐 하한가 대신에 종가를 보여줘」).
          판정 입력은 `quote.kc` **하나**이고 `kc > 0` 이 「종가가 확정됐다」의 유일한
          신호다 — `0` 도 **권위값**이라 같은 값이면 no-op 이다.
        ★ 갈리는 것은 **이 한 칸뿐**이다. 아래 `order` 배치 번호도, 칸 수(10)도, 다른
          9칸도 손대지 않는다 — §2.2b 밴드 실측값이라 바꾸면 밴드 배치가 통째로 밀린다.
        ★ 종가의 색은 다른 칸과 **같은 규칙**(기준가 대비 방향색)이다. 하한가의
          `--down` 고정색을 그대로 쓰면 기준가보다 오른 종가가 빨갛게 보인다.
        ★ NXT 프레임에도 **KRX 값**이 실려 온다(C# 동일). 거래소로 라벨을 갈라
          「NXT 종가」 같은 없는 사실을 지어내지 않는다.
      */}
      <QuoteCell
        label={closePrice > 0 ? "종가" : "하한"}
        value={priceText(closePrice > 0 ? closePrice : lowerLimit)}
        tone={
          closePrice > 0
            ? priceTone(closePrice, basePrice)
            : "text-[var(--down)]"
        }
        order="@min-[700px]/lc:order-[7] @min-[992px]/lc:order-[0]"
      />
      {/* 상승VI 는 발동가라 언제나 위쪽 사건이다 — 기준가 대비가 아니라 항상 `--up`. */}
      <QuoteCell
        label="상승VI"
        value={priceText(quote?.viu ?? 0)}
        tone="text-[var(--up)]"
        order="@min-[700px]/lc:order-[5] @min-[992px]/lc:order-[0]"
      />
      {/* 누적거래대금 — 스캐너의 `formatTradeAmount`(`133.4조`)와 **다른 함수**다. */}
      <QuoteCell
        label="거래"
        value={formatTradeValue(quote?.va ?? 0)}
        order="@min-[700px]/lc:order-[8] @min-[992px]/lc:order-[0]"
      />
      <QuoteCell
        label="시총"
        value={formatMarketCap(currentPrice, quote?.ls ?? 0)}
        order="@min-[700px]/lc:order-[9] @min-[992px]/lc:order-[0]"
      />
      <QuoteCell
        label="발행1%"
        value={formatOnePercentShares(quote?.ls ?? 0)}
        order="@min-[700px]/lc:order-[10] @min-[992px]/lc:order-[0]"
      />
    </div>
  );
}

/**
 * 종목정보 한 칸. **세 배치를 산다** (260912-k2x · 카드 폭 기준):
 *   - 폰(~699) 2열 5행 — 라벨 왼쪽 · 값이 `ml-auto` 로 칸의 오른쪽 끝. 라벨
 *     `min-w-[34px]` 가 2열에서 값의 좌측 끝을 맞춘다.
 *   - 컴팩트·와이드(700~991) 5열 2행 — 같은 칸 모양이고 **순서만** `order` 로 바뀐다.
 *   - 데스크톱(992~) 한 줄 가로 나열 — 「라벨 값」 인라인 쌍. 그래서 라벨 최소폭을 풀고
 *     (`min-w-0`) 값을 라벨 바로 옆에 붙인다(`ml-0`). 칸 패딩도 0 으로 돌린다: 칸 사이
 *     간격은 컨테이너의 `gap-x-[20px]` 가 담당하고, 둘 다 주면 20 + 20px 이 되어 한 줄에
 *     10칸이 들어가지 않는다.
 *
 * ★ 라벨 최소폭 34px 는 그대로다 — `기준`·`거래` 가 기존 최장 라벨보다 짧아 늘릴 이유가 없다.
 * ★ `order` 는 **완성된 문자열 리터럴**로 받는다. 템플릿 문자열로 숫자를 끼워 넣으면
 *   Tailwind 가 스캔하지 못해 클래스가 아예 생성되지 않고, 그러면 5열에서 순서가 DOM
 *   순서로 조용히 되돌아간다(에러가 아니라 잘못된 배치다).
 * ★ `data-slot`/`data-part` 는 테스트·e2e 조회구다 — 스타일에 쓰지 않는다.
 *
 * 색은 호출부가 정한다 — 이 칸은 포맷과 배치만 안다(`limit-up-format.ts` 와 같은 분리).
 */
function QuoteCell({
  label,
  value,
  tone,
  order,
}: {
  label: string;
  value: string;
  tone?: string;
  order?: string;
}) {
  return (
    <div
      data-slot="lc-quote-cell"
      className={cn(
        "flex items-baseline gap-1.5 px-2.5 py-[3px] text-[11px] @min-[992px]/lc:px-0 @min-[992px]/lc:py-0 @min-[992px]/lc:text-[12px]",
        order,
      )}
    >
      <span
        data-part="label"
        className="min-w-[34px] flex-none text-[var(--muted-fg)] @min-[992px]/lc:min-w-0"
      >
        {label}
      </span>
      <span
        data-part="value"
        className={cn(
          "mono ml-auto font-semibold whitespace-nowrap @min-[992px]/lc:ml-0",
          tone ?? "text-[var(--fg)]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** 가격 한 칸 — **0 은 「모른다」**이므로 대시다. 0 을 그리면 그 숫자로 판단이 이뤄진다. */
function priceText(value: number): string {
  return value > 0 ? KRW.format(value) : "—";
}

/**
 * 기준가 대비 방향색.
 *
 * ★ `orderbook-ladder.tsx` 의 `priceTone` 과 **동형**이다. 그쪽에서 import 하지 않는 이유는
 *   의존 방향이다 — 카드 조각이 사다리 컴포넌트의 색 유틸을 끌어오면 형제 조각끼리 의존하게
 *   된다. 규칙이 갈라지면 두 곳을 함께 고쳐라(판정식은 세 줄이다).
 */
function priceTone(value: number, base: number): string {
  if (value <= 0 || base <= 0 || value === base) return "text-[var(--flat)]";
  return value > base ? "text-[var(--up)]" : "text-[var(--down)]";
}
