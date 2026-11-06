"use client";

/**
 * PushDevicesCard — /me 설정 탭 「알림 받는 기기」 카드 (Phase 40 · D-12 · D-13 · D-14 · D-15).
 *
 * - **D-12 — 토글은 기기별 · 서버 저장.** 위 「이 기기」 카드(돌파 알림음 · 이 브라우저 localStorage)와 별개다. 켜고 끈
 *   상태는 server `/api/push-devices`(40-07)에 있다. 새 기기는 꺼짐에서 시작한다.
 * - **D-14 — 권한은 켤 때만 묻는다.** 앱 안 「이 기기 체결 알림」 스위치를 켜면: 권한 확인(prompt 면 그때 요청) → granted 면
 *   (Android) 채널 `fills` → `registration` 리스너 먼저 · `register()` → 토큰 → `PUT /api/push-devices/:deviceKey` → 켜짐.
 * - **RESEARCH Pitfall 11 — 옛 앱 빌드:** 플러그인이 없으면 스위치를 막고 「앱을 업데이트하면 켤 수 있어요」.
 * - **하이드레이션:** 네이티브 여부 · 권한 · 서버 기기 상태는 마운트 뒤에 읽는다 — 그 전엔 스위치 꺼짐 · 목록 비움.
 * - 계좌 칩과 무관하다(서버 저장 · 사용자 단위).
 */

import { useCallback, useEffect, useId, useState } from "react";
import type { PushDevice } from "@gh-radar/shared";

import { Switch } from "@/components/ui/switch";
import { isNativeApp, nativePlatform } from "@/lib/native/native-detect";
import { getOrCreatePushDeviceKey, pushDeviceLabel, readPushDeviceKey } from "@/lib/push/device-key";
import {
  checkPushPermission,
  createFillsChannel,
  isPushPluginAvailable,
  pushErrorText,
  registerPushToken,
  requestPushPermission,
} from "@/lib/push/native-push";
import { fetchPushDevices, registerThisPushDevice } from "@/lib/push/push-devices-api";

/** 카드 문구 — 테스트가 같은 상수로 단언한다. */
export const PUSH_DEVICES_TEXT = {
  title: "알림 받는 기기",
  captionApp: "이 기기에서 체결 알림을 받아요. 켜고 끈 상태는 서버에 저장돼요.",
  captionWeb: "알림 켜기는 그 기기의 GH Trade 앱에서 해요.",
  thisDevice: "이 기기 체결 알림",
  denied: "알림 권한이 꺼져 있어요. 설정 앱에서 GH Trade 알림을 허용해 주세요.",
  openSettings: "설정 열기",
  updateNeeded: "앱을 업데이트하면 켤 수 있어요.",
  failed: "켜지 못했어요. 잠시 뒤 다시 해 주세요.",
  empty: "등록된 기기가 없어요.",
  on: "켜짐",
  off: "꺼짐",
  turnOff: "끄기",
  remove: "지우기",
  confirmRemove: "한 번 더 누르면 지워요",
  lastSeen: "마지막 확인",
  platformIos: "iOS",
  platformAndroid: "Android",
} as const;

type Mode = "pending" | "web" | "app" | "app-outdated";
type Notice = "failed" | null;

export function PushDevicesCard() {
  const titleId = useId();
  const captionId = useId();
  const switchId = useId();

  const [mode, setMode] = useState<Mode>("pending");
  const [devices, setDevices] = useState<PushDevice[]>([]);
  const [thisKey, setThisKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  // 네이티브 여부 · 기기 키 · 서버 목록은 마운트 뒤에 읽는다(하이드레이션).
  useEffect(() => {
    const native = isNativeApp();
    setMode(native ? (isPushPluginAvailable() ? "app" : "app-outdated") : "web");
    setThisKey(readPushDeviceKey());
    let alive = true;
    fetchPushDevices().then(
      (list) => {
        if (alive) setDevices(list);
      },
      (err: unknown) => console.warn("[gh-radar] push 기기 목록 읽기 실패", pushErrorText(err)),
    );
    return () => {
      alive = false;
    };
  }, []);

  const thisOn = thisKey !== null && devices.some((d) => d.deviceKey === thisKey && d.enabled);

  const turnOn = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      let permission = await checkPushPermission();
      if (permission === "prompt" || permission === "prompt-with-rationale") {
        permission = await requestPushPermission();
      }
      if (permission !== "granted") {
        setNotice("failed");
        return;
      }
      await createFillsChannel();
      const token = await registerPushToken();
      const platform = nativePlatform();
      if (!platform) throw new Error("push_platform_unknown");
      const key = getOrCreatePushDeviceKey();
      setThisKey(key);
      const device = await registerThisPushDevice(key, {
        platform,
        token,
        label: pushDeviceLabel(navigator.userAgent),
      });
      setDevices((list) => [device, ...list.filter((d) => d.deviceKey !== device.deviceKey)]);
    } catch (err) {
      console.warn("[gh-radar] 이 기기 체결 알림 켜기 실패", pushErrorText(err));
      setNotice("failed");
    } finally {
      setBusy(false);
    }
  }, []);

  const onCheckedChange = (next: boolean) => {
    if (next) void turnOn();
  };

  const isApp = mode === "app" || mode === "app-outdated";

  return (
    <section
      data-slot="me-push-devices-card"
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col rounded-[var(--r-lg)] bg-[var(--card)] p-3"
    >
      <h2 id={titleId} className="px-1 text-[15px] font-semibold text-[var(--fg)]">
        {PUSH_DEVICES_TEXT.title}
      </h2>
      {mode !== "pending" && (
        <p
          id={captionId}
          className="px-1 pt-1 pb-2 text-[12.5px] leading-[1.5] break-keep text-[var(--muted-fg)]"
        >
          {isApp ? PUSH_DEVICES_TEXT.captionApp : PUSH_DEVICES_TEXT.captionWeb}
        </p>
      )}
      {isApp && (
        <div className="flex min-w-0 flex-col border-t border-[var(--border-subtle)] px-1 pt-1">
          <div className="flex min-h-[44px] min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <label htmlFor={switchId} className="text-[14px] font-normal whitespace-nowrap text-[var(--fg)]">
              {PUSH_DEVICES_TEXT.thisDevice}
            </label>
            <Switch
              id={switchId}
              data-slot="me-push-this-device"
              checked={thisOn}
              disabled={busy || mode === "app-outdated"}
              onCheckedChange={onCheckedChange}
              aria-describedby={captionId}
              className="ml-auto data-[state=checked]:bg-[var(--primary)]"
            />
          </div>
          {notice === "failed" && (
            <p
              role="status"
              data-slot="me-push-notice"
              className="pb-2 text-[12.5px] leading-[1.5] break-keep text-[var(--destructive)]"
            >
              {PUSH_DEVICES_TEXT.failed}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
