/**
 * Layouts Section — UI-SPEC §4
 *
 * AppShell / CenterShell mini mock (iframe 없이 인라인) + 브레이크포인트 행동 설명.
 */

function AppShellMock() {
  return (
    <div className="max-h-[420px] overflow-hidden rounded-[var(--r-md)] border border-[var(--border)]">
      {/* Header */}
      <div className="flex h-10 items-center justify-between border-b border-[var(--border)] bg-[color-mix(in_oklch,var(--bg)_88%,transparent)] px-3">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-[var(--r-sm)] bg-[var(--muted)]" />
          <div className="text-[length:var(--t-caption)] font-bold">gh-radar</div>
        </div>
        <div className="h-5 w-5 rounded-[var(--r-sm)] bg-[var(--muted)]" />
      </div>
      {/* Body */}
      <div className="flex h-[calc(420px-40px)]">
        {/* Sidebar */}
        <aside className="w-40 shrink-0 space-y-1 border-r border-[var(--border)] bg-[var(--muted)] p-2">
          <div className="rounded-[var(--r-sm)] bg-[var(--bg)] px-2 py-1 text-[length:var(--t-caption)] font-semibold">
            · 스캐너
          </div>
          <div className="px-2 py-1 text-[length:var(--t-caption)] text-[var(--muted-fg)]">· 관심 종목</div>
          <div className="px-2 py-1 text-[length:var(--t-caption)] text-[var(--muted-fg)]">· 설정</div>
        </aside>
        {/* Main */}
        <main className="flex-1 space-y-2 p-3">
          <div className="h-4 w-2/3 rounded-[var(--r-sm)] bg-[var(--muted)]" />
          <div className="h-3 w-1/2 rounded-[var(--r-sm)] bg-[var(--muted)]" />
          <div className="h-24 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--card)]" />
        </main>
      </div>
    </div>
  );
}

function CenterShellMock() {
  return (
    <div className="max-h-[420px] overflow-hidden rounded-[var(--r-md)] border border-[var(--border)]">
      <div className="flex h-10 items-center justify-between border-b border-[var(--border)] bg-[color-mix(in_oklch,var(--bg)_88%,transparent)] px-3">
        <div className="text-[length:var(--t-caption)] font-bold">gh-radar</div>
        <div className="h-5 w-5 rounded-[var(--r-sm)] bg-[var(--muted)]" />
      </div>
      <div className="h-[calc(420px-40px)] bg-[var(--muted)] p-3">
        <div className="mx-auto max-w-md space-y-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg)] p-4">
          <div className="h-4 w-1/2 rounded-[var(--r-sm)] bg-[var(--muted)]" />
          <div className="h-3 w-full rounded-[var(--r-sm)] bg-[var(--muted)]" />
          <div className="h-3 w-4/5 rounded-[var(--r-sm)] bg-[var(--muted)]" />
          <div className="h-16 rounded-[var(--r-md)] bg-[var(--muted)]" />
        </div>
      </div>
    </div>
  );
}

export function LayoutsSection() {
  return (
    <section className="space-y-6">
      <div>
        <h2 id="layouts" className="scroll-mt-20 text-[length:var(--t-h2)] font-bold">
          5. Layouts
        </h2>
        <p className="mt-1 text-[length:var(--t-sm)] text-[var(--muted-fg)]">
          AppShell (스캐너/대시보드) + CenterShell (종목 상세). 인라인 mini-preview.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-[length:var(--t-h4)] font-semibold">AppShell</h3>
          <AppShellMock />
        </div>
        <div className="space-y-2">
          <h3 className="text-[length:var(--t-h4)] font-semibold">CenterShell</h3>
          <CenterShellMock />
        </div>
      </div>

      {/* 브레이크포인트 행동 */}
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>뷰포트</th>
              <th>AppShell</th>
              <th>CenterShell</th>
              <th>Density / Row</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="mono">375px (mobile)</td>
              <td>Sidebar → Drawer (Sheet). 햄버거 44×44 터치 타깃. Scrim blur-4px.</td>
              <td>`px-4` 좌우 여백, `max-w-4xl` 중앙 정렬 유지.</td>
              <td>
                <span className="mono">--row-h: 44px</span> (터치 확장, §1.6)
              </td>
            </tr>
            <tr>
              <td className="mono">768px (tablet)</td>
              <td>여전히 Drawer (`&lt;lg`). 콘텐츠 여백 확장 `px-6`.</td>
              <td>`px-6`, 동일 max-w-4xl.</td>
              <td>
                <span className="mono">--row-h: 44px</span> (여전히 모바일 규칙)
              </td>
            </tr>
            <tr>
              <td className="mono">1280px (desktop)</td>
              <td>Sidebar 240px 고정. 헤더 56px sticky + backdrop-blur.</td>
              <td>여백 `px-6`, 본문 중앙.</td>
              <td>
                <span className="mono">--row-h: 36px</span> (default) ·<br />
                <span className="mono">compact 32px</span> 사용 가능
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
