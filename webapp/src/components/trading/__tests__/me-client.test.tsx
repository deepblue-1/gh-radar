import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RelayAccountState } from '@gh-radar/shared';

import type { StrategyLogEntry } from '@/components/trading/strategy-log';
import { EMPTY_RELAY_VALUE, type RelayContextValue } from '@/lib/relay-provider';

import { formatServerTime, latestAccountTime, MeClient } from '../me-client';

/*
  Phase 21 Plan 32 Task 3 — /me 전 종목 전략 로그 (D-25a · 스케치 008 ① B) 렌더 테스트용 스텁.
  경계는 훅 셋(relay 컨텍스트 · DMA 게이트 판정 · 로그 공급자)이고, /me 의 다른 카드(계정 · 계좌 ·
  오늘 주문)는 이 테스트의 관심이 아니라 빈 컴포넌트로 둔다. 전략 현황 카드는 **실물**이다.
*/
let mockRelay: RelayContextValue;
let mockGate: 'unauthenticated' | 'unmapped' | null;
let mockFeed: readonly StrategyLogEntry[];

vi.mock('next/navigation', () => ({
  usePathname: () => '/me',
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return { ...actual, useRelayContext: () => mockRelay };
});
vi.mock('@/components/trading/dma-gate', () => ({
  useDmaGateReason: () => mockGate,
  DmaGate: () => <div data-slot="dma-gate" />,
}));
vi.mock('@/lib/strategy-log-feed', () => ({ useStrategyLogFeed: () => mockFeed }));
vi.mock('@/lib/native/use-native-refresh', () => ({ useNativeRefresh: () => {} }));
vi.mock('@/components/me/account-card', () => ({ AccountCard: () => null }));
vi.mock('@/components/trading/today-orders-card', () => ({ TodayOrdersCard: () => null }));
vi.mock('@/components/orderbook/account-panel', () => ({ AccountPanel: () => null }));

/**
 * Phase 16 Plan 32 Task 2 — 「가장 최근 반영 시각」 (MYPAGE-01 · GC-IN-03).
 *
 * 여기서 잠그는 것은 **어느 값을 고르는가**다. 표시 형식(`HH:MM:SS`)도 「값이 없으면
 * 칸을 비운다」는 계약도 바뀌지 않는다 — 바뀐 것은 비교 축이 `formatServerTime` **뒤**가
 * 아니라 **앞**(원문)이라는 사실 하나다.
 *
 * ★ 날짜를 버린 뒤 비교하면 두 자리에서 최댓값이 뒤집힌다:
 *   ① 자정 경계 — `"23:59:00" > "00:01:00"` 이라 어제 값이 이긴다
 *   ② 혼합 포맷 — 날짜를 **아는** 값이 모르는 값과 같은 축에서 겨루게 된다
 */

/** 최소 필드만 채운 `acct` 스냅샷. 이 테스트가 보는 것은 `st` 뿐이다. */
function acct(accountNo: string, st: string): RelayAccountState {
  return { t: 'acct', a: accountNo, snap: true, hold: [], unf: [], rm: [], st };
}

function states(...entries: readonly RelayAccountState[]): ReadonlyMap<string, RelayAccountState> {
  return new Map(entries.map((e) => [e.a, e]));
}

describe('formatServerTime — 표시 정규화 (변경 없음)', () => {
  it('두 포맷을 `HH:MM:SS` 로 읽고, 모르는 모양은 지어내지 않는다', () => {
    expect(formatServerTime('20260909090000')).toBe('09:00:00');
    expect(formatServerTime('13:44:02')).toBe('13:44:02');
    expect(formatServerTime('134402')).toBe('13:44:02');
    expect(formatServerTime('12345')).toBeNull();
    expect(formatServerTime('')).toBeNull();
    expect(formatServerTime(undefined)).toBeNull();
  });
});

describe('latestAccountTime — 비교는 정규화 **전** 값으로 (GC-IN-03)', () => {
  it('모두 `HH:MM:SS` 면 가장 늦은 시각을 고른다 (기존 동작 회귀)', () => {
    expect(
      latestAccountTime(
        states(acct('A', '09:12:00'), acct('B', '13:44:02'), acct('C', '11:05:59')),
      ),
    ).toBe('13:44:02');
  });

  it('계좌가 하나면 결과가 그 계좌의 표시값과 완전히 같다 (16-23 보장 유지)', () => {
    expect(latestAccountTime(states(acct('A', '20260909134402')))).toBe('13:44:02');
    expect(latestAccountTime(states(acct('A', '13:44:02')))).toBe('13:44:02');
  });

  it('★ 혼합 포맷 — 날짜가 있는 오늘 09:00 이 날짜 없는 23:59 를 이긴다', () => {
    /*
      게이트웨이는 `YYYYMMDDHHMMSS`, 스텁은 `HH:MM:SS` 를 준다. 정규화 뒤에 비교하면
      `"23:59:00" > "09:00:00"` 이라 **날짜를 아는 값이 진다** — 그 23:59 가 어제 프레임인지
      이 화면은 알 수 없는데도 「가장 최근」 자리를 가져간다.
    */
    expect(
      latestAccountTime(states(acct('A', '20260909090000'), acct('B', '23:59:00'))),
    ).toBe('09:00:00');
    // 맵 순서를 뒤집어도 같다 — 승부가 순회 순서에 기대지 않는다.
    expect(
      latestAccountTime(states(acct('B', '23:59:00'), acct('A', '20260909090000'))),
    ).toBe('09:00:00');
  });

  it('★ 자정 경계 — 전일 23:59 과 당일 00:01 중 00:01 이 뽑힌다', () => {
    expect(
      latestAccountTime(states(acct('A', '20260908235900'), acct('B', '20260909000100'))),
    ).toBe('00:01:00');
    expect(
      latestAccountTime(states(acct('B', '20260909000100'), acct('A', '20260908235900'))),
    ).toBe('00:01:00');
  });

  it('빈 맵이면 `null` 이다 — 없는 시각을 그리느니 칸을 비운다', () => {
    expect(latestAccountTime(new Map())).toBeNull();
  });

  it('읽을 수 없는 `st` 는 건너뛰고, 전부 그렇다면 `null` 이다', () => {
    expect(latestAccountTime(states(acct('A', ''), acct('B', '13:44:02')))).toBe('13:44:02');
    expect(latestAccountTime(states(acct('A', ''), acct('B', '12345')))).toBeNull();
  });
});

describe('MeClient — 전 종목 전략 로그 (D-25a · G-21-R3-2 · 스케치 008 ① B)', () => {
  beforeEach(() => {
    mockRelay = { ...EMPTY_RELAY_VALUE, status: 'ready' } as RelayContextValue;
    mockGate = null;
    mockFeed = [];
  });

  const logPane = () => document.querySelector('[data-slot="me-strategy-log"]');

  it('기본은 「현황」 — 「로그」를 누르면 전략 현황 카드 안에서 종목명(who)과 문장이 보인다', async () => {
    mockFeed = [
      { id: 'feed-log-2', at: '10:42:18', who: '에코프로 · NXT', text: '매수 무장' },
      { id: 'feed-log-1', at: '10:38:47', who: 'HLB', text: '[상따] 서버가 거부했어요 — 주문가능금액 부족', level: 'error' },
    ];
    render(<MeClient />);
    const card = document.querySelector('[data-slot="strategy-status-card"]') as HTMLElement;
    expect(within(card).getByRole('tab', { name: '현황' })).toHaveAttribute('aria-selected', 'true');
    expect(logPane()).toBeNull();

    await userEvent.click(within(card).getByRole('tab', { name: '로그' }));
    const pane = logPane() as HTMLElement;
    expect(card.contains(pane)).toBe(true);
    const rows = within(pane).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('10:42:18에코프로 · NXT매수 무장');
    expect(rows[1]).toHaveTextContent('HLB');
    expect(rows[1]).toHaveAttribute('data-level', 'error');
  });

  it('로그가 없으면 「아직 기록이 없어요」', async () => {
    render(<MeClient />);
    await userEvent.click(screen.getByRole('tab', { name: '로그' }));
    expect(logPane()).toHaveTextContent('아직 기록이 없어요');
  });

  it('DMA 게이트(미매핑) 분기에는 전략 로그도 세그먼트도 없다', () => {
    mockGate = 'unmapped';
    mockFeed = [{ id: 'feed-log-1', at: '10:00:00', who: 'HLB', text: '매수 무장' }];
    render(<MeClient />);
    expect(document.querySelector('[data-slot="dma-gate"]')).not.toBeNull();
    expect(logPane()).toBeNull();
    expect(screen.queryByRole('tab', { name: '로그' })).toBeNull();
  });
});
