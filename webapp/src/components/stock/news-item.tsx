import type { NewsArticle } from '@gh-radar/shared';
import { formatNewsCardDate, formatNewsFullDate } from '@/lib/format-news-date';

/**
 * NewsItem — Phase 07 UI-SPEC §Component Inventory.
 *
 * variants:
 *  - `card` (상세 페이지 / StockNewsSection): grid [1fr_88px_78px]
 *  - `full` (`/news` 페이지): grid [1fr_120px_140px]
 *
 * - `<a target="_blank" rel="noopener noreferrer">` 강제 (T-02 tabnabbing 방어)
 * - `{article.title}` React text escape 만 사용 — raw HTML 주입 API 금지 (T-03 XSS)
 * - 모바일에서는 source 컬럼 숨김 (`hidden sm:block`)
 */
export interface NewsItemProps {
  article: NewsArticle;
  variant: 'card' | 'full';
}

export function NewsItem({ article, variant }: NewsItemProps) {
  const isFull = variant === 'full';
  const dateLabel = isFull
    ? formatNewsFullDate(article.publishedAt)
    : formatNewsCardDate(article.publishedAt);
  const source = article.source ?? '';

  return (
    <li
      data-testid="news-item"
      className={`grid items-center gap-3 py-3 min-h-11 px-2 rounded-md hover:bg-[var(--muted)]/40 transition-colors ${
        isFull ? 'grid-cols-[1fr_120px_140px]' : 'grid-cols-[1fr_88px_78px]'
      }`}
    >
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${article.title} 원문 보기 (새 창)`}
        className="line-clamp-2 text-[length:var(--t-sm)] font-medium text-[var(--fg)] hover:text-[var(--primary)]"
      >
        {article.title}
      </a>
      <span className="mono text-[11px] text-[var(--muted-fg)] truncate text-right hidden sm:block">
        {source}
      </span>
      <time
        className="mono text-[length:var(--t-caption)] text-[var(--muted-fg)] text-right"
        dateTime={article.publishedAt}
      >
        {dateLabel}
      </time>
    </li>
  );
}
