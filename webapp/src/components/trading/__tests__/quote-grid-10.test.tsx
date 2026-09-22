import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { RelayQuote } from '@gh-radar/shared';

import {
  formatMarketCap,
  formatOnePercentShares,
  formatTradeValue,
} from '@/lib/quote-format';
import { QuoteGrid10 } from '../card/quote-grid-10';

/**
 * Phase 18 Plan 06 Task 1 — 종목정보 10칸 (D-11 · E8 · TRADE-09).
 *
 * 잠그는 것:
 *   - 라벨 10개는 **값이 없어도** 언제나 그려진다(칸 수 불변 — 밴드 배치가 칸 수에 매달린다).
 *   - 모르는 값은 「—」다. 0 을 그리면 그 숫자로 판단이 이뤄진다.
 *   - 색 축: 기준 대비 up/down/flat · 상한·상승VI `--up` 고정 · 하한 `--down` 고정 · 규모 3칸 중립.
 *   - 종가(`kc > 0`)는 **하한 칸**을 대신한다 — Phase 17 D-11 개정(사용자 결정 2026-09-18).
 *   - 숫자 문자열은 기존 `quote-format` 헬퍼와 **같은 문자열**이다(카드 전용 포맷 없음).
 */

const LABELS = ['기준', '시가', '고가', '저가', '상한', '하한', '상승VI', '거래', '시총', '발행1%'];

function quote(over: Partial<RelayQuote> = {}): RelayQuote {
  return {
    t: 'q',
    i: 'KR7086520004',
    x: 'KRX',
    snap: true,
    p: 11_000,
    o: 10_500,
    h: 12_000,
    l: 9_500,
    c: 1_000,
    cs: '2',
    cr: 10,
    v: 1_000_000,
    va: 12_345_000_000,
    ap: [],
    aq: [],
    bp: [],
    bq: [],
    ta: 0,
    tb: 0,
    ul: 13_000,
    ll: 7_000,
    base: 10_000,
    viu: 11_500,
    vid: 9_000,
    kc: 0,
    ls: 50_000_000,
    et: '',
    ...over,
  };
}

const grid = () => document.querySelector('[data-slot="lc-quote-grid"]') as HTMLElement;
const cells = () => Array.from(grid().querySelectorAll('[data-slot="lc-quote-cell"]'));
const cell = (label: string) =>
  cells().find((c) => c.querySelector('[data-part="label"]')?.textContent === label) as HTMLElement;
const valueOf = (label: string) => cell(label).querySelector('[data-part="value"]') as HTMLElement;

describe('QuoteGrid10', () => {
  it('E8 empty — 시세가 없으면 라벨 10개는 그대로 그려지고 값은 전부 「—」다', () => {
    render(<QuoteGrid10 quote={null} />);
    expect(cells()).toHaveLength(10);
    expect(cells().map((c) => c.querySelector('[data-part="label"]')?.textContent)).toEqual(LABELS);
    for (const label of LABELS) expect(valueOf(label).textContent).toBe('—');
    // 스켈레톤·「불러오는 중」 위장이 없다(E8 loading).
    expect(grid().textContent).not.toContain('불러오는');
    expect(grid().querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('E8 partial — 상승VI 만 없으면 그 칸만 「—」이고 칸 수는 10 이다', () => {
    render(<QuoteGrid10 quote={quote({ viu: 0 })} />);
    expect(cells()).toHaveLength(10);
    expect(valueOf('상승VI').textContent).toBe('—');
    expect(valueOf('상한').textContent).toBe('13,000');
    expect(valueOf('시가').textContent).toBe('10,500');
  });

  it('E8 populated — 기준 대비 상승은 --up, 하락은 --down, 같으면 --flat', () => {
    render(<QuoteGrid10 quote={quote({ o: 10_000, h: 12_000, l: 9_500 })} />);
    expect(valueOf('고가').className).toContain('text-[var(--up)]');
    expect(valueOf('저가').className).toContain('text-[var(--down)]');
    expect(valueOf('시가').className).toContain('text-[var(--flat)]');
    // 기준은 자기 자신과의 비교라 언제나 보합이다.
    expect(valueOf('기준').className).toContain('text-[var(--flat)]');
  });

  it('상한·상승VI 는 값과 무관하게 --up, 하한은 --down 고정', () => {
    // 상승VI·상한을 기준보다 **낮게** 넣어도 색이 바뀌지 않는다.
    render(<QuoteGrid10 quote={quote({ ul: 5_000, viu: 5_000, ll: 20_000 })} />);
    expect(valueOf('상한').className).toContain('text-[var(--up)]');
    expect(valueOf('상승VI').className).toContain('text-[var(--up)]');
    expect(valueOf('하한').className).toContain('text-[var(--down)]');
  });

  it('거래·시총·발행1% 는 중립 톤이고 기존 quote-format 헬퍼와 같은 문자열이다', () => {
    const q = quote();
    render(<QuoteGrid10 quote={q} />);
    for (const label of ['거래', '시총', '발행1%']) {
      const cls = valueOf(label).className;
      expect(cls).toContain('text-[var(--fg)]');
      expect(cls).not.toMatch(/--up|--down|--flat/);
    }
    expect(valueOf('거래').textContent).toBe(formatTradeValue(q.va));
    expect(valueOf('시총').textContent).toBe(formatMarketCap(q.p, q.ls));
    expect(valueOf('발행1%').textContent).toBe(formatOnePercentShares(q.ls));
  });

  it('kc > 0 이면 하한 칸이 「종가」가 되고 기준 대비 방향색을 받는다 — 칸 수·다른 라벨 불변', () => {
    render(<QuoteGrid10 quote={quote({ kc: 12_500 })} />);
    expect(cells()).toHaveLength(10);
    expect(cell('하한')).toBeUndefined();
    expect(valueOf('종가').textContent).toBe('12,500');
    expect(valueOf('종가').className).toContain('text-[var(--up)]');
    expect(valueOf('기준').textContent).toBe('10,000');
  });

  it('kc 가 0 이면 스냅샷 값으로 폴백하지 않고 하한을 그린다', () => {
    render(<QuoteGrid10 quote={quote({ kc: 0 })} lowerLimit={7_000} />);
    expect(cell('종가')).toBeUndefined();
    expect(valueOf('하한').textContent).toBe('7,000');
  });

  it('호출부가 넘긴 가격 값(REST 폴백)이 시세 없는 상태에서도 그대로 그려진다', () => {
    render(
      <QuoteGrid10 quote={null} basePrice={10_000} upperLimit={13_000} lowerLimit={7_000} currentPrice={11_000} />,
    );
    expect(valueOf('기준').textContent).toBe('10,000');
    expect(valueOf('상한').textContent).toBe('13,000');
    expect(valueOf('하한').textContent).toBe('7,000');
    // 시세 프레임에서만 오는 값은 여전히 모른다.
    expect(valueOf('시가').textContent).toBe('—');
  });

  it('배치는 카드 폭(`/lc`) 컨테이너 유틸리티이고 뷰포트 브레이크포인트가 없다', () => {
    render(<QuoteGrid10 quote={null} />);
    expect(grid().className).toContain('@min-[700px]/lc:grid-cols-5');
    expect(grid().className).toContain('@min-[992px]/lc:flex');
    expect(grid().className).not.toMatch(/(^|\s)(sm|md|lg|xl):/);
  });
});
