import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';

import {
  HEADER_AUTO_HIDE_QUERY,
  HEADER_REVEAL_MAX_SCROLL,
  useHeaderAutoHide,
} from '../use-header-auto-hide';

/**
 * quick-260930-e30 D2 — 스크롤 헤더 숨김 판정 훅.
 *
 * 각 케이스는 깨졌을 때 사용자가 겪는 일과 1:1 이다.
 *  1. 좁은 폭 임계 8        → 깨지면 맨 위에서도 헤더가 걷히거나, 스크롤해도 안 걷힌다
 *  2. lg+ 브라우저 유지      → 깨지면 사이드바 있는 데스크톱에서 헤더가 사라진다
 *  3. 앱은 전 폭 적용        → 깨지면 iPad 가로 앱에서 헤더가 붙박인다
 *  4. enabled/forceVisible  → 깨지면 햄버거 없는 화면에서 헤더가 사라지거나, 드로어 열림 중 헤더가 숨는다
 *  5. 키보드 포커스 강제 표시 → 깨지면 Tab 으로 검색에 들어가도 투명한 헤더 위를 헤맨다(T-e30-02)
 *  6. 복원된 스크롤          → 깨지면 탭 루트 스크롤 복원 착지 뒤 헤더가 남는다
 *  7. 리스너 해제            → 깨지면 언마운트 뒤에도 setState 가 돈다
 */

type Listener = (e: { matches: boolean }) => void;

let narrow = true;
let mqlListeners = new Set<Listener>();
const originalMatchMedia = window.matchMedia;

function setNarrow(next: boolean): void {
  narrow = next;
  for (const l of mqlListeners) l({ matches: next });
}

function setScrollY(y: number): void {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true });
  window.dispatchEvent(new Event('scroll'));
}

beforeEach(() => {
  narrow = true;
  mqlListeners = new Set();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query === HEADER_AUTO_HIDE_QUERY ? narrow : false;
    },
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (_: string, l: Listener) => mqlListeners.add(l),
    removeEventListener: (_: string, l: Listener) => mqlListeners.delete(l),
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  document.documentElement.classList.remove('native-app');
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
  vi.restoreAllMocks();
});

function Probe({ enabled = true, forceVisible = false }: { enabled?: boolean; forceVisible?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const hidden = useHeaderAutoHide(ref, { enabled, forceVisible });
  return (
    <>
      <div ref={ref} data-testid="hdr" data-hidden={String(hidden)}>
        <button type="button">안쪽</button>
      </div>
      <button type="button">바깥</button>
    </>
  );
}

const hidden = () => screen.getByTestId('hdr').getAttribute('data-hidden');

describe('useHeaderAutoHide', () => {
  it('상수 — 임계 8 · 좁은 폭 쿼리', () => {
    expect(HEADER_REVEAL_MAX_SCROLL).toBe(8);
    expect(HEADER_AUTO_HIDE_QUERY).toBe('(max-width: 1023.98px)');
  });

  it('좁은 폭: scrollY 0 → 보임 · 9 → 숨김 · 8 → 보임(8 이내는 보임)', () => {
    render(<Probe />);
    expect(hidden()).toBe('false');
    act(() => setScrollY(9));
    expect(hidden()).toBe('true');
    act(() => setScrollY(8));
    expect(hidden()).toBe('false');
  });

  it('넓은 폭(lg+ 브라우저)은 스크롤해도 보임 · 좁은 폭으로 바뀌면 숨김', () => {
    narrow = false;
    render(<Probe />);
    act(() => setScrollY(300));
    expect(hidden()).toBe('false');
    act(() => setNarrow(true));
    expect(hidden()).toBe('true');
  });

  it('앱(html.native-app)은 넓은 폭에서도 숨김', () => {
    narrow = false;
    document.documentElement.classList.add('native-app');
    render(<Probe />);
    act(() => setScrollY(300));
    expect(hidden()).toBe('true');
  });

  it('enabled: false → 항상 보임', () => {
    render(<Probe enabled={false} />);
    act(() => setScrollY(300));
    expect(hidden()).toBe('false');
  });

  it('forceVisible: true → 보임', () => {
    render(<Probe forceVisible />);
    act(() => setScrollY(300));
    expect(hidden()).toBe('false');
  });

  it('헤더 안 키보드 포커스(:focus-visible) → 보임 · 헤더 밖으로 나가면 다시 숨김', () => {
    render(<Probe />);
    act(() => setScrollY(300));
    expect(hidden()).toBe('true');

    const inner = screen.getByRole('button', { name: '안쪽' });
    const outer = screen.getByRole('button', { name: '바깥' });
    const realMatches = Element.prototype.matches;
    vi.spyOn(inner, 'matches').mockImplementation(function (this: Element, sel: string) {
      return sel === ':focus-visible' ? true : realMatches.call(this, sel);
    });

    act(() => {
      fireEvent.focusIn(inner);
    });
    expect(hidden()).toBe('false');

    act(() => {
      fireEvent.focusOut(inner, { relatedTarget: outer });
    });
    expect(hidden()).toBe('true');
  });

  it('마우스 포커스(:focus-visible 아님)는 헤더를 붙박지 않는다', () => {
    render(<Probe />);
    act(() => setScrollY(300));
    const inner = screen.getByRole('button', { name: '안쪽' });
    vi.spyOn(inner, 'matches').mockReturnValue(false);
    act(() => {
      fireEvent.focusIn(inner);
    });
    expect(hidden()).toBe('true');
  });

  it(':focus-visible 미지원(throw)이면 키보드 포커스로 보지 않는다', () => {
    render(<Probe />);
    act(() => setScrollY(300));
    const inner = screen.getByRole('button', { name: '안쪽' });
    vi.spyOn(inner, 'matches').mockImplementation(() => {
      throw new SyntaxError('unsupported');
    });
    act(() => {
      fireEvent.focusIn(inner);
    });
    expect(hidden()).toBe('true');
  });

  it('마운트 시점에 이미 scrollY 300(스크롤 복원) → 첫 effect 뒤 숨김', () => {
    Object.defineProperty(window, 'scrollY', { value: 300, configurable: true, writable: true });
    render(<Probe />);
    expect(hidden()).toBe('true');
  });

  it('언마운트 시 scroll · matchMedia change · focusin/focusout 리스너를 해제한다', () => {
    const winRemove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<Probe />);
    const hdr = screen.getByTestId('hdr');
    const hdrRemove = vi.spyOn(hdr, 'removeEventListener');
    expect(mqlListeners.size).toBe(1);

    unmount();

    expect(winRemove.mock.calls.some(([type]) => type === 'scroll')).toBe(true);
    expect(mqlListeners.size).toBe(0);
    const removed = hdrRemove.mock.calls.map(([type]) => type);
    expect(removed).toEqual(expect.arrayContaining(['focusin', 'focusout']));
  });
});
