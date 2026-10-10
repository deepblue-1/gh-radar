import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type {
  RelayAccount,
  RelayQueuedWindowMsg,
  RelayQuoteStateMsg,
  RelaySubLimitMsg,
} from '@gh-radar/shared';

/**
 * Phase 18 Plan 11 Task 1 — 작업대 상태줄 (D-04 · D-05 · D-17 · D-22 · E1, TRADE-09).
 *
 * 잠그는 것:
 *   - 핵심만: DMA · 구간 배지(알 때만) · 알림음 아이콘 · 반영 시각 · 단 수. 목록 개수·임계 문구 없음.
 *   - 첫 스냅샷 전: 구간 배지 없음 · 반영 시각 「—」 · 스켈레톤/「불러오는 중」 없음.
 *   - 77 모름(`undefined`)이면 구간 배지가 DOM 에 없다 — 「정규」로 위장하지 않는다(D-22).
 *   - 구간 배지 문구는 UI-SPEC 원문 그대로다(판정은 `queuedWindowBadgeOf` 한 곳).
 *   - 단 수 세그먼트: 클릭 → localStorage 저장 + `onColsChange`. 폰 밴드면 DOM 에서 빠진다.
 *   - 알림음 토글: 아이콘 전용 · 기본 꺼짐 · 차단이면 「클릭해 활성화」 · `resumeToneContext` 는 클릭 안에서.
 *   - 알림 묶음에는 돌파 알림음 하나뿐이다 — VI 브라우저 알림 토글은 기능째 제거(quick-260922-tqr).
 *   - 주문(옛 DMA) 필에 재시도 버튼이 없다(자동 재연결).
 *   - Phase 26 배지 2축(26-13 채택안 안 B): 시세 필은 모르면 없고 · live 「시세」 · down 「HH:MM:SS~ 멈춤」 적색 ·
 *     구독 한도는 title · 주문 필은 ready 면 「주문」 뿐.
 */

const toneState = { blocked: false };
vi.mock('@/lib/alert-tone', () => ({
  isTonePlaybackBlocked: vi.fn(() => toneState.blocked),
  resumeToneContext: vi.fn(async () => {}),
  playBreakoutTone: vi.fn(() => false),
}));

import { isTonePlaybackBlocked, resumeToneContext } from '@/lib/alert-tone';
import { accountLabelOf } from '@/lib/account-label';
import { BREAKOUT_TONE_KEY, TRADING_COLS_KEY } from '@/lib/breakout-list';
import {
  AccountPill,
  WORKBENCH_STATUS_TEXT,
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

function win(over: Partial<RelayQueuedWindowMsg> = {}): RelayQueuedWindowMsg {
  return {
    t: 'queued.window',
    open: false,
    maxPieces: 64,
    preopenOpen: false,
    nxtPreopenOpen: false,
    g2Open: false,
    g3Open: false,
    ...over,
  } as RelayQueuedWindowMsg;
}

function props(over: Partial<WorkbenchStatusBarProps> = {}): WorkbenchStatusBarProps {
  return {
    status: 'ready',
    statusLabel: '실시간',
    quoteState: null,
    subLimit: null,
    queuedWindow: undefined,
    appliedAt: null,
    cols: 1,
    onColsChange: vi.fn(),
    phoneBand: false,
    ...over,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  toneState.blocked = false;
  vi.mocked(resumeToneContext).mockClear();
  vi.mocked(isTonePlaybackBlocked).mockClear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('WorkbenchStatusBar — 첫 스냅샷 전 (E1 loading)', () => {
  it('구간 배지가 없고 반영 시각은 「—」 이다 — 스켈레톤·「불러오는 중」 없음', () => {
    render(<WorkbenchStatusBar {...props()} />);
    const bar = slot('workbench-status-bar') as HTMLElement;
    expect(bar).not.toBeNull();
    expect(slot('workbench-window-badge')).toBeNull();
    const applied = within(bar).getByTestId('stat-applied');
    expect(applied.textContent).toBe('반영 —');
    expect(visibleText(applied)).toBe('—');
    expect(applied).toHaveAttribute('title', '서버 반영 시각');
    expect(bar.textContent).not.toMatch(/불러오는 중/);
    expect(bar.querySelector('[aria-busy="true"]')).toBeNull();
    expect(bar.querySelector('[data-slot="skeleton"]')).toBeNull();
  });

  it('반영 시각은 받은 문자열을 그대로 mono 로 쓴다 — 보이는 글자는 맨 시각, 「반영」 은 sr-only · title', () => {
    render(<WorkbenchStatusBar {...props({ appliedAt: '09:41:52' })} />);
    const applied = screen.getByTestId('stat-applied');
    expect(applied.textContent).toBe('반영 09:41:52');
    expect(visibleText(applied)).toBe('09:41:52');
    expect(applied).toHaveAttribute('title', '서버 반영 시각');
    expect(applied.className).toContain('mono');
  });
});

describe('WorkbenchStatusBar — 77 구간 배지 (D-22)', () => {
  it('queuedWindow 가 undefined(모름) 이면 배지가 DOM 에 없다', () => {
    render(<WorkbenchStatusBar {...props({ queuedWindow: undefined })} />);
    expect(slot('workbench-window-badge')).toBeNull();
    expect(screen.queryByText('정규')).toBeNull();
  });

  it.each([
    [{ open: true, maxPieces: 12 }, '예약구간 · 조각 최대 12'],
    [{ g2Open: true }, '시간외종가 G2 창'],
    [{ g3Open: true }, '시간외종가 G3 창'],
    [{ preopenOpen: true }, '장전 · 예약매수/매도'],
    [{}, '정규'],
  ] as const)('%o → 「%s」', (over, text) => {
    render(<WorkbenchStatusBar {...props({ queuedWindow: win(over) })} />);
    expect(slot('workbench-window-badge')?.textContent).toBe(text);
  });
});

describe('WorkbenchStatusBar — 핵심만 (목록 개수·임계 문구 없음)', () => {
  it('돌파·VI 발동·거래 종목·임계·재무장·신규·미확인 글자가 없다 — 개수는 각 스트립 칩이 말한다', () => {
    render(<WorkbenchStatusBar {...props({ queuedWindow: win({ preopenOpen: true }), appliedAt: '09:41:52' })} />);
    const text = (slot('workbench-status-bar') as HTMLElement).textContent ?? '';
    for (const word of ['돌파', 'VI 발동', '거래 종목', '임계', '재무장', '신규', '미확인']) {
      expect(text).not.toContain(word);
    }
    expect(screen.queryByTestId('stat-breakout')).toBeNull();
    expect(screen.queryByTestId('stat-vi')).toBeNull();
    expect(screen.queryByTestId('stat-cards')).toBeNull();
    // 남는 것: 주문 · 구간 배지 · 반영 시각 · 단 수 (시세 상태를 모르면 시세 필은 없다)
    expect(visibleText(slot('workbench-dma') as Element)).toBe('주문');
    expect(slot('workbench-quote')).toBeNull();
    expect(slot('workbench-window-badge')?.textContent).toBe('장전 · 예약매수/매도');
    expect(screen.getByTestId('stat-applied').textContent).toBe('반영 09:41:52');
    expect(screen.getByRole('group', { name: '카드 단 수' })).toBeTruthy();
  });

  it('자동 복구 포기 시에만 「다시 연결」 이 선다', () => {
    const onReconnect = vi.fn();
    render(<WorkbenchStatusBar {...props({ status: 'failed', statusLabel: '연결 실패', onReconnect })} />);
    fireEvent.click(screen.getByRole('button', { name: '다시 연결' }));
    expect(onReconnect).toHaveBeenCalledTimes(1);
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

  it('폰 밴드(page <700) 에서는 세그먼트가 DOM 에서 빠진다 — 접근성 트리·탭 체인에도 없다', () => {
    render(<WorkbenchStatusBar {...props({ phoneBand: true })} />);
    expect(screen.queryByRole('group', { name: '카드 단 수' })).toBeNull();
    expect(slot('workbench-cols-segment')).toBeNull();
    expect(screen.queryByText('1단')).toBeNull();
  });
});

describe('WorkbenchStatusBar — 돌파 알림음 (D-17)', () => {
  it('알림음 토글은 기본 꺼짐이고 아이콘 전용이다 — 이름은 aria-label · title 이 말한다', () => {
    render(<WorkbenchStatusBar {...props()} />);
    const tone = screen.getByRole('button', { name: '돌파 알림음 켜기 (이 기기만)' });
    expect(tone.getAttribute('aria-pressed')).toBe('false');
    expect(tone.textContent).toBe('');
    expect(tone).toHaveAttribute('title', '돌파 알림음 켜기 (이 기기만)');
    expect(tone.querySelector('svg')).not.toBeNull();
  });

  it('켜면 저장되고 resumeToneContext 가 그 클릭 안에서 불린다', async () => {
    render(<WorkbenchStatusBar {...props()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '돌파 알림음 켜기 (이 기기만)' }));
    });
    expect(resumeToneContext).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(BREAKOUT_TONE_KEY)).toBe('on');
  });

  it('차단 상태면 라벨이 「클릭해 활성화」 이고, 클릭은 끄지 않고 resume 만 부른다', async () => {
    window.localStorage.setItem(BREAKOUT_TONE_KEY, 'on');
    toneState.blocked = true;
    render(<WorkbenchStatusBar {...props()} />);
    const tone = screen.getByRole('button', { name: /클릭해 활성화/ });
    expect(tone.textContent).toContain('클릭해 활성화');
    vi.mocked(resumeToneContext).mockClear();
    await act(async () => {
      fireEvent.click(tone);
    });
    expect(resumeToneContext).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(BREAKOUT_TONE_KEY)).toBe('on');
  });

  it('알림 묶음에는 돌파 알림음 토글 하나뿐이다 — VI 브라우저 알림 토글은 기능째 제거됐다 (quick-260922-tqr)', () => {
    render(<WorkbenchStatusBar {...props()} />);
    const alerts = slot('workbench-alerts') as HTMLElement;
    expect(alerts).not.toBeNull();
    const buttons = within(alerts).getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute('aria-label') ?? buttons[0].textContent).toMatch(/돌파 알림음/);
    expect(slot('workbench-vi-alert-toggle')).toBeNull();
    expect(slot('workbench-vi-alert-reason')).toBeNull();
    expect(screen.queryByRole('button', { name: /VI 마감/ })).toBeNull();
    expect(window.localStorage.getItem('gh-radar:vi-alert')).toBeNull();
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

describe('WorkbenchStatusBar — 주문 서버 바뀜 배지 (Phase 29 D-10)', () => {
  it('표식이 없으면(미지정 · 빈 객체) 배지가 DOM 에 없다', () => {
    const { rerender } = render(<WorkbenchStatusBar {...props()} />);
    expect(document.querySelectorAll('[data-slot="order-server-badge"]')).toHaveLength(0);
    rerender(<WorkbenchStatusBar {...props({ orderServerNotices: {} })} />);
    expect(document.querySelectorAll('[data-slot="order-server-badge"]')).toHaveLength(0);
  });

  it('KB 표식 → 「주문 서버가 KB121 로 바뀜 — 재접속하면 적용」 · role status · 접근 이름 = 문구 · 주문 필 바로 뒤', () => {
    render(
      <WorkbenchStatusBar
        {...props({ orderServerNotices: { KB: { current: 'KB120', next: 'KB121' } } })}
      />,
    );
    const badges = document.querySelectorAll('[data-slot="order-server-badge"]');
    expect(badges).toHaveLength(1);
    const badge = badges[0]!;
    expect(badge.textContent).toBe('주문 서버가 KB121 로 바뀜 — 재접속하면 적용');
    expect(screen.getByRole('status', { name: '주문 서버가 KB121 로 바뀜 — 재접속하면 적용' })).toBe(badge);
    expect(badge.previousElementSibling).toBe(slot('workbench-dma'));
    // 기존 「확인할 것」 축 토큰 · 잘림 대신 줄바꿈(⑦).
    expect(badge.className).toContain('--new-bg');
    expect(badge.className).toContain('--new-bd');
    expect(badge.className).toContain('max-w-full');
    expect(badge.className).not.toContain('whitespace-nowrap');
    expect(badge.className).not.toContain('truncate');
    // 버튼 없음 — 정리와 이동은 사용자 몫이다(D-10).
    expect(within(badge as HTMLElement).queryByRole('button')).toBeNull();
  });

  it('KB · 교보 둘 다 → 배지 2개(증권사 순 KB → 교보)', () => {
    render(
      <WorkbenchStatusBar
        {...props({
          orderServerNotices: {
            KYOBO: { current: 'KYOBO119', next: 'KYOBO127' },
            KB: { current: 'KB120', next: 'KB121' },
          },
        })}
      />,
    );
    const badges = [...document.querySelectorAll('[data-slot="order-server-badge"]')];
    expect(badges.map((b) => b.getAttribute('data-broker'))).toEqual(['KB', 'KYOBO']);
    expect(badges.map((b) => b.textContent)).toEqual([
      '주문 서버가 KB121 로 바뀜 — 재접속하면 적용',
      '주문 서버가 KYOBO127 로 바뀜 — 재접속하면 적용',
    ]);
  });
});

describe('AccountPill — 신규 카드의 기본 계좌 (Q-3)', () => {
  it('계좌 목록을 고르고, 기존 카드는 자기 계좌를 유지한다는 사실을 title 로 말한다', () => {
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
    expect(select.getAttribute('title')).toContain('이미 있는 카드는 자기 계좌를 유지');
    fireEvent.change(select, { target: { value: '1234567802' } });
    expect(onChange).toHaveBeenCalledWith('1234567802');
  });
  it('P1: 옵션 글자 = accountLabelOf — 수동주문 「주문계좌」 행과 같은 문자열 (quick-261007-h76)', () => {
    const accounts = [
      { accountNo: '1234567801', name: '위탁종합' },
      { accountNo: '1234567802', name: 'ISA' },
    ];
    render(<AccountPill accounts={accounts} accountNo="1234567801" onChange={vi.fn()} />);
    const texts = screen.getAllByRole('option').map((o) => o.textContent);
    expect(texts).toEqual(['1234567801 · 위탁종합', '1234567802 · ISA']);
    expect(texts).toEqual(accounts.map((a) => accountLabelOf(a.accountNo, a.name)));
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

/** 작업대와 같은 배선 — 계좌 필이 고른 계좌를 상태줄 `account` 로 넘긴다. */
function G1Harness({ accounts = G1_ACCOUNTS }: { accounts?: RelayAccount[] }) {
  const [accountNo, setAccountNo] = useState(accounts[0]?.accountNo ?? '');
  return (
    <>
      <AccountPill accounts={accounts} accountNo={accountNo} onChange={setAccountNo} />
      <WorkbenchStatusBar {...props({ account: accounts.find((a) => a.accountNo === accountNo) ?? null })} />
    </>
  );
}

const pickAccount = (no: string) =>
  fireEvent.change(screen.getByRole('combobox', { name: '계좌' }), { target: { value: no } });
const all = (name: string) => [...document.querySelectorAll(`[data-slot="${name}"]`)];

describe('AccountPill — 계좌별 주문 서버 (29-39 · 채택 A)', () => {
  it('옵션 글자 = accountLabelOf + 「 · 서버키」 꼬리표 · 고른 계좌의 서버 키 칩 1개(title 「이 계좌의 주문 서버」)', () => {
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
    expect(screen.getByRole('combobox', { name: '계좌' }).getAttribute('title')).toContain(
      '이미 있는 카드는 자기 계좌를 유지',
    );
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
    expect(slot('workbench-status-bar')!.contains(lines[0]!)).toBe(true);
  });

  it('count null → 「몇 건인지 모름」', () => {
    render(
      <WorkbenchStatusBar
        {...props({ account: { accountNo: '9', name: 'x', serverKey: 'KB121', staleStrategies: { serverKey: 'KB120', count: null } } })}
      />,
    );
    expect(all('workbench-stale-strategies').map((l) => l.textContent)).toEqual([
      '옛 서버 KB120 활성 전략 몇 건인지 모름 — 끄지 못했어요 · 클라(OCX)에서 끄세요',
    ]);
  });

  it('다음 상태 프레임에 필드가 없으면(relay 확인) 사라진다', () => {
    const acc = G1_ACCOUNTS[1]!;
    const { rerender } = render(<WorkbenchStatusBar {...props({ account: acc })} />);
    expect(all('workbench-stale-strategies')).toHaveLength(1);
    const { staleStrategies: _gone, ...confirmed } = acc;
    rerender(<WorkbenchStatusBar {...props({ account: confirmed })} />);
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
    expect(slot('workbench-status-bar')!.contains(lines[0]!)).toBe(true);
  });

  it('× 를 누르면 사라지고 같은 (2, KB120) 프레임이 다시 와도 안 보인다 · movedFrom 이 KB119 로 바뀌면 다시 보인다', () => {
    const acc = G1_ACCOUNTS[1]!;
    const { rerender } = render(<WorkbenchStatusBar {...props({ account: acc })} />);
    fireEvent.click(screen.getByRole('button', { name: '안내 닫기' }));
    expect(all('workbench-moved-from')).toHaveLength(0);
    // 같은 조합의 새 프레임(새 객체).
    rerender(<WorkbenchStatusBar {...props({ account: { ...acc } })} />);
    expect(all('workbench-moved-from')).toHaveLength(0);
    // 끄기 미확인 경고는 닫기와 무관하게 그대로다.
    expect(all('workbench-stale-strategies')).toHaveLength(1);
    rerender(<WorkbenchStatusBar {...props({ account: { ...acc, movedFrom: 'KB119' } })} />);
    const lines = all('workbench-moved-from');
    expect(lines).toHaveLength(1);
    expect(lines[0]!.textContent).toContain('주문 서버 KB119 → KB121');
  });
});

describe('WorkbenchStatusBar — 필드 없는 계좌는 줄 수 종전 (29-39)', () => {
  it('serverKey 만 있거나 계좌가 없으면 경고 · 안내 요소 0 · 상태줄 자식 수가 계좌 미지정과 같다', () => {
    const { rerender } = render(<WorkbenchStatusBar {...props()} />);
    const base = slot('workbench-status-bar')!.childElementCount;
    rerender(<WorkbenchStatusBar {...props({ account: G1_ACCOUNTS[0]! })} />);
    expect(slot('workbench-status-bar')!.childElementCount).toBe(base);
    rerender(<WorkbenchStatusBar {...props({ account: null })} />);
    expect(slot('workbench-status-bar')!.childElementCount).toBe(base);
    expect(all('workbench-stale-strategies')).toHaveLength(0);
    expect(all('workbench-moved-from')).toHaveLength(0);
  });
});
