import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { render, screen } from '@testing-library/react';

import { progressView } from '@/lib/queue-progress';

import { UnfilledProgress } from '../unfilled-progress';

/**
 * Phase 25-09 — 미체결 잔량진행률 B안 한 줄(UI-SPEC ④ · D-11~D-13 · R16 · R17).
 *
 * 잠그는 규칙:
 *   - 값은 `progressView` 가 만든 보기 값 그대로다 — 이 컴포넌트는 계산하지 않는다
 *   - 막대 = `role="progressbar"` + 값 속성 4종 + 이름 · 값 텍스트(색만으로 말하지 않는다)
 *   - 90% 이상 · 0주 남음(full) → `data-near` + 채움 `--up` · 미만 `--primary`
 *   - 취소 보관(`muted`) → 숫자 `--muted-fg` · 채움 `--faint`(near 여도)
 *   - compact(모바일 r3) → 「체결예상까지」·「·」 생략 · 막대만 신축
 */

const VIEW_88 = progressView({ group: 3, remainingVolume: 12_000, progressBp: 8800 });
const VIEW_90 = progressView({ group: 3, remainingVolume: 3_000, progressBp: 9000 });
const VIEW_FULL = progressView({ group: 1, remainingVolume: -5, progressBp: 10_050 });

const root = () => document.querySelector<HTMLElement>('[data-slot="unfilled-progress"]')!;
const fill = () => root().querySelector<HTMLElement>('[data-slot="unfilled-progress-fill"]')!;

describe('UnfilledProgress — row(데스크톱 보조행 한 줄)', () => {
  it('88% — 문구 · progressbar 속성 · 채움 폭 · --primary · near 없음', () => {
    render(<UnfilledProgress view={VIEW_88} variant="row" />);
    expect(root()).toHaveAttribute('data-variant', 'row');
    expect(root().textContent).toBe('후매수·체결예상까지 12,000주 남음88%');
    const bar = screen.getByRole('progressbar', { name: '체결예상까지 진행률' });
    expect(bar).toHaveAttribute('aria-valuenow', '88');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuetext', '후매수 체결예상까지 12,000주 남음, 88%');
    expect(bar.className).toContain('w-[140px]');
    // 칸이 모자라면 막대만 줄어든다(40px 까지) — 문장 · % 는 flex-none.
    expect(bar.className).toContain('shrink');
    expect(bar.className).toContain('min-w-10');
    expect(fill().style.width).toBe('88%');
    expect(fill().className).toContain('bg-[var(--primary)]');
    expect(root()).not.toHaveAttribute('data-near');
    expect(root().className).toContain('whitespace-nowrap');
  });

  it('90% → data-near="true" · 채움 --up', () => {
    render(<UnfilledProgress view={VIEW_90} variant="row" />);
    expect(root()).toHaveAttribute('data-near', 'true');
    expect(fill().className).toContain('bg-[var(--up)]');
    expect(fill().style.width).toBe('90%');
  });

  it('full(remaining −5 · bp 10050) → 「0주 남음」 · 100% · --up (D-12)', () => {
    render(<UnfilledProgress view={VIEW_FULL} variant="row" />);
    expect(root().textContent).toContain('0주 남음');
    expect(root().textContent).toContain('100%');
    expect(root()).toHaveAttribute('data-near', 'true');
    expect(fill().style.width).toBe('100%');
    expect(fill().className).toContain('bg-[var(--up)]');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('muted(취소 보관) → 숫자 --muted-fg · 채움 --faint (near 여도 · R16)', () => {
    render(<UnfilledProgress view={VIEW_90} variant="row" muted />);
    expect(root()).toHaveAttribute('data-muted', 'true');
    expect(fill().className).toContain('bg-[var(--faint)]');
    expect(fill().className).not.toContain('bg-[var(--up)]');
    for (const b of Array.from(root().querySelectorAll('b'))) {
      expect(b.className).toContain('text-[var(--muted-fg)]');
      expect(b.className).not.toContain('text-[var(--fg)]');
    }
  });

  it('숫자 · % 는 mono 600 --fg · 종류명 600 --fg', () => {
    render(<UnfilledProgress view={VIEW_88} variant="row" />);
    const bs = Array.from(root().querySelectorAll('b'));
    expect(bs.map((b) => b.textContent)).toEqual(['12,000', '88%']);
    for (const b of bs) {
      expect(b.className).toContain('mono');
      expect(b.className).toContain('font-semibold');
      expect(b.className).toContain('text-[var(--fg)]');
    }
    const kind = root().querySelector('[data-slot="unfilled-progress-kind"]')!;
    expect(kind.textContent).toBe('후매수');
    expect(kind.className).toContain('font-semibold');
  });
});

describe('UnfilledProgress — compact(모바일 r3)', () => {
  it('「체결예상까지」·「·」 없음 · 막대만 신축(flex-1 min-w-0) · 나머지 flex-none', () => {
    render(<UnfilledProgress view={VIEW_88} variant="compact" />);
    expect(root()).toHaveAttribute('data-variant', 'compact');
    expect(root().textContent).toBe('후매수12,000주 남음88%');
    expect(root().textContent).not.toContain('체결예상까지');
    expect(root().textContent).not.toContain('·');
    const kids = Array.from(root().children) as HTMLElement[];
    const bar = screen.getByRole('progressbar', { name: '체결예상까지 진행률' });
    expect(kids).toContain(bar);
    for (const kid of kids) {
      if (kid === bar) {
        expect(kid.className).toContain('flex-1');
        expect(kid.className).toContain('min-w-0');
      } else {
        expect(kid.className).toContain('flex-none');
      }
    }
    // 접근성 값 텍스트는 두 모양이 같다 — 모바일도 「체결예상까지」 를 읽어 준다.
    expect(bar).toHaveAttribute('aria-valuetext', '후매수 체결예상까지 12,000주 남음, 88%');
  });
});
