/**
 * 웹 → 네이티브 송신의 유일한 통로 (Phase 21 · D-12).
 *
 * - 채널 우선순위는 **iOS `webkit.messageHandlers.ghTrade` → Android `window.GhTradeBridge`** 이다.
 *   21-01 `NATIVE_DETECT_SCRIPT`(`<head>` 인라인 문자열 — import 불가)와 **같아야 한다**.
 *   두 채널이 동시에 보이는 환경에서도 한 번만 보낸다.
 * - 메시지는 `{type, payload}` 하나의 JSON **문자열**이다 — iOS `WKScriptMessage.body` 와 Android
 *   `@JavascriptInterface postMessage(String)` 가 같은 파서로 읽는다.
 * - 채널이 없으면(일반 브라우저 · SSR) 보내지 않고 `false` 를 돌려준다 — 조용히 성공으로 위장하지 않는다.
 * - 페이로드는 신호뿐이다(경로 · 테마 · 불리언). 개인정보·토큰을 싣지 않는다(T-21-02).
 */

export type NativeMsgType = 'ready' | 'route' | 'theme' | 'overlay' | 'pull';

/** 전역 `Window` 를 늘리지 않고 이 파일 안에서만 채널 모양을 선언한다. */
type NativeChannel = { postMessage(m: string): void };
type NativeWindow = Window & {
  webkit?: { messageHandlers?: { ghTrade?: NativeChannel } };
  GhTradeBridge?: NativeChannel;
};

/**
 * 네이티브 채널로 메시지 하나를 보낸다. 실제로 보냈으면 `true`, 채널이 없거나 송신이 throw 하면 `false`.
 *
 * 페이로드 계약: `route {path}` · `theme {theme:'dark'|'light'}` · `overlay {open}` · `pull {blocked}` ·
 * `ready`(21-01 인라인 스크립트가 보낸다).
 */
export function postNative(type: NativeMsgType, payload?: unknown): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const msg = JSON.stringify({ type, payload });
    const w = window as NativeWindow;
    const ios = w.webkit?.messageHandlers?.ghTrade;
    if (ios) {
      ios.postMessage(msg);
      return true;
    }
    if (w.GhTradeBridge) {
      w.GhTradeBridge.postMessage(msg);
      return true;
    }
    return false;
  } catch (err) {
    // 채널 오류 하나가 렌더를 터뜨리면 안 되고, 무로그로 삼켜서도 안 된다(PC-7).
    console.error('[gh-radar] postNative', type, err);
    return false;
  }
}
