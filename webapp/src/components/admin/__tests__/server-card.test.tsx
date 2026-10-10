import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AdminServerView } from '@gh-radar/shared';

/**
 * Phase 29 (29-31) — `ServerCard` 단독 (UI-REVIEW-6 · UI-REVIEW-3).
 *
 * 잠그는 것:
 * - 주문/시세 서버라서 끌 수 없는 카드는 「사용」 토글 아래 이유 한 줄(`server-in-use-note`)을 늘 보인다 — `title` 은
 *   터치 · 키보드 사용자가 못 본다. 토글은 `aria-describedby` 로 그 줄을 가리키고, 켜진 모양을 유지한다(흐림 없음).
 * - 주문/시세가 아닌 서버는 그 줄이 없다.
 * - 라디오 칩 터치 타깃: 폰(640 미만) 36px(`h-9`) · 데스크톱 종전 32px(`sm:h-8`). 실측은 e2e(admin-servers.spec)가 한다 —
 *   jsdom 은 레이아웃이 없어 여기서는 클래스 계약만 본다.
 */

vi.mock('@/lib/admin-api', () => ({ patchAdminServer: vi.fn() }));

import { SERVER_CARD_TEXT, ServerCard } from '../server-card';

function srv(over: Partial<AdminServerView> = {}): AdminServerView {
  return {
    key: 'KB120',
    broker: 'KB',
    host: '192.0.2.120',
    port: 9100,
    enabled: true,
    isOrderServer: false,
    isQuotePrimary: false,
    sortOrder: 1,
    userCount: 3,
    status: { conn: 'ok', journal: 'ok', admin: 'ok', quote: null },
    ...over,
  };
}

function renderCard(server: AdminServerView, checked: { order?: boolean; quote?: boolean } = {}) {
  return render(
    <ServerCard
      server={server}
      orderChecked={checked.order ?? server.isOrderServer}
      quoteChecked={checked.quote ?? server.isQuotePrimary}
      onOrder={() => {}}
      onQuote={() => {}}
      onChanged={() => {}}
    />,
  );
}

const note = () => document.querySelector('[data-slot="server-in-use-note"]') as HTMLElement | null;

describe('ServerCard — 끌 수 없는 이유 상시 한 줄 (UI-REVIEW-6)', () => {
  it('기본 주문 서버 → 이유 한 줄이 보이고 · 토글이 aria-describedby 로 가리키며 · 켜진 모양(흐림 없음)', () => {
    renderCard(srv({ isOrderServer: true }));
    const line = note();
    expect(line).not.toBeNull();
    expect(line).toHaveTextContent('기본 주문 서버 · 시세 주 서버는 끌 수 없어요');
    expect(line).toHaveTextContent(SERVER_CARD_TEXT.inUse);
    expect(line!.id).not.toBe('');

    const sw = screen.getByRole('switch', { name: 'KB120 사용' });
    expect(sw).toHaveAttribute('aria-describedby', line!.id);
    expect(sw).toHaveAttribute('data-state', 'checked');
    expect(sw).toBeDisabled();
    // 꺼진 듯 흐리지 않다 — 공용 Switch 의 disabled:opacity-50 을 이 경우만 걷는다
    expect(sw.className).toContain('disabled:opacity-100');
    expect(sw.className).toContain('disabled:cursor-not-allowed');
  });

  it('시세 주 서버(누른 의도 포함) → 이유 한 줄', () => {
    renderCard(srv({ key: 'KYOBO119', broker: 'KYOBO' }), { quote: true });
    expect(note()).toHaveTextContent(SERVER_CARD_TEXT.inUse);
    expect(screen.getByRole('switch', { name: 'KYOBO119 사용' })).toHaveAttribute('aria-describedby', note()!.id);
  });

  it('주문/시세가 아닌 서버 → 그 줄이 없고 · 토글은 켤/끌 수 있으며 aria-describedby 가 없다', () => {
    renderCard(srv({ key: 'KB121' }));
    expect(note()).toBeNull();
    const sw = screen.getByRole('switch', { name: 'KB121 사용' });
    expect(sw).toBeEnabled();
    expect(sw).not.toHaveAttribute('aria-describedby');
  });

  it('주문/시세가 아니어도 저장 경로가 없어 잠긴 토글은 종전 흐림 그대로(이유 줄 없음)', () => {
    render(
      <ServerCard server={srv({ key: 'KB121' })} orderChecked={false} quoteChecked={false} onOrder={() => {}} />,
    );
    expect(note()).toBeNull();
    const sw = screen.getByRole('switch', { name: 'KB121 사용' });
    expect(sw).toBeDisabled();
    expect(sw.className).not.toContain('disabled:opacity-100');
  });
});

describe('ServerCard — 라디오 칩 터치 타깃 (UI-REVIEW-3)', () => {
  it('주문/시세 라디오 칩 = 폰 h-9(36px) · 데스크톱 sm:h-8(32px, 종전)', () => {
    renderCard(srv({ isOrderServer: true }));
    for (const slot of ['server-order-radio', 'server-quote-radio']) {
      const pill = document.querySelector(`[data-slot="${slot}"]`) as HTMLElement;
      expect(pill.className.split(/\s+/)).toEqual(expect.arrayContaining(['h-9', 'sm:h-8']));
      expect(pill.className.split(/\s+/)).not.toContain('h-8');
    }
  });
});

// 29-38 — G-1 (가) 끄기 미확인 보조 경고: relay servers/status 의 staleAccounts(29-43)가 1 이상이면 카드 한 줄.
describe('ServerCard — 옛 주문 서버에 남은 전략 한 줄 (29-38 · staleAccounts)', () => {
  const stale = () => document.querySelector('[data-slot="server-stale-note"]') as HTMLElement | null;
  const st = (staleAccounts?: number): AdminServerView['status'] => ({
    conn: 'ok',
    journal: 'ok',
    admin: 'ok',
    quote: null,
    ...(staleAccounts === undefined ? {} : { staleAccounts }),
  });

  it('staleAccounts 2 → 경고색 한 줄 「옛 주문 서버에 남아 끄지 못한 전략 — 계좌 2개 · 클라(OCX)에서 끄세요」', () => {
    renderCard(srv({ key: 'KB121', status: st(2) }));
    const line = stale();
    expect(line).not.toBeNull();
    expect(line).toHaveTextContent('옛 주문 서버에 남아 끄지 못한 전략 — 계좌 2개 · 클라(OCX)에서 끄세요');
    expect(line!.className).toContain('text-[var(--led-latent)]');
  });

  it('staleAccounts 0 · 필드 없음(옛 relay) · 상태 없음 → 줄 없음', () => {
    const { unmount } = renderCard(srv({ key: 'KB121', status: st(0) }));
    expect(stale()).toBeNull();
    unmount();
    const b = renderCard(srv({ key: 'KB121', status: st() }));
    expect(stale()).toBeNull();
    b.unmount();
    renderCard(srv({ key: 'KB121', status: null }));
    expect(stale()).toBeNull();
  });

  it('꺼진(off) 서버 카드에도 1 이상이면 보인다 · 사용 중 한 줄 아래', () => {
    renderCard(srv({ key: 'KB121', enabled: false, status: { ...st(1)!, conn: 'off', journal: 'off', admin: 'off' } }));
    expect(stale()).toHaveTextContent('계좌 1개');
    const inUse = renderCard(srv({ key: 'KB120', isOrderServer: true, status: st(3) }));
    const cardEl = inUse.container.querySelector('[data-slot="server-card"]') as HTMLElement;
    const n = cardEl.querySelector('[data-slot="server-in-use-note"]') as HTMLElement;
    const s2 = cardEl.querySelector('[data-slot="server-stale-note"]') as HTMLElement;
    expect(n.compareDocumentPosition(s2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
