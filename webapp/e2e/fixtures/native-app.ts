import type { Page } from '@playwright/test';

/**
 * Phase 21 Plan 05 — 앱 모드(Capacitor 셸)를 브라우저에서 재현하는 e2e 픽스처 (D-11 · D-12).
 *
 * ① 무엇을 흉내 내고 무엇을 흉내 내지 않는가
 *   가짜로 심는 것은 **네이티브가 문서 시작 시점에 주입하는 것**뿐이다 — `window.Capacitor`
 *   (`isNativePlatform` · `getPlatform`)와 웹 → 네이티브 메시지 채널(iOS
 *   `webkit.messageHandlers.ghTrade` · Android `window.GhTradeBridge`). 그 뒤는 전부 **실물**이다:
 *   `app/layout.tsx` `<head>` 의 인라인 감지 스크립트(21-01 `NATIVE_DETECT_SCRIPT`)가 이 가짜를 보고
 *   `html.native-app` · `data-native-platform` 을 붙이고 `ready` 를 보내며, `NativeBridgeProvider`
 *   (21-04)가 `window.__ghTrade` 를 설치하고 `route` · `overlay` · `theme` 를 보낸다. 앱 분기 코드를
 *   건너뛰는 지름길(클래스 직접 부착 등)을 쓰면 감지 스크립트·Provider 가 깨져도 테스트가 통과한다.
 *
 * ② 캡처 채널
 *   채널이 받는 JSON 문자열(`{type, payload}`)을 파싱해 `window.__nativeMsgs` 배열에 쌓는다.
 *   네이티브가 실제로 받는 것과 같은 바이트를 파싱하므로 직렬화 모양까지 검증된다.
 *
 * ③ `addInitScript` 는 **매 내비게이션 문서마다** 문서 스크립트보다 먼저 다시 돈다 — 전체
 *   새로고침이 일어나면 `__nativeMsgs` 도 비워진다(클라 내비에서는 유지된다). 한 번만 부르면 된다.
 *
 * 테스트 전용 — `e2e/` 는 프로덕션 번들에 들어가지 않는다(T-21 경계).
 */

export type NativeTestPlatform = 'ios' | 'android';

export interface CapturedNativeMsg {
  type: string;
  payload?: unknown;
}

declare global {
  interface Window {
    /** 픽스처 캡처 채널이 쌓는 웹 → 네이티브 메시지(파싱 후). */
    __nativeMsgs?: CapturedNativeMsg[];
    /** 21-04 NativeBridgeProvider 가 앱에서만 설치하는 전역(여기서는 e2e 가 부르는 부분만). */
    __ghTrade?: { navigate(path: unknown): boolean; back(): boolean; refresh(): Promise<void> };
  }
}

export async function installNativeApp(
  page: Page,
  opts: { platform?: NativeTestPlatform } = {},
): Promise<void> {
  const { platform = 'ios' } = opts;
  await page.addInitScript((p: NativeTestPlatform) => {
    const w = window as unknown as Record<string, unknown> & Window;
    w.__nativeMsgs = [];
    const capture = (m: string) => {
      w.__nativeMsgs!.push(JSON.parse(m) as CapturedNativeMsg);
    };
    w.Capacitor = { isNativePlatform: () => true, getPlatform: () => p };
    if (p === 'ios') {
      w.webkit = { messageHandlers: { ghTrade: { postMessage: capture } } };
    } else {
      w.GhTradeBridge = { postMessage: capture };
    }
  }, platform);
}

/** 지금까지 캡처된 메시지(앱 모드가 아니면 빈 배열). */
export async function nativeMessages(page: Page): Promise<CapturedNativeMsg[]> {
  return page.evaluate(() => window.__nativeMsgs ?? []);
}
