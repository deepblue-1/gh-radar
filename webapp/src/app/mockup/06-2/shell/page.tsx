import Link from 'next/link';

import { TrackSection, VariantFrame, VariantGrid } from '../_components/variant-frame';
import {
  ShellBaselineCompact,
  ShellBaselinePopover,
  ShellBaselineUiSpec,
} from './_variants';
import {
  ShellFdCommandCenter,
  ShellFdEditorial,
  ShellFdPulse,
} from './_fd-variants';

export const metadata = {
  title: 'AppShell 사이드바 Mockups · Phase 06.2',
};

export default function ShellMockups() {
  return (
    <div className="mx-auto flex max-w-[96rem] flex-col gap-10 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/mockup/06-2"
          className="text-xs text-[var(--muted-fg)] hover:text-[var(--fg)]"
        >
          ← Phase 06.2 인덱스
        </Link>
        <h1 className="text-2xl font-semibold">AppShell 사이드바 + UserSection 목업 6종</h1>
        <p className="max-w-3xl text-sm text-[var(--muted-fg)] leading-normal">
          D-16 (사이드바 활성화 · 하단 유저 섹션) · D-17 (`/design` 카탈로그
          hideSidebar 유지) 를 준수하는 Baseline 3 해석 + frontend-design 3
          자율 제안. 오른쪽 영역은 단순 placeholder 로, 사이드바 구조에 집중해주세요.
        </p>
      </header>

      <TrackSection
        title="Baseline — UI-SPEC 준수 3 해석"
        description="유저 섹션 표시 전략만 달리: 항상 표시 / 팝오버 / 컴팩트."
      >
        <VariantGrid>
          <VariantFrame
            id="shell-baseline-1"
            track="baseline"
            label="V1 · 항상 표시 (UI-SPEC 기본)"
            rationale="아바타 + 이메일 전체 + 로그아웃 아이콘 — 1-click 접근성 우선"
          >
            <ShellBaselineUiSpec />
          </VariantFrame>
          <VariantFrame
            id="shell-baseline-2"
            track="baseline"
            label="V2 · 팝오버"
            rationale="사이드바 footprint 최소화 — 이름 클릭 시 이메일·로그아웃 팝오버"
          >
            <ShellBaselinePopover />
          </VariantFrame>
          <VariantFrame
            id="shell-baseline-3"
            track="baseline"
            label="V3 · 컴팩트 아이콘"
            rationale="아바타 + 로그아웃 아이콘만, 이메일은 title 속성"
          >
            <ShellBaselineCompact />
          </VariantFrame>
        </VariantGrid>
      </TrackSection>

      <TrackSection
        title="frontend-design — skill 제안 3 해석"
        description="시각적 밀도와 정보 구조를 다르게 탐색한 3가지 방향."
      >
        <VariantGrid>
          <VariantFrame
            id="shell-fd-1"
            track="frontend-design"
            label="F1 · Command Center"
            rationale="LIVE 배지 · 상단 상태 카드 · nav meta 카운터 · online 인디케이터"
          >
            <ShellFdCommandCenter />
          </VariantFrame>
          <VariantFrame
            id="shell-fd-2"
            track="frontend-design"
            label="F2 · Editorial"
            rationale="타이포그래피 대비 · 섹션 구분자 · 밑줄 nav · 흑백 고대비"
          >
            <ShellFdEditorial />
          </VariantFrame>
          <VariantFrame
            id="shell-fd-3"
            track="frontend-design"
            label="F3 · Pulse"
            rationale="시장 상태 카드 · active 항목 좌측 그라디언트 바 · 밝은 강조"
          >
            <ShellFdPulse />
          </VariantFrame>
        </VariantGrid>
      </TrackSection>
    </div>
  );
}
