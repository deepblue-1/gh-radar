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
  it('④ 신규 진입은 제목·부제가 UI-SPEC verbatim 이고 가격 칩 행을 그리지 않는다 (A1)', () => {
    render(<LimitChaserClient />);

    expect(screen.getByRole('heading', { name: '상따' })).toBeInTheDocument();
    expect(
      screen.getByText('종목을 고르면 아래 값이 상한가 기준으로 채워져요'),
    ).toBeInTheDocument();
    // 종목이 없으면 칩 자체가 없다 — 「상한가 —」 같은 빈 칩을 그리지 않는다.
    expect(document.querySelector('[data-slot="lc-price-chips"]')).toBeNull();
    expect(screen.getByLabelText('종목 검색')).toBeInTheDocument();
    // 자리표시가 걷혔다(16-11 인계).
    expect(document.querySelector('[data-slot="surface-placeholder"]')).toBeNull();
    expect(document.querySelector('[data-slot="limit-chaser-page"]')).not.toBeNull();
  });

  it('⑤ 편집 진입은 제목이 `{종목명} · {거래소}`, 부제가 전략키이고 거래소·계좌가 잠긴다', () => {
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

    expect(screen.getByRole('heading', { name: '에코프로 · KRX' })).toBeInTheDocument();
    expect(screen.getByText(KEY)).toBeInTheDocument();
    // 거래소·계좌는 전략 키의 일부다 — 바꾸면 다른 전략이 되므로 여기서 못 바꾼다.
    expect(screen.getByRole('button', { name: 'NXT' })).toBeDisabled();
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
    // ★ 계좌 셀렉터가 두 벌이면 「지금 어느 계좌인가」가 갈린다 — 상단 카드 것 하나뿐이다.
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
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
