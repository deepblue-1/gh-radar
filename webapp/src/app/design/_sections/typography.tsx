/**
 * Typography Section — UI-SPEC §1.5, §2
 *
 * size × weight 매트릭스 + 한/영/숫자 샘플 + `.mono` 유틸 시연.
 */

const SIZES = [
  { token: '--t-caption', px: '12px', sampleClass: 'text-[length:var(--t-caption)]' },
  { token: '--t-sm', px: '14px', sampleClass: 'text-[length:var(--t-sm)]' },
  { token: '--t-base', px: '16px', sampleClass: 'text-[length:var(--t-base)]' },
  { token: '--t-lg', px: '18px', sampleClass: 'text-[length:var(--t-lg)]' },
  { token: '--t-h3', px: '20px', sampleClass: 'text-[length:var(--t-h3)]' },
  { token: '--t-h2', px: '24px', sampleClass: 'text-[length:var(--t-h2)]' },
  { token: '--t-h1', px: '30px', sampleClass: 'text-[length:var(--t-h1)]' },
] as const;

const WEIGHTS = [
  { token: 400, cls: 'font-normal' },
  { token: 500, cls: 'font-medium' },
  { token: 600, cls: 'font-semibold' },
  { token: 700, cls: 'font-bold' },
] as const;

export function TypographySection() {
  return (
    <section className="space-y-6">
      <div>
        <h2 id="typography" className="scroll-mt-20 text-[length:var(--t-h2)] font-bold">
          2. Typography
        </h2>
        <p className="mt-1 text-[length:var(--t-sm)] text-[var(--muted-fg)]">
          16px base · Pretendard Variable (본문) · Geist Mono (숫자, `.mono` 유틸, ss01 slashed zero).
        </p>
      </div>

      {/* Size × Weight 매트릭스 */}
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Token</th>
              <th>Size</th>
              {WEIGHTS.map((w) => (
                <th key={w.token}>{w.token}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SIZES.map((s) => (
              <tr key={s.token}>
                <td className="mono">{s.token}</td>
                <td className="mono">{s.px}</td>
                {WEIGHTS.map((w) => (
                  <td key={w.token} className={`${s.sampleClass} ${w.cls}`}>
                    Aa 가
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 언어/스크립트 샘플 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">한글 (Pretendard)</div>
          <div className="mt-2 text-[length:var(--t-h3)] font-semibold">코스피 급등 종목</div>
        </div>
        <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">English (Pretendard)</div>
          <div className="mt-2 text-[length:var(--t-h3)] font-semibold">KOSPI Leading Gainers</div>
        </div>
        <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">숫자 (Geist Mono, .mono)</div>
          <div className="mono mt-2 text-[length:var(--t-h3)] font-semibold">3,504,200</div>
        </div>
      </div>

      {/* `.mono` 유틸 적용 대비 행 */}
      <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--muted)] p-4">
        <div className="text-[length:var(--t-caption)] font-semibold uppercase tracking-wider text-[var(--muted-fg)]">
          `.mono` 유틸 (ss01 slashed zero · tabular)
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
          <div>
            <span className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">Without .mono: </span>
            <span className="text-[length:var(--t-lg)]">005930 · 0.00 · 1,234,567</span>
          </div>
          <div>
            <span className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">With .mono: </span>
            <span className="mono text-[length:var(--t-lg)]">005930 · 0.00 · 1,234,567</span>
          </div>
        </div>
      </div>
    </section>
  );
}
