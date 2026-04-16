import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { Sparkline } from '../sparkline';

/**
 * Phase 06.2 Plan 05 Task 1 — Sparkline 컴포넌트.
 * UI-SPEC §4.3 / RESEARCH §Pattern 12 (3 프리셋 path).
 *
 * v1 계약: direction (`up`/`down`/`flat`) 에 따라 고정 SVG path 를 3종 중 1종으로
 * 렌더하고, 각 방향에 대응되는 CSS 토큰(`--up`/`--down`/`--flat`)을 stroke 로 지정.
 * 장식용 시각 요소이므로 `aria-hidden="true"`. 사이즈는 60×24 고정.
 */
describe('Sparkline', () => {
  it('renders an up path starting at `M0 20` with var(--up) stroke', () => {
    const { container } = render(<Sparkline direction="up" />);
    const path = container.querySelector('svg path');
    expect(path).not.toBeNull();
    expect(path?.getAttribute('d')).toMatch(/^M0 20/);
    expect(path?.getAttribute('stroke')).toBe('var(--up)');
  });

  it('renders a down path starting at `M0 4` with var(--down) stroke', () => {
    const { container } = render(<Sparkline direction="down" />);
    const path = container.querySelector('svg path');
    expect(path?.getAttribute('d')).toMatch(/^M0 4/);
    expect(path?.getAttribute('stroke')).toBe('var(--down)');
  });

  it('renders a flat path starting at `M0 12` with var(--flat) stroke', () => {
    const { container } = render(<Sparkline direction="flat" />);
    const path = container.querySelector('svg path');
    expect(path?.getAttribute('d')).toMatch(/^M0 12/);
    expect(path?.getAttribute('stroke')).toBe('var(--flat)');
  });

  it('marks the svg as aria-hidden for assistive tech', () => {
    const { container } = render(<Sparkline direction="up" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('uses a 60×24 viewBox / width / height', () => {
    const { container } = render(<Sparkline direction="flat" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('60');
    expect(svg?.getAttribute('height')).toBe('24');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 60 24');
  });
});
