import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import type { ReactNode } from 'react';

/**
 * 리뷰 IN-02 — `/trading/order-log` 라우트 본문(`OrderLogRoute`)이 창을 **한 번만** 마운트한다.
 *
 * 깨졌을 때 사용자가 겪는 일:
 *  - 앱에서 체결 알림을 탭하면 주문로그 창이 셸 없이 한 번 그려졌다 버려지고 셸 안에서 다시 마운트된다 →
 *    주문 · 이벤트 조회와 구독이 두 번 돌고(장중 느린 조회가 두 배) 셸 없는 화면이 한 번 번쩍인다.
 *
 * 잠그는 것: 앱(클라이언트 이동 · 하이드레이션) 모두 조회 1회 · 셸 안 embedded 창 · 브라우저는 셸 없는 main 창 · 조회 1회.
 */

let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => '/trading/order-log',
}));

vi.mock('@/components/layout/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div data-slot="test-app-shell">{children}</div>,
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
    from: () => ({ select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }),
  }),
}));

import { EMPTY_RELAY_VALUE } from '@/lib/relay-provider';
import { clearStockNameCache } from '@/lib/stock-names';
import { OrderLogRoute } from '../order-log-route';

const q = (sel: string) => document.querySelector<HTMLElement>(sel);

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function asNativeApp() {
  document.documentElement.classList.add('native-app');
  document.documentElement.setAttribute('data-native-platform', 'ios');
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-29T10:00:00+09:00'));
  mockRelay = { ...EMPTY_RELAY_VALUE, status: 'ready' };
  fetchStrategyEventsMock.mockReset();
  fetchStrategyEventsMock.mockResolvedValue([]);
  clearStockNameCache();
  searchParams = new URLSearchParams('stock=KR7282720005');
});

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.classList.remove('native-app');
  document.documentElement.removeAttribute('data-native-platform');
  document.body.innerHTML = '';
});

describe('OrderLogRoute — 창 한 번만 마운트 (IN-02)', () => {
  it('앱 · 클라이언트 이동(알림 탭 router.push) → 첫 렌더부터 셸 안 embedded 창 · 조회 1회', async () => {
    asNativeApp();
    render(<OrderLogRoute sidebar={null} />);
    await flush();
    expect(fetchStrategyEventsMock).toHaveBeenCalledTimes(1);
    expect(q('[data-slot="test-app-shell"] div[data-slot="order-log-window"]')).not.toBeNull();
    expect(q('main[data-slot="order-log-window"]')).toBeNull();
  });

  it('앱 · 하이드레이션(새로 고침 · 냉시작 착지) → 서버 HTML 은 비고 판정 뒤 셸 창 1회 마운트 · 조회 1회', async () => {
    asNativeApp();
    const html = renderToString(<OrderLogRoute sidebar={null} />);
    expect(html).toBe('');
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      hydrateRoot(container, <OrderLogRoute sidebar={null} />);
    });
    await flush();
    expect(fetchStrategyEventsMock).toHaveBeenCalledTimes(1);
    expect(q('[data-slot="test-app-shell"] div[data-slot="order-log-window"]')).not.toBeNull();
    // 하이드레이션 불일치 경고가 없어야 한다(서버 · 첫 클라이언트 렌더 모두 null).
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('브라우저(창 분리) → 셸 없는 main 창 · 조회 1회', async () => {
    render(<OrderLogRoute sidebar={null} />);
    await flush();
    expect(fetchStrategyEventsMock).toHaveBeenCalledTimes(1);
    expect(q('main[data-slot="order-log-window"]')).not.toBeNull();
    expect(q('[data-slot="test-app-shell"]')).toBeNull();
  });
});
