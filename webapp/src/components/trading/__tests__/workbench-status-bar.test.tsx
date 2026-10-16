import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { RelayAccount, RelayQuoteStateMsg, RelaySubLimitMsg } from '@gh-radar/shared';

/**
 * 작업대 상단 줄 (Phase 18 Plan 11 → Phase 32 D-05 · D-06 · D-07 · UI-SPEC S1 · 목업 ① A).
 *
 * 잠그는 것:
 *   - 상단 줄 카드 한 줄: 계좌 셀렉트 → 서버키 칩 → 시세 알약 → 주문 알약 → 컬럼 세그먼트. 카드 자신이
 *     `workbench-status-bar` + `data-status` 루트다(다른 spec 의 준비 신호 · Pitfall 4).
 *   - 뺀 것(D-06): 77 예약 창 배지 · 알림음 아이콘(→ /me 「이 기기」 · `device-settings-card.test.tsx`) ·
 *     반영 시각 · 「다시 연결」 `Button`. 목록 개수·임계 문구 없음.
 *   - 끊김(`onReconnect` 있음 = UNRECOVERABLE_STATES): 보이는 「주문 끊김」 + sr-only · title 원문 + 라이브 영역 밖
 *     형제 「다시 연결」 텍스트 버튼.
 *   - 단 수 세그먼트: 클릭 → localStorage 저장 + `onColsChange`. 격자 1열 고정이면 DOM 에서 빠진다.
 *   - Phase 26 배지 2축(26-13 채택안 안 B): 시세 알약은 모르면 없고 · live 「시세」 · down 「HH:MM:SS~ 멈춤」 적색 ·
 *     구독 한도는 title · 주문 알약은 ready 면 「주문」 뿐.
 *   - 보조 줄(`WorkbenchAuxLines`)은 카드 밖 — 낡은 전략 · 옮김(29-39) 문구 · 닫기 그대로.
 */

import { accountFullLabelOf, accountLabelOf } from '@/lib/account-label';
import { TRADING_COLS_KEY } from '@/lib/breakout-list';
import {
  ACCOUNT_PILL_TITLE,
  AccountPill,
  WORKBENCH_STATUS_TEXT,
  WorkbenchAuxLines,
  WorkbenchStatusBar,
  type WorkbenchStatusBarProps,
} from '../workbench/workbench-status-bar';

const slot = (name: string) => document.querySelector(`[data-slot="${name}"]`);
/** 눈에 보이는 글자 — `sr-only` 조각을 뺀 textContent. */
function visibleText(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('.sr-only').forEach((n) => n.remove());
  return clone.textContent ?? '';
}

function props(over: Partial<WorkbenchStatusBarProps> = {}): WorkbenchStatusBarProps {
  return {
    status: 'ready',
    statusLabel: '실시간',
    quoteState: null,
    subLimit: null,
    accounts: [],
    accountNo: '',
    onAccountChange: vi.fn(),
    cols: 1,
    onColsChange: vi.fn(),
    phoneBand: false,
    ...over,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

const TWO: RelayAccount[] = [
  { accountNo: '1234-5678', name: '김알렉스', serverKey: 'KB120' },
  { accountNo: '8765-4321', name: '교보 종합', serverKey: 'KYOBO119' },
];
const LIVE: RelayQuoteStateMsg = { t: 'quote.state', s: 'live' };

describe('P32 상단 줄 A (D-05 · D-06 · S1)', () => {
  it('루트는 상단 줄 카드 자신이다 — data-slot="workbench-status-bar" + data-status', () => {
    render(<WorkbenchStatusBar {...props({ status: 'reconnecting', statusLabel: '재접속 중' })} />);
    const bar = slot('workbench-status-bar') as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar).toHaveAttribute('data-status', 'reconnecting');
    expect(bar.className.split(/\s+/)).toContain('flex-wrap');
  });

  it('자식 순서 — 셀렉트 → 서버키 칩 → 시세 → 주문 → 세그먼트 (모두 카드 안)', () => {
    render(<WorkbenchStatusBar {...props({ accounts: TWO, accountNo: '1234-5678', quoteState: LIVE })} />);
    const bar = slot('workbench-status-bar') as HTMLElement;
    const order = [
      slot('workbench-account'),
      slot('workbench-account-server'),
      slot('workbench-quote'),
      slot('workbench-dma'),
      slot('workbench-cols-segment'),
    ];
    order.forEach((el) => {
      expect(el).not.toBeNull();
      expect(bar.contains(el)).toBe(true);
    });
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // 세그먼트는 오른쪽 끝(ml-auto) — 넘치면 flex-wrap 다음 줄 오른쪽 끝.
    expect(slot('workbench-cols-segment')!.className.split(/\s+/)).toContain('ml-auto');
  });

  it('뺀 것 — 예약 창 배지 · 알림음 · 반영 시각 · 「다시 연결」 Button 이 없다 (D-06)', () => {
    render(<WorkbenchStatusBar {...props({ accounts: TWO, accountNo: '1234-5678', quoteState: LIVE })} />);
    const bar = slot('workbench-status-bar') as HTMLElement;
    for (const name of ['workbench-window-badge', 'workbench-tone-toggle', 'workbench-alerts', 'workbench-reconnect']) {
      expect(slot(name)).toBeNull();
    }
    expect(screen.queryByTestId('stat-applied')).toBeNull();
    expect(screen.queryByRole('button', { name: /알림음/ })).toBeNull();
    expect(bar.textContent).not.toMatch(/정규|반영|다시 연결/);
  });

  it('ready — 「● 주문」 뿐(상태어 b 없음 · sr-only 「실시간」)', () => {
    render(<WorkbenchStatusBar {...props()} />);
    const dma = slot('workbench-dma') as HTMLElement;
    expect(visibleText(dma)).toBe('주문');
    expect(dma.textContent).toBe('주문 실시간');
    expect(dma.querySelector('b')).toBeNull();
    expect(dma.querySelector('[data-tone]')?.className).toContain('bg-[var(--led-armed)]');
  });

  it('진행 상태 — 「주문 {RELAY_STATE_LABELS}」 · 점 --flat pulse · 「다시 연결」 없음', () => {
    const { rerender } = render(<WorkbenchStatusBar {...props({ status: 'reconnecting', statusLabel: '재접속 중' })} />);
    expect(visibleText(slot('workbench-dma')!)).toBe('주문 재접속 중');
    expect(slot('workbench-reconnect')).toBeNull();
    rerender(<WorkbenchStatusBar {...props({ status: 'logging_in', statusLabel: 'DMA 로그인 중…' })} />);
    const dma = slot('workbench-dma') as HTMLElement;
    expect(visibleText(dma)).toBe('주문 DMA 로그인 중…');
    const dot = dma.querySelector('[data-tone]') as HTMLElement;
    expect(dot.className).toContain('bg-[var(--flat)]');
    expect(dot.className).toContain('animate-pulse');
    expect(slot('workbench-reconnect')).toBeNull();
  });

  it('unauthorized — 「주문 권한 없음」 · 링크 없음(UNRECOVERABLE 밖)', () => {
    render(<WorkbenchStatusBar {...props({ status: 'unauthorized', statusLabel: '권한 없음' })} />);
    expect(visibleText(slot('workbench-dma')!)).toBe('주문 권한 없음');
    expect(slot('workbench-reconnect')).toBeNull();
    expect(screen.queryByRole('button', { name: '다시 연결' })).toBeNull();
  });

  it('끊김(failed + onReconnect) — 보이는 「주문 끊김」 · 정확한 상태어는 sr-only 「 — 회선 단절」 · title', () => {
    render(<WorkbenchStatusBar {...props({ status: 'failed', statusLabel: '회선 단절', onReconnect: vi.fn() })} />);
    const dma = slot('workbench-dma') as HTMLElement;
    expect(visibleText(dma)).toBe('주문 끊김');
    expect(dma.textContent).toBe('주문 끊김 — 회선 단절');
    expect(dma).toHaveAttribute('title', '회선 단절');
    expect(dma).toHaveAttribute('aria-live', 'polite');
  });

  it('끊김 — 점 · 상태어는 --destructive(가격 방향 --up 아님)', () => {
    render(
      <WorkbenchStatusBar
        {...props({ status: 'manual_required', statusLabel: '다시 연결하지 못했어요', onReconnect: vi.fn() })}
      />,
    );
    const dma = slot('workbench-dma') as HTMLElement;
    expect(dma.querySelector('[data-tone]')?.className).toContain('bg-[var(--destructive)]');
    expect(dma.querySelector('b')?.className).toContain('text-[var(--destructive)]');
    expect(dma.querySelector('b')?.textContent).toBe('끊김');
    expect(dma.outerHTML).not.toContain('--up');
    expect(dma.textContent).toBe('주문 끊김 — 다시 연결하지 못했어요');
  });

  it('「다시 연결」 은 workbench-dma 라이브 영역 밖 형제다 — 라이브 영역이 버튼 글자를 낭독하지 않는다', () => {
    render(<WorkbenchStatusBar {...props({ status: 'failed', statusLabel: '회선 단절', onReconnect: vi.fn() })} />);
    const dma = slot('workbench-dma') as HTMLElement;
    const btn = slot('workbench-reconnect') as HTMLElement;
    expect(btn).not.toBeNull();
    expect(dma.contains(btn)).toBe(false);
    expect(btn.parentElement).toBe(dma.parentElement);
    expect(dma.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(visibleText(dma.parentElement!)).toBe('주문 끊김·다시 연결');
  });

  it('「다시 연결」 = 네이티브 button(type=button · 이름 = 보이는 글자 · --primary) · 클릭 → onReconnect 1회', () => {
    const onReconnect = vi.fn();
    render(<WorkbenchStatusBar {...props({ status: 'session_rejected', statusLabel: '로그인 거부', onReconnect })} />);
    const btn = screen.getByRole('button', { name: '다시 연결' });
    expect(btn).toBe(slot('workbench-reconnect'));
    expect(btn).toHaveAttribute('type', 'button');
    expect(btn.className).toContain('text-[var(--primary)]');
    fireEvent.click(btn);
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('계좌 0 → 셀렉트 「계좌 확인 중…」 1옵션 · 비활성 · 서버키 칩 없음 · 알약 · 세그먼트는 그대로', () => {
    render(<WorkbenchStatusBar {...props({ accounts: [], accountNo: '' })} />);
    const select = screen.getByRole('combobox', { name: '계좌' });
    expect(select).toBeDisabled();
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['계좌 확인 중…']);
    expect(slot('workbench-account-server')).toBeNull();
    expect(slot('workbench-dma')).not.toBeNull();
    expect(slot('workbench-cols-segment')).not.toBeNull();
  });

  it('서버키 없는 계좌 → 칩 없음 · 셀렉트를 바꾸면 onAccountChange', () => {
    const onAccountChange = vi.fn();
    render(
      <WorkbenchStatusBar
        {...props({ accounts: [{ accountNo: '5555-0001', name: '' }, ...TWO], accountNo: '5555-0001', onAccountChange })}
      />,
    );
    expect(slot('workbench-account-server')).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: '계좌' }), { target: { value: '8765-4321' } });
    expect(onAccountChange).toHaveBeenCalledWith('8765-4321');
  });

  it('옵션 글자 = accountFullLabelOf (D-12 · 빈 칸 생략)', () => {
    const accounts: RelayAccount[] = [{ accountNo: '5555-0001', name: '' }, ...TWO, { accountNo: '9999-0000', name: '', serverKey: 'KB121' }];
    render(<WorkbenchStatusBar {...props({ accounts, accountNo: '5555-0001' })} />);
    const texts = screen.getAllByRole('option').map((o) => o.textContent);
    expect(texts).toEqual(accounts.map((a) => accountFullLabelOf(a)));
    expect(texts).toEqual(['5555-0001', '1234-5678 · 김알렉스 · KB120', '8765-4321 · 교보 종합 · KYOBO119', '9999-0000 · KB121']);
  });

  it('격자 1열 고정(phoneBand true) → 세그먼트 DOM 제외 · 미판정(null) → CSS 폴백 클래스', () => {
    const { rerender } = render(<WorkbenchStatusBar {...props({ phoneBand: true })} />);
    expect(slot('workbench-cols-segment')).toBeNull();
    expect(screen.queryByRole('group', { name: '카드 단 수' })).toBeNull();
    rerender(<WorkbenchStatusBar {...props({ phoneBand: null })} />);
    const seg = slot('workbench-cols-segment') as HTMLElement;
    expect(seg.className).toContain('hidden');
    expect(seg.className).toContain('@min-[680px]/wb:inline-flex');
  });

  it('스켈레톤 · 「불러오는 중」 없음 — 첫 스냅샷 전에도 상단 줄은 그대로다', () => {
    render(<WorkbenchStatusBar {...props({ status: 'connecting', statusLabel: '' })} />);
    const bar = slot('workbench-status-bar') as HTMLElement;
    expect(bar.textContent).not.toMatch(/불러오는 중/);
    expect(bar.querySelector('[aria-busy="true"]')).toBeNull();
    expect(bar.querySelector('[data-slot="skeleton"]')).toBeNull();
  });
});

describe('WorkbenchStatusBar — 핵심만 (목록 개수·임계 문구 없음)', () => {
  it('돌파·VI 발동·거래 종목·임계·재무장·신규·미확인 글자가 없다 — 개수는 각 스트립 칩이 말한다', () => {
    render(<WorkbenchStatusBar {...props()} />);
    const text = (slot('workbench-status-bar') as HTMLElement).textContent ?? '';
    for (const word of ['돌파', 'VI 발동', '거래 종목', '임계', '재무장', '신규', '미확인']) {
      expect(text).not.toContain(word);
    }
    expect(screen.queryByTestId('stat-breakout')).toBeNull();
    expect(screen.queryByTestId('stat-vi')).toBeNull();
    expect(screen.queryByTestId('stat-cards')).toBeNull();
    // 남는 것: 계좌 · 주문 · 단 수 (시세 상태를 모르면 시세 알약은 없다)
    expect(visibleText(slot('workbench-dma') as Element)).toBe('주문');
    expect(slot('workbench-quote')).toBeNull();
    expect(screen.getByRole('group', { name: '카드 단 수' })).toBeTruthy();
  });
});

describe('WorkbenchStatusBar — 단 수 세그먼트 (D-04)', () => {
  it('클릭하면 localStorage 에 저장되고 onColsChange 가 불린다', () => {
    const onColsChange = vi.fn();
    render(<WorkbenchStatusBar {...props({ cols: 1, onColsChange })} />);
    const group = screen.getByRole('group', { name: '카드 단 수' });
    fireEvent.click(within(group).getByRole('radio', { name: '3단' }));
    expect(onColsChange).toHaveBeenCalledWith(3);
    expect(window.localStorage.getItem(TRADING_COLS_KEY)).toBe('3');
  });

  it('선택된 단 수가 표시된다', () => {
    render(<WorkbenchStatusBar {...props({ cols: 2 })} />);
    const group = screen.getByRole('group', { name: '카드 단 수' });
    expect(within(group).getByRole('radio', { name: '2단' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('격자 1열 고정(wb <680) 에서는 세그먼트가 DOM 에서 빠진다 — 접근성 트리·탭 체인에도 없다', () => {
    render(<WorkbenchStatusBar {...props({ phoneBand: true })} />);
    expect(screen.queryByRole('group', { name: '카드 단 수' })).toBeNull();
    expect(slot('workbench-cols-segment')).toBeNull();
    expect(screen.queryByText('1단')).toBeNull();
  });
});

describe('WorkbenchStatusBar — 주문 필 (E1 error)', () => {
  it('끊김/재연결은 필 하나가 말하고 재시도 버튼이 없다', () => {
    render(<WorkbenchStatusBar {...props({ status: 'connecting', statusLabel: '연결 중' })} />);
    const dma = slot('workbench-dma') as HTMLElement;
    expect(dma.textContent).toBe('주문 연결 중');
    expect(within(dma).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('button', { name: /다시|재시도|재연결/ })).toBeNull();
  });
});

describe('WorkbenchStatusBar — 시세 필 (D-01 · D-04)', () => {
  const live: RelayQuoteStateMsg = { t: 'quote.state', s: 'live' };
  const down: RelayQuoteStateMsg = { t: 'quote.state', s: 'down', since: '2026-09-30T00:41:52.000Z' };
  const limit: RelaySubLimitMsg = { t: 'sub.limit', i: 'KR7123450002', x: 'KRX', scope: 'user' };

  it('quoteState 가 null(모름)이면 시세 필이 DOM 에 없다 — 주문 필만', () => {
    render(<WorkbenchStatusBar {...props({ quoteState: null, subLimit: limit })} />);
    expect(slot('workbench-quote')).toBeNull();
    expect(slot('workbench-dma')).not.toBeNull();
  });

  it('live → 「● 시세」 · data-tone ok · aria-live polite · 주문 필 앞 · 점은 --led-armed', () => {
    render(<WorkbenchStatusBar {...props({ quoteState: live })} />);
    const quote = slot('workbench-quote') as HTMLElement;
    expect(quote).toHaveAttribute('data-tone', 'ok');
    expect(quote).toHaveAttribute('aria-live', 'polite');
    expect(visibleText(quote)).toBe('시세');
    expect(quote.textContent).toBe('시세 실시간');
    expect(quote.querySelector('[aria-hidden="true"]')?.className).toContain('bg-[var(--led-armed)]');
    expect(quote).not.toHaveAttribute('title');
    // 채택안 순서 — 시세 필이 주문 필 앞에 선다.
    const dma = slot('workbench-dma') as HTMLElement;
    expect(quote.compareDocumentPosition(dma) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('down → 「● 시세 09:41:52~ 멈춤」(KST) · data-tone down · 점 · 상태어 --destructive · --up 없음', () => {
    render(<WorkbenchStatusBar {...props({ quoteState: down })} />);
    const quote = slot('workbench-quote') as HTMLElement;
    expect(quote).toHaveAttribute('data-tone', 'down');
    expect(visibleText(quote)).toBe('시세 09:41:52~ 멈춤');
    expect(quote.querySelector('[aria-hidden="true"]')?.className).toContain('bg-[var(--destructive)]');
    expect(quote.querySelector('b')?.className).toContain('text-[var(--destructive)]');
    expect(quote.outerHTML).not.toContain('--up');
  });

  it('시세가 끊겨도 주문 필은 사용자 DMA 세션 상태를 따로 말한다', () => {
    render(<WorkbenchStatusBar {...props({ quoteState: down, status: 'ready', statusLabel: '실시간' })} />);
    const dma = slot('workbench-dma') as HTMLElement;
    expect(visibleText(dma)).toBe('주문');
    expect(dma.querySelector('[data-tone]')).toHaveAttribute('data-tone', 'ok');
  });

  it('구독 한도는 칩이 아니라 시세 필 title — 종목명 · 코드 · 거래소', () => {
    render(
      <WorkbenchStatusBar
        {...props({ quoteState: live, subLimit: limit, subLimitLabel: { name: '○○바이오', code: '123450' } })}
      />,
    );
    const quote = slot('workbench-quote') as HTMLElement;
    expect(quote.getAttribute('title')).toBe(
      '구독 한도 — 내 구독 종목이 200개에 닿아 ○○바이오(123450 · KRX) 시세를 받지 못했어요. 쓰지 않는 카드를 닫으면 다시 받을 수 있어요.',
    );
    expect(visibleText(quote)).toBe('시세');
    expect(slot('workbench-sub-limit')).toBeNull();
  });
});

describe('WorkbenchStatusBar — 옛 「재접속하면 적용」 배지 없음 (29-39 · G-1 즉시 재수립)', () => {
  it('배지 문구 함수가 모듈에 없고 상태줄 어디에도 「재접속하면 적용」 이 없다', async () => {
    const mod = await import('../workbench/workbench-status-bar');
    expect('orderServerBadgeText' in mod).toBe(false);
    render(
      <>
        <WorkbenchStatusBar {...props({ accounts: G1_ACCOUNTS, accountNo: '2' })} />
        <WorkbenchAuxLines account={G1_ACCOUNTS[1]!} />
      </>,
    );
    expect(document.body.textContent).not.toContain('재접속하면 적용');
  });
});

describe('AccountPill — 작업대에 보일 계좌 (Phase 32 D-01 · S1)', () => {
  it('계좌 목록을 고르고, 셀렉트가 작업대 스코프라는 사실을 title 로 말한다(옛 「자기 계좌를 유지」 문구 없음)', () => {
    const onChange = vi.fn();
    render(
      <AccountPill
        accounts={[
          { accountNo: '1234567801', name: '위탁종합' },
          { accountNo: '1234567802', name: 'ISA' },
        ]}
        accountNo="1234567801"
        onChange={onChange}
      />,
    );
    const select = screen.getByRole('combobox', { name: '계좌' });
    expect(select.getAttribute('title')).toBe('작업대에 보일 계좌예요 · 새로 추가하는 카드도 이 계좌로 열려요');
    expect(select.getAttribute('title')).not.toContain('자기 계좌를 유지');
    fireEvent.change(select, { target: { value: '1234567802' } });
    expect(onChange).toHaveBeenCalledWith('1234567802');
  });
  it('P1: 서버키 없는 계좌의 옵션 글자 = accountLabelOf = accountFullLabelOf — 수동주문 「주문계좌」 행과 같은 문자열 (quick-261007-h76 · D-12)', () => {
    const accounts = [
      { accountNo: '1234567801', name: '위탁종합' },
      { accountNo: '1234567802', name: 'ISA' },
    ];
    render(<AccountPill accounts={accounts} accountNo="1234567801" onChange={vi.fn()} />);
    const texts = screen.getAllByRole('option').map((o) => o.textContent);
    expect(texts).toEqual(['1234567801 · 위탁종합', '1234567802 · ISA']);
    expect(texts).toEqual(accounts.map((a) => accountLabelOf(a.accountNo, a.name)));
    expect(texts).toEqual(accounts.map((a) => accountFullLabelOf(a)));
  });

  it('P2: 이름이 빈 계좌는 번호만 — 「번호 · 」 꼬리 없음', () => {
    render(
      <AccountPill
        accounts={[{ accountNo: '1234567801', name: '' }]}
        accountNo="1234567801"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['1234567801']);
  });
});

/*
 * Phase 29-39 G-1 — 작업대 계좌별 주문 서버 표시(29-30 채택 workbench-display A) ·
 * gh-trade-84 ②(가) 끄기 미확인 경고 · ② 추가 되돌아옴 「클라(OCX) 대사」 안내.
 * 원천은 relay 상태 프레임 계좌 항목의 `serverKey` · `staleStrategies` · `movedFrom`(29-36) — 표시 전용.
 */
const G1_ACCOUNTS: RelayAccount[] = [
  { accountNo: '1', name: '홍길동', serverKey: 'KB120' },
  {
    accountNo: '2',
    name: '단기',
    serverKey: 'KB121',
    movedFrom: 'KB120',
    staleStrategies: { serverKey: 'KB120', count: 2 },
  },
];

/**
 * 작업대와 같은 배선(Phase 32 목업 ① A) — 상단 줄 카드 안 셀렉트가 고른 계좌를 카드 밖 보조 줄
 * `WorkbenchAuxLines account` 로 넘긴다.
 */
function G1Harness({ accounts = G1_ACCOUNTS }: { accounts?: RelayAccount[] }) {
  const [accountNo, setAccountNo] = useState(accounts[0]?.accountNo ?? '');
  return (
    <div data-slot="workbench-head">
      <WorkbenchStatusBar {...props({ accounts, accountNo, onAccountChange: setAccountNo })} />
      <WorkbenchAuxLines account={accounts.find((a) => a.accountNo === accountNo) ?? null} />
    </div>
  );
}

const pickAccount = (no: string) =>
  fireEvent.change(screen.getByRole('combobox', { name: '계좌' }), { target: { value: no } });
const all = (name: string) => [...document.querySelectorAll(`[data-slot="${name}"]`)];

describe('AccountPill — 계좌별 주문 서버 (29-39 · 채택 A)', () => {
  it('옵션 글자 = accountFullLabelOf(번호 · 이름 · 서버키) · 고른 계좌의 서버 키 칩 1개(title 「이 계좌의 주문 서버」)', () => {
    render(<G1Harness />);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      '1 · 홍길동 · KB120',
      '2 · 단기 · KB121',
    ]);
    const chips = all('workbench-account-server');
    expect(chips).toHaveLength(1);
    expect(chips[0]!.textContent).toBe('KB120');
    expect(chips[0]).toHaveAttribute('title', '이 계좌의 주문 서버');
    // 목업 A `.srvkey` — mono 10px bold · h18 · r5 · --muted 바탕 · --fg-2 글자.
    for (const cls of ['mono', 'text-[10px]', 'font-bold', 'h-[18px]', 'rounded-[5px]', 'bg-[var(--muted)]', 'text-[var(--fg-2)]']) {
      expect(chips[0]!.className).toContain(cls);
    }
    // 칩은 필 바로 옆이다.
    expect(chips[0]!.previousElementSibling).toBe(screen.getByRole('combobox', { name: '계좌' }));
  });

  it('계좌 2 를 고르면 칩이 「KB121」 로 바뀐다', () => {
    render(<G1Harness />);
    pickAccount('2');
    expect(all('workbench-account-server').map((c) => c.textContent)).toEqual(['KB121']);
  });

  it('serverKey 없는 계좌는 옵션 꼬리표 · 칩 없음 — 필 기존 동작(title · 비마스킹) 그대로', () => {
    render(
      <G1Harness
        accounts={[
          { accountNo: '1234567801', name: '위탁종합' },
          { accountNo: '1234567802', name: 'ISA', serverKey: 'KB121' },
        ]}
      />,
    );
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      '1234567801 · 위탁종합',
      '1234567802 · ISA · KB121',
    ]);
    expect(all('workbench-account-server')).toHaveLength(0);
    expect(screen.getByRole('combobox', { name: '계좌' }).getAttribute('title')).toBe(ACCOUNT_PILL_TITLE);
    pickAccount('1234567802');
    expect(all('workbench-account-server').map((c) => c.textContent)).toEqual(['KB121']);
  });
});

describe('WorkbenchStatusBar — 끄기 미확인 경고 (29-39 · gh-trade-84 ②(가))', () => {
  const STALE = '옛 서버 KB120 활성 전략 2건 — 끄지 못했어요 · 클라(OCX)에서 끄세요';

  it('문구 상수 — 수 · null(몇 건인지 모름)', () => {
    expect(WORKBENCH_STATUS_TEXT.staleStrategies('KB120', 2)).toBe(STALE);
    expect(WORKBENCH_STATUS_TEXT.staleStrategies('KB120', null)).toBe(
      '옛 서버 KB120 활성 전략 몇 건인지 모름 — 끄지 못했어요 · 클라(OCX)에서 끄세요',
    );
  });

  it('고른 계좌 기준 — 계좌 1 은 0개 · 계좌 2 는 1개 · role status · 닫기 버튼 없음', () => {
    render(<G1Harness />);
    expect(all('workbench-stale-strategies')).toHaveLength(0);
    pickAccount('2');
    const lines = all('workbench-stale-strategies');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.textContent).toBe(STALE);
    expect(lines[0]).toHaveAttribute('role', 'status');
    expect(within(lines[0] as HTMLElement).queryByRole('button')).toBeNull();
    // 상태줄 안의 한 줄이다.
    // Phase 32 D-06 — 상단 줄 카드 밖, 바로 아래 보조 줄이다.
    expect(slot('workbench-status-bar')!.contains(lines[0]!)).toBe(false);
    expect(slot('workbench-aux-lines')!.contains(lines[0]!)).toBe(true);
    expect(slot('workbench-status-bar')!.nextElementSibling).toBe(slot('workbench-aux-lines'));
  });

  it('count null → 「몇 건인지 모름」', () => {
    render(
      <WorkbenchAuxLines
        account={{ accountNo: '9', name: 'x', serverKey: 'KB121', staleStrategies: { serverKey: 'KB120', count: null } }}
      />,
    );
    expect(all('workbench-stale-strategies').map((l) => l.textContent)).toEqual([
      '옛 서버 KB120 활성 전략 몇 건인지 모름 — 끄지 못했어요 · 클라(OCX)에서 끄세요',
    ]);
  });

  it('GC-12 문구 상수 — otherServers 가 있으면 「외 N개 서버」 · 없거나 빈 배열이면 종전 문구', () => {
    expect(WORKBENCH_STATUS_TEXT.staleStrategies('KB120', 3, ['KB122'])).toBe(
      '옛 서버 KB120 외 1개 서버 활성 전략 3건 — 끄지 못했어요 · 클라(OCX)에서 끄세요',
    );
    expect(WORKBENCH_STATUS_TEXT.staleStrategies('KB120', null, ['KB121', 'KB122'])).toBe(
      '옛 서버 KB120 외 2개 서버 활성 전략 몇 건인지 모름 — 끄지 못했어요 · 클라(OCX)에서 끄세요',
    );
    expect(WORKBENCH_STATUS_TEXT.staleStrategies('KB120', 2, [])).toBe(STALE);
    expect(WORKBENCH_STATUS_TEXT.staleStrategies('KB120', 2, undefined)).toBe(STALE);
  });

  it('GC-12 — 상태 프레임 staleStrategies { KB120, 3, otherServers [KB122] } → 경고 줄 「옛 서버 KB120 외 1개 서버 …」 1개', () => {
    render(
      <WorkbenchAuxLines
        account={{
          accountNo: '9',
          name: 'x',
          serverKey: 'KB121',
          staleStrategies: { serverKey: 'KB120', count: 3, otherServers: ['KB122'] },
        }}
      />,
    );
    expect(all('workbench-stale-strategies').map((l) => l.textContent)).toEqual([
      '옛 서버 KB120 외 1개 서버 활성 전략 3건 — 끄지 못했어요 · 클라(OCX)에서 끄세요',
    ]);
  });

  it('GC-12 — otherServers 없으면 종전 문구 그대로(옛 서버 하나)', () => {
    render(
      <WorkbenchAuxLines
        account={{ accountNo: '9', name: 'x', serverKey: 'KB121', staleStrategies: { serverKey: 'KB120', count: 2 } }}
      />,
    );
    expect(all('workbench-stale-strategies').map((l) => l.textContent)).toEqual([STALE]);
  });

  it('다음 상태 프레임에 필드가 없으면(relay 확인) 사라진다', () => {
    const acc = G1_ACCOUNTS[1]!;
    const { rerender } = render(<WorkbenchAuxLines account={acc} />);
    expect(all('workbench-stale-strategies')).toHaveLength(1);
    const { staleStrategies: _gone, ...confirmed } = acc;
    rerender(<WorkbenchAuxLines account={confirmed} />);
    expect(all('workbench-stale-strategies')).toHaveLength(0);
  });
});

describe('WorkbenchStatusBar — 되돌아옴 「클라 대사」 안내 (29-39 · gh-trade-84 ② 추가)', () => {
  const MOVED = '주문 서버 KB120 → KB121 — 옛 서버 잔고 · 미체결은 클라(OCX) 대사로 맞추세요';

  it('문구 상수', () => {
    expect(WORKBENCH_STATUS_TEXT.movedFrom('KB120', 'KB121')).toBe(MOVED);
  });

  it('계좌 1 에는 없음 · 계좌 2 를 고르면 1개', () => {
    render(<G1Harness />);
    expect(all('workbench-moved-from')).toHaveLength(0);
    pickAccount('2');
    const lines = all('workbench-moved-from');
    expect(lines).toHaveLength(1);
    expect(visibleText(lines[0]!).replace(/×$/, '').trim()).toBe(MOVED);
    // Phase 32 D-06 — 상단 줄 카드 밖, 바로 아래 보조 줄이다.
    expect(slot('workbench-status-bar')!.contains(lines[0]!)).toBe(false);
    expect(slot('workbench-aux-lines')!.contains(lines[0]!)).toBe(true);
    expect(slot('workbench-status-bar')!.nextElementSibling).toBe(slot('workbench-aux-lines'));
  });

  it('× 를 누르면 사라지고 같은 (2, KB120) 프레임이 다시 와도 안 보인다 · movedFrom 이 KB119 로 바뀌면 다시 보인다', () => {
    const acc = G1_ACCOUNTS[1]!;
    const { rerender } = render(<WorkbenchAuxLines account={acc} />);
    fireEvent.click(screen.getByRole('button', { name: '안내 닫기' }));
    expect(all('workbench-moved-from')).toHaveLength(0);
    // 같은 조합의 새 프레임(새 객체).
    rerender(<WorkbenchAuxLines account={{ ...acc }} />);
    expect(all('workbench-moved-from')).toHaveLength(0);
    // 끄기 미확인 경고는 닫기와 무관하게 그대로다.
    expect(all('workbench-stale-strategies')).toHaveLength(1);
    rerender(<WorkbenchAuxLines account={{ ...acc, movedFrom: 'KB119' }} />);
    const lines = all('workbench-moved-from');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.textContent).toContain('주문 서버 KB119 → KB121');
  });
});

describe('WorkbenchAuxLines — 필드 없는 계좌는 요소 0 (29-39 · Phase 32 S1 partial)', () => {
  it('serverKey 만 있거나 계좌가 없으면 보조 줄 요소 0 — 머리 높이는 상단 줄만', () => {
    const { container, rerender } = render(<WorkbenchAuxLines account={G1_ACCOUNTS[0]!} />);
    expect(container.childElementCount).toBe(0);
    rerender(<WorkbenchAuxLines account={null} />);
    expect(container.childElementCount).toBe(0);
    expect(all('workbench-aux-lines')).toHaveLength(0);
    expect(all('workbench-stale-strategies')).toHaveLength(0);
    expect(all('workbench-moved-from')).toHaveLength(0);
  });

  it('옮김 안내만 있고 닫으면 보조 줄 컨테이너째 사라진다 · 둘 다 있으면 2줄로 쌓인다', () => {
    const onlyMove: RelayAccount = { accountNo: '3', name: 'y', serverKey: 'KB121', movedFrom: 'KB120' };
    const { container, rerender } = render(<WorkbenchAuxLines account={onlyMove} />);
    expect(all('workbench-moved-from')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '안내 닫기' }));
    expect(container.childElementCount).toBe(0);
    rerender(<WorkbenchAuxLines account={G1_ACCOUNTS[1]!} />);
    const box = slot('workbench-aux-lines') as HTMLElement;
    expect([...box.children].map((c) => c.getAttribute('data-slot'))).toEqual([
      'workbench-stale-strategies',
      'workbench-moved-from',
    ]);
  });
});
