'use client';

/**
 * FeedRows — 뉴스·공시 글 줄 (Phase 41 D-17 · D-20 · 목업 `.fr`).
 *
 * ② 작업대 돌파 상세와 ③ 상따 카드 띠(41-07)가 같이 쓴다.
 * - 줄: 시각(`formatFeedTime`) · 「공시」/「뉴스」 배지 · 제목(한 줄 말줄임) · 자료원.
 * - 제목: `url` 이 있으면 새 창 링크 · 없으면 글자(D-20 — 공시 · 아직 네이버에 없는 한투 뉴스). 「↗」 는 링크 줄 자료원에만.
 * - 자료원은 늘 보인다(D-20): 넓은 폭은 오른쪽 칸, 좁은 폭은 제목 아래 줄. 경계는 쓰는 자리의 기존 컨테이너 경계 그대로 —
 *   작업대 `wb` 700 · 상따 카드 `lc` 685(globals.css §2.2b 정본 · 새 경계 없음). Tailwind 가 스캔하도록 band 별 리터럴 두 벌.
 * - 새 글: 문맥 강조 시계(`useStockFeedIsNew`)가 참인 줄은 `data-new` + `--new-bg`. 이 부품이 1초마다 다시 그려지므로
 *   5Hz 가격 경로(칩 · 표)에는 넣지 않는다.
 * - 받은 순서 · 받은 줄 그대로 그린다 — 거르기 · 합치기 · 정렬 없음(D-14).
 */
import type { StockFeedItem } from '@gh-radar/shared';

import { FeedKindBadge } from '@/components/stock/feed-kind-badge';
import { formatFeedTime } from '@/lib/format-feed-time';
import { cn } from '@/lib/utils';

import { useStockFeedIsNew } from './stock-feed-context';

export const FEED_ROWS_EMPTY_TEXT = '최근 3일 뉴스·공시 없음';

type FeedBand = 'wb' | 'lc';

/** band 별 컨테이너 클래스 — 리터럴 그대로(Tailwind 스캔). */
const BAND: Record<FeedBand, { grid: string; srcCol: string; srcSub: string }> = {
  wb: {
    grid: 'grid-cols-[50px_auto_minmax(0,1fr)] @min-[700px]/wb:grid-cols-[58px_auto_minmax(0,1fr)_auto]',
    srcCol: 'hidden @min-[700px]/wb:inline',
    srcSub: '@min-[700px]/wb:hidden',
  },
  lc: {
    grid: 'grid-cols-[50px_auto_minmax(0,1fr)] @min-[685px]/lc:grid-cols-[58px_auto_minmax(0,1fr)_auto]',
    srcCol: 'hidden @min-[685px]/lc:inline',
    srcSub: '@min-[685px]/lc:hidden',
  },
};

export interface FeedRowsProps {
  items: readonly StockFeedItem[];
  band: FeedBand;
  /** 빈 목록 문구 — 기본 「최근 3일 뉴스·공시 없음」. */
  emptyText?: string;
  className?: string;
}

export function FeedRows({ items, band, emptyText = FEED_ROWS_EMPTY_TEXT, className }: FeedRowsProps) {
  const isNew = useStockFeedIsNew();
  if (items.length === 0) {
    return (
      <p data-slot="feed-rows-empty" className={cn('m-0 py-1.5 text-[12px] text-[var(--muted-fg)]', className)}>
        {emptyText}
      </p>
    );
  }
  const now = new Date();
  const b = BAND[band];
  return (
    <ul data-slot="feed-rows" className={cn('m-0 min-w-0 list-none p-0', className)}>
      {items.map((it) => {
        const fresh = isNew(it.id);
        const source = it.url ? `${it.source} ↗` : it.source;
        return (
          <li
            key={it.id}
            data-slot="feed-row"
            data-kind={it.kind}
            data-new={fresh ? 'true' : undefined}
            className={cn(
              'grid min-w-0 items-baseline gap-2 rounded-[4px] px-1 py-1.5 text-[13px] [&+&]:border-t [&+&]:border-[var(--border-subtle)]',
              b.grid,
              fresh && 'bg-[var(--new-bg)]',
            )}
          >
            <time dateTime={it.publishedAt} className="mono text-[11.5px] whitespace-nowrap text-[var(--muted-fg)]">
              {formatFeedTime(it.publishedAt, it.kind, now)}
            </time>
            <FeedKindBadge kind={it.kind} />
            <span className="min-w-0">
              {it.url ? (
                <a
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={it.title}
                  className="block truncate text-[var(--fg)] no-underline hover:underline"
                >
                  {it.title}
                </a>
              ) : (
                <span title={it.title} className="block truncate text-[var(--fg)]">
                  {it.title}
                </span>
              )}
              <span
                data-slot="feed-row-source-sub"
                className={cn('block truncate text-[11px] text-[var(--muted-fg)]', b.srcSub)}
              >
                {source}
              </span>
            </span>
            <span
              data-slot="feed-row-source"
              className={cn('text-[11px] whitespace-nowrap text-[var(--muted-fg)]', b.srcCol)}
            >
              {source}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
