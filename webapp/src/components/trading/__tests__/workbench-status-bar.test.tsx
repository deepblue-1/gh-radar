import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { RelayQueuedWindowMsg } from '@gh-radar/shared';

/**
 * Phase 18 Plan 11 Task 1 — 작업대 상태줄 (D-04 · D-05 · D-17 · D-22 · E1, TRADE-09).
 *
 * 잠그는 것:
 *   - 첫 스냅샷 전: 카운터 0 · 구간 배지 없음 · 「반영 —」 · 스켈레톤/「불러오는 중」 없음.
 *   - 77 모름(`undefined`)이면 구간 배지가 DOM 에 없다 — 「정규」로 위장하지 않는다(D-22).
 *   - 구간 배지 문구는 UI-SPEC 원문 그대로다(판정은 `queuedWindowBadgeOf` 한 곳).
 *   - 신규/미확인 0 이면 그 필이 접근성 트리에도 없다.
 *   - 단 수 세그먼트: 클릭 → localStorage 저장 + `onColsChange`. 폰 밴드면 DOM 에서 빠진다.
 *   - 알림음 토글: 기본 꺼짐 · 차단이면 「클릭해 활성화」 · `resumeToneContext` 는 클릭 안에서.
 *   - VI 마감알림 토글이 알림음 옆에 있다(기능 제거 0 · Q-1).
 *   - DMA 필에 재시도 버튼이 없다(자동 재연결).
 */

const toneState = { blocked: false };
vi.mock('@/lib/alert-tone', () => ({
  isTonePlaybackBlocked: vi.fn(() => toneState.blocked),
  resumeToneContext: vi.fn(async () => {}),
  playBreakoutTone: vi.fn(() => false),
}));

vi.mock('@/lib/vi-alert', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vi-alert')>();
  return {
    ...actual,
    requestViAlertPermission: vi.fn(async () => ({ ok: true as const })),
  };
});

import { isTonePlaybackBlocked, resumeToneContext } from '@/lib/alert-tone';
import { BREAKOUT_TONE_KEY, TRADING_COLS_KEY } from '@/lib/breakout-list';
import { VI_ALERT_STORAGE_KEY, requestViAlertPermission } from '@/lib/vi-alert';
import {
  AccountPill,
  WorkbenchStatusBar,
  type WorkbenchStatusBarProps,
} from '../workbench/workbench-status-bar';

const slot = (name: string) => document.querySelector(`[data-slot="${name}"]`);

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
    breakoutCount: 0,
    breakoutNewCount: 0,
    viCount: 0,
    viUnconfirmedCount: 0,
    cardCount: 0,
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
  vi.mocked(requestViAlertPermission).mockClear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('WorkbenchStatusBar — 첫 스냅샷 전 (E1 loading)', () => {
  it('카운터가 전부 0 이고 구간 배지가 없으며 「반영 —」 이다 — 스켈레톤·「불러오는 중」 없음', () => {
    render(<WorkbenchStatusBar {...props()} />);
    const bar = slot('workbench-status-bar') as HTMLElement;
    expect(bar).not.toBeNull();
    expect(within(bar).getByTestId('stat-breakout').textContent).toBe('돌파 0');
    expect(within(bar).getByTestId('stat-vi').textContent).toBe('VI 발동 0');
    expect(within(bar).getByTestId('stat-cards').textContent).toBe('거래 종목 0');
    expect(slot('workbench-window-badge')).toBeNull();
    expect(within(bar).getByTestId('stat-applied').textContent).toBe('반영 —');
    expect(bar.textContent).not.toMatch(/불러오는 중/);
    expect(bar.querySelector('[aria-busy="true"]')).toBeNull();
    expect(bar.querySelector('[data-slot="skeleton"]')).toBeNull();
    expect(bar.textContent).toContain('임계 20% · 재무장 −2%p');
  });

  it('반영 시각은 받은 문자열을 그대로 mono 로 쓴다', () => {
    render(<WorkbenchStatusBar {...props({ appliedAt: '09:41:52' })} />);
    const applied = screen.getByTestId('stat-applied');
    expect(applied.textContent).toBe('반영 09:41:52');
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

describe('WorkbenchStatusBar — 카운터 필', () => {
  it('신규 0 · 미확인 0 이면 그 필이 접근성 트리에도 없다', () => {
    render(
      <WorkbenchStatusBar
        {...props({ breakoutCount: 5, breakoutNewCount: 0, viCount: 3, viUnconfirmedCount: 0 })}
      />,
    );
    expect(screen.queryByText(/신규/)).toBeNull();
    expect(screen.queryByText(/미확인/)).toBeNull();
    expect(screen.getByTestId('stat-breakout').textContent).toBe('돌파 5');
    expect(screen.getByTestId('stat-vi').textContent).toBe('VI 발동 3');
  });

  it('신규 M · 미확인 M 이 있으면 원문 필로 선다', () => {
    render(
      <WorkbenchStatusBar
        {...props({
          breakoutCount: 8,
          breakoutNewCount: 1,
          viCount: 6,
          viUnconfirmedCount: 2,
          cardCount: 4,
        })}
      />,
    );
    expect(screen.getByText('신규 1')).toBeTruthy();
    expect(screen.getByText('미확인 2')).toBeTruthy();
    expect(screen.getByTestId('stat-cards').textContent).toBe('거래 종목 4');
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

describe('WorkbenchStatusBar — 이 기기 전용 알림 2종 (D-17 · Q-1)', () => {
  it('알림음 토글은 기본 꺼짐이다', () => {
    render(<WorkbenchStatusBar {...props()} />);
    const tone = screen.getByRole('button', { name: '돌파 알림음 켜기 (이 기기만)' });
    expect(tone.getAttribute('aria-pressed')).toBe('false');
  });

  it('켜면 저장되고 resumeToneContext 가 그 클릭 안에서 불린다', () => {
    render(<WorkbenchStatusBar {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: '돌파 알림음 켜기 (이 기기만)' }));
    expect(resumeToneContext).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(BREAKOUT_TONE_KEY)).toBe('on');
  });

  it('차단 상태면 라벨이 「클릭해 활성화」 이고, 클릭은 끄지 않고 resume 만 부른다', () => {
    window.localStorage.setItem(BREAKOUT_TONE_KEY, 'on');
    toneState.blocked = true;
    render(<WorkbenchStatusBar {...props()} />);
    const tone = screen.getByRole('button', { name: /클릭해 활성화/ });
    expect(tone.textContent).toContain('클릭해 활성화');
    vi.mocked(resumeToneContext).mockClear();
    fireEvent.click(tone);
    expect(resumeToneContext).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(BREAKOUT_TONE_KEY)).toBe('on');
  });

  it('VI 마감알림 토글이 알림음 토글 옆에 있고, 켜면 권한을 요청해 저장한다', async () => {
    const onViAlertChange = vi.fn();
    render(<WorkbenchStatusBar {...props({ onViAlertChange })} />);
    const alerts = slot('workbench-alerts') as HTMLElement;
    const vi1 = within(alerts).getByRole('button', { name: /VI 마감 알림/ });
    within(alerts).getByRole('button', { name: /돌파 알림음/ });
    expect(vi1.getAttribute('aria-pressed')).toBe('false');
    await act(async () => {
      fireEvent.click(vi1);
    });
    expect(requestViAlertPermission).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(VI_ALERT_STORAGE_KEY)).toBe('on');
    expect(onViAlertChange).toHaveBeenCalledWith(true);
  });

  it('권한이 거부되면 꺼진 채로 사유를 인라인 role="status" 로 말한다', async () => {
    vi.mocked(requestViAlertPermission).mockResolvedValueOnce({
      ok: false,
      reason: '브라우저에서 알림이 차단돼 있어요 · 주소창 자물쇠에서 허용해 주세요',
    });
    render(<WorkbenchStatusBar {...props()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /VI 마감 알림/ }));
    });
    expect(screen.getByRole('status').textContent).toContain('브라우저에서 알림이 차단돼 있어요');
    expect(window.localStorage.getItem(VI_ALERT_STORAGE_KEY)).toBe('off');
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
