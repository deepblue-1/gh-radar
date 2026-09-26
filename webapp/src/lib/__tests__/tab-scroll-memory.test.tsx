import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

/**
 * 21-31 D-32 (G-21-R3-11) — `useTabRootScrollMemory` 단위 계약.
 *
 * 창(window)이 스크롤 주체라는 전제(AppShell 머리 주석)에서 루트별 `window.scrollY` 를 기록하고,
 * 같은 루트로 다시 마운트되면 다음 프레임에 `window.scrollTo(0, y)` 로 되돌린다.
 * 실제 이동 순서(URL 먼저 · Next 스크롤)는 e2e `home.spec` 「G-21-R3-11」 이 잠근다.
 */

let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

import {
  clearTabScrollMemory,
  useTabRootScrollMemory,
} from '@/lib/tab-scroll-memory';

function Probe() {
  useTabRootScrollMemory();
  return null;
}

/** 경로 이동 흉내 — usePathname 과 window.location 을 같은 값으로 맞춘다. */
function goTo(url: string) {
  window.history.replaceState({}, '', url);
  mockPathname = new URL(url, 'http://localhost').pathname;
}

function scrollWindowTo(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true });
  window.dispatchEvent(new Event('scroll'));
}

/** 한 프레임(16ms) 진행 — rAF 는 fake timers 가 쥔다. */
function nextFrame() {
  vi.advanceTimersByTime(16);
}

let scrollToSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout'] });
  clearTabScrollMemory();
  scrollToSpy = vi.fn();
  window.scrollTo = scrollToSpy as unknown as typeof window.scrollTo;
  // 문서는 충분히 길다(복원이 첫 프레임에 끝난다).
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    value: 5000,
    configurable: true,
  });
  Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true, writable: true });
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
  goTo('/');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useTabRootScrollMemory (D-32)', () => {
  it('`/` 에서 600 까지 스크롤 → 언마운트 → `/` 재마운트 → 다음 프레임에 scrollTo(0, 600)', () => {
    const first = render(<Probe />);
    scrollWindowTo(600);
    first.unmount();

    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
    render(<Probe />);
    expect(scrollToSpy).not.toHaveBeenCalled();
    nextFrame();
    expect(scrollToSpy).toHaveBeenCalledWith(0, 600);
  });

  it('루트별로 따로 기록한다 — `/search` 의 기록은 `/` 에 섞이지 않는다', () => {
    goTo('/search');
    const search = render(<Probe />);
    scrollWindowTo(300);
    search.unmount();

    goTo('/');
    const home = render(<Probe />);
    nextFrame();
    expect(scrollToSpy).not.toHaveBeenCalled();
    home.unmount();

    goTo('/search');
    render(<Probe />);
    nextFrame();
    expect(scrollToSpy).toHaveBeenCalledWith(0, 300);
  });

  it('탭 루트가 아닌 경로(`/stocks/005930`)에서는 기록도 복원도 하지 않는다', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    goTo('/stocks/005930');
    const detail = render(<Probe />);
    expect(addSpy.mock.calls.some(([type]) => type === 'scroll')).toBe(false);
    scrollWindowTo(900);
    detail.unmount();

    render(<Probe />);
    nextFrame();
    expect(scrollToSpy).not.toHaveBeenCalled();
    addSpy.mockRestore();
  });

  it('저장값이 없거나 0 이면 scrollTo 를 부르지 않는다(Next 기본 동작 그대로)', () => {
    const first = render(<Probe />);
    nextFrame();
    expect(scrollToSpy).not.toHaveBeenCalled();

    scrollWindowTo(0);
    first.unmount();
    render(<Probe />);
    nextFrame();
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('검색 파라미터를 달고 들어온 탭 루트(`/trading?code=…`)는 복원하지 않는다 — 목적지 스크롤이 이긴다', () => {
    goTo('/trading');
    const first = render(<Probe />);
    scrollWindowTo(700);
    first.unmount();

    goTo('/trading?code=005930');
    const landing = render(<Probe />);
    nextFrame();
    expect(scrollToSpy).not.toHaveBeenCalled();
    landing.unmount();

    // 기록은 그대로 남아 있어 파라미터 없이 돌아오면 복원된다.
    goTo('/trading');
    render(<Probe />);
    nextFrame();
    expect(scrollToSpy).toHaveBeenCalledWith(0, 700);
  });

  it('이동 중(URL 이 먼저 바뀐 뒤)의 스크롤은 이전 루트 기록을 덮지 않는다', () => {
    const home = render(<Probe />);
    scrollWindowTo(600);
    // router.push — URL 이 먼저 `/search` 로 바뀌고 Next 가 맨 위로 옮긴다(아직 `/` 가 마운트된 상태).
    window.history.replaceState({}, '', '/search');
    scrollWindowTo(0);
    home.unmount();

    goTo('/');
    render(<Probe />);
    nextFrame();
    expect(scrollToSpy).toHaveBeenCalledWith(0, 600);
  });

  it('문서가 짧으면 최대 30 프레임까지 기다렸다가 가능한 만큼만 내린다', () => {
    const first = render(<Probe />);
    scrollWindowTo(4000);
    first.unmount();

    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: 1000,
      configurable: true,
    });
    render(<Probe />);
    for (let i = 0; i < 30; i += 1) nextFrame();
    expect(scrollToSpy).not.toHaveBeenCalled();
    nextFrame();
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(scrollToSpy).toHaveBeenCalledWith(0, 4000);
  });

  it('복원 대기 중 언마운트하면 대기 프레임을 해제한다', () => {
    const first = render(<Probe />);
    scrollWindowTo(4000);
    first.unmount();

    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: 1000,
      configurable: true,
    });
    const second = render(<Probe />);
    nextFrame();
    second.unmount();
    for (let i = 0; i < 40; i += 1) nextFrame();
    expect(scrollToSpy).not.toHaveBeenCalled();
  });
});
