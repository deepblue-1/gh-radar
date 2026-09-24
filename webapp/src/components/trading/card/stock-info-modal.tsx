'use client';

/**
 * StockInfoModal — 카드 헤더 ⓘ 가 여는 종목정보 팝업 (18-09 / D-25 · D-28 · D-30 · E14 · TRADE-09).
 *
 * ① 무엇 — 「여러 메뉴 왔다갔다 안 하고 그 페이지에서 해결」
 *   종목상세 `/stocks/[code]` 의 4탭 중 **호가주문을 뺀 3탭**을 카드에서 나가지 않고 본다.
 *   탭은 「차트 | 종목정보 | 뉴스·토론」이다.
 *
 * ② ★ 재사용이지 재구현이 아니다 — 새 데이터 경로가 없다 (D-25 · T-18-45)
 *   탭 본문은 `stock-detail-client.tsx` 가 `StockDetailTabs` 에 넣는 **같은 섹션 컴포넌트를
 *   같은 순서로** 조립한다. 각 섹션은 자기 조회·로딩·빈 상태·오류 처리를 이미 갖고 있으므로
 *   여기서 문구를 새로 쓰지 않는다(E14 empty/loading/error = 기존 그대로).
 *   - 차트: `StockDailyChartSection` — 색은 `chart-colors.ts` 의 hex/rgb 팔레트로 주입된다
 *     (lightweight-charts 는 oklch 를 거부한다 — 이 파일은 색을 만지지 않는다).
 *   - 종목정보: `StockStatsGrid` · `StockThemeChips` · `StockLimitUpSection` · `StockComovementSection`.
 *     통계 그리드만 종목 상세 응답이 필요해 종목상세와 **같은 `fetchStockDetail`** 을 부른다.
 *     그 조회가 실패해도 나머지 섹션은 각자 뜬다(E14 partial — 탭별·섹션별 독립 로드).
 *   - 뉴스·토론: `StockNewsSection` · `StockDiscussionSection`.
 *
 * ③ ★ 호가주문 탭을 넣지 않는다
 *   보이지 않는 탭에서 실시간 호가 구독을 붙잡지 않는다는 종목상세의 규율(T8 의 예외)과 같은
 *   이유다. 호가·주문은 카드 본문이 이미 한다.
 *
 * ④ ★ 포털 — 카드 컨테이너에 갇히지 않는다 (D-28 · RESEARCH A5)
 *   카드 루트의 `container-type: inline-size` 는 layout containment 라 `position:fixed` 자손의
 *   컨테이닝 블록이 된다. 그래서 모달은 반드시 `document.body` 로 나가야 한다.
 *   `@/components/ui/dialog` 의 `DialogContent` 는 **내부에서 `DialogPortal` 로 감싼다**
 *   (Radix Portal 기본 컨테이너 = `document.body`) — 코드로 확인했고, 테스트가 「모달 DOM 이
 *   카드 `<article>` 의 자손이 아니다」를 단언해 이 가정을 기계적으로 닫는다.
 *
 * ⑤ 크기 — 폰 전체화면 시트 · 뷰포트 700 이상 최대 960px 중앙 (목업 정본)
 *   모달은 컨테이너 밖이라 **뷰포트** 미디어 쿼리가 맞다(D-28 의 「뷰포트 분기 신설 금지」는
 *   컨테이너 안쪽 규율이다). 경계 700 은 목업 `@media (max-width: 699px)` 그대로다.
 *   본문은 세로 스크롤이고, 제목 종목명은 줄바꿈을 허용한다(E14 long-text).
 *
 * ⑥ 닫으면 언마운트한다 (T-18-46)
 *   `Dialog` 는 닫히면 내용을 버린다(`forceMount` 를 쓰지 않는다) — 카드 N개가 팝업을 N번 열어도
 *   숨은 인스턴스가 쌓이지 않는다. 다시 열면 기본 탭(차트)부터 새로 그린다.
 *   닫기는 ✕ · 배경 클릭 · ESC 셋 다이고, 닫은 뒤 포커스는 트리거(카드 헤더 ⓘ)로 돌아온다.
 *   ★ 이것은 Radix 기본이 **아니다** — 제어형 `Dialog` 에 `DialogTrigger` 가 없으면 Radix 는
 *     닫을 때 비어 있는 `triggerRef` 에 포커스를 주려다 `body` 로 떨어뜨린다(테스트로 확인).
 *     ⓘ 는 카드 헤더 소유라 `DialogTrigger` 로 감쌀 수 없으므로, 열리는 순간의 포커스 요소를
 *     기억했다가 닫힐 때 직접 돌려준다.
 *
 * ⑦ ★ `code` 가 없으면 열리지 않는다 (D-30)
 *   탭 본문이 전부 단축코드로 조회되기 때문이다. 카드 헤더 ⓘ 가 같은 사실로 비활성이고, 이
 *   컴포넌트도 `open` 을 받더라도 `code` 없이는 아무것도 그리지 않는다 — 세 지점이 같은 말을 한다.
 */

import { useEffect, useRef, useState } from 'react';
import type { StockDetailResponse } from '@gh-radar/shared';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { StockDailyChartSection } from '@/components/stock/stock-daily-chart-section';
import { StockStatsGrid } from '@/components/stock/stock-stats-grid';
import { StockLimitUpSection } from '@/components/stock/stock-limit-up-section';
import { StockComovementSection } from '@/components/stock/stock-comovement-section';
import { StockNewsSection } from '@/components/stock/stock-news-section';
import { StockDiscussionSection } from '@/components/stock/stock-discussion-section';
import { StockThemeChips } from '@/components/theme/theme-chips';
import { fetchStockDetail } from '@/lib/stock-api';
import { cn } from '@/lib/utils';

const TABS = [
  { v: 'chart', label: '차트' },
  { v: 'info', label: '종목정보' },
  { v: 'news', label: '뉴스·토론' },
] as const;

type ModalTab = (typeof TABS)[number]['v'];

const TAB_TRIGGER =
  'h-7 flex-none rounded-full border border-transparent px-3 text-[length:var(--t-caption)] font-semibold whitespace-nowrap text-[var(--muted-fg)] shadow-none ' +
  'data-[state=active]:bg-[var(--pill-on-bg)] data-[state=active]:text-[var(--pill-on-fg)] data-[state=active]:shadow-none ' +
  'dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-[var(--pill-on-bg)] dark:data-[state=active]:text-[var(--pill-on-fg)]';

export interface StockInfoModalProps {
  /** 6자 단축코드. **없으면 팝업이 열리지 않는다**(⑦). */
  code: string | null;
  /** 제목 종목명. */
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StockInfoModal({ code, name, open, onOpenChange }: StockInfoModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  /** 열리는 순간 포커스를 갖고 있던 요소(= ⓘ). 닫을 때 그리로 돌려준다(⑥). */
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // ⑦ — 코드 없이는 그리지 않는다. `open` 이 와도 대화상자가 존재하지 않는다.
  if (code === null || code === '') return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(e) => {
          // 이 시점의 activeElement 는 아직 트리거(ⓘ)다 — 포커스를 옮기기 전에 기억한다.
          returnFocusRef.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          // 초기 포커스는 닫기 버튼(UI-SPEC §접근성 — 모달). 첫 탭으로 가면 방향키가 탭을 바꾼다.
          e.preventDefault();
          closeRef.current?.focus();
        }}
        onCloseAutoFocus={(e) => {
          // Radix 의 빈 triggerRef 포커스(→ body)를 막고 기억해 둔 트리거로 돌려준다(⑥).
          const target = returnFocusRef.current;
          returnFocusRef.current = null;
          if (target && target.isConnected) {
            e.preventDefault();
            target.focus();
          }
        }}
        className={cn(
          // 폰(<700) — 전체화면 시트.
          'inset-0 top-0 left-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-[var(--card)] p-0 text-[var(--fg)] ring-0 sm:max-w-none',
          // 뷰포트 ≥700 — 최대 960px 중앙(목업 정본). 모달은 컨테이너 밖이라 뷰포트 기준이다(⑤).
          'min-[700px]:inset-auto min-[700px]:top-1/2 min-[700px]:left-1/2 min-[700px]:h-auto min-[700px]:max-h-[calc(100dvh-48px)] min-[700px]:w-[min(960px,calc(100%-32px))] min-[700px]:-translate-x-1/2 min-[700px]:-translate-y-1/2 min-[700px]:rounded-[var(--r-lg)] min-[700px]:border min-[700px]:border-[var(--border)]',
        )}
      >
        <DialogHeader className="flex-row items-start gap-[var(--s-2)] border-b border-[var(--border)] px-3.5 py-2.5">
          <div className="min-w-0 flex-1">
            {/* 제목 종목명은 wrap 허용(E14 long-text) — 잘라 버리면 비슷한 종목명이 갈리지 않는다. */}
            <DialogTitle className="text-[16px] leading-snug font-bold break-words text-[var(--fg)]">
              {name}{' '}
              <span className="mono text-[12px] font-normal text-[var(--muted-fg)]">{code}</span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              차트 · 종목정보 · 뉴스·토론을 이 화면에서 봅니다.
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <button
              ref={closeRef}
              type="button"
              aria-label="닫기"
              className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-[var(--r)] text-[length:var(--t-sm)] text-[var(--muted-fg)] hover:bg-[var(--muted)] hover:text-[var(--fg)]"
            >
              ✕
            </button>
          </DialogClose>
        </DialogHeader>

        <StockInfoTabs code={code} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * 탭 3개. 한 번 연 탭은 떠나도 마운트를 유지한다 — 종목상세 T8 과 같은 규율(재방문마다 재조회·
 * 스켈레톤이 뜨지 않게). 팝업 자체가 닫히면 이 컴포넌트째 언마운트된다(⑥).
 */
function StockInfoTabs({ code }: { code: string }) {
  const [active, setActive] = useState<ModalTab>('chart');
  const [visited, setVisited] = useState<ReadonlySet<ModalTab>>(() => new Set(['chart']));
  if (!visited.has(active)) setVisited(new Set(visited).add(active));
  const keepMounted = (v: ModalTab): true | undefined => (visited.has(v) ? true : undefined);

  return (
    <Tabs
      value={active}
      onValueChange={(v) => setActive(v as ModalTab)}
      className="min-h-0 flex-1 gap-0"
    >
      <TabsList
        aria-label="종목정보 팝업 탭"
        className="h-auto w-full justify-start gap-1 rounded-none border-b border-[var(--border)] bg-transparent px-2 py-1.5"
      >
        {TABS.map((t) => (
          <TabsTrigger key={t.v} value={t.v} className={TAB_TRIGGER}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {/* 본문 세로 스크롤(E14 overflow) — 차트는 섹션이 컨테이너 폭에 맞춘다. */}
      <div data-slot="stock-info-modal-body" className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
        <TabsContent
          value="chart"
          forceMount={keepMounted('chart')}
          className="min-w-0 data-[state=inactive]:hidden"
        >
          <StockDailyChartSection code={code} />
        </TabsContent>
        <TabsContent
          value="info"
          forceMount={keepMounted('info')}
          className="min-w-0 data-[state=inactive]:hidden"
        >
          <div className="space-y-8">
            <StatsGridSlot code={code} />
            <StockThemeChips stockCode={code} />
            <StockLimitUpSection stockCode={code} />
            <StockComovementSection stockCode={code} />
          </div>
        </TabsContent>
        <TabsContent
          value="news"
          forceMount={keepMounted('news')}
          className="min-w-0 data-[state=inactive]:hidden"
        >
          <div className="space-y-6">
            <StockNewsSection stockCode={code} />
            <StockDiscussionSection stockCode={code} />
          </div>
        </TabsContent>
      </div>
    </Tabs>
  );
}

/**
 * 통계 그리드 자리 — 종목상세와 **같은 `fetchStockDetail`** 로 받은 응답을 그대로 넘긴다.
 * 실패해도 이 자리만 오류이고 형제 섹션(이력·동반상승·테마)은 각자 뜬다(E14 partial).
 * 오류 문구는 종목상세의 기존 문구(「데이터를 불러오지 못했습니다」)를 쓴다.
 */
function StatsGridSlot({ code }: { code: string }) {
  const [stock, setStock] = useState<StockDetailResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setStock(null);
    setFailed(false);
    fetchStockDetail(code, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setStock(data);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        setFailed(true);
      });
    return () => controller.abort();
  }, [code]);

  if (failed) {
    return (
      // 색은 중립 — UI-SPEC §Color 의 Destructive 허용 목록에 이 자리는 없다.
      <p role="alert" className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
        데이터를 불러오지 못했습니다
      </p>
    );
  }
  if (stock === null) {
    return (
      <div aria-busy="true" className="grid grid-cols-2 gap-[var(--s-3)] min-[700px]:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }
  return <StockStatsGrid stock={stock} />;
}
