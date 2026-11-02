import { describe, it, expect } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';

import { useFixedWindow } from '../use-fixed-window';

/**
 * Phase 37 Plan 13 Task 1 — 고정 높이 창 가상화. 27만 항목이어도 DOM 은 보이는 수 + 2·overscan 안팎.
 */

const COUNT = 270_000;
const ROW_H = 24;
const HEIGHT = 480; // 20행

function List({ count = COUNT, onApi }: { count?: number; onApi?: (api: ReturnType<typeof useFixedWindow>) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const win = useFixedWindow({ count, rowH: ROW_H, overscan: 10, ref });
  onApi?.(win);
  const rows = [];
  for (let i = win.first; i <= win.last; i++) {
    rows.push(
      <div key={i} data-row={i} style={{ height: ROW_H }}>
        {i}
      </div>,
    );
  }
  return (
    <div
      ref={(el) => {
        ref.current = el;
        // jsdom 은 배치가 없다 — 높이 · scrollTop 을 실제 브라우저처럼 둔다.
        if (el && !Object.prototype.hasOwnProperty.call(el, 'clientHeight')) {
          Object.defineProperty(el, 'clientHeight', { configurable: true, value: HEIGHT });
          Object.defineProperty(el, 'scrollTop', { configurable: true, writable: true, value: 0 });
        }
      }}
      data-testid="scroll"
      style={{ height: HEIGHT, overflow: 'auto' }}
    >
      <div data-testid="pad-top" style={{ height: win.padTop }} />
      {rows}
      <div data-testid="pad-bottom" style={{ height: win.padBottom }} />
    </div>
  );
}

describe('useFixedWindow', () => {
  it('270,000 항목 — 그리는 행 ≈ 높이/rowH + 2·overscan · 위아래 spacer 합 = 나머지', () => {
    const { container, getByTestId } = render(<List />);
    const rows = container.querySelectorAll('[data-row]');
    // 맨 위: first 0 · last = 0 + 20 + 10 → 31행(overscan 은 아래쪽만)
    expect(rows.length).toBe(31);
    expect(rows.length).toBeLessThanOrEqual(HEIGHT / ROW_H + 2 * 10 + 1);
    const padBottom = parseFloat(getByTestId('pad-bottom').style.height);
    expect(padBottom).toBe((COUNT - 31) * ROW_H);
  });

  it('스크롤 가운데 — first = floor(scrollTop/rowH) − overscan · 행 수 41', async () => {
    const { container, getByTestId } = render(<List />);
    const el = getByTestId('scroll');
    await act(async () => {
      el.scrollTop = 100_000 * ROW_H + 5;
      fireEvent.scroll(el);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    const rows = Array.from(container.querySelectorAll('[data-row]'), (r) => Number(r.getAttribute('data-row')));
    expect(rows[0]).toBe(100_000 - 10);
    expect(rows.length).toBe(HEIGHT / ROW_H + 2 * 10 + 1);
    expect(parseFloat(getByTestId('pad-top').style.height)).toBe((100_000 - 10) * ROW_H);
  });

  it('scrollToIndex — nearest 는 아래 끝에 맞추고 · 이미 보이면 그대로 · center 는 가운데', () => {
    let api: ReturnType<typeof useFixedWindow> | null = null;
    const { getByTestId, container } = render(<List onApi={(a) => (api = a)} />);
    const el = getByTestId('scroll');
    act(() => api!.scrollToIndex(5000, 'nearest'));
    expect(el.scrollTop).toBe(5001 * ROW_H - HEIGHT);
    expect(container.querySelector('[data-row="5000"]')).not.toBeNull();
    const before = el.scrollTop;
    act(() => api!.scrollToIndex(4995, 'nearest'));
    expect(el.scrollTop).toBe(before);
    act(() => api!.scrollToIndex(200_000, 'center'));
    expect(el.scrollTop).toBe(200_000 * ROW_H - HEIGHT / 2 + ROW_H / 2);
    expect(container.querySelector('[data-row="200000"]')).not.toBeNull();
    // 위로 — nearest 는 위 끝에 맞춘다
    act(() => api!.scrollToIndex(10, 'nearest'));
    expect(el.scrollTop).toBe(10 * ROW_H);
  });

  it('빈 목록 — 그릴 행 없음', () => {
    const { container } = render(<List count={0} />);
    expect(container.querySelectorAll('[data-row]')).toHaveLength(0);
  });
});
