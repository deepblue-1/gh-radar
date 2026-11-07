/**
 * 앱 셸 푸시 플러그인 호출 래퍼 (Phase 40 · D-12 · D-14 · D-17 · D-18).
 *
 * - **Capacitor npm 의존 없음:** webapp 에 `@capacitor/core` · `@capacitor/push-notifications` 를 넣지 않는다. 원격 페이지에는
 *   Capacitor native-bridge 가 `window.Capacitor` 를 주입하므로 `nativePromise('PushNotifications', method, options)` 와
 *   `addListener('PushNotifications', event, cb)` 를 얇게 부른다(관례: `lib/native/native-google-login.ts`). 창 타입은 이 파일
 *   안 지역 캐스팅(전역 선언 확장 금지).
 * - **옛 앱 판별(RESEARCH Pitfall 11):** 웹은 push 즉시 프로덕션이고 앱 재릴리스는 뒤다. 플러그인이 없는 옛 빌드에서
 *   `nativePromise('PushNotifications', …)` 는 「not implemented」 로 거부된다 → 부르기 전에 `isPushPluginAvailable()` 로 가른다.
 * - **리스너 먼저 → register(RESEARCH Pattern 7):** iOS `registration` 이벤트는 retain 되지 않는다 — `register()` 보다 늦게 붙인
 *   리스너는 토큰을 놓친다. `registerPushToken` 은 `registration` · `registrationError` 를 먼저 붙이고 `register()` 를 부른다.
 * - **채널(RESEARCH Pitfall 13 · D-18):** Android 는 `fills` 「체결 알림」 채널 하나. 소리 키를 싣지 않는다 = 플랫폼 기본 소리(D-17).
 * - **로그에 토큰을 남기지 않는다(T-19-14 동형).** 이 파일은 토큰 값을 로그 · 오류 메시지에 싣지 않는다.
 */

import { PUSH_CHANNEL_ID, PUSH_CHANNEL_NAME } from "@gh-radar/shared";

import { nativePlatform } from "@/lib/native/native-detect";
import { postNative } from "@/lib/native/post-native";

const PLUGIN = "PushNotifications";

/** `checkPermissions` · `requestPermissions` 의 `receive` 값 + 브리지 · 플러그인이 없을 때 `unavailable`. */
export type PushPermission = "granted" | "denied" | "prompt" | "prompt-with-rationale" | "unavailable";

type NativePromise = <T>(plugin: string, method: string, options?: object) => Promise<T>;
type ListenerHandle = { remove: () => Promise<void> | void };
type AddListener = (plugin: string, event: string, cb: (data: unknown) => void) => ListenerHandle;
type CapacitorLike = {
  isPluginAvailable?: (name: string) => boolean;
  nativePromise?: NativePromise;
  addListener?: AddListener;
};

function capacitor(): CapacitorLike | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Capacitor?: CapacitorLike }).Capacitor;
}

function nativeCall(): NativePromise {
  const cap = capacitor();
  if (!cap || typeof cap.nativePromise !== "function") throw new Error("native_unavailable");
  return cap.nativePromise.bind(cap) as NativePromise;
}

/** 로그용 오류 한 줄 — 메시지만(토큰 · 키는 오류에 싣지 않는다). */
export function pushErrorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

/** 이 앱 빌드에 푸시 플러그인이 있는가 — 브라우저 · SSR · 옛 앱은 false. */
export function isPushPluginAvailable(): boolean {
  try {
    return capacitor()?.isPluginAvailable?.(PLUGIN) === true;
  } catch {
    return false;
  }
}

const KNOWN_PERMISSIONS: ReadonlySet<string> = new Set(["granted", "denied", "prompt", "prompt-with-rationale"]);

async function permissionCall(method: "checkPermissions" | "requestPermissions"): Promise<PushPermission> {
  let call: NativePromise;
  try {
    call = nativeCall();
  } catch {
    return "unavailable";
  }
  try {
    const res = await call<{ receive?: unknown }>(PLUGIN, method);
    const receive = typeof res?.receive === "string" ? res.receive : "";
    return KNOWN_PERMISSIONS.has(receive) ? (receive as PushPermission) : "unavailable";
  } catch (err) {
    // 무로그 fail-safe 금지 — 플러그인 거부(옛 앱 등)를 한 줄 남기고 'unavailable' 로 돌린다.
    console.warn(`[gh-radar] push ${method} 실패`, pushErrorText(err));
    return "unavailable";
  }
}

/** 지금 알림 권한 — 묻지 않는다. 채널 · 플러그인 없음은 'unavailable'. */
export function checkPushPermission(): Promise<PushPermission> {
  return permissionCall("checkPermissions");
}

/** 알림 권한을 묻는다(iOS 는 첫 호출만 프롬프트 · Android 12 이하는 늘 granted). D-14 — 스위치를 켤 때만 부른다. */
export function requestPushPermission(): Promise<PushPermission> {
  return permissionCall("requestPermissions");
}

/**
 * Android 채널 `fills` 「체결 알림」(D-18) — iOS 는 아무것도 하지 않는다. importance 4 = HIGH(헤드업) · visibility 1 = PUBLIC.
 * sound 키 없음 = 플랫폼 기본 소리(D-17). 채널이 없는 Android 7(API 24 · 25)은 플러그인이 unavailable 로 거부한다 —
 * 채널은 보조라 등록을 막지 않고 한 줄 남긴 뒤 false.
 */
export async function createFillsChannel(): Promise<boolean> {
  if (nativePlatform() !== "android") return false;
  try {
    await nativeCall()(PLUGIN, "createChannel", {
      id: PUSH_CHANNEL_ID,
      name: PUSH_CHANNEL_NAME,
      importance: 4,
      visibility: 1,
    });
    return true;
  } catch (err) {
    console.warn("[gh-radar] push createChannel 실패", pushErrorText(err));
    return false;
  }
}

/**
 * 기기 푸시 토큰 받기 — `registration` · `registrationError` 리스너를 **먼저** 붙이고 `register()`.
 * value(iOS APNs 토큰 · Android FCM 토큰)로 resolve · registrationError · register 거부 · 시간 초과는 reject.
 * 끝나면(어느 쪽이든) 두 리스너를 뗀다.
 */
export function registerPushToken(timeoutMs = 10_000): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const cap = capacitor();
    if (!cap || typeof cap.addListener !== "function" || typeof cap.nativePromise !== "function") {
      reject(new Error("native_unavailable"));
      return;
    }
    const handles: ListenerHandle[] = [];
    let settled = false;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      for (const h of handles) {
        try {
          void h.remove();
        } catch {
          /* 리스너 떼기 실패는 결과를 바꾸지 않는다 */
        }
      }
      settle();
    };
    // 타이머는 리스너보다 먼저 잡는다 — 리스너가 동기로 불려도 finish 가 이미 초기화된 timer 를 지운다.
    const timer = setTimeout(() => finish(() => reject(new Error("push_register_timeout"))), timeoutMs);

    handles.push(
      cap.addListener(PLUGIN, "registration", (data) => {
        const value = (data as { value?: unknown } | null)?.value;
        if (typeof value === "string" && value.length > 0) finish(() => resolve(value));
        else finish(() => reject(new Error("push_register_empty")));
      }),
    );
    handles.push(
      cap.addListener(PLUGIN, "registrationError", (data) => {
        const detail = (data as { error?: unknown } | null)?.error;
        finish(() => reject(new Error(`push_register_error${detail ? `: ${String(detail)}` : ""}`)));
      }),
    );
    cap.nativePromise.call(cap, PLUGIN, "register").catch((err: unknown) => {
      finish(() => reject(new Error(`push_register_failed: ${pushErrorText(err)}`)));
    });
  });
}

/**
 * 알림 탭(`pushNotificationActionPerformed`) — 콜백에 `notification.data` 를 넘긴다(40-11 착지 처리). 떼는 함수를 돌려준다.
 * 브리지 · 플러그인이 없으면 아무것도 붙이지 않는다.
 */
export function addPushTapListener(cb: (data: Record<string, unknown>) => void): () => void {
  const cap = capacitor();
  if (!cap || typeof cap.addListener !== "function" || !isPushPluginAvailable()) return () => {};
  const handle = cap.addListener(PLUGIN, "pushNotificationActionPerformed", (event) => {
    const data = (event as { notification?: { data?: unknown } } | null)?.notification?.data;
    cb(data && typeof data === "object" ? (data as Record<string, unknown>) : {});
  });
  return () => {
    try {
      void handle.remove();
    } catch {
      /* 이미 떨어진 리스너 */
    }
  };
}

/** 설정 앱(iOS 앱 설정 · Android 앱 알림 설정)을 연다 — 실제로 보냈으면 true(D-14 · 40-03 `openSettings`). */
export function openAppNotificationSettings(): boolean {
  return postNative("openSettings");
}
