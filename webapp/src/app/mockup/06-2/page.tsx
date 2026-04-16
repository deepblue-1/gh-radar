import Link from 'next/link';

export const metadata = {
  title: 'Phase 06.2 Mockups · gh-radar',
  description: 'Auth + Watchlist 디자인 목업 비교 — Baseline 3 + frontend-design 3',
};

const SCREENS = [
  {
    href: '/mockup/06-2/login',
    title: '/login 페이지',
    description: 'Google OAuth 진입 + ?error= 4종 + Card 중앙 정렬',
    ref: 'D-14, D-15',
  },
  {
    href: '/mockup/06-2/shell',
    title: 'AppShell 사이드바 + UserSection',
    description: '사이드바 활성화 · 하단 아바타/이메일/로그아웃',
    ref: 'D-16, D-17',
  },
  {
    href: '/mockup/06-2/watchlist',
    title: '/watchlist 페이지',
    description: 'Scanner 동형 Table+Card 듀얼 · 페이지 헤더 갱신시각 · Empty state',
    ref: 'D-23, D-24, D-27',
  },
  {
    href: '/mockup/06-2/star',
    title: '⭐ 토글',
    description: 'StockHero · Scanner 행 배치 · 4상태 (Unset/Set/Loading/Disabled)',
    ref: 'D-26',
  },
];

export default function MockupIndex() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted-fg)]">
          Phase 06.2 · Auth + Watchlist
        </span>
        <h1 className="text-2xl font-semibold">디자인 목업 비교</h1>
        <p className="max-w-2xl text-sm text-[var(--muted-fg)] leading-normal">
          각 화면마다 <strong>Baseline 3</strong> (UI-SPEC 잠금 결정 준수, Claude 해석
          변주) + <strong>frontend-design 3</strong> (skill 자율 제안) = 6개
          변형을 좌우로 비교합니다. 라이트/다크 테마 토글은 헤더의 테마 버튼을
          사용하세요.
        </p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2">
        {SCREENS.map((screen) => (
          <li key={screen.href}>
            <Link
              href={screen.href}
              className="group flex h-full flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 transition hover:border-[var(--primary)] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold group-hover:text-[var(--primary)]">
                  {screen.title}
                </h2>
                <span className="text-xs text-[var(--muted-fg)]">{screen.ref}</span>
              </div>
              <p className="text-sm text-[var(--muted-fg)] leading-normal">
                {screen.description}
              </p>
              <span className="mt-auto text-xs font-medium text-[var(--primary)]">
                목업 보기 →
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <footer className="rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)]/50 p-4 text-xs text-[var(--muted-fg)] leading-relaxed">
        <strong className="text-[var(--fg)]">참고</strong> — 목업은 모두 static
        preview 입니다. 클릭/토글은 동작하지만 Supabase 연동 없음. 실제 구현은
        Phase 06.2 실행 단계에서 수행됩니다. 목업 경로(`/mockup/06-2/*`)는 Phase
        완료 후 삭제 예정.
      </footer>
    </div>
  );
}
