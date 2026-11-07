import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LaunchClient } from '../launch-client';

/**
 * Phase 35 REVIEW IN-01 — `/admin/launch` 쿼리 정본화. 잘못된 `tab` · `d` · `fire` · `range` · `gw`(quick-261107-iep) 는 그 키만 `router.replace` 로
 * 지우고 다른 키는 보존한다(공유 주소와 실제 화면이 갈라지지 않게). 탭 본문은 받기를 하므로 대역으로 바꾼다.
 */

const nav = vi.hoisted(() => ({ query: '', replace: vi.fn(), push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  useSearchParams: () => new URLSearchParams(nav.query),
}));
vi.mock('../launch-map-tab', () => ({
  LaunchMapTab: ({ fire, gw }: { fire: string; gw: string }) => <div data-slot="map" data-fire={fire} data-gw={gw} />,
}));
vi.mock('../launch-orders-tab', () => ({
  LaunchOrdersTab: ({ fire, gw }: { fire: string; gw: string }) => <div data-slot="orders" data-fire={fire} data-gw={gw} />,
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

  it('쿼리 없음 → 주문 탭 gw = KB120 · KB120 칩 선택 · replace 없음', () => {
    nav.query = '';
    const { container } = render(<LaunchClient />);
    expect(container.querySelector('[data-slot="orders"]')?.getAttribute('data-gw')).toBe('KB120');
    expect(screen.getByRole('radio', { name: 'KB120' })).toHaveAttribute('aria-checked', 'true');
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('?gw=KYOBO112 는 그대로 · replace 없음', () => {
    nav.query = 'gw=KYOBO112&d=20261026';
    const { container } = render(<LaunchClient />);
    expect(container.querySelector('[data-slot="orders"]')?.getAttribute('data-gw')).toBe('KYOBO112');
    expect(screen.getByRole('radio', { name: '교보112' })).toHaveAttribute('aria-checked', 'true');
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it.each(['KB121', 'kyobo119', ''])('잘못된 ?gw=%s → KB120 으로 그리고 gw 만 지운다(다른 키 보존)', (raw) => {
    nav.query = `tab=orders&gw=${raw}&d=20261026&fire=n0930`;
    const { container } = render(<LaunchClient />);
    expect(container.querySelector('[data-slot="orders"]')?.getAttribute('data-gw')).toBe('KB120');
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith('/admin/launch?tab=orders&d=20261026&fire=n0930');
  });

  it('?tab=map&gw=KYOBO112 → 지도 탭 gw = KYOBO112 · replace 없음', () => {
    nav.query = 'tab=map&gw=KYOBO112';
    const { container } = render(<LaunchClient />);
    expect(container.querySelector('[data-slot="map"]')?.getAttribute('data-gw')).toBe('KYOBO112');
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('잘못된 fire · gw 가 함께면 한 번에 둘 다 지운다', () => {
    nav.query = 'fire=x&gw=KB121&range=20d';
    render(<LaunchClient />);
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith('/admin/launch?range=20d');
  });
});

describe('LaunchClient — 상단 순서 · 이름', () => {
  it('제목 「러쉬 주문」 · 설명 문단 없음', () => {
    nav.query = '';
    const { container } = render(<LaunchClient />);
    expect(screen.getByRole('heading', { level: 1, name: '러쉬 주문' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="page-header"] p')).toBeNull();
  });

  it('주문 내역 — 탭 줄 → 서버 칩(1개) → 탭 본문 순서', () => {
    nav.query = '';
    const { container } = render(<LaunchClient />);
    const tablist = screen.getByRole('tablist');
    const chips = container.querySelector('[data-slot="launch-server-chips"]')!;
    const orders = container.querySelector('[data-slot="orders"]')!;
    expect(chips).not.toBeNull();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(1);
    expect(tablist.compareDocumentPosition(chips) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chips.compareDocumentPosition(orders) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('경계 지도 — 서버 칩 1개 · 탭 줄 다음 · 지도 본문 앞', () => {
    nav.query = 'tab=map';
    const { container } = render(<LaunchClient />);
    const tablist = screen.getByRole('tablist');
    const chips = container.querySelectorAll('[data-slot="launch-server-chips"]');
    const map = container.querySelector('[data-slot="map"]')!;
    expect(chips).toHaveLength(1);
    expect(tablist.compareDocumentPosition(chips[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chips[0]!.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('문서 제목 — 「러쉬 주문 · Admin」 · ?d 있으면 날짜 붙음', () => {
    nav.query = '';
    const { unmount } = render(<LaunchClient />);
    expect(document.title).toBe('러쉬 주문 · Admin');
    unmount();
    nav.query = 'd=20261026';
    render(<LaunchClient />);
    expect(document.title).toBe('러쉬 주문 · Admin · 10/26');
  });

  it('칩 「교보119」 클릭 → replace 가 다른 키를 보존한 gw=KYOBO119 주소', async () => {
    const user = userEvent.setup();
    nav.query = 'tab=orders&d=20261026&fire=n0930';
    render(<LaunchClient />);
    await user.click(screen.getByRole('radio', { name: '교보119' }));
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith('/admin/launch?tab=orders&d=20261026&fire=n0930&gw=KYOBO119');
    expect(nav.push).not.toHaveBeenCalled();
  });
});
