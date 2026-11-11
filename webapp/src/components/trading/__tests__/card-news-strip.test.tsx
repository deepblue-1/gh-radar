import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { NewsByStockResponse, StockFeedEntry, StockFeedItem, StockFeedKind } from '@gh-radar/shared';

/**
 * Phase 41 Plan 07 Task 1 — 상따 카드 한 줄 띠 `CardNewsStrip`(D-18 · D-20 · 목업 ③ `.nstrip` · gh-trade 상따 1).
 *
 * 잠그는 것: 띠 = 첫 공시(배지 · 시각 · 회사명 걷은 제목) 「|」 첫 뉴스(배지 · 시각 · 제목) · 오른쪽 끝 「N건 ▾」(상한 「N건+」) ·
 * 한 종류만이면 그 하나 · 누르면 최근 3일 목록 펼침(`FeedRows band="lc"` · 원 제목) · 다시 누르면 접힘 · 클릭이 부모로 번지지 않음 ·
 * 글 0건 = 누를 수 없는 빈 줄 · 첫 응답 전 = 글자 없는 같은 높이 자리 · 공급자 밖 = 없음 · 새 글 강조 `--new-bg` ·
 * 받은 순서에서 고를 뿐 재정렬하지 않음(D-14).
 */

const fetchMock = vi.fn();
vi.mock('@/lib/news-by-stock-api', () => ({
  fetchNewsByStock: (...a: unknown[]) => fetchMock(...a),
}));

import { CARD_NEWS_EMPTY_TEXT, CardNewsStrip, shortDisclosureTitle } from '../card/card-news-strip';
import { StockFeedEntriesContext, StockFeedProvider } from '../feed/stock-feed-context';
import { STOCK_FEED_POLL_MS } from '@/lib/use-stock-feed';

// KST 2026-11-12 15:30
const NOW = Date.parse('2026-11-12T06:30:00.000Z');
const CODE = '012340';
const NAME = '가람전자';

function item(over: Partial<StockFeedItem> & { id: string; kind?: StockFeedKind }): StockFeedItem {
  return {
    kind: 'news',
    publishedAt: '2026-11-12T15:16:00.000+09:00',
    title: `제목 ${over.id}`,
    source: '○○경제',
    stockCodes: [CODE],
    url: null,
    description: null,
    receivedAt: '2026-11-12T15:16:00.000+09:00',
    ...over,
  };
}

const NEWS = item({
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
const NEWS_OLD = item({
  id: 'naver:3',
  publishedAt: '2026-11-12T09:12:00.000+09:00',
  title: '가람전자, 온디바이스 AI 검사장비 고객사 확대',
});
const DISC_OLD = item({
  id: 'kis:4',
  kind: 'disclosure',
  publishedAt: '2026-11-10T09:00:00.000+09:00',
  title: '(주)가람전자 주식등의대량보유상황보고서(일반)',
  source: '코스닥 공시',
});

function entryOf(items: StockFeedItem[], over: Partial<StockFeedEntry> = {}): StockFeedEntry {
  return { code: CODE, collectedAt: '2026-11-12T15:29:00.000+09:00', count: items.length, truncated: false, items, ...over };
}

function withEntries(entries: ReadonlyMap<string, StockFeedEntry>, children: ReactNode) {
  return <StockFeedEntriesContext.Provider value={entries}>{children}</StockFeedEntriesContext.Provider>;
}

const strip = () => document.querySelector<HTMLElement>('[data-slot="card-news-strip"]');
const openArea = () => document.querySelector<HTMLElement>('[data-slot="card-news-open"]');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('shortDisclosureTitle', () => {
  it('제목 앞 회사명(「(주)」 · 「주식회사」 · 뒤 「(주)」 포함)만 걷고 이름이 앞에 없으면 원 제목 그대로다', () => {
    expect(shortDisclosureTitle('(주)가람전자 단일판매ㆍ공급계약체결', '가람전자')).toBe('단일판매ㆍ공급계약체결');
    expect(shortDisclosureTitle('가람전자(주) 주식등의대량보유상황보고서(일반)', '가람전자')).toBe(
      '주식등의대량보유상황보고서(일반)',
    );
    expect(shortDisclosureTitle('주식회사 프로티아 공매도 과열종목 지정(…)', '프로티아')).toBe('공매도 과열종목 지정(…)');
    expect(shortDisclosureTitle('[기재정정]가람전자 단일판매', '가람전자')).toBe('[기재정정]가람전자 단일판매');
    expect(shortDisclosureTitle('가람전자우 배당', '가람전자')).toBe('가람전자우 배당');
  });

  it('이름의 정규식 특수문자는 문자 그대로 다룬다', () => {
    expect(shortDisclosureTitle('KODEX 200(H) 분배금', 'KODEX 200(H)')).toBe('분배금');
    expect(shortDisclosureTitle('KODEX 2000H 분배금', 'KODEX 200(H)')).toBe('KODEX 2000H 분배금');
    expect(shortDisclosureTitle('A.B 공시', 'A+B')).toBe('A.B 공시');
  });
});

describe('CardNewsStrip', () => {
  it('공시 · 뉴스가 다 있으면 공시(배지 · 시각 · 짧은 제목) 「|」 뉴스(배지 · 시각 · 제목) · 오른쪽 「N건 ▾」', () => {
    render(withEntries(new Map([[CODE, entryOf([NEWS, DISC, NEWS_OLD, DISC_OLD])]]), <CardNewsStrip code={CODE} stockName={NAME} />));
    expect(strip()).not.toBeNull();
    const s = strip()!;
    expect(s.tagName).toBe('BUTTON');
    expect(s).toHaveAttribute('aria-expanded', 'false');
    const text = s.textContent!;
    expect(text).toContain('공시15:15:01단일판매ㆍ공급계약체결');
    expect(text).toContain('뉴스15:16가람전자, 280억 규모 검사장비 공급계약 체결');
    expect(text).not.toContain('(주)가람전자');
    expect(text.indexOf('공시')).toBeLessThan(text.indexOf('|'));
    expect(text.indexOf('|')).toBeLessThan(text.indexOf('뉴스'));
    expect(within(s).getByText('4건 ▾')).toBeInTheDocument();
  });

  it('상한에 닿은 묶음(truncated)은 「N건+ ▾」', () => {
    render(
      withEntries(
        new Map([[CODE, entryOf([NEWS, DISC], { count: 20, truncated: true })]]),
        <CardNewsStrip code={CODE} stockName={NAME} />,
      ),
    );
    expect(within(strip()!).getByText('20건+ ▾')).toBeInTheDocument();
  });

  it('공시만 · 뉴스만이면 그 하나만 보이고 구분자 「|」 가 없다', () => {
    const { rerender } = render(
      withEntries(new Map([[CODE, entryOf([DISC])]]), <CardNewsStrip code={CODE} stockName={NAME} />),
    );
    expect(strip()!.textContent).toContain('공시15:15:01단일판매ㆍ공급계약체결');
    expect(strip()!.textContent).not.toContain('|');
    expect(strip()!.textContent).not.toContain('뉴스');

    rerender(withEntries(new Map([[CODE, entryOf([NEWS])]]), <CardNewsStrip code={CODE} stockName={NAME} />));
    expect(strip()!.textContent).toContain('뉴스15:16가람전자, 280억 규모 검사장비 공급계약 체결');
    expect(strip()!.textContent).not.toContain('|');
    expect(strip()!.textContent).not.toContain('공시');
    expect(within(strip()!).getByText('1건 ▾')).toBeInTheDocument();
  });

  it('받은 목록에서 첫 공시 · 첫 뉴스를 고를 뿐 다시 정렬하지 않는다(D-14)', () => {
    // 받은 순서상 첫 뉴스(NEWS_OLD)가 둘째 뉴스(NEWS)보다 이르지만 그대로 첫 뉴스를 띠에 쓴다.
    render(
      withEntries(new Map([[CODE, entryOf([NEWS_OLD, DISC_OLD, NEWS, DISC])]]), <CardNewsStrip code={CODE} stockName={NAME} />),
    );
    const text = strip()!.textContent!;
    expect(text).toContain('09:12가람전자, 온디바이스 AI 검사장비 고객사 확대');
    expect(text).toContain('11/10주식등의대량보유상황보고서(일반)');
    expect(text).not.toContain('280억');
  });

  it('띠를 누르면 최근 3일 목록이 원 제목으로 펼쳐지고(「▴」) 다시 누르면 접힌다', () => {
    render(withEntries(new Map([[CODE, entryOf([NEWS, DISC, NEWS_OLD, DISC_OLD])]]), <CardNewsStrip code={CODE} stockName={NAME} />));
    expect(openArea()).toBeNull();

    fireEvent.click(strip()!);
    expect(strip()).toHaveAttribute('aria-expanded', 'true');
    expect(within(strip()!).getByText('4건 ▴')).toBeInTheDocument();
    const area = openArea()!;
    expect(area).not.toBeNull();
    expect(strip()!.getAttribute('aria-controls')).toBe(area.id);
    const rows = area.querySelectorAll<HTMLElement>('[data-slot="feed-row"]');
    expect(rows).toHaveLength(4);
    // 펼친 목록은 원 제목 그대로 · 카드 폭 685 경계(lc).
    expect(rows[1]!.textContent).toContain('(주)가람전자 단일판매ㆍ공급계약체결');
    expect(rows[0]!.querySelector('[data-slot="feed-row-source"]')!.className).toContain('@min-[685px]/lc:');

    fireEvent.click(strip()!);
    expect(strip()).toHaveAttribute('aria-expanded', 'false');
    expect(within(strip()!).getByText('4건 ▾')).toBeInTheDocument();
    expect(openArea()).toBeNull();
  });

  it('띠 클릭은 부모 클릭 핸들러로 번지지 않는다', () => {
    const parentClick = vi.fn();
    render(
      withEntries(
        new Map([[CODE, entryOf([NEWS, DISC])]]),
        <div onClick={parentClick}>
          <CardNewsStrip code={CODE} stockName={NAME} />
        </div>,
      ),
    );
    fireEvent.click(strip()!);
    expect(strip()).toHaveAttribute('aria-expanded', 'true');
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('글이 0개면(수집 전 null 포함) 누를 수 없는 빈 줄 「최근 3일 뉴스·공시 없음」 이다', () => {
    expect(CARD_NEWS_EMPTY_TEXT).toBe('최근 3일 뉴스·공시 없음');
    const { rerender } = render(
      withEntries(new Map([[CODE, entryOf([], { collectedAt: null })]]), <CardNewsStrip code={CODE} stockName={NAME} />),
    );
    const s = strip()!;
    expect(s.tagName).not.toBe('BUTTON');
    expect(s).toHaveAttribute('data-state', 'empty');
    expect(s.textContent).toBe(CARD_NEWS_EMPTY_TEXT);
    expect(s.className).toContain('text-[var(--faint)]');
    expect(document.querySelector('button')).toBeNull();

    rerender(withEntries(new Map([[CODE, entryOf([])]]), <CardNewsStrip code={CODE} stockName={NAME} />));
    expect(strip()!.textContent).toBe(CARD_NEWS_EMPTY_TEXT);
    expect(document.querySelector('button')).toBeNull();
  });

  it('공급자 안인데 그 코드 응답이 아직 없으면 글자 없는 같은 높이 자리(data-state="pending")만 둔다', () => {
    render(withEntries(new Map([['999999', entryOf([NEWS])]]), <CardNewsStrip code={CODE} stockName={NAME} />));
    const s = strip()!;
    expect(s).toHaveAttribute('data-state', 'pending');
    expect(s.textContent).toBe('');
    expect(s.tagName).not.toBe('BUTTON');
    expect(s.className).toContain('min-h-[30px]');
  });

  it('공급자 밖이면 아무것도 그리지 않는다', () => {
    const { container } = render(<CardNewsStrip code={CODE} stockName={NAME} />);
    expect(container.innerHTML).toBe('');
  });

  it('띠에 보이는 공시나 뉴스가 새로 온 글이면 띠가 data-new · --new-bg 로 칠해진다', async () => {
    let feed: StockFeedItem[] = [DISC_OLD];
    fetchMock.mockImplementation(
      (codes: readonly string[]): Promise<NewsByStockResponse> =>
        Promise.resolve({
          asOf: '',
          feedAt: null,
          stocks: codes.map((code) => ({ code, collectedAt: '', count: feed.length, truncated: false, items: feed })),
        }),
    );
    render(
      <StockFeedProvider codes={[CODE]}>
        <CardNewsStrip code={CODE} stockName={NAME} />
      </StockFeedProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(strip()!.tagName).toBe('BUTTON');
    expect(strip()).not.toHaveAttribute('data-new');
    expect(strip()!.className).not.toContain('bg-[var(--new-bg)]');

    feed = [DISC, DISC_OLD];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STOCK_FEED_POLL_MS);
    });
    expect(strip()).toHaveAttribute('data-new', 'true');
    expect(strip()!.className).toContain('bg-[var(--new-bg)]');
  });
});
