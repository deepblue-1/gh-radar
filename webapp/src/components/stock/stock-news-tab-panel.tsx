'use client';

import { useEffect, useRef } from 'react';

import { DetailBands } from './detail-bands';
import { DiscussionFullList } from './discussion-full-list';
import { NewsFullList } from './news-full-list';
import { useNewsView } from './news-view';
import { StockDiscussionSection } from './stock-discussion-section';
import { StockNewsSection } from './stock-news-section';

/**
 * StockNewsTabPanel — 종목상세 「뉴스토론」 탭 패널 (Phase 21 D-29 · G-21-R3-8).
 *
 * 요약(뉴스 · 토론 섹션) ↔ 전체목록을 같은 탭 안에서 바꾼다. 상태 정본은 URL
 * `?tab=news&view=…`(`useNewsView`) — 뒤로가기 네 경로와 스크롤 복원 규칙은 news-view.ts 머리 주석.
 *
 * - 전체목록을 여는 동안 요약은 **언마운트하지 않고 숨긴다**(`hidden`). 탭 셸 T8 keepMounted 와 같은
 *   이유 — 돌아올 때 재조회 · 스켈레톤 없이 그대로 보이고, 섹션의 쿨다운 상태도 유지된다.
 * - Esc = 요약 복귀. 다른 곳이 이미 처리했거나(`defaultPrevented`) 열린 다이얼로그가 있으면
 *   (Esc 는 그 다이얼로그 몫) 건드리지 않는다.
 */
export interface StockNewsTabPanelProps {
  code: string;
}

export function StockNewsTabPanel({ code }: StockNewsTabPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { view, showAll, back } = useNewsView(code, rootRef);

  useEffect(() => {
    if (view === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      back();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [view, back]);

  const showingList = view !== null;

  return (
    <div ref={rootRef} data-news-view={view ?? 'summary'}>
      <div hidden={showingList}>
        <DetailBands>
          <StockNewsSection stockCode={code} onShowAll={() => showAll('news')} />
          <StockDiscussionSection
            stockCode={code}
            onShowAll={() => showAll('discussions')}
          />
        </DetailBands>
      </div>
      {view !== null && (
        <div className="py-6 lg:py-7">
          {view === 'news' ? (
            <NewsFullList code={code} onBack={back} />
          ) : (
            <DiscussionFullList code={code} onBack={back} />
          )}
        </div>
      )}
    </div>
  );
}
