import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  RelayAccountState,
  RelayHolding,
  RelayOrderResultMsg,
  RelayUnfilled,
} from '@gh-radar/shared';

/**
 * quick-260923-onn — 펼친 카드 본문 상단 「정보 | 미체결 N | 잔고 | 로그 N」 탭 (목업 ②A).
 *
 * 잠그는 것:
 *   - 탭 4개 · 배지는 미체결·로그만(0 이면 생략) · 기본 정보 = 기존 10칸
 *   - 미체결 탭 = AccountPanel stock 스코프(5열) · 행 선택은 공용 패널과 같은 토글 헬퍼
 *   - 잔고 탭 = 1행 6열(`priceOf`) · 로그 탭 = StrategyLog embed · 빈 문구 3종 원문
 *   - 탭 state 는 컴포넌트 안 · 뷰포트 브레이크포인트 · `@container` 재선언 없음(D-28)
 *
 * ★ 스텁 경계 — shared-panels.test 와 같다(AccountPanel 이 `useRelayContext().sendOrder` 를 읽는다).
 */

const sendOrderMock = vi.fn();
vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return {
    ...actual,
    useRelayContext: () => ({ ...actual.EMPTY_RELAY_VALUE, sendOrder: sendOrderMock }),
  };
});

import { CardTabs, type CardTabsProps } from '../card/card-tabs';
import { readPanelsPref, TRADING_PANELS_KEY, writePanelsPref } from '@/lib/trading-layout';
import type { StrategyLogEntry } from '../strategy-log';
import type { StrategyEventRow } from '@gh-radar/shared';
import type { OrderLogFeed } from '@/lib/use-order-log-feed';
import {
  FIXTURE_ACCOUNT_NO,
  FIXTURE_STOCK_NAME,
  STRATEGY_BRANCH_ROWS,
  STRATEGY_DAY_BY_NAME,
  STRATEGY_DAY_GOLDEN,
} from '@/test-fixtures/strategy-day';

const ISIN = 'KR7196170005';
const ACCOUNT = '12345678-01';

function unf(over: Partial<RelayUnfilled> = {}): RelayUnfilled {
  return {
    orderNo: '3407000065',
    orgOrderNo: '',
    isin: ISIN,
    side: 'B',
    price: 412_000,
    orderQty: 30,
    filledQty: 0,
    unfilledQty: 30,
    exchange: 'KRX',
    orderTime: '094010',
    queuedStatus: '',
    pendingStatus: '',
    board: '',
    pendingCancelSent: false,
    name: '알테오젠',
    code: '196170',
    ...over,
  };
}

function hold(over: Partial<RelayHolding> = {}): RelayHolding {
  return { isin: ISIN, qty: 60, sellableQty: 60, avgPrice: 400_000, name: '알테오젠', ...over };
}

function acct(over: Partial<RelayAccountState> = {}): RelayAccountState {
  return {
    t: 'acct',
    a: ACCOUNT,
    snap: true,
    rm: [],
    st: '09:41:52',
    hold: [hold()],
    unf: [unf(), unf({ orderNo: '3407000064', side: 'S', price: 420_000 })],
    ...over,
  };
}

const LOG: StrategyLogEntry[] = [
  { id: '3', at: '09:42:00', text: '서버 반영 완료' },
  { id: '2', at: '09:41:00', text: '매수 무장' },
  { id: '1', at: '09:40:00', text: '등록' },
];

function props(over: Partial<CardTabsProps> = {}): CardTabsProps {
  return {
    quote: null,
    accountNo: ACCOUNT,
    account: acct(),
    log: LOG,
    status: 'ready',
    selectedOrderNo: null,
    onSelectUnfilled: vi.fn(),
    priceOf: () => 420_000,
    ...over,
  };
}

const root = () => document.querySelector('[data-slot="card-tabs"]') as HTMLElement;
const tabs = () => within(root()).getAllByRole('tab');
const tabNamed = (label: string) => tabs().find((t) => t.textContent?.startsWith(label)) as HTMLElement;

function result(): RelayOrderResultMsg {
  return {
    t: 'order.result',
    rid: 'rid-1',
    orderNo: '3407000065',
    resultCode: 0,
    message: '정상처리',
    status: 'accepted',
  };
}

beforeEach(() => {
  sendOrderMock.mockReset();
  sendOrderMock.mockResolvedValue(result());
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('CardTabs — 탭 줄', () => {
  it('탭 4개 [정보, 미체결(2), 잔고(1), 전략로그(3)] · 건수는 제목 괄호 · 정보엔 없음 · 기본 정보 = 10칸', () => {
    render(<CardTabs {...props()} />);
    expect(tabs().map((t) => t.textContent)).toEqual(['정보', '미체결(2)', '잔고(1)', '전략로그(3)']);
    expect(root().querySelectorAll('[data-slot="card-tab-count"]')).toHaveLength(3);
    expect(tabNamed('정보').querySelector('[data-slot="card-tab-count"]')).toBeNull();
    expect(tabNamed('정보')).toHaveAttribute('aria-selected', 'true');
    expect(root().querySelector('[data-slot="lc-quote-grid"]')).not.toBeNull();
  });

  it('미체결 0 · 잔고 0 · 전략로그 0 이면 괄호 0개', () => {
    render(<CardTabs {...props({ account: acct({ unf: [], hold: [] }), log: [] })} />);
    expect(root().querySelectorAll('[data-slot="card-tab-count"]')).toHaveLength(0);
    expect(tabs().map((t) => t.textContent)).toEqual(['정보', '미체결', '잔고', '전략로그']);
  });
});

describe('CardTabs — 미체결', () => {
  it('미체결 탭 → 이 슬라이스 2행 · 첫 th 「구분」 · 행 클릭 → onSelectUnfilled(그 행)', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<CardTabs {...props({ onSelectUnfilled: onSelect })} />);
    await user.click(tabNamed('미체결'));
    const rows = root().querySelectorAll('[data-slot="account-embed-unfilled-row"]');
    expect(rows).toHaveLength(2);
    expect(root().querySelector('th')?.textContent).toBe('구분');
    await user.click(rows[1]!.querySelectorAll('td')[1]!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0]).toMatchObject({ orderNo: '3407000064' });
  });

  it('선택된 행을 다시 누르면 onSelectUnfilled(null) · 그 행 aria-pressed="true"', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<CardTabs {...props({ onSelectUnfilled: onSelect, selectedOrderNo: '3407000065' })} />);
    await user.click(tabNamed('미체결'));
    const row = root().querySelectorAll('[data-slot="account-embed-unfilled-row"]')[0]!;
    expect(row.querySelector('[data-slot="account-unfilled-select"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(row.querySelectorAll('td')[1]!);
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('onSelectUnfilled 가 없으면 선택 UI 가 없다 — 취소 버튼은 있다', async () => {
    const user = userEvent.setup();
    render(<CardTabs {...props({ onSelectUnfilled: undefined })} />);
    await user.click(tabNamed('미체결'));
    expect(root().querySelectorAll('[data-slot="account-unfilled-select"]')).toHaveLength(0);
    expect(within(root()).getAllByRole('button', { name: /취소$/ }).length).toBeGreaterThan(0);
  });

  it('빈 슬라이스면 「이 종목의 미체결이 없어요」', async () => {
    const user = userEvent.setup();
    render(<CardTabs {...props({ account: acct({ unf: [] }) })} />);
    await user.click(tabNamed('미체결'));
    expect(within(root()).getByText('이 종목의 미체결이 없어요')).toBeInTheDocument();
  });
});

describe('CardTabs — 잔고 · 로그', () => {
  it('잔고 탭 → 1행 · priceOf 현재가로 평가손익 계산 · 없으면 「보유 없음」', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<CardTabs {...props()} />);
    await user.click(tabNamed('잔고'));
    expect(root().querySelectorAll('[data-slot="account-embed-holding-row"]')).toHaveLength(1);
    expect(root().querySelector('[data-slot="account-embed-pnl"]')?.textContent).not.toBe('—');
    unmount();

    render(<CardTabs {...props({ account: acct({ hold: [] }) })} />);
    await user.click(tabNamed('잔고'));
    expect(within(root()).getByText('보유 없음')).toBeInTheDocument();
  });

  it('로그 탭 → 3줄 · 빈 로그면 「로그 없음」', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<CardTabs {...props()} />);
    await user.click(tabNamed('전략로그'));
    expect(root().querySelectorAll('[data-slot="strategy-log-row"]')).toHaveLength(3);
    unmount();

    render(<CardTabs {...props({ log: [] })} />);
    await user.click(tabNamed('전략로그'));
    expect(within(root()).getByText('로그 없음')).toBeInTheDocument();
  });
});

describe('CardTabs — 반응형 · 상태', () => {
  it('탭 4개를 차례로 켜도 뷰포트 브레이크포인트 · @container 재선언이 없다 (D-28)', async () => {
    const user = userEvent.setup();
    render(<CardTabs {...props()} />);
    for (const label of ['정보', '미체결', '잔고', '전략로그']) {
      await user.click(tabNamed(label));
      const all = [root(), ...Array.from(root().querySelectorAll('*'))].map(
        (el) => el.getAttribute('class') ?? '',
      );
      for (const cls of all) {
        expect(cls).not.toMatch(/(^|\s)(sm|md|lg|xl|2xl):/);
        expect(cls).not.toMatch(/(^|\s)@container/);
      }
    }
  });

  it('탭 선택은 컴포넌트 state — 부모 props 만 바뀌어도 유지된다', async () => {
    const user = userEvent.setup();
    const view = render(<CardTabs {...props()} />);
    await user.click(tabNamed('잔고'));
    view.rerender(<CardTabs {...props({ log: LOG.slice(0, 1), selectedOrderNo: '3407000064' })} />);
    expect(tabNamed('잔고')).toHaveAttribute('aria-selected', 'true');
    expect(tabNamed('전략로그').textContent).toBe('전략로그(1)');
  });
});

describe('CardTabs — 탭 요청 통로 (quick-260923-pgu · 알림 클릭)', () => {
  it('requestedTab 으로 탭이 바뀌고, 같은 seq 재렌더는 사용자 선택을 지키며, 새 seq 는 다시 이긴다', async () => {
    const user = userEvent.setup();
    const view = render(<CardTabs {...props({ requestedTab: { tab: 'log', seq: 1 } })} />);
    expect(tabNamed('전략로그')).toHaveAttribute('aria-selected', 'true');

    await user.click(tabNamed('잔고'));
    view.rerender(<CardTabs {...props({ requestedTab: { tab: 'log', seq: 1 } })} />);
    expect(tabNamed('잔고')).toHaveAttribute('aria-selected', 'true');

    view.rerender(<CardTabs {...props({ requestedTab: { tab: 'unfilled', seq: 2 } })} />);
    expect(tabNamed('미체결')).toHaveAttribute('aria-selected', 'true');
  });

  it('요청이 없으면 기본 정보 탭', () => {
    render(<CardTabs {...props()} />);
    expect(tabNamed('정보')).toHaveAttribute('aria-selected', 'true');
  });
});

describe('CardTabs — 고정 높이 본문 · 접기 (quick-260925-ptw)', () => {
  const body = () => root().querySelector('[data-slot="card-tabs-body"]') as HTMLElement;
  const fold = () => root().querySelector('[data-slot="card-tabs-fold"]') as HTMLButtonElement;

  it('본문 래퍼 하나가 네 탭을 담고 공통 고정 높이(정보 탭 3줄) · 세로 스크롤이다 — 탭별 높이 없음 (260925 후속)', async () => {
    const user = userEvent.setup();
    render(<CardTabs {...props()} />);
    const H = 'h-[calc(3*(11px*var(--lh-normal)+6px)+4px)]';
    // 정보는 이미 활성이라 다시 누르면 접힌다(260926) — 다른 탭부터 돌고 정보로 돌아온다.
    for (const label of ['미체결', '잔고', '전략로그', '정보']) {
      await user.click(tabNamed(label));
      const panel = within(root()).getByRole('tabpanel');
      expect(body().contains(panel)).toBe(true);
      // 탭을 바꿔도 같은 래퍼(같은 클래스) — 높이 불변. 탭 콘텐츠는 높이·상한을 갖지 않는다.
      const cls = body().className.split(/\s+/);
      expect(cls).toContain(H);
      expect(cls).toContain('overflow-y-auto');
      expect(panel.className).not.toMatch(/\b(max-)?h-\[/);
    }
  });

  it('탭 줄 오른쪽 끝 접기 버튼 — aria-expanded · aria-controls(본문 id) · 「탭 접기」', () => {
    render(<CardTabs {...props()} />);
    const btn = fold();
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(btn).toHaveAttribute('aria-controls', body().id);
    expect(body().id).not.toBe('');
    expect(btn).toHaveAttribute('aria-label', '탭 접기');
    expect(btn).toHaveAttribute('title', '탭 접기');
    expect(btn.type).toBe('button');
  });

  it('접기 → 본문 hidden · 탭 알약(건수 포함) 그대로 · 선호 cardTabsFolded true 저장 · 다시 누르면 펼침 false 저장', async () => {
    const user = userEvent.setup();
    render(<CardTabs {...props()} />);
    await user.click(fold());
    expect(body()).toHaveAttribute('hidden');
    expect(fold()).toHaveAttribute('aria-expanded', 'false');
    expect(fold()).toHaveAttribute('aria-label', '탭 펼치기');
    expect(fold()).toHaveAttribute('title', '탭 펼치기');
    expect(tabs().map((t) => t.textContent)).toEqual(['정보', '미체결(2)', '잔고(1)', '전략로그(3)']);
    expect(readPanelsPref().cardTabsFolded).toBe(true);

    await user.click(fold());
    expect(body()).not.toHaveAttribute('hidden');
    expect(fold()).toHaveAttribute('aria-expanded', 'true');
    expect(readPanelsPref().cardTabsFolded).toBe(false);
  });

  it('저장된 cardTabsFolded true 면 접힌 채 마운트 · requestedTab 을 들고 마운트되면 펼친 채', () => {
    writePanelsPref({ cardTabsFolded: true });
    const view = render(<CardTabs {...props()} />);
    expect(body()).toHaveAttribute('hidden');
    expect(fold()).toHaveAttribute('aria-expanded', 'false');
    view.unmount();

    render(<CardTabs {...props({ requestedTab: { tab: 'log', seq: 1 } })} />);
    expect(body()).not.toHaveAttribute('hidden');
    expect(tabNamed('전략로그')).toHaveAttribute('aria-selected', 'true');
  });

  it('접힌 상태에서 탭(활성 탭 포함)을 누르면 펼쳐지고 false 저장', async () => {
    const user = userEvent.setup();
    writePanelsPref({ cardTabsFolded: true });
    const view = render(<CardTabs {...props()} />);
    await user.click(tabNamed('정보')); // 이미 활성 탭 재클릭
    expect(body()).not.toHaveAttribute('hidden');
    expect(readPanelsPref().cardTabsFolded).toBe(false);
    view.unmount();

    writePanelsPref({ cardTabsFolded: true });
    render(<CardTabs {...props()} />);
    await user.click(tabNamed('잔고'));
    expect(body()).not.toHaveAttribute('hidden');
    expect(tabNamed('잔고')).toHaveAttribute('aria-selected', 'true');
    expect(readPanelsPref().cardTabsFolded).toBe(false);
  });

  it('펼친 상태에서 이미 선택된 탭을 다시 누르면 접히고 true 저장 · 다른 탭은 전환만 · 다시 누르면 펼침 (260926)', async () => {
    const user = userEvent.setup();
    render(<CardTabs {...props()} />);
    await user.click(tabNamed('잔고')); // 다른 탭 — 전환만
    expect(body()).not.toHaveAttribute('hidden');
    expect(tabNamed('잔고')).toHaveAttribute('aria-selected', 'true');

    await user.click(tabNamed('잔고')); // 선택된 탭 재클릭 — 접힘
    expect(body()).toHaveAttribute('hidden');
    expect(fold()).toHaveAttribute('aria-expanded', 'false');
    expect(tabNamed('잔고')).toHaveAttribute('aria-selected', 'true');
    expect(readPanelsPref().cardTabsFolded).toBe(true);

    await user.click(tabNamed('잔고')); // 접힌 상태 재클릭 — 펼침
    expect(body()).not.toHaveAttribute('hidden');
    expect(readPanelsPref().cardTabsFolded).toBe(false);

    // 키보드 — 선택된 탭에서 Enter 도 같은 토글
    tabNamed('잔고').focus();
    await user.keyboard('{Enter}');
    expect(body()).toHaveAttribute('hidden');
  });

  it('접힌 상태에서 새 requestedTab.seq 가 오면 그 탭으로 펼쳐진다 — 선호는 저장하지 않는다', async () => {
    const user = userEvent.setup();
    const view = render(<CardTabs {...props({ requestedTab: { tab: 'info', seq: 1 } })} />);
    await user.click(fold());
    expect(readPanelsPref().cardTabsFolded).toBe(true);
    view.rerender(<CardTabs {...props({ requestedTab: { tab: 'unfilled', seq: 2 } })} />);
    expect(body()).not.toHaveAttribute('hidden');
    expect(tabNamed('미체결')).toHaveAttribute('aria-selected', 'true');
    expect(readPanelsPref().cardTabsFolded).toBe(true);
  });

  it('readPanelsPref 는 boolean 이 아닌 cardTabsFolded 를 버린다 — 펼친 채 마운트', () => {
    window.localStorage.setItem(TRADING_PANELS_KEY, JSON.stringify({ cardTabsFolded: 'yes', vi: true }));
    expect(readPanelsPref()).toEqual({ vi: true });
    render(<CardTabs {...props()} />);
    expect(body()).not.toHaveAttribute('hidden');
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Phase 25-10 Task 1 — 카드 탭 「주문로그」 (D-06 · 결정 3-A · 4-B · UI-SPEC ②-2)
 *
 * 잠그는 것: 탭 5개 순서 info → unfilled → holdings → orderlog → log · 「로그」 → 「전략로그」 라벨만(값 log) ·
 * 요청 통로 `{ tab: "orderlog" }` · 본문 = card dense 목록(필터줄 · 핀 없음) · 범위 = 카드 계좌 주문 + 그 종목 ·
 * 그 거래소(시세 포함) · 빈/로딩/실패 · 가려진 동안 배지(다른 탭 · 카드 탭 접힘 · 카드 접힘).
 * ──────────────────────────────────────────────────────────────────────────── */

describe('CardTabs — 주문로그 탭 (Phase 25)', () => {
  const buy = STRATEGY_DAY_BY_NAME.buy12451!; // 카드 계좌 · KRX · 이 종목
  const exposed = STRATEGY_DAY_BY_NAME.exposed!; // 시세 · KRX · 이 종목
  const exposedNxt = STRATEGY_BRANCH_ROWS.exposedOpen!; // 시세 · NXT(다른 거래소)
  const otherAccount: StrategyEventRow = { ...buy, seq: 901, accountNo: '9999999901', orderNo: '77777' };
  const otherStock: StrategyEventRow = { ...buy, seq: 902, isin: 'KR7000660001', stockCode: '000660' };
  const ISIN_KRX = buy.isin;

  function feed(over: Partial<OrderLogFeed> = {}): OrderLogFeed {
    return {
      rows: [exposed, buy, exposedNxt, otherAccount, otherStock],
      status: 'ready',
      retry: vi.fn(),
      newKeys: new Set(),
      latestPush: null,
      date: '2026-09-29',
      isToday: true,
      ...over,
    };
  }

  function olProps(f: OrderLogFeed, over: Partial<CardTabsProps> = {}): CardTabsProps {
    return props({
      accountNo: FIXTURE_ACCOUNT_NO,
      orderLog: { feed: f, isin: ISIN_KRX, exchange: 'KRX', stockName: FIXTURE_STOCK_NAME, phoneBand: false },
      ...over,
    });
  }

  const olBody = () => root().querySelector<HTMLElement>('[data-slot="order-log"][data-surface="card"]');
  const olLines = () => [...root().querySelectorAll<HTMLElement>('li[data-slot="order-log-line"]')];
  const normalize = (s: string | null): string => (s ?? '').replace(/\s+/g, ' ').trim();

  it('탭 5개 순서 [정보, 미체결(2), 잔고(1), 주문로그, 전략로그(3)] · 값 log 트리거가 「전략로그」', () => {
    render(<CardTabs {...olProps(feed())} />);
    expect(tabs().map((t) => t.textContent)).toEqual(['정보', '미체결(2)', '잔고(1)', '주문로그', '전략로그(3)']);
    expect(tabs().map((t) => t.id.replace(/^.*-trigger-/, ''))).toEqual([
      'info',
      'unfilled',
      'holdings',
      'orderlog',
      'log',
    ]);
  });

  it('orderLog prop 이 없으면(작업대 밖) 주문로그 탭이 없다', () => {
    render(<CardTabs {...props()} />);
    expect(tabs().map((t) => t.id.replace(/^.*-trigger-/, ''))).toEqual(['info', 'unfilled', 'holdings', 'log']);
  });

  it('요청 { tab: "orderlog", seq: 2 } → 주문로그 탭 활성 · 펼침(저장된 접힘이 있어도)', () => {
    writePanelsPref({ cardTabsFolded: true });
    render(<CardTabs {...olProps(feed(), { requestedTab: { tab: 'orderlog', seq: 2 } })} />);
    expect(tabNamed('주문로그')).toHaveAttribute('aria-selected', 'true');
    expect(root().querySelector('[data-slot="card-tabs-body"]')).not.toHaveAttribute('hidden');
    expect(olBody()).not.toBeNull();
  });

  it('본문 = card dense 목록 · 필터줄 · 핀 없음 · 줄 = 카드 계좌 주문 + 그 종목 · 그 거래소 시세만', async () => {
    const user = userEvent.setup();
    render(<CardTabs {...olProps(feed())} />);
    await user.click(tabNamed('주문로그'));
    expect(olBody()).not.toBeNull();
    expect(root().querySelector('[data-slot="order-log-filters"]')).toBeNull();
    expect(root().querySelector('[data-slot="order-log-pin"]')).toBeNull();
    const lines = olLines();
    expect(lines).toHaveLength(2);
    expect(normalize(lines[0]!.textContent)).toBe('09:42:13.215 상한가노출 매도잔량 185,400 | 누적 620,000');
    expect(normalize(lines[1]!.textContent)).toBe(
      STRATEGY_DAY_GOLDEN.buy12451!.logLine.replace('[09:45:02.861][12451][선매수] KRX | ○○전자 | ', '09:45:02.861 #12451 선매수 '),
    );
    // 전체 문장 툴팁은 F-A 와 같다(줄 전체 평문 — 거래소 · 종목 포함).
    expect(lines[1]!.getAttribute('title')).toBe(STRATEGY_DAY_GOLDEN.buy12451!.logLine);
  });

  it('빈 상태 = dense 제목만 「이 종목의 주문로그가 없어요」 · 로딩 「불러오는 중…」 · 실패 한 줄 + 다시 시도 = feed.retry', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CardTabs {...olProps(feed({ rows: [] }))} />);
    await user.click(tabNamed('주문로그'));
    const empty = root().querySelector<HTMLElement>('[data-slot="order-log-empty"]')!;
    expect(normalize(empty.textContent)).toBe('이 종목의 주문로그가 없어요');
    expect(empty.className).toContain('m-2');
    expect(empty.className).toContain('py-2');

    rerender(<CardTabs {...olProps(feed({ rows: [], status: 'loading' }))} />);
    expect(root().querySelector('[data-slot="order-log-loading"]')?.textContent).toBe('불러오는 중…');

    const retry = vi.fn();
    rerender(<CardTabs {...olProps(feed({ rows: [], status: 'error', retry }))} />);
    const err = root().querySelector<HTMLElement>('[data-slot="order-log-error"]')!;
    expect(err.getAttribute('role')).toBe('status');
    expect(err.textContent).toContain('오늘 주문로그를 불러오지 못했어요');
    await user.click(within(err).getByRole('button', { name: '다시 시도' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('배지: 정보 탭 활성 중 범위 안 푸시 2건(+범위 밖 2건) → 「주문로그(2)」 · 이름 「주문로그, 새 로그 2건」 · 열면 괄호 없음', async () => {
    const user = userEvent.setup();
    const f0 = feed();
    const { rerender } = render(<CardTabs {...olProps(f0)} />);
    expect(tabNamed('주문로그').textContent).toBe('주문로그');
    const pushed = [
      { ...buy, seq: 950 },
      { ...exposed, seq: 951 },
      { ...otherAccount, seq: 952 },
      { ...exposedNxt, seq: 953 },
    ];
    rerender(<CardTabs {...olProps(feed({ latestPush: { seq: 1, rows: pushed } }))} />);
    expect(tabNamed('주문로그').textContent).toBe('주문로그(2)');
    expect(tabNamed('주문로그')).toHaveAttribute('aria-label', '주문로그, 새 로그 2건');
    await user.click(tabNamed('주문로그'));
    expect(tabNamed('주문로그').textContent).toBe('주문로그');
    expect(tabNamed('주문로그')).not.toHaveAttribute('aria-label');
  });

  it('주문로그 탭 활성이어도 카드 탭을 접으면 가려짐으로 센다 · 다시 펴면 0', async () => {
    const user = userEvent.setup();
    const req = { tab: 'orderlog' as const, seq: 1 };
    const { rerender } = render(<CardTabs {...olProps(feed(), { requestedTab: req })} />);
    await user.click(root().querySelector<HTMLElement>('[data-slot="card-tabs-fold"]')!);
    const pushed = feed({ latestPush: { seq: 1, rows: [{ ...buy, seq: 960 }] } });
    rerender(<CardTabs {...olProps(pushed, { requestedTab: req })} />);
    expect(tabNamed('주문로그').textContent).toBe('주문로그(1)');
    await user.click(root().querySelector<HTMLElement>('[data-slot="card-tabs-fold"]')!);
    expect(tabNamed('주문로그').textContent).toBe('주문로그');
  });

  it('주문로그 탭이 활성이어도 카드가 접혀 있으면(cardOpen false) 센다 · 카드를 펴면 0', () => {
    const req = { tab: 'orderlog' as const, seq: 1 };
    const { rerender } = render(<CardTabs {...olProps(feed(), { requestedTab: req, cardOpen: false })} />);
    rerender(
      <CardTabs
        {...olProps(feed({ latestPush: { seq: 1, rows: [{ ...buy, seq: 970 }] } }), { requestedTab: req, cardOpen: false })}
      />,
    );
    expect(tabNamed('주문로그').textContent).toBe('주문로그(1)');
    rerender(
      <CardTabs
        {...olProps(feed({ latestPush: { seq: 1, rows: [{ ...buy, seq: 970 }] } }), { requestedTab: req, cardOpen: true })}
      />,
    );
    expect(tabNamed('주문로그').textContent).toBe('주문로그');
  });

  it('주문로그 탭 활성 · 펼침 · 카드 펼침이면 푸시가 와도 배지 0', () => {
    const req = { tab: 'orderlog' as const, seq: 1 };
    const { rerender } = render(<CardTabs {...olProps(feed(), { requestedTab: req })} />);
    rerender(<CardTabs {...olProps(feed({ latestPush: { seq: 1, rows: [{ ...buy, seq: 980 }] } }), { requestedTab: req })} />);
    expect(tabNamed('주문로그').textContent).toBe('주문로그');
  });

  it('본문 공통 고정 높이 · 접기 규칙은 그대로 — 주문로그 탭도 같은 card-tabs-body 안', async () => {
    const user = userEvent.setup();
    render(<CardTabs {...olProps(feed())} />);
    await user.click(tabNamed('주문로그'));
    const body = root().querySelector<HTMLElement>('[data-slot="card-tabs-body"]')!;
    expect(body.className).toContain('h-[calc(3*(11px*var(--lh-normal)+6px)+4px)]');
    expect(body.contains(olBody())).toBe(true);
  });
});
