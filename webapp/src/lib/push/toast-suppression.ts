/**
 * 작업대 주문 토스트 숨김 판단 (Phase 40 · D-20 「배너와 토스트가 겹치면 하나만」).
 *
 * - **판단 = 네이티브 감지 + 서버 저장 토글 + 권한.** 앱 셸 안이고(`isNativeApp`) · 푸시 플러그인이 있고(옛 앱 아님) ·
 *   알림 권한이 granted 이고 · 서버 기기 목록에서 이 기기 키 행이 enabled 일 때만 숨긴다. 하나라도 아니면 토스트를
 *   그대로 낸다 — 토글 꺼진 앱 · 웹 브라우저 · 목록을 못 읽은 때에 알림 공백이 생기지 않게 「모르면 보인다」 쪽이다.
 * - **숨김 범위 = 돌파(breakout) 밖 6종**(accept · fill · modify · cancel · reject · vi)과 그 알림음. 체결 배너가 이미
 *   플랫폼 기본 소리를 낸다(D-17 · D-19). 돌파는 푸시가 없으므로 그대로 둔다. 카드 표시(`onNew`)도 그대로다 —
 *   숨기는 것은 `useTradingAlerts` 의 토스트 · 소리뿐이다.
 * - **판단 단위 = 알림 한 건의 계좌(리뷰 WR-06).** 위 넷이 참이어도 그 알림 계좌를 「받을 계좌」 에서 껐으면
 *   (quick-261109-dz1 `dma_push_account_mutes`) relay 가 이 사용자 기기를 고르지 않아 배너가 오지 않는다 — 그 계좌 알림은
 *   토스트 · 소리를 그대로 낸다. 끈 계좌 목록을 아직 못 읽었거나 계좌를 모르는 알림(주문번호 색인 미스)도 「모르면 보인다」 다.
 *   그래서 훅은 boolean 이 아니라 `(alert) => boolean` 판정을 돌려준다.
 * - **다시 계산:** 기기 목록 · 끈 계좌 저장소(카드 · 패널에서 켜고 끔 · 시작 갱신)가 바뀌면 즉시, 권한은 마운트 때와 화면이
 *   다시 보일 때(설정 앱에서 바꾸고 돌아옴) 다시 본다. 다시 보일 때 두 목록이 60초보다 낡았으면 새로 읽는다(PC 에서 바꾼
 *   계좌 끄기를 따라간다). 권한은 묻지 않는다(D-14 — 켤 때만 묻는다).
 * - 브라우저는 서버를 부르지 않는다(기기 목록 · 끈 계좌 읽기 0).
 * - 하지 않는 것: relay 송신기가 꺼진 경우(`PUSH_NOTIFY=off` 비상 끄기 · APNs 비밀 없음)는 server 가 알 길이 없어 판단에
 *   넣지 않는다 — 운영 비상 상황이라 그동안은 이 기기 알림을 끄면 토스트가 돌아온다.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { isNativeApp } from "@/lib/native/native-detect";
import { readPushDeviceKey } from "@/lib/push/device-key";
import { checkPushPermission, isPushPluginAvailable, type PushPermission } from "@/lib/push/native-push";
import {
  PUSH_ACCOUNT_MUTES_STALE_MS,
  pushAccountMutesSnapshot,
  refreshPushAccountMutes,
  subscribePushAccountMutes,
  type PushAccountMutesState,
} from "@/lib/push/use-push-account-mutes";
import {
  PUSH_DEVICES_STALE_MS,
  pushDevicesSnapshot,
  refreshPushDevices,
  subscribePushDevices,
  type PushDevicesState,
} from "@/lib/push/use-push-devices";
import type { TradingAlert } from "@/lib/trading-alerts";

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

/**
 * 이 알림 계좌로 배너가 오는가(WR-06) — 끈 계좌면 false. 끈 계좌 목록을 한 번도 못 읽었거나 계좌를 모르는 알림이면
 * 알 수 없으니 false(「모르면 보인다」).
 */
export function accountBannerExpected(accountNo: string | undefined, mutes: PushAccountMutesState): boolean {
  if (accountNo === undefined || mutes.loadedAt === null) return false;
  return !mutes.muted.includes(accountNo);
}

/** 알림 한 건 판정 — 기기 넷이 참이고 그 계좌 배너가 올 때만 숨긴다(D-20 · WR-06). */
export type OrderToastSuppressor = (alert: Pick<TradingAlert, "accountNo">) => boolean;

const NEVER: OrderToastSuppressor = () => false;

const EMPTY_DEVICES: PushDevicesState = { devices: [], loadedAt: null, error: false };
const serverDevicesSnapshot = (): PushDevicesState => EMPTY_DEVICES;
const EMPTY_MUTES: PushAccountMutesState = { muted: [], loadedAt: null, error: false };
const serverMutesSnapshot = (): PushAccountMutesState => EMPTY_MUTES;

function refreshIfStale(): void {
  const { loadedAt } = pushDevicesSnapshot();
  if (loadedAt === null || Date.now() - loadedAt > PUSH_DEVICES_STALE_MS) void refreshPushDevices();
  const mutes = pushAccountMutesSnapshot();
  if (mutes.loadedAt === null || Date.now() - mutes.loadedAt > PUSH_ACCOUNT_MUTES_STALE_MS) {
    void refreshPushAccountMutes();
  }
}

type Env = { native: boolean; pluginAvailable: boolean };
const BROWSER_ENV: Env = { native: false, pluginAvailable: false };

/** 작업대가 `useTradingAlerts({ suppressOrderToasts })` 에 넘길 판정 — 마운트 전 · 브라우저는 늘 false. */
export function useOrderToastSuppression(): OrderToastSuppressor {
  const [env, setEnv] = useState<Env>(BROWSER_ENV);
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const store = useSyncExternalStore(subscribePushDevices, pushDevicesSnapshot, serverDevicesSnapshot);
  const mutes = useSyncExternalStore(subscribePushAccountMutes, pushAccountMutesSnapshot, serverMutesSnapshot);

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
    refreshIfStale();

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      check();
      refreshIfStale();
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
  const deviceSuppressed = orderToastSuppressed({
    native: env.native,
    pluginAvailable: env.pluginAvailable,
    permission,
    thisDeviceEnabled,
  });
  const byAccount = useCallback<OrderToastSuppressor>(
    (alert) => accountBannerExpected(alert.accountNo, mutes),
    [mutes],
  );
  return deviceSuppressed ? byAccount : NEVER;
}
