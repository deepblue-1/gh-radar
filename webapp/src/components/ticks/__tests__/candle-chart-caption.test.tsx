import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { CandleChartCaption } from '../candle-chart-caption';

/**
 * Phase 42 Plan 06 Task 3 — 봉 차트 카드 아래 캡션 줄(D-17 · UI-SPEC S9).
 *
 * 깨지면: 누적 기준 설명 · 선을 못 그린 이유가 안 보이거나, 항목이 없는데 빈 줄이 남거나, 폰에서 우리 범례가 사라진다.
 */

const CUM = '누적 = 매집감지 보고서 값 · 우리 체결 제외';
const LONG = '일 이동평균 — 일별 종가를 불러오지 못했어요(화면을 다시 열면 다시 불러와요)';

describe('CandleChartCaption', () => {
  it('항목 0 · 데스크톱(우리 범례 있어도) → 렌더 없음 · 폰 + 범례 없음 + 항목 0 → 렌더 없음', () => {
    expect(render(<CandleChartCaption phone={false} ownLegend items={[]} />).container.innerHTML).toBe('');
    expect(render(<CandleChartCaption phone ownLegend={false} items={[]} />).container.innerHTML).toBe('');
  });

  it('폰 + ownLegend → 범례 둘(「우리 체결」 · 「조건 근거」 · --mine-fg)이 항목보다 앞', () => {
    const { container } = render(<CandleChartCaption phone ownLegend items={[CUM]} />);
    const root = container.querySelector('[data-slot="candle-chart-caption"]')!;
    const kids = [...root.children].map((el) => el.getAttribute('data-slot'));
    expect(kids).toEqual(['candle-caption-own', 'candle-caption-own', 'candle-caption-item']);
    const own = root.querySelectorAll('[data-slot="candle-caption-own"]');
    expect(own[0]!.textContent).toBe('우리 체결');
    expect(own[1]!.textContent).toBe('조건 근거');
    expect(own[0]!.className).toContain('text-[var(--mine-fg)]');
    expect(own[0]!.querySelector('i')!.className).toContain('rotate-45');
    expect(own[1]!.querySelector('i')!.className).toContain('rounded-full');

    // 범례만 있어도 줄은 있다
    expect(render(<CandleChartCaption phone ownLegend items={[]} />).container.querySelector('[data-slot="candle-chart-caption"]')).not.toBeNull();
  });

  it('데스크톱 + ownLegend → 범례 없음(제목 줄 몫) · 항목만 입력 순서대로', () => {
    const { container } = render(<CandleChartCaption phone={false} ownLegend items={[CUM, '단순 60 — 이 봉 단위로는 봉이 모자라 그리지 않아요']} />);
    expect(container.querySelector('[data-slot="candle-caption-own"]')).toBeNull();
    const items = [...container.querySelectorAll('[data-slot="candle-caption-item"]')].map((el) => el.textContent);
    expect(items).toEqual([CUM, '단순 60 — 이 봉 단위로는 봉이 모자라 그리지 않아요']);
  });

  it('긴 안내 문구 항목이 flex-wrap 루트 안에 그대로 있다(잘림 클래스 없음) · 루트 클래스 = UI-SPEC S9', () => {
    const { container } = render(<CandleChartCaption phone ownLegend={false} items={[CUM, LONG]} />);
    const root = container.querySelector<HTMLElement>('[data-slot="candle-chart-caption"]')!;
    for (const c of ['flex', 'flex-wrap', 'gap-x-3', 'gap-y-1', 'border-t', 'px-3', 'py-2', 'text-[11px]', 'text-[var(--muted-fg)]']) {
      expect(root.className.split(' ')).toContain(c);
    }
    const long = [...root.querySelectorAll<HTMLElement>('[data-slot="candle-caption-item"]')].find((el) => el.textContent === LONG)!;
    expect(long).toBeDefined();
    expect(long.parentElement).toBe(root);
    expect(long.className).not.toContain('truncate');
    expect(long.className).not.toContain('whitespace-nowrap');
  });
});
