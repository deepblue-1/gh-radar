import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import type { NewsByStockResponse, StockFeedItem, StockFeedKind } from '@gh-radar/shared';

/**
 * Phase 41 Plan 05 Task 2 — 글 줄 부품 `FeedRows`(목업 `.fr` · ② 돌파 상세 · ③ 상따 카드 띠가 같이 쓴다).
 *
 * 잠그는 것: 시각(`formatFeedTime`) · 「공시」/「뉴스」 배지 · 제목(링크면 새 창 · 아니면 글자) · 자료원(링크 줄만 「↗」) ·
 * 자료원은 넓은 폭 오른쪽 칸 / 좁은 폭 제목 아래 줄(D-20 — 늘 보인다) · 경계는 band 별 기존 값(wb 700 · lc 685) ·
 * 새 글 `data-new` + `--new-bg` · 받은 순서 그대로(D-14) · 빈 목록 문구.
 */

const fetchMock = vi.fn();
vi.mock('@/lib/news-by-stock-api', () => ({
  fetchNewsByStock: (...a: unknown[]) => fetchMock(...a),
}));

import { FEED_ROWS_EMPTY_TEXT, FeedRows } from '../feed/feed-rows';
import { StockFeedProvider, useStockFeedEntry } from '../feed/stock-feed-context';
import { STOCK_FEED_POLL_MS } from '@/lib/use-stock-feed';

// KST 2026-11-12 15:30
const NOW = Date.parse('2026-11-12T06:30:00.000Z');

function item(over: Partial<StockFeedItem> & { id: string; kind?: StockFeedKind }): StockFeedItem {
  return {
    kind: 'news',
    publishedAt: '2026-11-12T15:16:00.000+09:00',
    title: `제목 ${over.id}`,
    source: '○○경제',
    stockCodes: ['012340'],
    url: null,
    description: null,
    receivedAt: '2026-11-12T15:16:00.000+09:00',
    ...over,
  };
}

const NEWS_LINK = item({
  id: 'naver:1',
  title: '가람전자, 280억 규모 검사장비 공급계약 체결',
  url: 'https://news.example.com/a/1',
});
const DISC = item({
  id: 'kis:2',
  kind: 'disclosure',
  publishedAt: '2026-11-12T15:15:01.000+09:00',
  title: '(주)가람전자 단일판매ㆍ공급계약체결',
  source: '코스닥 공시',
});
const OLD_DISC = item({
  id: 'kis:3',
  kind: 'disclosure',
  publishedAt: '2026-11-10T09:00:00.000+09:00',
  title: '(주)가람전자 주식등의대량보유상황보고서(일반)',
  source: '코스닥 공시',
});

const rows = () => [...document.querySelectorAll<HTMLElement>('[data-slot="feed-row"]')];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FeedRows', () => {
  it('받은 순서 그대로 줄마다 시각 · 배지 · 제목 · 자료원을 그린다', () => {
    render(<FeedRows items={[NEWS_LINK, DISC, OLD_DISC]} band="wb" />);
    const [a, b, c] = rows();
    expect(rows()).toHaveLength(3);
    expect(within(a!).getByText('15:16')).toBeInTheDocument();
    expect(within(a!).getByText('뉴스')).toBeInTheDocument();
    expect(within(b!).getByText('15:15:01')).toBeInTheDocument();
    expect(within(b!).getByText('공시')).toBeInTheDocument();
    expect(within(c!).getByText('11/10')).toBeInTheDocument();
    expect(b!.textContent).toContain('(주)가람전자 단일판매ㆍ공급계약체결');
  });

  it('url 이 있으면 제목이 새 창 링크이고 자료원에 「↗」 가 붙는다', () => {
    render(<FeedRows items={[NEWS_LINK]} band="wb" />);
    const link = screen.getByRole('link', { name: NEWS_LINK.title });
    expect(link).toHaveAttribute('href', NEWS_LINK.url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    const src = rows()[0]!.querySelector('[data-slot="feed-row-source"]')!;
    expect(src.textContent).toBe('○○경제 ↗');
  });

  it('url 이 없으면 링크가 아닌 글자 제목이고 「↗」 가 없다(D-20)', () => {
    render(<FeedRows items={[DISC]} band="wb" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(rows()[0]!.textContent).not.toContain('↗');
    expect(rows()[0]!.querySelector('[data-slot="feed-row-source"]')!.textContent).toBe('코스닥 공시');
  });

  it('band="wb" — 자료원 칸은 본문 700 이상에서만, 그 아래 폭에서는 제목 아래 줄로 보인다', () => {
    render(<FeedRows items={[DISC]} band="wb" />);
    const row = rows()[0]!;
    const col = row.querySelector('[data-slot="feed-row-source"]')!;
    const sub = row.querySelector('[data-slot="feed-row-source-sub"]')!;
    expect(col.className).toContain('hidden');
    expect(col.className).toContain('@min-[700px]/wb:');
    expect(sub.className).toContain('@min-[700px]/wb:hidden');
    expect(sub.textContent).toBe('코스닥 공시');
  });

  it('band="lc" — 경계가 카드 폭 685 다', () => {
    render(<FeedRows items={[DISC]} band="lc" />);
    const row = rows()[0]!;
    expect(row.querySelector('[data-slot="feed-row-source"]')!.className).toContain('@min-[685px]/lc:');
    expect(row.querySelector('[data-slot="feed-row-source-sub"]')!.className).toContain('@min-[685px]/lc:hidden');
    expect(row.className).not.toContain('/wb');
  });

  it('빈 목록이면 「최근 3일 뉴스·공시 없음」 · 문구를 바꿀 수 있다', () => {
    const { rerender } = render(<FeedRows items={[]} band="wb" />);
    expect(screen.getByText(FEED_ROWS_EMPTY_TEXT)).toBeInTheDocument();
    expect(FEED_ROWS_EMPTY_TEXT).toBe('최근 3일 뉴스·공시 없음');
    rerender(<FeedRows items={[]} band="wb" emptyText="불러오는 중" />);
    expect(screen.getByText('불러오는 중')).toBeInTheDocument();
    expect(rows()).toHaveLength(0);
  });

  it('공급자 안에서 새로 나타난 글은 data-new 와 --new-bg 로 칠해진다', async () => {
    let feed: StockFeedItem[] = [DISC];
    fetchMock.mockImplementation(
      (codes: readonly string[]): Promise<NewsByStockResponse> =>
        Promise.resolve({
          asOf: '',
          feedAt: null,
          stocks: codes.map((code) => ({ code, collectedAt: '', count: feed.length, truncated: false, items: feed })),
        }),
    );
    function Probe() {
      const entry = useStockFeedEntry('012340');
      return <FeedRows items={entry?.items ?? []} band="wb" />;
    }
    render(
      <StockFeedProvider codes={['012340']}>
        <Probe />
      </StockFeedProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).not.toHaveAttribute('data-new');

    feed = [NEWS_LINK, DISC];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STOCK_FEED_POLL_MS);
    });
    const [fresh, old] = rows();
    expect(fresh).toHaveAttribute('data-new', 'true');
    expect(fresh!.className).toContain('bg-[var(--new-bg)]');
    expect(old).not.toHaveAttribute('data-new');
  });
});
