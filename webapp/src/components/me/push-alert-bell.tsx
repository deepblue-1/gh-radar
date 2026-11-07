"use client";

/**
 * PushAlertBell — 계정 카드 「매매 알림」 종 버튼 (quick-261107-fbj · 스케치 030 A 채택).
 *
 * ① 자리 — 계정 카드의 테마 · 로그아웃 앞 40×40 아이콘 버튼. /me 설정 탭에 있던 앱 푸시 기기 관리 카드를 여기로 옮겨
 *   설정 탭은 매매 설정만 남겼다. 계정 카드가 DMA 게이트 화면에도 있으므로 종도 거기 있다(푸시는 사용자 단위).
 *
 * ② 초록 점(`--led-armed` 8px) = 켜짐. 판정은 `usePushAlertOn` 하나다:
 *   - 앱: **이 기기** 키 행이 enabled 인가. 키는 렌더마다 다시 읽는다 — 켜기 경로가 키를 처음 만들므로 마운트 때 한 번만 읽어
 *     state 로 고정하면 켜기 직후 점이 안 켜진다.
 *   - PC 브라우저: 등록 기기 중 하나라도 enabled 인가(PC 는 켤 수 없고 보기 · 끄기 · 지우기만 — D-13).
 *   - 네이티브 여부는 마운트 뒤에만 읽는다 — 서버 HTML · 하이드레이션 첫 렌더에는 점이 없다(BellOff).
 *
 * ③ 여는 면 — 폰 폭(<768) 또는 앱이면 바텀 시트, 데스크톱 브라우저면 종에 붙은 팝오버. 둘 다 본문은 `PushDevicesPanel`.
 *   열림 state 는 하나이고, PopoverTrigger 의 클릭이 `onOpenChange(true)` 를 부르면 폭에 따라 팝오버 또는 시트가 그 값을 읽는다
 *   (별도 onClick 없음 — 팝오버 바깥 클릭 = 트리거 재클릭 경합을 Radix 가 처리).
 *
 * ④ 서버 호출 — 종 · 패널 모두 `usePushDevices()` 의 모듈 저장소 1벌을 읽는다(마운트 때 60초보다 낡았으면 1회 · 진행 중 요청
 *   공유 · 폴링 없음). 패널의 켜기 · 끄기 · 지우기는 `updatePushDevicesLocal` 로 저장소에 바로 반영돼 종의 점도 즉시 바뀐다.
 *
 * ⑤ 앱 셸 — 시트/팝오버 Content 가 `NativeOverlayMarker` 를 이미 렌더하므로 열려 있는 동안 당겨서 새로고침이 꺼지고
 *   Android back 이 시트부터 닫는다. 앱 하단 안전영역은 globals 의 bottom 시트 규칙이 비킨다.
 */

import { Bell, BellOff } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { PUSH_DEVICES_TEXT, PushDevicesPanel } from "@/components/me/push-devices-panel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { isNativeApp } from "@/lib/native/native-detect";
import { readPushDeviceKey } from "@/lib/push/device-key";
import { usePushDevices } from "@/lib/push/use-push-devices";
import { cn } from "@/lib/utils";

/** 팝오버를 쓰는 폭 — 이보다 좁으면(폰) 바텀 시트. */
const DESKTOP_QUERY = "(min-width: 768px)";

function subscribeDesktop(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/** 데스크톱 폭인가 — today-orders-card `useTableLayout` 과 같은 패턴(서버 스냅숏 false). */
function useWideViewport(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => typeof window.matchMedia === "function" && window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

/** 앱 셸 안인가 — 마운트 뒤에만 정한다(전에는 null · 하이드레이션). */
function useNativeAfterMount(): boolean | null {
  const [native, setNative] = useState<boolean | null>(null);
  useEffect(() => {
    setNative(isNativeApp());
  }, []);
  return native;
}

/** 종의 초록 점 판정(위 ②) — 앱 = 이 기기 켜짐 · PC = 아무 기기 켜짐 · 마운트 전 false. */
export function usePushAlertOn(): boolean {
  const { devices } = usePushDevices();
  const native = useNativeAfterMount();
  if (native === null) return false;
  if (native) {
    const key = readPushDeviceKey();
    return key !== null && devices.some((d) => d.deviceKey === key && d.enabled);
  }
  return devices.some((d) => d.enabled);
}

export function PushAlertBell({ className }: { className?: string }) {
  const on = usePushAlertOn();
  const native = useNativeAfterMount();
  const wide = useWideViewport();
  const desktop = native === false && wide;
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const Icon = on ? Bell : BellOff;

  return (
    <>
      <Popover open={open && desktop} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={buttonRef}
            type="button"
            data-slot="push-alert-bell"
            aria-label={PUSH_DEVICES_TEXT.title}
            title={PUSH_DEVICES_TEXT.title}
            className={cn(className, "group relative text-[var(--fg)]", open && "bg-[var(--raised-2)]")}
          >
            <Icon className="size-[18px]" aria-hidden="true" />
            {on && (
              <span
                data-slot="push-alert-dot"
                aria-hidden="true"
                className={cn(
                  "absolute top-2 right-2 size-2 rounded-full bg-[var(--led-armed)] ring-2 ring-[var(--muted)] group-hover:ring-[var(--raised-2)]",
                  open && "ring-[var(--raised-2)]",
                )}
              />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          aria-labelledby={titleId}
          className="w-[360px] max-w-[calc(100vw-32px)] gap-0 rounded-[16px] bg-[var(--popover)] px-3 pt-3.5 pb-2.5"
        >
          <h2 id={titleId} className="px-1 text-[16px] font-bold text-[var(--fg)]">
            {PUSH_DEVICES_TEXT.title}
          </h2>
          <PushDevicesPanel />
        </PopoverContent>
      </Popover>

      <Sheet open={open && !desktop} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            // 시트에는 Radix 트리거가 없다 — 닫으면 종으로 초점을 돌린다.
            e.preventDefault();
            buttonRef.current?.focus();
          }}
          className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-[22px] bg-[var(--card)] px-4 pt-2.5 pb-6"
        >
          <div aria-hidden="true" className="mx-auto mb-2.5 h-1 w-9 shrink-0 rounded-full bg-[var(--raised-2)]" />
          <SheetHeader className="border-0 p-0">
            <SheetTitle className="px-1 text-[16px] font-bold text-[var(--fg)]">{PUSH_DEVICES_TEXT.title}</SheetTitle>
          </SheetHeader>
          <PushDevicesPanel />
        </SheetContent>
      </Sheet>
    </>
  );
}
