import Link from 'next/link';
import { Sparkles } from 'lucide-react';

/**
 * HomeEmpty — 빈 상태 (13-UI-SPEC §Component Inventory · empty + §Copywriting).
 *
 * 급등 없는 날(snapshot null 또는 themes+singles 모두 비어있음)의 첫 화면.
 * dashed-border 카드(border = color-mix(--primary 30%, --border)) + 원형 --accent 아이콘
 * (lucide Sparkles) + heading(--t-h4 800) + body(muted 14/400, max-w 44ch) +
 * secondary CTA "스캐너로 이동" → /scanner. role="status".
 */
export function HomeEmpty() {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-[10px] rounded-[var(--r-lg)] border border-dashed border-[color-mix(in_oklch,var(--primary)_30%,var(--border))] bg-[var(--card)] px-6 py-10 text-center"
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-fg)]">
        <Sparkles aria-hidden="true" className="size-5" strokeWidth={1.5} />
      </span>
      <h3 className="text-[length:var(--t-h4)] font-extrabold text-[var(--fg)]">
        오늘은 +20% 급등 종목이 없습니다
      </h3>
      <p className="max-w-[44ch] text-[length:var(--t-sm)] text-[var(--muted-fg)]">
        장중 매시 30분에 갱신됩니다. 상단 날짜를 바꿔 지난 급등 테마를 확인해 보세요.
      </p>
      <Link
        href="/scanner"
        className="rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] px-3 py-[5px] text-[length:var(--t-sm)] font-extrabold text-[var(--fg)] no-underline hover:border-[color-mix(in_oklch,var(--primary)_30%,var(--border))]"
      >
        스캐너로 이동
      </Link>
    </div>
  );
}
