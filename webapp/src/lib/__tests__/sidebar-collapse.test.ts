import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
  SIDEBAR_COLLAPSED_KEY,
  SIDEBAR_RAIL_ATTR,
  SIDEBAR_RAIL_SCRIPT,
  SIDEBAR_RAIL_VALUE,
  isSidebarCollapsed,
  setSidebarCollapsed,
  subscribeSidebarCollapsed,
} from '../sidebar-collapse';
import { useSidebarCollapsed } from '@/hooks/use-sidebar-collapsed';

/**
 * quick-260930-e30 D1 — 데스크톱 사이드바 레일 접힘 저장소.
 *
 * 각 케이스는 깨졌을 때 사용자가 겪는 일과 1:1 이다.
 *  1. 인라인 스크립트 '1' → rail      → 깨지면 새로고침마다 펼침으로 시작하거나 240→64 깜빡임이 난다
 *  2. 이상값·키 없음 → 속성 없음       → 깨지면 저장값 오염이 레일을 강제한다(T-e30-01)
 *  3. getItem throw 흡수               → 깨지면 `<head>` 뒤 스크립트까지 흔들린다
 *  4. set/remove · throw 흡수 · 알림   → 깨지면 토글이 저장되지 않거나 버튼 상태가 안 바뀐다
 *  5. 훅 초기 false → 갱신             → 깨지면 하이드레이션 불일치 또는 aria 가 멈춘다
 */

function run(): void {
  new Function(SIDEBAR_RAIL_SCRIPT)();
}

const html = () => document.documentElement;

afterEach(() => {
  html().removeAttribute(SIDEBAR_RAIL_ATTR);
  try {
    window.localStorage.removeItem(SIDEBAR_COLLAPSED_KEY);
  } catch {
    /* 저장소 없음 */
  }
  vi.restoreAllMocks();
});

describe('SIDEBAR_RAIL_SCRIPT (첫 페인트 전 인라인)', () => {
  it("저장값이 정확히 '1' 이면 html[data-sidebar=rail] 을 붙인다", () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, '1');
    run();
    expect(html().getAttribute(SIDEBAR_RAIL_ATTR)).toBe(SIDEBAR_RAIL_VALUE);
    expect(SIDEBAR_RAIL_ATTR).toBe('data-sidebar');
    expect(SIDEBAR_RAIL_VALUE).toBe('rail');
    expect(SIDEBAR_COLLAPSED_KEY).toBe('gh-radar:sidebar-collapsed');
  });

  it('키가 없으면 속성을 붙이지 않는다', () => {
    run();
    expect(html().hasAttribute(SIDEBAR_RAIL_ATTR)).toBe(false);
  });

  it.each(['true', '0', 'rail', '"1"', '<img>'])('다른 값(%s)이면 속성을 붙이지 않는다', (v) => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, v);
    run();
    expect(html().hasAttribute(SIDEBAR_RAIL_ATTR)).toBe(false);
  });

  it('localStorage.getItem 이 throw 해도 예외 없이 속성이 없다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => run()).not.toThrow();
    expect(html().hasAttribute(SIDEBAR_RAIL_ATTR)).toBe(false);
  });
});

describe('setSidebarCollapsed / isSidebarCollapsed / subscribe', () => {
  it("true → 속성 rail + 저장값 '1' · false → 속성 제거 + 키 제거", () => {
    setSidebarCollapsed(true);
    expect(html().getAttribute(SIDEBAR_RAIL_ATTR)).toBe('rail');
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('1');
    expect(isSidebarCollapsed()).toBe(true);

    setSidebarCollapsed(false);
    expect(html().hasAttribute(SIDEBAR_RAIL_ATTR)).toBe(false);
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBeNull();
    expect(isSidebarCollapsed()).toBe(false);
  });

  it('setItem 이 throw 해도 속성은 바뀌고 예외가 없다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => setSidebarCollapsed(true)).not.toThrow();
    expect(html().getAttribute(SIDEBAR_RAIL_ATTR)).toBe('rail');
  });

  it('isSidebarCollapsed 는 html 속성을 그대로 읽는다', () => {
    html().setAttribute(SIDEBAR_RAIL_ATTR, 'rail');
    expect(isSidebarCollapsed()).toBe(true);
    html().setAttribute(SIDEBAR_RAIL_ATTR, 'other');
    expect(isSidebarCollapsed()).toBe(false);
  });

  it('구독자에게 알리고, 해제 뒤에는 알리지 않는다', () => {
    const cb = vi.fn();
    const off = subscribeSidebarCollapsed(cb);
    setSidebarCollapsed(true);
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    setSidebarCollapsed(false);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('useSidebarCollapsed', () => {
  it('초기 false → setSidebarCollapsed(true) 뒤 true', () => {
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current).toBe(false);
    act(() => setSidebarCollapsed(true));
    expect(result.current).toBe(true);
    act(() => setSidebarCollapsed(false));
    expect(result.current).toBe(false);
  });
});
