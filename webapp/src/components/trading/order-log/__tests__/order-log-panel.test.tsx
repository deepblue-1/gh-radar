import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { StrategyEventRow } from '@gh-radar/shared';

/**
 * Phase 25-07 Task 2 — 공용 패널 주문로그 본문 (UI-SPEC ②-1 · 결정 1-A · R3 · R4).
 *
 * 잠그는 것: 상태줄 계좌 범위(다른 계좌 주문 줄 0 · 시세 줄 유지) · 구분 필터 → 건수 · 창 분리 = 정본 쿼리로
 * `gh-radar-order-log` 창(960×720). 종목 이름은 relay 라벨 → 마스터 → 코드 → ISIN 폴백(새 조회 경로 없음).
 */

type RelayShape = ReturnType<typeof import('@/lib/relay-provider').useRelayContext>;
let mockRelay: RelayShape;
vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return { ...actual, useRelayContext: () => mockRelay };
});

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  }),
}));

import { EMPTY_RELAY_VALUE } from '@/lib/relay-provider';
import { clearStockNameCache } from '@/lib/stock-names';
import { EMPTY_ORDER_LOG_FEED, type OrderLogFeed } from '@/lib/use-order-log-feed';
import { OrderLogPanel } from '../order-log-panel';
import { FIXTURE_ACCOUNT_NO, STRATEGY_DAY_ROWS } from '@/test-fixtures/strategy-day';

const OTHER_ACCOUNT = '9999999901';

function feedOf(rows: readonly StrategyEventRow[], over: Partial<OrderLogFeed> = {}): OrderLogFeed {
  return { ...EMPTY_ORDER_LOG_FEED, rows, date: '2026-09-29', ...over };
}

const lines = (c: HTMLElement) => c.querySelectorAll('li[data-slot="order-log-line"]');
const marketCount = STRATEGY_DAY_ROWS.filter((r) => r.kind === 1 || r.kind === 2).length;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-29T10:00:00+09:00'));
  mockRelay = { ...EMPTY_RELAY_VALUE, status: 'ready' };
  clearStockNameCache();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('OrderLogPanel', () => {
  it('계좌 A 범위 → 하루 전부 · 계좌 B → 주문 줄 0 · 시세 줄 유지', () => {
    const feed = feedOf(STRATEGY_DAY_ROWS);
    const { container, rerender } = render(<OrderLogPanel accountNo={FIXTURE_ACCOUNT_NO} phoneBand={false} feed={feed} />);
    expect(lines(container)).toHaveLength(STRATEGY_DAY_ROWS.length);
    expect(screen.getByText(`${STRATEGY_DAY_ROWS.length}건`)).toBeInTheDocument();

    rerender(<OrderLogPanel accountNo={OTHER_ACCOUNT} phoneBand={false} feed={feed} />);
    expect(lines(container)).toHaveLength(marketCount);
    for (const li of lines(container)) expect(['1', '2']).toContain(li.getAttribute('data-kind'));
  });

  it('구분 「시세」 → 시세 줄만 · 칩 data-on · 건수 갱신 · 필터 0건 문구', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <OrderLogPanel accountNo={FIXTURE_ACCOUNT_NO} phoneBand={false} feed={feedOf(STRATEGY_DAY_ROWS)} />,
    );
    await user.selectOptions(screen.getByRole('combobox', { name: '구분' }), 'market');
    expect(lines(container)).toHaveLength(marketCount);
    expect(container.querySelector('[data-slot="order-log-count"]')?.textContent).toBe(`${marketCount}건`);
    expect(screen.getByRole('combobox', { name: '구분' }).closest('[data-on]')).not.toBeNull();

    await user.selectOptions(screen.getByRole('combobox', { name: '거래소' }), 'NXT');
    expect(lines(container)).toHaveLength(0);
    expect(container.querySelector('[data-slot="order-log-empty"]')?.textContent).toContain('조건에 맞는 로그가 없어요');
    expect(container.querySelector('[data-slot="order-log-count"]')?.textContent).toBe('0건');
  });

  it('종목 옵션 = 그날 범위 안 종목 · 이름 폴백(relay 라벨 없음 → 단축코드)', () => {
    render(<OrderLogPanel accountNo={FIXTURE_ACCOUNT_NO} phoneBand={false} feed={feedOf(STRATEGY_DAY_ROWS)} />);
    const opts = screen.getByRole('combobox', { name: '종목' }).querySelectorAll('option');
    expect([...opts].map((o) => o.textContent)).toEqual(['전체', '005930']);
  });

  it('창 분리 → window.open("/trading/order-log?account=A&kind=market", "gh-radar-order-log", "width=960,height=720") — noopener 없음 · 연 창의 opener 를 끊고 앞으로 (R4 · WR-04)', async () => {
    const user = userEvent.setup();
    const popup = { opener: window as unknown, focus: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    render(<OrderLogPanel accountNo={FIXTURE_ACCOUNT_NO} phoneBand={false} feed={feedOf(STRATEGY_DAY_ROWS)} />);
    await user.selectOptions(screen.getByRole('combobox', { name: '구분' }), 'market');
    await user.click(screen.getByRole('button', { name: '주문로그 새 창으로 열기' }));
    expect(open).toHaveBeenCalledWith(
      `/trading/order-log?account=${FIXTURE_ACCOUNT_NO}&kind=market`,
      'gh-radar-order-log',
      'width=960,height=720',
    );
    // noopener 는 이름으로 기존 창을 찾지 않아 누를 때마다 새 창이 쌓인다 — features 에 넣지 않는다.
    expect(String(open.mock.calls[0]?.[2])).not.toContain('noopener');
    expect(popup.opener).toBeNull();
    expect(popup.focus).toHaveBeenCalledTimes(1);

    // 다시 누르면 같은 이름으로 연다(브라우저가 같은 창을 재사용한다).
    await user.click(screen.getByRole('button', { name: '주문로그 새 창으로 열기' }));
    expect(open).toHaveBeenCalledTimes(2);
    expect(open.mock.calls[1]?.[1]).toBe('gh-radar-order-log');
  });

  it('창 분리 — 팝업이 막혀 window.open 이 null 이어도 예외 없음 (WR-04)', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<OrderLogPanel accountNo={FIXTURE_ACCOUNT_NO} phoneBand={false} feed={feedOf(STRATEGY_DAY_ROWS)} />);
    await user.click(screen.getByRole('button', { name: '주문로그 새 창으로 열기' }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('피드 상태가 목록으로 간다 — loading 줄 0 · error + 다시 시도 → feed.retry', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const { container, rerender } = render(
      <OrderLogPanel accountNo={FIXTURE_ACCOUNT_NO} phoneBand={false} feed={feedOf([], { status: 'loading' })} />,
    );
    expect(container.querySelector('[data-slot="order-log-loading"]')).not.toBeNull();
    rerender(<OrderLogPanel accountNo={FIXTURE_ACCOUNT_NO} phoneBand={false} feed={feedOf([], { status: 'error', retry })} />);
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('오늘 0건 → 빈 박스 「오늘 주문로그가 없어요」', () => {
    const { container } = render(<OrderLogPanel accountNo={FIXTURE_ACCOUNT_NO} phoneBand={false} feed={feedOf([])} />);
    expect(container.querySelector('[data-slot="order-log-empty"]')?.textContent).toContain('오늘 주문로그가 없어요');
    expect(container.querySelector('[data-slot="order-log-count"]')?.textContent).toBe('0건');
  });
});
