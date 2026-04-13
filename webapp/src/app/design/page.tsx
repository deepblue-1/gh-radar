/**
 * `/design` 카탈로그 — UI-SPEC §6, D-29 (7 섹션).
 *
 * Server RSC. CenterShell 는 이미 AppHeader 에 `<ThemeToggle />` 을 고정 배치하므로
 * 별도 헤더 버튼 없이도 우측 상단에 3상태 토글이 노출된다 (CONTEXT D-28/D-30).
 *
 * 각 섹션은 `_sections/*` 에 분리. Slider/Sheet/Tooltip/DensityProvider 가 포함된
 * Components 섹션만 client boundary 로 표시된다.
 */

import { CenterShell } from '@/components/layout/center-shell';
import { Separator } from '@/components/ui/separator';
import { ColorsSection } from './_sections/colors';
import { ComponentsSection } from './_sections/components';
import { LayoutsSection } from './_sections/layouts';
import { NumbersSection } from './_sections/numbers';
import { SpacingSection } from './_sections/spacing';
import { TypographySection } from './_sections/typography';

export const metadata = {
  title: 'Design Catalog · gh-radar',
  description: 'Phase 3 디자인 시스템 카탈로그 — 토큰·컴포넌트·레이아웃 시각화 (BBAA preset)',
};

const TOC = [
  { id: 'colors', label: '1. Colors' },
  { id: 'typography', label: '2. Typography' },
  { id: 'spacing', label: '3. Spacing & Radius' },
  { id: 'components', label: '4. Components' },
  { id: 'layouts', label: '5. Layouts' },
  { id: 'numbers', label: '6. <Number>' },
];

function IntroSection() {
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-[length:var(--t-h1)] font-bold">Design Catalog</h1>
        <p className="mt-2 text-[length:var(--t-base)] text-[var(--muted-fg)]">
          Phase 3 · gh-radar 디자인 시스템. 이 페이지는 토큰·컴포넌트·레이아웃 전체를 한 화면에
          회수하는 단일 소스다. 우측 상단 ThemeToggle 로 Light / Dark / System 을 실시간 전환할 수
          있다.
        </p>
      </div>

      <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--muted)] p-4">
        <div className="mb-2 text-[length:var(--t-caption)] font-semibold uppercase tracking-wider text-[var(--muted-fg)]">
          Preset · BBAA
        </div>
        <ul className="space-y-1 text-[length:var(--t-sm)]">
          <li>
            <strong>밀도:</strong> B — 데이터 밀집 대시보드 (row-h 36px, mobile 48px)
          </li>
          <li>
            <strong>팔레트:</strong> B — 토스증권 (Toss Blue primary · Toss Red 상승 · Toss Blue 하락)
          </li>
          <li>
            <strong>배경:</strong> A — Light 순백 <span className="mono">oklch(1 0 0)</span> / Dark
            딥차콜 <span className="mono">oklch(0.08 0 0)</span>
          </li>
          <li>
            <strong>타이포:</strong> A — 16px base · Pretendard Variable + Geist Mono(숫자)
          </li>
        </ul>
      </div>

      <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-2 text-[length:var(--t-caption)] font-semibold uppercase tracking-wider text-[var(--muted-fg)]">
          목차
        </div>
        <nav>
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 md:grid-cols-3">
            {TOC.map((t) => (
              <li key={t.id}>
                <a
                  href={`#${t.id}`}
                  className="block rounded-[var(--r-sm)] px-2 py-1 text-[length:var(--t-sm)] text-[var(--fg)] transition-colors hover:bg-[var(--muted)]"
                >
                  {t.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}

export default function DesignPage() {
  return (
    <CenterShell>
      <div className="space-y-8">
        <IntroSection />
        <Separator />
        <ColorsSection />
        <Separator />
        <TypographySection />
        <Separator />
        <SpacingSection />
        <Separator />
        <ComponentsSection />
        <Separator />
        <LayoutsSection />
        <Separator />
        <NumbersSection />
      </div>
    </CenterShell>
  );
}
