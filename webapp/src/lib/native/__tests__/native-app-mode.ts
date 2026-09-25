import { vi, type Mock } from 'vitest';

/**
 * Phase 21 Plan 04 — 네이티브 앱 모드 테스트 헬퍼(테스트 파일 아님 — `*.test.*` 가 아니라 수집되지 않는다).
 *
 * `html.native-app` 클래스 · `data-native-platform` · 네이티브 채널(iOS `webkit.messageHandlers.ghTrade`
 * / Android `window.GhTradeBridge`)을 한 번에 설치·원복한다. 송신 단언은 **실제 postMessage 인자
 * 배열을 JSON 파싱한 결과**로 한다(relay-provider 테스트의 「실제 송신 프레임 배열」 원칙).
 */

export type NativeTestWindow = Window & {
  webkit?: unknown;
  GhTradeBridge?: unknown;
  __ghTrade?: {
    refresh: () => Promise<void>;
    navigate: (path: unknown) => boolean;
    back: () => boolean;
  };
};

export interface NativeMsg {
  type: string;
  payload?: unknown;
}

export interface NativeMode {
  /** 설치된 채널들의 postMessage 스파이(브라우저 모드에서도 채널은 달아 둔다 — 「있어도 안 보낸다」). */
  spies: Mock[];
  /** 모든 채널로 실제 송신된 메시지(JSON 파싱). */
  messages(): NativeMsg[];
  /** 특정 type 의 payload 목록. */
  payloadsOf(type: string): unknown[];
}

function collect(spies: Mock[]): NativeMode {
  const messages = () =>
    spies.flatMap((s) => s.mock.calls.map((c) => JSON.parse(c[0] as string) as NativeMsg));
  return {
    spies,
    messages,
    payloadsOf: (type) => messages().filter((m) => m.type === type).map((m) => m.payload),
  };
}

/** 앱 셸 모드 — 인라인 감지 스크립트가 붙였을 클래스·속성과 그 플랫폼의 채널만 설치한다. */
export function enterNativeApp(platform: 'ios' | 'android'): NativeMode {
  resetNativeMode();
  const d = document.documentElement;
  d.classList.add('native-app');
  d.setAttribute('data-native-platform', platform);
  const spy = vi.fn();
  const w = window as NativeTestWindow;
  if (platform === 'ios') w.webkit = { messageHandlers: { ghTrade: { postMessage: spy } } };
  else w.GhTradeBridge = { postMessage: spy };
  return collect([spy]);
}

/** 일반 브라우저 — 클래스는 없지만 두 채널 스파이는 달아 둔다(있어도 보내지 않아야 한다). */
export function enterBrowser(): NativeMode {
  resetNativeMode();
  const ios = vi.fn();
  const android = vi.fn();
  const w = window as NativeTestWindow;
  w.webkit = { messageHandlers: { ghTrade: { postMessage: ios } } };
  w.GhTradeBridge = { postMessage: android };
  return collect([ios, android]);
}

export function resetNativeMode(): void {
  const d = document.documentElement;
  d.classList.remove('native-app');
  d.removeAttribute('data-native-platform');
  const w = window as NativeTestWindow;
  delete w.webkit;
  delete w.GhTradeBridge;
  delete w.__ghTrade;
}
