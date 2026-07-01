'use client';

import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { HomeEmpty } from '@/components/home/home-empty';
import { HomeHeader } from '@/components/home/home-header';
import { HomeSkeleton } from '@/components/home/home-skeleton';
import { SoloCard } from '@/components/home/solo-card';
import { ThemeCard } from '@/components/home/theme-card';
import type {
  HomeSnapshotIndexEntry,
  HomeSurgeSingle,
  HomeSurgeTheme,
  HomeThemeSnapshot,
} from '@gh-radar/shared';

/**
 * `/home-preview` — Phase 13 Plan 04 시각 검증 전용 프리뷰 (임시).
 *
 * home-client 는 라이브 /api/home 을 호출하므로, 네트워크 무관하게 홈 컴포넌트 세트를
 * populated + empty 변형으로 렌더해 UI-SPEC(라이트/다크) 대조 검증한다. **Plan 05 가
 * `/` 루트에 실 마운트 시 이 프리뷰 라우트는 제거**된다(검증용 스캐폴드).
 */

const mockThemes: HomeSurgeTheme[] = [
  {
    name: '2차전지 소재',
    reason: '美 IRA 보조금 확대 기대에 양극재·전구체 밸류체인 동반 강세.',
    stocks: [
      { code: '247540', name: '에코프로비엠', changeRate: 24.1 },
      { code: '066970', name: '엘앤에프', changeRate: 21.3 },
      { code: '003670', name: '포스코퓨처엠', changeRate: 20.8 },
      { code: '450080', name: '에코프로머티', changeRate: 20.5 },
      { code: '137400', name: '피엔티', changeRate: 20.2 },
    ],
    news: [
      {
        title: '美 IRA 세부지침 발표…국내 양극재 수혜 전망',
        url: 'https://example.com/news/ira',
        source: '연합인포맥스',
      },
      {
        title: '에코프로비엠, 유럽 완성차와 장기 공급계약',
        url: 'https://example.com/news/ecopro',
        source: '한국경제',
      },
    ],
  },
  {
    name: '초전도체',
    reason: '국내 연구진 상온초전도 재현 논문 프리프린트 공개에 관련주 재부각.',
    stocks: [
      { code: '065350', name: '신성델타테크', changeRate: 29.9 },
      { code: '294630', name: '서남', changeRate: 25.4 },
    ],
    news: [
      {
        title: '"상온초전도 재현" 프리프린트 공개…학계 검증 착수',
        url: 'https://example.com/news/superconductor',
        source: '네이버뉴스',
      },
    ],
  },
];

const mockSingles: HomeSurgeSingle[] = [
  {
    code: '042700',
    name: '한미반도체',
    changeRate: 22.4,
    reason: null,
    news: [
      {
        title: 'HBM 장비 신규 수주 공시…목표가 일제히 상향',
        url: 'https://example.com/news/hbm',
        source: '매일경제',
      },
    ],
  },
];

// UTC 시각 = KST 09:30~15:30 (KST = UTC+9). 00:30Z=09:30 KST … 06:30Z=15:30 KST 마감.
// index 는 최신순(desc) — server 계약과 동일.
const mockIndex: HomeSnapshotIndexEntry[] = [
  '06:30', '05:30', '04:30', '03:30', '02:30', '01:30', '00:30',
].map((hm) => ({
  tradeDate: '2026-07-01',
  capturedAt: `2026-07-01T${hm}:00.000Z`,
  themeCount: 2,
  stockCount: 6,
  isCarried: false,
}));

const mockSnapshot: HomeThemeSnapshot = {
  tradeDate: '2026-07-01',
  capturedAt: '2026-07-01T06:30:00.000Z', // 15:30 KST 마감 슬롯
  themeCount: 2,
  stockCount: 6,
  isCarried: false,
  payload: {
    threshold: 20,
    marketStatus: 'closed',
    themes: mockThemes,
    singles: mockSingles,
  },
};

export default function HomePreviewPage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 md:gap-12">
        {/* ── populated ─────────────────────────────── */}
        <section className="flex flex-col gap-[var(--s-4)]">
          <p className="text-[length:var(--t-caption)] uppercase tracking-wide text-[var(--muted-fg)]">
            preview · populated
          </p>
          <HomeHeader
            snapshot={mockSnapshot}
            index={mockIndex}
            selected={{ date: '2026-07-01', capturedAt: mockSnapshot.capturedAt }}
            onSelectDate={() => {}}
            onSelectSlot={() => {}}
            onToday={() => {}}
          />
          <div className="mt-[var(--s-2)] flex items-center gap-2">
            <h2 className="text-[length:var(--t-h4)] font-extrabold text-[var(--fg)]">
              주도 테마
            </h2>
            <span className="mono rounded-full bg-[var(--muted)] px-2 py-[2px] text-[length:var(--t-caption)] text-[var(--muted-fg)]">
              {mockThemes.length}
            </span>
          </div>
          {mockThemes.map((t, i) => (
            <ThemeCard key={`${t.name}-${i}`} theme={t} />
          ))}
          <div className="mt-[var(--s-2)] flex items-center gap-2">
            <h2 className="text-[length:var(--t-h4)] font-extrabold text-[var(--fg)]">
              개별 급등
            </h2>
            <span className="mono rounded-full bg-[var(--muted)] px-2 py-[2px] text-[length:var(--t-caption)] text-[var(--muted-fg)]">
              {mockSingles.length}
            </span>
          </div>
          {mockSingles.map((s) => (
            <SoloCard key={s.code} single={s} />
          ))}
        </section>

        {/* ── empty ─────────────────────────────────── */}
        <section className="flex flex-col gap-[var(--s-4)]">
          <p className="text-[length:var(--t-caption)] uppercase tracking-wide text-[var(--muted-fg)]">
            preview · empty
          </p>
          <HomeEmpty />
        </section>

        {/* ── skeleton ──────────────────────────────── */}
        <section className="flex flex-col gap-[var(--s-4)]">
          <p className="text-[length:var(--t-caption)] uppercase tracking-wide text-[var(--muted-fg)]">
            preview · skeleton
          </p>
          <HomeSkeleton />
        </section>
      </div>
    </AppShell>
  );
}
