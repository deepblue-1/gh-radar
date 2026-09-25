/**
 * 네이티브 앱 셸 감지 (Phase 21 · D-11).
 *
 * - 웹이 **스스로** 앱 셸 안에 있는지 판정한다. 네이티브가 별도 bridge.js 를 주입해 DOM 을
 *   고치는 weekly-wine 방식은 쓰지 않는다 — 앱 분기의 정본은 웹의 `html.native-app` 클래스 하나다.
 * - `NATIVE_DETECT_SCRIPT` 는 `app/layout.tsx` 의 `<head>` 인라인 스크립트로 첫 페인트 전에 돈다.
 *   Capacitor native-bridge 는 문서 시작 시점에 주입된다(iOS `WKUserScript` `.atDocumentStart` ·
 *   Android `addDocumentStartJavaScript` — 21-RESEARCH Pattern 4) → 이 스크립트가 실행될 때
 *   `window.Capacitor.isNativePlatform` 이 이미 있다. 브라우저에서는 `window.Capacitor` 가 없어
 *   DOM 변화 0 · 송신 0.
 * - 감지되면 `<html>` 에 `native-app` 클래스와 `data-native-platform="ios|android"` 를 붙이고
 *   `ready` 메시지(JSON 문자열 `{type, payload}`)를 네이티브 채널로 한 번 보낸다.
 * - 의존성 0 인 IIFE 문자열이어야 한다(번들 밖에서 실행). 예외는 전부 삼킨다 — `<head>` 스크립트가
 *   throw 하면 뒤따르는 초기화 스크립트까지 흔들린다.
 */

/**
 * ⚠️ 채널 우선순위(iOS `webkit.messageHandlers.ghTrade` → Android `window.GhTradeBridge`)는
 * 21-04 `post-native.ts` 의 `postNative` 와 **같아야 한다** — 인라인 문자열이라 import 할 수 없다.
 */
export const NATIVE_DETECT_SCRIPT = `(function(){try{var C=window.Capacitor;if(C&&C.isNativePlatform&&C.isNativePlatform()){var d=document.documentElement;var p=C.getPlatform();d.classList.add('native-app');d.setAttribute('data-native-platform',p);var m=JSON.stringify({type:'ready',payload:{platform:p,nativeApp:true,path:location.pathname}});var w=window.webkit;if(w&&w.messageHandlers&&w.messageHandlers.ghTrade){w.messageHandlers.ghTrade.postMessage(m);}else if(window.GhTradeBridge){window.GhTradeBridge.postMessage(m);}}}catch(e){}})();`;

/** 앱 셸 안인가 — 인라인 스크립트가 붙인 클래스를 그대로 읽는다. SSR 에서는 false. */
export function isNativeApp(): boolean {
  return (
    typeof document !== 'undefined' && document.documentElement.classList.contains('native-app')
  );
}

/** 앱 셸 플랫폼 — `data-native-platform` 이 `ios`/`android` 일 때만 그 값, 아니면 null. */
export function nativePlatform(): 'ios' | 'android' | null {
  if (typeof document === 'undefined') return null;
  const p = document.documentElement.getAttribute('data-native-platform');
  return p === 'ios' || p === 'android' ? p : null;
}
