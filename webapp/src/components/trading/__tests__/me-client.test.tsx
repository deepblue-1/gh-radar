import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RelayAccountState, RelayUserSettingsMsg } from '@gh-radar/shared';

import type { StrategyLogEntry } from '@/components/trading/strategy-log';
import { EMPTY_RELAY_VALUE, type RelayContextValue } from '@/lib/relay-provider';
import { makeLimitChaser } from '@/test-fixtures/limit-chaser';
import { writeMeAccount } from '@/lib/trading-layout';
import { relayQuoteKey } from '@/lib/use-relay-socket';

import { formatServerTime, latestAccountTime, MeClient, unfilledCountOf } from '../me-client';

/*
  Phase 21 Plan 32 Task 3 — /me 전 종목 전략 로그 (D-25a · 스케치 008 ① B) 렌더 테스트용 스텁.
  경계는 훅 셋(relay 컨텍스트 · DMA 게이트 판정 · 로그 공급자)이고, /me 의 다른 카드(계정 · 계좌 ·
  오늘 주문)는 이 테스트의 관심이 아니라 빈 컴포넌트로 둔다. 전략 현황 카드는 **실물**이다.
*/
let mockRelay: RelayContextValue;
let mockGate: 'unauthenticated' | 'unmapped' | null;
let mockFeed: readonly StrategyLogEntry[];
/* quick-261006-pey D-1 — `?tab=` 은 공용 훅이 읽는다. 목은 URL 을 따라가지 않으므로 활성값 변화는 rerender 로 흉내 낸다. */
let mockSearchParams = new URLSearchParams();
/* 인증 목 — 기본은 Provider 밖과 같다(사용자 없음 · 로딩 아님). WR-06 만 사용자를 둔다. */
let mockAuthUser: { id: string } | null = null;
/* 계좌 패널 목이 렌더마다 받은 계좌(WR-06 — 기억 계좌 전에 첫 계좌로 한 번 그리는지). */
let mockPanelAccounts: string[] = [];
/* 계좌 패널 목이 마지막 렌더에 받은 현재가 함수(36 WR-05 — 작업대와 같은 `holdingQuotePrice` 를 넘기는지). */
let mockPanelPriceOf: ((isin: string) => number | undefined) | undefined;
/* 오늘 주문 목 — 마운트 횟수(조회 1회 = 마운트 1회)와 건수 콜백으로 올릴 값. */
let mockOrdersMounts = 0;
let mockOrdersCount = 0;
/* Phase 36 손익 탭 — fetchMyPnl 목(받은 인자 기록 · 빈 보고서). */
const mockFetchMyPnl = vi.fn((_account: string, _range: string) =>
  Promise.resolve({ from: '2026-09-28', to: '2026-10-27', groups: [] }),
);

vi.mock('next/navigation', () => ({
  usePathname: () => '/me',
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));
vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return { ...actual, useRelayContext: () => mockRelay };
});
vi.mock('@/lib/auth-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth-context')>();
  return {
    ...actual,
    useAuth: () => ({ user: mockAuthUser, displayName: null, isLoading: false, signOut: async () => {} }),
  };
});
vi.mock('@/components/trading/dma-gate', () => ({
  useDmaGateReason: () => mockGate,
  DmaGate: () => <div data-slot="dma-gate" />,
}));
vi.mock('@/lib/strategy-log-feed', () => ({ useStrategyLogFeed: () => mockFeed }));
vi.mock('@/lib/native/use-native-refresh', () => ({ useNativeRefresh: () => {} }));
vi.mock('@/lib/pnl-api', () => ({
  fetchMyPnl: (account: string, range: string) => mockFetchMyPnl(account, range),
  fetchAdminPnl: vi.fn(),
}));
vi.mock('@/components/me/account-card', () => ({ AccountCard: () => null }));
vi.mock('@/components/trading/today-orders-card', async () => {
  const { useEffect } = await import('react');
  return {
    TodayOrdersCard: ({ onCountChange }: { onCountChange?: (count: number) => void }) => {
      useEffect(() => {
        mockOrdersMounts += 1;
        onCountChange?.(mockOrdersCount);
        // 마운트 1회만 — 실물도 조회는 마운트 시 1회다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return <div data-slot="today-orders-card" />;
    },
  };
});
/* 계좌 패널 목 — 무엇을 받았는지(계좌 · 머리 생략 · 상태 유무)만 남긴다(Phase 32 D-22). */
vi.mock('@/components/orderbook/account-panel', () => ({
  AccountPanel: (p: {
    selectedAccountNo: string;
    hideAccountHeader?: boolean;
    account: unknown;
    priceOf?: (isin: string) => number | undefined;
  }) => {
    mockPanelAccounts.push(p.selectedAccountNo);
    mockPanelPriceOf = p.priceOf;
    return (
      <div
        data-slot="account-panel-mock"
        data-account={p.selectedAccountNo}
        data-hide-header={String(p.hideAccountHeader === true)}
        data-has-account={String(p.account !== null)}
      />
    );
  },
}));

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

beforeEach(() => {
  mockSearchParams = new URLSearchParams();
  mockAuthUser = null;
  mockPanelAccounts = [];
  mockPanelPriceOf = undefined;
  mockOrdersMounts = 0;
  mockOrdersCount = 0;
  mockFetchMyPnl.mockClear();
  window.history.replaceState(null, '', '/me');
});

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

describe('MeStatusBar — 「상따 N건」은 켜진 전략 수 (quick-260928-no0 · isActiveStrategy)', () => {
  beforeEach(() => {
    mockGate = null;
    mockFeed = [];
  });

  it('꺼진 전략 1건 + 켜진 전략 1건이면 상태줄은 「상따 1건」이다 (카드 「상따 1」과 같은 기준)', () => {
    const on = makeLimitChaser();
    const off = makeLimitChaser({
      isin: 'KR7005930003',
      key: 'KR7005930003:37728502101:KRX',
      buyEnabled: false,
      sellEnabled: false,
      cancelQtyEnabled: false,
    });
    mockRelay = { ...EMPTY_RELAY_VALUE, status: 'ready', limitChasers: [on, off] } as RelayContextValue;
    render(<MeClient />);

    const bar = document.querySelector('[data-slot="me-status-bar"]') as HTMLElement;
    expect(bar).toHaveTextContent('상따 1건');
    expect(bar).not.toHaveTextContent('상따 2건');
  });
});

describe('MeStatusBar — 시세 필 (D-01 · D-04)', () => {
  /** 눈에 보이는 글자 — `sr-only` 조각을 뺀 textContent. */
  function visibleText(el: Element): string {
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll('.sr-only').forEach((n) => n.remove());
    return clone.textContent ?? '';
  }
  const bar = () => document.querySelector('[data-slot="me-status-bar"]') as HTMLElement;
  const quote = () => document.querySelector('[data-slot="me-quote"]') as HTMLElement | null;
  const order = () => document.querySelector('[data-slot="me-dma"]') as HTMLElement;

  beforeEach(() => {
    mockGate = null;
    mockFeed = [];
  });

  it('quoteState 가 null(모름)이면 시세 필이 없고 주문 필만 선다', () => {
    mockRelay = { ...EMPTY_RELAY_VALUE, status: 'ready', statusLabel: '실시간' } as RelayContextValue;
    render(<MeClient />);
    expect(quote()).toBeNull();
    expect(order()).not.toBeNull();
    expect(visibleText(order())).toBe('주문');
    expect(order().querySelector('[aria-hidden="true"]')?.className).toContain('bg-[var(--led-armed)]');
  });

  it('live → 「● 시세」 · 주문 필 앞 · 점 --led-armed', () => {
    mockRelay = {
      ...EMPTY_RELAY_VALUE,
      status: 'ready',
      statusLabel: '실시간',
      quoteState: { t: 'quote.state', s: 'live' },
    } as RelayContextValue;
    render(<MeClient />);
    const q = quote() as HTMLElement;
    expect(q).toHaveAttribute('data-tone', 'ok');
    expect(visibleText(q)).toBe('시세');
    expect(q.querySelector('[aria-hidden="true"]')?.className).toContain('bg-[var(--led-armed)]');
    expect(q.compareDocumentPosition(order()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('down → 「● 시세 09:41:52~ 멈춤」 적색 · 주문 필은 ready 그대로 · 상따/VI 칸 유지', () => {
    mockRelay = {
      ...EMPTY_RELAY_VALUE,
      status: 'ready',
      statusLabel: '실시간',
      quoteState: { t: 'quote.state', s: 'down', since: '2026-09-30T00:41:52.000Z' },
    } as RelayContextValue;
    render(<MeClient />);
    const q = quote() as HTMLElement;
    expect(q).toHaveAttribute('data-tone', 'down');
    expect(visibleText(q)).toBe('시세 09:41:52~ 멈춤');
    expect(q.querySelector('[aria-hidden="true"]')?.className).toContain('bg-[var(--destructive)]');
    expect(visibleText(order())).toBe('주문');
    expect(bar()).toHaveAttribute('data-status', 'ready');
    expect(bar()).toHaveTextContent('상따 0건');
    expect(bar()).toHaveTextContent('VI 중지');
    // Phase 32 D-21 — 「계좌 N개」 칸은 없다(계좌는 탭 위 칩이 말한다).
    expect(bar()).not.toHaveTextContent('계좌');
  });

  it('첫 페인트(idle) 주문 필은 「주문 서버 연결 중…」 — 연결 문구 상수는 이제 중립이다', () => {
    mockRelay = { ...EMPTY_RELAY_VALUE } as RelayContextValue;
    render(<MeClient />);
    expect(order()).not.toBeNull();
    expect(visibleText(order())).toBe('주문 서버 연결 중…');
    expect(bar()).not.toHaveTextContent('시세 서버 연결 중');
  });
});

describe('P32 MeStatusBar 고른 계좌 (D-21) · 계좌 칩 (D-20)', () => {
  const ACC_A = '37728502101';
  const ACC_B = '37728502102';
  const bar = () => document.querySelector('[data-slot="me-status-bar"]') as HTMLElement;
  const chip = (no: string) =>
    document.querySelector(`[data-slot="me-account-chip"][data-account-no="${no}"]`) as HTMLElement | null;
  const chaser = (isin: string, accountNo: string) =>
    makeLimitChaser({ isin, accountNo, key: `${isin}:${accountNo}:KRX` });

  beforeEach(() => {
    mockGate = null;
    mockFeed = [];
    mockRelay = {
      ...EMPTY_RELAY_VALUE,
      status: 'ready',
      accounts: [
        { accountNo: ACC_A, name: '위탁종합' },
        { accountNo: ACC_B, name: '위탁CMA' },
      ],
      limitChasers: [
        chaser('KR7005930003', ACC_A),
        chaser('KR7000660001', ACC_A),
        chaser('KR7035720002', ACC_B),
      ],
      viSlots: new Map([
        [`${ACC_A}|KRX`, { accountNo: ACC_A, exchange: 'KRX', orderAmountKrw: 10_000_000, checkRate: 22, priceType: 'U', run: true }],
      ]),
    } as RelayContextValue;
  });

  it('기본 첫 칩(A) — 상태줄 「상따 2건」 · 「VI 가동」 · 계좌 칸 없음 → B 칩 → 「상따 1건」 · 「VI 중지」(VI 는 A 등록)', async () => {
    render(<MeClient />);
    expect(chip(ACC_A)).toHaveAttribute('aria-checked', 'true');
    expect(bar()).toHaveTextContent('상따 2건');
    expect(bar()).toHaveTextContent('VI 가동');
    expect(bar()).not.toHaveTextContent('계좌');

    await userEvent.click(chip(ACC_B) as HTMLElement);
    expect(chip(ACC_B)).toHaveAttribute('aria-checked', 'true');
    expect(bar()).toHaveTextContent('상따 1건');
    expect(bar()).toHaveTextContent('VI 중지');
    // 현황 카드도 같은 계좌를 따른다.
    expect(document.querySelectorAll('[data-slot="strategy-row"]')).toHaveLength(1);
  });

  describe('P32 VI 슬롯 표면 (D-18)', () => {
    const viRow = () => document.querySelector('[data-slot="vi-status-row"]') as HTMLElement;
    const viSummary = () => viRow().querySelector('[data-slot="vi-status-summary"]');

    it('A 칩(KRX 가동) — VI 행 「가동」 · 요약 「KRX 1,000만원 · 22.0% 이상」 → B 칩(슬롯 미등록) — VI 행 「중지」 · 「—」 · 상태줄 「VI 중지」', async () => {
      mockRelay = {
        ...mockRelay,
        viSlots: new Map([...mockRelay.viSlots, [`${ACC_B}|KRX`, null]]),
      } as RelayContextValue;
      render(<MeClient />);
      expect(within(viRow()).getByText('가동')).toBeInTheDocument();
      expect(viSummary()).toHaveTextContent(/^KRX 1,000만원 · 22\.0% 이상$/);
      expect(bar()).toHaveTextContent('VI 가동');

      await userEvent.click(chip(ACC_B) as HTMLElement);
      expect(within(viRow()).getByText('중지')).toBeInTheDocument();
      expect(viSummary()).toHaveTextContent(/^—$/);
      expect(bar()).toHaveTextContent('VI 중지');
    });

    it('B 칩 — B 의 NXT 슬롯이 가동이면 상태줄 · VI 행이 B 기준 「가동」 · 요약은 B 의 NXT 값만', async () => {
      mockRelay = {
        ...mockRelay,
        viSlots: new Map([
          ...mockRelay.viSlots,
          [`${ACC_B}|NXT`, { accountNo: ACC_B, exchange: 'NXT', orderAmountKrw: 5_000_000, checkRate: 18, priceType: 'U', run: true }],
        ]),
      } as RelayContextValue;
      render(<MeClient />);
      await userEvent.click(chip(ACC_B) as HTMLElement);
      expect(bar()).toHaveTextContent('VI 가동');
      expect(viSummary()).toHaveTextContent(/^NXT 500만원 · 18\.0% 이상$/);
    });
  });

  it('WR-06 기억 계좌(B)가 있으면 첫 계좌(A)로 한 렌더도 서지 않는다 — 잔고 패널이 받은 계좌는 B 뿐', () => {
    mockAuthUser = { id: 'u1' };
    window.localStorage.clear();
    writeMeAccount('u1', ACC_B);
    mockSearchParams = new URLSearchParams('tab=accounts');
    render(<MeClient />);
    expect(chip(ACC_B)).toHaveAttribute('aria-checked', 'true');
    expect(mockPanelAccounts.length).toBeGreaterThan(0);
    expect(mockPanelAccounts.every((a) => a === ACC_B)).toBe(true);
    window.localStorage.clear();
  });

  it('accounts[] 미수신이면 칩 줄 없음 · 상태줄 · 카드는 전 계좌(종전)', () => {
    mockRelay = { ...mockRelay, accounts: [] } as RelayContextValue;
    render(<MeClient />);
    expect(document.querySelector('[data-slot="me-account-chips"]')).toBeNull();
    expect(bar()).toHaveTextContent('상따 3건');
    expect(bar()).toHaveTextContent('VI 가동');
    expect(document.querySelectorAll('[data-slot="strategy-row"]')).toHaveLength(3);
  });
});

describe('261006-pey /me 4탭 (D-1)', () => {
  beforeEach(() => {
    mockRelay = { ...EMPTY_RELAY_VALUE, status: 'ready' } as RelayContextValue;
    mockGate = null;
    mockFeed = [];
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const slot = (name: string) => document.querySelector(`[data-slot="${name}"]`);
  const slots = (name: string) => document.querySelectorAll(`[data-slot="${name}"]`);
  const meTabList = () => screen.getByRole('tablist', { name: 'My page 탭' });
  const meTab = (label: string) => within(meTabList()).getByRole('tab', { name: new RegExp(`^${label}`) });
  const countOf = (label: string) => meTab(label).querySelector('[data-slot="me-tab-count"]');

  function unfAcct(accountNo: string, n: number): RelayAccountState {
    return {
      t: 'acct',
      a: accountNo,
      snap: true,
      hold: [],
      unf: Array.from({ length: n }, () => ({})) as RelayAccountState['unf'],
      rm: [],
      st: '',
    };
  }

  it('B1 — 기본 렌더: 탭 순서 현황·잔고·주문·설정·손익 · 현황 선택 · 미방문 패널 비마운트 · 오늘 주문 마운트 0 · 손익 조회 0', () => {
    render(<MeClient />);
    const names = within(meTabList()).getAllByRole('tab').map((t) => t.textContent);
    expect(names).toEqual(['현황', '잔고', '주문', '설정', '손익']);
    expect(mockFetchMyPnl).not.toHaveBeenCalled();
    expect(slot('me-pnl')).toBeNull();
    expect(meTab('현황')).toHaveAttribute('aria-selected', 'true');

    const statusPanel = screen.getByTestId('me-tab-panel-status');
    expect(statusPanel.querySelector('[data-slot="me-status-bar"]')).not.toBeNull();
    expect(statusPanel.querySelector('[data-slot="strategy-status-card"]')).not.toBeNull();

    expect(slot('me-account-card')).toBeNull();
    expect(slot('me-accounts-loading')).toBeNull();
    expect(slot('today-orders-card')).toBeNull();
    expect(slot('me-lc-defaults')).toBeNull();
    expect(mockOrdersMounts).toBe(0);
  });

  it('B2 — `?tab=settings` 딥링크 = 설정 · 화이트리스트 밖(`?tab=zzz`) = 현황', () => {
    mockSearchParams = new URLSearchParams('tab=settings');
    const view = render(<MeClient />);
    expect(meTab('설정')).toHaveAttribute('aria-selected', 'true');
    expect(slot('me-lc-defaults')).not.toBeNull();
    expect(slot('me-status-bar')).toBeNull();
    view.unmount();

    mockSearchParams = new URLSearchParams('tab=zzz');
    render(<MeClient />);
    expect(meTab('현황')).toHaveAttribute('aria-selected', 'true');
    expect(slot('me-status-bar')).not.toBeNull();
  });

  it('B3 — 잔고 탭 클릭 = pushState 정확히 1회(?tab=accounts) · 같은 탭 재클릭은 추가 0회', async () => {
    const pushSpy = vi.spyOn(window.history, 'pushState');
    const user = userEvent.setup();
    render(<MeClient />);

    await user.click(meTab('잔고'));
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy).toHaveBeenCalledWith(null, '', '?tab=accounts');
    expect(window.location.pathname).toBe('/me');

    await user.click(meTab('잔고'));
    expect(pushSpy).toHaveBeenCalledTimes(1);
  });

  it('B4 — 잔고 탭: 고른 계좌 한 벌(머리 없음) · 라벨 숫자 = 그 계좌 미체결 · 칩 B → B / 계좌 0 = 로딩 / 0 이면 숫자 없음 (Phase 32 D-22)', async () => {
    mockSearchParams = new URLSearchParams('tab=accounts');
    mockRelay = {
      ...EMPTY_RELAY_VALUE,
      status: 'ready',
      accounts: [
        { accountNo: '1111111101', name: 'A' },
        { accountNo: '2222222201', name: 'B' },
      ],
      accountStates: new Map([
        ['1111111101', unfAcct('1111111101', 2)],
        ['2222222201', unfAcct('2222222201', 1)],
      ]),
    } as unknown as RelayContextValue;
    const view = render(<MeClient />);
    // 기본 첫 칩(A) — 카드 한 벌 · 세로 반복 없음 · 머리 생략.
    const cardsOf = () => Array.from(slots('me-account-card')).map((c) => c.getAttribute('data-account-no'));
    expect(cardsOf()).toEqual(['1111111101']);
    const panel = () => slot('account-panel-mock');
    expect(panel()).toHaveAttribute('data-account', '1111111101');
    expect(panel()).toHaveAttribute('data-hide-header', 'true');
    expect(countOf('잔고')).toHaveTextContent('2');

    // 칩 B → 카드 · 숫자가 B 로.
    const chipB = document.querySelector('[data-slot="me-account-chip"][data-account-no="2222222201"]');
    await userEvent.click(chipB as HTMLElement);
    expect(cardsOf()).toEqual(['2222222201']);
    expect(panel()).toHaveAttribute('data-account', '2222222201');
    expect(countOf('잔고')).toHaveTextContent('1');
    view.unmount();

    mockRelay = { ...EMPTY_RELAY_VALUE, status: 'ready' } as RelayContextValue;
    const empty = render(<MeClient />);
    expect(slot('me-accounts-loading')).toHaveTextContent('계좌 정보를 불러오는 중이에요…');
    expect(slot('me-account-card')).toBeNull();
    expect(countOf('잔고')).toBeNull();
    empty.unmount();

    mockRelay = {
      ...EMPTY_RELAY_VALUE,
      status: 'ready',
      accounts: [{ accountNo: '1111111101', name: 'A' }],
      accountStates: new Map([['1111111101', unfAcct('1111111101', 0)]]),
    } as unknown as RelayContextValue;
    render(<MeClient />);
    expect(countOf('잔고')).toBeNull();

    // 순수 합(고른 계좌가 아직 없을 때의 값) — 목록 밖 계좌의 상태는 세지 않는다.
    expect(
      unfilledCountOf(
        [{ accountNo: 'A' }],
        new Map([
          ['A', unfAcct('A', 2)],
          ['Z', unfAcct('Z', 5)],
        ]),
      ),
    ).toBe(2);
    expect(unfilledCountOf([{ accountNo: 'A' }, { accountNo: 'B' }], new Map([['A', unfAcct('A', 1)]]))).toBe(1);
  });

  it('B4b — 고른 계좌가 accountStates 에 없으면(목록 밖 · 전략에만 있는 계좌) 카드 한 벌 · 상태 null · 숫자 없음 (D-22)', async () => {
    mockSearchParams = new URLSearchParams('tab=accounts');
    mockRelay = {
      ...EMPTY_RELAY_VALUE,
      status: 'ready',
      accounts: [{ accountNo: '1111111101', name: 'A' }],
      accountStates: new Map([['1111111101', unfAcct('1111111101', 2)]]),
      limitChasers: [makeLimitChaser({ isin: 'KR7005930003', accountNo: '9999999901', key: 'KR7005930003:9999999901:KRX' })],
    } as unknown as RelayContextValue;
    render(<MeClient />);
    const chipZ = document.querySelector('[data-slot="me-account-chip"][data-account-no="9999999901"]');
    expect(chipZ).not.toBeNull();
    await userEvent.click(chipZ as HTMLElement);
    expect(Array.from(slots('me-account-card')).map((c) => c.getAttribute('data-account-no'))).toEqual([
      '9999999901',
    ]);
    expect(slot('account-panel-mock')).toHaveAttribute('data-has-account', 'false');
    expect(countOf('잔고')).toBeNull();
  });

  it('B4c (36 WR-05) — 잔고 탭 계좌 패널에 작업대와 같은 현재가 규칙(KRX → NXT)을 넘긴다 — 시장가 매수 미체결 주문가능이 같은 숫자', () => {
    const holdAcct = {
      t: 'acct',
      a: '1111111101',
      snap: true,
      hold: ['KR7005930003', 'KR7000660001', 'KR7035420009'].map((isin) => ({ isin, qty: 1, sellableQty: 1, avgPrice: 1 })),
      unf: [],
      rm: [],
      st: '',
    } as unknown as RelayAccountState;
    const relayWith = (quotes: Map<string, unknown>) =>
      ({
        ...EMPTY_RELAY_VALUE,
        status: 'ready',
        accounts: [{ accountNo: '1111111101', name: 'A' }],
        accountStates: new Map([['1111111101', holdAcct]]),
        quotes,
      }) as unknown as RelayContextValue;
    mockSearchParams = new URLSearchParams('tab=accounts');
    mockRelay = relayWith(new Map());
    const view = render(<MeClient />);
    // 구독 뒤 시세 도착(36 WR-02 R2 — 구독 뒤 새로 온 값만 쓴다)
    mockRelay = relayWith(
      new Map<string, unknown>([
        [relayQuoteKey('KR7005930003', 'KRX'), { p: 70_000 }],
        [relayQuoteKey('KR7005930003', 'NXT'), { p: 70_100 }],
        [relayQuoteKey('KR7000660001', 'NXT'), { p: 200_000 }],
      ]),
    );
    view.rerender(<MeClient />);
    expect(mockPanelPriceOf).toBeTypeOf('function');
    expect(mockPanelPriceOf?.('KR7005930003')).toBe(70_000);
    expect(mockPanelPriceOf?.('KR7000660001')).toBe(200_000);
    expect(mockPanelPriceOf?.('KR7035420009')).toBeUndefined();
  });

  it('B4d (36 WR-02 R2) — 잔고 탭은 보유 · 시장가 매수 미체결 ISIN 을 KRX · NXT price 레벨로 구독하고, 구독 뒤 새로 온 시세만 쓴다(굳은 옛 시세 안 씀)', () => {
    const A = 'KR7005930003'; // 보유
    const B = 'KR7000660001'; // 시장가(price 0) 매수 미체결
    const C = 'KR7035420009'; // 지정가 매수 미체결 — 현재가 불필요
    const D = 'KR7051910008'; // 시장가 매도 미체결 — 주문가능에 안 들어감
    const subscribe = vi.fn();
    const unsubscribe = vi.fn();
    const account: RelayAccountState = {
      t: 'acct',
      a: '1111111101',
      snap: true,
      hold: [{ isin: A, qty: 10, sellableQty: 10, avgPrice: 60_000 }],
      unf: [
        { isin: B, side: 'B', price: 0, unfilledQty: 3 },
        { isin: C, side: 'B', price: 50_000, unfilledQty: 1 },
        { isin: D, side: 'S', price: 0, unfilledQty: 1 },
      ] as unknown as RelayAccountState['unf'],
      rm: [],
      st: '',
    } as unknown as RelayAccountState;
    // 작업대에서 넘어와 구독이 풀린 키의 굳은 시세(이 화면이 구독하기 전부터 맵에 있던 값)
    const frozenAKrx = { p: 65_000 };
    const frozenBKrx = { p: 190_000 };
    const relayWith = (quotes: Map<string, unknown>): RelayContextValue =>
      ({
        ...EMPTY_RELAY_VALUE,
        status: 'ready',
        accounts: [{ accountNo: '1111111101', name: 'A' }],
        accountStates: new Map([['1111111101', account]]),
        quotes,
        subscribe,
        unsubscribe,
      }) as unknown as RelayContextValue;

    mockSearchParams = new URLSearchParams('tab=accounts');
    mockRelay = relayWith(
      new Map<string, unknown>([
        [relayQuoteKey(A, 'KRX'), frozenAKrx],
        [relayQuoteKey(B, 'KRX'), frozenBKrx],
      ]),
    );
    const view = render(<MeClient />);
    const subs = subscribe.mock.calls.map((c) => c.join(' ')).sort();
    expect(subs).toEqual([`${A} KRX price`, `${A} NXT price`, `${B} KRX price`, `${B} NXT price`].sort());
    // 구독 뒤 아무 시세도 안 왔다 — 굳은 값을 현재가로 쓰지 않는다
    expect(mockPanelPriceOf?.(A)).toBeUndefined();
    expect(mockPanelPriceOf?.(B)).toBeUndefined();

    // 구독 뒤 A KRX · B NXT 새 시세 도착(B KRX 는 여전히 굳은 값 그대로 — 건너뛰고 NXT)
    mockRelay = relayWith(
      new Map<string, unknown>([
        [relayQuoteKey(A, 'KRX'), { p: 71_000 }],
        [relayQuoteKey(B, 'KRX'), frozenBKrx],
        [relayQuoteKey(B, 'NXT'), { p: 200_500 }],
      ]),
    );
    view.rerender(<MeClient />);
    expect(mockPanelPriceOf?.(A)).toBe(71_000);
    expect(mockPanelPriceOf?.(B)).toBe(200_500);
    expect(mockPanelPriceOf?.(C)).toBeUndefined();
    expect(subscribe).toHaveBeenCalledTimes(4);
    expect(unsubscribe).not.toHaveBeenCalled();

    // 다른 탭으로 가면 구독을 놓는다(잔고 탭에서만 시세가 필요하다)
    mockSearchParams = new URLSearchParams('tab=status');
    view.rerender(<MeClient />);
    expect(unsubscribe.mock.calls.map((c) => c.join(' ')).sort()).toEqual(subs);
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(4);
  });

  it('B5 — 주문 탭: 미방문 숫자 없음 · 열면 카드 「N건」 수 · 마운트 1회 · 다른 탭으로 가도 숨김으로 유지', () => {
    const first = render(<MeClient />);
    expect(countOf('주문')).toBeNull();
    first.unmount();

    mockOrdersCount = 7;
    mockSearchParams = new URLSearchParams('tab=orders');
    const view = render(<MeClient />);
    expect(countOf('주문')).toHaveTextContent('7');
    expect(mockOrdersMounts).toBe(1);

    mockSearchParams = new URLSearchParams('tab=status');
    view.rerender(<MeClient />);
    expect(meTab('현황')).toHaveAttribute('aria-selected', 'true');
    expect(slot('today-orders-card')).not.toBeNull();
    expect(screen.getByTestId('me-tab-panel-orders')).toHaveAttribute('data-state', 'inactive');
    expect(mockOrdersMounts).toBe(1);
    expect(countOf('주문')).toHaveTextContent('7');
  });

  it('B7 — 손익 탭(Phase 36 D-17 ②): 열면 fetchMyPnl(고른 계좌, "30") 1회 · 묶음 머리 없음 · 칩 B → B 로 재조회 · 「7일」 → range 7 · 배지 없음', async () => {
    mockSearchParams = new URLSearchParams('tab=pnl');
    mockRelay = {
      ...EMPTY_RELAY_VALUE,
      status: 'ready',
      accounts: [
        { accountNo: '1111111101', name: 'A' },
        { accountNo: '2222222201', name: 'B' },
      ],
    } as unknown as RelayContextValue;
    render(<MeClient />);
    expect(meTab('손익')).toHaveAttribute('aria-selected', 'true');
    expect(countOf('손익')).toBeNull();
    expect(mockFetchMyPnl).toHaveBeenCalledTimes(1);
    expect(mockFetchMyPnl).toHaveBeenLastCalledWith('1111111101', '30');
    // 빈 보고서 → 빈 상자 · 기간 컨트롤 줄은 그대로.
    expect(await screen.findByText('이 기간에는 체결이 없어요')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '기간' })).toBeInTheDocument();
    expect(slot('pnl-group-head')).toBeNull();

    const chipB = document.querySelector('[data-slot="me-account-chip"][data-account-no="2222222201"]');
    await userEvent.click(chipB as HTMLElement);
    expect(mockFetchMyPnl).toHaveBeenCalledTimes(2);
    expect(mockFetchMyPnl).toHaveBeenLastCalledWith('2222222201', '30');

    await userEvent.click(within(screen.getByRole('group', { name: '기간' })).getByRole('button', { name: '7일' }));
    expect(mockFetchMyPnl).toHaveBeenCalledTimes(3);
    expect(mockFetchMyPnl).toHaveBeenLastCalledWith('2222222201', '7');
    // 기간은 주소에 싣지 않는다(탭 안 로컬 상태).
    expect(window.location.search).not.toContain('range');
  });

  it('B7b — 손익 탭: 계좌 미정이면 「계좌 정보를 불러오는 중이에요…」 · 조회 0', () => {
    mockSearchParams = new URLSearchParams('tab=pnl');
    render(<MeClient />);
    expect(slot('me-pnl-accounts-loading')).toHaveTextContent('계좌 정보를 불러오는 중이에요…');
    expect(mockFetchMyPnl).not.toHaveBeenCalled();
  });

  it('B6 — DMA 게이트(미매핑) 분기에는 탭도 상따 기본설정도 없다', () => {
    mockGate = 'unmapped';
    render(<MeClient />);
    expect(slot('dma-gate')).not.toBeNull();
    expect(screen.queryByRole('tablist', { name: 'My page 탭' })).toBeNull();
    expect(slot('me-lc-defaults')).toBeNull();
  });
});

describe('P32 칩 줄 잠금 (Pitfall 12 · S13)', () => {
  const ACC_A = '37728502101';
  const ACC_B = '37728502102';
  const LOCK_TITLE = '저장 중에는 계좌를 바꿀 수 없어요';
  const group = () => screen.getByRole('radiogroup', { name: 'My page 계좌' });
  const chip = (no: string) =>
    document.querySelector(`[data-slot="me-account-chip"][data-account-no="${no}"]`) as HTMLElement;
  /** 금액 키가 실린 84(편집 · 저장 가능 모양) — 같은 서버 KB120 두 계좌. */
  const lc84 = (patch: Partial<RelayUserSettingsMsg> = {}): RelayUserSettingsMsg => ({
    t: 'user.settings',
    serverKey: 'KB120',
    present: true,
    preBuyAmount: 4000,
    addBuyAmount: 4000,
    postBuyAmount: 4000,
    postBuyMaxCount: 3,
    postBuyFloorQty: 0,
    postBuyReboundPct: 30,
    sellQtyTrackRatio: 55,
    autoSellPeriodSec: 3,
    auctionSellRatioPct: 20,
    autoSellRatioDefaultPct: 10,
    autoSellMethodDefault: 3,
    postBuyFloorAmount: 0,
    preBuyWatchAmount: 0,
    preBuyAutoAddBuy: false,
    ...patch,
  });
  let send: ReturnType<typeof vi.fn>;
  const relayWith = (s84: RelayUserSettingsMsg): RelayContextValue =>
    ({
      ...EMPTY_RELAY_VALUE,
      status: 'ready',
      accounts: [
        { accountNo: ACC_A, name: '위탁종합', serverKey: 'KB120' },
        { accountNo: ACC_B, name: '위탁CMA', serverKey: 'KB120' },
      ],
      limitChasers: [makeLimitChaser({ isin: 'KR7005930003', accountNo: ACC_A, key: `KR7005930003:${ACC_A}:KRX` })],
      userSettingsByServer: new Map([['KB120', s84]]),
      send,
    }) as RelayContextValue;

  beforeEach(() => {
    mockGate = null;
    mockFeed = [];
    send = vi.fn(() => true);
    window.localStorage.clear();
  });

  it('설정 탭 저장 비행 중 → 칩 줄 aria-disabled · title · 다른 칩 클릭 무시 → 84 뒤 해제 · 다시 고를 수 있다', async () => {
    mockSearchParams = new URLSearchParams('tab=settings');
    mockRelay = relayWith(lc84());
    const view = render(<MeClient />);
    expect(chip(ACC_A)).toHaveAttribute('aria-checked', 'true');
    expect(group()).not.toHaveAttribute('aria-disabled');

    // 「줄매수도 같이 켜기」 체크 = 42 1건(편집 모드 무관 경로) → 비행 중.
    await userEvent.click(document.getElementById('me-lc-pre-buy-auto-add-buy') as HTMLElement);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toMatchObject({ t: 'user.settings.set', serverKey: 'KB120' });
    expect(group()).toHaveAttribute('aria-disabled', 'true');
    expect(group()).toHaveAttribute('title', LOCK_TITLE);
    await userEvent.click(chip(ACC_B));
    expect(chip(ACC_A)).toHaveAttribute('aria-checked', 'true');

    // 그 값 84 → 비행 끝 → 잠금 해제.
    mockRelay = relayWith(lc84({ preBuyAutoAddBuy: true }));
    view.rerender(<MeClient />);
    expect(group()).not.toHaveAttribute('aria-disabled');
    expect(group()).not.toHaveAttribute('title');
    await userEvent.click(chip(ACC_B));
    expect(chip(ACC_B)).toHaveAttribute('aria-checked', 'true');
  });

  it('WR-04 계좌 칩으로 서버가 바뀌면(KB120 → KYOBO119) 값이 다른 행이 「저장 성공」 플래시를 내지 않는다', async () => {
    mockSearchParams = new URLSearchParams('tab=settings');
    mockRelay = {
      ...relayWith(lc84()),
      accounts: [
        { accountNo: ACC_A, name: '위탁종합', serverKey: 'KB120' },
        { accountNo: ACC_B, name: '교보위탁', serverKey: 'KYOBO119' },
      ],
      userSettingsByServer: new Map([
        ['KB120', lc84()],
        ['KYOBO119', lc84({ serverKey: 'KYOBO119', preBuyAmount: 9000, postBuyMaxCount: 5 })],
      ]),
    } as RelayContextValue;
    render(<MeClient />);
    expect(chip(ACC_A)).toHaveAttribute('aria-checked', 'true');
    expect(document.querySelectorAll('[data-flash="ok"]')).toHaveLength(0);

    await userEvent.click(chip(ACC_B));
    expect(chip(ACC_B)).toHaveAttribute('aria-checked', 'true');
    // 서버를 바꿨을 뿐 저장한 것이 없다 — 플래시 0.
    expect(document.querySelectorAll('[data-flash="ok"]')).toHaveLength(0);
  });

  it('「이 계좌 끄기」 대기 중에는 칩 줄을 잠그지 않는다(끄기는 계좌 인자를 싣는다 · S5′)', async () => {
    mockRelay = relayWith(lc84());
    render(<MeClient />);
    await userEvent.click(screen.getByRole('button', { name: `이 계좌 끄기 — ${ACC_A}` }));
    const dialog = screen.getByTestId('strategy-disable-account-dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '이 계좌 끄기' }));
    expect(send).toHaveBeenCalledWith({ t: 'strategies.disable.account', accountNo: ACC_A });
    expect(document.querySelector('[data-slot="strategy-disable-account"]')).toHaveAttribute('data-pending', 'true');
    expect(group()).not.toHaveAttribute('aria-disabled');
    await userEvent.click(chip(ACC_B));
    expect(chip(ACC_B)).toHaveAttribute('aria-checked', 'true');
  });
});
