import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

import type { StrategyEventRow } from '@gh-radar/shared';

/**
 * Phase 25-10 Task 2 — 창 분리 페이지 `/trading/order-log` (D-07 · 결정 5 · UI-SPEC ③ · R13 · R15).
 *
 * 잠그는 것:
 *  - 쿼리 화이트리스트 교정(형식 오류 · 미래 날짜 · 모르는 값) → `router.replace` 정본 URL 1회
 *  - 머리줄 ‹ 날짜(요일) › 오늘 — 오늘이면 › disabled · 「오늘」 aria-current="date"
 *  - ‹ → 하루 전 URL + 그 날짜 조회 1회 · 「오늘」 → 오늘로 · 과거일 푸시 무시 · 핀 없음 · 과거일 빈/실패 문구
 *  - 범위: account 없음 = 시세만 · account = 그 계좌 주문 + 시세
 *  - 문서 제목 · `@container/wb` 루트 · 앱 셸 · 창 분리 버튼 없음
 */

const replaceMock = vi.fn();
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => '/trading/order-log',
}));

type RelayShape = ReturnType<typeof import('@/lib/relay-provider').useRelayContext>;
let mockRelay: RelayShape;
vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return { ...actual, useRelayContext: () => mockRelay };
});

const fetchStrategyEventsMock = vi.fn();
vi.mock('@/lib/strategy-events-api', () => ({
  fetchStrategyEvents: (date?: string) => fetchStrategyEventsMock(date),
}));

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
import { OrderLogWindow } from '../order-log-window';
import { FIXTURE_ACCOUNT_NO, STRATEGY_DAY_BY_NAME } from '@/test-fixtures/strategy-day';

const exposed = STRATEGY_DAY_BY_NAME.exposed!;
const buy = STRATEGY_DAY_BY_NAME.buy12451!;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const lines = () => document.querySelectorAll('li[data-slot="order-log-line"]');

function open(query: string) {
  searchParams = new URLSearchParams(query);
  return render(<OrderLogWindow />);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-29T10:00:00+09:00'));
  mockRelay = { ...EMPTY_RELAY_VALUE, status: 'ready' };
  replaceMock.mockReset();
  fetchStrategyEventsMock.mockReset();
  fetchStrategyEventsMock.mockResolvedValue([]);
  clearStockNameCache();
  document.title = '';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('OrderLogWindow — 쿼리 교정 · 머리줄 (R13 · R15)', () => {
  it('?date=2099-01-01&ex=XYZ → router.replace 정본(쿼리 없음) 1회 · 제목 · 날짜(요일) · › disabled · 오늘 aria-current', async () => {
    open('date=2099-01-01&ex=XYZ');
    await flush();
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock.mock.calls[0]![0]).toBe('/trading/order-log');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('주문로그');
    expect(q('[data-slot="order-log-date"]')?.textContent).toBe('2026-09-29 (화)');
    expect(q('[data-slot="order-log-date-next"]')).toBeDisabled();
    expect(q('[data-slot="order-log-date-prev"]')).toHaveAttribute('aria-label', '이전 날');
    expect(q('[data-slot="order-log-date-next"]')).toHaveAttribute('aria-label', '다음 날');
    const today = q('[data-slot="order-log-date-today"]')!;
    expect(today).toHaveAttribute('aria-current', 'date');
    expect(fetchStrategyEventsMock).toHaveBeenCalledTimes(1);
    expect(fetchStrategyEventsMock).toHaveBeenCalledWith(undefined);
  });

  it('정본 쿼리로 열면 replace 없음 · 문서 제목 「주문로그 · 날짜」', async () => {
    open(`account=${FIXTURE_ACCOUNT_NO}`);
    await flush();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(document.title).toBe('주문로그 · 2026-09-29');
  });

  it('‹ → 하루 전 URL(replace) · 그 날짜 조회 1회 · 「오늘」 알약 aria-current 없음 · 누르면 오늘로', async () => {
    open(`account=${FIXTURE_ACCOUNT_NO}`);
    await flush();
    fetchStrategyEventsMock.mockClear();
    await act(async () => {
      q('[data-slot="order-log-date-prev"]')!.click();
    });
    await flush();
    expect(replaceMock).toHaveBeenLastCalledWith(
      `/trading/order-log?account=${FIXTURE_ACCOUNT_NO}&date=2026-09-28`,
      { scroll: false },
    );
    expect(fetchStrategyEventsMock).toHaveBeenCalledTimes(1);
    expect(fetchStrategyEventsMock).toHaveBeenCalledWith('2026-09-28');
    expect(q('[data-slot="order-log-date"]')?.textContent).toBe('2026-09-28 (월)');
    expect(document.title).toBe('주문로그 · 2026-09-28');
    const today = q('[data-slot="order-log-date-today"]')!;
    expect(today).not.toHaveAttribute('aria-current');
    expect(q('[data-slot="order-log-date-next"]')).not.toBeDisabled();

    fetchStrategyEventsMock.mockClear();
    await act(async () => {
      today.click();
    });
    await flush();
    expect(replaceMock).toHaveBeenLastCalledWith(`/trading/order-log?account=${FIXTURE_ACCOUNT_NO}`, { scroll: false });
    expect(fetchStrategyEventsMock).toHaveBeenCalledWith(undefined);
    expect(q('[data-slot="order-log-date-today"]')).toHaveAttribute('aria-current', 'date');
  });
});

describe('OrderLogWindow — 과거일 · 범위 (D-07 · 결정 1)', () => {
  it('과거일: 푸시가 와도 rows 불변 · 핀 없음 · 0건 → 「이 날은 주문로그가 없어요」 + 본문', async () => {
    const { rerender } = open(`account=${FIXTURE_ACCOUNT_NO}&date=2026-09-26`);
    await flush();
    expect(fetchStrategyEventsMock).toHaveBeenCalledWith('2026-09-26');
    const empty = q('[data-slot="order-log-empty"]')!;
    expect(empty.textContent).toContain('이 날은 주문로그가 없어요');
    expect(empty.textContent).toContain('주말·휴장일이거나 주문·상한가 이벤트가 없던 날이에요');
    mockRelay = { ...mockRelay, strategyEvents: [{ ...buy, tradeDate: '2026-09-26', seq: 990 }] };
    rerender(<OrderLogWindow />);
    await flush();
    expect(lines()).toHaveLength(0);
    expect(q('[data-slot="order-log-pin"]')).toBeNull();
  });

  it('과거일 조회 실패 → 「이 날 주문로그를 불러오지 못했어요」 + 다시 시도(재조회 1회)', async () => {
    fetchStrategyEventsMock.mockRejectedValueOnce(new Error('x'));
    open('date=2026-09-25');
    await flush();
    const err = q('[data-slot="order-log-error"]')!;
    expect(err.textContent).toContain('이 날 주문로그를 불러오지 못했어요');
    fetchStrategyEventsMock.mockResolvedValueOnce([]);
    await act(async () => {
      screen.getByRole('button', { name: '다시 시도' }).click();
    });
    await flush();
    expect(fetchStrategyEventsMock).toHaveBeenCalledTimes(2);
  });

  it('account 쿼리 없음 → 시세 이벤트만 · account 있으면 그 계좌 주문 + 시세', async () => {
    fetchStrategyEventsMock.mockResolvedValue([exposed, buy] satisfies StrategyEventRow[]);
    const first = open('');
    await flush();
    expect(lines()).toHaveLength(1);
    expect(lines()[0]!.getAttribute('data-kind')).toBe('1');
    first.unmount();
    open(`account=${FIXTURE_ACCOUNT_NO}`);
    await flush();
    expect(lines()).toHaveLength(2);
  });
});

describe('OrderLogWindow — 골격 (결정 5 · UI-SPEC ③)', () => {
  it('루트 main[data-slot=order-log-window] @container/wb · 머리줄 · 필터줄 · 창 분리 버튼 없음 · 사이드바 없음', async () => {
    open('');
    await flush();
    const main = q('main[data-slot="order-log-window"]')!;
    expect(main.className.split(/\s+/)).toEqual(expect.arrayContaining(['@container/wb', 'flex', 'h-dvh', 'flex-col']));
    expect(q('[data-slot="order-log-window-bar"]')).not.toBeNull();
    expect(q('[data-slot="order-log-filters"]')).not.toBeNull();
    expect(q('[data-slot="order-log-popout"]')).toBeNull();
    expect(q('[data-slot="sidebar"]')).toBeNull();
    expect(q('[data-slot="order-log"]')?.getAttribute('data-surface')).toBe('window');
  });

  it('구분 필터를 바꾸면 쿼리에 kind 가 실린다(router.replace)', async () => {
    open(`account=${FIXTURE_ACCOUNT_NO}`);
    await flush();
    const select = screen.getByRole('combobox', { name: '구분' }) as HTMLSelectElement;
    await act(async () => {
      select.value = 'market';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(replaceMock).toHaveBeenLastCalledWith(
      `/trading/order-log?account=${FIXTURE_ACCOUNT_NO}&kind=market`,
      { scroll: false },
    );
  });
});
