/**
 * Phase 09.2 RESEARCH — Mockup index.
 * 3개 mockup 라우트로 이동하기 위한 단순 navigation.
 *
 * 위치: webapp/src/app/mockups/page.tsx
 * 접근 경로: /mockups
 *
 * 주의: 이 라우트는 RESEARCH 단계의 비교용 산출물. PLAN/EXECUTE 단계에서 라이브러리
 * 선정 후 _mockups/ 디렉터리는 삭제 또는 보관 결정 (planner 재량).
 */

import Link from 'next/link';
import { Card } from '@/components/ui/card';

const MOCKUPS = [
  {
    href: '/mockups/chart-recharts',
    title: 'Mockup 1: recharts (raw)',
    desc: 'recharts 3.8.1 단독 + Bar shape prop 으로 캔들 합성. 디자인 토큰 수동 주입.',
  },
  {
    href: '/mockups/chart-shadcn',
    title: 'Mockup 2: recharts + shadcn Chart wrapper',
    desc: 'recharts 3.8.1 + ChartContainer/ChartTooltip 으로 Phase 3 토큰 자동 매핑.',
  },
  {
    href: '/mockups/chart-lightweight',
    title: 'Mockup 3: lightweight-charts 5.x',
    desc: 'TradingView lightweight-charts 5.2.0 — CandlestickSeries + HistogramSeries 네이티브.',
  },
];

export default function MockupsIndexPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-[length:var(--t-h2)] font-semibold">
          Phase 09.2 — 일봉차트 라이브러리 비교 mockup
        </h1>
        <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
          종목 005930 (삼성전자) · 1M / 3M / 6M / 1Y · 한국식 색상 (양봉 빨강 / 음봉
          파랑) · Phase 3 디자인 토큰 통합
        </p>
      </header>

      <div className="space-y-3">
        {MOCKUPS.map((m) => (
          <Link key={m.href} href={m.href} className="block">
            <Card className="p-4 transition-colors hover:bg-[var(--muted)]">
              <h2 className="text-[length:var(--t-base)] font-semibold">
                {m.title}
              </h2>
              <p className="mt-1 text-[length:var(--t-sm)] text-[var(--muted-fg)]">
                {m.desc}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
