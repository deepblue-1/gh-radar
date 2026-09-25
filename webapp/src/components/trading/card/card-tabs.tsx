"use client";

/**
 * CardTabs — 펼친 전략 카드 본문 상단 「정보 | 미체결 N | 잔고 | 로그 N」 교체 탭
 * (quick-260923-onn · 2026-09-23 목업 ②A).
 *
 * ① 무엇을 그리는가
 *   종전 `QuoteGrid10` 자리에 탭 줄(24px · 선택 알약 `--pill-on-*` — 공용 패널 탭 문법의 얇은 판)이 서고,
 *   기본 탭 「정보」가 기존 10칸 그대로다. 본문은 네 탭 공통 고정 높이 4 × --row-h(머리 1 + 3줄)
 *   · 넘치면 세로 스크롤 — 탭을 바꾸거나 목록이 비어도 카드 높이가 변하지 않는다(quick-260925-ptw).
 *   탭 줄 오른쪽 끝 접기 버튼이 본문을 접는다 — 접혀도 탭 알약(건수 포함)은 보인다. 「미체결」·「잔고」는 **이 카드 종목·거래소·계좌로
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
 * ⑤ 탭 선택은 여전히 **컴포넌트 state 뿐**이다(카드별 메모리). 카드를 접었다 펴도 본문이
 *   `hidden` 으로 남아(WR-02) 자연히 유지된다. 새로고침하면 정보 탭이다.
 *   ★ **접힘**만 `readPanelsPref/writePanelsPref`(`cardTabsFolded`)로 기억해 새로 마운트되는 카드의
 *     기본값이 된다(이미 떠 있는 다른 카드는 자기 값을 유지) — quick-260925-ptw. 접힌 상태에서 탭을
 *     누르면 펼치고(선호 false 저장), 알림의 탭 요청(⑦)은 펼치기만 한다(선호 변경이 아니다).
 *
 * ⑥ 반응형은 카드의 `@container/lc` 가 잰다 — 뷰포트 브레이크포인트도, 새 `@container` 선언도
 *   두지 않는다(D-28).
 *
 * ⑦ 탭 요청 통로 (quick-260923-pgu · 목업 ③A) — 작업대 이벤트 알림을 누르면 그 카드의 맞는 탭으로
 *   간다. 요청은 `{ tab, seq }` 이고 **`seq` 가 바뀔 때만** 이긴다 — 사용자 클릭은 그대로 로컬 state
 *   다(⑤). 이 컴포넌트는 카드를 처음 펼칠 때 마운트되므로 새로 펼쳐지는 카드는 마운트 효과로 요청을
 *   소비한다.
 */

import { useCallback, useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
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
import { readPanelsPref, writePanelsPref } from "@/lib/trading-layout";
import { cn } from "@/lib/utils";
import type { RelayStatus } from "@/lib/use-relay-socket";

export type CardTab = "info" | "unfilled" | "holdings" | "log";

/** 탭 전환 요청(⑦) — `seq` 가 바뀔 때만 적용된다. */
export interface CardTabRequest {
  tab: CardTab;
  seq: number;
}

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
  /** 작업대 알림 클릭의 탭 요청(⑦). */
  requestedTab?: CardTabRequest;
}

/** 공용 패널 `TAB_TRIGGER` 와 같은 문법 — 카드 안이라 더 얇게 24px(h-6). */
const CARD_TAB_TRIGGER =
  "h-6 flex-none gap-1 rounded-full border border-transparent px-2 text-[11px] font-semibold whitespace-nowrap text-[var(--muted-fg)] shadow-none " +
  "data-[state=active]:bg-[var(--pill-on-bg)] data-[state=active]:text-[var(--pill-on-fg)] data-[state=active]:shadow-none " +
  "dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-[var(--pill-on-bg)] dark:data-[state=active]:text-[var(--pill-on-fg)]";


/** 탭 제목 뒤 건수 「미체결(2)」 — 0 이면 생략(2026-09-23 사용자 요청: 배지 대신 제목 괄호). */
function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span data-slot="card-tab-count" className="mono">
      ({count})
    </span>
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
  requestedTab,
}: CardTabsProps) {
  const [tab, setTab] = useState<CardTab>(requestedTab?.tab ?? "info");
  /**
   * 탭 영역 접힘(⑤). 카드를 처음 펼친 뒤에만 마운트되는 클라이언트 전용 조각이라 SSR 하이드레이션
   * 대상이 아니고(작업대 카드 집합은 마운트 후 효과에서 복원), 서버에서는 `readPanelsPref` 가 `{}`
   * 라 같은 값이 된다 — 첫 페인트 깜빡임(펼침→접힘 점프)을 피하려고 지연 초기화로 읽는다.
   */
  const [folded, setFolded] = useState(
    () => requestedTab === undefined && readPanelsPref().cardTabsFolded === true,
  );
  const bodyId = useId();
  const setFoldedPref = useCallback((next: boolean) => {
    setFolded(next);
    writePanelsPref({ cardTabsFolded: next });
  }, []);
  /** 접힌 상태에서 탭(활성 탭 재클릭 포함 — Radix `onValueChange` 가 안 불린다)을 누르면 펼친다. */
  const unfoldOnTab = useCallback(() => {
    if (folded) setFoldedPref(false);
  }, [folded, setFoldedPref]);
  // ⑦ — seq 가 바뀔 때만 요청이 이긴다(같은 요청 재렌더는 사용자 선택을 덮지 않는다).
  const reqSeq = requestedTab?.seq;
  const reqTab = requestedTab?.tab;
  useEffect(() => {
    if (reqTab === undefined) return;
    setTab(reqTab);
    setFolded(false); // 알림 클릭은 펼치기만 — 선호 변경이 아니라 저장하지 않는다(⑤).
  }, [reqSeq, reqTab]);
  const unfilledCount = account?.unf.length ?? 0;
  const holdingCount = account?.hold.length ?? 0;
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
      {/* 탭 줄 행 — 탭 알약 + 오른쪽 끝 접기 버튼. 접혔을 때만 아래 여백(알약이 경계선에 붙지 않게). */}
      <div
        data-slot="card-tabs-bar"
        className={cn("flex min-w-0 items-center gap-1 px-2 pt-1", folded && "pb-1")}
      >
        <TabsList
          aria-label="카드 탭"
          className="h-auto min-w-0 flex-1 justify-start gap-0.5 overflow-x-auto bg-transparent p-0"
        >
          <TabsTrigger value="info" className={CARD_TAB_TRIGGER} onClick={unfoldOnTab}>
            정보
          </TabsTrigger>
          <TabsTrigger value="unfilled" className={CARD_TAB_TRIGGER} onClick={unfoldOnTab}>
            미체결
            <CountBadge count={unfilledCount} />
          </TabsTrigger>
          <TabsTrigger value="holdings" className={CARD_TAB_TRIGGER} onClick={unfoldOnTab}>
            잔고
            <CountBadge count={holdingCount} />
          </TabsTrigger>
          <TabsTrigger value="log" className={CARD_TAB_TRIGGER} onClick={unfoldOnTab}>
            로그
            <CountBadge count={logCount} />
          </TabsTrigger>
        </TabsList>
        <button
          type="button"
          data-slot="card-tabs-fold"
          aria-expanded={!folded}
          aria-controls={bodyId}
          aria-label={folded ? "탭 펼치기" : "탭 접기"}
          title={folded ? "탭 펼치기" : "탭 접기"}
          onClick={() => setFoldedPref(!folded)}
          className="ml-auto inline-flex h-6 w-6 flex-none items-center justify-center rounded-[var(--r)] text-[var(--muted-fg)] hover:bg-[var(--muted)]"
        >
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-3.5 transition-transform duration-150 motion-reduce:transition-none",
              !folded && "rotate-180",
            )}
          />
        </button>
      </div>

      {/*
        본문 — 네 탭 공통 고정 높이 = 표 머리 1줄 + 데이터 3줄 ≈ 4 × --row-h(밀도 토큰을 따른다:
        기본 36 → 144 · 모바일 comfortable 44 → 176 · compact 32 → 128). 넘치면 세로 스크롤,
        가로 넘침은 안쪽 표 래퍼(`account-embed-scroll` · `.tbl-wrap`)가 맡는다(quick-260925-ptw).
      */}
      <div
        id={bodyId}
        data-slot="card-tabs-body"
        hidden={folded}
        className="h-[calc(var(--row-h)*4)] min-w-0 overflow-y-auto"
      >
        <TabsContent value="info" className="min-w-0">
          <QuoteGrid10 quote={quote} />
        </TabsContent>
        <TabsContent value="unfilled" className="min-w-0">
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
        </TabsContent>
        <TabsContent value="holdings" className="min-w-0">
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
        </TabsContent>
        <TabsContent value="log" className="min-w-0">
          <StrategyLog entries={log} variant="embed" emptyTitle="로그 없음" />
        </TabsContent>
      </div>
    </Tabs>
  );
}
