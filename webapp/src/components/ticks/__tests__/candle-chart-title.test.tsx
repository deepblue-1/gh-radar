import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { CandleChartTitle, type CandleChartTitleProps } from '../candle-chart-title';
import { DEFAULT_MA_CONFIG, type MaConfig, type MaLine } from '@/lib/ticks/candle-prefs';

/**
 * Phase 42 · D-05 · D-21 · UI-SPEC S4 — 봉 차트 제목 줄 배치(데스크톱 한 줄 · 폰 두 줄).
 *
 * 깨지면: 폰에서 칩을 더할 때마다 차트가 아래로 밀리거나, 확대 버튼 이름이 선 차트와 달라 조작이 어긋난다.
 */

function props(over: Partial<CandleChartTitleProps> = {}): CandleChartTitleProps {
  return {
    phone: false,
    kindSwitch: <span data-testid="kind-switch">스위치</span>,
    unitPref: 'auto',
    currentUnit: 5,
    onUnit: vi.fn(),
    ma: DEFAULT_MA_CONFIG,
    onMa: vi.fn(),
    ownLegend: true,
    spanLabel: '2.0시간',
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onFull: vi.fn(),
    onMinute: vi.fn(),
    onTenSec: vi.fn(),
    ...over,
  };
}

const root = () => document.querySelector<HTMLElement>('[data-slot="candle-chart-title"]')!;
const zoomNames = ['확대', '축소', '전체', '1분', '10초'] as const;
/** a 가 b 보다 DOM 앞인가. */
const before = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

const SIX_LONG: MaConfig = {
  v: 1,
  lines: [1, 2, 3, 4, 5, 6].map(
    (color): MaLine => ({ base: color % 2 ? 'bar' : 'day', n: 240 - color, kind: 'sma', on: true, color }),
  ),
};

describe('CandleChartTitle — 데스크톱 한 줄', () => {
  it('한 줄 flex-wrap · 순서 = 타임라인 → 스위치 → 봉 단위 → 이동평균 → 우리 범례 → 창 폭 → 확대 버튼 5개', () => {
    render(<CandleChartTitle {...props()} />);
    expect(root().dataset.dims).toBe('desktop');
    expect(root().className).toContain('flex-wrap');
    const order = [
      screen.getByRole('heading', { name: '타임라인' }),
      screen.getByTestId('kind-switch'),
      document.querySelector('[data-slot="candle-unit-button"]')!,
      screen.getByRole('group', { name: '이동평균' }),
      document.querySelector('[data-slot="candle-chart-own-legend"]')!,
      document.querySelector('[data-slot="candle-chart-span"]')!,
      ...zoomNames.map((n) => screen.getByRole('button', { name: n })),
    ];
    for (const el of order) expect(root()).toContainElement(el as HTMLElement);
    for (let i = 1; i < order.length; i++) expect(before(order[i - 1]!, order[i]!)).toBe(true);
    expect(document.querySelector('[data-slot="candle-chart-span"]')!.textContent).toBe('2.0시간');
    // 선 차트의 긴 범례 글자는 두지 않는다(판 제목 · 캡션 줄이 맡는다).
    expect(root().textContent).not.toContain('팀 주문 원');
    expect(screen.getByRole('button', { name: '확대' })).toHaveAttribute('title', '확대 (+)');
    expect(screen.getByRole('button', { name: '축소' })).toHaveAttribute('title', '축소 (−)');
    expect(screen.getByRole('button', { name: '전체' })).toHaveAttribute('title', '하루 전체 (0)');
  });

  it('ownLegend 가 없으면 우리 범례 없음', () => {
    render(<CandleChartTitle {...props({ ownLegend: false })} />);
    expect(document.querySelector('[data-slot="candle-chart-own-legend"]')).toBeNull();
  });
});

describe('CandleChartTitle — 폰 두 줄', () => {
  it('첫 줄 = 타임라인 · 스위치 · 확대 버튼 5개(h-8 min-w-7 px-1) · 창 폭 없음 / 둘째 줄 = 봉 단위 · 칩 줄 · 「＋」 · 우리 범례 없음', () => {
    render(<CandleChartTitle {...props({ phone: true })} />);
    expect(root().dataset.dims).toBe('phone');
    expect(root().className).toContain('grid');
    const [first, second] = Array.from(root().children) as HTMLElement[];
    expect(root().children).toHaveLength(2);
    expect(within(first!).getByRole('heading', { name: '타임라인' })).toBeInTheDocument();
    expect(within(first!).getByTestId('kind-switch')).toBeInTheDocument();
    for (const n of zoomNames) {
      const b = within(first!).getByRole('button', { name: n });
      expect(b.className).toContain('h-8 min-w-7 px-1');
    }
    expect(document.querySelector('[data-slot="candle-chart-span"]')).toBeNull();
    expect(document.querySelector('[data-slot="candle-chart-own-legend"]')).toBeNull();
    const unit = second!.querySelector('[data-slot="candle-unit-button"]')!;
    expect(unit).not.toBeNull();
    expect(unit.className).toContain('shrink-0');
    expect(second!.querySelector('[data-slot="candle-ma-chips"]')).not.toBeNull();
    expect(second!.querySelector('[data-slot="candle-ma-add"]')).not.toBeNull();
    expect(before(unit, second!.querySelector('[data-slot="candle-ma-chips"]')!)).toBe(true);
    expect(before(second!.querySelector('[data-slot="candle-ma-chips"]')!, second!.querySelector('[data-slot="candle-ma-add"]')!)).toBe(true);
  });

  it('칩 6개(「단순 235」 · 「일 238」 꼴 긴 이름)에서도 폰 제목 줄은 두 줄 · 칩 줄은 가로 밀기(줄바꿈 없음)', () => {
    render(<CandleChartTitle {...props({ phone: true, ma: SIX_LONG })} />);
    expect(root().children).toHaveLength(2);
    expect(document.querySelectorAll('[data-slot="candle-ma-chip"]')).toHaveLength(6);
    const strip = document.querySelector<HTMLElement>('[data-slot="candle-ma-chips"]')!;
    expect(strip.className).toContain('overflow-x-auto');
    expect(strip.className).not.toContain('flex-wrap');
  });
});

describe('CandleChartTitle — 확대 버튼', () => {
  it.each([false, true])('phone=%s — 「확대」 · 「축소」 · 「전체」 · 「1분」 · 「10초」 가 각 콜백을 한 번씩', (phone) => {
    const p = props({ phone });
    render(<CandleChartTitle {...p} />);
    const calls = [p.onZoomIn, p.onZoomOut, p.onFull, p.onMinute, p.onTenSec];
    zoomNames.forEach((n, i) => {
      fireEvent.click(screen.getByRole('button', { name: n }));
      expect(calls[i]).toHaveBeenCalledTimes(1);
    });
    for (const c of calls) expect(c).toHaveBeenCalledTimes(1);
  });
});
