'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

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
 *   T3 `?tab=chart|orderbook|info|news`, 기본 `chart`, `window.history.pushState`(push 계열 — 뒤로가기가 이전 탭으로)
 *      라우터 내비게이션은 RSC 서버 왕복이 끝나야 `?tab=` 이 바뀌어 탭 전환이 지연됐다. Next 15 가
 *      네이티브 pushState 를 검색 파라미터 훅과 동기화하므로 서버 요청 없이 즉시 전환된다.
 *      한 클릭 = 기록 1개는 핸들러의 실시간 URL 가드가 보장한다 (260913-v2e)
 *   T4 탭 바 sticky
 *   T5 shadcn 공식 `tabs`(Radix) — ←/→ · Home/End 키보드는 Radix 기본 동작 상속
 *   T6 `호가주문` 패널만 넓은 컨테이너, 나머지 3탭은 `max-w-4xl`
 *   B(260924-vj1) 토스 스킨 — 16px/600 탭 바(2px fg 밑줄 + 옅은 1px 기준선), 폰(<768) 하단 고정
 *      「주문하기」 CTA(호가주문 탭으로 전환, 그 탭에선 사라짐), 라이트 호가주문 탭 회색 면 + 흰 카드
 *   T8 한 번 연 `차트 · 종목정보 · 뉴스토론` 패널은 떠나도 언마운트하지 않고 숨긴다(forceMount +
 *      `data-[state=inactive]:hidden`). Radix 기본은 비활성 패널을 언마운트해 재방문마다 섹션이
 *      다시 마운트·재조회되고 스켈레톤이 떴다. 열지 않은 탭은 여전히 마운트하지 않는다(첫 진입 비용
 *      그대로). `호가주문`은 예외로 떠나면 언마운트한다 — 실시간 호가 구독을 보이지 않는 탭에서
 *      붙잡지 않기 위해서다.
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

/**
 * T6 — 3탭 공통 폭. `호가주문` 만 이 제한을 쓰지 않는다.
 * T8 — 이 3탭은 한 번 열면 계속 마운트되므로 비활성일 때 display:none 으로 숨긴다.
 */
const NARROW_PANEL =
  'mx-auto w-full max-w-4xl pt-0 data-[state=inactive]:hidden';

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
  const searchParams = useSearchParams();
  const tabBarRef = useRef<HTMLDivElement>(null);

  // 딥링크 진입도 이 한 줄로 처리된다 — URL 이 단일 진실이라 별도 초기 state 가 없다.
  const active = toTabValue(searchParams.get('tab'));

  // T8 — 한 번이라도 활성이었던 탭. 클릭·뒤로가기·딥링크 어느 경로로 바뀌어도 `active` 에서
  // 파생되므로 렌더 중에 갱신한다(이전 렌더 값에서 파생되는 state — effect 로 한 박자 늦추지 않음).
  const [visited, setVisited] = useState<ReadonlySet<TabValue>>(
    () => new Set([active]),
  );
  if (!visited.has(active)) setVisited(new Set(visited).add(active));
  const keepMounted = (v: TabValue): true | undefined =>
    v !== 'orderbook' && visited.has(v) ? true : undefined;

  const handleValueChange = useCallback(
    (next: string) => {
      const value = toTabValue(next);
      // 한 클릭 = 기록 1개 가드. Radix TabsTrigger 는 mousedown 과 focus(자동 활성화) 두 곳에서
      // onValueChange 를 부른다(Chrome·안드로이드는 mousedown 에 포커스한다). 종전 라우터
      // 내비게이션은 Next 가 같은 URL 푸시를 합쳐 줬지만 네이티브 pushState 는 기록을 2개 남겨
      // 뒤로가기를 두 번 눌러야 이전 탭으로 간다(T3 위반). 렌더 클로저의 `active` 는 Next 의
      // transition 반영 전이라 낡아 있으므로, 동기로 바뀌는 실시간 URL 로 거른다 (260913-v2e).
      if (toTabValue(new URLSearchParams(window.location.search).get('tab')) === value) {
        return;
      }
      // T3 — `replace` 가 아니라 push 계열. 브라우저 뒤로가기가 이전 탭으로 돌아가야 한다.
      // 라우터 내비게이션은 RSC 서버 왕복이 끝나야 `?tab=` 이 바뀌어 탭 전환이 지연됐다.
      // Next 15 는 네이티브 pushState 를 검색 파라미터 훅과 동기화하므로 서버 요청 없이
      // 즉시 전환된다. 쿼리만 쓰는 상대 URL 이라 pathname 은 유지된다 (260913-v2e).
      window.history.pushState(null, '', `?tab=${value}`);
      // 탭 바 바로 아래가 보이도록 스크롤(히어로는 지나간 상태). 탭별 스크롤 복원은 없다.
      tabBarRef.current?.scrollIntoView({ block: 'start' });
    },
    [],
  );

  // B — 폰 하단 고정 「주문하기」 CTA 는 호가주문 탭이 아닐 때만 그린다(그 탭에선 더티 액션 바와
  // 겹치지 않게 언마운트). 보일 때는 Tabs 루트 아래 여백을 CTA 바 높이 + 10 = 76 + max(20, safe-area)
  // 로 두어 마지막 콘텐츠가 가려지지 않게 한다(바 높이 식은 아래 CTA 주석 · 노치 폰 safe-area 도 포함).
  const showOrderCta = active !== 'orderbook';

  return (
    <Tabs
      value={active}
      onValueChange={handleValueChange}
      data-stock-code={code}
      className={cn('flex-col gap-0', showOrderCta && 'max-md:pb-[calc(76px+max(20px,env(safe-area-inset-bottom)))]')}
    >
      {/*
        T4 — sticky 탭 바. AppShell 의 `main` 이 스크롤 컨테이너(`overflow-auto p-2 md:p-4 lg:p-6`) 이므로
        `top-0` 은 그 패딩 박스 상단에 고정된다. `-mx-2 px-2 md:-mx-4 md:px-4 lg:-mx-6 lg:px-6` 은 좌우 여백
        (8px · 768↑ 16px · 1024↑ 24px)을 가로질러 바가 스크롤 폭을 꽉 채우게 한다 — 없으면 스크롤된
        콘텐츠가 바 좌우로 비쳐 보인다. ★ 상쇄 값이 본문 패딩과 **같은 브레이크포인트로 갈려야**
        한다. 한쪽만 고치면 바가 좌우로 삐져나가거나 덜 퍼진다(260924-vj1 전에는 md 단계가 빠져
        768~1023 에서 바가 8px 덜 퍼졌다).
      */}
      <div
        ref={tabBarRef}
        className="sticky top-0 z-20 -mx-2 border-b border-[var(--border-subtle)] bg-[var(--bg)] px-2 md:-mx-4 md:px-4 lg:-mx-6 lg:px-6"
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
              className="h-[50px] flex-none rounded-none border-b-2 border-transparent px-3 text-[17px] font-semibold text-[var(--muted-fg)] shadow-none after:hidden hover:text-[var(--fg)] data-[state=active]:border-b-[var(--fg)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--fg)] data-[state=active]:shadow-none"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <TabsContent
        value="chart"
        data-testid="stock-tab-panel-chart"
        forceMount={keepMounted('chart')}
        className={NARROW_PANEL}
      >
        {chart}
      </TabsContent>

      {/*
        T6 — `호가주문` 만 `max-w` 해제. 좌우 여백은 AppShell `main` 의 `p-2 md:p-4 lg:p-6` 이 정한다.
        B(260924-vj1) — 라이트에서 흰 바탕 위 흰 카드가 사라지므로 이 패널만 `--surface` 회색 면을
        좌우·아래로 bleed 한다(`-mx-* px-*` · `-mb-*`, main 램프와 같은 값). 음수 마진과 같은 패딩이
        상쇄되어 **콘텐츠 박스 폭(= `@container/lc` 폭)은 bleed 전과 같다** — `w-full` 을 남기면
        박스가 거터×2 만큼 좁아져 §2.2b 밴드 전환 지점이 움직이므로 `w-auto` 여야 한다.
      */}
      <TabsContent
        value="orderbook"
        data-testid="stock-tab-panel-orderbook"
        className="-mx-2 -mb-2 w-auto bg-[var(--surface)] px-2 pt-3 pb-5 md:-mx-4 md:-mb-4 md:px-4 lg:-mx-6 lg:-mb-6 lg:px-6"
      >
        {orderbook}
      </TabsContent>

      <TabsContent
        value="info"
        data-testid="stock-tab-panel-info"
        forceMount={keepMounted('info')}
        className={NARROW_PANEL}
      >
        {info}
      </TabsContent>

      <TabsContent
        value="news"
        data-testid="stock-tab-panel-news"
        forceMount={keepMounted('news')}
        className={NARROW_PANEL}
      >
        {news}
      </TabsContent>

      {/*
        B — 폰(<768) 하단 고정 「주문하기」 CTA. 기존 탭 전환 경로(`handleValueChange` — 한 클릭 = 기록 1개
        가드 · pushState · scrollIntoView)를 그대로 재사용한다(새 내비게이션 경로 0).
        ★ `position: fixed` 지만 조상에 `container-type` 이 없는 자리(탭 셸 루트)라 §2.2b 의 컨테이닝
          블록 함정에 걸리지 않는다. 뷰포트 `md` 분기는 앱 셸 층이라 상따 본문 컨테이너 쿼리 규칙과
          충돌하지 않는다. 챗 FAB 는 globals.css 가 이 바가 있을 때만 위로 들어 올린다.
        ★ TDS BottomCTA(@toss/tds-mobile) = 버튼 xlarge 56 · radius 16 · 글자 t5 17/600 · 좌우 20 ·
          하단 20/safe-area(→ `max(20px, safe-area)` 로 해석 — 노치 없는 폰 20, 노치 폰은 safe-area).
          바 높이 = pt 10 + 버튼 56 + max(20, safe) = 66 + max(20, safe).
          → 챗 FAB bottom = 70 + max(20, safe)(바 윗변 위 4px · globals.css) ·
            Tabs 루트 예약 = 76 + max(20, safe)(바 + 10). 셋 중 하나를 바꾸면 나머지도 같이.
      */}
      {showOrderCta && (
        <div
          data-slot="detail-order-cta-bar"
          className="fixed inset-x-0 bottom-0 z-30 bg-[linear-gradient(to_bottom,transparent,var(--bg)_40%)] px-5 pt-2.5 pb-[max(20px,env(safe-area-inset-bottom))] md:hidden"
        >
          <button
            type="button"
            data-slot="detail-order-cta"
            onClick={() => handleValueChange('orderbook')}
            className="h-[56px] w-full rounded-[16px] bg-[var(--up)] text-[17px] font-semibold text-white"
          >
            주문하기
          </button>
        </div>
      )}
    </Tabs>
  );
}
