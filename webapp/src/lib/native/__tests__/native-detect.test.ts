import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { NATIVE_DETECT_SCRIPT, isNativeApp, nativePlatform } from '../native-detect';

/**
 * Phase 21 Plan 01 Task 3 — `<head>` 인라인 네이티브 감지 스크립트(D-11) 회귀면.
 *
 * 이 스크립트는 웹이 **스스로** 앱 셸 안에 있는지 판정하는 유일한 지점이다. 각 케이스는
 * **깨졌을 때 사용자가 겪는 일**과 1:1 이다.
 *
 *  1. 브라우저 무변화        → 깨지면 일반 브라우저 사용자에게 앱 전용 셸(탭바 여백·헤더 숨김)이 적용된다
 *  2. iOS 감지 + ready 송신  → 깨지면 앱이 웹 준비 완료를 모르고 네이티브 탭바·테마가 동기화되지 않는다
 *  3. Android 채널 폴백      → 깨지면 Android 앱에서만 ready 가 사라진다(채널 우선순위 iOS → Android)
 *  4. 비네이티브 Capacitor   → 깨지면 Capacitor 웹 런타임이 있는 페이지가 앱으로 오인된다
 *  5. throw 흡수             → 깨지면 `<head>` 스크립트 예외로 첫 페인트 전 스크립트 실행이 끊긴다
 *  6. isNativeApp/nativePlatform → 깨지면 로그인·Provider 의 앱 분기가 엉뚱한 쪽으로 간다
 *
 * ⚠️ postMessage 는 **실제 송신된 인자 배열**을 세어 단언한다 — 클래스만 보면 「붙었는데 안
 *    보낸」 경우를 놓친다.
 */

type W = Window & {
  Capacitor?: unknown;
  webkit?: unknown;
  GhTradeBridge?: unknown;
};

function run(): void {
  new Function(NATIVE_DETECT_SCRIPT)();
}

function resetDom(): void {
  const d = document.documentElement;
  d.classList.remove('native-app');
  d.removeAttribute('data-native-platform');
  const w = window as W;
  delete w.Capacitor;
  delete w.webkit;
  delete w.GhTradeBridge;
}

beforeEach(resetDom);
afterEach(resetDom);

describe('NATIVE_DETECT_SCRIPT', () => {
  it('1. window.Capacitor 가 없으면 <html> 변화 0 · 송신 0', () => {
    const ios = vi.fn();
    const android = vi.fn();
    (window as W).webkit = { messageHandlers: { ghTrade: { postMessage: ios } } };
    (window as W).GhTradeBridge = { postMessage: android };

    run();

    expect(document.documentElement.classList.contains('native-app')).toBe(false);
    expect(document.documentElement.hasAttribute('data-native-platform')).toBe(false);
    expect(ios).not.toHaveBeenCalled();
    expect(android).not.toHaveBeenCalled();
  });

  it('2. iOS 네이티브면 native-app · data-native-platform="ios" · ghTrade 로 ready 1회(JSON 문자열)', () => {
    const ios = vi.fn();
    (window as W).Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
    (window as W).webkit = { messageHandlers: { ghTrade: { postMessage: ios } } };

    run();

    const d = document.documentElement;
    expect(d.classList.contains('native-app')).toBe(true);
    expect(d.getAttribute('data-native-platform')).toBe('ios');
    expect(ios).toHaveBeenCalledTimes(1);
    const [arg] = ios.mock.calls[0];
    expect(typeof arg).toBe('string');
    expect(JSON.parse(arg as string)).toEqual({
      type: 'ready',
      payload: { platform: 'ios', nativeApp: true, path: '/' },
    });
  });

  it('3. Android 는 웹킷 채널이 없으면 window.GhTradeBridge 로 1회', () => {
    const android = vi.fn();
    (window as W).Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
    (window as W).GhTradeBridge = { postMessage: android };

    run();

    expect(document.documentElement.getAttribute('data-native-platform')).toBe('android');
    expect(android).toHaveBeenCalledTimes(1);
    expect(JSON.parse(android.mock.calls[0][0] as string)).toEqual({
      type: 'ready',
      payload: { platform: 'android', nativeApp: true, path: '/' },
    });
  });

  it('4. isNativePlatform() 이 false 면 변화 0 · 송신 0', () => {
    const ios = vi.fn();
    (window as W).Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };
    (window as W).webkit = { messageHandlers: { ghTrade: { postMessage: ios } } };

    run();

    expect(document.documentElement.classList.contains('native-app')).toBe(false);
    expect(document.documentElement.hasAttribute('data-native-platform')).toBe(false);
    expect(ios).not.toHaveBeenCalled();
  });

  it('5. isNativePlatform 이 throw 해도 스크립트는 throw 하지 않는다', () => {
    (window as W).Capacitor = {
      isNativePlatform: () => {
        throw new Error('boom');
      },
      getPlatform: () => 'ios',
    };

    expect(() => run()).not.toThrow();
    expect(document.documentElement.classList.contains('native-app')).toBe(false);
  });
});

describe('isNativeApp / nativePlatform', () => {
  it('6a. 감지 전에는 false / null', () => {
    expect(isNativeApp()).toBe(false);
    expect(nativePlatform()).toBeNull();
  });

  it('6b. 스크립트가 감지한 뒤에는 true / 플랫폼', () => {
    (window as W).Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
    run();
    expect(isNativeApp()).toBe(true);
    expect(nativePlatform()).toBe('ios');
  });

  it('6c. data-native-platform 이 ios/android 가 아니면 null', () => {
    document.documentElement.setAttribute('data-native-platform', 'web');
    expect(nativePlatform()).toBeNull();
  });
});
