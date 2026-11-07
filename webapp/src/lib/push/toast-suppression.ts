/**
 * 작업대 주문 토스트 숨김 판단 (Phase 40 · D-20 「배너와 토스트가 겹치면 하나만」).
 *
 * - **판단 = 네이티브 감지 + 서버 저장 토글 + 권한.** 앱 셸 안이고(`isNativeApp`) · 푸시 플러그인이 있고(옛 앱 아님) ·
 *   알림 권한이 granted 이고 · 서버 기기 목록에서 이 기기 키 행이 enabled 일 때만 숨긴다. 하나라도 아니면 토스트를
 *   그대로 낸다 — 토글 꺼진 앱 · 웹 브라우저 · 목록을 못 읽은 때에 알림 공백이 생기지 않게 「모르면 보인다」 쪽이다.
 * - **숨김 범위 = 돌파(breakout) 밖 6종**(accept · fill · modify · cancel · reject · vi)과 그 알림음. 체결 배너가 이미
 *   플랫폼 기본 소리를 낸다(D-17 · D-19). 돌파는 푸시가 없으므로 그대로 둔다. 카드 표시(`onNew`)도 그대로다 —
 *   숨기는 것은 `useTradingAlerts` 의 토스트 · 소리뿐이다.
 * - **다시 계산:** 기기 목록 저장소(카드에서 켜고 끔 · 시작 갱신)가 바뀌면 즉시, 권한은 마운트 때와 화면이 다시 보일 때
 *   (설정 앱에서 바꾸고 돌아옴) 다시 본다. 권한은 묻지 않는다(D-14 — 켤 때만 묻는다).
 * - 브라우저는 서버를 부르지 않는다(기기 목록 읽기 0).
 */

import { useEffect, useState, useSyncExternalStore } from "react";

import { isNativeApp } from "@/lib/native/native-detect";
import { readPushDeviceKey } from "@/lib/push/device-key";
import { checkPushPermission, isPushPluginAvailable, type PushPermission } from "@/lib/push/native-push";
import {
  PUSH_DEVICES_STALE_MS,
  pushDevicesSnapshot,
  refreshPushDevices,
  subscribePushDevices,
  type PushDevicesState,
} from "@/lib/push/use-push-devices";

export interface OrderToastSuppressionState {
  /** 앱 셸 안인가. */
  native: boolean;
  /** 푸시 플러그인이 있는 앱 빌드인가. */
  pluginAvailable: boolean;
  /** 알림 권한 — 아직 모르면 null. */
  permission: PushPermission | null;
  /** 서버 기기 목록에서 이 기기 키 행이 켜져 있는가. */
  thisDeviceEnabled: boolean;
}

/** 넷 다 참(권한 granted)일 때만 주문 토스트를 숨긴다(D-20). */
export function orderToastSuppressed(s: OrderToastSuppressionState): boolean {
  return s.native && s.pluginAvailable && s.permission === "granted" && s.thisDeviceEnabled;
}

const EMPTY_DEVICES: PushDevicesState = { devices: [], loadedAt: null, error: false };
const serverDevicesSnapshot = (): PushDevicesState => EMPTY_DEVICES;

type Env = { native: boolean; pluginAvailable: boolean };
const BROWSER_ENV: Env = { native: false, pluginAvailable: false };

/** 작업대가 `useTradingAlerts({ suppressOrderToasts })` 에 넘길 값 — 마운트 전 · 브라우저는 늘 false. */
export function useOrderToastSuppression(): boolean {
  const [env, setEnv] = useState<Env>(BROWSER_ENV);
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const store = useSyncExternalStore(subscribePushDevices, pushDevicesSnapshot, serverDevicesSnapshot);

  useEffect(() => {
    const native = isNativeApp();
    const pluginAvailable = native && isPushPluginAvailable();
    if (!pluginAvailable) return;
    setEnv({ native, pluginAvailable });

    let alive = true;
    const check = () => {
      void checkPushPermission().then((p) => {
        if (alive) setPermission(p);
      });
    };
    check();

    const { loadedAt } = pushDevicesSnapshot();
    if (loadedAt === null || Date.now() - loadedAt > PUSH_DEVICES_STALE_MS) void refreshPushDevices();

    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // 기기 키는 렌더마다 읽는다 — 같은 세션에서 카드가 처음 켜며 키를 만들어도 바로 따라간다(localStorage 읽기 1회).
  const deviceKey = env.pluginAvailable ? readPushDeviceKey() : null;
  const thisDeviceEnabled = deviceKey !== null && store.devices.some((d) => d.deviceKey === deviceKey && d.enabled);
  return orderToastSuppressed({
    native: env.native,
    pluginAvailable: env.pluginAvailable,
    permission,
    thisDeviceEnabled,
  });
}
