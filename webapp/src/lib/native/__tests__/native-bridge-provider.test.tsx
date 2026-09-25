import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { renderHook } from '@testing-library/react';

/**
 * Phase 21 Plan 04 Task 1 — `NativeBridgeProvider` · `useNativeRefresh` 회귀면.
 *
 * 웹 쪽 앱 분기의 단일 접점이다(D-04 · D-06 · D-06a · D-12 · D-14 · D-23). 각 케이스는
 * **깨졌을 때 사용자가 겪는 일**과 1:1 이다.
 *
 *  1. 브라우저 무변화          → 깨지면 일반 브라우저 사용자 페이지에 `window.__ghTrade` 가 생기고 채널 송신이 난다
 *  2. 전역 설치·해제           → 깨지면 네이티브 탭바·당김·뒤로가기가 웹을 부르지 못하거나, 언마운트 뒤 죽은 훅을 부른다
 *  3. refresh 전부 호출        → 깨지면 종목상세에서 시세만 새로고침되고 뉴스·토론은 그대로 남는다
 *  4. refresh 실패 격리        → 깨지면 한 섹션 재조회 실패가 나머지 섹션 새로고침을 막고, 무로그로 사라진다
 *  5. 언마운트 해제            → 깨지면 떠난 페이지의 재조회가 계속 불려 쓸데없는 호출이 쌓인다
 *  6. 등록 0 = reload          → 깨지면 새로고침 훅이 없는 페이지에서 당겨도 아무 일이 안 일어난다
 *  7. navigate 검증            → 깨지면 네이티브가 넘긴 값으로 외부 URL·프로토콜 상대 경로(`//evil`)로 이동한다(T-21-16)
 *  8. 같은 탭 재탭 = 최상단    → 깨지면 탭을 다시 눌러도 스크롤이 그대로다(D-06)
 *  9. route 신호               → 깨지면 SPA 이동 뒤 네이티브 탭바 활성 표시가 옛 탭에 머문다(D-14)
 * 10. theme 신호               → 깨지면 테마를 바꿔도 상태바·탭바 팔레트가 옛 테마로 남는다(D-23)
 * 11. pull 신호(Android)       → 깨지면 호가 사다리를 위로 스크롤하다 페이지 전체가 새로고침된다(Pitfall 7)
 * 12. Provider 밖 폴백         → 깨지면 Provider 없이 렌더되는 컴포넌트·테스트가 전부 throw 한다
 *
 * ⚠️ 송신 단언은 **실제 postMessage 인자 배열을 JSON 파싱한 결과**로 한다.
 */

// --- next/navigation mock — 경로는 가변, push 는 스파이 ----------------------------
let mockPathname = '/';
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// --- next-themes mock — resolvedTheme 가변 ------------------------------------------
let mockResolvedTheme: string | undefined = 'light';
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: mockResolvedTheme, theme: mockResolvedTheme, setTheme: vi.fn() }),
}));

import {
  NativeBridgeProvider,
  useNativeBridge,
  type NativeRefreshFn,
} from '../native-bridge-provider';
import { useNativeRefresh } from '../use-native-refresh';
import {
  enterBrowser,
  enterNativeApp,
  resetNativeMode,
  type NativeTestWindow,
} from './native-app-mode';

function gh(): NonNullable<NativeTestWindow['__ghTrade']> {
  const g = (window as NativeTestWindow).__ghTrade;
  if (!g) throw new Error('window.__ghTrade 가 설치되지 않았다');
  return g;
}

function Refresher({ fn }: { fn: NativeRefreshFn | null }) {
  useNativeRefresh(fn);
  return null;
}

function Harness({
  a,
  b,
  showB = true,
}: {
  a?: NativeRefreshFn | null;
  b?: NativeRefreshFn | null;
  showB?: boolean;
}) {
  return (
    <NativeBridgeProvider>
      {a !== undefined && <Refresher fn={a} />}
      {showB && b !== undefined && <Refresher fn={b} />}
      <div data-testid="body" />
    </NativeBridgeProvider>
  );
}

beforeEach(() => {
  mockPathname = '/';
  mockResolvedTheme = 'light';
  pushMock.mockReset();
});

afterEach(() => {
  resetNativeMode();
  vi.restoreAllMocks();
});

describe('브라우저(html.native-app 없음)', () => {
  it('1. window.__ghTrade 가 없고, 경로·테마가 바뀌어도 채널 송신 0', () => {
    const mode = enterBrowser();
    const { rerender } = render(<Harness />);

    expect((window as NativeTestWindow).__ghTrade).toBeUndefined();

    mockPathname = '/me';
    mockResolvedTheme = 'dark';
    rerender(<Harness />);

    expect((window as NativeTestWindow).__ghTrade).toBeUndefined();
    for (const s of mode.spies) expect(s).not.toHaveBeenCalled();
  });
});

describe('앱 — window.__ghTrade 설치·해제', () => {
  it('2. 앱이면 refresh/navigate/back 이 함수 · 언마운트 후 undefined', () => {
    enterNativeApp('ios');
    const { unmount } = render(<Harness />);

    const g = gh();
    expect(typeof g.refresh).toBe('function');
    expect(typeof g.navigate).toBe('function');
    expect(typeof g.back).toBe('function');

    unmount();
    expect((window as NativeTestWindow).__ghTrade).toBeUndefined();
  });
});

describe('앱 — refresh 레지스트리(등록된 훅 전부 호출)', () => {
  it('3. 훅 A·B 가 등록돼 있으면 refresh() 1회에 A·B 각 1회', async () => {
    enterNativeApp('ios');
    const a = vi.fn();
    const b = vi.fn();
    render(<Harness a={a} b={b} />);

    await act(async () => {
      await gh().refresh();
    });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('4. A 가 reject 해도 B 는 불리고, 실패는 [gh-radar] console.error 로 드러난다', async () => {
    enterNativeApp('ios');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = vi.fn(() => Promise.reject(new Error('시세 재조회 실패')));
    const b = vi.fn();
    render(<Harness a={a} b={b} />);

    await act(async () => {
      await gh().refresh();
    });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(err.mock.calls.some((c) => String(c[0]).includes('[gh-radar]'))).toBe(true);
  });

  it('5. B 를 가진 컴포넌트가 언마운트되면 refresh() 는 A 만 부른다', async () => {
    enterNativeApp('ios');
    const a = vi.fn();
    const b = vi.fn();
    const { rerender } = render(<Harness a={a} b={b} />);
    rerender(<Harness a={a} b={b} showB={false} />);

    await act(async () => {
      await gh().refresh();
    });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it('5b. fn identity 가 바뀌어도 재등록 없이 최신 fn 만 1회 불린다 · null 은 무시', async () => {
    enterNativeApp('ios');
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Harness a={first} b={null} />);
    rerender(<Harness a={second} b={null} />);

    await act(async () => {
      await gh().refresh();
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  describe('6. 등록된 훅이 없으면', () => {
    let original: PropertyDescriptor | undefined;
    const reload = vi.fn();
    beforeEach(() => {
      original = Object.getOwnPropertyDescriptor(window, 'location');
      reload.mockReset();
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...window.location, pathname: '/', reload },
      });
    });
    afterEach(() => {
      if (original) Object.defineProperty(window, 'location', original);
    });

    it('window.location.reload() 1회', async () => {
      enterNativeApp('ios');
      render(<Harness />);

      await act(async () => {
        await gh().refresh();
      });

      expect(reload).toHaveBeenCalledTimes(1);
    });
  });
});

describe('앱 — navigate(path)', () => {
  it("7. '/search' 는 router.push('/search') 후 true", () => {
    enterNativeApp('ios');
    render(<Harness />);

    let ok = false;
    act(() => {
      ok = gh().navigate('/search');
    });

    expect(ok).toBe(true);
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith('/search');
  });

  it("8. 현재 경로와 같은 '/scanner' 는 push 없이 window.scrollTo(top:0) 1회 후 true", () => {
    enterNativeApp('ios');
    mockPathname = '/scanner';
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(<Harness />);

    let ok = false;
    act(() => {
      ok = gh().navigate('/scanner');
    });

    expect(ok).toBe(true);
    expect(pushMock).not.toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo.mock.calls[0][0]).toMatchObject({ top: 0 });
  });

  it("9. '//evil.com' · 'https://x' · '' · 숫자 · 역슬래시/제어문자 우회는 false 이고 push 0", () => {
    enterNativeApp('ios');
    render(<Harness />);

    // `/\evil.com` · `/<탭>/evil.com` 은 브라우저 URL 파서가 `//evil.com` 으로 읽는다(T-21-16).
    for (const bad of ['//evil.com', 'https://x', '', 42, null, undefined, '/\\evil.com', '/\t/evil.com']) {
      expect(gh().navigate(bad)).toBe(false);
    }
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe('앱 — route · theme 신호', () => {
  it("10. 마운트 직후 route {path:'/'} 1회 · '/me' 로 바뀌면 1회 추가 · 같은 값 rerender 는 0", () => {
    const mode = enterNativeApp('ios');
    const { rerender } = render(<Harness />);
    expect(mode.payloadsOf('route')).toEqual([{ path: '/' }]);

    mockPathname = '/me';
    rerender(<Harness />);
    expect(mode.payloadsOf('route')).toEqual([{ path: '/' }, { path: '/me' }]);

    rerender(<Harness />);
    expect(mode.payloadsOf('route')).toEqual([{ path: '/' }, { path: '/me' }]);
  });

  it("11. 마운트 뒤 theme {theme:'light'} 1회 · resolvedTheme 이 'dark' 가 되면 1회 추가", () => {
    const mode = enterNativeApp('ios');
    const { rerender } = render(<Harness />);
    expect(mode.payloadsOf('theme')).toEqual([{ theme: 'light' }]);

    rerender(<Harness />);
    expect(mode.payloadsOf('theme')).toEqual([{ theme: 'light' }]);

    mockResolvedTheme = 'dark';
    rerender(<Harness />);
    expect(mode.payloadsOf('theme')).toEqual([{ theme: 'light' }, { theme: 'dark' }]);
  });

  it('11b. resolvedTheme 이 아직 없으면(하이드레이션 전) theme 를 보내지 않는다', () => {
    const mode = enterNativeApp('ios');
    mockResolvedTheme = undefined;
    const { rerender } = render(<Harness />);
    expect(mode.payloadsOf('theme')).toEqual([]);

    mockResolvedTheme = 'dark';
    rerender(<Harness />);
    expect(mode.payloadsOf('theme')).toEqual([{ theme: 'dark' }]);
  });
});

describe('앱 — pull 신호(내부 스크롤 당김 차단)', () => {
  function scroller(scrollTop: number): HTMLDivElement {
    const el = document.createElement('div');
    el.style.overflowY = 'auto';
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 200 });
    Object.defineProperty(el, 'scrollTop', { configurable: true, value: scrollTop });
    const inner = document.createElement('span');
    el.appendChild(inner);
    document.body.appendChild(el);
    return el;
  }

  afterEach(() => {
    document.body.querySelectorAll('[data-test-scroller]').forEach((n) => n.remove());
  });

  it('12. Android: 위로 스크롤된 내부 스크롤 안 터치 → blocked:true · 반복 0 · 본문 터치 → blocked:false', () => {
    const mode = enterNativeApp('android');
    const el = scroller(40);
    el.setAttribute('data-test-scroller', '');
    const { getByTestId } = render(<Harness />);

    fireEvent.touchStart(el.firstElementChild as Element);
    expect(mode.payloadsOf('pull')).toEqual([{ blocked: true }]);

    fireEvent.touchStart(el.firstElementChild as Element);
    expect(mode.payloadsOf('pull')).toEqual([{ blocked: true }]);

    fireEvent.touchStart(getByTestId('body'));
    expect(mode.payloadsOf('pull')).toEqual([{ blocked: true }, { blocked: false }]);
  });

  it('12b. Android: 넘치지 않는 overflow-auto 조상(본문 main 같은)은 스크롤 조상으로 보지 않는다', () => {
    const mode = enterNativeApp('android');
    const el = document.createElement('div');
    el.style.overflowY = 'auto';
    el.setAttribute('data-test-scroller', '');
    const inner = document.createElement('span');
    el.appendChild(inner);
    document.body.appendChild(el);
    render(<Harness />);

    fireEvent.touchStart(inner);
    expect(mode.payloadsOf('pull')).toEqual([{ blocked: false }]);
  });

  it('13. iOS 앱에서는 pull 을 보내지 않는다', () => {
    const mode = enterNativeApp('ios');
    const el = scroller(40);
    el.setAttribute('data-test-scroller', '');
    render(<Harness />);

    fireEvent.touchStart(el.firstElementChild as Element);
    expect(mode.payloadsOf('pull')).toEqual([]);
  });
});

describe('Provider 밖 폴백', () => {
  it('14. useNativeBridge() 는 isNative:false · 등록/획득은 해제 함수를 돌려주고 throw 하지 않는다', () => {
    const { result } = renderHook(() => useNativeBridge());
    expect(result.current.isNative).toBe(false);
    const off = result.current.registerRefresh(() => {});
    const release = result.current.acquireOverlay();
    expect(() => {
      off();
      release();
    }).not.toThrow();
  });
});
