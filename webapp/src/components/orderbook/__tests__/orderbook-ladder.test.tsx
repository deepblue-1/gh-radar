import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RelayQuote } from '@gh-radar/shared';

import { OrderbookLadder } from '../orderbook-ladder';

/**
 * Phase 15 Plan 13 — 호가 사다리 계약 검증.
 *
 * 여기서 잠그는 것은 "보기 좋은가"가 아니라 **오주문으로 이어지는 규칙**이다:
 *   - 가격 클릭이 가격만 전달하는가(구분 자동 전환 없음)
 *   - 색 없이도 매도/매수를 구분할 수 있는가(sr-only 단계 라벨)
 *   - 재접속 중에 값이 사라지지 않는가
 *   - 잔량 바가 **단계 최대값** 정규화인가(누적이면 벽이 묻힌다)
 */

const BASE = 98_000;

function makeQuote(over: Partial<RelayQuote> = {}): RelayQuote {
  // 매도 1~10호가: 98,100 ~ 99,000 / 매수 1~10호가: 97,900 ~ 97,000
  const ap = Array.from({ length: 10 }, (_, i) => 98_100 + i * 100);
  const bp = Array.from({ length: 10 }, (_, i) => 97_900 - i * 100);
  return {
    t: 'q',
    i: 'KR7005930003',
    x: 'KRX',
    snap: true,
    p: 98_100,
    o: 97_500,
    h: 99_000,
    l: 97_000,
    c: 100,
    cs: '2',
    cr: 0.1,
    v: 1_000_000,
    va: 98_000_000_000,
    ap,
    aq: [10, 20, 30, 40, 50, 60, 70, 80, 90, 200],
    bp,
    bq: [15, 25, 35, 45, 55, 65, 75, 85, 95, 100],
    ta: 650,
    tb: 595,
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

/** tbody 의 가격 셀 수. tfoot 의 `총잔량` th 는 세지 않는다. */
function priceCellCount(container: HTMLElement): number {
  return container.querySelectorAll('tbody th[scope="row"]').length;
}

describe('OrderbookLadder', () => {
  it('① 매도 10단 + 매수 10단 20행을 렌더하고 각 가격에 sr-only 단계 라벨을 붙인다 (WCAG 1.4.1)', () => {
    const { container } = render(
      <OrderbookLadder
        quote={makeQuote()}
        depth={10}
        isStale={false}
        basePrice={BASE}
        onPriceClick={vi.fn()}
      />,
    );

    // tbody 의 가격 셀은 <th scope="row"> — 20개 (tfoot 의 `총잔량` 은 별개).
    expect(priceCellCount(container)).toBe(20);
    // 색에 의존하지 않는 방향 라벨.
    expect(screen.getByText(/매도 10호가/)).toBeInTheDocument();
    expect(screen.getByText(/매수 1호가/)).toBeInTheDocument();
    // 총잔량 행.
    expect(screen.getByText('650')).toBeInTheDocument();
    expect(screen.getByText('595')).toBeInTheDocument();
  });

  it('② 가격 클릭은 그 가격 하나만 전달한다 (T-15-14 — 매매 구분 자동 전환 금지)', async () => {
    const user = userEvent.setup();
    const onPriceClick = vi.fn();
    render(
      <OrderbookLadder
        quote={makeQuote()}
        depth={10}
        isStale={false}
        basePrice={BASE}
        onPriceClick={onPriceClick}
      />,
    );

    await user.click(screen.getByText(/매도 1호가/));
    expect(onPriceClick).toHaveBeenCalledTimes(1);
    expect(onPriceClick).toHaveBeenCalledWith(98_100);
  });

  it('③ roving tabindex — 표 전체가 tab stop 1개이고 ↓ + Enter 로 가격을 반영한다', () => {
    const onPriceClick = vi.fn();
    render(
      <OrderbookLadder
        quote={makeQuote()}
        depth={10}
        isStale={false}
        basePrice={BASE}
        onPriceClick={onPriceClick}
      />,
    );

    const table = screen.getByRole('table', {
      name: '호가 10단 (매도 10단계 · 매수 10단계)',
    });
    expect(table).toHaveAttribute('tabindex', '0');

    // 초기 활성 행 = 매도 10호가(99,000). ↓ 한 번이면 매도 9호가(98,900).
    fireEvent.keyDown(table, { key: 'ArrowDown' });
    fireEvent.keyDown(table, { key: 'Enter' });
    expect(onPriceClick).toHaveBeenCalledWith(98_900);

    fireEvent.keyDown(table, { key: 'ArrowUp' });
    fireEvent.keyDown(table, { key: 'Enter' });
    expect(onPriceClick).toHaveBeenLastCalledWith(99_000);
  });

  it('④ 호가가 없으면 빈 상태 문구를 그린다 (UI-SPEC verbatim)', () => {
    render(
      <OrderbookLadder
        quote={null}
        depth={10}
        isStale={false}
        basePrice={BASE}
        onPriceClick={vi.fn()}
      />,
    );

    expect(screen.getByText('호가 정보가 없어요')).toBeInTheDocument();
    expect(
      screen.getByText('장 시작(09:00) 이후 실시간 호가가 표시돼요.'),
    ).toBeInTheDocument();
  });

  it('⑤ 재접속 중(isStale)에도 값을 비우지 않고 opacity 로만 감쇠한다', () => {
    const { container } = render(
      <OrderbookLadder
        quote={makeQuote()}
        depth={10}
        isStale
        basePrice={BASE}
        onPriceClick={vi.fn()}
      />,
    );

    const root = screen.getByRole('table').closest('[data-slot="orderbook-ladder"]');
    expect(root).toHaveAttribute('data-stale', 'true');
    expect(root?.className).toContain('opacity-[.55]');
    // 값은 그대로 남아 있다.
    expect(priceCellCount(container)).toBe(20);
  });

  it('⑥ 잔량 바는 단계 최대값 정규화다 — 최대 잔량 행이 100%, 누적이 아니다 (L3=A)', () => {
    const { container } = render(
      <OrderbookLadder
        quote={makeQuote()}
        depth={10}
        isStale={false}
        basePrice={BASE}
        onPriceClick={vi.fn()}
      />,
    );

    // 매도 최대 잔량 = 200(매도 10호가, 첫 행). 매도 1호가는 10 → 5%.
    const askBars = Array.from(
      container.querySelectorAll('tr[data-side="ask"] span[aria-hidden="true"][style]'),
    ) as HTMLElement[];
    expect(askBars[0].style.width).toBe('100%');
    expect(askBars[askBars.length - 1].style.width).toBe('5%');

    // 누적이었다면 마지막(매도 1호가)이 100% 가 됐을 것이다.
    expect(askBars[askBars.length - 1].style.width).not.toBe('100%');
  });

  it('⑦ depth=5 는 6~10단을 좁은 폭에서만 접고 `10단 전체 보기` 로 펼친다 (M1, CSS 브레이크포인트)', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <OrderbookLadder
        quote={makeQuote()}
        depth={5}
        isStale={false}
        basePrice={BASE}
        onPriceClick={vi.fn()}
      />,
    );

    // 접힘은 DOM 제거가 아니라 CSS 클래스다 — 데스크톱(≥900px)에서는 20단이 그대로 보인다.
    expect(priceCellCount(container)).toBe(20);
    expect(container.querySelectorAll('.max-\\[899px\\]\\:hidden')).toHaveLength(10);

    await user.click(screen.getByRole('button', { name: '10단 전체 보기' }));
    expect(container.querySelectorAll('.max-\\[899px\\]\\:hidden')).toHaveLength(0);
    expect(
      screen.queryByRole('button', { name: '10단 전체 보기' }),
    ).not.toBeInTheDocument();
  });

  it('⑧ 사다리 내부에 accent 토큰(--primary)을 쓰지 않는다 (--primary == --down 오독 차단)', () => {
    const { container } = render(
      <OrderbookLadder
        quote={makeQuote()}
        depth={10}
        isStale={false}
        basePrice={BASE}
        onPriceClick={vi.fn()}
      />,
    );

    expect(container.innerHTML).not.toContain('--primary');
  });
});
