import Link from 'next/link';

import { TrackSection, VariantFrame, VariantGrid } from '../_components/variant-frame';
import {
  StarBaselineChip,
  StarBaselineGhost,
  StarBaselineToggle,
} from './_variants';
import {
  StarFdCountBadge,
  StarFdRadialPulse,
  StarFdStickerSwap,
} from './_fd-variants';

export const metadata = {
  title: '⭐ 토글 Mockups · Phase 06.2',
};

export default function StarMockups() {
  return (
    <div className="mx-auto flex max-w-[96rem] flex-col gap-10 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/mockup/06-2"
          className="text-xs text-[var(--muted-fg)] hover:text-[var(--fg)]"
        >
          ← Phase 06.2 인덱스
        </Link>
        <h1 className="text-2xl font-semibold">⭐ 토글 목업 6종</h1>
        <p className="max-w-3xl text-sm text-[var(--muted-fg)] leading-normal">
          D-26 (StockHero · Scanner 행 배치) · 4상태 (Unset / Set / Loading
          optimistic / Disabled 50/50). UI-SPEC 은 shadcn Toggle + Star lucide
          36×36 을 기본으로 잠금, Baseline V2/V3 는 대체 패턴 탐색, fd 는 완전히
          다른 방향.
        </p>
      </header>

      <TrackSection
        title="Baseline — UI-SPEC 준수 3 해석"
        description="동일한 4상태 규칙을 유지하면서 컴포넌트 선택만 달리."
      >
        <VariantGrid>
          <VariantFrame
            id="star-baseline-1"
            track="baseline"
            label="V1 · shadcn Toggle (UI-SPEC 기본)"
            rationale="pressed bg + fill Star, WCAG 2.5.5 충족 36×36"
          >
            <StarBaselineToggle />
          </VariantFrame>
          <VariantFrame
            id="star-baseline-2"
            track="baseline"
            label="V2 · Ghost icon-only"
            rationale="배경 없이 색만 변화 — 행 hover 시 부담 최소"
          >
            <StarBaselineGhost />
          </VariantFrame>
          <VariantFrame
            id="star-baseline-3"
            track="baseline"
            label="V3 · 텍스트 chip"
            rationale="`관심 + / 관심 ✓ / 저장 중… / 50/50` — 의미 명시적"
          >
            <StarBaselineChip />
          </VariantFrame>
        </VariantGrid>
      </TrackSection>

      <TrackSection
        title="frontend-design — skill 제안 3 해석"
        description="시각 임팩트와 피드백 표현력이 강한 대안."
      >
        <VariantGrid>
          <VariantFrame
            id="star-fd-1"
            track="frontend-design"
            label="F1 · Radial Pulse"
            rationale="원형 그라디언트 + ping 애니메이션 — 저장 순간 시각 피드백 강화"
          >
            <StarFdRadialPulse />
          </VariantFrame>
          <VariantFrame
            id="star-fd-2"
            track="frontend-design"
            label="F2 · Count Badge"
            rationale="저장 상태 + 개수 배지 동시 표현 — 한도 도달 진행률 실시간 가시화"
          >
            <StarFdCountBadge />
          </VariantFrame>
          <VariantFrame
            id="star-fd-3"
            track="frontend-design"
            label="F3 · Sticker Swap"
            rationale="스탬프 타이포그래피 + 상태 swap — 에디토리얼 강조"
          >
            <StarFdStickerSwap />
          </VariantFrame>
        </VariantGrid>
      </TrackSection>
    </div>
  );
}
