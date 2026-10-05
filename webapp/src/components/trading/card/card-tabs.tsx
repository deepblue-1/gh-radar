"use client";

/**
 * CardTabs — 펼친 전략 카드 본문 상단 「정보 | 미체결 N | 잔고 N」 교체 탭 + 오른쪽 「주문로그」 · 「전략로그」 버튼
 * (quick-260923-onn · 2026-09-23 목업 ②A · quick-260930-lq5 로그 탭 두 개 → 버튼 + 한 종목 팝업).
 *
 * ① 무엇을 그리는가
 *   종전 `QuoteGrid10` 자리에 탭 줄(24px · 선택 알약 `--pill-on-*` — 공용 패널 탭 문법의 얇은 판)이 서고,
 *   기본 탭 「정보」가 기존 10칸 그대로다. 본문은 **모든 탭 공통 고정 높이 = 정보 탭 3줄**(≈72px)
 *   · 넘치면 세로 스크롤(quick-260925-ptw → 260925 후속 사용자 결정 「카드 탭 높이는 다 같아야 한다 ·
 *   정보탭 기준 3줄」). 탭을 바꾸거나 목록이 비어도 카드 높이가 변하지 않는다. 표 탭은 이 높이에서
 *   머리 1 + 데이터 1행쯤이 보이고 나머지는 스크롤이다. 빈 상태는 `dense` 로 이 높이 안에 든다.
 *   본문 공통 고정 높이 안의 탭별 모양: 정보 = 10칸 3줄 · 미체결/잔고 = 표(머리 + 1행쯤).
 *   탭 줄 오른쪽 = [주문로그][전략로그][접기](목업 ① · ⑧). 접기 버튼이 본문을 접는다 — 접혀도 탭 알약(건수 포함)과
 *   버튼은 보인다. 「미체결」·「잔고」는 **이 카드 종목·거래소·계좌로 자른** 계좌 상태다. 건수 괄호는 0 이면 생략.
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
 *   ★ 펼친 상태에서 **이미 선택된 탭을 다시 누르면 접는다**(접기 버튼과 같은 동작 · 선호 true 저장 —
 *     2026-09-26 사용자 요청). 다른 탭을 누르면 전환만 한다.
 *   ★ 로그 버튼은 탭 알약이 아니다 — 접힘 · 탭 재클릭 규칙과 무관하게 팝업만 연다.
 *   ★ 저장된 카드 탭 값은 없다(접힘만 저장) — 탭 값이 줄어도(`orderlog` · `log` 제거) 저장값 가드가 필요 없다.
 *
 * ⑥ 반응형은 카드의 `@container/lc` 가 잰다 — 뷰포트 브레이크포인트도, 새 `@container` 선언도
 *   두지 않는다(D-28). 로그 팝업은 body 포털 오버레이라 이 규율 밖이다(card-log-popups ④).
 *
 * ⑦ 탭 요청 통로 (quick-260923-pgu · 목업 ③A) — 작업대 이벤트 알림을 누르면 그 카드의 맞는 탭으로
 *   간다. 요청은 `{ tab, seq }` 이고 **`seq` 가 바뀔 때만** 이긴다 — 사용자 클릭은 그대로 로컬 state
 *   다(⑤). 이 컴포넌트는 카드를 처음 펼칠 때 마운트되므로 새로 펼쳐지는 카드는 마운트 효과로 요청을
 *   소비한다. VI · 돌파 알림은 이제 「정보」 탭을 연다 — 로그 팝업을 자동으로 열지 않는다(`alertTabFor` · lq5 D6).
 *
 * ⑧ 「주문로그」 · 「전략로그」 버튼 + 팝업 — card-log-popups.tsx · quick-260930-lq5 D1~D5
 *   - 데이터는 작업대 공용 피드 하나(`orderLogFeed` — strategy-card 가 넘긴다) — 카드마다 조회하지 않는다.
 *     피드가 없으면(작업대 밖 렌더) 버튼 자체가 없다.
 *   - 범위 = 카드 계좌의 주문 이벤트 + 시세 이벤트, 둘 다 그 종목 · 그 거래소만(`inScope`). 제목 · 범위의 종목 ·
 *     거래소 · 표시명은 이 컴포넌트가 받은 `isin` · `exchange` · `stockName` 하나다.
 *   - 배지 = 팝업이 닫혀 있는 동안 도착한 범위 안 푸시 수 · 열면 0.
 *   - 전략로그 = 카드 훅의 로그(`log`) 그대로 · 버튼은 늘 있고 배지가 없다.
 *
 * ⑨ 네 번째 탭 「상한가」 (Phase 28 · 28-01 · D-01~D-04 · UI-SPEC ①) — 85 상한가 특징 3줄 9칸 표(`LimitFeatureTable`).
 *   - 순서 「정보 · 미체결 · 잔고 · 상한가」. 본문은 같은 공통 고정 높이 안이라 탭을 바꿔도 카드 높이가 같다(D-02).
 *   - 트리거 접미(D-04 — 건수 괄호와 같은 자리 문법): lock 1 「 · 잠김 {dur}」(`--up` — 선택 알약 안에서도 유지) ·
 *     lock 2 「 · 깨짐」 · 그 밖 접미 없음. 탭 제목에는 「째」 를 붙이지 않는다.
 *   - **자동 전환 없음** — 85 가 와도 · 잠김으로 바뀌어도 활성 탭은 사용자가 고른 탭 그대로다(`alertTabFor` 도
 *     `"limit"` 을 돌려주지 않는다).
 *   - `limitFeature` 는 카드가 level `"full"` 일 때만 값이다(strategy-card — 접힌 카드는 85 를 받지 않는다 · D-05).
 */

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import type {
  RelayAccountState,
  RelayExchange,
  RelayLimitFeatureMsg,
  RelayOrderResultMsg,
  RelayQuote,
  RelayUnfilled,
} from "@gh-radar/shared";
import { limitFeatureTabSuffix } from "@gh-radar/shared";

import { AccountPanel, type AccountRowOrigin } from "@/components/orderbook/account-panel";
import { CardOrderLogPopup, CardStrategyLogPopup } from "@/components/trading/card/card-log-popups";
import { LimitFeatureTable } from "@/components/trading/card/limit-feature-table";
import { QuoteGrid10 } from "@/components/trading/card/quote-grid-10";
import type { StrategyLogEntry } from "@/components/trading/strategy-log";
import { nextUnfilledSelection } from "@/components/trading/workbench/shared-panels";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { readPanelsPref, writePanelsPref } from "@/lib/trading-layout";
import type { OrderLogFeed } from "@/lib/use-order-log-feed";
import { cn } from "@/lib/utils";
import type { RelayStatus } from "@/lib/use-relay-socket";

export type CardTab = "info" | "unfilled" | "holdings" | "limit";

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
  /** 카드 종목 · 거래소 · 표시명 — 로그 팝업 제목 · 범위의 한 진실(⑧). */
  isin: string;
  exchange: RelayExchange;
  stockName: string;
  /** 작업대 공용 주문로그 피드(⑧) — 없으면(작업대 밖) 주문로그 버튼 없음. */
  orderLogFeed?: OrderLogFeed;
  /**
   * 자기 키의 마지막 85 상한가 특징(⑨). 카드 level 이 `"full"` 이 아니면 null 이다 — 9칸 「—」 · 제목 「상한가」.
   */
  limitFeature: RelayLimitFeatureMsg | null;
  /** relay 접속 끊김(stale). 28-07 이 「상한가」 표 · 탭 제목 접미 표기에 쓴다 — 지금은 전달만 한다. */
  isStale?: boolean;
}

/** 공용 패널 `TAB_TRIGGER` 와 같은 문법 — 카드 안이라 더 얇게 24px(h-6). */
const CARD_TAB_TRIGGER =
  "h-6 flex-none gap-1 rounded-full border border-transparent px-2 text-[11px] font-semibold whitespace-nowrap text-[var(--muted-fg)] shadow-none " +
  "data-[state=active]:bg-[var(--pill-on-bg)] data-[state=active]:text-[var(--pill-on-fg)] data-[state=active]:shadow-none " +
  "dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-[var(--pill-on-bg)] dark:data-[state=active]:text-[var(--pill-on-fg)]";

/*
  탭 본문 공통 높이 = 정보 탭 3줄 — `QuoteGrid10` 칸(11px × --lh-normal + py 3px×2) 3개 + 격자 위 py-1(4px)
  ≈ 71.5px. 정보 칸 문법(글꼴·패딩)을 바꾸면 여기도 같이 바꾼다.
*/
const CARD_TABS_BODY_H = "h-[calc(3*(11px*var(--lh-normal)+6px)+4px)]";

/**
 * 「상한가」 트리거 접미(⑨ · D-04) — 「 · 잠김 43초」 / 「 · 깨짐」. 85 없음 · 미도달이면 아무것도 그리지 않는다.
 * 색은 자식 span 에 둔다 — 선택 알약의 활성 글자색(`--pill-on-fg`)이 「잠김 …」 의 `--up` 을 덮지 않게.
 */
function LimitFeatureTabTitle({ feature }: { feature: RelayLimitFeatureMsg | null }) {
  const suffix = limitFeatureTabSuffix(feature);
  if (suffix === null) return null;
  // 앞 공백은 span 밖 텍스트 노드로 둔다 — span 첫 글자 공백은 접근 이름 계산에서 잘려 「상한가· 잠김」 이 된다.
  return (
    <>
      {" "}
      <span data-slot="card-tab-limit-state">
        {"· "}
        <span className={suffix.tone === "up" ? "mono text-[var(--up)]" : undefined}>{suffix.text}</span>
      </span>
    </>
  );
}

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
  isin,
  exchange,
  stockName,
  orderLogFeed,
  limitFeature,
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
  /**
   * 누르기 시작한 순간 그 탭이 이미 활성이었나(⑤). Radix 는 mousedown/Enter·Space 에서 값을 바꾸고
   * click 은 그 재렌더 뒤에 오므로, click 시점의 `tab` 으로는 「원래 활성」을 알 수 없다 — 우리 핸들러가
   * Radix 보다 먼저 불리는 pointerdown/keydown 에서 기록한다.
   */
  const pressedActiveRef = useRef(false);
  const markPress = useCallback(
    (value: CardTab) => {
      pressedActiveRef.current = value === tab;
    },
    [tab],
  );
  /**
   * 탭 클릭 — 접혀 있으면 펼친다(활성 탭 재클릭 포함 — Radix `onValueChange` 가 안 불린다).
   * 펼쳐져 있고 이미 활성이던 탭을 다시 눌렀으면 접는다.
   */
  const onTabClick = useCallback(() => {
    const pressedActive = pressedActiveRef.current;
    pressedActiveRef.current = false;
    if (folded) setFoldedPref(false);
    else if (pressedActive) setFoldedPref(true);
  }, [folded, setFoldedPref]);
  const triggerHandlers = (value: CardTab) => ({
    onPointerDown: () => markPress(value),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") markPress(value);
    },
    onClick: onTabClick,
  });
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
          <TabsTrigger value="info" className={CARD_TAB_TRIGGER} {...triggerHandlers("info")}>
            정보
          </TabsTrigger>
          <TabsTrigger value="unfilled" className={CARD_TAB_TRIGGER} {...triggerHandlers("unfilled")}>
            미체결
            <CountBadge count={unfilledCount} />
          </TabsTrigger>
          <TabsTrigger value="holdings" className={CARD_TAB_TRIGGER} {...triggerHandlers("holdings")}>
            잔고
            <CountBadge count={holdingCount} />
          </TabsTrigger>
          <TabsTrigger value="limit" className={CARD_TAB_TRIGGER} {...triggerHandlers("limit")}>
            상한가
            <LimitFeatureTabTitle feature={limitFeature} />
          </TabsTrigger>
        </TabsList>
        {orderLogFeed !== undefined && (
          <CardOrderLogPopup
            feed={orderLogFeed}
            accountNo={accountNo}
            isin={isin}
            exchange={exchange}
            stockName={stockName}
          />
        )}
        <CardStrategyLogPopup entries={log} stockName={stockName} exchange={exchange} />
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
        본문 — 모든 탭 공통 고정 높이(정보 탭 3줄 · ①). 넘치면 세로 스크롤, 가로 넘침은 안쪽 표 래퍼
        (`account-embed-scroll` · `.tbl-wrap`)가 맡는다.
      */}
      <div
        id={bodyId}
        data-slot="card-tabs-body"
        hidden={folded}
        className={cn(CARD_TABS_BODY_H, "min-w-0 overflow-y-auto")}
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
        <TabsContent value="limit" className="h-full min-w-0">
          <LimitFeatureTable feature={limitFeature} />
        </TabsContent>
      </div>
    </Tabs>
  );
}
