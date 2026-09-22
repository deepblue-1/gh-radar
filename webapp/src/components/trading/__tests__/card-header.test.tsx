import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { RelayLimitChaser } from '@gh-radar/shared';

import { CardHeader, EXCHANGE_LOCKED_TITLE, type CardHeaderProps } from '../card/card-header';

/**
 * Phase 18 Plan 06 Task 2 — 카드 헤더 (D-09 · D-10 · E7 · TRADE-09).
 *
 * 잠그는 것:
 *   - 등록된 카드의 거래소 세그먼트는 세 경로(`disabled`·`aria-disabled`·`title`)로 잠긴다.
 *     거래소는 전략 키의 일부라 바뀌면 **다른 전략**을 조작하게 된다(T-18-27).
 *   - 헤더 안 컨트롤(세그먼트·LED·ⓘ·✕)은 펼침 토글을 일으키지 않는다(전파 차단).
 *   - LED 는 기존 `LatchLed`(= `latchLedStateOf` 규칙표) 그대로다(T-18-28).
 *   - 매수/매도/한방 스위치는 헤더에 없다(D-12).
 */

const ISIN = 'KR7086520004';
const ACCOUNT = '37728502101';

function echo(over: Partial<RelayLimitChaser> = {}): RelayLimitChaser {
  return {
    isin: ISIN,
    accountNo: ACCOUNT,
    market: 'K',
    exchange: 'KRX',
    crud: 'C',
    key: `${ISIN}:${ACCOUNT}:KRX`,
    buyOrderPrice: 130_000,
    buyOrderQty: 1,
    buyWatchPrice: 130_000,
    buyWatchQty: 10_000,
    buyMinTradeQty: 30_000,
    buyWatchSide: '1',
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

function renderHeader(over: Partial<CardHeaderProps> = {}) {
  const props: CardHeaderProps = {
    name: '에코프로비엠',
    code: '247540',
    exchange: 'KRX',
    onExchangeChange: vi.fn(),
    exchangeLocked: false,
    price: 130_000,
    changeRate: 12.5,
    ledServer: null,
    onArm: vi.fn(),
    open: true,
    onToggle: vi.fn(),
    toggleId: 'card-KR7086520004-toggle',
    controlsId: 'card-KR7086520004-body',
    onInfo: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  const view = render(<CardHeader {...props} />);
  return { props, view };
}

const header = () => document.querySelector('[data-slot="card-header"]') as HTMLElement;
const toggleButton = () => document.getElementById('card-KR7086520004-toggle') as HTMLButtonElement;
const exchangeGroup = () => screen.getByRole('group', { name: '거래소' });
const exchangeButtons = () => within(exchangeGroup()).getAllByRole('radio');

describe('CardHeader', () => {
  it('등록 전(서버 전략 없음) 카드 — 거래소 세그먼트가 활성이고 고르면 onExchangeChange 로 알린다', () => {
    const { props } = renderHeader({ exchangeLocked: false });
    const [krx, nxt] = exchangeButtons();
    expect(krx.textContent).toBe('KRX');
    expect(nxt.textContent).toBe('NXT');
    expect(krx).not.toBeDisabled();
    expect(nxt).not.toBeDisabled();
    expect(exchangeGroup()).not.toHaveAttribute('aria-disabled');
    expect(krx).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(nxt);
    expect(props.onExchangeChange).toHaveBeenCalledWith('NXT');
  });

  it('등록된 카드 — 세그먼트가 disabled + aria-disabled="true" + 잠김 사유 title 로 잠긴다', () => {
    const { props } = renderHeader({ exchangeLocked: true });
    expect(EXCHANGE_LOCKED_TITLE).toBe('거래소는 전략 키의 일부라 등록 후에는 바꿀 수 없어요');
    const group = exchangeGroup();
    expect(group).toHaveAttribute('aria-disabled', 'true');
    expect(group).toHaveAttribute('title', EXCHANGE_LOCKED_TITLE);
    for (const btn of exchangeButtons()) {
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('aria-disabled', 'true');
      expect(btn).toHaveAttribute('title', EXCHANGE_LOCKED_TITLE);
    }
    fireEvent.click(exchangeButtons()[1]);
    expect(props.onExchangeChange).not.toHaveBeenCalled();
  });

  it('E7 loading — 시세 미수신이면 현재가·등락률이 「—」다', () => {
    renderHeader({ price: null, changeRate: null });
    const px = header().querySelector('[data-slot="card-header-price"]') as HTMLElement;
    expect(px.querySelector('[data-part="price"]')?.textContent).toBe('—');
    expect(px.querySelector('[data-part="rate"]')?.textContent).toBe('—');
    expect(px.className).toContain('text-[var(--flat)]');
  });

  it('시세가 있으면 현재가·부호 붙은 등락률을 방향색으로 그린다', () => {
    renderHeader({ price: 130_000, changeRate: 12.5 });
    const px = header().querySelector('[data-slot="card-header-price"]') as HTMLElement;
    expect(px.querySelector('[data-part="price"]')?.textContent).toBe('130,000');
    expect(px.querySelector('[data-part="rate"]')?.textContent).toBe('+12.50%');
    expect(px.className).toContain('text-[var(--up)]');
  });

  it('E7 loading — 서버 전략이 없으면 LED 3칩이 매수·매도·취소 순서로 전부 「OFF」다', () => {
    renderHeader({ ledServer: null });
    const leds = Array.from(header().querySelectorAll('[data-slot="latch-led"]'));
    expect(leds.map((l) => l.getAttribute('data-kind'))).toEqual(['buy', 'sell', 'cancel']);
    for (const led of leds) {
      expect(led.getAttribute('data-tone')).toBe('off');
      expect(led.textContent).toContain('OFF');
    }
  });

  it('LED 는 latchLedStateOf 규칙표 그대로다 — 무장+래치 잠복 매수는 「대기」이고 누르면 onArm', () => {
    const { props } = renderHeader({ ledServer: echo({ buyEnabled: true, buyEntryLatched: false }) });
    const buy = header().querySelector('[data-slot="latch-led"][data-kind="buy"]') as HTMLElement;
    expect(buy.textContent).toContain('대기');
    fireEvent.click(buy);
    expect(props.onArm).toHaveBeenCalledWith('buy');
    // LED 클릭은 펼침 토글이 아니다.
    expect(props.onToggle).not.toHaveBeenCalled();
  });

  it('헤더 토글 버튼이 aria-expanded·aria-controls 를 갖고, 누르면 onToggle 1회 + 포커스가 그 버튼으로 돌아온다', async () => {
    const { props, view } = renderHeader({ open: false });
    const btn = toggleButton();
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn).toHaveAttribute('aria-controls', 'card-KR7086520004-body');
    fireEvent.click(btn);
    expect(props.onToggle).toHaveBeenCalledTimes(1);
    // 펼친 상태로 재렌더돼도 같은 id 의 버튼이 포커스를 받는다(스택 ↔ 격자 이동 대비).
    view.rerender(<CardHeader {...props} open />);
    expect(toggleButton()).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(document.activeElement).toBe(toggleButton()));
  });

  it('헤더 빈 자리를 눌러도 펼침이 토글된다(헤더 전체가 클릭 영역)', () => {
    const { props } = renderHeader();
    fireEvent.click(header());
    expect(props.onToggle).toHaveBeenCalledTimes(1);
  });

  it('세그먼트·LED·ⓘ·✕ 클릭은 onToggle 을 부르지 않는다(전파 차단)', () => {
    const { props } = renderHeader({ ledServer: echo() });
    fireEvent.click(exchangeButtons()[1]);
    fireEvent.click(exchangeGroup());
    fireEvent.click(header().querySelector('[data-slot="latch-led"][data-kind="sell"]') as HTMLElement);
    fireEvent.click(header().querySelector('[data-slot="latch-led"][data-kind="buy"]') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: '종목정보' }));
    fireEvent.click(screen.getByRole('button', { name: '에코프로비엠 카드 닫기' }));
    expect(props.onToggle).not.toHaveBeenCalled();
    expect(props.onInfo).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('✕ 는 aria-label 「{종목명} 카드 닫기」 · title 「카드 제거」, ⓘ 는 원문 title/aria-label', () => {
    renderHeader();
    const close = screen.getByRole('button', { name: '에코프로비엠 카드 닫기' });
    expect(close).toHaveAttribute('title', '카드 제거');
    const info = screen.getByRole('button', { name: '종목정보' });
    expect(info).toHaveAttribute('title', '종목정보 (차트 · 종목정보 · 뉴스·토론)');
    expect(info).not.toBeDisabled();
  });

  it('code 가 없는 카드(돌파 유래 · relay lookup 실패)는 ⓘ 가 disabled 다', () => {
    const { props } = renderHeader({ code: null, name: ISIN });
    const info = screen.getByRole('button', { name: '종목정보' });
    expect(info).toBeDisabled();
    fireEvent.click(info);
    expect(props.onInfo).not.toHaveBeenCalled();
    // 코드 조각은 그리지 않는다 — ISIN 을 코드 자리에 두 번 쓰지 않는다.
    expect(header().querySelector('[data-part="code"]')).toBeNull();
  });

  it('E7 long-text — 종목명은 1줄 ellipsis 이고 전체가 title 에 담긴다 · 코드는 mono', () => {
    const long = '아주아주긴이름을가진가상의종목홀딩스우선주스팩제구호';
    renderHeader({ name: long });
    const name = header().querySelector('[data-part="name"]') as HTMLElement;
    expect(name.textContent).toBe(long);
    expect(name).toHaveAttribute('title', long);
    expect(name.className).toContain('truncate');
    expect(header().querySelector('[data-part="code"]')?.className).toContain('mono');
  });

  it('매수/매도/한방 스위치가 헤더 DOM 에 없다(D-12)', () => {
    renderHeader({ ledServer: echo({ sellEnabled: true, sweepEnabled: true }) });
    expect(within(header()).queryAllByRole('switch')).toHaveLength(0);
    expect(header().querySelector('[data-sw]')).toBeNull();
  });

  it('E7 overflow — 760 한 줄 결합은 lc 컨테이너 로컬 규칙이고 뷰포트 브레이크포인트가 없다', () => {
    renderHeader();
    const l1 = header().querySelector('[data-slot="card-header-l1"]') as HTMLElement;
    const l2 = header().querySelector('[data-slot="card-header-l2"]') as HTMLElement;
    expect(l1.className).toContain('@min-[760px]/lc:');
    expect(l2.className).toContain('@min-[760px]/lc:');
    const all = Array.from(header().querySelectorAll('*')).map((el) => el.getAttribute('class') ?? '');
    for (const cls of [header().className, ...all]) expect(cls).not.toMatch(/(^|\s)(sm|md|lg|xl):/);
  });
});
