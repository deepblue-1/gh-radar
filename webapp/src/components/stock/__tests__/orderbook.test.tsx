import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  RelayAccount,
  RelayAccountState,
  RelayQuote,
  RelayTapeEntry,
} from '@gh-radar/shared';

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
 * ② 네트워크 0 — `@/lib/relay-provider` 의 `useRelaySubscription` 만 스텁한다
 *   훅을 스텁하면 wss·Supabase·타이머가 전부 사라지고 "이 상태에서 이 화면"만 남는다.
 *   **계좌 축(`accountStates`)도 같은 스텁으로 들어온다**(16-23) — 섹션이 계좌 상태를
 *   얻는 경로가 이 훅 하나뿐이기 때문이다. `useRelayContext` 는 스텁하지 않는다:
 *   `AccountPanel` 이 그 컨텍스트에서 `sendOrder` 만 꺼내 쓰는데, Provider 밖 폴백이
 *   「보내지 않았음」을 돌려주므로 실제 구현을 그대로 두는 편이 사실에 가깝다(⑤ 폴백 규율).
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
 *   **열 위치와 비색 텍스트**(`sr-only` 단계 라벨 · 체결 수량의 `sr-only` 매수/매도)로만
 *   단언한다(WCAG 1.4.1). 색 클래스 단언은 그 비색 경로와 **함께**일 때만 쓴다.
 */

// ---------------------------------------------------------------------------
// 훅 스텁 — 상태를 테스트가 직접 주입한다 (네트워크·타이머 0)
// ---------------------------------------------------------------------------

type RelaySocketShape = ReturnType<
  typeof import('@/lib/relay-provider').useRelaySubscription
>;
type RelayOptionsShape = Parameters<
  typeof import('@/lib/relay-provider').useRelaySubscription
>[0];

/** 훅이 돌려줄 상태. **객체 신원을 유지**해야 렌더 루프가 돌지 않는다. */
let mockRelay: RelaySocketShape;
/** 섹션이 훅에 넘긴 마지막 옵션 — 거래소 전환이 훅까지 갔는지 확인하는 정본. */
let mockLastOptions: RelayOptionsShape | null = null;

// 16-09 전역 승격 이후 섹션의 소비 경계는 `useRelaySubscription` 이다. 반환 계약은
// 승격 전 `useRelaySocket` 과 같으므로 이 스텁의 모양은 바뀌지 않았다.
vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return {
    ...actual,
    useRelaySubscription: (opts: RelayOptionsShape) => {
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

/*
  CR-01 회귀용 계좌 2개. 사용자는 **A** 를 고르고(목록 첫 계좌), B 에서도 프레임이 온다.
  기본 `ACCOUNTS`(1개)를 늘리지 않는 이유: 상태 배지 문구가 「실시간 · 계좌 1개」로
  고정돼 있어서 늘리면 무관한 케이스가 함께 깨진다.
*/
const ACCOUNT_A = '12345678-01';
const ACCOUNT_B = '87654321-02';
const ACCOUNTS_AB: RelayAccount[] = [
  { accountNo: ACCOUNT_A, name: '위탁종합' },
  { accountNo: ACCOUNT_B, name: '위탁CMA' },
];

/**
 * 같은 종목을 **두 계좌 모두** 들고 있고 미체결도 각각 있다.
 * 계좌를 섞으면 즉시 티가 나도록 주문번호·수량을 겹치지 않게 둔다.
 */
function accountStatesAB(): ReadonlyMap<string, RelayAccountState> {
  return new Map<string, RelayAccountState>([
    [
      ACCOUNT_A,
      {
        t: 'acct',
        a: ACCOUNT_A,
        snap: true,
        hold: [
          { isin: ISIN, qty: 76, sellableQty: 76, avgPrice: 97_000, name: NAME, code: CODE },
        ],
        unf: [
          {
            orderNo: 'A-0001',
            orgOrderNo: '',
            isin: ISIN,
            side: 'B',
            price: 97_900,
            orderQty: 10,
            filledQty: 0,
            unfilledQty: 10,
            orderTime: '093015',
            queuedStatus: '',
            pendingStatus: '',
            board: '',
            pendingCancelSent: false,
            exchange: 'KRX',
            name: NAME,
            code: CODE,
          },
        ],
        rm: [],
        st: '093015',
      },
    ],
    [
      ACCOUNT_B,
      {
        t: 'acct',
        a: ACCOUNT_B,
        snap: true,
        hold: [
          { isin: ISIN, qty: 500, sellableQty: 500, avgPrice: 90_000, name: NAME, code: CODE },
        ],
        unf: [
          {
            orderNo: 'B-9999',
            orgOrderNo: '',
            isin: ISIN,
            side: 'S',
            price: 98_500,
            orderQty: 20,
            filledQty: 0,
            unfilledQty: 20,
            orderTime: '093015',
            queuedStatus: '',
            pendingStatus: '',
            board: '',
            pendingCancelSent: false,
            exchange: 'KRX',
            name: NAME,
            code: CODE,
          },
        ],
        rm: [],
        st: '093016',
      },
    ],
  ]);
}

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
    kc: 0,
    et: '093015123456',
    ...over,
  };
}

/** 체결 3건 — 최신이 index 0 (훅 계약). 최우선호가 대비 매수/매도가 갈리게 둔다. */
function makeTape(): RelayTapeEntry[] {
  return [
    { t: '093017100000', p: 98_100, cs: '2', c: 100, q: 12, cv: 1_000_012, bs: '' },
    { t: '093016100000', p: 97_900, cs: '5', c: -100, q: 34, cv: 1_000_000, bs: '' },
    { t: '093015100000', p: 98_100, cs: '2', c: 100, q: 56, cv: 999_966, bs: '' },
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
    accountStates: new Map(),
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

function statusBar(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-slot="orderbook-status-bar"]');
  if (el === null) throw new Error('상태줄이 렌더되지 않았습니다');
  return el;
}

beforeEach(() => {
  mockRelay = makeRelay();
  mockLastOptions = null;
});

afterEach(() => {
  vi.useRealTimers();
});

/*
  ★ 18-10 — 호가 탭 본문이 작업대 카드 본문(`CardBody variant="orderbook"`)으로 교체됐다.
    Phase 15 표준 사다리(5단 접힘 · roving tabindex · 잔량 바 정규화) · 주문 패널 · 전폭 상태 바 ·
    헤더 종목정보 `dl` 을 잠그던 케이스는 **그 표면이 사라져** 지웠다. 같은 규칙이 지금 사는 곳:
      · 사다리 행·바 정규화·색 — `orderbook-ladder-chaser.test.tsx`(공유 chaser 트리)
      · 호가 탭 레이아웃·상태줄·이 종목 미체결 — `stock-orderbook-section.test.tsx`
      · 종가(`kc`) 칸 규칙 — `quote-grid-10.test.tsx`
      · 수동주문 4버튼·비율 버튼 부재 — `manual-order-form.test.tsx`
    남은 케이스는 이 섹션이 **훅 상태를 부품에 배분하는** 계약(파일 상단 ①)이다.
*/
describe('StockOrderbookSection (호가창 섹션)', () => {
  it('③ 호가 행 클릭 → 수동주문 가격에 그 값이 채워지고 **아무것도 전송되지 않는다** (T-15-14)', () => {
    renderSection();

    // 매도 1호가(98,100) — 세 트리 중 어느 것을 눌러도 같은 함수(`onPriceSelect`)다.
    const target = within(ladder()).getAllByText('98,100')[0];
    fireEvent.click(target);

    const price = document.querySelector<HTMLInputElement>(`#mo-price-${ISIN}`);
    expect(price?.value).toBe('98,100');
    // 가격만 채운다 — 확인 다이얼로그도 전송도 없다(클릭 = 주문이 아니다).
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('⑤ 상태줄 거래소 세그먼트 KRX→NXT → 훅에 새 exchange 가 전달된다 (D-04)', async () => {
    const user = userEvent.setup();
    renderSection();

    expect(mockLastOptions?.exchange).toBe('KRX');
    await user.click(within(statusBar()).getByRole('radio', { name: 'NXT' }));

    expect(mockLastOptions?.exchange).toBe('NXT');
    expect(mockLastOptions?.isin).toBe(ISIN);
  });

  it('⑥ NXT 로 전환했는데 호가가 오지 않으면 `이 종목은 NXT 호가가 없어요` (D3)', () => {
    vi.useFakeTimers();
    const { setRelay } = renderSection();

    fireEvent.click(within(statusBar()).getByRole('radio', { name: 'NXT' }));
    // 전환 직후에는 아직 "불러오는 중" 이다 — 빈 상태로 단정하지 않는다.
    expect(screen.queryByText('이 종목은 NXT 호가가 없어요')).not.toBeInTheDocument();
    expect(screen.getByText('NXT 호가 불러오는 중')).toBeInTheDocument();

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
    expect(screen.queryByTestId('manual-order-form')).toBeNull();
  });

  it('⑧ isin === null → 같은 게이트 + 훅은 enabled:false 로 연결조차 하지 않는다', () => {
    renderSection({ isin: null });

    expect(screen.getByTestId('stock-orderbook-section')).toBeInTheDocument();
    const gate = screen.getByTestId('orderbook-access-gate');
    expect(within(gate).getByText('실시간 호가·주문 권한이 없어요')).toBeInTheDocument();

    expect(mockLastOptions?.enabled).toBe(false);
    expect(mockLastOptions?.isin).toBe('');
  });

  it('⑨ quote === null (연결은 됐으나 호가 없음) → 10단 행은 그대로 「—」 · 안내 카드 없음 (E9 empty)', () => {
    mockRelay = makeRelay({ quote: null, tape: [] });
    renderSection();

    const rows = ladder().querySelectorAll('[data-slot="ladder-row-mobile"]');
    expect(rows).toHaveLength(20);
    for (const row of Array.from(rows)) expect(row.textContent).toContain('—');
    expect(screen.queryByText('호가 정보가 없어요')).toBeNull();
  });

  it('⑪ isStale:true → 사다리가 마지막 값을 유지하고 감쇠 스타일이 붙는다 (빈 화면 복귀 금지)', () => {
    mockRelay = makeRelay({ isStale: true, status: 'reconnecting', attempt: 2 });
    renderSection();

    // 값이 남아 있어야 한다 — 재접속마다 화면이 비면 사용자가 문맥을 잃는다.
    expect(within(ladder()).getAllByText('98,100').length).toBeGreaterThan(0);
    expect(ladder()).toHaveAttribute('data-stale', 'true');
    expect(ladder().className).toContain('opacity-[.55]');

    const tapes = document.querySelectorAll<HTMLElement>('[data-slot="trade-tape"]');
    expect(tapes.length).toBeGreaterThan(0);
    for (const tape of Array.from(tapes)) {
      expect(tape).toHaveAttribute('data-stale', 'true');
      expect(tape.querySelectorAll('tbody tr').length).toBe(3);
    }
  });

  it('⑫ 체결 수량의 매수/매도는 수량 색 + sr-only 라벨로 간다 (색 단독 금지 · WCAG 1.4.1)', () => {
    renderSection();

    const tape = document.querySelector('[data-slot="trade-tape"]') as HTMLElement;
    const qty = Array.from(tape.querySelectorAll('tbody tr')).map(
      (row) => row.children[2] as HTMLElement,
    );
    expect(qty).toHaveLength(3);
    // 최우선호가(매도1 98,100 / 매수1 97,900) 기준 — 98,100 체결은 매수, 97,900 체결은 매도.
    expect(qty[0].className).toContain('text-[var(--up)]');
    expect(qty[1].className).toContain('text-[var(--down)]');
    const labels = qty.map((c) => c.querySelector('.sr-only')?.textContent?.trim() ?? '');
    expect(labels[0]).toBe('매수');
    expect(labels[1]).toBe('매도');
  });

  it('⑭ ★ 계좌 A 를 고른 상태에서 계좌 패널은 **A 의 미체결만** 그린다 (CR-01)', () => {
    /*
      실패 경로: 계좌 A 선택 → 계좌 B 체결로 67 델타 도착 → 「마지막 수신 계좌」가 B 가
      된다 → 머리는 A 인데 행은 B → 그 행의 취소가 `accountNo: A` + `orgOrderNo: B의
      주문번호` 로 나간다. 계좌 패널의 입력이 `accountStates.get(selectedAccountNo)` 하나로
      통일돼 있으면 머리와 행의 출처가 같아져 이 경로 자체가 사라진다.
    */
    mockRelay = makeRelay({ accounts: ACCOUNTS_AB, accountStates: accountStatesAB() });
    renderSection();

    // 상태줄 계좌 = 목록의 첫 항목(A)이 자동 선택된다.
    expect(within(statusBar()).getByRole('combobox', { name: '계좌' })).toHaveValue(ACCOUNT_A);

    // 패널 머리는 셀렉터가 아니라 상태줄 계좌를 **글자로 되읽는다**(계좌 셀렉터는 하나뿐이다).
    const panel = screen.getByTestId('account-panel');
    expect(within(panel).getByTestId('account-panel-account-no')).toHaveTextContent(ACCOUNT_A);
    expect(within(panel).queryByRole('combobox')).toBeNull();
    expect(within(panel).getAllByText('A-0001').length).toBeGreaterThan(0);
    // ★ B 의 주문번호는 화면 어디에도 없다 — 있으면 그 행의 취소가 A 계좌로 나간다.
    expect(screen.queryAllByText('B-9999')).toHaveLength(0);
  });

  it('⑭-b 상태줄에서 계좌를 B 로 바꾸면 패널이 B 의 미체결로 바뀐다 — 계좌는 섹션 하나가 소유한다', () => {
    mockRelay = makeRelay({ accounts: ACCOUNTS_AB, accountStates: accountStatesAB() });
    renderSection();

    fireEvent.change(within(statusBar()).getByRole('combobox', { name: '계좌' }), {
      target: { value: ACCOUNT_B },
    });

    expect(screen.getAllByText('B-9999').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('A-0001')).toHaveLength(0);
  });

  it('⑬ DMA 필 문구는 훅의 연결 상태 문구(`RELAY_STATE_LABELS` 정본) 그대로다 (D-36)', () => {
    const { setRelay } = renderSection();
    expect(within(statusBar()).getByText('실시간')).toBeInTheDocument();

    setRelay({ status: 'failed', statusLabel: '회선 단절', quote: null });
    expect(within(statusBar()).getByText('회선 단절')).toBeInTheDocument();
    // 복구 불가 상태에서만 「다시 연결」이 상태줄에 선다 — 누르면 훅의 reconnect 다.
    fireEvent.click(within(statusBar()).getByRole('button', { name: '다시 연결' }));
    expect(mockRelay.reconnect).toHaveBeenCalledTimes(1);
  });
});

/*
  17-08 — KRX 정규장 종가 표기 (D-11). 18-10 부터 호가 탭의 종목정보는 카드와 같은 10칸
  (`QuoteGrid10`)이고, 규칙(종가가 **하한 칸**을 대신한다 · 판정 입력은 `quote.kc` 하나 ·
  벽시계 금지 · NXT 프레임에도 KRX 값)은 `quote-grid-10.test.tsx` 가 잠근다. 여기서는 이 섹션이
  **실시간 `quote` 를 10칸에 그대로 넘기는가**만 확인한다.
*/
describe('StockOrderbookSection 종목정보 — KRX 정규장 종가 배선 (17-08 / D-11)', () => {
  const grid = () => document.querySelector('[data-slot="lc-quote-grid"]') as HTMLElement;

  it('㉠ `kc > 0` 이면 10칸에 「종가」가 뜬다', () => {
    mockRelay = makeRelay({ quote: makeQuote({ kc: 98_300 }) });
    renderSection();
    expect(within(grid()).getByText('종가')).toBeInTheDocument();
    expect(within(grid()).getByText('98,300')).toBeInTheDocument();
  });

  it('㉡ `kc === 0` 이면 종전 표기(하한) 그대로다', () => {
    renderSection();
    expect(within(grid()).queryByText('종가')).toBeNull();
    expect(within(grid()).getByText('하한')).toBeInTheDocument();
  });
});
