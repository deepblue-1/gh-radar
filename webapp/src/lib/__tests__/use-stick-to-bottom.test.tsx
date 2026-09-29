import { describe, it, expect, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';

import { useStickToBottom } from '../use-stick-to-bottom';

/**
 * Phase 25-07 Task 1 — 목록 자체 스크롤러 스크롤 고정 (UI-SPEC ②-0 · R1 · Pitfall 11).
 *
 * jsdom 은 레이아웃이 없어 scrollHeight · clientHeight 가 0 이다 — 스크롤러 기하를 속성으로 심는다.
 * scrollTop 도 쓰기 가능한 값으로 바꿔 「따라감」(scrollTop = scrollHeight)을 관찰한다.
 */

type Api = ReturnType<typeof useStickToBottom<HTMLDivElement>>;
let api: Api;

function Harness({ count, resetKey }: { count: number; resetKey?: unknown }) {
  api = useStickToBottom<HTMLDivElement>(count, { resetKey });
  return <div data-testid="scroller" ref={api.ref} />;
}

/** 스크롤러 기하 — scrollHeight 는 줄 수에 비례(줄 20px), clientHeight 172. */
function installGeometry(el: HTMLElement, state: { lines: number }) {
  let top = 0;
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 172 });
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => state.lines * 20 });
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (v: number) => {
      top = v;
    },
  });
}

function scrollTo(el: HTMLElement, top: number) {
  act(() => {
    el.scrollTop = top;
    el.dispatchEvent(new Event('scroll'));
  });
}

afterEach(() => {
  api = undefined as unknown as Api;
});

describe('useStickToBottom', () => {
  it('맨 아래에서 줄이 늘면 즉시 따라간다(scrollTop = scrollHeight) · pending 0', () => {
    const geo = { lines: 20 };
    const { getByTestId, rerender } = render(<Harness count={20} />);
    const el = getByTestId('scroller');
    installGeometry(el, geo);
    scrollTo(el, 20 * 20 - 172); // 맨 아래
    expect(api.atBottom).toBe(true);

    geo.lines = 21;
    rerender(<Harness count={21} />);
    expect(el.scrollTop).toBe(21 * 20);
    expect(api.pending).toBe(0);
  });

  it('여유 24px 안이면 맨 아래로 친다', () => {
    const geo = { lines: 20 };
    const { getByTestId } = render(<Harness count={20} />);
    const el = getByTestId('scroller');
    installGeometry(el, geo);
    scrollTo(el, 20 * 20 - 172 - 24);
    expect(api.atBottom).toBe(true);
    scrollTo(el, 20 * 20 - 172 - 25);
    expect(api.atBottom).toBe(false);
  });

  it('위로 올린 뒤 +3 → 위치 불변 · pending 3 → scrollToBottom → pending 0', () => {
    const geo = { lines: 20 };
    const { getByTestId, rerender } = render(<Harness count={20} />);
    const el = getByTestId('scroller');
    installGeometry(el, geo);
    scrollTo(el, 0);
    expect(api.atBottom).toBe(false);

    geo.lines = 23;
    rerender(<Harness count={23} />);
    expect(el.scrollTop).toBe(0);
    expect(api.pending).toBe(3);

    act(() => api.scrollToBottom());
    expect(api.pending).toBe(0);
    expect(el.scrollTop).toBe(23 * 20);
  });

  it('올린 직후 스크롤 이벤트가 오기 전에 줄이 늘어도 끌어내리지 않는다 (삽입 전 거리 판정 · e2e P25-3 경주)', () => {
    const geo = { lines: 20 };
    const { getByTestId, rerender } = render(<Harness count={20} />);
    const el = getByTestId('scroller');
    installGeometry(el, geo);
    scrollTo(el, 20 * 20 - 172); // 맨 아래(이벤트 반영)
    rerender(<Harness count={20} />); // 커밋 — 높이 기준선 400
    el.scrollTop = 0; // 사용자가 올렸다 — scroll 이벤트는 아직(다음 프레임)
    geo.lines = 23;
    rerender(<Harness count={23} />);
    expect(el.scrollTop).toBe(0);
    expect(api.pending).toBe(3);
  });

  it('사용자가 직접 맨 아래까지 내리면 pending 0', () => {
    const geo = { lines: 20 };
    const { getByTestId, rerender } = render(<Harness count={20} />);
    const el = getByTestId('scroller');
    installGeometry(el, geo);
    scrollTo(el, 0);
    geo.lines = 22;
    rerender(<Harness count={22} />);
    expect(api.pending).toBe(2);
    scrollTo(el, 22 * 20 - 172);
    expect(api.pending).toBe(0);
  });

  it('줄 수 감소(상한 트림 · 필터)는 pending 에 넣지 않는다', () => {
    const geo = { lines: 20 };
    const { getByTestId, rerender } = render(<Harness count={20} />);
    const el = getByTestId('scroller');
    installGeometry(el, geo);
    scrollTo(el, 0);
    geo.lines = 15;
    rerender(<Harness count={15} />);
    expect(api.pending).toBe(0);
  });

  it('resetKey 가 바뀌면 맨 아래로 · pending 0', () => {
    const geo = { lines: 20 };
    const { getByTestId, rerender } = render(<Harness count={20} resetKey="a" />);
    const el = getByTestId('scroller');
    installGeometry(el, geo);
    scrollTo(el, 0);
    geo.lines = 24;
    rerender(<Harness count={24} resetKey="a" />);
    expect(api.pending).toBe(4);

    rerender(<Harness count={24} resetKey="b" />);
    expect(api.pending).toBe(0);
    expect(el.scrollTop).toBe(24 * 20);
    expect(api.atBottom).toBe(true);
  });
});
