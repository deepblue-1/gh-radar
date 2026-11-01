import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

import { LaunchClient } from '../launch-client';

/**
 * Phase 35 REVIEW IN-01 — `/admin/launch` 쿼리 정본화. 잘못된 `tab` · `d` · `fire` · `range` 는 그 키만 `router.replace` 로
 * 지우고 다른 키는 보존한다(공유 주소와 실제 화면이 갈라지지 않게). 탭 본문은 받기를 하므로 대역으로 바꾼다.
 */

const nav = vi.hoisted(() => ({ query: '', replace: vi.fn(), push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  useSearchParams: () => new URLSearchParams(nav.query),
}));
vi.mock('../launch-map-tab', () => ({ LaunchMapTab: ({ fire }: { fire: string }) => <div data-slot="map" data-fire={fire} /> }));
vi.mock('../launch-orders-tab', () => ({
  LaunchOrdersTab: ({ fire }: { fire: string }) => <div data-slot="orders" data-fire={fire} />,
}));

afterEach(() => {
  nav.replace.mockReset();
  nav.push.mockReset();
});

describe('LaunchClient — 쿼리 정본화', () => {
  it('잘못된 ?fire → q16 으로 그리고 fire 만 지운다(다른 키 보존)', () => {
    nav.query = 'tab=orders&fire=nxt&d=20261026';
    const { container } = render(<LaunchClient />);
    expect(container.querySelector('[data-slot="orders"]')?.getAttribute('data-fire')).toBe('q16');
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith('/admin/launch?tab=orders&d=20261026');
  });

  it('올바른 ?fire=n0930 은 그대로 · replace 없음', () => {
    nav.query = 'fire=n0930';
    const { container } = render(<LaunchClient />);
    expect(container.querySelector('[data-slot="orders"]')?.getAttribute('data-fire')).toBe('n0930');
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('잘못된 fire · range 가 함께면 한 번에 둘 다 지운다', () => {
    nav.query = 'tab=map&range=30d&fire=x';
    render(<LaunchClient />);
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith('/admin/launch?tab=map');
  });
});
