/**
 * Colors Section — UI-SPEC §1.1~1.2, §7.1, §8.5.3 / §8.5.6
 *
 * Light/Dark dual-grid swatch. 각 토큰은 `.dark` 클래스 override 로만 변환되므로,
 * Dark 컬럼은 최외곽에 `dark` 클래스를 강제 부여한 스코프에서 동일 토큰을 렌더한다.
 */

type TokenRow = {
  name: string;
  lightOKLCH: string;
  darkOKLCH: string;
  use: string;
};

const NEUTRAL_TOKENS: TokenRow[] = [
  { name: '--bg', lightOKLCH: 'oklch(1 0 0)', darkOKLCH: 'oklch(0.08 0 0)', use: '페이지 배경' },
  { name: '--fg', lightOKLCH: 'oklch(0.18 0 0)', darkOKLCH: 'oklch(0.96 0 0)', use: '본문 텍스트' },
  { name: '--muted', lightOKLCH: 'oklch(0.96 0 0)', darkOKLCH: 'oklch(0.18 0 0)', use: '섹션 배경' },
  { name: '--muted-fg', lightOKLCH: 'oklch(0.50 0 0)', darkOKLCH: 'oklch(0.65 0 0)', use: '보조 텍스트' },
  { name: '--border', lightOKLCH: 'oklch(0.92 0 0)', darkOKLCH: 'oklch(0.24 0 0)', use: '기본 경계' },
  { name: '--border-subtle', lightOKLCH: 'oklch(0.18 0 0 / 0.06)', darkOKLCH: 'oklch(1 0 0 / 0.06)', use: '행 구분 hairline' },
  { name: '--card', lightOKLCH: 'oklch(1 0 0)', darkOKLCH: 'oklch(0.12 0 0)', use: '카드 배경' },
  { name: '--popover', lightOKLCH: 'oklch(1 0 0)', darkOKLCH: 'oklch(0.14 0 0)', use: '팝오버/툴팁' },
];

const BRAND_TOKENS: TokenRow[] = [
  { name: '--primary', lightOKLCH: 'oklch(0.63 0.18 250)', darkOKLCH: 'oklch(0.72 0.16 250)', use: 'CTA / Toss Blue' },
  { name: '--secondary', lightOKLCH: 'oklch(0.96 0 0)', darkOKLCH: 'oklch(0.18 0 0)', use: '보조 버튼 배경' },
  { name: '--accent', lightOKLCH: 'oklch(0.95 0.03 250)', darkOKLCH: 'oklch(0.22 0.05 250)', use: '강조 영역' },
  { name: '--destructive', lightOKLCH: 'oklch(0.66 0.20 22)', darkOKLCH: 'oklch(0.72 0.19 22)', use: '삭제/경고' },
  { name: '--ring', lightOKLCH: 'oklch(0.63 0.18 250)', darkOKLCH: 'oklch(0.72 0.16 250)', use: '포커스 링' },
];

const FIN_TOKENS: TokenRow[] = [
  { name: '--up', lightOKLCH: 'oklch(0.66 0.20 22)', darkOKLCH: 'oklch(0.72 0.19 22)', use: '상승 (Toss Red)' },
  { name: '--down', lightOKLCH: 'oklch(0.63 0.18 250)', darkOKLCH: 'oklch(0.72 0.16 250)', use: '하락 (Toss Blue)' },
  { name: '--flat', lightOKLCH: 'oklch(0.55 0 0)', darkOKLCH: 'oklch(0.65 0 0)', use: '보합' },
  { name: '--up-bg', lightOKLCH: 'oklch(0.97 0.03 22)', darkOKLCH: 'oklch(0.22 0.06 22)', use: '상승 배지 배경' },
  { name: '--down-bg', lightOKLCH: 'oklch(0.97 0.03 250)', darkOKLCH: 'oklch(0.22 0.05 250)', use: '하락 배지 배경' },
];

/** 단일 swatch — 현재 스코프의 CSS 변수 값을 `background: var(...)` 로 그대로 표시. */
function Swatch({ token }: { token: string }) {
  return (
    <div
      className="h-10 w-10 shrink-0 rounded-[var(--r)] border border-[var(--border)]"
      style={{ background: `var(${token})` }}
      aria-label={`${token} swatch`}
    />
  );
}

function TokenTable({ rows, scope }: { rows: TokenRow[]; scope: 'light' | 'dark' }) {
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.name} className="flex items-center gap-3 rounded-[var(--r)] bg-[var(--card)] p-3">
          <Swatch token={row.name} />
          <div className="flex-1 min-w-0">
            <div className="mono text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
              {row.name}
            </div>
            <div className="mono text-[length:var(--t-caption)] text-[var(--muted-fg)] truncate">
              {scope === 'light' ? row.lightOKLCH : row.darkOKLCH}
            </div>
            <div className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">{row.use}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Light/Dark 듀얼 그리드. Dark 컬럼은 `className="dark"` 로 스코프 override.
 * `bg-[var(--bg)]` 등 토큰 기반 스타일이 해당 스코프에서 자동 재계산된다.
 */
function DualGrid({ title, rows }: { title: string; rows: TokenRow[] }) {
  return (
    <div className="space-y-3">
      <h3 className="text-[length:var(--t-h4)] font-semibold">{title}</h3>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg)] p-4">
          <div className="mb-3 text-[length:var(--t-caption)] font-semibold uppercase tracking-wider text-[var(--muted-fg)]">
            Light
          </div>
          <TokenTable rows={rows} scope="light" />
        </div>
        <div className="dark rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg)] p-4">
          <div className="mb-3 text-[length:var(--t-caption)] font-semibold uppercase tracking-wider text-[var(--muted-fg)]">
            Dark
          </div>
          <TokenTable rows={rows} scope="dark" />
        </div>
      </div>
    </div>
  );
}

function ContrastTable() {
  // UI-SPEC §7.1 표 — 런타임 계산 없이 문서 값 그대로 노출.
  const rows = [
    { pair: '--fg on --bg', light: '~14:1', dark: '~16:1', base: '4.5:1 본문 ✓' },
    { pair: '--muted-fg on --bg', light: '~4.8:1', dark: '~5.2:1', base: '4.5:1 본문 ✓' },
    { pair: '--primary-fg on --primary', light: '~5.1:1', dark: '~6.8:1', base: '4.5:1 ✓' },
    { pair: '--up on --bg', light: '~4.6:1', dark: '~5.0:1', base: '4.5:1 텍스트 ✓' },
    { pair: '--down on --bg', light: '~4.8:1', dark: '~5.3:1', base: '4.5:1 텍스트 ✓' },
    { pair: '--up on --up-bg', light: '~4.7:1', dark: '~5.1:1', base: '4.5:1 배지 텍스트 ✓' },
    { pair: '--down on --down-bg', light: '~4.9:1', dark: '~5.4:1', base: '4.5:1 배지 텍스트 ✓' },
    { pair: '--border on --bg', light: '3:1', dark: '3:1', base: '3:1 UI 컴포넌트 ✓' },
  ];

  return (
    <div className="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>쌍</th>
            <th>Light</th>
            <th>Dark</th>
            <th>기준</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.pair}>
              <td className="mono">{r.pair}</td>
              <td>{r.light}</td>
              <td>{r.dark}</td>
              <td>{r.base}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ColorsSection() {
  return (
    <section className="space-y-6">
      <div>
        <h2 id="colors" className="scroll-mt-20 text-[length:var(--t-h2)] font-bold">
          1. Colors
        </h2>
        <p className="mt-1 text-[length:var(--t-sm)] text-[var(--muted-fg)]">
          Light/Dark dual-grid 와 WCAG 2.1 AA 대비 표 (UI-SPEC §1.1~§1.2, §7.1).
        </p>
      </div>

      <DualGrid title="Neutral · Surface" rows={NEUTRAL_TOKENS} />
      <DualGrid title="Brand" rows={BRAND_TOKENS} />

      <div className="rounded-[var(--r-md)] border-2 border-[var(--primary)] bg-[var(--accent)] p-4">
        <h3 className="text-[length:var(--t-h4)] font-semibold text-[var(--accent-fg)]">
          금융 세만틱 컬러 (한국 시장 관례)
        </h3>
        <p className="mt-1 text-[length:var(--t-sm)] text-[var(--accent-fg)]">
          상승 = 빨강(--up), 하락 = 파랑(--down), 보합 = 회색(--flat). 서구 녹/적 관례 사용 금지.
        </p>
      </div>
      <DualGrid title="Financial Semantic" rows={FIN_TOKENS} />

      <div>
        <h3 className="mb-2 text-[length:var(--t-h4)] font-semibold">WCAG 2.1 AA 대비 (§7.1)</h3>
        <ContrastTable />
      </div>
    </section>
  );
}
