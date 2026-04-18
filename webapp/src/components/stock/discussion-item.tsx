import type { Discussion } from '@gh-radar/shared';
import {
  formatDiscussionCardDate,
  formatDiscussionFullDate,
} from '@/lib/format-discussion-date';

/**
 * DiscussionItem — Phase 08 UI-SPEC §Component Inventory.
 *
 * variants:
 *  - `card` (상세 페이지 / StockDiscussionSection): 세로 flex (제목 2줄 clamp + body 2줄 clamp + 메타 inline)
 *  - `full` (`/stocks/[code]/discussions` 페이지 Compact): 3열 grid [1fr_140px_120px]
 *
 * - `<a target="_blank" rel="noopener noreferrer">` 강제 (T-02 tabnabbing 방어)
 * - `{discussion.title}` / `{discussion.body}` React text escape 만 사용 — raw HTML 주입 API 금지 (T-01 XSS)
 * - 작성자 닉네임 마스킹 없음(D5) — 네이버 닉네임 그대로 표시
 * - 본문 preview line-clamp-2 (D5)
 */
export interface DiscussionItemProps {
  discussion: Discussion;
  variant: 'card' | 'full';
}

export function DiscussionItem({ discussion, variant }: DiscussionItemProps) {
  const d = discussion;

  if (variant === 'card') {
    return (
      <li
        data-testid="discussion-item"
        className="flex flex-col gap-1 py-3 min-h-14 px-2 rounded-md hover:bg-[var(--muted)]/40 transition-colors"
      >
        <a
          href={d.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${d.title} 원문 보기 (새 창)`}
          className="line-clamp-2 text-[length:var(--t-sm)] font-medium text-[var(--fg)] hover:text-[var(--primary)]"
        >
          {d.title}
        </a>
        {d.body ? (
          <p className="line-clamp-2 text-[length:var(--t-sm)] text-[var(--muted-fg)]">
            {d.body}
          </p>
        ) : null}
        <div className="flex items-center gap-2 text-[length:var(--t-caption)] text-[var(--muted-fg)]">
          {d.author ? (
            <>
              <span className="truncate max-w-[40%]">{d.author}</span>
              <span aria-hidden>·</span>
            </>
          ) : null}
          <time className="mono" dateTime={d.postedAt}>
            {formatDiscussionCardDate(d.postedAt)}
          </time>
        </div>
      </li>
    );
  }

  // 'full' variant — Compact 3열 grid (Plan 08-05 가 주로 사용. 본 plan 은 export 만)
  return (
    <li
      data-testid="discussion-item"
      className="grid items-center gap-3 py-2 min-h-11 px-2 rounded-md hover:bg-[var(--muted)]/40 transition-colors md:grid-cols-[1fr_140px_120px]"
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <a
          href={d.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${d.title} 원문 보기 (새 창)`}
          className="line-clamp-1 text-[length:var(--t-sm)] font-medium text-[var(--fg)] hover:text-[var(--primary)]"
        >
          {d.title}
        </a>
        {d.body ? (
          <p className="line-clamp-1 text-[length:var(--t-caption)] text-[var(--muted-fg)]">
            {d.body}
          </p>
        ) : null}
      </div>
      <span className="truncate text-[length:var(--t-caption)] text-[var(--muted-fg)]">
        {d.author ?? ''}
      </span>
      <time
        className="mono text-right text-[length:var(--t-caption)] text-[var(--muted-fg)]"
        dateTime={d.postedAt}
      >
        {formatDiscussionFullDate(d.postedAt)}
      </time>
    </li>
  );
}
