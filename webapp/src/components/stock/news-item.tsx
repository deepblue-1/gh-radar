import type { StockFeedItem } from '@gh-radar/shared';
import { formatNewsCardDate, formatNewsFullDate } from '@/lib/format-news-date';
import { FeedKindBadge } from './feed-kind-badge';

/**
 * NewsItem — Phase 07 UI-SPEC §Component Inventory · Phase 41 D-16 · D-20(목업 ① A).
 *
 * 종목 상세 · 종목 정보 창 · 전체 목록이 이 부품 하나를 같이 쓴다(D-15 ①).
 *
 * variants:
 *  - `card` (상세 페이지 / StockNewsSection): sm+ [1fr_88px_78px], mobile [1fr_78px]
 *  - `full` (`/news` 페이지): sm+ [1fr_120px_140px], mobile [1fr_140px]
 *
 * - 제목 앞에 「공시」/「뉴스」 배지(`FeedKindBadge`).
 * - 원문 링크(`url`)가 있는 줄만 `<a target="_blank" rel="noopener noreferrer">` (T-02 tabnabbing 방어) + 「↗」.
 *   링크가 없는 줄(공시 · 네이버에 아직 없는 한투 뉴스)은 제목이 링크 아닌 글자(`news-item-nolink`)이고 「↗」 가 없다.
 * - 자료원 이름은 항상 보인다 — PC 는 자료원 열, 폰은 그 열이 숨는 대신 제목 아래 보조 줄(`news-item-src-sub`).
 * - `{article.title}` · `{article.source}` 는 React text escape 만 사용 — raw HTML 주입 API 금지 (T-03 XSS)
 * - 모바일에서는 source 컬럼을 숨김과 동시에 그 칼럼의 grid track 도 축소하여
 *   타임스탬프 왼쪽의 빈 여백 없이 제목이 최대 폭을 쓰도록 한다.
 */
export interface NewsItemProps {
  article: StockFeedItem;
  variant: 'card' | 'full';
}

export function NewsItem({ article, variant }: NewsItemProps) {
  const isFull = variant === 'full';
  const dateLabel = isFull
    ? formatNewsFullDate(article.publishedAt)
    : formatNewsCardDate(article.publishedAt);
  const hasLink = article.url !== null && article.url !== '';
  const sourceLabel = `${article.source}${hasLink ? ' ↗' : ''}`;

  const titleClass =
    'line-clamp-2 text-[length:var(--t-sm)] font-medium text-[var(--fg)]';
  const badge = <FeedKindBadge kind={article.kind} className="mr-1.5 align-[1px]" />;

  return (
    <li
      data-testid="news-item"
      className={`grid items-center gap-3 py-3 min-h-11 px-2 rounded-md hover:bg-[var(--muted)]/40 transition-colors ${
        isFull
          ? 'grid-cols-[1fr_140px] sm:grid-cols-[1fr_120px_140px]'
          : 'grid-cols-[1fr_78px] sm:grid-cols-[1fr_88px_78px]'
      }`}
    >
      <div className="min-w-0">
        {hasLink ? (
          <a
            href={article.url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${article.title} 원문 보기 (새 창)`}
            className={`${titleClass} hover:text-[var(--primary)]`}
          >
            {badge}
            {article.title}
          </a>
        ) : (
          <span data-slot="news-item-nolink" className={titleClass}>
            {badge}
            {article.title}
          </span>
        )}
        <span
          data-slot="news-item-src-sub"
          className="mt-0.5 block truncate text-[11px] text-[var(--muted-fg)] sm:hidden"
        >
          {sourceLabel}
        </span>
      </div>
      <span
        data-slot="news-item-src"
        className="mono text-[11px] text-[var(--muted-fg)] truncate text-right hidden sm:block"
      >
        {sourceLabel}
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
