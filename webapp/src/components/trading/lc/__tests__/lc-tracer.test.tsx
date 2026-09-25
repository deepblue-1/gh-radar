import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { RelayLimitChaser } from '@gh-radar/shared';

/**
 * Phase 20 트레이서 (20-01 Task 1) — 「호가변경」 한 행의 **실제 경로 한 줄**.
 *
 * 행 클릭 → 인라인 입력(전체 선택) → Enter → `useLcFieldCommit` → `send({ t: 'lc.set' })` →
 * (relay → 게이트웨이 → 60 에코 = 여기서는 `limitChasers` 교체) → 행 값 갱신 + 900ms 강조.
 *
 * ★ 조립은 작업대와 같다 — `StrategyCard` + `CardBody variant="card"`. 카드 상태 훅의
 *   `answerSeq`(답 신호)·`handleSent`(3초 타이머)가 **진짜로** 폼까지 내려와야 트레이서가 성립한다.
 *   relay 모킹 하네스는 `strategy-card-flow.test.tsx` 와 같은 모양이다.
 * ★ D-06 — 값 필드는 낙관 반영하지 않는다. 행이 바뀌는 유일한 근거는 에코의 그 필드 값이
 *   보낸 값과 같을 때다(거부도 `answerSeq` 를 올린다 — Pitfall 1).
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

import { CardBody } from '../../card/card-body';
import { ACK_TIMEOUT_MS, StrategyCard } from '../../card/strategy-card';

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

/** 상따 거부 통지(54) — 카드가 `acceptAnswer` 로 답을 접수한다(에코는 없다). */
function rejection() {
  return {
    t: 'msg' as const,
    lv: 'ERROR',
    m: '한방 설정이 올바르지 않습니다',
    i: ISIN,
    a: ACCOUNT,
    src: 'SetLimitChaser',
    kind: '',
    receivedAt: '13:44:02',
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
      )}
    />
  );
}

const ROW = '[data-lc-field="lc-sweep-tick"]';
const INLINE_FAILED = '반영하지 못했어요 · Enter 로 다시 시도해 주세요';

const row = (): HTMLElement => document.querySelector(ROW) as HTMLElement;
const rowValue = (): HTMLElement =>
  document.querySelector(`${ROW} [data-slot="lc-row-value"]`) as HTMLElement;
const editor = (): HTMLInputElement | null =>
  document.querySelector<HTMLInputElement>('#lc-sweep-tick');
const lcSets = () =>
  sendMock.mock.calls
    .map(([m]) => m as { t?: string; cfg?: Record<string, unknown> })
    .filter((m) => m?.t === 'lc.set');

/** 행을 눌러 인라인 편집을 연다 — 마우스 기기 경로(D-14). */
function openEditor(): HTMLInputElement {
  expect(row(), '「호가변경」 값 행').not.toBeNull();
  act(() => {
    fireEvent.click(row());
  });
  const input = editor();
  expect(input).not.toBeNull();
  return input!;
}

/** 입력칸에 값을 치고 Enter — 확정 1회. */
function typeAndEnter(input: HTMLInputElement, value: string): void {
  act(() => {
    fireEvent.change(input, { target: { value } });
  });
  act(() => {
    fireEvent.keyDown(input, { key: 'Enter' });
  });
}

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

describe('트레이서 — 「호가변경」 한 행 (20-01 · D-04 · D-14 · D-14a · D-14c · D-20)', () => {
  it('① 토스식 44px 값 행이다 — 버튼 하나 · 이름 「호가변경 3건」 · 값 슬롯 「3건」', () => {
    setRelay({ limitChasers: [echo()] });
    render(<Card />);

    const el = row();
    expect(el).not.toBeNull();
    expect(el.tagName).toBe('BUTTON');
    expect(screen.getByRole('button', { name: '호가변경 3건' })).toBe(el);
    expect(rowValue().textContent).toBe('3건');
    expect(el.className).toContain('min-h-[44px]');
  });

  it('② 행 클릭 → 그 자리 입력칸 포커스 + 값 전체 선택 · 행 높이 클래스 그대로 · 안내 문구 0 (D-14a · D-14c)', () => {
    setRelay({ limitChasers: [echo()] });
    render(<Card />);

    const input = openEditor();
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('3');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    const wrap = input.closest('[data-lc-field]') as HTMLElement;
    expect(wrap.getAttribute('data-lc-field')).toBe('lc-sweep-tick');
    expect(wrap.getAttribute('data-editing')).toBe('true');
    expect(wrap.className).toContain('min-h-[44px]');

    const form = document.querySelector('[data-slot="limit-chaser-form"]') as HTMLElement;
    expect(form.textContent).not.toContain('Enter');
    expect(form.textContent).not.toContain('저장');
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull();
  });

  it('③ 5 → Enter = lc.set 정확히 1회 · cfg 는 서버 값 전체 + 바꾼 필드 1개 · 행은 에코 전까지 서버 값(D-04 · D-06 · T-20-03)', () => {
    setRelay({ limitChasers: [echo()] });
    render(<Card />);

    // 폼의 로컬 값을 서버와 다르게 만든다 — 그래도 cfg 에는 서버 값이 실려야 한다.
    act(() => {
      fireEvent.change(document.querySelector('#lc-sell-order-ratio') as HTMLInputElement, {
        target: { value: '50' },
      });
    });

    const input = openEditor();
    typeAndEnter(input, '5');

    expect(lcSets()).toHaveLength(1);
    const cfg = lcSets()[0]!.cfg!;
    expect(cfg.sweepMinTickCount).toBe(5);
    expect(cfg.sellOrderRatio).toBe(100);
    expect(Object.keys(cfg)).toHaveLength(32);

    // 반영 중 — 입력칸 잠김(에코 전).
    expect(editor()!.readOnly).toBe(true);
    expect(editor()!.getAttribute('aria-busy')).toBe('true');

    // 포커스를 빼면 편집이 끝나고 행은 **서버 값 그대로**다 — 값 필드 낙관 반영 없음(D-06).
    act(() => {
      fireEvent.blur(editor()!);
    });
    expect(editor()).toBeNull();
    expect(rowValue().textContent).toBe('3건');
    expect(row().getAttribute('aria-busy')).toBe('true');
    expect(lcSets()).toHaveLength(1);
  });

  it('④ 에코(sweepMinTickCount 5) → 편집기 닫힘 · 행 「5건」 · 값 글자 --primary 900ms 강조 (D-18)', () => {
    setRelay({ limitChasers: [echo()] });
    const { rerender } = render(<Card />);

    typeAndEnter(openEditor(), '5');
    expect(lcSets()).toHaveLength(1);

    setRelay({ limitChasers: [echo({ sweepMinTickCount: 5 })] });
    rerender(<Card />);

    expect(editor()).toBeNull();
    expect(rowValue().textContent).toBe('5건');
    expect(rowValue().className).toContain('text-[var(--primary)]');

    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(rowValue().className).not.toContain('text-[var(--primary)]');
    expect(lcSets()).toHaveLength(1);
  });

  it('⑤ 답만 오고 값이 다르면 실패 — 편집 유지 · 입력 5 유지 · 말풍선 · 재전송 0 → 이후 에코 5 = 성공(늦은 에코, D-06)', () => {
    setRelay({ limitChasers: [echo()] });
    const { rerender } = render(<Card />);

    typeAndEnter(openEditor(), '5');
    expect(lcSets()).toHaveLength(1);

    // 거부 통지 — 카드 `answerSeq` 만 오르고 서버 값은 3 그대로다(에코 없음).
    const messages = [rejection()];
    setRelay({ limitChasers: [echo()], messages });
    rerender(<Card />);

    expect(editor()).not.toBeNull();
    expect(editor()!.value).toBe('5');
    expect(editor()!.readOnly).toBe(false);
    const bubble = screen.getByText(INLINE_FAILED);
    expect(bubble.closest('[role="alert"]')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(lcSets()).toHaveLength(1);

    // 늦은 에코 — 내가 보낸 값이 서버에 선다.
    setRelay({ limitChasers: [echo({ sweepMinTickCount: 5 })], messages });
    rerender(<Card />);
    expect(editor()).toBeNull();
    expect(rowValue().textContent).toBe('5건');
    expect(screen.queryByText(INLINE_FAILED)).toBeNull();
    expect(lcSets()).toHaveLength(1);
  });

  it('⑥ send 가 false 면 「연결이 끊겨 보내지 못했어요」 · 행·폼 값 불변', () => {
    sendMock.mockReturnValue(false);
    setRelay({ limitChasers: [echo()] });
    render(<Card />);

    typeAndEnter(openEditor(), '5');
    expect(lcSets()).toHaveLength(1);
    expect(screen.getByText('연결이 끊겨 보내지 못했어요')).not.toBeNull();
    expect(editor()).not.toBeNull();

    act(() => {
      fireEvent.keyDown(editor()!, { key: 'Escape' });
    });
    expect(editor()).toBeNull();
    expect(rowValue().textContent).toBe('3건');
    expect(screen.queryByText('연결이 끊겨 보내지 못했어요')).toBeNull();
  });

  it('⑦ 같은 값(3) Enter = 전송 0 · Esc = 전송 0 · 행 「3건」', () => {
    setRelay({ limitChasers: [echo()] });
    render(<Card />);

    typeAndEnter(openEditor(), '3');
    expect(lcSets()).toHaveLength(0);
    expect(editor()).toBeNull();
    expect(rowValue().textContent).toBe('3건');

    const input = openEditor();
    act(() => {
      fireEvent.change(input, { target: { value: '9' } });
    });
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' });
    });
    expect(lcSets()).toHaveLength(0);
    expect(editor()).toBeNull();
    expect(rowValue().textContent).toBe('3건');
  });

  it('⑧ 미등록 전략(limitChasers [])에서 7 Enter = 전송 0 · 행 「7건」 로컬 반영 (A-P1)', () => {
    setRelay({ limitChasers: [] });
    render(<Card />);

    typeAndEnter(openEditor(), '7');
    expect(lcSets()).toHaveLength(0);
    expect(editor()).toBeNull();
    expect(rowValue().textContent).toBe('7건');
  });

  it('⑨ 편집 중 다른 필드 에코가 와도 입력값은 유지되고, 저장하면 내 값이 나간다 (UI-SPEC E4 partial)', () => {
    setRelay({ limitChasers: [echo()] });
    const { rerender } = render(<Card />);

    const input = openEditor();
    act(() => {
      fireEvent.change(input, { target: { value: '8' } });
    });
    setRelay({ limitChasers: [echo({ sweepMinTickCount: 4, buyWatchQty: 9_000 })] });
    rerender(<Card />);

    expect(editor()!.value).toBe('8');
    act(() => {
      fireEvent.keyDown(editor()!, { key: 'Enter' });
    });
    expect(lcSets()).toHaveLength(1);
    const cfg = lcSets()[0]!.cfg!;
    expect(cfg.sweepMinTickCount).toBe(8);
    expect(cfg.buyWatchQty).toBe(9_000);
  });
  it('⑩ 카드 3초 무응답(`unacked`)이 CardBody → 폼 → 훅까지 내려와 타임아웃 실패가 된다 · 재전송 0 (20-01 Task 2 · UI-SPEC A10)', () => {
    setRelay({ limitChasers: [echo()] });
    render(<Card />);

    typeAndEnter(openEditor(), '5');
    expect(lcSets()).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS);
    });

    // 카드 상태줄의 「미반영」과 폼의 실패가 **같은 신호**를 읽는다.
    expect(document.querySelector('[data-slot="card-unacked"]')).not.toBeNull();
    expect(screen.getByText(INLINE_FAILED)).not.toBeNull();
    expect(editor()!.value).toBe('5');
    expect(editor()!.readOnly).toBe(false);
    act(() => {
      vi.advanceTimersByTime(ACK_TIMEOUT_MS * 3);
    });
    expect(lcSets()).toHaveLength(1);
  });
});
