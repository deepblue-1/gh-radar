/**
 * Spacing Section — UI-SPEC §1.3, §1.4
 *
 * Spacing scale (--s-1 ~ --s-10) 가로 막대 시각화 + Radius 박스.
 */

const SPACING = [
  { token: '--s-1', value: '4px' },
  { token: '--s-2', value: '8px' },
  { token: '--s-3', value: '12px' },
  { token: '--s-4', value: '16px' },
  { token: '--s-5', value: '24px' },
  { token: '--s-6', value: '32px' },
  { token: '--s-8', value: '48px' },
  { token: '--s-10', value: '64px' },
] as const;

const RADIUS = [
  { token: '--r-sm', value: '4px', use: '스켈레톤, 칩' },
  { token: '--r', value: '6px', use: '버튼, 인풋, 배지(사각)' },
  { token: '--r-md', value: '8px', use: '카드, 테이블 래퍼' },
  { token: '--r-lg', value: '12px', use: '모달, 대형 카드' },
] as const;

export function SpacingSection() {
  return (
    <section className="space-y-6">
      <div>
        <h2 id="spacing" className="scroll-mt-20 text-[length:var(--t-h2)] font-bold">
          3. Spacing &amp; Radius
        </h2>
        <p className="mt-1 text-[length:var(--t-sm)] text-[var(--muted-fg)]">
          4px 스케일 (UI-SPEC §1.3) · Radius 4 단계 (§1.4). 모든 margin/padding/gap 은 이 토큰만 사용.
        </p>
      </div>

      {/* Spacing 가로 막대 */}
      <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-3 text-[length:var(--t-caption)] font-semibold uppercase tracking-wider text-[var(--muted-fg)]">
          Spacing Scale
        </div>
        <div className="space-y-2">
          {SPACING.map((s) => (
            <div key={s.token} className="flex items-center gap-3">
              <div className="mono w-24 shrink-0 text-[length:var(--t-sm)] font-semibold">{s.token}</div>
              <div className="mono w-16 shrink-0 text-[length:var(--t-caption)] text-[var(--muted-fg)]">
                {s.value}
              </div>
              <div
                className="h-5 rounded-[var(--r-sm)] bg-[var(--primary)]"
                style={{ width: `var(${s.token})` }}
                aria-hidden="true"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Radius 박스 */}
      <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-3 text-[length:var(--t-caption)] font-semibold uppercase tracking-wider text-[var(--muted-fg)]">
          Radius
        </div>
        <div className="flex flex-wrap gap-4">
          {RADIUS.map((r) => (
            <div key={r.token} className="flex flex-col items-center gap-2">
              <div
                className="h-16 w-16 border-2 border-[var(--primary)] bg-[var(--accent)]"
                style={{ borderRadius: `var(${r.token})` }}
                aria-hidden="true"
              />
              <div className="mono text-[length:var(--t-caption)] font-semibold">{r.token}</div>
              <div className="mono text-[length:var(--t-caption)] text-[var(--muted-fg)]">{r.value}</div>
              <div className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">{r.use}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
