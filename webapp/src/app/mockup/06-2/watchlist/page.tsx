import Link from 'next/link';

import { TrackSection, VariantFrame, VariantGrid } from '../_components/variant-frame';
import {
  WatchlistBaselineCardGrid,
  WatchlistBaselineSlim,
  WatchlistBaselineUiSpec,
} from './_variants';
import {
  WatchlistFdDenseTerminal,
  WatchlistFdEditorial,
  WatchlistFdInfographic,
} from './_fd-variants';

export const metadata = {
  title: '/watchlist Mockups · Phase 06.2',
};

export default function WatchlistMockups() {
  return (
    <div className="mx-auto flex max-w-[96rem] flex-col gap-10 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/mockup/06-2"
          className="text-xs text-[var(--muted-fg)] hover:text-[var(--fg)]"
        >
          ← Phase 06.2 인덱스
        </Link>
        <h1 className="text-2xl font-semibold">/watchlist 페이지 목업 6종</h1>
        <p className="max-w-3xl text-sm text-[var(--muted-fg)] leading-normal">
          D-23 (Scanner 동형 Table+Card) · D-24 (컬럼 세트, 갱신시각은 페이지
          헤더) · D-27 (Empty state CTA) 준수. 6개 종목 데이터는 하드코딩된
          샘플입니다.
        </p>
      </header>

      <TrackSection
        title="Baseline — UI-SPEC 준수 3 해석"
        description="컬럼 밀도와 레이아웃 전략만 달리: 표준 7컬럼 / 슬림 5컬럼 / 카드 그리드."
      >
        <VariantGrid>
          <VariantFrame
            id="watchlist-baseline-1"
            track="baseline"
            label="V1 · 표준 7컬럼 (UI-SPEC 기본)"
            rationale="종목명 / 코드 / 마켓 / 현재가 / 등락률 / 거래대금 / ⭐"
          >
            <WatchlistBaselineUiSpec />
          </VariantFrame>
          <VariantFrame
            id="watchlist-baseline-2"
            track="baseline"
            label="V2 · 슬림 5컬럼"
            rationale="종목명 셀에 코드·마켓 복합 — 가독성과 밀도 균형"
          >
            <WatchlistBaselineSlim />
          </VariantFrame>
          <VariantFrame
            id="watchlist-baseline-3"
            track="baseline"
            label="V3 · 카드 그리드"
            rationale="Table 없이 2열 카드 — 모바일 Card 레이아웃을 데스크탑에도 적용"
          >
            <WatchlistBaselineCardGrid />
          </VariantFrame>
        </VariantGrid>
      </TrackSection>

      <TrackSection
        title="frontend-design — skill 제안 3 해석"
        description="정보 시각화와 정체성이 강한 3가지 방향."
      >
        <VariantGrid>
          <VariantFrame
            id="watchlist-fd-1"
            track="frontend-design"
            label="F1 · Infographic"
            rationale="행별 sparkline · LIVE 링 · 화살표 · 코드 배지 — 시각적 밀도"
          >
            <WatchlistFdInfographic />
          </VariantFrame>
          <VariantFrame
            id="watchlist-fd-2"
            track="frontend-design"
            label="F2 · Editorial"
            rationale="순번 · 대형 타이포 · 하단 라인 · 메타 보조 — 기사형 레이아웃"
          >
            <WatchlistFdEditorial />
          </VariantFrame>
          <VariantFrame
            id="watchlist-fd-3"
            track="frontend-design"
            label="F3 · Dense Terminal"
            rationale="트레이더 터미널 느낌 · 고밀도 모노스페이스 · 6행 표시"
          >
            <WatchlistFdDenseTerminal />
          </VariantFrame>
        </VariantGrid>
      </TrackSection>
    </div>
  );
}
