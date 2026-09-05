'use client';

import { useCallback, useRef, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * StockDetailTabs — Phase 15 Plan 11 · RELAY-01.
 *
 * 무엇:
 *   종목상세 `/stocks/[code]` 의 상단 4탭 셸. 히어로·갱신시각/새로고침 행(탭 밖 공통 영역)
 *   아래에서 `차트 · 호가주문 · 종목정보 · 뉴스토론` 패널을 전환하고, 활성 탭을 `?tab=` 으로
 *   URL 에 반영한다. 패널 내용은 전부 상위(`stock-detail-client`)에서 ReactNode 로 주입받는다.
 *
 * 계약 (D-02a · 15-UI-SPEC §확정 결정 T1~T7):
 *   T1 히어로·갱신행은 탭 밖 — 이 셸은 탭 바와 패널만 소유한다
 *   T2 탭 순서·라벨 고정. 라벨에 띄어쓰기 없음(모바일 390px 한 줄 배치)
 *   T3 `?tab=chart|orderbook|info|news`, 기본 `chart`, `router.push`(뒤로가기가 이전 탭으로)
 *   T4 탭 바 sticky
 *   T5 shadcn 공식 `tabs`(Radix) — ←/→ · Home/End 키보드는 Radix 기본 동작 상속
 *   T6 `호가주문` 패널만 넓은 컨테이너, 나머지 3탭은 `max-w-4xl`
 *
 * 하지 않는 것:
 *   - 탭 라벨에 연결 상태 점·배지를 붙이지 않는다 (T4 — 연결 상태는 `호가주문` 탭 안
 *     상태 바가 단독으로 소유한다)
 *   - 패널로 받은 기존 섹션의 내용을 수정하지 않는다 (T7 — 이 셸은 재배치 전용)
 *   - 탭별 스크롤 위치를 보존하지 않는다 (UI-SPEC §Interaction Contract — 단순성 우선)
 */

/** T2 — 순서·라벨 확정값. 변형 없음. */
const TABS = [
  { v: 'chart', label: '차트' },
  { v: 'orderbook', label: '호가주문' },
  { v: 'info', label: '종목정보' },
  { v: 'news', label: '뉴스토론' },
] as const;

type TabValue = (typeof TABS)[number]['v'];

const DEFAULT_TAB: TabValue = 'chart';

/**
 * T-15-37 (Tampering) — `?tab=` 은 사용자 제어 입력이다.
 * 화이트리스트 밖의 임의 문자열은 렌더 경로에 들어가지 못하고 전부 기본 탭으로 떨어진다.
 */
function toTabValue(raw: string | null): TabValue {
  return TABS.some((t) => t.v === raw) ? (raw as TabValue) : DEFAULT_TAB;
}

/** T6 — 3탭 공통 폭. `호가주문` 만 이 제한을 쓰지 않는다. */
const NARROW_PANEL = 'mx-auto w-full max-w-4xl pt-[var(--s-5)]';

export interface StockDetailTabsProps {
  code: string;
  chart: ReactNode;
  orderbook: ReactNode;
  info: ReactNode;
  news: ReactNode;
}

export function StockDetailTabs({
  code,
  chart,
  orderbook,
  info,
  news,
}: StockDetailTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabBarRef = useRef<HTMLDivElement>(null);

  // 딥링크 진입도 이 한 줄로 처리된다 — URL 이 단일 진실이라 별도 초기 state 가 없다.
  const active = toTabValue(searchParams.get('tab'));

  const handleValueChange = useCallback(
    (next: string) => {
      const value = toTabValue(next);
      // T3 — `replace` 가 아니라 `push`. 브라우저 뒤로가기가 이전 탭으로 돌아가야 한다.
      // `scroll:false` 로 Next 의 최상단 점프를 끄고, 아래에서 탭 바 기준으로 직접 맞춘다.
      router.push(`?tab=${value}`, { scroll: false });
      // 탭 바 바로 아래가 보이도록 스크롤(히어로는 지나간 상태). 탭별 스크롤 복원은 없다.
      tabBarRef.current?.scrollIntoView({ block: 'start' });
    },
    [router],
  );

  return (
    <Tabs
      value={active}
      onValueChange={handleValueChange}
      data-stock-code={code}
      className="flex-col gap-0"
    >
      {/*
        T4 — sticky 탭 바. AppShell 의 `main` 이 스크롤 컨테이너(`overflow-auto p-6`) 이므로
        `top-0` 은 그 패딩 박스 상단에 고정된다. `-mx-6 px-6` 은 좌우 24px 패딩을 가로질러
        바가 스크롤 폭을 꽉 채우게 한다 — 없으면 스크롤된 콘텐츠가 바 좌우로 비쳐 보인다.
      */}
      <div
        ref={tabBarRef}
        className="sticky top-0 z-20 -mx-6 border-b border-[var(--border)] bg-[var(--bg)] px-6"
      >
        <TabsList
          variant="line"
          aria-label="종목 정보 탭"
          className="mx-auto h-auto w-full max-w-4xl justify-start gap-0 overflow-x-auto rounded-none bg-transparent p-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map((t) => (
            <TabsTrigger
              key={t.v}
              value={t.v}
              className="h-[46px] flex-none rounded-none border-b-2 border-transparent px-[14px] text-[length:var(--t-sm)] font-semibold text-[var(--muted-fg)] shadow-none after:hidden hover:text-[var(--fg)] data-[state=active]:border-b-[var(--fg)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--fg)] data-[state=active]:shadow-none"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <TabsContent
        value="chart"
        data-testid="stock-tab-panel-chart"
        className={NARROW_PANEL}
      >
        {chart}
      </TabsContent>

      {/*
        T6 — `호가주문` 만 `max-w` 해제. 좌우 여백 24px 은 AppShell `main` 의 `p-6` 이 그대로
        제공하므로 여기서 패딩을 더하지 않는다(더하면 48px 이 되어 계약을 벗어난다).
      */}
      <TabsContent
        value="orderbook"
        data-testid="stock-tab-panel-orderbook"
        className="w-full pt-[var(--s-5)]"
      >
        {orderbook}
      </TabsContent>

      <TabsContent
        value="info"
        data-testid="stock-tab-panel-info"
        className={NARROW_PANEL}
      >
        {info}
      </TabsContent>

      <TabsContent
        value="news"
        data-testid="stock-tab-panel-news"
        className={NARROW_PANEL}
      >
        {news}
      </TabsContent>
    </Tabs>
  );
}
