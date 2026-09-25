import { describe, it, expect, vi, afterEach } from 'vitest';

import { postNative } from '../post-native';
import { resetNativeMode, type NativeTestWindow } from './native-app-mode';

/**
 * Phase 21 Plan 04 Task 1 — `postNative` 채널 래퍼(D-12) 회귀면.
 *
 * 웹 → 네이티브 송신의 유일한 통로다. 각 케이스는 **깨졌을 때 사용자가 겪는 일**과 1:1 이다.
 *
 *  1. iOS 우선          → 깨지면 두 채널이 모두 보이는 환경에서 메시지가 두 번 가거나 엉뚱한 쪽으로 간다
 *  2. Android 폴백      → 깨지면 Android 앱에서만 탭바·테마·오버레이 신호가 전부 사라진다
 *  3. 채널 없음 = false → 깨지면 브라우저에서 「보냈다」고 거짓 보고해 호출부가 앱으로 착각한다
 *  4. SSR 가드          → 깨지면 서버 렌더에서 `window` 참조로 페이지 전체가 500 이 난다
 *  5. 송신 예외 흡수    → 깨지면 네이티브 채널 오류 하나가 React 렌더를 터뜨리고, 무로그면 원인을 못 찾는다
 *
 * ⚠️ 채널 우선순위는 21-01 `NATIVE_DETECT_SCRIPT` 인라인 스크립트와 같아야 한다.
 */

afterEach(() => {
  // SSR 케이스가 `window` 를 지운다 — 원복을 먼저 해야 채널 정리가 가능하다.
  vi.unstubAllGlobals();
  resetNativeMode();
  vi.restoreAllMocks();
});

function installIos(): ReturnType<typeof vi.fn> {
  const ios = vi.fn();
  (window as NativeTestWindow).webkit = { messageHandlers: { ghTrade: { postMessage: ios } } };
  return ios;
}

function installAndroid(): ReturnType<typeof vi.fn> {
  const android = vi.fn();
  (window as NativeTestWindow).GhTradeBridge = { postMessage: android };
  return android;
}

describe('postNative', () => {
  it('1. 두 채널이 다 있으면 iOS(webkit.messageHandlers.ghTrade)로만 1회 · 인자는 {type,payload} JSON 문자열', () => {
    const ios = installIos();
    const android = installAndroid();

    expect(postNative('route', { path: '/me' })).toBe(true);

    expect(ios).toHaveBeenCalledTimes(1);
    expect(android).not.toHaveBeenCalled();
    const [arg] = ios.mock.calls[0];
    expect(typeof arg).toBe('string');
    expect(JSON.parse(arg as string)).toEqual({ type: 'route', payload: { path: '/me' } });
  });

  it('2. iOS 채널이 없으면 window.GhTradeBridge 로 1회', () => {
    const android = installAndroid();

    expect(postNative('overlay', { open: true })).toBe(true);

    expect(android).toHaveBeenCalledTimes(1);
    expect(JSON.parse(android.mock.calls[0][0] as string)).toEqual({
      type: 'overlay',
      payload: { open: true },
    });
  });

  it('3. 채널이 둘 다 없으면 false 이고 아무것도 보내지 않는다', () => {
    expect(postNative('theme', { theme: 'dark' })).toBe(false);
  });

  it('4. window 가 없는 환경(SSR)에서는 false', () => {
    vi.stubGlobal('window', undefined);
    expect(postNative('pull', { blocked: true })).toBe(false);
  });

  it('5. 채널 송신이 throw 하면 삼키고 [gh-radar] 로그를 남긴 뒤 false', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    (window as NativeTestWindow).webkit = {
      messageHandlers: {
        ghTrade: {
          postMessage: () => {
            throw new Error('boom');
          },
        },
      },
    };

    expect(postNative('route', { path: '/' })).toBe(false);
    expect(err).toHaveBeenCalled();
    expect(String(err.mock.calls[0][0])).toContain('[gh-radar]');
  });
});
