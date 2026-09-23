"use client";

/**
 * CardTabs — 펼친 전략 카드 본문 상단 「정보 | 미체결 N | 잔고 | 로그 N」 교체 탭
 * (quick-260923-onn · 2026-09-23 목업 ②A).
 *
 * ① 무엇을 그리는가
 *   종전 `QuoteGrid10` 자리에 탭 줄(24px · 선택 accent — 공용 패널 탭 문법의 얇은 판)이 서고,
 *   기본 탭 「정보」가 기존 10칸 그대로다. 「미체결」·「잔고」는 **이 카드 종목·거래소·계좌로
 *   자른** 계좌 상태, 「로그」는 카드 훅의 전략 로그다. 배지는 미체결·로그만, 0 이면 생략.
 *
 * ② ★ 데이터는 슬라이스 하나 — 접힌 헤더 요약 칩과 같은 값
 *   `account` 는 `cardAccountSliceOf().account`(strategy-card 가 1회 파생)다. 헤더 칩 숫자 ·
 *   탭 배지 · 탭 본문이 같은 값을 읽는다(두 진실 금지). 새 조회 경로 0(T-16-02).
 *
 * ③ ★ 미체결 행 선택 = 공용 패널과 **같은 콜백 · 같은 상태 하나** (D-21)
 *   카드는 선택 상태를 갖지 않는다 — 작업대 `selectUnfilled` 를 받아 쓰고, 재선택 = 해제 토글은
 *   공용 패널과 같은 `nextUnfilledSelection` 하나다. 콜백이 없으면(카드 계좌 ≠ 상태줄 계좌)
 *   선택 UI 가 없다 — 취소는 카드 계좌로 여전히 된다.
 *   취소·선택 규율(확인 다이얼로그 · `row.isin` 키 · 결과 모름 잠금)은 `AccountPanel` 한 벌이다.
 *
 * ④ `originOf`/`onCancelSubmitted` 는 작업대가 공용 패널에도 오늘 넘기지 않는다 — 카드는 같은
 *   값을 받을 뿐 출처 판정을 지어내지 않는다.
 *
 * ⑤ 탭 상태는 **컴포넌트 state 뿐**이다 — 브라우저 저장 헬퍼를 쓰지 않는다(카드별 메모리).
 *   접었다 펴도 본문이 `hidden` 으로 남아(WR-02) 자연히 유지된다. 새로고침하면 정보 탭이다.
 *
 * ⑥ 반응형은 카드의 `@container/lc` 가 잰다 — 뷰포트 브레이크포인트도, 새 `@container` 선언도
 *   두지 않는다(D-28).
 */

import { useCallback, useState } from "react";
import type {
  RelayAccountState,
  RelayOrderResultMsg,
  RelayQuote,
  RelayUnfilled,
} from "@gh-radar/shared";

import { AccountPanel, type AccountRowOrigin } from "@/components/orderbook/account-panel";
import { QuoteGrid10 } from "@/components/trading/card/quote-grid-10";
import { StrategyLog, type StrategyLogEntry } from "@/components/trading/strategy-log";
import { nextUnfilledSelection } from "@/components/trading/workbench/shared-panels";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RelayStatus } from "@/lib/use-relay-socket";

export type CardTab = "info" | "unfilled" | "holdings" | "log";

export interface CardTabsProps {
  quote: RelayQuote | null;
  /** 카드 계좌 — 취소 요청의 계좌다(행이 이 계좌 상태에서 왔다). */
  accountNo: string;
  /** `cardAccountSliceOf().account` — 이미 이 카드 종목·거래소로 잘린 계좌 상태(②). */
  account: RelayAccountState | null;
  log: readonly StrategyLogEntry[];
  status: RelayStatus;
  /** 작업대 선택 상태에서 파생한 원주문번호(③). */
  selectedOrderNo: string | null;
  /** 작업대 `selectUnfilled`(③). 없으면 선택 UI 가 없다. */
  onSelectUnfilled?: (row: RelayUnfilled | null) => void;
  priceOf?: (isin: string) => number | undefined;
  originOf?: (row: RelayUnfilled) => AccountRowOrigin | undefined;
  onCancelSubmitted?: (res: RelayOrderResultMsg) => void;
}

/** 공용 패널 `TAB_TRIGGER` 와 같은 문법 — 카드 안이라 더 얇게 24px(h-6). */
const CARD_TAB_TRIGGER =
  "h-6 flex-none gap-1 rounded-[var(--r)] border border-transparent px-2 text-[11px] font-semibold whitespace-nowrap text-[var(--muted-fg)] shadow-none " +
  "data-[state=active]:bg-[var(--accent)] data-[state=active]:text-[var(--accent-fg)] data-[state=active]:shadow-none " +
  "dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-[var(--accent)] dark:data-[state=active]:text-[var(--accent-fg)]";

/** 미체결·잔고·로그 본문 래퍼 — 목업 `.tb`(높이 상한 210 · 넘치면 스크롤). */
const TAB_BODY = "max-h-[210px] min-w-0 overflow-auto";

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <>
      {" "}
      <span
        data-slot="card-tab-count"
        className="mono rounded-full bg-[color-mix(in_oklch,var(--fg)_8%,transparent)] px-1.5 text-[10px]"
      >
        {count}
      </span>
    </>
  );
}

export function CardTabs({
  quote,
  accountNo,
  account,
  log,
  status,
  selectedOrderNo,
  onSelectUnfilled,
  priceOf,
  originOf,
  onCancelSubmitted,
}: CardTabsProps) {
  const [tab, setTab] = useState<CardTab>("info");
  const unfilledCount = account?.unf.length ?? 0;
  const logCount = log.length;

  /** ③ — 토글 판정은 공용 패널과 같은 헬퍼 하나. */
  const handleSelect = useCallback(
    (row: RelayUnfilled) => onSelectUnfilled?.(nextUnfilledSelection(selectedOrderNo, row)),
    [onSelectUnfilled, selectedOrderNo],
  );

  return (
    <Tabs
      data-slot="card-tabs"
      value={tab}
      onValueChange={(v) => setTab(v as CardTab)}
      className="gap-0 border-t border-[var(--border-subtle)]"
    >
      <TabsList
        aria-label="카드 탭"
        className="h-auto min-w-0 justify-start gap-0.5 overflow-x-auto bg-transparent p-0 px-2 pt-1"
      >
        <TabsTrigger value="info" className={CARD_TAB_TRIGGER}>
          정보
        </TabsTrigger>
        <TabsTrigger value="unfilled" className={CARD_TAB_TRIGGER}>
          미체결
          <CountBadge count={unfilledCount} />
        </TabsTrigger>
        <TabsTrigger value="holdings" className={CARD_TAB_TRIGGER}>
          잔고
        </TabsTrigger>
        <TabsTrigger value="log" className={CARD_TAB_TRIGGER}>
          로그
          <CountBadge count={logCount} />
        </TabsTrigger>
      </TabsList>

      <TabsContent value="info" className="min-w-0">
        <QuoteGrid10 quote={quote} />
      </TabsContent>
      <TabsContent value="unfilled" className="min-w-0">
        <div className={TAB_BODY}>
          <AccountPanel
            selectedAccountNo={accountNo}
            account={account}
            status={status}
            section="unfilled"
            embedScope="stock"
            embedEmptyTitle="이 종목의 미체결이 없어요"
            selectedOrderNo={selectedOrderNo}
            onSelectUnfilled={onSelectUnfilled === undefined ? undefined : handleSelect}
            originOf={originOf}
            priceOf={priceOf}
            onCancelSubmitted={onCancelSubmitted}
          />
        </div>
      </TabsContent>
      <TabsContent value="holdings" className="min-w-0">
        <div className={TAB_BODY}>
          <AccountPanel
            selectedAccountNo={accountNo}
            account={account}
            status={status}
            section="holdings"
            embedScope="stock"
            embedEmptyTitle="보유 없음"
            priceOf={priceOf}
            onCancelSubmitted={onCancelSubmitted}
          />
        </div>
      </TabsContent>
      <TabsContent value="log" className="min-w-0">
        <div className={TAB_BODY}>
          <StrategyLog entries={log} variant="embed" emptyTitle="로그 없음" />
        </div>
      </TabsContent>
    </Tabs>
  );
}
