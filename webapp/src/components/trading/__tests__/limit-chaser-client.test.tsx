import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { RelayLimitChaser } from '@gh-radar/shared';

/**
 * Phase 16 Plan 13 Task 2 — 상따 화면 조립 규율 (TRADE-01).
 *
 * 여기서 잠그는 것은 레이아웃이 아니라 **오해로 이어지는 결선**이다:
 *   - 내가 보낸 에코와 **다른 단말의 변경**을 구분하는가 (구분 못 하면 내 「수정」마다 배너)
 *   - 3초 무응답이 「미반영」으로 서는가, 그리고 **재전송이 없는가** (T-16-10)
 *   - 서버 거부가 **상태줄과 로그 양쪽**에 남는가 (T-16-07)
 *   - VI 몫 통지를 상따 화면이 **먹지 않는가** (Pitfall 9)
 *   - 삭제 에코가 폼을 빈 상태로 되돌리는가 (D-08)
 *   - 이탈 경고가 **더티일 때만** 걸리는가
 *
 * ★ 스텁 경계는 `@/lib/relay-provider` 하나다. 진짜 wss 왕복은 E2E 가 본다 —
 *   여기서 소켓까지 흉내 내면 「우리 목업이 우리 목업과 잘 맞는다」만 증명하게 된다.
 */

const sendMock = vi.fn();
let relayValue: Record<string, unknown> = {};

vi.mock('@/lib/relay-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/relay-provider')>();
  return {
    ...actual,
    useRelayContext: () => ({ ...actual.EMPTY_RELAY_VALUE, send: sendMock, ...relayValue }),
    useRelaySubscription: () => ({
      ...actual.EMPTY_RELAY_VALUE,
      quote: null,
      tape: [],
      send: sendMock,
      ...relayValue,
    }),
  };
});

/**
 * 검색 API 스텁 — `StockSearchField` 가 유일하게 바깥과 맺는 계약이다.
 *
 * 실제 네트워크를 태우면 「우리 목업이 우리 목업과 잘 맞는다」만 증명하게 된다. 여기서 필요한
 * 것은 **응답 행의 `market`/`isin` 값에 따라 행이 고를 수 있는가**뿐이다 (WR-03).
 */
const searchMock = vi.fn();
vi.mock('@/lib/stock-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stock-api')>();
  return { ...actual, searchStocks: (...args: unknown[]) => searchMock(...args) };
});

vi.mock('@/components/trading/dma-gate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/trading/dma-gate')>();
  return { ...actual, useDmaGateReason: () => null };
});

import { formatMarketCap, formatOnePercentShares } from '@/lib/quote-format';
import {
  ACK_TIMEOUT_MS,
  ECHO_BANNER_MS,
  LimitChaserClient,
  parseStrategyKey,
  strategyStatusOf,
} from '../limit-chaser-client';

const ISIN = 'KR7086520004';
const ACCOUNT = '37728502101';
const KEY = `${ISIN}:${ACCOUNT}:KRX`;

function echo(over: Partial<RelayLimitChaser> = {}): RelayLimitChaser {
  return {
    isin: ISIN,
    accountNo: ACCOUNT,
    market: 'K',
    exchange: 'KRX',
    crud: 'C',
    key: KEY,
    buyOrderPrice: 130_000,
    buyOrderQty: 1,
    buyWatchPrice: 130_000,
    buyWatchQty: 10_000,
    buyMinTradeQty: 30_000,
    buyWatchSide: '0',
    buyTradeQtyEnabled: false,
    buyEnabled: true,
    buyOrderAmount: 10,
    sellOrderPrice: 130_000,
    sellOrderQty: 0,
    sellWatchPrice: 130_000,
    sellWatchQty: 10,
    sellMinTradeQty: 30_000,
    sellEnabled: false,
    sellTradeQtyEnabled: false,
    sellOrderRatio: 100,
    sellQtyTrackEnabled: false,
    sellQtyTrackRatio: 50,
    sellQtyTrackBaseline: 0,
    sellEntryLatched: false,
    sweepWatchPrice: 130_000,
    sweepEnabled: false,
    sweepMinTickCount: 3,
    sweepRecalcEnabled: true,
    sweepMinCount: 0,
    sweepMinRate: 0,
    cancelQtyEnabled: false,
    cancelWatchQty: 10,
    cancelTradeEnabled: false,
    cancelQtyTrackEnabled: false,
    cancelQtyTrackBaseline: 0,
    ...over,
  };
}

function msg(over: Record<string, string> = {}) {
  return {
    t: 'msg' as const,
    lv: 'INFO',
    m: '세션에 참여했습니다',
    i: '',
    a: '',
    src: 'System',
    kind: '',
    receivedAt: '13:44:02',
    ...over,
  };
}

function setRelay(over: Record<string, unknown>): void {
  relayValue = {
    status: 'ready',
    statusLabel: '실시간',
    accounts: [{ accountNo: ACCOUNT, name: 'KB 위탁종합' }],
    ...over,
  };
}

const logRows = () => document.querySelectorAll('[data-slot="strategy-log-row"]');

/**
 * 매수 「잔량」 입력.
 *
 * ★ `getByLabelText('잔량')` 을 쓰지 않는다 — 더티가 되면 라벨 앞에 `● ` 접두가 붙어
 *   **접근 가능한 이름이 바뀐다**(D-06 더티 표시). 이름으로 잡으면 「값을 고친 뒤에는 찾지
 *   못하는」 조회구가 되어, 정작 검증하려는 더티 경로에서만 터진다.
 */
const watchQtyInput = (): HTMLInputElement =>
  document.querySelector('#lc-buy-watch-qty') as HTMLInputElement;

beforeEach(() => {
  sendMock.mockReset();
  // ★ `send` 는 「소켓에 실었는가」를 돌려주는 boolean 계약이다(16-19). 상따 폼의 두 호출부가
  //   그 값으로 분기하므로(GC-WR-06), 세우지 않으면 `undefined`(falsy)라 모든 전송이
  //   「보내지 못했다」로 접힌다.
  sendMock.mockReturnValue(true);
  searchMock.mockReset();
  searchMock.mockResolvedValue([]);
  setRelay({});
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('parseStrategyKey', () => {
  it('① 세 조각 + 화이트리스트 거래소만 통과한다 — 반쪽 파싱은 다른 계좌를 편집하게 만든다', () => {
    expect(parseStrategyKey(KEY)).toEqual({ isin: ISIN, accountNo: ACCOUNT, exchange: 'KRX' });
    expect(parseStrategyKey(`${ISIN}:${ACCOUNT}:NXT`)?.exchange).toBe('NXT');
    expect(parseStrategyKey(`${ISIN}:${ACCOUNT}`)).toBeNull();
    expect(parseStrategyKey(`${ISIN}:${ACCOUNT}:KOSPI`)).toBeNull();
    expect(parseStrategyKey(`:${ACCOUNT}:KRX`)).toBeNull();
    expect(parseStrategyKey(`${ISIN}::KRX`)).toBeNull();
  });
});

describe('strategyStatusOf', () => {
  it('② 배지 매핑(16-11)을 그대로 문구로 옮긴다 — 판정을 다시 쓰지 않는다', () => {
    expect(strategyStatusOf(null, false).buyLabel).toBe('OFF');
    expect(strategyStatusOf(echo({ buyEnabled: true }), false)).toMatchObject({
      buyText: '무장',
      buyLabel: 'ON',
    });
    expect(
      strategyStatusOf(echo({ buyEnabled: false, sellEnabled: true }), false),
    ).toMatchObject({ sellText: '대기 (지지벽 미관측)', sellLabel: '대기' });
    expect(
      strategyStatusOf(echo({ buyEnabled: false, sellEnabled: true, sellEntryLatched: true }), false),
    ).toMatchObject({ sellText: '감시 중', sellLabel: '감시' });
  });

  it('③ ★ `hadOrder` 없이는 「발주됨」을 만들지 않는다 (Pitfall 10)', () => {
    // 발주된 적 없는 전략을 「발주 완료」로 쓰면 사용자가 없는 주문을 찾아 미체결을 뒤진다.
    expect(strategyStatusOf(echo({ buyEnabled: false }), false).buyText).toBe('');
    expect(strategyStatusOf(echo({ buyEnabled: false }), true).buyText).toBe(
      '발주 완료 · 무장 해제',
    );
  });
});

describe('LimitChaserClient — 결선', () => {
  it('④ 신규 진입은 제목만이고 부제도 칩 행도 종목정보 그리드도 그리지 않는다 (A1)', () => {
    render(<LimitChaserClient />);

    expect(screen.getByRole('heading', { name: '상따' })).toBeInTheDocument();
    // 안내 부제를 걷어냈다(quick 260911-tuk) — 문구를 비운 것이 아니라 요소가 없다.
    expect(
      screen.queryByText('종목을 고르면 아래 값이 상한가 기준으로 채워져요'),
    ).toBeNull();
    // 종목이 없으면 칩 자체가 없다 — 「상한가 —」 같은 빈 칩을 그리지 않는다.
    expect(document.querySelector('[data-slot="lc-price-chips"]')).toBeNull();
    // 같은 이유로 종목정보 8칸도 없다 — 빈 칸에 대시 8개를 그리는 것이 곧 소음이다(260911-w5h).
    expect(document.querySelector('[data-slot="lc-quote-grid"]')).toBeNull();
    expect(screen.getByLabelText('종목 검색')).toBeInTheDocument();
    // 자리표시가 걷혔다(16-11 인계).
    expect(document.querySelector('[data-slot="surface-placeholder"]')).toBeNull();
    expect(document.querySelector('[data-slot="limit-chaser-page"]')).not.toBeNull();
  });

  /*
    ★ 260911-w5h — 제목은 **편집 진입에서도 「상따」**다. 종목·거래소는 바로 아래 헤더
      카드가 보여주고, 전략키 mono 부제는 사용자가 읽을 일이 없는 내부 식별자였다.
      「바꿀 수 없다」는 규율(거래소·계좌·종목이 키의 일부)은 그대로이므로 잠금 단언이 셋으로
      늘었다 — 종목명 버튼까지 잠긴다.
  */
  it('⑤ 편집 진입도 제목은 「상따」이고 전략키는 화면에 없으며 거래소·계좌·종목이 잠긴다', () => {
    setRelay({
      limitChasers: [echo()],
      accountStates: new Map([
        [
          ACCOUNT,
          {
            t: 'acct',
            a: ACCOUNT,
            snap: true,
            hold: [{ isin: ISIN, qty: 10, sellableQty: 10, avgPrice: 100, name: '에코프로' }],
            unf: [],
            rm: [],
            st: '20260908134402',
          },
        ],
      ]),
    });
    render(<LimitChaserClient strategyKey={KEY} />);

    expect(screen.getByRole('heading', { name: '상따' })).toBeInTheDocument();
    // 전략키는 화면에 없다 — 내부 식별자다.
    expect(screen.queryByText(KEY)).toBeNull();
    // 종목명은 헤더 카드의 검색 트리거 버튼이 보여준다.
    const trigger = document.querySelector('[data-slot="lc-stock-trigger"]')!;
    expect(trigger).toHaveTextContent('에코프로');
    // 거래소·계좌·종목은 전략 키의 일부다 — 바꾸면 다른 전략이 되므로 여기서 못 바꾼다.
    expect(trigger).toBeDisabled();
    expect(screen.getByLabelText('거래소')).toBeDisabled();
    expect(screen.getByLabelText('계좌')).toBeDisabled();
  });

  it('⑥ ★ 내가 보낸 요청의 에코에는 「다른 단말」 배너를 띄우지 않는다', async () => {
    const { rerender } = render(<LimitChaserClient strategyKey={KEY} />);
    setRelay({ limitChasers: [echo()] });
    rerender(<LimitChaserClient strategyKey={KEY} />);

    // 스위치 1개를 끈다 → `onSent` 로 pending 이 선다.
    const sw = screen.getByRole('switch', { name: '매수주문 켜기' });
    sw.click();
    expect(sendMock).toHaveBeenCalledTimes(1);

    setRelay({ limitChasers: [echo({ buyEnabled: false })] });
    rerender(<LimitChaserClient strategyKey={KEY} />);

    await waitFor(() => expect(logRows().length).toBeGreaterThan(0));
    expect(document.querySelector('[data-slot="lc-echo-banner"]')).toBeNull();
    // 내가 껐으므로 「발주」가 아니다 — 로그 문구가 그 둘을 가른다.
    expect(screen.getByText(/매수 무장 해제/)).toBeInTheDocument();
    expect(screen.queryByText(/매수 발주/)).toBeNull();
  });

  it('⑦ ★ 보낸 적 없는 에코 = 다른 단말 변경 → 6초 배너 + 로그 1줄 (D-11 · D3)', async () => {
    setRelay({ limitChasers: [echo()] });
    const { rerender } = render(<LimitChaserClient strategyKey={KEY} />);

    setRelay({ limitChasers: [echo({ buyWatchQty: 8_000 })] });
    rerender(<LimitChaserClient strategyKey={KEY} />);

    const banner = await waitFor(() => {
      const el = document.querySelector('[data-slot="lc-echo-banner"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner.textContent).toBe('다른 단말에서 변경됐어요 · 서버 값으로 맞췄어요');
    // 배너는 지나가지만 로그는 남는다 — 「아까 뭐라고 떴었지」의 유일한 답이다.
    const rows = Array.from(logRows());
    expect(rows.some((r) => r.textContent?.includes('다른 단말에서 변경됐어요'))).toBe(true);

    // 6초 뒤 배너만 사라지고 **로그는 남는다**.
    act(() => {
      vi.advanceTimersByTime(ECHO_BANNER_MS);
    });
    expect(document.querySelector('[data-slot="lc-echo-banner"]')).toBeNull();
    expect(
      Array.from(logRows()).some((r) => r.textContent?.includes('다른 단말에서 변경됐어요')),
    ).toBe(true);
  });

  it('⑦b ★ 더티를 덮은 경우에만 「수정하던 값 {N}개」 문구를 쓴다 (D-11)', async () => {
    setRelay({ limitChasers: [echo()] });
    const { rerender } = render(<LimitChaserClient strategyKey={KEY} />);

    // 사용자가 잔량을 고친다 → 더티 1.
    fireEvent.change(watchQtyInput(), { target: { value: '8000' } });
    expect(watchQtyInput()).toHaveValue('8,000');

    // 다른 단말이 **바로 그 필드**를 다른 값으로 바꾼다.
    setRelay({ limitChasers: [echo({ buyWatchQty: 5_000 })] });
    rerender(<LimitChaserClient strategyKey={KEY} />);

    const banner = await waitFor(() => {
      const el = document.querySelector('[data-slot="lc-echo-banner"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(banner.textContent).toBe(
      '다른 단말에서 변경돼 수정하던 값 1개가 서버 값으로 바뀌었어요',
    );
    // 서버가 이긴다 — 편집 중 보호·보류가 없다.
    expect(watchQtyInput()).toHaveValue('5,000');
  });

  it('⑧ ★ 3초 무응답이면 「미반영」이 서고 **아무것도 다시 보내지 않는다** (T-16-10)', () => {
    setRelay({ limitChasers: [echo()] });
    render(<LimitChaserClient strategyKey={KEY} />);

    act(() => {
      screen.getByRole('switch', { name: '매수주문 켜기' }).click();
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-slot="lc-unacked"]')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS);
    });
    expect(document.querySelector('[data-slot="lc-unacked"]')?.textContent).toContain('미반영');

    // ★ 여기가 이 테스트의 핵심이다 — 시간이 아무리 흘러도 전송은 1건이다.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('⑨ ★ 서버 거부(ERROR)가 상태줄과 로그 **양쪽**에 남는다 (T-16-07 · PC-7)', async () => {
    setRelay({
      limitChasers: [echo()],
      messages: [
        msg({ lv: 'ERROR', src: 'SetLimitChaser', m: '허용되지 않은 거래소입니다', i: ISIN }),
      ],
    });
    render(<LimitChaserClient strategyKey={KEY} />);

    const bar = await waitFor(() => {
      const el = document.querySelector('[data-slot="lc-server-error"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(bar).toHaveAttribute('role', 'alert');
    expect(bar.textContent).toContain('허용되지 않은 거래소입니다');

    const rows = Array.from(logRows());
    expect(rows.some((r) => r.textContent?.includes('허용되지 않은 거래소입니다'))).toBe(true);
    expect(rows.some((r) => (r as HTMLElement).dataset.level === 'error')).toBe(true);
  });

  it('⑩ ★ 종목 없는 Account 통지(=VI 몫)는 상따 화면이 먹지 않는다 (Pitfall 9)', async () => {
    setRelay({
      limitChasers: [echo()],
      messages: [msg({ lv: 'ERROR', src: 'Account', i: '', m: 'VI 주문금액이 0 입니다' })],
    });
    render(<LimitChaserClient strategyKey={KEY} />);

    // 전략 로그가 렌더되기까지 기다린 뒤 「아무것도 안 들어왔다」를 단언한다 —
    // 기다리지 않으면 아직 안 그린 것을 「안 그린다」로 착각한다.
    await waitFor(() =>
      expect(document.querySelector('[data-slot="strategy-log"]')).not.toBeNull(),
    );
    expect(document.querySelector('[data-slot="lc-server-error"]')).toBeNull();
    expect(screen.queryByText(/VI 주문금액이 0 입니다/)).toBeNull();
    // 로그에는 스냅샷 등록 1줄만 있고 **오류 줄이 하나도 없다**.
    const rows = Array.from(logRows());
    expect(rows.some((r) => (r as HTMLElement).dataset.level === 'error')).toBe(false);
    expect(rows.some((r) => r.textContent?.includes('거부'))).toBe(false);
  });

  it('⑪ 삭제 에코 → 폼이 빈 상태(기본값)로 돌아가고 로그에 삭제가 남는다 (D-08)', async () => {
    setRelay({ limitChasers: [echo({ buyWatchQty: 8_000 })] });
    const { rerender } = render(<LimitChaserClient strategyKey={KEY} />);
    expect(watchQtyInput()).toHaveValue('8,000');

    // `crud:"D"` 는 전역 스냅샷에서 제거된다 — 화면에는 「목록에서 빠짐」으로 도착한다.
    setRelay({ limitChasers: [] });
    rerender(<LimitChaserClient strategyKey={KEY} />);

    await waitFor(() => expect(watchQtyInput()).toHaveValue('10,000'));
    expect(screen.getByText(/전략이 삭제됐어요/)).toBeInTheDocument();
  });

  it('⑫ ★ 이탈 경고는 **더티일 때만** 건다 (조작 규율 7)', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    setRelay({ limitChasers: [echo()] });
    render(<LimitChaserClient strategyKey={KEY} />);

    const beforeUnloadCount = () =>
      add.mock.calls.filter(([type]) => type === 'beforeunload').length;
    expect(beforeUnloadCount()).toBe(0);

    // 값을 하나 고치면 더티 1 → 그때 비로소 리스너가 걸린다.
    fireEvent.change(watchQtyInput(), { target: { value: '8000' } });

    await waitFor(() => expect(beforeUnloadCount()).toBe(1));
  });

  it('⑬ 15:40 서버 자동 비활성화가 로그 1줄로 남는다', async () => {
    setRelay({ limitChasers: [echo()] });
    const { rerender } = render(<LimitChaserClient strategyKey={KEY} />);

    setRelay({
      limitChasers: [echo()],
      strategiesDisabled: { t: 'strategies.disabled', lc: 3, vi: 1 },
    });
    rerender(<LimitChaserClient strategyKey={KEY} />);

    expect(
      await screen.findByText('서버가 모든 전략을 자동 비활성화했어요 (장 마감 규칙)'),
    ).toBeInTheDocument();
  });

  it('⑭ 본문 그리드 자식이 전부 `min-w-0` 이다 (R8 — 조용한 잘림 방지)', () => {
    setRelay({ limitChasers: [echo()] });
    render(<LimitChaserClient strategyKey={KEY} />);

    const grid = document.querySelector('[data-slot="lc-body-grid"]');
    expect(grid).not.toBeNull();
    // 클래스로 규칙 자체를 잠근다 — jsdom 은 폭을 계산하지 않아 실측으로는 못 잡는다.
    expect((grid as HTMLElement).className).toContain('[&>*]:min-w-0');
    expect((grid as HTMLElement).className).toContain('min-[1280px]:grid-cols-[460px_minmax(0,1fr)]');
    expect((grid as HTMLElement).className).toContain('grid-cols-[42%_minmax(0,1fr)]');
    expect((grid as HTMLElement).className).toContain('min-[1024px]:grid-cols-1');
  });

  it('⑮ 미체결에 출처 태그 `상따` 가 붙고 계좌 셀렉터가 **한 벌뿐**이다', () => {
    setRelay({
      limitChasers: [echo()],
      accountStates: new Map([
        [
          ACCOUNT,
          {
            t: 'acct',
            a: ACCOUNT,
            snap: true,
            hold: [],
            unf: [
              {
                orderNo: '0031245',
                orgOrderNo: '',
                isin: ISIN,
                side: 'B',
                price: 130_000,
                orderQty: 76,
                filledQty: 0,
                unfilledQty: 76,
                exchange: 'KRX',
                name: '에코프로',
              },
            ],
            rm: [],
            st: '20260908134402',
          },
        ],
      ]),
    });
    render(<LimitChaserClient strategyKey={KEY} />);

    expect(screen.getAllByText('상따').length).toBeGreaterThan(0);
    /*
      ★ 계좌 셀렉터가 두 벌이면 「지금 어느 계좌인가」가 갈린다 — 그것이 이 단언의 의도다.
        260911-w5h 로 헤더에 **거래소** `<select>` 가 생기면서 페이지의 combobox 총합은
        2개가 됐다(계좌 + 거래소). 총합이 아니라 **접근성 이름이 「계좌」인 select** 를
        세야 원래 의도가 유지된다.
    */
    expect(screen.getAllByRole('combobox', { name: '계좌' })).toHaveLength(1);
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });
});

/*
  WR-03 / D-28 — 시장 구분의 정본은 relay 다.

  옛 코드는 검색 행의 `market` 을 `row.market === 'KOSDAQ' ? 'Q' : 'K'` 로 접어 `lc.set.cfg`
  에 실었다. KOSDAQ 이 아닌 **모든** 값(KONEX·`null`·master-sync 의 미확인 sentinel)이 조용히
  KOSPI 가 됐고, 그것이 실계좌 **반복 발주 설정**이 됐다. 여기서 잠그는 것은 두 가지다:
    ① relay 가 못 푸는 종목은 **목록에서 이미** 고를 수 없다 (폼을 다 채운 뒤 거부는 늦다)
    ② 전송되는 `cfg` 에 `market` 키가 **없다** — 브라우저가 시장을 지어낼 자리가 없다
*/
describe('⑯ 시장 미상 종목은 고를 수 없고 cfg 에 market 이 없다 (WR-03 / D-28)', () => {
  /** 검색 응답 1행. `market` 은 타입상 KOSPI|KOSDAQ 이지만 **런타임은 그렇지 않다**. */
  function row(over: Record<string, unknown> = {}) {
    return {
      code: '086520',
      name: '에코프로',
      market: 'KOSPI',
      isin: ISIN,
      price: 30_000,
      changeAmount: 6_900,
      changeRate: 29.87,
      volume: 100,
      tradeAmount: 100,
      open: 23_100,
      high: 30_000,
      low: 23_000,
      marketCap: 0,
      // 상한가 시딩이 가격 칸을 채운다 — 기본 주문금액 10만원으로 `floor(10만/3만) = 3주`.
      // 0 주가 나오는 조합은 WR-06 이 무장을 막으므로 스위치 케이스가 성립하지 않는다.
      upperLimit: 30_000,
      lowerLimit: 16_200,
      updatedAt: '2026-09-09T02:00:00Z',
      upperLimitProximity: 100,
      ...over,
    };
  }

  async function search(rows: unknown[]): Promise<void> {
    searchMock.mockResolvedValue(rows);
    render(<LimitChaserClient />);
    fireEvent.change(screen.getByLabelText('종목 검색'), { target: { value: '에코' } });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    await waitFor(() =>
      expect(document.querySelectorAll('[data-slot="lc-search-option"]').length).toBe(rows.length),
    );
  }

  const options = () =>
    Array.from(
      document.querySelectorAll('[data-slot="lc-search-option"]'),
    ) as HTMLButtonElement[];

  it('KONEX·시장 null 행은 비활성이고 「주문 불가」 사유 배지가 붙는다', async () => {
    await search([
      row(),
      row({ code: '000001', name: '코넥스종목', market: 'KONEX' }),
      row({ code: '000002', name: '시장미상', market: null }),
    ]);

    const [ok, konex, unknown] = options();
    expect(ok).toBeEnabled();
    expect(konex).toBeDisabled();
    expect(unknown).toBeDisabled();
    // 회색으로만 두지 않는다 — 왜 못 고르는지 말한다.
    expect(within(konex).getByText('주문 불가')).toHaveAttribute(
      'data-slot',
      'lc-search-unorderable',
    );
    expect(within(unknown).getByText('주문 불가')).toBeInTheDocument();
    // 기존 규율도 그대로다 — ISIN 이 없으면 여전히 못 고른다 (D-28).
    expect(within(ok).queryByText('주문 불가')).toBeNull();
  });

  it('ISIN 이 없는 행도 같은 취급이다 (D-28 회귀)', async () => {
    await search([row({ isin: null })]);

    expect(options()[0]).toBeDisabled();
    expect(document.querySelector('[data-slot="lc-search-unorderable"]')).not.toBeNull();
  });

  it('★ 선택 후 전송되는 `lc.set.cfg` 에 `market` 키가 **없다** — D-28 회귀 잠금', async () => {
    await search([row()]);

    act(() => {
      options()[0]!.click();
    });
    // 종목이 정해지면 폼이 열린다(계좌는 단일 계좌가 자동 선택된다).
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: '매수주문 켜기' })).toBeInTheDocument(),
    );

    act(() => {
      screen.getByRole('switch', { name: '매수주문 켜기' }).click();
    });

    const sent = sendMock.mock.calls
      .map(([m]) => m as { t?: string; cfg?: Record<string, unknown> })
      .filter((m) => m?.t === 'lc.set');
    expect(sent.length).toBeGreaterThan(0);
    for (const { cfg } of sent) {
      expect('market' in (cfg as object)).toBe(false);
      expect(cfg?.isin).toBe(ISIN);
    }
  });
});

/*
  260911-w5h — **헤더 카드 계약**.

  종전 헤더는 종목명·현재가·거래소 토글·계좌 행만 보여 줬고, 한 번 고른 종목을 되돌릴
  경로가 **없었다**(`isin === ''` 일 때만 검색창이 떴다). 새 헤더는 그 경로를 열고, 이미
  구독으로 오는 `RelayQuote` 프레임에서 종목정보 8칸을 뽑는다.

  ★ 이 describe 가 잠그는 핵심 둘:
    ① **되돌릴 경로가 있다** — 종목명 버튼 → 검색 → 재선택 왕복.
    ② **새 조회 경로가 0개다** — 8칸의 값이 전부 `quote` 한 프레임에서 나오고, 모르면 대시다.
*/
describe('⑰ 헤더 카드 — 계좌 칩 · 거래소 콤보 · 종목 트리거 · 종목정보 8칸 (260911-w5h)', () => {
  /** 이미 구독으로 오는 프레임 하나. 여기 없는 값은 화면 어디에도 없어야 한다. */
  function quote(over: Record<string, unknown> = {}) {
    return {
      t: 'quote' as const,
      i: ISIN,
      p: 130_000,
      cr: 12.34,
      base: 116_000,
      o: 118_000,
      h: 131_000,
      l: 115_000,
      ul: 150_800,
      ll: 81_200,
      viu: 127_600,
      ls: 72_800_200,
      // 사다리도 같은 프레임을 읽는다 — 10단 배열이 없으면 `buildLadderRows` 가 터진다.
      ap: Array.from({ length: 10 }, (_, i) => 130_500 + i * 500),
      aq: Array.from({ length: 10 }, () => 100),
      bp: Array.from({ length: 10 }, (_, i) => 130_000 - i * 500),
      bq: Array.from({ length: 10 }, () => 100),
      ...over,
    };
  }

  const cells = () =>
    Array.from(document.querySelectorAll('[data-slot="lc-quote-grid"] > div'));
  const cellText = () =>
    cells().map((el) => Array.from(el.children).map((c) => c.textContent));

  function renderEdit(over: Record<string, unknown> = {}) {
    setRelay({ limitChasers: [echo()], ...over });
    return render(<LimitChaserClient strategyKey={KEY} />);
  }

  it('계좌 칩이 접근성 이름을 갖고 계좌번호를 **마스킹 없이 전체** 보여준다 (D2 · S-5)', () => {
    renderEdit();

    const sel = screen.getByLabelText('계좌') as HTMLSelectElement;
    expect(sel.tagName).toBe('SELECT');
    expect(within(sel).getByRole('option', { name: `${ACCOUNT} · KB 위탁종합` })).toBeInTheDocument();
    // 앞자리가 같은 두 계좌를 구분할 수 없게 되는 쪽이 더 위험하다 — 마스킹하지 않는다.
    expect(sel.textContent).toContain(ACCOUNT);
  });

  it('거래소는 1단 네이티브 콤보이고 2버튼 토글이 아니다', () => {
    renderEdit();

    const sel = screen.getByLabelText('거래소') as HTMLSelectElement;
    expect(sel.tagName).toBe('SELECT');
    expect(Array.from(sel.options).map((o) => o.value)).toEqual(['KRX', 'NXT']);
    // 옛 `role="group"` 2버튼 토글은 없다.
    expect(screen.queryByRole('group', { name: '거래소 선택' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'NXT' })).toBeNull();
  });

  it('★ 종목명 버튼 → 검색 → 재선택 왕복 — 한 번 고른 종목을 되돌릴 경로가 있다', async () => {
    searchMock.mockResolvedValue([
      {
        code: '000660',
        name: 'SK하이닉스',
        market: 'KOSPI',
        isin: 'KR7000660001',
        price: 200_000,
        changeAmount: 1_000,
        changeRate: 0.5,
        volume: 1,
        tradeAmount: 1,
        open: 1,
        high: 1,
        low: 1,
        marketCap: 0,
        upperLimit: 260_000,
        lowerLimit: 140_000,
        updatedAt: '2026-09-09T02:00:00Z',
        upperLimitProximity: 1,
      },
    ]);
    // 신규 진입이라야 종목을 바꿀 수 있다(편집은 키의 일부라 잠긴다).
    setRelay({});
    render(<LimitChaserClient />);

    // ① 처음에는 검색창이다 — 고르면 버튼이 된다.
    fireEvent.change(screen.getByLabelText('종목 검색'), { target: { value: 'SK' } });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    await waitFor(() =>
      expect(document.querySelectorAll('[data-slot="lc-search-option"]')).toHaveLength(1),
    );
    fireEvent.click(document.querySelector('[data-slot="lc-search-option"]') as HTMLButtonElement);

    const trigger = document.querySelector('[data-slot="lc-stock-trigger"]') as HTMLButtonElement;
    expect(trigger).not.toBeNull();
    expect(trigger).toHaveTextContent('SK하이닉스');
    expect(trigger).toHaveTextContent('000660');
    // ★ 보이는 글자가 접근성 이름에 남는다(WCAG 2.5.3) + 「무엇이 되는가」를 덧붙인다.
    expect(trigger).toHaveAccessibleName(expect.stringContaining('SK하이닉스'));
    expect(trigger).toHaveAccessibleName(expect.stringContaining('종목 변경'));
    expect(screen.queryByLabelText('종목 검색')).toBeNull();

    // ② 버튼을 누르면 그 자리가 다시 검색창이 된다 — **이것이 이 변경의 핵심이다.**
    fireEvent.click(trigger);
    expect(screen.getByLabelText('종목 검색')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="lc-stock-trigger"]')).toBeNull();
  });

  it('종목정보가 2열 4행 8칸이고 라벨 순서가 고정이다', () => {
    renderEdit({ quote: quote() });

    expect(cells()).toHaveLength(8);
    expect(cellText().map(([label]) => label)).toEqual([
      '시가',
      '고가',
      '저가',
      '상승VI',
      '상한',
      '하한',
      '시총',
      '발행1%',
    ]);
  });

  it('`quote` 가 없으면 8칸이 전부 대시다 — 0 을 그리지 않는다 (T-w5h-04)', () => {
    renderEdit({ quote: null });

    expect(cellText().map(([, value]) => value)).toEqual(Array(8).fill('—'));
  });

  it('`quote` 가 있으면 8칸이 그 프레임 하나에서 나온다 — 새 조회 경로가 0개다', () => {
    renderEdit({ quote: quote() });

    expect(cellText().map(([, value]) => value)).toEqual([
      '118,000', // o
      '131,000', // h
      '115,000', // l
      '127,600', // viu
      '150,800', // ul
      '81,200', // ll
      // 시총 = p × ls = 130,000 × 72,800,200 = 9,464조 …
      formatMarketCap(130_000, 72_800_200),
      formatOnePercentShares(72_800_200),
    ]);
  });

  it('색: 시·고·저는 기준가 대비 방향색, 상한·상승VI 는 up, 하한은 down, 시총은 중립', () => {
    // base = 116,000 → o(118,000) 위 · h(131,000) 위 · l(115,000) 아래
    renderEdit({ quote: quote() });

    const tone = (i: number) => cells()[i]!.children[1]!.className;
    expect(tone(0)).toContain('text-[var(--up)]'); // 시가
    expect(tone(1)).toContain('text-[var(--up)]'); // 고가
    expect(tone(2)).toContain('text-[var(--down)]'); // 저가
    expect(tone(3)).toContain('text-[var(--up)]'); // 상승VI — 언제나 위쪽 사건이다
    expect(tone(4)).toContain('text-[var(--up)]'); // 상한
    expect(tone(5)).toContain('text-[var(--down)]'); // 하한
    expect(tone(6)).toContain('text-[var(--fg)]'); // 시총 — 방향이 없다
    expect(tone(7)).toContain('text-[var(--fg)]'); // 발행1%
  });

  it('가격 칩은 기준가 · 호가단위 2개뿐이다 — 상한·하한은 8칸이 이미 갖는다', () => {
    renderEdit({ quote: quote() });

    const chips = document.querySelector('[data-slot="lc-price-chips"]')!;
    expect(chips.children).toHaveLength(2);
    expect(chips.textContent).toContain('기준가');
    expect(chips.textContent).toContain('호가단위');
    expect(chips.textContent).not.toContain('상한가');
    expect(chips.textContent).not.toContain('하한가');
  });

  it('카드 하단 회색 바(거래소·계좌·종목변경)가 없다 — 별도 「종목 변경」 버튼도 없다', () => {
    renderEdit({ quote: quote() });

    expect(screen.queryByRole('button', { name: '종목 변경' })).toBeNull();
  });
});
