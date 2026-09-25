/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { Stock } from '@gh-radar/shared';

/**
 * SearchPageClient — `/search` B 탐색 허브 (Phase 21 D-07 · D-07a · D-04).
 *
 * 잠그는 명제:
 *  ① 입력 빈칸 = 제목 · 입력 · 타일 3(실데이터 보조 문구) · 최근 검색(있을 때만) · 상승률 상위 5 + 더보기
 *  ② 입력 중(공백 제외 1자↑) = 결과 카드만 — 결과 선택 → /stocks/{code} + 최근 검색 저장
 *  ③ 로딩·오류·빈 결과 문구는 GlobalSearch 와 같은 문자열
 *  ④ 허브 데이터는 마운트 1회 — scanner 실패는 그 칸만 조용한 안내 · 타일 「—」
 *  ⑤ useNativeRefresh 로 허브 재조회가 등록된다
 */

// ---------- Mocks ----------

const pushSpy = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy }),
  usePathname: () => '/search',
}));

const searchStocksMock = vi.fn();
vi.mock('@/lib/stock-api', () => ({
  searchStocks: (...args: unknown[]) => searchStocksMock(...args),
}));

const fetchScannerStocksMock = vi.fn();
vi.mock('@/lib/scanner-api', () => ({
  fetchScannerStocks: (...args: unknown[]) => fetchScannerStocksMock(...args),
}));

const fetchSystemThemesMock = vi.fn();
vi.mock('@/lib/theme-api', () => ({
  fetchSystemThemes: (...args: unknown[]) => fetchSystemThemesMock(...args),
}));

let watchCount = 7;
vi.mock('@/hooks/use-watchlist-set', () => ({
  useWatchlistSet: () => ({ count: watchCount }),
}));

let registeredRefresh: (() => unknown) | null = null;
vi.mock('@/lib/native/use-native-refresh', () => ({
  useNativeRefresh: (fn: () => unknown) => {
    registeredRefresh = fn;
  },
}));

import { RECENT_SEARCH_KEY, readRecentSearches } from '@/lib/recent-search';
import { SearchPageClient } from '../search-page-client';

// ---------- Fixtures ----------

function stock(code: string, name: string, changeRate: number, over: Partial<Stock> = {}): Stock {
  return {
    code,
    name,
    market: 'KOSDAQ',
    price: 12_340,
    changeAmount: 100,
    changeRate,
    volume: 1,
    tradeAmount: 1,
    open: 1,
    high: 1,
    low: 1,
    marketCap: 1,
    upperLimit: 1,
    lowerLimit: 1,
    updatedAt: '2026-09-26T09:00:00+09:00',
    ...over,
  };
}

const SCANNER = [31, 28, 26, 24, 20, 18].map((r, i) =>
  stock(String(100000 + i), `급등${i + 1}`, r),
);
const SAMSUNG = stock('005930', '삼성전자', 1.23, { market: 'KOSPI', price: 70_000 });
const SAMSUNG_SDI = stock('006400', '삼성SDI', -2.5, { market: 'KOSPI', price: 312_500 });

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function renderPage() {
  const utils = render(<SearchPageClient />);
  await flush();
  return utils;
}

function typeQuery(value: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: '종목 검색' }), { target: { value } });
}

async function debounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  pushSpy.mockReset();
  searchStocksMock.mockReset();
  fetchScannerStocksMock.mockReset();
  fetchSystemThemesMock.mockReset();
  fetchScannerStocksMock.mockResolvedValue({ stocks: SCANNER, lastUpdatedAt: null });
  fetchSystemThemesMock.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]);
  watchCount = 7;
  registeredRefresh = null;
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------- Tests ----------

describe('SearchPageClient — 허브 (입력 빈칸)', () => {
  it('제목 · 입력 placeholder · 타일 3개 href 와 실데이터 보조 문구', async () => {
    await renderPage();

    expect(screen.getByRole('heading', { level: 1, name: '검색' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: '종목 검색' })).toHaveAttribute(
      'placeholder',
      '종목명 또는 코드',
    );

    const scanner = screen.getByRole('link', { name: /상승률 상위/ });
    const themes = screen.getByRole('link', { name: /테마/ });
    const watch = screen.getByRole('link', { name: /관심종목/ });
    expect(scanner).toHaveAttribute('href', '/scanner');
    expect(themes).toHaveAttribute('href', '/themes');
    expect(watch).toHaveAttribute('href', '/watchlist');
    expect(scanner).toHaveTextContent('25%↑ 3종목');
    expect(themes).toHaveTextContent('오늘 4개');
    expect(watch).toHaveTextContent('7종목');

    // 자동 폴링 없음 — 마운트 1회
    expect(fetchScannerStocksMock).toHaveBeenCalledTimes(1);
    expect(fetchScannerStocksMock.mock.calls[0]![0]).toEqual({ market: 'ALL' });
    expect(fetchSystemThemesMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(fetchScannerStocksMock).toHaveBeenCalledTimes(1);
  });

  it('「지금 상승률 상위」 5행(순위 1~5) + 「더보기 ›」 → /scanner', async () => {
    await renderPage();

    const section = screen.getByRole('region', { name: '지금 상승률 상위' });
    const rows = within(section).getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    rows.forEach((row, i) => expect(row).toHaveTextContent(String(i + 1)));
    expect(rows[0]).toHaveTextContent('급등1');
    expect(rows[0]).toHaveTextContent('+31.00%');
    expect(within(rows[0]!).getByRole('link')).toHaveAttribute('href', '/stocks/100000');
    expect(within(section).queryByText('급등6')).toBeNull();
    expect(within(section).getByRole('link', { name: '더보기 ›' })).toHaveAttribute(
      'href',
      '/scanner',
    );
  });

  it('최근 검색이 비어 있으면 섹션이 없다', async () => {
    await renderPage();
    expect(screen.queryByRole('region', { name: '최근 검색' })).toBeNull();
  });

  it('최근 검색 2개 → 두 행 + 「지우기」 · ✕ 는 그 행만 · 「지우기」는 섹션 제거', async () => {
    window.localStorage.setItem(
      RECENT_SEARCH_KEY,
      JSON.stringify([
        { code: '005930', name: '삼성전자', market: 'KOSPI', at: 2 },
        { code: '000660', name: 'SK하이닉스', market: 'KOSPI', at: 1 },
      ]),
    );
    await renderPage();

    const section = screen.getByRole('region', { name: '최근 검색' });
    expect(within(section).getAllByRole('listitem')).toHaveLength(2);
    expect(within(section).getByRole('link', { name: '삼성전자' })).toHaveAttribute(
      'href',
      '/stocks/005930',
    );

    fireEvent.click(within(section).getByRole('button', { name: '삼성전자 최근 검색에서 삭제' }));
    expect(within(section).getAllByRole('listitem')).toHaveLength(1);
    expect(readRecentSearches().map((i) => i.code)).toEqual(['000660']);

    fireEvent.click(within(section).getByRole('button', { name: '지우기' }));
    expect(screen.queryByRole('region', { name: '최근 검색' })).toBeNull();
    expect(window.localStorage.getItem(RECENT_SEARCH_KEY)).toBeNull();
  });

  it('scanner 실패 → 페이지는 렌더 · 미리보기 자리에 조용한 안내 · 첫 타일 「—」', async () => {
    fetchScannerStocksMock.mockRejectedValue(new Error('boom'));
    await renderPage();

    expect(screen.getByRole('heading', { level: 1, name: '검색' })).toBeInTheDocument();
    expect(screen.getByText('상승률 상위를 불러오지 못했어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /상승률 상위/ })).toHaveTextContent('—');
    // 테마는 성공한 칸이라 그대로
    expect(screen.getByRole('link', { name: /테마/ })).toHaveTextContent('오늘 4개');
  });

  it('테마 실패 → 테마 타일만 「—」', async () => {
    fetchSystemThemesMock.mockRejectedValue(new Error('boom'));
    await renderPage();
    expect(screen.getByRole('link', { name: /테마/ })).toHaveTextContent('—');
    expect(screen.getByRole('link', { name: /상승률 상위/ })).toHaveTextContent('25%↑ 3종목');
  });

  it('D-04 — useNativeRefresh 로 등록된 함수가 허브를 다시 읽는다', async () => {
    await renderPage();
    expect(registeredRefresh).toBeTypeOf('function');
    await act(async () => {
      await registeredRefresh!();
    });
    expect(fetchScannerStocksMock).toHaveBeenCalledTimes(2);
    expect(fetchSystemThemesMock).toHaveBeenCalledTimes(2);
  });
});

describe('SearchPageClient — 입력 중', () => {
  it('「삼성」 입력 → ✕ 보임 · 허브 숨김 · 결과 행 → 클릭 시 이동 + 최근 검색 저장', async () => {
    searchStocksMock.mockResolvedValue([SAMSUNG, SAMSUNG_SDI]);
    await renderPage();

    expect(screen.queryByRole('button', { name: '검색어 지우기' })).toBeNull();
    typeQuery('삼성');

    expect(screen.getByRole('button', { name: '검색어 지우기' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /상승률 상위/ })).toBeNull();
    expect(screen.queryByRole('region', { name: '지금 상승률 상위' })).toBeNull();

    await debounce();
    expect(searchStocksMock).toHaveBeenCalledWith('삼성', expect.any(AbortSignal));

    const results = screen.getByRole('region', { name: '검색 결과' });
    const rows = within(results).getAllByRole('button');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('삼성전자');
    expect(rows[0]).toHaveTextContent('005930');
    expect(rows[0]).toHaveTextContent('KOSPI');
    expect(rows[0]).toHaveTextContent('70,000');
    expect(rows[0]).toHaveTextContent('+1.23%');
    expect(rows[1]).toHaveTextContent('312,500');
    expect(rows[1]).toHaveTextContent('-2.50%');

    fireEvent.click(rows[0]!);
    expect(pushSpy).toHaveBeenCalledWith('/stocks/005930');
    expect(readRecentSearches()[0]!.code).toBe('005930');
    expect(readRecentSearches()[0]!.market).toBe('KOSPI');
  });

  it('✕ 클릭 → 입력이 비고 허브로 복귀', async () => {
    searchStocksMock.mockResolvedValue([SAMSUNG]);
    await renderPage();
    typeQuery('삼성');
    await debounce();

    fireEvent.click(screen.getByRole('button', { name: '검색어 지우기' }));
    expect(screen.getByRole('searchbox', { name: '종목 검색' })).toHaveValue('');
    expect(screen.getByRole('link', { name: /상승률 상위/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '검색 결과' })).toBeNull();
  });

  it('공백만 입력하면 허브가 그대로다', async () => {
    await renderPage();
    typeQuery('   ');
    expect(screen.getByRole('link', { name: /상승률 상위/ })).toBeInTheDocument();
  });

  it('로딩 「검색 중…」', async () => {
    searchStocksMock.mockReturnValue(new Promise(() => {}));
    await renderPage();
    typeQuery('삼성');
    await debounce();
    expect(screen.getByText('검색 중…')).toBeInTheDocument();
  });

  it('오류 문구', async () => {
    searchStocksMock.mockRejectedValue(new Error('500'));
    await renderPage();
    typeQuery('삼성');
    await debounce();
    expect(
      screen.getByText('검색에 실패했습니다. 잠시 후 다시 시도해 주세요.'),
    ).toBeInTheDocument();
  });

  it('결과 0 문구', async () => {
    searchStocksMock.mockResolvedValue([]);
    await renderPage();
    typeQuery('xyz');
    await debounce();
    expect(screen.getByText('"xyz" 에 해당하는 종목이 없습니다')).toBeInTheDocument();
  });

  it('Enter → 첫 결과로 이동', async () => {
    searchStocksMock.mockResolvedValue([SAMSUNG, SAMSUNG_SDI]);
    await renderPage();
    typeQuery('삼성');
    await debounce();
    fireEvent.submit(screen.getByRole('searchbox', { name: '종목 검색' }));
    expect(pushSpy).toHaveBeenCalledWith('/stocks/005930');
  });
});
