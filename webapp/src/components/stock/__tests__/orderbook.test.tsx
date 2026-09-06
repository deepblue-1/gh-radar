import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RelayAccount, RelayQuote, RelayTapeEntry } from '@gh-radar/shared';

/**
 * Phase 15 Plan 14 Task 1 — 호가창 **섹션 단위** 계약 검증 (RELAY-01, SC-7).
 *
 * ① 무엇을 잠그는가
 *   15-13 의 `orderbook-ladder.test.tsx` / `trade-tape.test.tsx` 는 **부품 하나**를 props 로
 *   직접 때려서 검증한다. 이 파일은 그 위층 — `StockOrderbookSection` 이 훅 상태를
 *   부품들에게 **실제로 어떻게 배분하는가**를 잠근다. 부품이 각각 옳아도 셸이 잘못
 *   배분하면 화면은 틀린다(예: 게이트 상태인데 사다리를 그린다, 거래소를 바꿨는데
 *   훅에 안 넘긴다, stale 인데 본문을 비운다).
 *
 * ② 네트워크 0 — `@/lib/use-relay-socket` 만 스텁한다
 *   훅을 스텁하면 wss·Supabase·타이머가 전부 사라지고 "이 상태에서 이 화면"만 남는다.
 *   `importOriginal` 로 나머지 export(`RELAY_MAX_RECONNECT_ATTEMPTS` / `relayBackoffDelayMs`)
 *   는 **실제 구현을 유지**한다 — `RelayStatusBar` 가 그 둘을 import 하므로 통째로
 *   대체하면 상태 바가 `재접속 중 k/10` 의 분모를 잃는다.
 *
 * ③ 경로 규약 (플랜이 자주 틀리는 곳)
 *   webapp 단위/컴포넌트 테스트는 `src/**\/__tests__/` **co-located** 다.
 *   `webapp/tests/` 는 vitest include 에 걸리지 않아 조용히 실행되지 않는다.
 *
 * ④ 색에 기대지 않는다
 *   급등 종목에서는 사다리 20단·체결가가 전부 `--up` 이 된다. 그래서 매도/매수 구분은
 *   **열 위치와 텍스트**(`▲ 매수` / `▼ 매도`, `sr-only` 단계 라벨)로만 단언한다(WCAG 1.4.1).
 */

// ---------------------------------------------------------------------------
// 훅 스텁 — 상태를 테스트가 직접 주입한다 (네트워크·타이머 0)
// ---------------------------------------------------------------------------

type RelaySocketShape = ReturnType<
  typeof import('@/lib/use-relay-socket').useRelaySocket
>;
type RelayOptionsShape = Parameters<
  typeof import('@/lib/use-relay-socket').useRelaySocket
>[0];

/** 훅이 돌려줄 상태. **객체 신원을 유지**해야 렌더 루프가 돌지 않는다. */
let mockRelay: RelaySocketShape;
/** 섹션이 훅에 넘긴 마지막 옵션 — 거래소 전환이 훅까지 갔는지 확인하는 정본. */
let mockLastOptions: RelayOptionsShape | null = null;

vi.mock('@/lib/use-relay-socket', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/use-relay-socket')>();
  return {
    ...actual,
    useRelaySocket: (opts: RelayOptionsShape) => {
      mockLastOptions = opts;
      return mockRelay;
    },
  };
});

import { StockOrderbookSection } from '../stock-orderbook-section';

// ---------------------------------------------------------------------------
// 픽스처
// ---------------------------------------------------------------------------

const ISIN = 'KR7005930003';
const CODE = '005930';
const NAME = '삼성전자';
const BASE = 98_000;

const ACCOUNTS: RelayAccount[] = [{ accountNo: '12345678-01', name: '위탁종합' }];

/**
 * 매도 1~10호가 98,100~99,000 / 매수 1~10호가 97,900~97,000.
 * 잔량은 **단계 최대 정규화**를 눈으로 검산할 수 있게 10 단위 등차로 둔다
 * (매도 최대 = a9 의 100 → 그 행이 100%, 절반인 a4(50) 은 50%).
 */
function makeQuote(over: Partial<RelayQuote> = {}): RelayQuote {
  return {
    t: 'q',
    i: ISIN,
    x: 'KRX',
    snap: true,
    p: 98_100,
    o: 97_500,
    h: 99_000,
    l: 97_000,
    c: 100,
    cs: '2',
    cr: 10,
    v: 1_000_000,
    va: 98_000_000_000,
    ap: Array.from({ length: 10 }, (_, i) => 98_100 + i * 100),
    aq: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    bp: Array.from({ length: 10 }, (_, i) => 97_900 - i * 100),
    bq: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    ta: 550,
    tb: 550,
    ul: 127_400,
    ll: 68_600,
    base: BASE,
    viu: 108_000,
    vid: 88_000,
    ls: 5_969_782_550,
    et: '093015123456',
    ...over,
  };
}

/** 체결 3건 — 최신이 index 0 (훅 계약). 최우선호가 대비 매수/매도가 갈리게 둔다. */
function makeTape(): RelayTapeEntry[] {
  return [
    { t: '093017100000', p: 98_100, cs: '2', c: 100, q: 12, cv: 1_000_012 },
    { t: '093016100000', p: 97_900, cs: '5', c: -100, q: 34, cv: 1_000_000 },
    { t: '093015100000', p: 98_100, cs: '2', c: 100, q: 56, cv: 999_966 },
  ];
}

function makeRelay(over: Partial<RelaySocketShape> = {}): RelaySocketShape {
  return {
    status: 'ready',
    statusLabel: '실시간',
    statusMessage: '',
    attempt: 0,
    accounts: ACCOUNTS,
    quote: makeQuote(),
    tape: makeTape(),
    account: null,
    orders: [],
    messages: [],
    isStale: false,
    send: vi.fn(),
    reconnect: vi.fn(),
    ...over,
  } as RelaySocketShape;
}

type SectionProps = {
  isin?: string | null;
  basePrice?: number;
};

function renderSection(props: SectionProps = {}) {
  /*
    ★ 매 호출 **새 element** 를 만든다. 같은 element 참조를 rerender 에 넘기면 React 가
    `prevElement === nextElement` 로 보고 재렌더 자체를 건너뛴다 — 훅 스텁의 새 상태가
    화면에 반영되지 않아 "상태를 바꿨는데 문구가 그대로"인 유령 실패가 난다.
  */
  const node = () => (
    <StockOrderbookSection
      code={CODE}
      name={NAME}
      isin={props.isin === undefined ? ISIN : props.isin}
      basePrice={props.basePrice ?? BASE}
      upperLimit={127_400}
      lowerLimit={68_600}
    />
  );
  const utils = render(node());
  return {
    ...utils,
    /** 훅 상태를 바꾸고 다시 렌더한다(실제 훅의 상태 전이를 흉내). */
    setRelay(next: Partial<RelaySocketShape>) {
      mockRelay = { ...mockRelay, ...next };
      utils.rerender(node());
    },
  };
}

function ladder(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-slot="orderbook-ladder"]');
  if (el === null) throw new Error('사다리가 렌더되지 않았습니다');
  return el;
}

function priceCells(): HTMLElement[] {
  return Array.from(ladder().querySelectorAll<HTMLElement>('tbody th[scope="row"]'));
}

/** 잔량 바의 인라인 폭(%) — `td` 안 절대배치 레이어의 style.width 다. */
function barWidths(side: 'ask' | 'bid'): string[] {
  const cellIndex = side === 'ask' ? 0 : 2;
  return Array.from(ladder().querySelectorAll<HTMLElement>(`tr[data-side="${side}"]`)).map(
    (row) => {
      const bar = row.children[cellIndex].querySelector<HTMLElement>('span[aria-hidden="true"]');
      return bar?.style.width ?? '';
    },
  );
}

function statusBar(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-slot="relay-status-bar"]');
  if (el === null) throw new Error('상태 바가 렌더되지 않았습니다');
  return el;
}

beforeEach(() => {
  mockRelay = makeRelay();
  mockLastOptions = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('StockOrderbookSection (호가창 섹션)', () => {
  it('① ready + 10단 호가 → 매도 10행 + 매수 10행 = 20행, 가격은 .mono 로 렌더된다', () => {
    renderSection();

    const cells = priceCells();
    expect(cells).toHaveLength(20);
    expect(ladder().querySelectorAll('tr[data-side="ask"]')).toHaveLength(10);
    expect(ladder().querySelectorAll('tr[data-side="bid"]')).toHaveLength(10);

    // 첫 행은 매도 10호가(가격 내림차순), 마지막 행은 매수 10호가.
    expect(cells[0]).toHaveTextContent('99,000');
    expect(cells[19]).toHaveTextContent('97,000');
    // 고정폭 숫자 — 자릿수가 흔들리면 "벽"의 위치가 눈으로 어긋난다.
    for (const cell of cells) expect(cell.className).toContain('mono');
  });

  it('② 잔량 바 폭은 **단계 최대값 정규화**다 — 최대 행 100%, 절반 행 50% (누적이 아니다)', () => {
    renderSection();

    // 매도 행은 10호가 → 1호가 순서라 잔량은 100, 90, …, 10 이다.
    const asks = barWidths('ask');
    expect(asks[0]).toBe('100%');
    expect(asks[5]).toBe('50%');
    // 누적 정규화였다면 최소 잔량 행도 100% 근처가 된다 — 반례까지 못 박는다.
    expect(asks[9]).toBe('10%');
    expect(asks[9]).not.toBe('100%');

    // 매수 행은 1호가 → 10호가 순서라 잔량은 10, 20, …, 100 이다.
    const bids = barWidths('bid');
    expect(bids[0]).toBe('10%');
    expect(bids[9]).toBe('100%');
  });

  it('②-b 본문 배치 순서는 체결 → 호가 → 주문 → 계좌 다 (데스크톱 열 순서 = 모바일 세로 순서)', () => {
    renderSection();

    // 데스크톱은 `min-[900px]:order-none` 으로 소스 순서를 그대로 쓰므로 DOM 순서가 곧 정본이다.
    const grid = ladder().closest('.grid') as HTMLElement;
    const blocks = Array.from(grid.children) as HTMLElement[];

    expect(blocks[0].querySelector('[data-slot="trade-tape"]')).not.toBeNull();
    expect(blocks[1].querySelector('[data-slot="orderbook-ladder"]')).not.toBeNull();

    // 세 번째는 `display: contents` 인 계좌 축 — 그 안에서 주문이 잔고보다 앞이다.
    const column = blocks[2];
    expect(column).toHaveAttribute('data-testid', 'orderbook-account-column');
    const inner = Array.from(column.children) as HTMLElement[];
    expect(inner[0]).toHaveAttribute('data-testid', 'order-panel');

    // 모바일 세로 순서(order-*)도 같은 순서여야 한다 — 한쪽만 고치는 사고 차단.
    expect(blocks[0].className).toContain('order-1');
    expect(blocks[1].className).toContain('order-2');
    expect(inner[0].className).toContain('order-3');
  });

  it('③ 가격 셀 클릭 → 주문 가격에 그 값이 채워지고 **매매 구분은 바뀌지 않는다** (T-15-14)', async () => {
    const user = userEvent.setup();
    renderSection();

    // 먼저 매도로 바꿔 둔다 — 클릭이 구분을 매수로 되돌리면 그 자체가 오주문 사고다.
    const sellTab = screen.getByRole('tab', { name: '매도' });
    await user.click(sellTab);
    expect(sellTab).toHaveAttribute('aria-selected', 'true');

    // 매도 1호가(98,100) 셀 클릭.
    const target = priceCells().find((c) => c.textContent?.includes('98,100'));
    expect(target).toBeDefined();
    await user.click(target as HTMLElement);

    expect(screen.getByLabelText('가격')).toHaveValue('98,100');
    expect(screen.getByRole('tab', { name: '매도' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '매수' })).toHaveAttribute('aria-selected', 'false');
  });

  it('④ roving tabindex — 사다리는 tab stop 1개이고 ↓ 로 행 포커스가 이동한다', () => {
    renderSection();

    const focusables = ladder().querySelectorAll('[tabindex]');
    expect(focusables).toHaveLength(1);

    const table = ladder().querySelector('table') as HTMLTableElement;
    expect(table).toHaveAttribute('tabindex', '0');
    expect(table).toHaveAttribute('aria-activedescendant', 'ladder-row-a9');
    expect(ladder().querySelectorAll('tr[data-active="true"]')).toHaveLength(1);

    fireEvent.keyDown(table, { key: 'ArrowDown' });

    expect(table).toHaveAttribute('aria-activedescendant', 'ladder-row-a8');
    expect(ladder().querySelector('tr[data-active="true"]')).toHaveAttribute(
      'id',
      'ladder-row-a8',
    );
  });

  it('⑤ 거래소 토글 KRX→NXT → 훅에 새 exchange 가 전달된다 (D-04)', async () => {
    const user = userEvent.setup();
    renderSection();

    expect(mockLastOptions?.exchange).toBe('KRX');

    // Radix ToggleGroup(type="single") 은 항목에 `role="radio"` 를 강제한다 —
    // 접근 가능한 이름(`aria-label`)으로 잡아 role 구현 세부에 매이지 않는다.
    await user.click(screen.getByLabelText('NXT 호가'));

    expect(mockLastOptions?.exchange).toBe('NXT');
    expect(mockLastOptions?.isin).toBe(ISIN);
  });

  it('⑥ NXT 로 전환했는데 호가가 오지 않으면 `이 종목은 NXT 호가가 없어요` (D3)', () => {
    vi.useFakeTimers();
    const { setRelay } = renderSection();

    fireEvent.click(screen.getByLabelText('NXT 호가'));
    // 전환 직후에는 아직 "불러오는 중" 이다 — 빈 상태로 단정하지 않는다.
    expect(screen.queryByText('이 종목은 NXT 호가가 없어요')).not.toBeInTheDocument();

    // 훅이 구독 키 전환으로 호가를 비운 상태를 흉내낸다.
    setRelay({ quote: null });
    act(() => {
      vi.advanceTimersByTime(3_100);
    });

    expect(screen.getByText('이 종목은 NXT 호가가 없어요')).toBeInTheDocument();
    expect(mockLastOptions?.exchange).toBe('NXT');
  });

  it('⑦ status="unauthorized" → 게이트 카드가 본문을 대체하고 **섹션은 사라지지 않는다** (D-12)', () => {
    mockRelay = makeRelay({ status: 'unauthorized', statusLabel: '권한 없음', quote: null, tape: [] });
    renderSection();

    // 섹션 자체는 항상 렌더된다 — 탭에서 사라지면 사용자는 기능이 없어졌다고 읽는다.
    expect(screen.getByTestId('stock-orderbook-section')).toBeInTheDocument();

    const gate = screen.getByTestId('orderbook-access-gate');
    expect(within(gate).getByText('실시간 호가·주문 권한이 없어요')).toBeInTheDocument();
    expect(
      within(gate).getByText('이 종목의 차트·뉴스·종목토론방은 그대로 이용할 수 있어요.'),
    ).toBeInTheDocument();
    // 게이트 카드에는 **행동 버튼이 없다** — v1 은 셀프서비스 등록 경로 자체가 없다.
    expect(within(gate).queryByRole('button')).toBeNull();

    // 사다리·주문 진입점은 렌더되지 않는다.
    expect(document.querySelector('[data-slot="orderbook-ladder"]')).toBeNull();
    expect(screen.queryByTestId('order-panel')).toBeNull();
  });

  it('⑧ isin === null → 같은 게이트 + 훅은 enabled:false 로 연결조차 하지 않는다', () => {
    renderSection({ isin: null });

    expect(screen.getByTestId('stock-orderbook-section')).toBeInTheDocument();
    const gate = screen.getByTestId('orderbook-access-gate');
    expect(within(gate).getByText('실시간 호가·주문 권한이 없어요')).toBeInTheDocument();

    expect(mockLastOptions?.enabled).toBe(false);
    expect(mockLastOptions?.isin).toBe('');
  });

  it('⑨ quote === null (연결은 됐으나 호가 없음) → `호가 정보가 없어요`', () => {
    mockRelay = makeRelay({ quote: null });
    renderSection();

    expect(screen.getByText('호가 정보가 없어요')).toBeInTheDocument();
    expect(document.querySelectorAll('tbody th[scope="row"]')).toHaveLength(0);
  });

  it('⑩ tape 가 빈 배열 → `아직 체결이 없어요`', () => {
    mockRelay = makeRelay({ tape: [] });
    renderSection();

    expect(screen.getByText('아직 체결이 없어요')).toBeInTheDocument();
  });

  it('⑪ isStale:true → 사다리·테이프가 마지막 값을 유지하고 감쇠 스타일이 붙는다 (빈 화면 복귀 금지)', () => {
    mockRelay = makeRelay({ isStale: true, status: 'reconnecting', attempt: 2 });
    renderSection();

    // 값이 남아 있어야 한다 — 재접속마다 화면이 비면 사용자가 문맥을 잃는다.
    expect(priceCells().length).toBe(20);
    expect(ladder()).toHaveAttribute('data-stale', 'true');
    expect(ladder().className).toContain('opacity-[.55]');

    const tape = document.querySelector('[data-slot="trade-tape"]') as HTMLElement;
    expect(tape).toHaveAttribute('data-stale', 'true');
    expect(tape.querySelectorAll('tbody tr').length).toBe(3);
  });

  it('⑫ 체결 행은 `▲ 매수` / `▼ 매도` 를 **텍스트로** 병기한다 (색 비의존 · WCAG 1.4.1)', () => {
    renderSection();

    const tape = document.querySelector('[data-slot="trade-tape"]') as HTMLElement;
    const labels = Array.from(tape.querySelectorAll('tbody tr')).map(
      (row) => row.children[3].textContent?.trim() ?? '',
    );
    expect(labels).toHaveLength(3);
    for (const label of labels) expect(['▲ 매수', '▼ 매도']).toContain(label);
    // 최우선호가(매도1 98,100 / 매수1 97,900) 기준 — 98,100 체결은 매수, 97,900 체결은 매도.
    expect(labels[0]).toBe('▲ 매수');
    expect(labels[1]).toBe('▼ 매도');

    // 추정임을 화면에 밝힌다 — 서버가 주지 않는 값을 확정 사실로 그리지 않는다.
    expect(
      within(tape).getByText('구분은 최우선호가·직전 체결가 기준 추정이에요'),
    ).toBeInTheDocument();
  });

  it('⑬ 상태 배지 4종 문구가 UI-SPEC verbatim 이다 (connecting/ready/reconnecting/failed)', () => {
    // ready — 계좌 수를 덧붙인다.
    const { setRelay, unmount } = renderSection();
    expect(within(statusBar()).getByText('실시간 · 계좌 1개')).toBeInTheDocument();

    // reconnecting — 시도 회차 k/10.
    setRelay({ status: 'reconnecting', attempt: 2, isStale: true });
    expect(within(statusBar()).getByText('재접속 중 2/10')).toBeInTheDocument();
    expect(
      within(statusBar()).getByText('표시된 호가는 마지막으로 받은 값이에요.'),
    ).toBeInTheDocument();

    // failed — 회선 단절.
    setRelay({ status: 'failed', attempt: 0, quote: null });
    expect(within(statusBar()).getByText('회선 단절')).toBeInTheDocument();
    unmount();

    // connecting — 첫 연결.
    mockRelay = makeRelay({ status: 'connecting', quote: null, tape: [] });
    renderSection();
    expect(within(statusBar()).getByText('시세 서버 연결 중…')).toBeInTheDocument();
  });
});
