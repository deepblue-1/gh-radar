import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  RelayAccountState,
  RelayHolding,
  RelayLimitFeatureMsg,
  RelayOrderResultMsg,
  RelayUnfilled,
} from '@gh-radar/shared';

/**
 * quick-260923-onn — 펼친 카드 본문 상단 「정보 | 미체결 N | 잔고 N」 탭 (목업 ②A) + quick-260930-lq5 로그 버튼 두 개.
 *
 * 잠그는 것:
 *   - 탭 4개(Phase 28 「상한가」 추가) · 건수는 미체결·잔고만(0 이면 생략) · 기본 정보 = 기존 10칸
 *   - 미체결 탭 = AccountPanel stock 스코프(5열) · 행 선택은 공용 패널과 같은 토글 헬퍼
 *   - 잔고 탭 = 1행 6열(`priceOf`) · 전략로그 = 버튼 팝업(시각 · 내용 2열 · 오류만) · 빈 문구 원문
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
import { strategyEventKey, strategyEventParts, type StrategyEventRow } from '@gh-radar/shared';
import type { OrderLogFeed } from '@/lib/use-order-log-feed';
import { matchesSide, orderLogSummary } from '@/lib/order-log-feed';
import {
  FIXTURE_ACCOUNT_NO,
  FIXTURE_STOCK_NAME,
  STRATEGY_BRANCH_ROWS,
  STRATEGY_DAY_BY_NAME,
  STRATEGY_LIMIT_FEATURE_BY_NAME,
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
    isin: ISIN,
    exchange: 'KRX',
    stockName: '알테오젠',
    limitFeature: null,
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
  it('탭 4개 [정보, 미체결(2), 잔고(1), 상한가] · 값 info · unfilled · holdings · limit · 건수는 제목 괄호 · 정보엔 없음 · 기본 정보 = 10칸', () => {
    render(<CardTabs {...props()} />);
    expect(tabs().map((t) => t.textContent)).toEqual(['정보', '미체결(2)', '잔고(1)', '상한가']);
    expect(tabs().map((t) => t.id.replace(/^.*-trigger-/, ''))).toEqual(['info', 'unfilled', 'holdings', 'limit']);
    expect(root().querySelectorAll('[data-slot="card-tab-count"]')).toHaveLength(2);
    expect(tabNamed('정보').querySelector('[data-slot="card-tab-count"]')).toBeNull();
    expect(tabNamed('정보')).toHaveAttribute('aria-selected', 'true');
    expect(root().querySelector('[data-slot="lc-quote-grid"]')).not.toBeNull();
  });

  it('미체결 0 · 잔고 0 이면 괄호 0개', () => {
    render(<CardTabs {...props({ account: acct({ unf: [], hold: [] }), log: [] })} />);
    expect(root().querySelectorAll('[data-slot="card-tab-count"]')).toHaveLength(0);
    expect(tabs().map((t) => t.textContent)).toEqual(['정보', '미체결', '잔고', '상한가']);
  });

  it('탭 줄 = 탭 4 + [전략로그 버튼](피드 없어도 · 배지 없음) + 접기 — 순서대로', () => {
    render(<CardTabs {...props()} />);
    const bar = root().querySelector('[data-slot="card-tabs-bar"]')!;
    const strat = bar.querySelector('[data-slot="card-log-button"][data-log="로그"]')!;
    expect(strat.textContent).toBe('로그');
    expect(strat.querySelector('[data-slot="card-log-badge"]')).toBeNull();
    const fold = bar.querySelector('[data-slot="card-tabs-fold"]')!;
    expect(strat.compareDocumentPosition(fold) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

describe('CardTabs — 잔고 · 전략로그 팝업', () => {
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

  const stratButton = () =>
    root().querySelector<HTMLButtonElement>('[data-slot="card-log-button"][data-log="로그"]')!;

  it('전략로그 버튼 → 다이얼로그(이름 전략로그 · 종목명 · 거래소) · 머리 [시각, 내용] · 오래된 줄 위 · 오류 행 data-level · 창 분리 없음', async () => {
    const user = userEvent.setup();
    const log: StrategyLogEntry[] = [
      { id: '3', at: '09:42:00', text: '서버 반영 완료' },
      { id: '2', at: '09:41:00', text: '주문가능수량 초과로 거부됐어요', level: 'error' },
      { id: '1', at: '09:40:00', text: '등록' },
    ];
    render(<CardTabs {...props({ log })} />);
    await user.click(stratButton());
    const dlg = screen.getByRole('dialog');
    const title = document.getElementById(dlg.getAttribute('aria-labelledby')!)!.textContent!;
    expect(title).toContain('로그');
    expect(title).toContain('알테오젠');
    expect(title).toContain('KRX');
    expect([...dlg.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['시각', '내용']);
    const rows = [...dlg.querySelectorAll<HTMLElement>('tr[data-slot="card-log-row"]')];
    expect(rows.map((r) => r.querySelector('td')!.textContent)).toEqual(['09:40:00', '09:41:00', '09:42:00']);
    expect(rows[1]).toHaveAttribute('data-level', 'error');
    expect(rows[1]!.querySelectorAll('td')[1]!.className).toContain('text-[var(--destructive)]');
    expect(rows[0]).toHaveAttribute('data-level', 'info');
    expect(dlg.querySelector('[data-slot="card-log-popout"]')).toBeNull();
    expect(dlg.querySelector('[data-slot="card-log-count"]')?.textContent).toBe('3건');

    const group = within(dlg).getByRole('group', { name: '보기' });
    await user.click(within(group).getByRole('button', { name: '오류만' }));
    const errOnly = [...dlg.querySelectorAll<HTMLElement>('tr[data-slot="card-log-row"]')];
    expect(errOnly).toHaveLength(1);
    expect(errOnly[0]!.textContent).toContain('주문가능수량 초과로 거부됐어요');
    expect(dlg.querySelector('[data-slot="card-log-count"]')?.textContent).toBe('1건');
  });

  it('빈 로그 → 「로그 없음」 · 오류만인데 0 → 「조건에 맞는 로그가 없어요」', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<CardTabs {...props({ log: [] })} />);
    await user.click(stratButton());
    expect(screen.getByRole('dialog').querySelector('[data-slot="card-log-empty"]')?.textContent).toBe('로그 없음');
    unmount();

    render(<CardTabs {...props()} />);
    await user.click(stratButton());
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '오류만' }));
    expect(screen.getByRole('dialog').querySelector('[data-slot="card-log-empty"]')?.textContent).toBe(
      '조건에 맞는 로그가 없어요',
    );
  });
});

describe('CardTabs — 반응형 · 상태', () => {
  it('탭 4개를 차례로 켜도 뷰포트 브레이크포인트 · @container 재선언이 없다 (D-28 · 포털 다이얼로그는 밖)', async () => {
    const user = userEvent.setup();
    render(<CardTabs {...props()} />);
    for (const label of ['정보', '미체결', '잔고', '상한가']) {
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
  });
});

describe('CardTabs — 탭 요청 통로 (quick-260923-pgu · 알림 클릭)', () => {
  it('requestedTab 으로 탭이 바뀌고, 같은 seq 재렌더는 사용자 선택을 지키며, 새 seq 는 다시 이긴다', async () => {
    const user = userEvent.setup();
    const view = render(<CardTabs {...props({ requestedTab: { tab: 'holdings', seq: 1 } })} />);
    expect(tabNamed('잔고')).toHaveAttribute('aria-selected', 'true');

    await user.click(tabNamed('정보'));
    view.rerender(<CardTabs {...props({ requestedTab: { tab: 'holdings', seq: 1 } })} />);
    expect(tabNamed('정보')).toHaveAttribute('aria-selected', 'true');

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

  it('본문 래퍼 하나가 세 탭을 담고 공통 고정 높이(정보 탭 3줄) · 세로 스크롤이다 — 탭별 높이 없음 (260925 후속)', async () => {
    const user = userEvent.setup();
    render(<CardTabs {...props()} />);
    const H = 'h-[calc(3*(11px*var(--lh-normal)+6px)+4px)]';
    // 정보는 이미 활성이라 다시 누르면 접힌다(260926) — 다른 탭부터 돌고 정보로 돌아온다.
    for (const label of ['미체결', '잔고', '정보']) {
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
    expect(tabs().map((t) => t.textContent)).toEqual(['정보', '미체결(2)', '잔고(1)', '상한가']);
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

    render(<CardTabs {...props({ requestedTab: { tab: 'holdings', seq: 1 } })} />);
    expect(body()).not.toHaveAttribute('hidden');
    expect(tabNamed('잔고')).toHaveAttribute('aria-selected', 'true');
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
 * quick-260930-lq5 — 카드 「주문로그」 버튼 + 한 종목 팝업 (D1 · D2 · D3 · D5)
 *
 * 잠그는 것: 주문로그 탭 없음 · 탭 줄 접기 앞 버튼 · 배지(닫힌 동안 범위 안 새 줄 수 · 열면 0) · 다이얼로그 제목 =
 * 알약 + 종목명 + 거래소(ISIN · 계좌 없음) · 표 6열 · 범위(카드 계좌 주문 + 그 종목 · 그 거래소 시세) · 오름차순 ·
 * 번호 뒤 4자리 · 내용 = strategyEventParts body 그대로 · 거부 · 새 줄 표시 · 요약 · 구분 세그먼트 · 창 분리 URL · 상태 문구.
 * 다이얼로그는 body 포털이라 `screen` 으로 찾는다(jsdom 은 CSS 를 적용하지 않아 폰 행도 DOM 에 있다 — 표 행으로 한정).
 * ──────────────────────────────────────────────────────────────────────────── */

describe('CardTabs — 주문로그 버튼 + 팝업 (quick-260930-lq5)', () => {
  const buy = STRATEGY_DAY_BY_NAME.buy12451!; // 카드 계좌 · KRX · 이 종목
  const exposed = STRATEGY_DAY_BY_NAME.exposed!; // 시세 · KRX · 이 종목
  const exposedNxt = STRATEGY_BRANCH_ROWS.exposedOpen!; // 시세 · NXT(다른 거래소)
  const otherAccount: StrategyEventRow = { ...buy, seq: 901, accountNo: '9999999901', orderNo: '77777' };
  const otherStock: StrategyEventRow = { ...buy, seq: 902, isin: 'KR7000660001', stockCode: '000660' };
  const reject = STRATEGY_DAY_BY_NAME.reject!; // 거부 · 빈 주문번호
  const sell = STRATEGY_DAY_BY_NAME.sell12454!;
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
      showLimitFeature: false,
      setShowLimitFeature: vi.fn(),
      ...over,
    };
  }

  function olProps(f: OrderLogFeed, over: Partial<CardTabsProps> = {}): CardTabsProps {
    return props({
      accountNo: FIXTURE_ACCOUNT_NO,
      isin: ISIN_KRX,
      exchange: 'KRX',
      stockName: FIXTURE_STOCK_NAME,
      orderLogFeed: f,
      ...over,
    });
  }

  const olButton = () =>
    root().querySelector<HTMLButtonElement>('[data-slot="card-tabs-bar"] [data-slot="card-log-button"][data-log="주문로그"]');
  const dialog = () => screen.getByRole('dialog');
  const tableRows = () => [...dialog().querySelectorAll<HTMLElement>('tr[data-slot="card-log-row"]')];
  const cells = (tr: HTMLElement) => [...tr.querySelectorAll('td')].map((td) => td.textContent ?? '');
  const count = () => dialog().querySelector('[data-slot="card-log-count"]')?.textContent;

  it('주문로그 탭(tab role)은 없고 탭 줄 안 접기 버튼 앞에 「주문로그」 버튼 · 피드가 없으면 버튼 없음', () => {
    const view = render(<CardTabs {...olProps(feed())} />);
    expect(tabs().map((t) => t.id.replace(/^.*-trigger-/, ''))).not.toContain('orderlog');
    const btn = olButton()!;
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('주문로그');
    const fold = root().querySelector('[data-slot="card-tabs-fold"]')!;
    expect(btn.compareDocumentPosition(fold) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    view.unmount();

    render(<CardTabs {...props()} />);
    expect(olButton()).toBeNull();
  });

  it('배지: 닫힌 동안 범위 안 푸시 2건(+범위 밖 2건) → 「2」 · 이름 「주문로그, 새 로그 2건」 · 열면 없음 · 닫은 뒤 다시 센다', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CardTabs {...olProps(feed())} />);
    expect(root().querySelector('[data-slot="card-log-badge"]')).toBeNull();
    const pushed = [
      { ...buy, seq: 950 },
      { ...exposed, seq: 951 },
      { ...otherAccount, seq: 952 },
      { ...exposedNxt, seq: 953 },
    ];
    rerender(<CardTabs {...olProps(feed({ latestPush: { seq: 1, rows: pushed } }))} />);
    expect(root().querySelector('[data-slot="card-log-badge"]')?.textContent).toBe('2');
    expect(olButton()).toHaveAttribute('aria-label', '주문로그, 새 로그 2건');

    await user.click(olButton()!);
    expect(dialog()).toBeInTheDocument();
    expect(root().querySelector('[data-slot="card-log-badge"]')).toBeNull();
    expect(olButton()).not.toHaveAttribute('aria-label');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<CardTabs {...olProps(feed({ latestPush: { seq: 2, rows: [{ ...buy, seq: 954 }] } }))} />);
    expect(root().querySelector('[data-slot="card-log-badge"]')?.textContent).toBe('1');
  });

  it('다이얼로그: 이름 = 주문로그 · 종목명 · KRX · ISIN/계좌 없음 · 표 머리 6열 · 범위 안 2행 오름차순 · 번호 뒤 4자리 · 내용 = parts.body', async () => {
    const user = userEvent.setup();
    render(<CardTabs {...olProps(feed())} />);
    await user.click(olButton()!);
    const dlg = dialog();
    const name = dlg.getAttribute('aria-labelledby');
    const title = document.getElementById(name!)!.textContent!;
    expect(title).toContain('주문로그');
    expect(title).toContain(FIXTURE_STOCK_NAME);
    expect(title).toContain('KRX');
    expect(title).not.toContain(ISIN_KRX);
    expect(title).not.toContain(FIXTURE_ACCOUNT_NO);
    expect([...dlg.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      '시각',
      '주문번호',
      '구분',
      '행위',
      '내용',
      '누적',
    ]);
    const rows = tableRows();
    expect(rows).toHaveLength(2);
    const [r0, r1] = rows.map(cells);
    expect(r0![0]).toBe('09:42:13.215');
    expect(r0![1]).toBe('');
    expect(r0![2]).toBe('상한가노출');
    expect(r0![4]).toBe(strategyEventParts(exposed, 'log').body);
    expect(r0![5]).toBe('620,000');
    expect(r1![1]).toBe('2451');
    expect(r1![2]).toBe('선매수');
    expect(r1![3]).toBe('주문');
    expect(r1![4]).toBe(strategyEventParts(buy, 'log').body);
    expect(r1![5]).toBe('861,800');
    expect(count()).toBe('2건');
  });

  it('거부 행 data-reject · 빈 번호 「—」 · 새 줄 data-new · 요약 = orderLogSummary · 세그먼트 「매도」 로 좁힘', async () => {
    const user = userEvent.setup();
    const rows = [exposed, buy, sell, reject];
    render(<CardTabs {...olProps(feed({ rows, newKeys: new Set([strategyEventKey(sell)]) }))} />);
    await user.click(olButton()!);
    const trs = tableRows();
    expect(trs).toHaveLength(4);
    expect(trs[3]).toHaveAttribute('data-reject');
    expect(cells(trs[3]!)[1]).toBe('—');
    expect(trs[2]).toHaveAttribute('data-new');
    expect(trs[1]).not.toHaveAttribute('data-new');

    const sum = orderLogSummary(rows);
    const summary = dialog().querySelector('[data-slot="card-log-summary"]')!.textContent;
    expect(summary).toBe(
      `주문${sum.orders}체결${sum.fills}거부${sum.rejects}취소${sum.cancels}누적${sum.cum!.toLocaleString('ko-KR')}`,
    );

    const group = within(dialog()).getByRole('group', { name: '구분' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['전체', '매수', '매도', '자동매도', '시세']);
    await user.click(within(group).getByRole('button', { name: '매도' }));
    expect(within(group).getByRole('button', { name: '매도' })).toHaveAttribute('aria-pressed', 'true');
    expect(tableRows().map((tr) => cells(tr)[2])).toEqual(rows.filter((r) => matchesSide(r, 'sell')).map((r) => strategyEventParts(r, 'log').badge));
    expect(count()).toBe(`${rows.filter((r) => matchesSide(r, 'sell')).length}건`);
  });

  it('창 분리 → window.open 에 account · stock=ISIN · ex=KRX · 매도면 kind=sell', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<CardTabs {...olProps(feed())} />);
    await user.click(olButton()!);
    await user.click(within(dialog()).getByRole('button', { name: '주문로그 새 창으로 열기' }));
    const url0 = new URL(String(open.mock.calls[0]![0]), 'http://x');
    expect(url0.pathname).toBe('/trading/order-log');
    expect(url0.searchParams.get('account')).toBe(FIXTURE_ACCOUNT_NO);
    expect(url0.searchParams.get('stock')).toBe(ISIN_KRX);
    expect(url0.searchParams.get('ex')).toBe('KRX');
    expect(url0.searchParams.get('kind')).toBeNull();

    await user.click(within(dialog()).getByRole('button', { name: '매도' }));
    await user.click(within(dialog()).getByRole('button', { name: '주문로그 새 창으로 열기' }));
    const url1 = new URL(String(open.mock.calls[1]![0]), 'http://x');
    expect(url1.searchParams.get('kind')).toBe('sell');
    open.mockRestore();
  });

  it('상태: 로딩 「불러오는 중…」 · 실패 「오늘 주문로그를 불러오지 못했어요」 + 다시 시도 = feed.retry · 빈 「이 종목의 주문로그가 없어요」 · 필터 0행 「조건에 맞는 로그가 없어요」', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CardTabs {...olProps(feed({ rows: [], status: 'loading' }))} />);
    await user.click(olButton()!);
    expect(dialog().querySelector('[data-slot="card-log-loading"]')?.textContent).toBe('불러오는 중…');

    const retry = vi.fn();
    rerender(<CardTabs {...olProps(feed({ rows: [], status: 'error', retry }))} />);
    const err = dialog().querySelector<HTMLElement>('[data-slot="card-log-error"]')!;
    expect(err.getAttribute('role')).toBe('status');
    expect(err.textContent).toContain('오늘 주문로그를 불러오지 못했어요');
    await user.click(within(err).getByRole('button', { name: '다시 시도' }));
    expect(retry).toHaveBeenCalledTimes(1);

    rerender(<CardTabs {...olProps(feed({ rows: [] }))} />);
    expect(dialog().querySelector('[data-slot="card-log-empty"]')?.textContent).toBe('이 종목의 주문로그가 없어요');

    rerender(<CardTabs {...olProps(feed({ rows: [exposed] }))} />);
    await user.click(within(dialog()).getByRole('button', { name: '매수' }));
    expect(dialog().querySelector('[data-slot="card-log-empty"]')?.textContent).toBe('조건에 맞는 로그가 없어요');
  });

  it('kind 15 상한가 특징 줄(28-09 · UI-SPEC ②-2): 배지 「상한가특징」 --muted 면 · --muted-fg 글자 · 주문번호 칸 빈칸 · lead 「잠김 43초」 --up 600 · 내용 --muted-fg', async () => {
    const user = userEvent.setup();
    const locked = STRATEGY_LIMIT_FEATURE_BY_NAME.lfLocked43!;
    expect(locked.isin).toBe(ISIN_KRX);
    render(<CardTabs {...olProps(feed({ rows: [locked, buy] }))} />);
    await user.click(olButton()!);
    const tr = tableRows().find((r) => r.getAttribute('data-kind') === '15')!;
    expect(tr).toBeDefined();
    const badge = tr.querySelector<HTMLElement>('[data-slot="card-log-kind"]')!;
    expect(badge.textContent).toBe('상한가특징');
    expect(badge.className).toContain('bg-[var(--muted)]');
    expect(badge.className).toContain('text-[var(--muted-fg)]');
    const [, orderNo, , action, body] = [...tr.querySelectorAll<HTMLElement>('td')];
    expect(orderNo!.textContent).toBe('');
    expect(action!.textContent).toBe('');
    expect(body!.className).toContain('text-[var(--muted-fg)]');
    expect(body!.textContent).toBe(`잠김 43초 · ${strategyEventParts(locked, 'log').body}`);
    const lead = body!.querySelector<HTMLElement>('[data-slot="order-log-lead"]')!;
    expect(lead.textContent).toBe('잠김 43초');
    expect(lead.className).toContain('text-[var(--up)]');
    expect(lead.className).toContain('font-semibold');
    // 폰 두 줄 행도 같은 lead.
    const phone = [...dialog().querySelectorAll<HTMLElement>('li[data-slot="card-log-phone-row"]')].find(
      (li) => li.getAttribute('data-kind') === '15',
    )!;
    expect(phone.querySelector('[data-slot="order-log-lead"]')?.textContent).toBe('잠김 43초');
  });

  it('「상한가 특징」 체크 칩(28-11 · D-07): 세그먼트 뒤 · 건수 앞 · 꺼짐 기본 · 클릭 → feed.setShowLimitFeature(true)', async () => {
    const user = userEvent.setup();
    const setShowLimitFeature = vi.fn();
    render(<CardTabs {...olProps(feed({ rows: [exposed, buy], setShowLimitFeature }))} />);
    await user.click(olButton()!);
    const box = within(dialog()).getByRole('checkbox', { name: '상한가 특징' });
    expect(box).not.toBeChecked();
    const chip = box.closest('[data-slot="order-log-check-limit-feature"]')!;
    const group = within(dialog()).getByRole('group', { name: '구분' });
    const countEl = dialog().querySelector('[data-slot="card-log-count"]')!;
    expect(group.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chip.compareDocumentPosition(countEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tableRows().some((r) => r.getAttribute('data-kind') === '15')).toBe(false);
    await user.click(box);
    expect(setShowLimitFeature).toHaveBeenCalledWith(true);
  });

  it('체크 켜짐: 「시세」 세그먼트에 kind 15 가 남고(tone 아닌 kind 판정 · Pitfall 4) 「매수」 에는 없다 · 배지는 피드 latestPush 의 kind 15 를 센다', async () => {
    const user = userEvent.setup();
    const locked = STRATEGY_LIMIT_FEATURE_BY_NAME.lfLocked43!;
    const f = feed({ rows: [exposed, buy, locked], showLimitFeature: true });
    const { rerender } = render(<CardTabs {...olProps(f)} />);
    rerender(<CardTabs {...olProps({ ...f, latestPush: { seq: 1, rows: [{ ...locked, seq: 999 }] } })} />);
    expect(root().querySelector('[data-slot="card-log-badge"]')?.textContent).toBe('1');

    await user.click(olButton()!);
    expect(within(dialog()).getByRole('checkbox', { name: '상한가 특징' })).toBeChecked();
    const kinds = () => tableRows().map((r) => r.getAttribute('data-kind'));
    expect(kinds()).toContain('15');
    const group = within(dialog()).getByRole('group', { name: '구분' });
    await user.click(within(group).getByRole('button', { name: '시세' }));
    expect(kinds().filter((k) => k === '15')).toHaveLength(1);
    expect(count()).toBe('2건');
    await user.click(within(group).getByRole('button', { name: '매수' }));
    expect(kinds()).not.toContain('15');
  });
});

describe('Phase 28 상한가 탭 (D-01~D-04 · UI-SPEC ①)', () => {
  /** 잠김 시나리오 85 (relay 헬퍼 `buildLimitFeatureFrame` 기본값과 같은 값). */
  function lf(over: Partial<RelayLimitFeatureMsg> = {}): RelayLimitFeatureMsg {
    return {
      t: 'limit.feature',
      i: ISIN,
      x: 'KRX',
      gwTimeMs: 1_791_164_130_000,
      featureSchema: 1,
      upperPx: 13000,
      lastPx: 13000,
      rateBp: 3000,
      basePx: 10000,
      qQty: 133_077,
      qKrw: 1_730_000_000,
      wallKrwVisible: 0,
      wallQtyHidden: 0,
      wallTruncated: false,
      sellLed10s: 3_700,
      buyLed10s: 6_300,
      cancel10s: 2_300,
      new10s: 12_400,
      auctionFill10s: 0,
      drainS: -1,
      lockState: 1,
      lockElapsedS: 43,
      burstUpperLimit: false,
      auction: false,
      memberBuy: [],
      memberSell: [],
      memberDeltaPartial: false,
      modelState: 0,
      modelSchemaVersion: 0,
      pBreakBp: -1,
      pHorizonS: 0,
      ...over,
    };
  }

  const table = () => root().querySelector('[data-slot="lc-limit-feature"]') as HTMLTableElement | null;
  const cellTexts = () =>
    Array.from(table()!.querySelectorAll('[data-slot="lc-limit-feature-cell"]')).map((c) => c.textContent);

  it('트리거 4개 순서 「정보 · 미체결 · 잔고 · 상한가」 · lock 1 이면 4번째 접근 이름 「상한가 · 잠김 43초」 (「째」 없음 · --up 조각)', () => {
    render(<CardTabs {...props({ limitFeature: lf() })} />);
    const names = tabs().map((t) => t.textContent);
    expect(names.slice(0, 3)).toEqual(['정보', '미체결(2)', '잔고(1)']);
    expect(screen.getByRole('tab', { name: '상한가 · 잠김 43초' })).toBe(tabs()[3]);
    const state = tabs()[3]!.querySelector('[data-slot="card-tab-limit-state"]')!;
    expect(state.querySelector('.text-\\[var\\(--up\\)\\]')?.textContent).toBe('잠김 43초');
  });

  it('lock 2 → 「상한가 · 깨짐」(색 없음) · lock 0 · null → 「상한가」 접미 없음', () => {
    const { rerender } = render(<CardTabs {...props({ limitFeature: lf({ lockState: 2, lockElapsedS: 0 }) })} />);
    expect(screen.getByRole('tab', { name: '상한가 · 깨짐' })).toBeDefined();
    expect(tabs()[3]!.querySelector('.text-\\[var\\(--up\\)\\]')).toBeNull();
    rerender(<CardTabs {...props({ limitFeature: lf({ lockState: 0, lockElapsedS: 0 }) })} />);
    expect(tabs()[3]!.textContent).toBe('상한가');
    rerender(<CardTabs {...props({ limitFeature: null })} />);
    expect(tabs()[3]!.textContent).toBe('상한가');
    expect(tabs()[3]!.querySelector('[data-slot="card-tab-limit-state"]')).toBeNull();
  });

  it('「상한가」 클릭 → 9칸 WinForms 문구(지금 · 10초 폰/넓은 두 span · 창구) · 첫 칸 --up 600 (28-07)', async () => {
    const user = userEvent.setup();
    render(<CardTabs {...props({ limitFeature: lf() })} />);
    await user.click(tabNamed('상한가'));
    expect(tabNamed('상한가')).toHaveAttribute('aria-selected', 'true');
    expect(table()).not.toBeNull();
    expect(table()!.getAttribute('aria-label')).toBe('상한가 특징');
    expect(Array.from(table()!.querySelectorAll('th[scope="row"]')).map((th) => th.textContent)).toEqual([
      '지금',
      '10초',
      '창구',
    ]);
    // 잠김 중 10초 칸 2 · 3 은 폰 span + 넓은 span 이 같은 칸에 있다(CSS 컨테이너 쿼리로만 가른다).
    expect(cellTexts()).toEqual([
      '잠김 43초째',
      '대기 17.3억',
      '소진 —',
      '매수 우세 63%',
      '신규 +1.2만잔량 신규 +12,400',
      '취소 -2,300잔량 취소 -2,300',
      '매수 —',
      '매도 —',
      '깨짐확률 관찰 중',
    ]);
    const first = table()!.querySelector('[data-slot="lc-limit-feature-cell"]')!;
    expect(first.className).toContain('text-[var(--up)]');
    expect(first.className).toContain('font-semibold');
  });

  it('feature null 이면 9칸 모두 「—」(--faint)', async () => {
    const user = userEvent.setup();
    render(<CardTabs {...props({ limitFeature: null })} />);
    await user.click(tabNamed('상한가'));
    expect(cellTexts()).toEqual(Array.from({ length: 9 }, () => '—'));
    for (const c of table()!.querySelectorAll('[data-slot="lc-limit-feature-cell"]')) {
      expect(c.className).toContain('text-[var(--faint)]');
    }
  });

  it('자동 전환 없음 — feature 를 바꿔 넣어도(미도달 → 잠김) 활성 탭은 「정보」 그대로 (D-04)', () => {
    const { rerender } = render(<CardTabs {...props({ limitFeature: null })} />);
    expect(tabNamed('정보')).toHaveAttribute('aria-selected', 'true');
    rerender(<CardTabs {...props({ limitFeature: lf({ lockState: 0 }) })} />);
    rerender(<CardTabs {...props({ limitFeature: lf() })} />);
    expect(tabNamed('정보')).toHaveAttribute('aria-selected', 'true');
    expect(tabNamed('상한가')).toHaveAttribute('aria-selected', 'false');
    expect(tabNamed('상한가').textContent).toBe('상한가 · 잠김 43초');
  });

  it('탭 본문 래퍼는 「상한가」 에서도 공통 고정 높이(CARD_TABS_BODY_H) 그대로 — 카드 높이 불변 (D-02)', async () => {
    const user = userEvent.setup();
    render(<CardTabs {...props({ limitFeature: lf() })} />);
    const body = root().querySelector('[data-slot="card-tabs-body"]') as HTMLElement;
    const before = body.className;
    await user.click(tabNamed('상한가'));
    expect(body.className).toBe(before);
    expect(body.className).toContain('h-[calc(3*(11px*var(--lh-normal)+6px)+4px)]');
    expect(table()!.className).toContain('h-full');
  });

  it('접속 끊김(isStale) → 표 · 탭 제목 접미 data-stale + opacity .55 · 값은 그대로 (28-07)', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CardTabs {...props({ limitFeature: lf(), isStale: true })} />);
    const state = tabs()[3]!.querySelector('[data-slot="card-tab-limit-state"]')!;
    expect(state.getAttribute('data-stale')).toBe('true');
    expect(state.className).toContain('opacity-[.55]');
    expect(tabNamed('상한가').textContent).toBe('상한가 · 잠김 43초');
    await user.click(tabNamed('상한가'));
    expect(table()!.getAttribute('data-stale')).toBe('true');
    expect(table()!.className).toContain('opacity-[.55]');
    expect(cellTexts()[0]).toBe('잠김 43초째');
    rerender(<CardTabs {...props({ limitFeature: lf(), isStale: false })} />);
    expect(table()!.hasAttribute('data-stale')).toBe(false);
    expect(tabs()[3]!.querySelector('[data-slot="card-tab-limit-state"]')!.hasAttribute('data-stale')).toBe(false);
  });
});
