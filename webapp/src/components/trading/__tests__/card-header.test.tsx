import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { RelayLimitChaser } from '@gh-radar/shared';

import { CardHeader, EXCHANGE_SEGMENT_TITLE, type CardHeaderProps } from '../card/card-header';

/**
 * Phase 18 Plan 06 Task 2 — 카드 헤더 (D-09 · D-10 · E7 · TRADE-09).
 *
 * 잠그는 것:
 *   - 거래소 세그먼트는 등록 여부와 무관하게 활성이다 — 토글은 카드가 보는 키의 거래소 축
 *     전환(quick-260923-pgv · D-10 잠금 절 대체). 그룹 `title` 은 전환 설명 한 줄.
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
  it('거래소 세그먼트는 언제나 활성 — 고르면 onExchangeChange 로 알리고 그룹 title 은 전환 설명이다', () => {
    const { props } = renderHeader();
    const [krx, nxt] = exchangeButtons();
    expect(krx.textContent).toBe('KRX');
    expect(nxt.textContent).toBe('NXT');
    expect(krx).not.toBeDisabled();
    expect(nxt).not.toBeDisabled();
    expect(exchangeGroup()).not.toHaveAttribute('aria-disabled');
    expect(EXCHANGE_SEGMENT_TITLE).toBe('거래소 전환 — 이 종목의 KRX·NXT 전략을 오가며 봐요');
    expect(exchangeGroup()).toHaveAttribute('title', EXCHANGE_SEGMENT_TITLE);
    expect(krx).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(nxt);
    expect(props.onExchangeChange).toHaveBeenCalledWith('NXT');
  });

  it('등록된 카드(ledServer 있음)에서도 세그먼트가 활성이다 (quick-260923-pgv)', () => {
    const { props } = renderHeader({ ledServer: echo() });
    for (const btn of exchangeButtons()) {
      expect(btn).not.toBeDisabled();
      expect(btn).not.toHaveAttribute('aria-disabled');
    }
    fireEvent.click(exchangeButtons()[1]);
    expect(props.onExchangeChange).toHaveBeenCalledTimes(1);
    expect(props.onExchangeChange).toHaveBeenCalledWith('NXT');
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

  it('code 가 있어도 헤더에 종목코드 글자·코드 조각 요소가 없다 (quick-260925-ptw)', () => {
    renderHeader({ code: '247540' });
    expect(header().textContent).not.toContain('247540');
    expect(header().querySelector('[data-part="code"]')).toBeNull();
    // ⓘ 는 코드가 있으니 활성(D-30 계약 유지).
    expect(screen.getByRole('button', { name: '종목정보' })).not.toBeDisabled();
  });

  it('l1 순서 = 토글(▶ 종목명) → ⓘ → 거래소 세그먼트 → 가격 · ✕ 는 l1/l2 밖 헤더 직계로 l1 바로 다음', () => {
    renderHeader();
    const l1 = header().querySelector('[data-slot="card-header-l1"]') as HTMLElement;
    const l2 = header().querySelector('[data-slot="card-header-l2"]') as HTMLElement;
    const kids = Array.from(l1.children) as HTMLElement[];
    expect(kids[0]).toBe(toggleButton());
    expect(kids[1]).toBe(screen.getByRole('button', { name: '종목정보' }));
    expect(kids[2].contains(exchangeGroup())).toBe(true);
    expect(kids[3].getAttribute('data-slot')).toBe('card-header-price');
    expect(l2.contains(screen.getByRole('button', { name: '종목정보' }))).toBe(false);

    const close = screen.getByRole('button', { name: '에코프로비엠 카드 닫기' });
    expect(close.parentElement).toBe(header());
    expect(l1.contains(close)).toBe(false);
    expect(l2.contains(close)).toBe(false);
    expect(l1.nextElementSibling).toBe(close);
    expect(close.nextElementSibling).toBe(l2);
  });

  it('종목명은 한 줄이다 — 두 줄(flex-col) 배치 래퍼가 없고 토글 안 자식은 캐럿 + 종목명뿐', () => {
    renderHeader();
    const btn = toggleButton();
    expect(btn.children).toHaveLength(2);
    expect(btn.children[1].getAttribute('data-part')).toBe('name');
    expect(btn.className).toContain('items-center');
    expect(btn.querySelector('.flex-col')).toBeNull();
  });

  it('E7 long-text — 종목명은 1줄 ellipsis 이고 전체가 title 에 담긴다', () => {
    const long = '아주아주긴이름을가진가상의종목홀딩스우선주스팩제구호';
    renderHeader({ name: long });
    const name = header().querySelector('[data-part="name"]') as HTMLElement;
    expect(name.textContent).toBe(long);
    expect(name).toHaveAttribute('title', long);
    expect(name.className).toContain('truncate');
    expect(name.className).toContain('min-w-0');
  });

  it('nameTitle 이 있으면 종목명 title 은 그것이다', () => {
    renderHeader({ nameTitle: '에코프로비엠 · 계좌 37728502101 · KRX' });
    const name = header().querySelector('[data-part="name"]') as HTMLElement;
    expect(name).toHaveAttribute('title', '에코프로비엠 · 계좌 37728502101 · KRX');
  });

  it('매수/매도/한방 스위치가 헤더 DOM 에 없다(D-12)', () => {
    renderHeader({ ledServer: echo({ sellEnabled: true, sweepEnabled: true }) });
    expect(within(header()).queryAllByRole('switch')).toHaveLength(0);
    expect(header().querySelector('[data-sw]')).toBeNull();
  });

  it('E7 overflow — 760 한 줄 결합은 lc 컨테이너 로컬 규칙이고 뷰포트 브레이크포인트가 없다', () => {
    renderHeader();
    const l2 = header().querySelector('[data-slot="card-header-l2"]') as HTMLElement;
    const close = screen.getByRole('button', { name: '에코프로비엠 카드 닫기' });
    expect(l2.className).toContain('@min-[760px]/lc:');
    expect(l2.className.split(/\s+/)).toEqual(expect.arrayContaining(['basis-full', 'order-last']));
    expect(close.className).toContain('@min-[760px]/lc:order-last');
    const all = Array.from(header().querySelectorAll('*')).map((el) => el.getAttribute('class') ?? '');
    for (const cls of [header().className, ...all]) expect(cls).not.toMatch(/(^|\s)(sm|md|lg|xl):/);
  });
});

describe('CardHeader — 접힌 카드 요약 (quick-260923-onn · 목업 ①A)', () => {
  const l2 = () => header().querySelector('[data-slot="card-header-l2"]') as HTMLElement;

  it('접힘: l2 = 점 3개(매수·매도·취소) + 「미체결 N」 + 「잔고 N주」 · ⓘ·✕ 는 헤더에 그대로', () => {
    renderHeader({
      open: false,
      ledServer: echo({ sellEnabled: true }),
      unfilledCount: 2,
      holdingQty: 1200,
    });
    const groups = l2().querySelectorAll('[data-slot="latch-led-dots"]');
    expect(groups).toHaveLength(1);
    const dots = Array.from(groups[0].querySelectorAll('[data-slot="latch-led"][data-variant="dot"]'));
    expect(dots.map((d) => d.getAttribute('data-kind'))).toEqual(['buy', 'sell', 'cancel']);
    expect(l2().querySelector('[data-slot="card-summary-unfilled"]')?.textContent).toBe('미체결 2');
    expect(l2().querySelector('[data-slot="card-summary-holding"]')?.textContent).toBe('잔고 1,200주');
    expect(screen.getByRole('button', { name: '종목정보' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '에코프로비엠 카드 닫기' })).toBeInTheDocument();
  });

  it('접힘: 미체결 0 · 보유 없음(null/0)이면 요약 칩을 그리지 않는다', () => {
    const { view } = renderHeader({ open: false, unfilledCount: 0, holdingQty: null });
    expect(header().querySelector('[data-slot="card-summary-unfilled"]')).toBeNull();
    expect(header().querySelector('[data-slot="card-summary-holding"]')).toBeNull();
    view.unmount();
    renderHeader({ open: false, unfilledCount: 0, holdingQty: 0 });
    expect(header().querySelector('[data-slot="card-summary-unfilled"]')).toBeNull();
    expect(header().querySelector('[data-slot="card-summary-holding"]')).toBeNull();
  });

  it('접힘: 매도 점 클릭 → onArm("sell") 1회 · onToggle 미호출(전파 차단)', () => {
    const { props } = renderHeader({ open: false, ledServer: echo({ sellEnabled: true }) });
    fireEvent.click(header().querySelector('[data-slot="latch-led"][data-kind="sell"]') as HTMLElement);
    expect(props.onArm).toHaveBeenCalledTimes(1);
    expect(props.onArm).toHaveBeenCalledWith('sell');
    expect(props.onToggle).not.toHaveBeenCalled();
  });

  it('펼침: 칩 3개 풀 라벨 그대로 · 점·요약 칩 없음', () => {
    renderHeader({
      open: true,
      ledServer: echo({ sellEnabled: true, buyEnabled: false }),
      unfilledCount: 2,
      holdingQty: 1200,
    });
    expect(header().querySelectorAll('[data-variant="dot"]')).toHaveLength(0);
    expect(header().querySelector('[data-slot="latch-led-dots"]')).toBeNull();
    expect(header().querySelector('[data-slot="card-summary-unfilled"]')).toBeNull();
    expect(header().querySelector('[data-slot="card-summary-holding"]')).toBeNull();
    const leds = Array.from(header().querySelectorAll('[data-slot="latch-led"]'));
    expect(leds).toHaveLength(3);
    expect(leds[0].textContent).toContain('OFF');
    expect(leds[1].textContent).toContain('대기');
  });

  it('접힘 헤더에도 뷰포트 브레이크포인트 클래스가 없다(D-28)', () => {
    renderHeader({ open: false, ledServer: echo({ sellEnabled: true }), unfilledCount: 3, holdingQty: 10 });
    const all = Array.from(header().querySelectorAll('*')).map((el) => el.getAttribute('class') ?? '');
    for (const cls of [header().className, ...all]) expect(cls).not.toMatch(/(^|\s)(sm|md|lg|xl|2xl):/);
  });
});

describe('CardHeader — 거래소 선택지 (quick-260923-pq2)', () => {
  const singleLabel = () =>
    document.querySelector('[data-slot="card-exchange-segment"][data-single="true"]') as HTMLElement | null;

  it('① exchangeChoices 미지정(모름) → radio 2개', () => {
    renderHeader();
    expect(exchangeButtons()).toHaveLength(2);
    expect(singleLabel()).toBeNull();
  });

  it("② exchangeChoices ['KRX','NXT'] → radio 2개", () => {
    renderHeader({ exchangeChoices: ['KRX', 'NXT'] });
    expect(exchangeButtons().map((b) => b.textContent)).toEqual(['KRX', 'NXT']);
    expect(singleLabel()).toBeNull();
  });

  it("③ exchangeChoices ['KRX'] → 세그먼트를 그리지 않는다(NXT 미거래 종목 · 2026-09-23)", () => {
    renderHeader({ exchangeChoices: ['KRX'] });
    expect(screen.queryByRole('group', { name: '거래소' })).toBeNull();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(document.querySelector('[data-slot="card-exchange-segment"]')).toBeNull();
  });
});
