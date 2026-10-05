import { useEffect, useRef } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { RelayLimitChaser, RelayLimitChaserInput } from '@gh-radar/shared';

/**
 * 작업대 전략 카드 1장의 **흐름** — 전송 ↔ 에코 상관 · 서버 통지 · LED 전송 규율 · 철거 에코 (18-13 이관).
 *
 * ★ 이 파일은 옛 상따 화면 단위 테스트(18-13 에서 옛 화면과 함께 삭제)가 덮던 단언 중
 *   **카드 상태 훅(`useStrategyCardState`)의 규율**을 그대로 옮긴 것이다. 옛 화면과 카드는 18-06
 *   부터 같은 훅을 썼으므로 규율 자체는 바뀌지 않았고, 바뀐 것은 **그 결과가 서는 자리**다:
 *     · 상태줄의 「미반영」 → 카드 인라인 고지(`card-unacked`) — 「다른 단말」 에코 배너는 2026-09-29 제거
 *     · 상태줄의 래치 LED → 카드 헤더 LED(같은 `LatchLed`)
 *     · 상태줄의 서버 거부 → 카드 인라인 `role="alert"`(`card-server-error`) — 18-13 에서 **되살렸다**
 *       (훅은 `lastError` 를 계산하고 있었지만 카드가 그리지 않아 거부가 로그 탭에만 조용히 쌓였다)
 *   옮긴 목록과 이어받은 자리의 대조표는 18-13 SUMMARY 에 있다.
 *
 * 카드는 작업대와 같은 조립으로 렌더한다 — `StrategyCard` + `CardBody`(폼·사다리) +
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
  StrategyCard,
  strategyStatusOf,
  type StrategyCardState,
} from '../card/strategy-card';
import { StrategyLog, TRANSITION_TEXT, marketCloseDisabledLogLine } from '../strategy-log';
import { LC_BUY3_ECHO_DEFAULTS } from '@/test-fixtures/limit-chaser';
import { LC_ORPHAN_WAIT_MS, LC_REJECT_ECHO_GRACE_MS } from '@/components/trading/lc/use-lc-field-commit';

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
    ...LC_BUY3_ECHO_DEFAULTS,
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
    bul: false,
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

/**
 * 마지막 렌더의 카드 상태 — 24-05 귀속 테스트가 `handleSent(cfg, { cause })` 를 직접 부른다
 * (D-01/D-02 동반 · D-02 후반 실제 발신은 24-06 폼 몫이라 여기서는 보낸 기록만 흉내 낸다).
 */
let lastCard: StrategyCardState | null = null;

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
          {((lastCard = s), null)}
          <CardBody
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
  it('⑥ ★ 내가 보낸 요청의 에코에는 「발주」로 읽지 않는다', async () => {
    setRelay({ limitChasers: [echo()] });
    const { rerender } = render(<Card />);

    act(() => {
      screen.getByRole('switch', { name: '매수주문 켜기' }).click();
    });
    expect(sendMock).toHaveBeenCalledTimes(1);

    setRelay({ limitChasers: [echo({ buyEnabled: false })] });
    rerender(<Card />);

    await waitFor(() => expect(logRows().length).toBeGreaterThan(0));
    // 내가 껐으므로 「발주」가 아니다 — 마스터 해제는 어디서도 발주가 아니다(Pitfall 11).
    expect(screen.getByText(/매수주문 무장 해제/)).toBeInTheDocument();
    expect(screen.queryByText(/매수 발주/)).toBeNull();
  });

  it('⑦ ★ 보낸 적 없는 에코 = 다른 단말 변경 → 배너 없이 로그 최상단 「서버 반영 완료」 (D-11 · 2026-09-29 배너 제거)', async () => {
    setRelay({ limitChasers: [echo()] });
    const { rerender } = render(<Card />);

    setRelay({ limitChasers: [echo({ buyWatchQty: 8_000 })] });
    rerender(<Card />);

    await waitFor(() => expect(logRows()[0]?.textContent ?? '').toContain(TRANSITION_TEXT.valuesApplied));
    expect(screen.queryByText(/다른 단말/)).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('⑦b ★ 인라인 편집 중 다른 단말 에코 → 입력 8,000 유지 · Esc 뒤 행 = 에코 5,000주 (D-04 · UI-SPEC E4 partial)', async () => {
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

    await waitFor(() => expect(logRows()[0]?.textContent ?? '').toContain(TRANSITION_TEXT.valuesApplied));
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
  it('⑲-1 LED 4개가 헤더에 매수 · 매도 · 취소 · 자동 순서로 있다 (D-22 · Phase 27 D-04)', () => {
    setRelay({ limitChasers: [echo()] });
    render(<Card />);
    expect(leds().map((el) => el.dataset.kind)).toEqual(['buy', 'sell', 'cancel', 'autoSell']);
  });

  it('⑲-3 ★ 서버 전략이 없으면 네 LED 가 전부 회색 span 이고 클릭해도 아무것도 나가지 않는다', () => {
    setRelay({ limitChasers: [] });
    render(<Card />);
    expect(leds()).toHaveLength(4);
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

  it('⑲-5 취소 LED → `latch:"cancel"` · 매수 LED 는 클릭 불가 span — send 호출 0 (Phase 24 D-12)', () => {
    setRelay({
      limitChasers: [echo({ cancelQtyEnabled: true, buyEnabled: true, buyWatchSide: '1' })],
    });
    render(<Card />);
    fireEvent.click(led('cancel'));
    expect(sendMock).toHaveBeenLastCalledWith({ t: 'lc.arm', key: KEY, latch: 'cancel' });
    expect(sendMock).toHaveBeenCalledTimes(1);
    // 매수 LED — 감시 · 보유중 어느 쪽이든 span 이고 lc.arm 을 보내지 않는다.
    expect(led('buy').tagName).toBe('SPAN');
    fireEvent.click(led('buy'));
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).not.toHaveBeenCalledWith(expect.objectContaining({ t: 'lc.arm', latch: 'buy' }));
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
    // R3-WR-01 — 거부 통지 답은 같은 제출의 에코를 유예한다. 에코가 없으면(전면 거부) 유예 끝에 종전대로 실패다.
    //   유예를 먼저 진행한다 — 유예 1초와 waitFor 기본 1초가 경주하지 않게.
    act(() => {
      vi.advanceTimersByTime(LC_REJECT_ECHO_GRACE_MS);
    });

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
 * lc.snap 이다. 사용자 설정 값이 내 요청 없이 바뀐 경우만 「서버 반영 완료」 줄이다(기존 ⑦·⑦b 가 회귀 가드).
 */
describe('에코 분류 — 무엇이 바뀌었나 (quick-260926-nr2)', () => {
  const texts = () =>
    Array.from(logRows()).map((r) => r.querySelectorAll('span')[1]?.textContent ?? '');
  const hasText = (t: string) => texts().some((x) => x === t);
  it('NR2-1 내 lc.arm 에코(래치 ON) → 래치 로그 1줄', async () => {
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
  });

  it('NR2-2 내 스위치 전송 → 에코 → 같은 내용 새 객체 한 번 더(이중 에코) → 로그 줄 수 불변', async () => {
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
    // 내가 끈 매수가 사본 때문에 「발주」로 읽히지 않는다.
    expect(texts().some((x) => x.includes('발주'))).toBe(false);
  });

  it('NR2-3 보내지 않은 래치 자동 ON → 래치 로그', async () => {
    setRelay({ limitChasers: [echo({ sellEnabled: true })] });
    const { rerender } = render(<Card />);
    setRelay({ limitChasers: [echo({ sellEnabled: true, sellEntryLatched: true })] });
    rerender(<Card />);
    await waitFor(() => expect(hasText(TRANSITION_TEXT.sellLatched)).toBe(true));
  });

  it('NR2-3 보내지 않은 게이트 false→true(복원) → 무장 로그', async () => {
    setRelay({ limitChasers: [echo({ buyEnabled: false })] });
    const { rerender } = render(<Card />);
    setRelay({ limitChasers: [echo({ buyEnabled: true })] });
    rerender(<Card />);
    await waitFor(() => expect(hasText(TRANSITION_TEXT.buyArmed)).toBe(true));
  });

  it('NR2-3 체결·기준선 갱신(카운터 3종) → 로그 없음', () => {
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
  });

  it('NR2-3 보내지 않은 마스터 true→false(다른 단말 · WinForms 자동 끔) → 「매수주문 무장 해제」 · 발주 아님 · 「꺼짐」 (Pitfall 11)', async () => {
    setRelay({ limitChasers: [echo({ buyEnabled: true })] });
    const { rerender } = render(<Card />);
    setRelay({ limitChasers: [echo({ buyEnabled: false })] });
    rerender(<Card />);
    await waitFor(() => expect(hasText(TRANSITION_TEXT.buyDisarmed)).toBe(true));
    expect(texts().some((x) => x.includes('발주'))).toBe(false);
    expect(lastCard!.badges.buyText).toBe('');
    // Phase 24 UI-SPEC §11 — 카드 상태 「발주 완료 · 무장 해제」는 은퇴했다(마스터 OFF 는 「꺼짐」).
    expect(screen.queryByText('발주 완료 · 무장 해제')).toBeNull();
    expect(
      within(document.querySelector('[data-slot="lc-group-buy"]') as HTMLElement).getByText('꺼짐'),
    ).toBeInTheDocument();
  });

  it('NR2-5 같은 내용 lc.snap(새 객체) → 로그 없음', () => {
    setRelay({ limitChasers: [echo()] });
    const { rerender } = render(<Card />);
    const count = logRows().length;
    setRelay({ limitChasers: [echo()] });
    rerender(<Card />);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(logRows().length).toBe(count);
  });

  it('NR2-6 name/code 만 채워진 에코 → 「서버 반영 완료」 없음', () => {
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
  /** 시스템 WARN — 게이트웨이 36/37 거부 모양(기본 ServerMessageContext). */
  const ARM_REJECT = msg({ lv: 'WARN', src: 'System', m: '매도 무장이 꺼져 있어 래치를 켤 수 없습니다' });

  it('전부 정지 귀속 에코(buy·sell true→false) → 「매수주문 무장 해제」 · 「발주」 없음 · 「발주 완료」 없음', async () => {
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
    expect(texts().some((x) => x.includes('발주'))).toBe(false);
    expect(screen.queryByText('발주 완료 · 무장 해제')).toBeNull();
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
    expect(texts().filter((t) => t.includes('발주') && !t.includes('장 마감'))).toHaveLength(0);
    expect(screen.queryByText('발주 완료 · 무장 해제')).toBeNull();
  });

  it('귀속 맵의 echo 가 지금 server 와 다른 객체면 귀속 무시 → 그래도 「매수주문 무장 해제」(발주 아님 · Pitfall 11)', async () => {
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

    await waitFor(() => expect(hasText(TRANSITION_TEXT.buyDisarmed)).toBe(true));
    expect(texts().some((x) => x.includes('발주'))).toBe(false);
    // Phase 24 UI-SPEC §11 — 카드 상태 「발주 완료 · 무장 해제」는 은퇴했다(마스터 OFF 는 「꺼짐」).
    expect(screen.queryByText('발주 완료 · 무장 해제')).toBeNull();
    expect(lastCard!.badges.buyText).toBe('');
    expect(
      within(document.querySelector('[data-slot="lc-group-buy"]') as HTMLElement).getByText('꺼짐'),
    ).toBeInTheDocument();
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

/**
 * Phase 24 Plan 05 Task 2 — 카드 귀속: 보낸 cfg · 보낸 사유 → 로그 · 마스터 발주 추론 제거 ·
 * 후매수 발동 override 「서버 반영 완료」 억제 (ROADMAP ⑨ · D-01/D-02 · Pitfall 8 · 11 · T-24-21~23).
 *
 * 동반 제출(D-01/D-02 전반)과 D-02 후반 자동 끔의 **실제 발신**은 24-06 폼 몫이다 — 여기서는
 * 카드 `handleSent(cfg, { cause })` 를 직접 불러 「보낸 기록」만 흉내 낸다.
 */
describe('24-05 카드 귀속 — 보낸 cfg · 보낸 사유 · override (Phase 24 ⑨)', () => {
  const texts = () =>
    Array.from(logRows()).map((r) => r.querySelectorAll('span')[1]?.textContent ?? '');
  const top = () => texts()[0] ?? '';
  const sentOf = (e: RelayLimitChaser) => e as unknown as RelayLimitChaserInput;
  const FOLD = '서버가 매수 그룹 해제 — 매수 그룹이 모두 꺼져 매수주문도 끔';
  beforeEach(() => {
    lastCard = null;
  });

  it('D-01 — 마스터 + 선매수를 함께 보낸 뒤 둘 다 ON 에코 → 로그 최상단 한 줄 「선매수 체크 — 매수주문도 켬」 · 카드가 만든 전송 0 (T-24-23)', async () => {
    setRelay({ limitChasers: [echo({ buyEnabled: false })] });
    const { rerender } = render(<Card />);
    const next = echo({ buyEnabled: true, preBuyEnabled: true });
    act(() => {
      lastCard!.handleSent(sentOf(next));
    });
    setRelay({ limitChasers: [next], lastLimitChaserEcho: next });
    rerender(<Card />);

    await waitFor(() => expect(top()).toBe('선매수 체크 — 매수주문도 켬'));
    expect(texts().some((x) => x.includes(TRANSITION_TEXT.buyArmed))).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('D-02 후반 — `handleSent(cfg{buyEnabled:false}, { cause: serverFold })` 뒤 마스터 OFF 에코 → 서버 접힘 한 줄 · fired 없음', async () => {
    const folded = echo({ buyEnabled: true, sellEnabled: true });
    setRelay({ limitChasers: [folded] });
    const { rerender } = render(<Card />);
    const off = echo({ buyEnabled: false, sellEnabled: true });
    act(() => {
      lastCard!.handleSent(sentOf(off), { cause: 'serverFold' });
    });
    setRelay({ limitChasers: [off], lastLimitChaserEcho: off });
    rerender(<Card />);

    await waitFor(() => expect(top()).toBe(FOLD));
    expect(texts().some((x) => x === TRANSITION_TEXT.buyDisarmed)).toBe(false);
    expect(texts().some((x) => x.includes('발주'))).toBe(false);
    expect(lastCard!.badges.buyText).toBe('');
    expect(sendMock).not.toHaveBeenCalled();

    // 사유는 pendingRef 와 함께 소비됐다 — 다음(보내지 않은) 마스터 OFF 는 종전 문장이다.
    const on2 = echo({ buyEnabled: true, sellEnabled: true });
    setRelay({ limitChasers: [on2], lastLimitChaserEcho: on2 });
    rerender(<Card />);
    await waitFor(() => expect(top()).toBe(TRANSITION_TEXT.buyArmed));
    const off2 = echo({ buyEnabled: false, sellEnabled: true });
    setRelay({ limitChasers: [off2], lastLimitChaserEcho: off2 });
    rerender(<Card />);
    await waitFor(() => expect(top()).toBe(TRANSITION_TEXT.buyDisarmed));
    expect(texts().filter((x) => x === FOLD)).toHaveLength(1);
  });

  it('D-02 후반 — 런타임 에코는 보낸 사유를 소비하지 않는다(pendingRef 와 같은 규율)', async () => {
    const folded = echo({ buyEnabled: true, sellEnabled: true, postBuyPhase: 3 });
    setRelay({ limitChasers: [folded] });
    const { rerender } = render(<Card />);
    const off = echo({ buyEnabled: false, sellEnabled: true, postBuyPhase: 3 });
    act(() => {
      lastCard!.handleSent(sentOf(off), { cause: 'serverFold' });
    });
    // 내 에코보다 먼저 온 런타임 푸시(후매수 잔여만 바뀜) — 로그 0줄 · 사유 보존.
    const runtime = { ...folded, postBuyReentryLeft: 0, extraBuyAbandoned: true };
    const before = logRows().length;
    setRelay({ limitChasers: [runtime], lastLimitChaserEcho: runtime });
    rerender(<Card />);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(logRows().length).toBe(before);

    const offEcho = { ...off, postBuyReentryLeft: 0, extraBuyAbandoned: true };
    setRelay({ limitChasers: [offEcho], lastLimitChaserEcho: offEcho });
    rerender(<Card />);
    await waitFor(() => expect(top()).toBe(FOLD));
  });

  it('Pitfall 8 — 보내지 않은 후매수 발동 에코(단계 1 → 2 · 매도 · 취소 override) → 「서버 반영 완료」 없음 · 게이트 전이 문장은 남는다', async () => {
    const armed = echo({ buyEnabled: true, postBuyEnabled: true, postBuyPhase: 1 });
    setRelay({ limitChasers: [armed] });
    const { rerender } = render(<Card />);
    const fired = {
      ...armed,
      postBuyPhase: 2,
      postBuyTriggerQty: 330_000,
      sellEnabled: true,
      cancelQtyEnabled: true,
      // D-38 — 서버 override = 발동잔량 × 80%(330,000 → 264,000).
      sellWatchQty: 264_000,
      cancelWatchQty: 264_000,
      sellWatchPrice: 150_800,
      sellOrderPrice: 150_800,
    };
    setRelay({ limitChasers: [fired], lastLimitChaserEcho: fired });
    rerender(<Card />);

    await waitFor(() =>
      expect(top()).toBe(`${TRANSITION_TEXT.sellArmed} · ${TRANSITION_TEXT.cancelArmed}`),
    );
    expect(texts().some((x) => x.includes(TRANSITION_TEXT.valuesApplied))).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('Pitfall 8 — 단계 전이 없는 같은 필드 변화(다른 단말의 매도 매수잔량 수정)는 종전대로 「서버 반영 완료」 줄이 선다', async () => {
    const armed = echo({ buyEnabled: true, postBuyEnabled: true, postBuyPhase: 1, sellEnabled: true });
    setRelay({ limitChasers: [armed] });
    const { rerender } = render(<Card />);
    const edited = { ...armed, sellWatchQty: 330_000 };
    setRelay({ limitChasers: [edited], lastLimitChaserEcho: edited });
    rerender(<Card />);
    await waitFor(() => expect(texts().some((x) => x.includes(TRANSITION_TEXT.valuesApplied))).toBe(true));
  });
});

describe('24-06 — 클라 로그 통로 pushClientLog (D-36 · 순서)', () => {
  const texts = () =>
    Array.from(logRows()).map((r) => r.querySelectorAll('span')[1]?.textContent ?? '');
  // 카드 흐름 quote() 의 매수1잔량 = 100 · 시드 추가매수 최소 0 → 하한 1.
  const D36 =
    '추가매수는 상한가 도달 전 또는 매수1잔량이 최소 미만일 때만 켤 수 있습니다 — 매수1호가 == 비교가격, 매수1잔량 100 ≥ 최소 1';

  beforeEach(() => {
    lastCard = null;
  });

  it('D-36 — 매수1호가 == 비교가격 ∧ 매수1잔량 100 ≥ 최소 1 에서 추가매수 켜기 → 카드 전략 로그 최상단에 원문 그대로(error) · 전송 0', async () => {
    const e = echo({ extraBuyOrderAmount: 50 });
    setRelay({ limitChasers: [e], quote: quote() });
    render(<Card />);
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: '추가매수 켜기' }));
    });
    await waitFor(() => expect(texts()[0]).toBe(D36));
    expect(logRows()[0]!.getAttribute('data-level')).toBe('error');
    expect(lcSets()).toHaveLength(0);
  });

  /**
   * 자식 이펙트가 에코 렌더에서 클라 로그를 쌓는 모양(24-07 D-06 자동 체크 요약이 이 경로다) — 자식 이펙트는
   * 부모(카드 훅)의 에코 전이 이펙트보다 **먼저** 돈다. 한 박자 늦추지 않으면 클라 줄이 전이 줄 아래로 깔린다.
   */
  function Probe({ s }: { s: StrategyCardState }) {
    const prev = useRef(s.server);
    useEffect(() => {
      if (prev.current === s.server) return;
      prev.current = s.server;
      if (s.server?.buyEnabled) s.pushClientLog('클라 로그', 'info');
    }, [s]);
    return null;
  }
  function CardWithProbe() {
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
            <Probe s={s} />
            <StrategyLog entries={s.log} />
          </>
        )}
      />
    );
  }

  it('순서 — 같은 렌더의 에코 전이 줄 **뒤**에 쌓인다(microtask · 최신이 위)', async () => {
    const before = echo({ buyEnabled: false, sellEnabled: true });
    setRelay({ limitChasers: [before] });
    const { rerender } = render(<CardWithProbe />);
    const after = echo({ buyEnabled: true, sellEnabled: true });
    act(() => {
      setRelay({ limitChasers: [after], lastLimitChaserEcho: after });
      rerender(<CardWithProbe />);
    });
    await waitFor(() => expect(texts()).toContain('클라 로그'));
    expect(texts()[0]).toBe('클라 로그');
    expect(texts()[1]).toBe(TRANSITION_TEXT.buyArmed);
  });
});

describe('24-07 — 선매수 자동 체크 로그 (D-06 · D-01 줄 다음 · 거부면 없음)', () => {
  const texts = () =>
    Array.from(logRows()).map((r) => r.querySelectorAll('span')[1]?.textContent ?? '');
  const AUTO = '선매수 자동 체크 — 켬: 매도주문 · 매도>잔량추적 · 매도>체결 · 취소 · 취소>체결 · 취소>잔량추적';
  const SIX = {
    sellEnabled: true,
    sellQtyTrackEnabled: true,
    sellTradeQtyEnabled: true,
    cancelQtyEnabled: true,
    cancelTradeEnabled: true,
    cancelQtyTrackEnabled: true,
  } as const;

  beforeEach(() => {
    lastCard = null;
  });

  it('마스터 OFF 에서 선매수 켬 → 성공 에코 뒤 위에서부터 [자동 체크 한 줄, 「선매수 체크 — 매수주문도 켬」…] (최신이 위)', async () => {
    setRelay({ limitChasers: [echo({ buyEnabled: false, buyOrderAmount: 50 })], quote: quote() });
    const { rerender } = render(<Card />);
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: '선매수 켜기' }));
    });
    expect(lcSets()).toHaveLength(1);
    expect(lcSets()[0]!.cfg).toMatchObject({ preBuyEnabled: true, buyEnabled: true, ...SIX });
    const next = echo({ buyEnabled: true, preBuyEnabled: true, buyOrderAmount: 50, ...SIX });
    setRelay({ limitChasers: [next], lastLimitChaserEcho: next, quote: quote() });
    rerender(<Card />);

    await waitFor(() => expect(texts()).toContain(AUTO));
    expect(texts()[0]).toBe(AUTO);
    expect(logRows()[0]!.getAttribute('data-level')).toBe('info');
    expect(texts()[1]!.startsWith('선매수 체크 — 매수주문도 켬')).toBe(true);
    expect(texts().filter((x) => x.startsWith('선매수 자동 체크'))).toHaveLength(1);
  });

  it('거부되면 자동 체크 줄은 쌓이지 않는다', async () => {
    const before = echo({ buyEnabled: false, buyOrderAmount: 50 });
    setRelay({ limitChasers: [before], quote: quote() });
    const { rerender } = render(<Card />);
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: '선매수 켜기' }));
    });
    expect(lcSets()).toHaveLength(1);
    setRelay({
      limitChasers: [before],
      quote: quote(),
      messages: [msg({ lv: 'ERROR', src: 'SetLimitChaser', i: ISIN, a: ACCOUNT, m: '거부 사유' })],
    });
    rerender(<Card />);
    await waitFor(() => expect(texts().some((x) => x.includes('거부 사유'))).toBe(true));
    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    expect(texts().some((x) => x.startsWith('선매수 자동 체크'))).toBe(false);
  });
});

/**
 * 24-11 갭 클로징 WR-05 — 거부 · 무응답으로 **끝난** 제출의 cfg · 사유(`pendingRef` · `pendingCauseRef`)가
 * 다음 무관한 에코(다른 단말 · 15:40 · 전부 정지)에 귀속되지 않는다 (24-VERIFICATION 갭 5 · 24-REVIEW WR-05).
 *
 * ★ 귀속을 비우는 경로(에코 소비 · 결과 모름 창 만료 — 거부 통지는 비우지 않는다 · 24-18 GC-WR-01)는 무엇도 다시
 *   보내지 않는다(T-16-10) — 표시 · 로그 귀속만.
 */
describe('WR-05 — 거부 · 무응답 제출의 사유는 그 사건에만 귀속된다 (24-VERIFICATION 갭 5)', () => {
  const texts = () =>
    Array.from(logRows()).map((r) => r.querySelectorAll('span')[1]?.textContent ?? '');
  const top = () => texts()[0] ?? '';
  const sentOf = (e: RelayLimitChaser) => e as unknown as RelayLimitChaserInput;
  const FOLD = TRANSITION_TEXT.masterOffAfterServerFold;
  /** 결과 모름 창 = 카드 3초 + 훅 고아 장벽 — 보낸 제출 귀속의 수명 끝(거부 통지는 끝이 아니다 · GC-WR-01). */
  const WINDOW_MS = ACK_TIMEOUT_MS + LC_ORPHAN_WAIT_MS;
  const rejection = () =>
    msg({
      lv: 'ERROR',
      src: 'SetLimitChaser',
      m: '매수 설정이 불완전합니다 — 매수를 끄지 않았습니다',
      i: ISIN,
      a: ACCOUNT,
    });

  beforeEach(() => {
    lastCard = null;
  });

  it('거부 — serverFold 자동 끔이 거부된 뒤 보내지 않은 마스터 OFF 에코(다른 단말) → 「매수주문 무장 해제」 · 서버 접힘 문장 0 · 전송 0', async () => {
    /*
      GC-WR-01 — 창 안의 같은 모양 에코는 내 답으로 읽는다(부분 거부 · 다른 탭 거부와 구별 불가). round-1 의도(끝난
      제출의 사유가 뒤 무관 에코에 붙지 않음)는 창이 닫힌 뒤로 표현한다.
    */
    const on = echo({ buyEnabled: true, sellEnabled: true });
    setRelay({ limitChasers: [on] });
    const { rerender } = render(<Card />);
    const off = echo({ buyEnabled: false, sellEnabled: true });
    act(() => {
      lastCard!.handleSent(sentOf(off), { cause: 'serverFold' });
    });

    // 서버가 그 제출을 거부했다 — 60 에코는 없다.
    const rej = rejection();
    setRelay({ limitChasers: [on], messages: [rej] });
    rerender(<Card />);
    await waitFor(() => expect(serverError()).not.toBeNull());

    // 한참 뒤(결과 모름 창이 닫힌 뒤) 다른 단말의 마스터 OFF — 내 거부된 제출과 무관한 사건이다.
    act(() => {
      vi.advanceTimersByTime(WINDOW_MS);
    });
    const other = echo({ buyEnabled: false, sellEnabled: true });
    setRelay({ limitChasers: [other], lastLimitChaserEcho: other, messages: [rej] });
    rerender(<Card />);

    await waitFor(() => expect(top()).toBe(TRANSITION_TEXT.buyDisarmed));
    expect(texts().some((x) => x === FOLD)).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('거부(D-02 전반 동반) — 후매수 + 마스터 동반 끔이 거부된 뒤 다른 단말의 같은 모양 에코 → 동반 문장 0 · 개별 전이 문장', async () => {
    /*
      GC-WR-01 — 창 안의 같은 모양 에코는 내 답으로 읽는다(부분 거부 · 다른 탭 거부와 구별 불가). round-1 의도(끝난
      제출의 사유가 뒤 무관 에코에 붙지 않음)는 창이 닫힌 뒤로 표현한다.
    */
    const on = echo({ buyEnabled: true, postBuyEnabled: true, sellEnabled: true });
    setRelay({ limitChasers: [on] });
    const { rerender } = render(<Card />);
    const both = echo({ buyEnabled: false, postBuyEnabled: false, sellEnabled: true });
    act(() => {
      lastCard!.handleSent(sentOf(both));
    });

    const rej = rejection();
    setRelay({ limitChasers: [on], messages: [rej] });
    rerender(<Card />);
    await waitFor(() => expect(serverError()).not.toBeNull());

    // 한참 뒤(결과 모름 창이 닫힌 뒤) 다른 단말의 같은 모양 에코.
    act(() => {
      vi.advanceTimersByTime(WINDOW_MS);
    });
    const other = echo({ buyEnabled: false, postBuyEnabled: false, sellEnabled: true });
    setRelay({ limitChasers: [other], lastLimitChaserEcho: other, messages: [rej] });
    rerender(<Card />);

    await waitFor(() => expect(top()).toContain(TRANSITION_TEXT.postBuyDisarmed));
    expect(top()).toContain(TRANSITION_TEXT.buyDisarmed);
    expect(texts().some((x) => x.includes(TRANSITION_TEXT.postBuyWithMasterOff))).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('원인 귀속 — serverFold 제출 뒤 15:40 귀속 에코 → 서버 접힘 문장 0 · 15:40 원인 줄은 그대로', async () => {
    setRelay({ limitChasers: [echo({ buyEnabled: true, sellEnabled: true })] });
    const { rerender } = render(<Card />);
    const off = echo({ buyEnabled: false, sellEnabled: true });
    act(() => {
      lastCard!.handleSent(sentOf(off), { cause: 'serverFold' });
    });

    const e1 = echo({ buyEnabled: false, sellEnabled: false });
    setRelay({
      limitChasers: [e1],
      lastLimitChaserEcho: e1,
      limitChaserDisableEchoes: new Map([[KEY, { echo: e1, cause: 'marketClose' }]]),
    });
    rerender(<Card />);

    await waitFor(() => expect(texts()).toContain(marketCloseDisabledLogLine()));
    expect(texts().some((x) => x.includes(FOLD))).toBe(false);
    expect(texts().some((x) => x.includes(TRANSITION_TEXT.buyDisarmed))).toBe(true);
    expect(sendMock).not.toHaveBeenCalled();
  });

  /* ── 무응답 — 결과 모름 창(카드 3초 + 훅 고아 장벽 LC_ORPHAN_WAIT_MS)이 닫힐 때 귀속을 비운다 ── */

  it('창 만료 — serverFold 제출이 결과 모름 창 내내 무응답 → 창이 닫힌 뒤 온 보내지 않은 마스터 OFF 에코 → 「매수주문 무장 해제」 · 서버 접힘 문장 0', async () => {
    const on = echo({ buyEnabled: true, sellEnabled: true });
    setRelay({ limitChasers: [on] });
    const { rerender } = render(<Card />);
    const off = echo({ buyEnabled: false, sellEnabled: true });
    act(() => {
      lastCard!.handleSent(sentOf(off), { cause: 'serverFold' });
    });
    act(() => {
      vi.advanceTimersByTime(WINDOW_MS);
    });
    expect(unacked()?.textContent).toContain('미반영');

    const other = echo({ buyEnabled: false, sellEnabled: true });
    setRelay({ limitChasers: [other], lastLimitChaserEcho: other });
    rerender(<Card />);

    await waitFor(() => expect(top()).toBe(TRANSITION_TEXT.buyDisarmed));
    expect(texts().some((x) => x === FOLD)).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('창 안 늦은 에코 — 「미반영」 뒤(3초 + 2초) 닿은 내 에코는 여전히 내 제출 → 서버 접힘 한 줄 · 「미반영」 거둬짐', async () => {
    const on = echo({ buyEnabled: true, sellEnabled: true });
    setRelay({ limitChasers: [on] });
    const { rerender } = render(<Card />);
    const off = echo({ buyEnabled: false, sellEnabled: true });
    act(() => {
      lastCard!.handleSent(sentOf(off), { cause: 'serverFold' });
    });
    act(() => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS + 2_000);
    });
    expect(unacked()?.textContent).toContain('미반영');

    setRelay({ limitChasers: [off], lastLimitChaserEcho: off });
    rerender(<Card />);

    await waitFor(() => expect(top()).toBe(FOLD));
    expect(unacked()).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('동일성 가드 — 앞 제출(A)의 만료 시각이 지나도 그 사이 새 제출(B)의 귀속은 남는다 → B 의 에코에 B 의 문장', async () => {
    const on = echo({ buyEnabled: true, sellEnabled: true });
    setRelay({ limitChasers: [on] });
    const { rerender } = render(<Card />);
    const a = echo({ buyEnabled: true, sellEnabled: false });
    act(() => {
      lastCard!.handleSent(sentOf(a));
    });
    act(() => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS + 5_000);
    });
    const b = echo({ buyEnabled: false, sellEnabled: true });
    act(() => {
      lastCard!.handleSent(sentOf(b), { cause: 'serverFold' });
    });
    // A 의 만료 시각(전송 + WINDOW_MS)을 넘기되 B 의 창 안이다.
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    setRelay({ limitChasers: [b], lastLimitChaserEcho: b });
    rerender(<Card />);

    await waitFor(() => expect(top()).toBe(FOLD));
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('만료 타이머는 아무것도 보내지 않는다 — 30초 진행 뒤에도 send 호출 수 불변 (T-16-10)', () => {
    setRelay({ limitChasers: [echo({ buyEnabled: true, sellEnabled: true })] });
    render(<Card />);
    act(() => {
      lastCard!.handleSent(sentOf(echo({ buyEnabled: false, sellEnabled: true })), {
        cause: 'serverFold',
      });
    });
    const before = sendMock.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(sendMock.mock.calls.length).toBe(before);
    expect(sendMock).not.toHaveBeenCalled();
  });

  /** 거래소 prop 만 바꿀 수 있는 카드 — 키 변경(ISIN:계좌:거래소) 경로를 탄다. */
  function CardAt({ exchange }: { exchange: 'KRX' | 'NXT' }) {
    return (
      <StrategyCard
        cardId="wb-card-1"
        isin={ISIN}
        accountNo={ACCOUNT}
        exchange={exchange}
        name="에코프로"
        code="086520"
        open
        onToggle={noop}
        onClose={noop}
        onExchangeChange={noop}
        body={(s) => ((lastCard = s), null)}
      />
    );
  }

  /** `handleSent` 가 건 결과 모름 창 만료 타이머의 id 들(지연 = WINDOW_MS 로 식별). */
  function spyExpiryTimers() {
    const ids: unknown[] = [];
    const realSet = window.setTimeout;
    vi.spyOn(window, 'setTimeout').mockImplementation(((fn: TimerHandler, ms?: number, ...rest: unknown[]) => {
      const id = realSet(fn, ms, ...rest);
      if (ms === WINDOW_MS) ids.push(id);
      return id;
    }) as typeof window.setTimeout);
    const clear = vi.spyOn(window, 'clearTimeout');
    return { ids, clear };
  }

  it('키 변경 · 언마운트에서 만료 타이머가 정리된다(누수 · 다른 키 pending 비움 없음)', () => {
    setRelay({ limitChasers: [] });
    const { ids, clear } = spyExpiryTimers();
    const { rerender, unmount } = render(<CardAt exchange="KRX" />);

    act(() => {
      lastCard!.handleSent(sentOf(echo({ buyEnabled: false })), { cause: 'serverFold' });
    });
    expect(ids).toHaveLength(1);
    rerender(<CardAt exchange="NXT" />);
    expect(clear).toHaveBeenCalledWith(ids[0]);

    act(() => {
      lastCard!.handleSent(sentOf(echo({ exchange: 'NXT', buyEnabled: false })), { cause: 'serverFold' });
    });
    expect(ids).toHaveLength(2);
    unmount();
    expect(clear).toHaveBeenCalledWith(ids[1]);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

/**
 * 24-18 갭 클로징 GC-WR-01 — WR-05 재개 (24-VERIFICATION-R2 갭 1 · 24-REVIEW-R2 GC-WR-01).
 *
 * gh-trade `ProcessSetLimitChaser` 의 **부분 거부**(매도 · 취소 · 추가 · 후매수 검증 실패)는 그 항만 눕히고 ERROR 를
 * **먼저** 보낸 뒤 cfg 를 저장하고 같은 제출의 에코를 보낸다(limit-chaser.md §9 ①② · §9-2 ③~⑤). 게다가 ServerMessage 는
 * 사용자의 모든 소켓으로 팬아웃된다. 그래서 거부 통지는 귀속의 끝이 아니다 — 귀속은 「이 에코가 내 요청 변화를 싣는가」
 * (`echoAnswersSent`) 하나로 판정하고, 끝은 에코 소비 · 결과 모름 창 만료 두 수평선이다.
 *
 * ★ 판정 · 정리 경로는 무엇도 다시 보내지 않는다(T-16-10) — 모든 케이스가 `send` 0 을 단언한다.
 */
describe('GC-WR-01 — 부분 거부 · 다른 탭 거부 뒤 내 제출의 에코는 내 것이다 (24-VERIFICATION-R2 갭 1)', () => {
  const texts = () =>
    Array.from(logRows()).map((r) => r.querySelectorAll('span')[1]?.textContent ?? '');
  const top = () => texts()[0] ?? '';
  const sentOf = (e: RelayLimitChaser) => e as unknown as RelayLimitChaserInput;
  const FOLD = TRANSITION_TEXT.masterOffAfterServerFold;
  const rejection = (m = '매도 설정이 불완전합니다(주문가/감시가 0, 매도비율 1~100 밖, 잔량추적 비율 1~90 밖) — 매도를 켜지 않았습니다') =>
    msg({ lv: 'ERROR', src: 'SetLimitChaser', m, i: ISIN, a: ACCOUNT });

  beforeEach(() => {
    lastCard = null;
  });

  it('부분 거부 — 선매수 켜기(마스터 · 매도 · 상한가 채움 동반)의 매도가 눕혀진 ERROR 뒤 같은 제출의 에코 → 「선매수 체크 — 매수주문도 켬」 · 「다른 단말」 0 · 거부 원문 줄 유지 · 전송 0', async () => {
    const before = echo({ buyEnabled: false, preBuyEnabled: false, sellEnabled: false });
    setRelay({ limitChasers: [before] });
    const { rerender } = render(<Card />);
    const cfg = echo({
      buyEnabled: true,
      preBuyEnabled: true,
      sellEnabled: true,
      sellOrderPrice: 150_800,
    });
    act(() => {
      lastCard!.handleSent(sentOf(cfg));
    });

    // gh-trade 가 매도만 눕히고 ERROR 를 먼저 보낸다.
    const rej = rejection();
    setRelay({ limitChasers: [before], messages: [rej] });
    rerender(<Card />);
    await waitFor(() => expect(serverError()).not.toBeNull());

    // 저장 뒤 같은 제출의 에코 — 매도는 눕혀진 채(OFF) 선매수 · 마스터 · 상한가 채움은 섰다.
    const answered = echo({
      buyEnabled: true,
      preBuyEnabled: true,
      sellEnabled: false,
      sellOrderPrice: 150_800,
    });
    setRelay({ limitChasers: [answered], lastLimitChaserEcho: answered, messages: [rej] });
    rerender(<Card />);

    await waitFor(() =>
      expect(texts().some((x) => x.includes(TRANSITION_TEXT.preBuyWithMasterOn))).toBe(true),
    );
    expect(texts().some((x) => x.includes('매도 설정이 불완전합니다'))).toBe(true);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('부분 거부 · serverFold — `handleSent(cfg{buyEnabled:false}, serverFold)` → ERROR → 같은 제출의 마스터 OFF 에코 → 로그 최상단 서버 접힘 한 줄 · 전송 0', async () => {
    const on = echo({ buyEnabled: true, sellEnabled: true });
    setRelay({ limitChasers: [on] });
    const { rerender } = render(<Card />);
    const off = echo({ buyEnabled: false, sellEnabled: true });
    act(() => {
      lastCard!.handleSent(sentOf(off), { cause: 'serverFold' });
    });

    const rej = rejection('취소 설정이 불완전합니다(매도 비교가격 0 / 취소잔량 0 / 매도 체결수량 0 / 잔량추적 비율 1~90 밖) — 취소를 켜지 않았습니다');
    setRelay({ limitChasers: [on], messages: [rej] });
    rerender(<Card />);
    await waitFor(() => expect(serverError()).not.toBeNull());

    setRelay({ limitChasers: [off], lastLimitChaserEcho: off, messages: [rej] });
    rerender(<Card />);

    await waitFor(() => expect(top()).toBe(FOLD));
    expect(texts().some((x) => x === TRANSITION_TEXT.buyDisarmed)).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('다른 탭 거부 팬아웃 — 같은 전략을 연 다른 탭의 거부 통지가 이 탭의 귀속을 지우지 않는다 → 이 탭 제출의 에코에 「서버 반영 완료」 · 「다른 단말」 0 · 전송 0', async () => {
    const before = echo({ sellOrderPrice: 100_000 });
    setRelay({ limitChasers: [before] });
    const { rerender } = render(<Card />);
    const cfg = echo({ sellOrderPrice: 120_000 });
    act(() => {
      lastCard!.handleSent(sentOf(cfg));
    });

    // 다른 탭의 제출이 거부됐다 — ServerMessage 는 사용자의 모든 소켓으로 팬아웃돼 이 탭에도 온다.
    const rej = rejection('알 수 없는 거래소입니다 — 상따 전략을 등록하지 않았습니다');
    setRelay({ limitChasers: [before], messages: [rej] });
    rerender(<Card />);
    await waitFor(() => expect(serverError()).not.toBeNull());

    // 이 탭 제출의 에코.
    const answered = echo({ sellOrderPrice: 120_000 });
    setRelay({ limitChasers: [answered], lastLimitChaserEcho: answered, messages: [rej] });
    rerender(<Card />);

    await waitFor(() => expect(top()).toBe(TRANSITION_TEXT.valuesApplied));
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('창 안 무관 에코(비소비) — 거부 뒤 내 요청 변화를 싣지 않은 다른 단말 에코 → 서버 접힘 0 · 「서버 반영 완료」 · 이어 같은 창 안 내 마스터 OFF 에코 → 서버 접힘 한 줄(귀속이 남아 있었다) · 전송 0', async () => {
    const on = echo({ buyEnabled: true, sellEnabled: true, sellOrderPrice: 100_000 });
    setRelay({ limitChasers: [on] });
    const { rerender } = render(<Card />);
    const off = echo({ buyEnabled: false, sellEnabled: true, sellOrderPrice: 100_000 });
    act(() => {
      lastCard!.handleSent(sentOf(off), { cause: 'serverFold' });
    });

    const rej = rejection();
    setRelay({ limitChasers: [on], messages: [rej] });
    rerender(<Card />);
    await waitFor(() => expect(serverError()).not.toBeNull());

    // 다른 단말의 매도 주문가격 변경 — 마스터는 ON 그대로(내 요청 변화 없음).
    const other = echo({ buyEnabled: true, sellEnabled: true, sellOrderPrice: 110_000 });
    setRelay({ limitChasers: [other], lastLimitChaserEcho: other, messages: [rej] });
    rerender(<Card />);
    await waitFor(() => expect(top()).toBe(TRANSITION_TEXT.valuesApplied));
    expect(texts().some((x) => x.includes(FOLD))).toBe(false);

    // 같은 창 안에 내 제출의 마스터 OFF 에코 — 귀속은 소비되지 않고 남아 있었다.
    act(() => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS);
    });
    const mine = echo({ buyEnabled: false, sellEnabled: true, sellOrderPrice: 110_000 });
    setRelay({ limitChasers: [mine], lastLimitChaserEcho: mine, messages: [rej] });
    rerender(<Card />);

    await waitFor(() => expect(top()).toBe(FOLD));
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('거부 없는 경합(비소비) — 내 제출 뒤 내 요청 변화가 없는 다른 단말 에코(매도 매수잔량) → 「서버 반영 완료」 → 내 에코 → 「서버 반영 완료」 한 줄 더 · 전송 0', async () => {
    const before = echo({ sellOrderPrice: 100_000 });
    setRelay({ limitChasers: [before] });
    const { rerender } = render(<Card />);
    const cfg = echo({ sellOrderPrice: 120_000 });
    act(() => {
      lastCard!.handleSent(sentOf(cfg));
    });

    // 내 에코보다 먼저 온 다른 단말의 매도 매수잔량 변경 — 내 요청(매도 주문가격) 변화는 없다.
    const other = echo({ sellOrderPrice: 100_000, sellWatchQty: 330_000 });
    setRelay({ limitChasers: [other], lastLimitChaserEcho: other });
    rerender(<Card />);
    await waitFor(() => expect(top()).toBe(TRANSITION_TEXT.valuesApplied));
    const beforeAnswer = texts().length;

    const answered = echo({ sellOrderPrice: 120_000, sellWatchQty: 330_000 });
    setRelay({ limitChasers: [answered], lastLimitChaserEcho: answered });
    rerender(<Card />);

    await waitFor(() => expect(texts()).toHaveLength(beforeAnswer + 1));
    expect(top()).toBe(TRANSITION_TEXT.valuesApplied);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('정책 명시(24-24 사용자 확인) — 거부 뒤 창 안에 온, 내 제출과 같은 변화(마스터 OFF)를 싣은 에코는 내 답으로 읽는다 → 서버 접힘 한 줄 · 전송 0', async () => {
    /*
      다른 단말이 우연히 같은 마스터 OFF 를 만든 에코일 수도 있다. 그러나 다른 탭 거부 팬아웃 뒤 온 내 에코와 구조적으로
      같은 모양이라 구별할 수 없고(relay 소켓 상관은 이월), 에코 상태는 내가 요청한 것과 같다 — 표시 · 로그가 사실과
      어긋나지 않는다. 창이 닫힌 뒤의 같은 모양 에코는 WR-05 describe 의 거부 두 케이스가 다룬다(종전 전이 문장).
    */
    const on = echo({ buyEnabled: true, sellEnabled: true });
    setRelay({ limitChasers: [on] });
    const { rerender } = render(<Card />);
    const off = echo({ buyEnabled: false, sellEnabled: true });
    act(() => {
      lastCard!.handleSent(sentOf(off), { cause: 'serverFold' });
    });

    const rej = rejection('매수 설정이 불완전합니다(매수가/비교가 0) — 매수를 켜지 않았습니다');
    setRelay({ limitChasers: [on], messages: [rej] });
    rerender(<Card />);
    await waitFor(() => expect(serverError()).not.toBeNull());

    act(() => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS);
    });
    const same = echo({ buyEnabled: false, sellEnabled: true });
    setRelay({ limitChasers: [same], lastLimitChaserEcho: same, messages: [rej] });
    rerender(<Card />);

    await waitFor(() => expect(top()).toBe(FOLD));
    expect(sendMock).not.toHaveBeenCalled();
  });
});

/**
 * 24-REVIEW-R3 R3-WR-01 — gh-trade `ProcessSetLimitChaser` 는 부분 거부 때 그 항만 눕히고 ERROR 를 **먼저** 보낸 뒤
 * 저장하고 같은 제출의 에코를 보낸다. 두 프레임은 다른 렌더에 온다. 카드가 ERROR 에 답 신호와 **거부 신호**를 함께
 * 올리면 폼 훅은 in-flight 판정을 에코까지 유예한다 — 카드 + 폼 + 훅의 실제 배관으로 잠근다.
 */
describe('R3-WR-01 — 부분 거부 ERROR 가 에코보다 먼저 와도 in-flight 는 같은 제출의 에코로 판정한다 (24-REVIEW-R3)', () => {
  const texts = () =>
    Array.from(logRows()).map((r) => r.querySelectorAll('span')[1]?.textContent ?? '');
  const FAILED = '반영하지 못했어요';
  const failedShown = () => (document.body.textContent ?? '').includes(FAILED);
  const autoPre = () => texts().filter((x) => x.startsWith('선매수 자동 체크 — '));
  /** 부분 거부 — 에코에 선 항목만 「켬」 · 에코에 무장으로 서지 않은 매도주문은 무장 안 됨(R3-G1 · 24-REVIEW-R4 R4-WR-01 · R5-WR-02). */
  const PRE_PARTIAL =
    '선매수 자동 체크 — 켬: 매도>잔량추적 · 매도>체결 · 취소 · 취소>체결 · 취소>잔량추적 / 켜지 않음: 매도주문(무장 안 됨) / 매도 주문가격·비교가격 = 상한가 150,800원';

  beforeEach(() => {
    lastCard = null;
  });

  it('선매수 켬(in-flight) · 추가매수 켬(대기) → 매도만 눕힌 ERROR 먼저 → 실패 0 · 스위치 유지 → 같은 제출 에코(선매수 ON · 매도 OFF) → 추가매수 1건 전송 · 「선매수 자동 체크 — 」 한 줄', async () => {
    // 매수1호가 ≠ 비교가격 — D-36 추가매수 상한가 차단이 걸리지 않는다.
    const q = quote({ bp: Array.from({ length: 10 }, (_, i) => 129_500 - i * 500) });
    // GC-WR-04 폼 테스트의 idle 모양 — 마스터 OFF · 세 그룹 OFF · 매도 가격 0(자동 체크가 상한가로 채움) · 두 그룹 금액 > 0.
    const before = echo({
      buyEnabled: false,
      buyOrderAmount: 50,
      sellOrderPrice: 0,
      sellWatchPrice: 0,
      sellWatchQty: 10,
      extraBuyOrderAmount: 50,
    });
    setRelay({ limitChasers: [before], quote: q });
    const { rerender } = render(<Card />);

    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: '선매수 켜기' }));
    });
    expect(lcSets()).toHaveLength(1);
    expect(lcSets()[0]!.cfg).toMatchObject({ preBuyEnabled: true, buyEnabled: true, sellEnabled: true, sellOrderPrice: 150_800 });
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: '추가매수 켜기' }));
    });
    // 선매수가 나가 있다 — 추가매수 켜기는 대기열에 선다(D-35).
    expect(lcSets()).toHaveLength(1);

    // gh-trade 가 매도만 눕히고 ERROR 를 먼저 보낸다 — 이 렌더에 서버 값은 아직 그대로다.
    const rej = msg({
      lv: 'ERROR',
      src: 'SetLimitChaser',
      i: ISIN,
      a: ACCOUNT,
      m: '매도 설정이 불완전합니다(주문가/감시가 0, 매도비율 1~100 밖, 잔량추적 비율 1~90 밖) — 매도를 켜지 않았습니다',
    });
    setRelay({ limitChasers: [before], quote: q, messages: [rej] });
    rerender(<Card />);
    await waitFor(() => expect(serverError()).not.toBeNull());
    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    expect(failedShown()).toBe(false);
    expect(screen.getByRole('switch', { name: '선매수 켜기' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: '추가매수 켜기' })).toHaveAttribute('aria-checked', 'true');
    expect(lcSets()).toHaveLength(1);

    // 저장 뒤 같은 제출의 에코 — 매도는 눕혀진 채(OFF) 마스터 · 선매수 · 나머지 체크 · 상한가 채움은 섰다.
    const answered = echo({
      ...before,
      buyEnabled: true,
      preBuyEnabled: true,
      sellEnabled: false,
      sellQtyTrackEnabled: true,
      sellTradeQtyEnabled: true,
      cancelQtyEnabled: true,
      cancelTradeEnabled: true,
      cancelQtyTrackEnabled: true,
      sellOrderPrice: 150_800,
      sellWatchPrice: 150_800,
    });
    // 같은 메시지 객체를 다시 넘긴다 — 카드가 ERROR 를 두 번 처리하지 않는다.
    setRelay({ limitChasers: [answered], lastLimitChaserEcho: answered, quote: q, messages: [rej] });
    rerender(<Card />);

    await waitFor(() => expect(lcSets()).toHaveLength(2));
    // R4-WR-01 — 대기 추가매수는 방금 서버가 눕힌 매도주문을 다시 싣지 않는다(훅 ⑬ 눕힌 동반).
    expect(lcSets()[1]!.cfg).toMatchObject({ extraBuyEnabled: true, preBuyEnabled: true, sellEnabled: false });
    await waitFor(() => expect(autoPre()).toHaveLength(1));
    // R3-G1 · R5-WR-02 — 줄은 에코에 선 항목만 「켬」 · 무장으로 서지 않은 매도주문은 「켜지 않음(무장 안 됨)」 · error.
    expect(autoPre()).toEqual([PRE_PARTIAL]);
    const preRow = Array.from(logRows()).find((r) => (r.querySelectorAll('span')[1]?.textContent ?? '') === PRE_PARTIAL);
    expect(preRow?.getAttribute('data-level')).toBe('error');
    expect(lcSets()).toHaveLength(2);
    expect(failedShown()).toBe(false);
    expect(screen.getByRole('switch', { name: '선매수 켜기' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: '추가매수 켜기' })).toHaveAttribute('aria-checked', 'true');
  });
});

/**
 * Phase 27 Plan 05 Task 2 — 41(바로시작 · 중지) 응답 대기 기계 (D-06 · D-08 · D-09).
 *
 * `lc.arm` in-flight 의 복제지만 해제 조건이 다르다 — 그 키의 아무 에코가 아니라 **기대 전이**
 * (start → state 3 ∧ enabled · stop → !enabled), 또는 41 거부 3출처(AutoSellCommand · Account · Relay),
 * 또는 3초 무응답(「미반영」 · 재전송 없음)이다. 버튼 렌더 전이라 카드 상태 `onAutoSellCommand` 를 직접 부른다.
 */
describe('Phase 27 41 in-flight', () => {
  const texts = () =>
    Array.from(logRows()).map((r) => r.querySelectorAll('span')[1]?.textContent ?? '');
  const hasText = (t: string) => texts().some((x) => x.includes(t));
  const asCmds = () =>
    sendMock.mock.calls
      .map(([m]) => m as { t?: string; action?: string })
      .filter((m) => m?.t === 'autosell.cmd');
  const press = (action: 'start' | 'stop') =>
    act(() => {
      lastCard!.onAutoSellCommand(action);
    });
  const watching = echo({ sellEnabled: true, autoSellEnabled: true, autoSellState: 1, autoSellRatioPct: 10, autoSellMethod: 3 });
  const REJECT_HOLD = '자동매도 바로시작 거부 — 보유수량 0';
  const REJECT_ACCOUNT = '이 세션에 등록되지 않은 계좌입니다 — 자동매도 명령 거부 (계좌 등록 후 다시 시도하세요)';

  it('start → autosell.cmd 1건(isin · 계좌 · 거래소 · action) · pending start · 두 번째 호출 · 비활성 action 무시', () => {
    setRelay({ limitChasers: [watching] });
    render(<Card />);
    press('start');
    expect(asCmds()).toEqual([
      { t: 'autosell.cmd', isin: ISIN, accountNo: ACCOUNT, exchange: 'KRX', action: 'start' },
    ]);
    expect(lastCard!.autoSellPending).toBe('start');
    press('start');
    press('stop');
    expect(asCmds()).toHaveLength(1);
  });

  it('state 3 에코에 start 는 보내지 않는다 · stop 은 보낸다(버튼 규칙과 같은 판정)', () => {
    setRelay({ limitChasers: [echo({ autoSellEnabled: true, autoSellState: 3 })] });
    render(<Card />);
    press('start');
    expect(asCmds()).toHaveLength(0);
    expect(lastCard!.autoSellPending).toBeNull();
    press('stop');
    expect(asCmds().map((m) => m.action)).toEqual(['stop']);
    expect(lastCard!.autoSellPending).toBe('stop');
  });

  it('server === null 이면 보내지 않는다 — 에코 state 1 뒤 삭제 에코로 null 이 된 다음 호출도 0건', () => {
    setRelay({ limitChasers: [] });
    const { rerender } = render(<Card />);
    press('start');
    expect(asCmds()).toHaveLength(0);

    setRelay({ limitChasers: [watching] });
    rerender(<Card />);
    const del = echo({ ...watching, crud: 'D' });
    setRelay({ limitChasers: [], lastLimitChaserEcho: del });
    rerender(<Card />);
    expect(lastCard!.server).toBeNull();
    press('start');
    expect(asCmds()).toHaveLength(0);
    expect(lastCard!.autoSellPending).toBeNull();
  });

  it('send false → pending 없음 · 3초 뒤에도 미반영 없음 · 재전송 없음', () => {
    sendMock.mockReturnValue(false);
    setRelay({ limitChasers: [watching] });
    render(<Card />);
    press('start');
    expect(lastCard!.autoSellPending).toBeNull();
    act(() => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS * 3);
    });
    expect(unacked()).toBeNull();
    expect(asCmds()).toHaveLength(1);
  });

  it('기대 전이 에코(state 3 ∧ enabled) → pending 해제 · 3초 지나도 미반영 없음', () => {
    setRelay({ limitChasers: [watching] });
    const { rerender } = render(<Card />);
    press('start');
    const e1 = echo({ ...watching, autoSellState: 3 });
    setRelay({ limitChasers: [e1], lastLimitChaserEcho: e1 });
    rerender(<Card />);
    expect(lastCard!.autoSellPending).toBeNull();
    act(() => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS * 3);
    });
    expect(unacked()).toBeNull();
    expect(asCmds()).toHaveLength(1);
  });

  it('stop 의 기대 전이 = !enabled — enabled true 인 런타임 에코로는 풀리지 않는다', () => {
    const running = echo({ autoSellEnabled: true, autoSellState: 3 });
    setRelay({ limitChasers: [running] });
    const { rerender } = render(<Card />);
    press('stop');
    const runtime = echo({ autoSellEnabled: true, autoSellState: 3, autoSellSoldQty: 500 });
    setRelay({ limitChasers: [runtime], lastLimitChaserEcho: runtime });
    rerender(<Card />);
    expect(lastCard!.autoSellPending).toBe('stop');
    const off = echo({ autoSellEnabled: false, autoSellState: 0, autoSellSoldQty: 500 });
    setRelay({ limitChasers: [off], lastLimitChaserEcho: off });
    rerender(<Card />);
    expect(lastCard!.autoSellPending).toBeNull();
  });

  it('기대 전이가 아닌 런타임 에코가 와도 41 타이머는 살아 있다 → 3초에 pending 해제 · 미반영 · 재전송 없음', () => {
    setRelay({ limitChasers: [watching] });
    const { rerender } = render(<Card />);
    press('start');
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    const e1 = echo({ ...watching, autoSellState: 2, autoSellSoldQty: 0, autoSellBasisPrice: 13_000 });
    setRelay({ limitChasers: [e1], lastLimitChaserEcho: e1 });
    rerender(<Card />);
    expect(lastCard!.autoSellPending).toBe('start');
    act(() => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS);
    });
    expect(lastCard!.autoSellPending).toBeNull();
    expect(unacked()?.textContent).toContain('미반영');
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(asCmds()).toHaveLength(1);
  });

  it('pending 중 54 ERROR AutoSellCommand(i · a 일치) → [상따] 원문 로그 · pending 해제 · 미반영 없음', async () => {
    setRelay({ limitChasers: [watching] });
    const { rerender } = render(<Card />);
    press('start');
    setRelay({
      limitChasers: [watching],
      messages: [msg({ lv: 'ERROR', src: 'AutoSellCommand', i: ISIN, a: ACCOUNT, m: REJECT_HOLD })],
    });
    rerender(<Card />);
    await waitFor(() => expect(hasText(`[상따] 서버가 거부했어요 — ${REJECT_HOLD}`)).toBe(true));
    expect(lastCard!.autoSellPending).toBeNull();
    act(() => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS * 3);
    });
    expect(unacked()).toBeNull();
    expect(asCmds()).toHaveLength(1);
  });

  it('다른 종목의 54 AutoSellCommand 거부는 이 카드의 pending 을 풀지 않는다', () => {
    setRelay({ limitChasers: [watching] });
    const { rerender } = render(<Card />);
    press('start');
    setRelay({
      limitChasers: [watching],
      messages: [msg({ lv: 'ERROR', src: 'AutoSellCommand', i: 'KR7247540008', a: ACCOUNT, m: REJECT_HOLD })],
    });
    rerender(<Card />);
    expect(lastCard!.autoSellPending).toBe('start');
  });

  it('pending 중 54 ERROR Account(i · a 일치 — 41 계좌 가드) → 원문 로그 · pending 해제 · 미반영 없음', async () => {
    setRelay({ limitChasers: [watching] });
    const { rerender } = render(<Card />);
    press('start');
    setRelay({
      limitChasers: [watching],
      messages: [msg({ lv: 'ERROR', src: 'Account', i: ISIN, a: ACCOUNT, m: REJECT_ACCOUNT })],
    });
    rerender(<Card />);
    await waitFor(() => expect(hasText(REJECT_ACCOUNT)).toBe(true));
    expect(lastCard!.autoSellPending).toBeNull();
    act(() => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS * 3);
    });
    expect(unacked()).toBeNull();
  });

  it('pending 중 54 ERROR Relay(i · a 빈) → 원문 로그가 선다 · pending 해제 · 미반영 없음', async () => {
    const RELAY_REJECT = '전략 세션이 준비되지 않았어요';
    setRelay({ limitChasers: [watching] });
    const { rerender } = render(<Card />);
    press('start');
    setRelay({
      limitChasers: [watching],
      messages: [msg({ lv: 'ERROR', src: 'Relay', i: '', a: '', m: RELAY_REJECT })],
    });
    rerender(<Card />);
    await waitFor(() => expect(hasText(RELAY_REJECT)).toBe(true));
    expect(lastCard!.autoSellPending).toBeNull();
    act(() => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS * 3);
    });
    expect(unacked()).toBeNull();
  });

  it('pending 이 아닐 때 같은 Relay 줄은 종전대로 그리지 않는다(표시 몫 불변)', () => {
    setRelay({ limitChasers: [watching] });
    const { rerender } = render(<Card />);
    const before = logRows().length;
    setRelay({
      limitChasers: [watching],
      messages: [msg({ lv: 'ERROR', src: 'Relay', i: '', a: '', m: '전략 세션이 준비되지 않았어요' })],
    });
    rerender(<Card />);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(logRows().length).toBe(before);
  });

  it('pending 중 54 INFO AutoSell 사유 줄 → 로그에만 · pending 유지(해제 대상 아님)', async () => {
    setRelay({ limitChasers: [watching] });
    const { rerender } = render(<Card />);
    press('start');
    setRelay({
      limitChasers: [watching],
      messages: [msg({ lv: 'INFO', src: 'AutoSell', i: ISIN, a: ACCOUNT, m: '자동매도 대기 → 매도중 (바로시작)' })],
    });
    rerender(<Card />);
    await waitFor(() => expect(hasText('[상따] 서버 통지 — 자동매도 대기 → 매도중 (바로시작)')).toBe(true));
    expect(lastCard!.autoSellPending).toBe('start');
  });
});
