import type { StockFeedKind } from '@gh-radar/shared';

/**
 * FeedKindBadge — Phase 41 D-16 · 목업 `.bd` / `.bd.mini`.
 *
 * 줄 종류 「공시」/「뉴스」 배지. 종목 뉴스 목록(①) · 작업대 돌파(②) · 상따 카드(③) · 홈(④)이
 * 같이 쓴다 — 색은 globals.css 의 `--feed-disc*` · `--feed-news*` 토큰만(공시만 색 · 뉴스는 회색).
 *
 * - `size="full"`(기본): 「공시」/「뉴스」 · 11px · 600 · 둥근 5px · 좌우 6px
 * - `size="mini"`: 좁은 자리용 한 글자 「공」/「뉴」 · 10px · 좌우 4px — 스크린리더용 `aria-label` 에 전체 이름
 * - 바깥 여백(제목 앞 6px · 칩 안 4px 등)은 쓰는 자리가 `className` 으로 준다.
 */
export interface FeedKindBadgeProps {
  kind: StockFeedKind;
  size?: 'full' | 'mini';
  className?: string;
}

const FULL_LABEL: Record<StockFeedKind, string> = { disclosure: '공시', news: '뉴스' };
const MINI_LABEL: Record<StockFeedKind, string> = { disclosure: '공', news: '뉴' };

const KIND_COLOR: Record<StockFeedKind, string> = {
  disclosure: 'text-[var(--feed-disc)] bg-[var(--feed-disc-bg)]',
  news: 'text-[var(--feed-news)] bg-[var(--feed-news-bg)]',
};

export function FeedKindBadge({ kind, size = 'full', className }: FeedKindBadgeProps) {
  const isMini = size === 'mini';
  return (
    <span
      data-slot="feed-kind-badge"
      data-kind={kind}
      // generic span 에는 이름을 붙일 수 없어(ARIA 1.2) 한 글자 배지만 role="img" 로 전체 이름을 읽힌다.
      role={isMini ? 'img' : undefined}
      aria-label={isMini ? FULL_LABEL[kind] : undefined}
      title={isMini ? FULL_LABEL[kind] : undefined}
      className={[
        'inline-flex flex-none items-center justify-center whitespace-nowrap rounded-[5px] font-semibold leading-[1.5]',
        isMini ? 'px-1 text-[10px]' : 'px-1.5 py-px text-[11px]',
        KIND_COLOR[kind],
        className ?? '',
      ]
        .join(' ')
        .trim()}
    >
      {isMini ? MINI_LABEL[kind] : FULL_LABEL[kind]}
    </span>
  );
}
