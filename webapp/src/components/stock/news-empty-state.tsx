import { Newspaper } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * NewsEmptyState — Phase 07 UI-SPEC §Component Inventory.
 *
 * - 빈 상태 (수집된 뉴스가 0건) 에 표시
 * - CTA 는 refresh 트리거 — cooldown/refreshing 중 disabled
 * - `role="status"` 로 스크린리더에 상태 전달
 */
export interface NewsEmptyStateProps {
  heading?: string;
  body?: string;
  ctaLabel?: string;
  onCta?: () => void;
  isRefreshing?: boolean;
  cooldownSeconds?: number;
}

export function NewsEmptyState({
  heading = '아직 수집된 뉴스가 없어요',
  body = '새로고침으로 최신 뉴스를 가져와보세요.',
  ctaLabel = '뉴스 새로고침',
  onCta,
  isRefreshing = false,
  cooldownSeconds = 0,
}: NewsEmptyStateProps) {
  const disabled = isRefreshing || cooldownSeconds > 0;
  return (
    <div
      role="status"
      data-testid="news-empty-state"
      className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-6 text-center"
    >
      <Newspaper className="size-10 text-[var(--muted-fg)]" aria-hidden />
      <h3 className="text-[length:var(--t-base)] font-semibold text-[var(--fg)]">
        {heading}
      </h3>
      <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">{body}</p>
      {onCta && (
        <Button onClick={onCta} disabled={disabled} variant="default">
          {cooldownSeconds > 0 ? `${cooldownSeconds}초 후 재시도` : ctaLabel}
        </Button>
      )}
    </div>
  );
}
