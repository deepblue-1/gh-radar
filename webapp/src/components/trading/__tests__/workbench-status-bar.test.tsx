import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { RelayQueuedWindowMsg } from '@gh-radar/shared';

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
 *   - DMA 필에 재시도 버튼이 없다(자동 재연결).
 */

const toneState = { blocked: false };
vi.mock('@/lib/alert-tone', () => ({
  isTonePlaybackBlocked: vi.fn(() => toneState.blocked),
  resumeToneContext: vi.fn(async () => {}),
  playBreakoutTone: vi.fn(() => false),
}));

import { isTonePlaybackBlocked, resumeToneContext } from '@/lib/alert-tone';
import { BREAKOUT_TONE_KEY, TRADING_COLS_KEY } from '@/lib/breakout-list';
import {
  AccountPill,
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
    // 남는 것: DMA · 구간 배지 · 반영 시각 · 단 수
    expect(slot('workbench-dma')?.textContent).toBe('DMA 실시간');
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

describe('WorkbenchStatusBar — DMA 필 (E1 error)', () => {
  it('끊김/재연결은 필 하나가 말하고 재시도 버튼이 없다', () => {
    render(<WorkbenchStatusBar {...props({ status: 'connecting', statusLabel: '연결 중' })} />);
    const dma = slot('workbench-dma') as HTMLElement;
    expect(dma.textContent).toBe('DMA 연결 중');
    expect(within(dma).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('button', { name: /다시|재시도|재연결/ })).toBeNull();
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
});
