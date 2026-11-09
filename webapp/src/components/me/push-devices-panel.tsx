"use client";

/**
 * PushDevicesPanel — 「매매 알림」 패널 본문 (Phase 40 · D-12 · D-13 · D-14 · D-15 → quick-261107-fbj · 스케치 030 A).
 *
 * - **자리(quick-261107-fbj):** /me 설정 탭의 카드였던 것을 계정 카드 「매매 알림」 종(`push-alert-bell.tsx`)이 여는
 *   바텀 시트(폰 · 앱) / 팝오버(데스크톱 브라우저) 안 본문으로 옮겼다. 카드 테두리 · 제목은 감싸는 시트/팝오버가 그린다 —
 *   여기는 캡션 · 이 기기 스위치 · 다른 기기 목록 · 안내만 그린다. 푸시는 체결만이 아니라 접수 · 체결 · 거부 · 자동 취소 ·
 *   자동매도 시작/완료라 이름을 「매매 알림」 으로 바꿨다.
 * - **D-12 — 토글은 기기별 · 서버 저장.** 켜고 끈 상태는 server `/api/push-devices`(40-07)에 있다. 새 기기는 꺼짐에서
 *   시작한다.
 * - **D-13 — PC 브라우저는 보기 · 끄기 · 지우기만.** 등록 기기 목록(기기명 · iOS/Android · 「마지막 확인 MM/DD HH:mm」 KST)과
 *   켜진 기기 「끄기」 · 「지우기」(한 번 더 눌러 확인 · 5초 뒤 원래대로). 켜기는 권한이 필요해 그 기기 앱에서만. 앱 안에서는
 *   맨 위 「이 기기 매매 알림」 스위치 아래에 소제목 「다른 기기」 와 목록이 같은 꼴로 이어진다(이 기기 행은 스위치가 대표).
 * - **D-14 — 권한은 켤 때만 묻는다.** 스위치를 켜면: 권한 확인(prompt 면 그때 요청) → granted 면 (Android) 채널 `fills` →
 *   `registration` 리스너 먼저 · `register()` → 토큰 → `PUT /api/push-devices/:deviceKey` → 켜짐. 거부(이미 거부 포함 · iOS
 *   재요청 불가)면 스위치는 꺼짐 그대로 · 「설정 앱에서 … 허용해 주세요」 + 「설정 열기」(`postNative('openSettings')` — 보내지
 *   못하면 버튼을 숨기고 안내만). 끄기는 PATCH 만(네이티브 등록 해제 없음).
 * - **D-15 — 로그아웃 정리는 auth-context `signOut` 몫**(`unregisterThisDeviceBeforeSignOut`).
 * - **RESEARCH Pitfall 11 — 옛 앱 빌드:** 플러그인이 없으면 스위치를 막고 「앱을 업데이트하면 켤 수 있어요」 — 웹이 먼저 배포돼도
 *   깨지지 않는다.
 * - **하이드레이션:** 네이티브 여부 · 권한 · 서버 기기 상태는 마운트 뒤에 읽는다 — 그 전엔 스위치 꺼짐 · 목록 비움.
 * - **quick-261109-dz1 · 스케치 031 A — 「받을 계좌」.** 이 기기 스위치 아래(웹은 캡션 아래) · 기기 목록 위에 relay 계좌마다
 *   스위치 한 줄. 의미는 사용자 × 계좌 끄기(D-01) — 끈 계좌는 내 모든 기기에서 오지 않고, 기기 스위치와 별개다(둘 다 켜져야
 *   간다). 권한이 필요 없어 PC 웹에서도 켜고 끈다. 계좌 출처는 /me 계좌 칩과 같은 relay 계좌(`meAccountChoicesOf` — 번호
 *   dedupe · D-07)이고 0 개면 섹션을 숨긴다. 스위치는 낙관적으로 바뀌고 실패하면 되돌린다(D-10). 종 초록 점은 그대로.
 * - 기기 스위치는 계좌 칩과 무관하다(서버 저장 · 사용자 단위) — 계좌별 끄기는 「받을 계좌」 섹션 몫. 색은 기존 토큰만.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { PushDevice } from "@gh-radar/shared";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { accountChipLabelOf } from "@/lib/account-label";
import { ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { isNativeApp, nativePlatform } from "@/lib/native/native-detect";
import { getOrCreatePushDeviceKey, pushDeviceLabel, readPushDeviceKey } from "@/lib/push/device-key";
import {
  checkPushPermission,
  createFillsChannel,
  isPushPluginAvailable,
  openAppNotificationSettings,
  pushErrorText,
  registerPushToken,
  requestPushPermission,
} from "@/lib/push/native-push";
import {
  deletePushDevice,
  disablePushDevice,
  registerThisPushDevice,
  setPushAccountEnabled,
} from "@/lib/push/push-devices-api";
import { updatePushAccountMutesLocal, usePushAccountMutes } from "@/lib/push/use-push-account-mutes";
import { refreshPushDevices, updatePushDevicesLocal, usePushDevices } from "@/lib/push/use-push-devices";
import { useRelayContext } from "@/lib/relay-provider";
import { meAccountChoicesOf, type MeAccountChoice } from "@/lib/trading-layout";

/** 패널 문구 — 종 버튼 이름 · 시트/팝오버 제목도 같은 상수를 쓴다. 테스트가 같은 상수로 단언한다. */
export const PUSH_DEVICES_TEXT = {
  title: "매매 알림",
  captionApp: "주문 접수 · 체결 · 거부 · 자동 취소와 자동매도 시작 · 완료를 이 기기로 알려 드려요.",
  captionWeb: "주문 접수 · 체결 · 거부 · 자동 취소와 자동매도 소식을 받을 기기예요. 켜기는 그 기기의 GH Trade 앱에서 해요.",
  thisDevice: "이 기기 매매 알림",
  otherDevices: "다른 기기",
  devices: "기기",
  accountsHeading: "받을 계좌",
  accountsFoot: "끈 계좌는 내 모든 기기에서 알림이 오지 않아요.",
  accountSwitchSuffix: "매매 알림",
  accountsLoadFailed: "받을 계좌 설정을 읽지 못했어요.",
  denied: "알림 권한이 꺼져 있어요. 설정 앱에서 GH Trade 알림을 허용해 주세요.",
  openSettings: "설정 열기",
  updateNeeded: "앱을 업데이트하면 켤 수 있어요.",
  failed: "켜지 못했어요. 잠시 뒤 다시 해 주세요.",
  actionFailed: "처리하지 못했어요. 잠시 뒤 다시 해 주세요.",
  loadFailed: "기기 목록을 읽지 못했어요.",
  empty: "등록된 기기가 없어요.",
  unknownDevice: "알 수 없는 기기",
  on: "켜짐",
  off: "꺼짐",
  turnOff: "끄기",
  remove: "지우기",
  confirmRemove: "한 번 더 누르면 지워요",
  lastSeen: "마지막 확인",
  platformIos: "iOS",
  platformAndroid: "Android",
} as const;

/** 「지우기」 확인 대기 — 이 시간 안에 한 번 더 눌러야 지운다. */
const CONFIRM_REMOVE_MS = 5_000;

const LAST_SEEN_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  // hour12:false 는 일부 ICU 에서 자정을 「24」 로 쓴다 — h23 으로 00~23 을 고정한다.
  hourCycle: "h23",
});

/** ISO 시각 → KST 「MM/DD HH:mm」. 읽을 수 없으면 「—」. */
export function formatPushLastSeen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const parts: Record<string, string> = {};
  for (const p of LAST_SEEN_FMT.formatToParts(d)) parts[p.type] = p.value;
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

type Mode = "pending" | "web" | "app" | "app-outdated";
type SwitchNotice = "failed" | "denied" | null;

const isNotFound = (err: unknown) => err instanceof ApiClientError && err.status === 404;

export function PushDevicesPanel({ className }: { className?: string }) {
  const captionId = useId();
  const switchId = useId();

  const { devices, loadedAt, error } = usePushDevices();
  const [mode, setMode] = useState<Mode>("pending");
  const [thisKey, setThisKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [switchNotice, setSwitchNotice] = useState<SwitchNotice>(null);
  const [settingsHidden, setSettingsHidden] = useState(false);
  const [listFailed, setListFailed] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // quick-261109-dz1 D-07 — /me 계좌 칩과 같은 relay 계좌 · 번호 dedupe(첫 서버키).
  const { accounts } = useRelayContext();
  const accountChoices = useMemo(() => meAccountChoicesOf(accounts, []), [accounts]);

  // 네이티브 여부 · 기기 키 · 권한은 마운트 뒤에 읽는다(하이드레이션). 목록은 usePushDevices 가 읽는다.
  useEffect(() => {
    const native = isNativeApp();
    const plugin = native && isPushPluginAvailable();
    setMode(native ? (plugin ? "app" : "app-outdated") : "web");
    setThisKey(readPushDeviceKey());
    if (!plugin) return;
    let alive = true;
    void checkPushPermission().then((p) => {
      if (alive && p === "denied") setSwitchNotice("denied");
    });
    return () => {
      alive = false;
    };
  }, []);

  // 설정 앱에서 돌아오면 권한을 다시 본다 — 허용했으면 거부 안내를 걷는다.
  useEffect(() => {
    if (mode !== "app" || switchNotice !== "denied") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void checkPushPermission().then((p) => {
        if (p !== "denied") setSwitchNotice((n) => (n === "denied" ? null : n));
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [mode, switchNotice]);

  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    },
    [],
  );

  const shown = mode === "pending" ? [] : devices;
  const thisOn = mode !== "pending" && thisKey !== null && shown.some((d) => d.deviceKey === thisKey && d.enabled);
  const others = shown.filter((d) => d.deviceKey !== thisKey || mode === "web");

  const turnOn = useCallback(async () => {
    setBusy(true);
    setSwitchNotice(null);
    try {
      let permission = await checkPushPermission();
      if (permission === "prompt" || permission === "prompt-with-rationale") {
        permission = await requestPushPermission();
      }
      if (permission === "denied") {
        setSettingsHidden(false);
        setSwitchNotice("denied");
        return;
      }
      if (permission !== "granted") throw new Error(`push_permission_${permission}`);
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
      updatePushDevicesLocal((list) => [device, ...list.filter((d) => d.deviceKey !== device.deviceKey)]);
      void refreshPushDevices();
    } catch (err) {
      console.warn("[gh-radar] 이 기기 매매 알림 켜기 실패", pushErrorText(err));
      setSwitchNotice("failed");
    } finally {
      setBusy(false);
    }
  }, []);

  /** 끄기 — PATCH 만(네이티브 등록 해제 없음). 404 = 이미 없는 행 → 목록에서 뺀다. 실패면 false. */
  const disableDevice = useCallback(async (key: string): Promise<boolean> => {
    try {
      await disablePushDevice(key);
      updatePushDevicesLocal((list) => list.map((d) => (d.deviceKey === key ? { ...d, enabled: false } : d)));
    } catch (err) {
      if (!isNotFound(err)) {
        console.warn("[gh-radar] push 기기 끄기 실패", pushErrorText(err));
        return false;
      }
      updatePushDevicesLocal((list) => list.filter((d) => d.deviceKey !== key));
    }
    void refreshPushDevices();
    return true;
  }, []);

  const turnOffThis = useCallback(async () => {
    if (!thisKey) return;
    setBusy(true);
    setSwitchNotice(null);
    const ok = await disableDevice(thisKey);
    if (!ok) setListFailed(true);
    setBusy(false);
  }, [disableDevice, thisKey]);

  const onCheckedChange = (next: boolean) => {
    if (next) void turnOn();
    else void turnOffThis();
  };

  const onOpenSettings = () => {
    if (!openAppNotificationSettings()) setSettingsHidden(true);
  };

  const onRowOff = async (key: string) => {
    setRowBusy(key);
    setListFailed(false);
    const ok = await disableDevice(key);
    if (!ok) setListFailed(true);
    setRowBusy(null);
  };

  const onRowRemove = async (key: string) => {
    if (confirmKey !== key) {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      setConfirmKey(key);
      confirmTimer.current = setTimeout(() => {
        confirmTimer.current = null;
        setConfirmKey((k) => (k === key ? null : k));
      }, CONFIRM_REMOVE_MS);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = null;
    setConfirmKey(null);
    setRowBusy(key);
    setListFailed(false);
    try {
      await deletePushDevice(key);
      updatePushDevicesLocal((list) => list.filter((d) => d.deviceKey !== key));
      void refreshPushDevices();
    } catch (err) {
      if (isNotFound(err)) {
        updatePushDevicesLocal((list) => list.filter((d) => d.deviceKey !== key));
        void refreshPushDevices();
      } else {
        console.warn("[gh-radar] push 기기 지우기 실패", pushErrorText(err));
        setListFailed(true);
      }
    } finally {
      setRowBusy(null);
    }
  };

  const isApp = mode === "app" || mode === "app-outdated";
  const showEmpty = mode === "web" && loadedAt !== null && others.length === 0;
  const showLoadFailed = mode !== "pending" && error && loadedAt === null;
  // 하이드레이션 — 마운트 전 미표시 · 계좌 0 이면 섹션 없음(D-06).
  const showAccounts = mode !== "pending" && accountChoices.length > 0;

  return (
    <div data-slot="me-push-devices-panel" className={cn("flex min-w-0 flex-col", className)}>
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
          <div className="flex min-h-[48px] min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
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
          {mode === "app-outdated" && (
            <p data-slot="me-push-notice" className="pb-2 text-[12.5px] leading-[1.5] break-keep text-[var(--muted-fg)]">
              {PUSH_DEVICES_TEXT.updateNeeded}
            </p>
          )}
          {switchNotice === "failed" && (
            <p
              role="status"
              data-slot="me-push-notice"
              className="pb-2 text-[12.5px] leading-[1.5] break-keep text-[var(--destructive)]"
            >
              {PUSH_DEVICES_TEXT.failed}
            </p>
          )}
          {switchNotice === "denied" && (
            <div role="status" data-slot="me-push-notice" className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pb-2">
              <p className="min-w-0 text-[12.5px] leading-[1.5] break-keep text-[var(--muted-fg)]">
                {PUSH_DEVICES_TEXT.denied}
              </p>
              {!settingsHidden && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-slot="me-push-open-settings"
                  onClick={onOpenSettings}
                  className="ml-auto text-[var(--fg-2)]"
                >
                  {PUSH_DEVICES_TEXT.openSettings}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {showAccounts && <PushAccountsSection accounts={accountChoices} />}

      {mode === "web" && showAccounts && others.length > 0 && (
        <p
          data-slot="me-push-devices-heading"
          className="px-1 pt-3 pb-1 text-[12px] font-semibold text-[var(--muted-fg)]"
        >
          {PUSH_DEVICES_TEXT.devices}
        </p>
      )}
      {isApp && others.length > 0 && (
        <p
          data-slot="me-push-other-devices"
          className="px-1 pt-3 pb-1 text-[12px] font-semibold text-[var(--muted-fg)]"
        >
          {PUSH_DEVICES_TEXT.otherDevices}
        </p>
      )}
      {others.length > 0 && (
        <ul data-slot="me-push-device-list" className="flex min-w-0 flex-col">
          {others.map((d) => (
            <DeviceRow
              key={d.deviceKey}
              device={d}
              busy={rowBusy === d.deviceKey}
              confirming={confirmKey === d.deviceKey}
              onOff={() => void onRowOff(d.deviceKey)}
              onRemove={() => void onRowRemove(d.deviceKey)}
            />
          ))}
        </ul>
      )}

      {showEmpty && (
        <p className="border-t border-[var(--border-subtle)] px-1 pt-2 text-[12.5px] leading-[1.5] text-[var(--muted-fg)]">
          {PUSH_DEVICES_TEXT.empty}
        </p>
      )}
      {showLoadFailed && (
        <p role="status" className="border-t border-[var(--border-subtle)] px-1 pt-2 text-[12.5px] leading-[1.5] text-[var(--destructive)]">
          {PUSH_DEVICES_TEXT.loadFailed}
        </p>
      )}
      {listFailed && (
        <p role="status" className="px-1 pt-1 text-[12.5px] leading-[1.5] break-keep text-[var(--destructive)]">
          {PUSH_DEVICES_TEXT.actionFailed}
        </p>
      )}
    </div>
  );
}

/**
 * 「받을 계좌」 섹션(quick-261109-dz1 · 스케치 031 A · D-06 · D-10). 이 컴포넌트가 마운트될 때만 끈 계좌를 읽으므로
 * relay 계좌가 없으면 서버 호출 0. 스위치는 서버 응답 전에 바뀌고 실패하면 되돌린다 — 성공 뒤 다시 읽지 않는다
 * (서버 멱등 · 로컬이 정답 · 폴링 없음).
 */
function PushAccountsSection({ accounts }: { accounts: readonly MeAccountChoice[] }) {
  const headingId = useId();
  const { muted, loadedAt, error } = usePushAccountMutes();
  const [pending, setPending] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);

  const onToggle = async (no: string, next: boolean) => {
    if (pending.includes(no)) return;
    setFailed(false);
    setPending((p) => [...p, no]);
    const apply = (on: boolean) =>
      updatePushAccountMutesLocal((list) => {
        const rest = list.filter((x) => x !== no);
        return on ? rest : [...rest, no];
      });
    apply(next);
    try {
      await setPushAccountEnabled(no, next);
    } catch (err) {
      apply(!next);
      setFailed(true);
      // 계좌번호는 로그에 싣지 않는다.
      console.warn("[gh-radar] push 계좌 알림 설정 실패", pushErrorText(err));
    } finally {
      setPending((p) => p.filter((x) => x !== no));
    }
  };

  return (
    <section data-slot="me-push-accounts" aria-labelledby={headingId} className="flex min-w-0 flex-col">
      <p
        id={headingId}
        data-slot="me-push-accounts-heading"
        className="px-1 pt-3 pb-1 text-[12px] font-semibold text-[var(--muted-fg)]"
      >
        {PUSH_DEVICES_TEXT.accountsHeading}
      </p>
      <ul data-slot="me-push-account-list" className="flex min-w-0 flex-col">
        {accounts.map((a) => {
          const no = a.accountNo;
          const first = a.name !== "" ? a.name : no;
          const second = (a.name !== "" ? [no, a.serverKey] : [a.serverKey])
            .filter((x): x is string => typeof x === "string" && x !== "")
            .join(" · ");
          return (
            <li
              key={no}
              data-slot="me-push-account"
              data-account-no={no}
              className="flex min-h-[48px] min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-[var(--border-subtle)] px-1 py-1"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-[14px] font-normal text-[var(--fg)]">{first}</span>
                {second !== "" && (
                  <span className="text-[12px] text-[var(--muted-fg)] tabular-nums">{second}</span>
                )}
              </div>
              <Switch
                data-slot="me-push-account-switch"
                aria-label={`${accountChipLabelOf(a)} ${PUSH_DEVICES_TEXT.accountSwitchSuffix}`}
                checked={!muted.includes(no)}
                disabled={loadedAt === null || pending.includes(no)}
                onCheckedChange={(next) => void onToggle(no, next)}
                className="ml-auto data-[state=checked]:bg-[var(--primary)]"
              />
            </li>
          );
        })}
      </ul>
      {failed && (
        <p role="status" className="px-1 pt-1 text-[12.5px] leading-[1.5] break-keep text-[var(--destructive)]">
          {PUSH_DEVICES_TEXT.actionFailed}
        </p>
      )}
      {error && loadedAt === null && (
        <p role="status" className="px-1 pt-1 text-[12.5px] leading-[1.5] break-keep text-[var(--destructive)]">
          {PUSH_DEVICES_TEXT.accountsLoadFailed}
        </p>
      )}
      <p
        data-slot="me-push-accounts-foot"
        className="px-1 pt-0.5 pb-1.5 text-[12px] leading-[1.5] break-keep text-[var(--muted-fg)]"
      >
        {PUSH_DEVICES_TEXT.accountsFoot}
      </p>
    </section>
  );
}

function DeviceRow({
  device,
  busy,
  confirming,
  onOff,
  onRemove,
}: {
  device: PushDevice;
  busy: boolean;
  confirming: boolean;
  onOff: () => void;
  onRemove: () => void;
}) {
  const platform = device.platform === "ios" ? PUSH_DEVICES_TEXT.platformIos : PUSH_DEVICES_TEXT.platformAndroid;
  return (
    <li
      data-slot="me-push-device"
      className="flex min-h-[48px] min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-[var(--border-subtle)] px-1 py-1"
    >
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[14px] font-normal text-[var(--fg)]">
          {device.label || PUSH_DEVICES_TEXT.unknownDevice}
        </span>
        <span className="text-[12px] text-[var(--muted-fg)] tabular-nums">
          {platform} · {PUSH_DEVICES_TEXT.lastSeen} {formatPushLastSeen(device.lastSeenAt)}
        </span>
      </div>
      <span className="ml-auto inline-flex items-center gap-1">
        <span
          className={`text-[12.5px] whitespace-nowrap ${device.enabled ? "text-[var(--fg)]" : "text-[var(--muted-fg)]"}`}
        >
          {device.enabled ? PUSH_DEVICES_TEXT.on : PUSH_DEVICES_TEXT.off}
        </span>
        {device.enabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-slot="me-push-device-off"
            disabled={busy}
            onClick={onOff}
            className="text-[var(--fg-2)]"
          >
            {PUSH_DEVICES_TEXT.turnOff}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-slot="me-push-device-remove"
          disabled={busy}
          onClick={onRemove}
          className="text-[var(--destructive)]"
        >
          {confirming ? PUSH_DEVICES_TEXT.confirmRemove : PUSH_DEVICES_TEXT.remove}
        </Button>
      </span>
    </li>
  );
}
