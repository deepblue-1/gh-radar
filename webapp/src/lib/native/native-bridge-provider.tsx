'use client';

/**
 * 웹 쪽 앱 분기의 단일 접점 (Phase 21 · D-04 · D-06 · D-06a · D-12 · D-14 · D-23 · D-26).
 *
 * 앱 셸(`html.native-app` — 21-01 `<head>` 인라인 스크립트가 첫 페인트 전에 붙인다) 안에서만 켜진다.
 * **앱이 아니면 전부 no-op** 이다 — `window.__ghTrade` 를 만들지 않고 네이티브로 아무것도 보내지 않는다.
 * 브라우저 사용자에게 동작 변화 0.
 *
 * 책임 5가지(21-RESEARCH Pattern 4):
 *  1. `window.__ghTrade = { refresh, navigate, back }` 설치·해제 — 네이티브가 `evaluateJavaScript` 로 부른다.
 *  2. refresh 레지스트리 — `useNativeRefresh(fn)` 으로 등록된 훅을 **전부** 부른다(아래 결정).
 *  3. 오버레이 참조계수 — Sheet·Dialog·NumberPadSheet Content 안의 `NativeOverlayMarker` 가 올리고 내린다.
 *     0→1 에서 `overlay {open:true}`, 1→0 에서 `overlay {open:false}` 를 한 번씩만 보낸다(탭바 숨김 · 당김 비활성).
 *  4. `route {path}` · `theme {theme}` 신호 — 경로 변경마다 · 마운트 후와 `resolvedTheme` 변경 때.
 *  5. `pull {blocked}` 신호(Android) — 터치 시작 지점의 내부 스크롤이 위로 스크롤돼 있으면 문서 당김을 막는다.
 *
 * 레지스트리 의미 — 「스택 · 마지막 등록 우선」(RESEARCH 제안)이 아니라 **등록된 훅 전부 호출**:
 *  종목상세는 시세·뉴스·토론 섹션이 각자 자기 GET 재조회를 등록해야 D-18(외부 호출 경로 금지)을 섹션
 *  경계를 넘지 않고 지킬 수 있다. App Router 에서 동시에 마운트되는 페이지는 하나라 「중첩 페이지」 충돌이
 *  없다. 한 훅의 실패가 다른 훅을 막지 않도록 `Promise.allSettled` 로 부르고, 실패는 `[gh-radar]` 로그로
 *  드러낸다(PC-7 무로그 금지). 등록된 훅이 없으면 `location.reload()`.
 *
 * `navigate(path)` 는 네이티브가 넘긴 값을 **다시 검증**한다(T-21-16): 문자열 · `/` 시작 · `//` 금지 ·
 * 역슬래시·제어문자 금지(브라우저 URL 파서가 `/\evil` · `/\t/evil` 을 `//evil` 로 읽는다). 현재 경로와
 * 같으면 스크롤 최상단(D-06 재탭), 다르면 `router.push`(클라 내비 — relay 소켓 유지, Pattern 6).
 *
 * `back()` 은 오버레이가 열려 있으면 합성 Escape 를 `document` 로 보낸다 — Radix DismissableLayer 가
 * document capture keydown 을 듣고 **가장 위 레이어만** 닫는다(주문 확인 Escape = 취소, 주문 전송 없음 ·
 * T-21-17). 아무것도 안 열려 있으면 `false` → 네이티브가 WebView 히스토리/앱 종료를 처리한다(D-26).
 */

import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { isNativeApp, nativePlatform } from './native-detect';
import { postNative } from './post-native';

export type NativeRefreshFn = () => unknown | Promise<unknown>;

export interface NativeBridgeValue {
  /** 앱 셸 안인가(마운트 후에만 true — 하이드레이션 일치). */
  isNative: boolean;
  /** 당겨서 새로고침 훅 등록. 반환 = 해제. */
  registerRefresh: (fn: NativeRefreshFn) => () => void;
  /** 오버레이 열림 참조 획득. 반환 = 해제(중복 해제는 무시). */
  acquireOverlay: () => () => void;
}

/** 네이티브가 `evaluateJavaScript` 로 부르는 전역 — 앱에서만 존재한다. */
export interface GhTradeGlobal {
  refresh(): Promise<void>;
  navigate(path: unknown): boolean;
  back(): boolean;
}

type GhTradeWindow = Window & { __ghTrade?: GhTradeGlobal };

const NOOP = () => {};

/** Provider 밖 폴백 — 등록/획득은 해제 no-op 을 돌려주고 throw 하지 않는다. */
const EMPTY_NATIVE_BRIDGE: NativeBridgeValue = {
  isNative: false,
  registerRefresh: () => NOOP,
  acquireOverlay: () => NOOP,
};

const NativeBridgeContext = createContext<NativeBridgeValue | null>(null);

/** 경로로 쓸 수 있는 값인가 — 같은 출처의 절대 경로만(T-21-16). */
function isSafeInternalPath(path: unknown): path is string {
  if (typeof path !== 'string') return false;
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  // `\` 는 URL 파서가 `/` 로, 탭·개행은 제거한다 → `/\evil.com` · `/\t/evil.com` 이 `//evil.com` 이 된다.
  return !/[\\\u0000-\u001f\u007f]/.test(path);
}

/**
 * 터치 시작 지점에서 위로 올라가며 가장 가까운 **실제로 넘치는** 내부 스크롤 조상을 찾아, 그것이 위로
 * 스크롤돼 있으면 true. `overflow-auto` 라도 넘치지 않는 조상(본문 `main` 처럼 높이 제한이 없는 것)은
 * 건너뛴다. `body`·`html`(문서 스크롤)은 대상이 아니다 — 문서 당김은 네이티브가 판단한다.
 */
function innerScrollBlocked(target: EventTarget | null): boolean {
  let el: Element | null =
    target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  while (el && el !== document.body && el !== document.documentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) {
      return el.scrollTop > 0;
    }
    el = el.parentElement;
  }
  return false;
}

export function NativeBridgeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme } = useTheme();

  // 첫 렌더는 서버와 같게 false — 마운트 뒤 인라인 스크립트가 붙인 클래스를 읽는다.
  // 이 값이 곧 mounted 가드다(true 는 마운트 이후에만 된다).
  const [isNative, setIsNative] = useState(false);
  useEffect(() => {
    setIsNative(isNativeApp());
  }, []);

  const handlersRef = useRef(new Set<NativeRefreshFn>());
  const overlayCountRef = useRef(0);

  // `window.__ghTrade` 를 경로마다 다시 설치하지 않도록 최신 경로·라우터는 ref 로 읽는다.
  const pathnameRef = useRef(pathname);
  const routerRef = useRef(router);
  useEffect(() => {
    pathnameRef.current = pathname;
    routerRef.current = router;
  });

  const registerRefresh = useCallback((fn: NativeRefreshFn) => {
    const handlers = handlersRef.current;
    handlers.add(fn);
    return () => {
      handlers.delete(fn);
    };
  }, []);

  // 송신 여부는 DOM 클래스를 직접 읽는다 — Content 가 Provider 의 마운트 effect 보다 먼저 마운트돼도
  // (자식 effect 가 먼저 돈다) 계수와 신호가 어긋나지 않는다.
  const acquireOverlay = useCallback(() => {
    overlayCountRef.current += 1;
    if (overlayCountRef.current === 1 && isNativeApp()) postNative('overlay', { open: true });
    let released = false;
    return () => {
      if (released) return;
      released = true;
      overlayCountRef.current = Math.max(0, overlayCountRef.current - 1);
      if (overlayCountRef.current === 0 && isNativeApp()) postNative('overlay', { open: false });
    };
  }, []);

  // 1. window.__ghTrade — 앱에서만 설치, 언마운트 시 해제.
  useEffect(() => {
    if (!isNative) return;
    const w = window as GhTradeWindow;
    const api: GhTradeGlobal = {
      async refresh() {
        const handlers = [...handlersRef.current];
        if (handlers.length === 0) {
          window.location.reload();
          return;
        }
        const results = await Promise.allSettled(handlers.map((h) => Promise.resolve().then(h)));
        for (const r of results) {
          if (r.status === 'rejected') console.error('[gh-radar] native refresh 실패', r.reason);
        }
      },
      navigate(path) {
        if (!isSafeInternalPath(path)) return false;
        const bare = path.split(/[?#]/)[0];
        if (bare === pathnameRef.current) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          routerRef.current.push(path);
        }
        return true;
      },
      back() {
        if (overlayCountRef.current <= 0) return false;
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        );
        return true;
      },
    };
    w.__ghTrade = api;
    return () => {
      if (w.__ghTrade === api) delete w.__ghTrade;
    };
  }, [isNative]);

  // 4a. route — 경로가 바뀔 때마다 한 번(SPA 이동 뒤 네이티브 탭바 활성 보강 · D-14).
  useEffect(() => {
    if (!isNative || !pathname) return;
    postNative('route', { path: pathname });
  }, [isNative, pathname]);

  // 4b. theme — 마운트 후와 resolvedTheme 변경 때 한 번(D-23). 아직 해석 전(undefined)이면 보내지 않는다.
  useEffect(() => {
    if (!isNative || !resolvedTheme) return;
    postNative('theme', { theme: resolvedTheme === 'dark' ? 'dark' : 'light' });
  }, [isNative, resolvedTheme]);

  // 5. pull — Android 만. SwipeRefreshLayout 은 WebView 문서 스크롤만 보므로 내부 스크롤 상태를 알려 준다.
  //    iOS 는 CSS `overscroll-behavior-y: contain`(globals.css)으로 체이닝을 끊는다.
  useEffect(() => {
    if (!isNative || nativePlatform() !== 'android') return;
    let last: boolean | null = null;
    const onTouch = (e: TouchEvent) => {
      const blocked = innerScrollBlocked(e.target);
      if (blocked === last) return;
      last = blocked;
      postNative('pull', { blocked });
    };
    document.addEventListener('touchstart', onTouch, { capture: true, passive: true });
    return () => document.removeEventListener('touchstart', onTouch, { capture: true });
  }, [isNative]);

  const value = useMemo<NativeBridgeValue>(
    () => ({ isNative, registerRefresh, acquireOverlay }),
    [isNative, registerRefresh, acquireOverlay],
  );

  return <NativeBridgeContext value={value}>{children}</NativeBridgeContext>;
}

/** 브리지 읽기. **Provider 밖에서는 no-op 값**을 돌려준다(테스트·단독 렌더에서 throw 하지 않는다). */
export function useNativeBridge(): NativeBridgeValue {
  return useContext(NativeBridgeContext) ?? EMPTY_NATIVE_BRIDGE;
}
