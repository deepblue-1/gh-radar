import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { RelayLimitChaser } from '@gh-radar/shared';

/**
 * 작업대 전략 카드 1장의 **흐름** — 전송 ↔ 에코 상관 · 서버 통지 · LED 전송 규율 · 철거 에코 (18-13 이관).
 *
 * ★ 이 파일은 옛 상따 화면 단위 테스트(18-13 에서 옛 화면과 함께 삭제)가 덮던 단언 중
 *   **카드 상태 훅(`useStrategyCardState`)의 규율**을 그대로 옮긴 것이다. 옛 화면과 카드는 18-06
 *   부터 같은 훅을 썼으므로 규율 자체는 바뀌지 않았고, 바뀐 것은 **그 결과가 서는 자리**다:
 *     · 상태줄의 에코 배너·「미반영」 → 카드 인라인 고지(`card-echo-banner` · `card-unacked`)
 *     · 상태줄의 래치 LED → 카드 헤더 LED(같은 `LatchLed`)
 *     · 상태줄의 서버 거부 → 카드 인라인 `role="alert"`(`card-server-error`) — 18-13 에서 **되살렸다**
 *       (훅은 `lastError` 를 계산하고 있었지만 카드가 그리지 않아 거부가 로그 탭에만 조용히 쌓였다)
 *   옮긴 목록과 이어받은 자리의 대조표는 18-13 SUMMARY 에 있다.
 *
 * 카드는 작업대와 같은 조립으로 렌더한다 — `StrategyCard` + `CardBody variant="card"`(폼·사다리) +
 * 그 카드의 로그(`StrategyLog`). 작업대는 로그를 공용 패널로 합칠 뿐 판정·생성은 카드 훅 하나다.
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

import { CardBody } from '../card/card-body';
import {
  ACK_TIMEOUT_MS,
  ECHO_BANNER_MS,
  StrategyCard,
  strategyStatusOf,
} from '../card/strategy-card';
import { StrategyLog, TRANSITION_TEXT, marketCloseDisabledLogLine } from '../strategy-log';

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
    cancelEntryLatched: false,
    buyEntryLatched: false,
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

/** 구독으로 오는 호가 1프레임 — 가격 5칸이 상한가로 시딩되어야 스위치를 켤 수 있다. */
function quote(over: Record<string, unknown> = {}) {
  return {
    t: 'q' as const,
    i: ISIN,
    x: 'KRX',
    snap: true,
    p: 130_000,
    o: 120_000,
    h: 131_000,
    l: 119_000,
    c: 14_000,
    cs: '2',
    cr: 12.07,
    v: 1_000,
    va: 130_000_000,
    ta: 0,
    tb: 0,
    viu: 0,
    vid: 0,
    kc: 0,
    ls: 0,
    et: '093000000000',
    base: 116_000,
    ul: 150_800,
    ll: 81_200,
    ap: Array.from({ length: 10 }, (_, i) => 130_500 + i * 500),
    aq: Array.from({ length: 10 }, () => 100),
    bp: Array.from({ length: 10 }, (_, i) => 130_000 - i * 500),
    bq: Array.from({ length: 10 }, () => 100),
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

const noop = () => {};

/** 작업대 `WorkbenchCardItem` 과 같은 조립 + 그 카드의 로그. */
function Card() {
  return (
    <StrategyCard
      cardId="wb-card-1"
      isin={ISIN}
      accountNo={ACCOUNT}
      exchange="KRX"
      name="에코프로"
      code="086520"
      open
      onToggle={noop}
      onClose={noop}
      onExchangeChange={noop}
      body={(s) => (
        <>
          <CardBody
            variant="card"
            card={s}
            isin={ISIN}
            accountNo={ACCOUNT}
            exchange="KRX"
            name="에코프로"
            code="086520"
            status="ready"
            queuedWindow={undefined}
            selectedUnfilled={null}
            onClearSelection={noop}
          />
          <StrategyLog entries={s.log} />
        </>
      )}
    />
  );
}

const logRows = () => document.querySelectorAll('[data-slot="strategy-log-row"]');
/** 값 행의 표시 글자(「10,000주」) — Phase 20 토스식 리스트는 값을 입력칸이 아니라 행이 보여 준다. */
const rowValue = (id: string): string | null =>
  document.querySelector(`[data-lc-field="${id}"] [data-slot="lc-row-value"]`)?.textContent ?? null;
/** 행을 눌러 인라인 편집기를 연다(마우스 기기 · D-14) — 입력 id 는 옛 입력 id 그대로다. */
function openInline(id: string): HTMLInputElement {
  const row = document.querySelector<HTMLElement>(`[data-lc-field="${id}"]`);
  expect(row, `값 행 ${id}`).not.toBeNull();
  act(() => {
    fireEvent.click(row!);
  });
  const input = document.querySelector<HTMLInputElement>(`#${id}`);
  expect(input, `인라인 입력 ${id}`).not.toBeNull();
  return input!;
}
/** 인라인 편집으로 한 필드를 확정한다 — 행 클릭 → 입력 → Enter(한 필드 = 전송 1회, D-04). */
function editInline(id: string, value: string): HTMLInputElement {
  const input = openInline(id);
  act(() => {
    fireEvent.change(input, { target: { value } });
  });
  act(() => {
    fireEvent.keyDown(input, { key: 'Enter' });
  });
  return input;
}
const INLINE_FAILED = '반영하지 못했어요 · Enter 로 다시 시도해 주세요';
const banner = () => document.querySelector('[data-slot="card-echo-banner"]');
const unacked = () => document.querySelector('[data-slot="card-unacked"]');
const serverError = () => document.querySelector<HTMLElement>('[data-slot="card-server-error"]');
const header = () => document.querySelector('[data-slot="card-header"]') as HTMLElement;
const leds = (): HTMLElement[] => Array.from(header().querySelectorAll('[data-slot="latch-led"]'));
const led = (kind: 'buy' | 'sell' | 'cancel'): HTMLElement =>
  header().querySelector(`[data-slot="latch-led"][data-kind="${kind}"]`) as HTMLElement;
const lcSets = () =>
  sendMock.mock.calls
    .map(([m]) => m as { t?: string; cfg?: Record<string, unknown> })
    .filter((m) => m?.t === 'lc.set');

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockReturnValue(true);
  setRelay({});
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('strategyStatusOf (옛 ②·③)', () => {
  it('② 배지 매핑(16-11)을 그대로 그룹 헤더 문구로 옮긴다 — 판정을 다시 쓰지 않는다', () => {
    expect(strategyStatusOf(null, false)).toEqual({ buyText: '', sellText: '' });
    expect(strategyStatusOf(echo({ buyEnabled: true }), false)).toEqual({
      buyText: '무장',
      sellText: '',
    });
    expect(
      strategyStatusOf(echo({ buyEnabled: false, sellEnabled: true }), false),
    ).toMatchObject({ sellText: '대기 (지지벽 미관측)' });
    expect(
      strategyStatusOf(echo({ buyEnabled: false, sellEnabled: true, sellEntryLatched: true }), false),
    ).toMatchObject({ sellText: '감시 중' });
    // 상태줄 값 4종은 계약에서 빠졌다(17-11) — 남아 있으면 두 번째 무장 표기가 되살아난다.
    for (const gone of ['buyLabel', 'sellLabel', 'buyTone', 'sellTone']) {
      expect(strategyStatusOf(echo(), true)).not.toHaveProperty(gone);
    }
  });

  it('③ ★ `hadOrder` 없이는 「발주됨」을 만들지 않는다 (Pitfall 10)', () => {
    expect(strategyStatusOf(echo({ buyEnabled: false }), false).buyText).toBe('');
    expect(strategyStatusOf(echo({ buyEnabled: false }), true).buyText).toBe('발주 완료 · 무장 해제');
  });
});

describe('전송 ↔ 에코 상관 (옛 ⑥ ~ ⑧ · ⑪ · ⑬)', () => {
  it('⑥ ★ 내가 보낸 요청의 에코에는 「다른 단말」 배너를 띄우지 않는다', async () => {
    setRelay({ limitChasers: [echo()] });
    const { rerender } = render(<Card />);

    act(() => {
      screen.getByRole('switch', { name: '매수주문 켜기' }).click();
    });
    expect(sendMock).toHaveBeenCalledTimes(1);

    setRelay({ limitChasers: [echo({ buyEnabled: false })] });
    rerender(<Card />);

    await waitFor(() => expect(logRows().length).toBeGreaterThan(0));
    expect(banner()).toBeNull();
    // 내가 껐으므로 「발주」가 아니다 — 로그 문구가 그 둘을 가른다.
    expect(screen.getByText(/매수 무장 해제/)).toBeInTheDocument();
    expect(screen.queryByText(/매수 발주/)).toBeNull();
  });

  it('⑦ ★ 보낸 적 없는 에코 = 다른 단말 변경 → 6초 배너(role=status) + 로그 1줄, 배너만 사라진다 (D-11)', async () => {
    setRelay({ limitChasers: [echo()] });
    const { rerender } = render(<Card />);

    setRelay({ limitChasers: [echo({ buyWatchQty: 8_000 })] });
    rerender(<Card />);

    const el = await waitFor(() => {
      expect(banner()).not.toBeNull();
      return banner() as HTMLElement;
    });
    expect(el).toHaveAttribute('role', 'status');
    expect(el.textContent).toBe('다른 단말에서 변경됐어요 · 서버 값으로 맞췄어요');
    const has = () =>
      Array.from(logRows()).some((r) => r.textContent?.includes('다른 단말에서 변경됐어요'));
    expect(has()).toBe(true);

    act(() => {
      vi.advanceTimersByTime(ECHO_BANNER_MS);
    });
    expect(banner()).toBeNull();
    expect(has()).toBe(true);
  });

  it('⑦b ★ 인라인 편집 중 다른 단말 에코 → 입력 8,000 유지 · 배너는 「서버 값으로 맞췄어요」 · Esc 뒤 행 = 에코 5,000주 (D-04 · UI-SPEC E4 partial)', async () => {
    setRelay({ limitChasers: [echo()] });
    const { rerender } = render(<Card />);

    // 더티 누적이 없다(D-04) — 편집 중인 버퍼는 폼 값이 아니라 편집기의 것이라 「덮인 더티」도 없다.
    const input = openInline('lc-buy-watch-qty');
    act(() => {
      fireEvent.change(input, { target: { value: '8000' } });
    });
    expect(input).toHaveValue('8,000');

    setRelay({ limitChasers: [echo({ buyWatchQty: 5_000 })] });
    rerender(<Card />);

    const el = await waitFor(() => {
      expect(banner()).not.toBeNull();
      return banner() as HTMLElement;
    });
    expect(el.textContent).toBe('다른 단말에서 변경됐어요 · 서버 값으로 맞췄어요');
    // 편집 중인 입력은 에코가 덮지 않는다(E4 partial).
    expect(document.querySelector<HTMLInputElement>('#lc-buy-watch-qty')).toHaveValue('8,000');

    act(() => {
      fireEvent.keyDown(document.querySelector('#lc-buy-watch-qty')!, { key: 'Escape' });
    });
    expect(document.querySelector('#lc-buy-watch-qty')).toBeNull();
    expect(rowValue('lc-buy-watch-qty')).toBe('5,000주');
    expect(lcSets()).toHaveLength(0);
  });

  it('⑧ ★ 3초 무응답이면 「미반영」이 서고 아무것도 다시 보내지 않는다 (T-16-10)', () => {
    setRelay({ limitChasers: [echo()] });
    render(<Card />);

    act(() => {
      screen.getByRole('switch', { name: '매수주문 켜기' }).click();
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(unacked()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS);
    });
    expect(unacked()?.textContent).toContain('미반영');

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('⑪ 삭제 에코 → 폼이 빈 상태(기본값)로 돌아가고 로그에 삭제가 남는다 (D-08)', async () => {
    setRelay({ limitChasers: [echo({ buyWatchQty: 8_000 })] });
    const { rerender } = render(<Card />);
    expect(rowValue('lc-buy-watch-qty')).toBe('8,000주');

    setRelay({ limitChasers: [] });
    rerender(<Card />);

    await waitFor(() => expect(rowValue('lc-buy-watch-qty')).toBe('10,000주'));
    expect(screen.getByText(/전략이 삭제됐어요/)).toBeInTheDocument();
  });

  it('⑬ 15:40 서버 자동 비활성화가 로그 1줄로 남는다', async () => {
    setRelay({ limitChasers: [echo()] });
    const { rerender } = render(<Card />);

    setRelay({
      limitChasers: [echo()],
      strategiesDisabled: { t: 'strategies.disabled', lc: 3, vi: 1 },
    });
    rerender(<Card />);

    // ★ quick-260926-nr2 — 65 는 전부 정지 집계 응답이다. 「장 마감 규칙」이라고 말하지 않는다.
    expect(
      await screen.findByText('전부 정지가 반영됐어요 · 서버가 모든 전략을 비활성화했어요'),
    ).toBeInTheDocument();
  });

  it('⑭b ★ 더티 액션 바가 없다 — 값 확정·에코 뒤에도 카드 안 `card-dirty-host` 가 비어 있고 테두리가 파래지지 않는다 (Phase 20 D-04 · 옛 목업 B 대체)', () => {
    // 무장 가능한 전략이어야 값 확정이 나간다 — 기본 에코(10만원 / 130,000원 = 0주)는 켜진 매수 게이트를
    // 무장할 수 없어 전송 직전 가드(`armBlockOf`)가 막는다.
    setRelay({ limitChasers: [echo({ buyOrderAmount: 100 })] });
    const { rerender } = render(<Card />);
    const card = document.querySelector('[data-slot="strategy-card"]') as HTMLElement;
    expect(card.className).toContain('@container/lc');
    const host = card.querySelector('[data-slot="card-dirty-host"]') as HTMLElement;
    expect(host).not.toBeNull(); // 워크벤치 배관(자리)은 그대로다 — 폼이 더티 수를 보내지 않아 비어 있을 뿐이다.

    editInline('lc-buy-watch-qty', '8000');
    expect(lcSets()).toHaveLength(1);
    expect(document.querySelector('[data-slot="dirty-action-bar"]')).toBeNull();
    expect(host.childElementCount).toBe(0);
    expect(card.className).not.toContain('var(--primary)_55%');

    setRelay({ limitChasers: [echo({ buyOrderAmount: 100, buyWatchQty: 8_000 })] });
    rerender(<Card />);
    expect(rowValue('lc-buy-watch-qty')).toBe('8,000주');
    expect(document.querySelector('[data-slot="dirty-action-bar"]')).toBeNull();
    expect(host.childElementCount).toBe(0);
    expect(card.className).not.toContain('var(--primary)_55%');
  });
});

describe('서버 통지 — 카드 인라인 경보 + 로그 (옛 ⑨ · ⑩ · ⑳)', () => {
  it('⑨ ★ 서버 거부(ERROR)가 카드 인라인 `role="alert"` 와 로그 **양쪽**에 남는다 (T-16-07)', async () => {
    setRelay({
      limitChasers: [echo()],
      messages: [msg({ lv: 'ERROR', src: 'SetLimitChaser', m: '허용되지 않은 거래소입니다', i: ISIN })],
    });
    render(<Card />);

    const el = await waitFor(() => {
      expect(serverError()).not.toBeNull();
      return serverError()!;
    });
    expect(el).toHaveAttribute('role', 'alert');
    expect(el.textContent).toContain('허용되지 않은 거래소입니다');

    const rows = Array.from(logRows());
    expect(rows.some((r) => r.textContent?.includes('허용되지 않은 거래소입니다'))).toBe(true);
    expect(rows.some((r) => (r as HTMLElement).dataset.level === 'error')).toBe(true);
  });

  it('⑩ ★ 종목 없는 Account 통지(=VI 몫)는 카드가 먹지 않는다 (Pitfall 9)', async () => {
    setRelay({
      limitChasers: [echo()],
      messages: [msg({ lv: 'ERROR', src: 'Account', i: '', m: 'VI 주문금액이 0 입니다' })],
    });
    render(<Card />);

    await waitFor(() => expect(document.querySelector('[data-slot="strategy-log"]')).not.toBeNull());
    expect(serverError()).toBeNull();
    expect(screen.queryByText(/VI 주문금액이 0 입니다/)).toBeNull();
    const rows = Array.from(logRows());
    expect(rows.some((r) => (r as HTMLElement).dataset.level === 'error')).toBe(false);
  });

  it('⑳-1 `LimitChaser` 런타임 사유 줄이 카드 경보·로그 **양쪽**에 뜨고 `[상따]` 가 붙는다', async () => {
    setRelay({
      limitChasers: [echo()],
      messages: [
        msg({
          lv: 'ERROR',
          src: 'LimitChaser',
          i: ISIN,
          m: '매도 무장이 꺼져 있습니다 — 매도 감시를 먼저 켜세요',
        }),
      ],
    });
    render(<Card />);

    const el = await waitFor(() => {
      expect(serverError()).not.toBeNull();
      return serverError()!;
    });
    expect(el.querySelector('[data-slot="card-server-error-src"]')?.textContent).toBe('[상따]');
    expect(el.textContent).toContain('매도 무장이 꺼져 있습니다');

    const sentences = Array.from(logRows()).map(
      (r) => r.querySelectorAll('span')[1]?.textContent ?? '',
    );
    expect(sentences.some((s) => s.startsWith('[상따] 서버가 거부했어요 —'))).toBe(true);
  });

  it('⑳-2 등록 거부(`SetLimitChaser`)는 `[서버]` 다 — 어휘를 모르면 모른다고 말한다', async () => {
    setRelay({
      limitChasers: [echo()],
      messages: [msg({ lv: 'ERROR', src: 'SetLimitChaser', i: ISIN, m: '허용되지 않은 거래소입니다' })],
    });
    render(<Card />);

    const el = await waitFor(() => {
      expect(serverError()).not.toBeNull();
      return serverError()!;
    });
    expect(el.querySelector('[data-slot="card-server-error-src"]')?.textContent).toBe('[서버]');
  });
});

describe('헤더 래치 LED → `lc.arm` 전송 규율 (옛 ⑲)', () => {
  it('⑲-1 LED 3개가 헤더에 매수 · 매도 · 취소 순서로 있다 (D-22)', () => {
    setRelay({ limitChasers: [echo()] });
    render(<Card />);
    expect(leds().map((el) => el.dataset.kind)).toEqual(['buy', 'sell', 'cancel']);
  });

  it('⑲-3 ★ 서버 전략이 없으면 세 LED 가 전부 회색 span 이고 클릭해도 아무것도 나가지 않는다', () => {
    setRelay({ limitChasers: [] });
    render(<Card />);
    expect(leds()).toHaveLength(3);
    for (const el of leds()) {
      expect(el.dataset.tone).toBe('off');
      expect(el.tagName).toBe('SPAN');
      fireEvent.click(el);
    }
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('⑲-4 매도 LED 클릭 → `{t:"lc.arm", key, latch:"sell"}` 1건 · 확인 다이얼로그 없음 (D-20)', () => {
    setRelay({ limitChasers: [echo({ sellEnabled: true })] });
    render(<Card />);
    fireEvent.click(led('sell'));
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith({ t: 'lc.arm', key: KEY, latch: 'sell' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('⑲-5 취소 LED → `latch:"cancel"` · 매수 LED(매수잔량 기준) → `latch:"buy"`', () => {
    setRelay({
      limitChasers: [echo({ cancelQtyEnabled: true, buyEnabled: true, buyWatchSide: '1' })],
    });
    render(<Card />);
    fireEvent.click(led('cancel'));
    expect(sendMock).toHaveBeenLastCalledWith({ t: 'lc.arm', key: KEY, latch: 'cancel' });
    fireEvent.click(led('buy'));
    expect(sendMock).toHaveBeenLastCalledWith({ t: 'lc.arm', key: KEY, latch: 'buy' });
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it('⑲-6 ★ 회색 LED 클릭 → `send` 미호출 (T-17-37)', () => {
    setRelay({
      limitChasers: [
        echo({ buyEnabled: false, sellEnabled: false, cancelQtyEnabled: false, cancelTradeEnabled: false }),
      ],
    });
    render(<Card />);
    for (const el of leds()) {
      expect(el.dataset.tone).toBe('off');
      fireEvent.click(el);
    }
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('⑲-7 ★ 매도잔량 기준(`buyWatchSide "0"`) 매수 LED 는 초록이지만 클릭 → `send` 미호출 (BL-01)', () => {
    setRelay({ limitChasers: [echo({ buyEnabled: true, buyWatchSide: '0' })] });
    render(<Card />);
    const buy = led('buy');
    expect(buy.dataset.tone).toBe('armed');
    expect(buy.tagName).toBe('SPAN');
    fireEvent.click(buy);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('⑲-8 ★ 연타는 클릭 수만큼 나가고, `send` 가 false 를 돌려줘도 재시도하지 않는다 (T-17-40)', () => {
    setRelay({ limitChasers: [echo({ sellEnabled: true })] });
    render(<Card />);
    fireEvent.click(led('sell'));
    fireEvent.click(led('sell'));
    fireEvent.click(led('sell'));
    expect(sendMock).toHaveBeenCalledTimes(3);

    sendMock.mockReset();
    sendMock.mockReturnValue(false);
    fireEvent.click(led('sell'));
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('⑲-9 무장 해제가 발주였어도 매수 LED 는 「OFF」 만 — 「(발주됨)」 보조 문구 없음 (2026-09-23)', async () => {
    setRelay({ limitChasers: [echo({ buyEnabled: true, buyWatchSide: '1' })] });
    const { rerender } = render(<Card />);
    setRelay({ limitChasers: [echo({ buyEnabled: false, buyWatchSide: '1' })] });
    rerender(<Card />);
    await waitFor(() => expect(led('buy').dataset.tone).toBe('off'));
    expect(led('buy').textContent).toContain('OFF');
    expect(led('buy').textContent).not.toContain('발주됨');
  });
});

/**
 * 옛 ㉑ — **미등록 전략의 철거 에코 = 서버의 답** (debug `lc-unacked-stuck-new-route`).
 * 「무엇이 등록돼 있는가」(`limitChasers`)와 「서버가 답했는가」(60 에코 스트림 · 거부 통지)는 다른
 * 질문이다. 재전송을 만들지 않는다(T-16-10) — 전송 건수가 늘지 않는 것을 함께 단언한다.
 */
describe('철거 에코 · 거부 = 서버의 답 (옛 ㉑)', () => {
  const buySwitch = () => screen.getByRole('switch', { name: '매수주문 켜기' });
  const cfgOf = (nth: number) => lcSets()[nth]!.cfg as Record<string, unknown>;

  /**
   * 미등록 카드에서 매수를 켠다 → 서버가 답하지 않아 3초 뒤 「미반영」 → 다시 누른다(2회째 전송).
   *
   * ★ Phase 20 — 주문금액은 인라인 확정이고 미등록 전략이라 **전송 0 · 로컬 반영**이다(A-P1). 등록은
   *   스위치만 하므로 첫 스위치 cfg 에 그 로컬 금액이 실린다.
   * ★ 옛 흐름(켰다 → 무응답 → 끔 = `crud "D"`)은 D-04 상태 기계에서 성립하지 않는다 — 무응답 실패는
   *   스위치를 **서버 값**(미등록 = 꺼짐)으로 되돌리므로(UI-SPEC E2 error) 두 번째 누름은 다시 켜기다.
   *   이 describe 가 잠그는 것은 「서버의 답(철거 에코 · 거부)이 미반영을 거둔다」는 카드 규율이고,
   *   두 번째 요청이 무엇이든 그 답을 기다리는 대상이다.
   */
  function armThenDisarm(): void {
    editInline('lc-buy-order-amount', '100');
    expect(lcSets()).toHaveLength(0);
    expect(rowValue('lc-buy-order-amount')).toBe('100만원');
    act(() => {
      buySwitch().click();
    });
    expect(lcSets()).toHaveLength(1);
    expect(cfgOf(0).buyEnabled).toBe(true);
    expect(cfgOf(0).buyOrderAmount).toBe(100);
    act(() => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS);
    });
    expect(unacked()).not.toBeNull();
    // 무응답 — 스위치가 서버 값(꺼짐)으로 돌아간다. 자동 재전송은 없다(T-16-10).
    expect(buySwitch()).toHaveAttribute('aria-checked', 'false');
    expect(lcSets()).toHaveLength(1);
    act(() => {
      buySwitch().click();
    });
    expect(lcSets()).toHaveLength(2);
    expect(cfgOf(1).buyOrderAmount).toBe(100);
  }

  it('㉑-a ★ 목록을 바꾸지 못하는 철거 에코도 「미반영」을 거둔다 — 서버는 답했다', () => {
    setRelay({ limitChasers: [], quote: quote() });
    const { rerender } = render(<Card />);
    armThenDisarm();

    setRelay({ limitChasers: [], quote: quote(), lastLimitChaserEcho: echo({ crud: 'D' }) });
    rerender(<Card />);
    act(() => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS * 3);
    });
    expect(unacked()).toBeNull();
    expect(lcSets()).toHaveLength(2);
  });

  it('㉑-b 다른 전략 키의 철거 에코는 이 카드의 「미반영」을 거두지 않는다', () => {
    setRelay({ limitChasers: [], quote: quote() });
    const { rerender } = render(<Card />);
    armThenDisarm();

    const otherKey = `KR7005930003:${ACCOUNT}:KRX`;
    setRelay({
      limitChasers: [],
      quote: quote(),
      lastLimitChaserEcho: echo({ crud: 'D', isin: 'KR7005930003', key: otherKey }),
    });
    rerender(<Card />);
    act(() => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS * 3);
    });
    expect(unacked()).not.toBeNull();
  });

  it('㉑-c ★ 서버가 거부로 답해도 「미반영」은 거둬지고 사유가 원문 그대로 선다', async () => {
    setRelay({ limitChasers: [], quote: quote() });
    const { rerender } = render(<Card />);
    armThenDisarm();

    setRelay({
      limitChasers: [],
      quote: quote(),
      messages: [
        msg({
          lv: 'ERROR',
          src: 'SetLimitChaser',
          m: '매수 설정이 불완전합니다(주문가/수량/감시가 0) — 매수를 켜지 않았습니다',
          i: ISIN,
          a: ACCOUNT,
        }),
      ],
    });
    rerender(<Card />);

    const el = await waitFor(() => {
      expect(serverError()).not.toBeNull();
      return serverError()!;
    });
    expect(el.textContent).toContain('매수 설정이 불완전합니다');
    act(() => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS * 3);
    });
    expect(unacked()).toBeNull();
  });

  it('㉑-d 다른 계좌의 상따 거부는 문구는 서도 「미반영」을 거두지 않는다 — 전략 키는 두 축이다', async () => {
    setRelay({ limitChasers: [], quote: quote() });
    const { rerender } = render(<Card />);
    armThenDisarm();

    setRelay({
      limitChasers: [],
      quote: quote(),
      messages: [msg({ lv: 'ERROR', src: 'SetLimitChaser', m: '다른 계좌의 거부', i: ISIN, a: '99999999999' })],
    });
    rerender(<Card />);
    await waitFor(() => expect(serverError()).not.toBeNull());
    act(() => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS * 3);
    });
    expect(unacked()).not.toBeNull();
  });

  it('㉑-e ★ 거부 답이 인라인 「반영 중」 잠금을 푼다 — 입력값 8,000 보존 · 「반영하지 못했어요 · Enter 로 다시 시도해 주세요」 (옛 「수정」 잠금 해제 재정의)', async () => {
    // 두 setRelay 가 같은 배열·객체를 넘긴다 — 새로 만들면 server 가 바뀌어 다른 경로로 풀린다.
    const chasers = [echo({ buyOrderAmount: 100 })];
    const q = quote();
    setRelay({ limitChasers: chasers, quote: q });
    const { rerender } = render(<Card />);

    editInline('lc-buy-watch-qty', '8000');
    expect(lcSets()).toHaveLength(1);
    const input = () => document.querySelector<HTMLInputElement>('#lc-buy-watch-qty');
    expect(input()!.readOnly).toBe(true);
    expect(input()!.getAttribute('aria-busy')).toBe('true');

    setRelay({
      limitChasers: chasers,
      quote: q,
      messages: [msg({ lv: 'ERROR', src: 'SetLimitChaser', m: '매수 설정이 불완전합니다', i: ISIN, a: ACCOUNT })],
    });
    rerender(<Card />);

    await waitFor(() => expect(input()!.readOnly).toBe(false));
    // 사용자가 고치던 값은 그대로 남는다 — 잠금을 푸는 것과 값을 덮는 것은 다른 일이다.
    expect(input()).toHaveValue('8,000');
    expect(screen.getByText(INLINE_FAILED).closest('[role="alert"]')).not.toBeNull();
    // 행 표시값은 여전히 서버 값이다(D-06) · 재전송 없음(T-16-10).
    act(() => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS * 3);
    });
    expect(lcSets()).toHaveLength(1);
  });
});

/**
 * quick-260926-nr2 — 에코를 **누가 보냈나**가 아니라 **무엇이 바뀌었나**로 분류한다.
 * 60 에코의 상당수는 다른 단말이 아니라 내 lc.arm · 서버 이중 에코 · 서버 런타임 푸시 · 재접속
 * lc.snap 이다. 사용자 설정 값이 내 요청 없이 바뀐 경우만 「다른 단말」 배너다(기존 ⑦·⑦b 가 회귀 가드).
 */
describe('에코 분류 — 무엇이 바뀌었나 (quick-260926-nr2)', () => {
  const texts = () =>
    Array.from(logRows()).map((r) => r.querySelectorAll('span')[1]?.textContent ?? '');
  const hasText = (t: string) => texts().some((x) => x === t);
  const noOtherDevice = () =>
    expect(texts().some((x) => x.includes('다른 단말'))).toBe(false);

  it('NR2-1 내 lc.arm 에코(래치 ON) → 배너 없음 + 래치 로그 1줄', async () => {
    const e0 = echo({ sellEnabled: true });
    setRelay({ limitChasers: [e0] });
    const { rerender } = render(<Card />);
    const before = logRows().length;

    fireEvent.click(led('sell'));
    expect(sendMock).toHaveBeenCalledWith({ t: 'lc.arm', key: KEY, latch: 'sell' });

    const e1 = echo({ sellEnabled: true, sellEntryLatched: true });
    setRelay({ limitChasers: [e1], lastLimitChaserEcho: e1 });
    rerender(<Card />);

    await waitFor(() => expect(logRows().length).toBe(before + 1));
    expect(hasText(TRANSITION_TEXT.sellLatched)).toBe(true);
    expect(banner()).toBeNull();
    noOtherDevice();
  });

  it('NR2-2 내 스위치 전송 → 에코 → 같은 내용 새 객체 한 번 더(이중 에코) → 배너 없음 · 로그 줄 수 불변', async () => {
    setRelay({ limitChasers: [echo()] });
    const { rerender } = render(<Card />);

    act(() => {
      screen.getByRole('switch', { name: '매수주문 켜기' }).click();
    });
    expect(sendMock).toHaveBeenCalledTimes(1);

    const e1 = echo({ buyEnabled: false });
    setRelay({ limitChasers: [e1], lastLimitChaserEcho: e1 });
    rerender(<Card />);
    await waitFor(() => expect(hasText(TRANSITION_TEXT.buyDisarmed)).toBe(true));
    const count = logRows().length;

    // 300ms 플러시 동일 사본 — 새 객체, 같은 내용.
    const e2 = echo({ buyEnabled: false });
    setRelay({ limitChasers: [e2], lastLimitChaserEcho: e2 });
    rerender(<Card />);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(logRows().length).toBe(count);
    expect(banner()).toBeNull();
    // 내가 끈 매수가 사본 때문에 「발주」로 읽히지 않는다.
    expect(texts().some((x) => x.includes(TRANSITION_TEXT.buyFired))).toBe(false);
    noOtherDevice();
  });

  it('NR2-3 보내지 않은 래치 자동 ON → 배너 없음 + 래치 로그', async () => {
    setRelay({ limitChasers: [echo({ sellEnabled: true })] });
    const { rerender } = render(<Card />);
    setRelay({ limitChasers: [echo({ sellEnabled: true, sellEntryLatched: true })] });
    rerender(<Card />);
    await waitFor(() => expect(hasText(TRANSITION_TEXT.sellLatched)).toBe(true));
    expect(banner()).toBeNull();
    noOtherDevice();
  });

  it('NR2-3 보내지 않은 게이트 false→true(복원) → 배너 없음 + 무장 로그', async () => {
    setRelay({ limitChasers: [echo({ buyEnabled: false })] });
    const { rerender } = render(<Card />);
    setRelay({ limitChasers: [echo({ buyEnabled: true })] });
    rerender(<Card />);
    await waitFor(() => expect(hasText(TRANSITION_TEXT.buyArmed)).toBe(true));
    expect(banner()).toBeNull();
    noOtherDevice();
  });

  it('NR2-3 체결·기준선 갱신(카운터 3종) → 배너·로그 없음', () => {
    setRelay({ limitChasers: [echo()] });
    const { rerender } = render(<Card />);
    const count = logRows().length;
    setRelay({
      limitChasers: [
        echo({ sellOrderQty: 7, sellQtyTrackBaseline: 12_000, cancelQtyTrackBaseline: 9_000 }),
      ],
    });
    rerender(<Card />);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(logRows().length).toBe(count);
    expect(banner()).toBeNull();
  });

  it('NR2-3 보내지 않은 매수 무장 true→false → 「매수 발주 — 무장 해제」 + 「발주 완료 · 무장 해제」 + 배너 없음', async () => {
    setRelay({ limitChasers: [echo({ buyEnabled: true })] });
    const { rerender } = render(<Card />);
    setRelay({ limitChasers: [echo({ buyEnabled: false })] });
    rerender(<Card />);
    await waitFor(() => expect(hasText(TRANSITION_TEXT.buyFired)).toBe(true));
    expect(screen.getByText('발주 완료 · 무장 해제')).toBeInTheDocument();
    expect(banner()).toBeNull();
    noOtherDevice();
  });

  it('NR2-5 같은 내용 lc.snap(새 객체) → 배너·로그 없음', () => {
    setRelay({ limitChasers: [echo()] });
    const { rerender } = render(<Card />);
    const count = logRows().length;
    setRelay({ limitChasers: [echo()] });
    rerender(<Card />);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(logRows().length).toBe(count);
    expect(banner()).toBeNull();
  });

  it('NR2-6 name/code 만 채워진 에코 → 「서버 반영 완료」 없음 · 배너 없음', () => {
    setRelay({ limitChasers: [echo()] });
    const { rerender } = render(<Card />);
    const count = logRows().length;
    setRelay({ limitChasers: [echo({ name: '에코프로', code: '086520' })] });
    rerender(<Card />);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(logRows().length).toBe(count);
    expect(hasText(TRANSITION_TEXT.valuesApplied)).toBe(false);
    expect(banner()).toBeNull();
  });
});

/**
 * quick-260926-nr2 — 발주 판정의 **원인** 인지와 lc.arm 답 추적.
 * 귀속은 relay 컨텍스트 `limitChaserDisableEchoes`(에코 객체 동일성)로 내려 준다.
 */
describe('발주 판정 원인 · lc.arm 답 (quick-260926-nr2)', () => {
  const texts = () =>
    Array.from(logRows()).map((r) => r.querySelectorAll('span')[1]?.textContent ?? '');
  const hasText = (t: string) => texts().some((x) => x === t || x.includes(t));
  /** 시스템 WARN — 게이트웨이 36/37/38 거부 모양(기본 ServerMessageContext). */
  const ARM_REJECT = msg({ lv: 'WARN', src: 'System', m: '매도 무장이 꺼져 있어 래치를 켤 수 없습니다' });

  it('전부 정지 귀속 에코(buy·sell true→false) → 「매수 무장 해제」 · 「매수 발주」 없음 · 「발주 완료」 없음 · 배너 없음', async () => {
    setRelay({ limitChasers: [echo({ buyEnabled: true, sellEnabled: true })] });
    const { rerender } = render(<Card />);

    const e1 = echo({ buyEnabled: false, sellEnabled: false, cancelQtyEnabled: true });
    setRelay({
      limitChasers: [e1],
      lastLimitChaserEcho: e1,
      limitChaserDisableEchoes: new Map([[KEY, { echo: e1, cause: 'killSwitch' }]]),
    });
    rerender(<Card />);

    await waitFor(() => expect(hasText(TRANSITION_TEXT.buyDisarmed)).toBe(true));
    expect(hasText(TRANSITION_TEXT.buyFired)).toBe(false);
    expect(screen.queryByText('발주 완료 · 무장 해제')).toBeNull();
    expect(banner()).toBeNull();
    expect(hasText(marketCloseDisabledLogLine())).toBe(false);
  });

  it('15:40 귀속 에코 → 발주 아님 + 「서버가 KRX 전략을 자동 비활성화했어요 (장 마감 규칙)」 1줄', async () => {
    setRelay({ limitChasers: [echo({ buyEnabled: true, sellEnabled: true })] });
    const { rerender } = render(<Card />);

    const e1 = echo({ buyEnabled: false, sellEnabled: false });
    setRelay({
      limitChasers: [e1],
      lastLimitChaserEcho: e1,
      limitChaserDisableEchoes: new Map([[KEY, { echo: e1, cause: 'marketClose' }]]),
    });
    rerender(<Card />);

    await waitFor(() => expect(hasText(marketCloseDisabledLogLine())).toBe(true));
    expect(texts().filter((t) => t === marketCloseDisabledLogLine())).toHaveLength(1);
    expect(hasText(TRANSITION_TEXT.buyDisarmed)).toBe(true);
    expect(hasText(TRANSITION_TEXT.buyFired)).toBe(false);
    expect(screen.queryByText('발주 완료 · 무장 해제')).toBeNull();
    expect(banner()).toBeNull();
  });

  it('귀속 맵의 echo 가 지금 server 와 다른 객체면 귀속 무시 → 「매수 발주 — 무장 해제」', async () => {
    setRelay({ limitChasers: [echo({ buyEnabled: true })] });
    const { rerender } = render(<Card />);

    const stale = echo({ buyEnabled: false });
    const e1 = echo({ buyEnabled: false });
    setRelay({
      limitChasers: [e1],
      lastLimitChaserEcho: e1,
      limitChaserDisableEchoes: new Map([[KEY, { echo: stale, cause: 'killSwitch' }]]),
    });
    rerender(<Card />);

    await waitFor(() => expect(hasText(TRANSITION_TEXT.buyFired)).toBe(true));
    expect(screen.getByText('발주 완료 · 무장 해제')).toBeInTheDocument();
  });

  it('LED 클릭(send true) → 3초 무응답 → 「미반영」 · 30초 뒤에도 send 1회', () => {
    setRelay({ limitChasers: [echo({ sellEnabled: true })] });
    render(<Card />);
    fireEvent.click(led('sell'));
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(unacked()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS);
    });
    expect(unacked()?.textContent).toContain('미반영');
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('LED 클릭 → 3초 안에 그 키 에코(lastLimitChaserEcho) → 미반영 없음', () => {
    setRelay({ limitChasers: [echo({ sellEnabled: true })] });
    const { rerender } = render(<Card />);
    fireEvent.click(led('sell'));

    const e1 = echo({ sellEnabled: true, sellEntryLatched: true });
    setRelay({ limitChasers: [e1], lastLimitChaserEcho: e1 });
    rerender(<Card />);
    act(() => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS * 3);
    });
    expect(unacked()).toBeNull();
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('LED 클릭 → System WARN 거부 통지 → 미반영 없음 + card-server-error 에 원문 + 로그 1줄', async () => {
    const chasers = [echo({ sellEnabled: true })];
    setRelay({ limitChasers: chasers });
    const { rerender } = render(<Card />);
    fireEvent.click(led('sell'));
    const before = logRows().length;

    setRelay({ limitChasers: chasers, messages: [ARM_REJECT] });
    rerender(<Card />);

    const el = await waitFor(() => {
      expect(serverError()).not.toBeNull();
      return serverError()!;
    });
    expect(el.textContent).toContain('매도 무장이 꺼져 있어 래치를 켤 수 없습니다');
    expect(logRows().length).toBe(before + 1);
    expect(hasText('매도 무장이 꺼져 있어 래치를 켤 수 없습니다')).toBe(true);
    act(() => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS * 3);
    });
    expect(unacked()).toBeNull();
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('arm 이 없을 때 온 System WARN 은 카드에 서지 않는다(표시 몫 불변)', async () => {
    const chasers = [echo({ sellEnabled: true })];
    setRelay({ limitChasers: chasers });
    const { rerender } = render(<Card />);
    const before = logRows().length;

    setRelay({ limitChasers: chasers, messages: [ARM_REJECT] });
    rerender(<Card />);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(serverError()).toBeNull();
    expect(logRows().length).toBe(before);
  });

  it('LED 클릭인데 send false → 3초 뒤에도 미반영 없음 · send 1회(재전송 없음)', () => {
    sendMock.mockReturnValue(false);
    setRelay({ limitChasers: [echo({ sellEnabled: true })] });
    render(<Card />);
    fireEvent.click(led('sell'));
    act(() => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS * 10);
    });
    expect(unacked()).toBeNull();
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
