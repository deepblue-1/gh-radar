import Link from 'next/link';

import { TrackSection, VariantFrame, VariantGrid } from '../_components/variant-frame';
import { LoginCardCentered, LoginMinimalFlat, LoginSplitHero } from './_variants';
import {
  LoginFdAurora,
  LoginFdCompactStack,
  LoginFdDuotone,
} from './_fd-variants';

export const metadata = {
  title: '/login Mockups · Phase 06.2',
};

export default function LoginMockups() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link href="/mockup/06-2" className="text-xs text-[var(--muted-fg)] hover:text-[var(--fg)]">
          ← Phase 06.2 인덱스
        </Link>
        <h1 className="text-2xl font-semibold">/login 페이지 목업 6종</h1>
        <p className="max-w-3xl text-sm text-[var(--muted-fg)] leading-normal">
          D-14 (Card + 중앙정렬 + Google 버튼) · D-15 (?error= 4종 한글 메시지)
          를 준수하는 <strong>Baseline 3</strong> 과 frontend-design skill 이
          제안한 <strong>frontend-design 3</strong> 을 나란히 비교합니다. 각
          카드 아래의 칩을 눌러 에러 상태를 전환해볼 수 있습니다.
        </p>
      </header>

      <TrackSection
        title="Baseline — UI-SPEC 잠금 준수 3 해석"
        description="Card 중앙 / Split Hero / Minimal Flat — 정보 계층과 시각 무게만 달리."
      >
        <VariantGrid>
          <VariantFrame
            id="login-baseline-1"
            track="baseline"
            label="V1 · Card 중앙 (UI-SPEC 기본)"
            rationale="weekly-wine-bot admin 레이아웃 그대로 — Card + 중앙 Google 버튼 + Suspense + ?error="
          >
            <LoginCardCentered />
          </VariantFrame>
          <VariantFrame
            id="login-baseline-2"
            track="baseline"
            label="V2 · Split Hero"
            rationale="좌측 브랜드 카피 + 우측 CTA. 서비스 가치 제안을 함께 노출."
          >
            <LoginSplitHero />
          </VariantFrame>
          <VariantFrame
            id="login-baseline-3"
            track="baseline"
            label="V3 · Minimal Flat"
            rationale="Card 없이 flat. 타이포그래피와 여백으로만 계층 구성."
          >
            <LoginMinimalFlat />
          </VariantFrame>
        </VariantGrid>
      </TrackSection>

      <TrackSection
        title="frontend-design — skill 제안 3 해석"
        description="frontend-design skill 이 Phase 06.2 UI-SPEC 맥락으로 자율 제안한 3가지 방향."
      >
        <VariantGrid>
          <VariantFrame
            id="login-fd-1"
            track="frontend-design"
            label="F1 · Aurora Hero"
            rationale="대형 그라디언트 블러 · 카드 유리 효과 · 강한 포컬 CTA"
          >
            <LoginFdAurora />
          </VariantFrame>
          <VariantFrame
            id="login-fd-2"
            track="frontend-design"
            label="F2 · Duotone Print"
            rationale="인쇄 스타일 타이포 + 2톤 컬러 블록 + 거시 숫자 지표"
          >
            <LoginFdDuotone />
          </VariantFrame>
          <VariantFrame
            id="login-fd-3"
            track="frontend-design"
            label="F3 · Compact Stack"
            rationale="모바일 퍼스트 · Card 간소화 · legal stripe 하단 고정"
          >
            <LoginFdCompactStack />
          </VariantFrame>
        </VariantGrid>
      </TrackSection>
    </div>
  );
}
