"use client";

/**
 * DeviceSettingsCard — /me 설정 탭 「이 기기」 카드 (Phase 32 D-15 · UI-SPEC S9 · 목업 ⑤ 하단 · ⑥ 캡션).
 *
 * Phase 32 D-15 — 작업대 상단 줄에서 옮긴 돌파 알림음 토글. 저장은 그대로 `gh-radar:breakout-tone`(이 기기만 ·
 * 서버 · relay 무관) · 소리 재생(`readTonePref`)은 작업대에 남는다. 로직은 옛 작업대 토글을 그대로 옮겼다 —
 * 하이드레이션 뒤 읽기 · 켜는 클릭 안에서 오디오 컨텍스트 resume · 켜짐 ∧ 차단이면 활성화만.
 *
 * - 꺼짐 → 스위치 켜기: 저장 "on" 하고 **그 클릭 안에서** `resumeToneContext()`(제스처 밖 `resume()` 은 브라우저가
 *   무시한다).
 * - 켜짐 ∧ 자동재생 차단: 스위치 왼쪽에 「클릭해 활성화」 텍스트 버튼 — 누르면 `resumeToneContext()` 만 부른다
 *   (스위치 상태 · 저장값 불변). 옛 아이콘 토글은 한 버튼이 두 일을 해서 「차단이면 끄지 않는다」 규칙이 필요했지만,
 *   이제 활성화는 별도 버튼 몫이라 스위치는 언제나 보이는 그대로(켜짐 → 꺼짐) 동작한다.
 * - 켜짐 → 스위치 끄기: 저장 "off".
 * - 저장값 · 차단 상태는 마운트 뒤에 읽는다 — SSR HTML 과 첫 클라 렌더가 갈리면 하이드레이션이 깨진다(그 전엔 꺼짐 ·
 *   스켈레톤 없음). localStorage 접근 실패는 `readTonePref` 가 꺼짐으로 읽는다(오류 표시 없음).
 * - 계좌 칩(S13)과 무관하다(D-24) — 계좌를 바꿔도 이 카드는 그대로다.
 */

import { useCallback, useEffect, useId, useState } from "react";

import { Switch } from "@/components/ui/switch";
import { isTonePlaybackBlocked, resumeToneContext } from "@/lib/alert-tone";
import { readTonePref, writeTonePref } from "@/lib/breakout-list";

/** S9 문구 — 캡션은 2026-10-16 목업 ⑥ 문구(S8′ 마지막 문단의 교체). */
export const DEVICE_SETTINGS_TEXT = {
  title: "이 기기",
  caption: "이 브라우저(기기)에만 저장돼요. 계좌와 무관해요.",
  tone: "돌파 알림음",
  activate: "클릭해 활성화",
} as const;

export function DeviceSettingsCard() {
  const titleId = useId();
  const captionId = useId();
  const switchId = useId();
  const [on, setOn] = useState(false);
  const [blocked, setBlocked] = useState(false);
  // 저장값 · 차단 상태는 마운트 후에 읽는다(하이드레이션).
  useEffect(() => {
    setOn(readTonePref() === "on");
    setBlocked(isTonePlaybackBlocked());
  }, []);

  const activate = useCallback(() => {
    void resumeToneContext().then(() => setBlocked(isTonePlaybackBlocked()));
  }, []);

  const onCheckedChange = (next: boolean) => {
    if (next) {
      writeTonePref("on");
      setOn(true);
      // 켜는 클릭 **안에서** — 제스처 밖 resume 은 무시된다.
      activate();
      return;
    }
    writeTonePref("off");
    setOn(false);
  };

  return (
    <section
      data-slot="me-device-card"
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col rounded-[var(--r-lg)] bg-[var(--card)] p-3"
    >
      <h2 id={titleId} className="px-1 text-[15px] font-semibold text-[var(--fg)]">
        {DEVICE_SETTINGS_TEXT.title}
      </h2>
      <p
        id={captionId}
        className="px-1 pt-0.5 pb-2 text-[12.5px] leading-[1.5] break-keep text-[var(--muted-fg)]"
      >
        {DEVICE_SETTINGS_TEXT.caption}
      </p>
      <div className="flex min-h-[44px] min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-[var(--border-subtle)] px-1 pt-1">
        <label htmlFor={switchId} className="text-[14px] font-normal whitespace-nowrap text-[var(--fg)]">
          {DEVICE_SETTINGS_TEXT.tone}
        </label>
        <span className="ml-auto inline-flex items-center gap-2">
          {on && blocked && (
            <button
              type="button"
              data-slot="me-device-tone-activate"
              onClick={activate}
              className="rounded-[var(--r-sm)] text-[12px] font-semibold whitespace-nowrap text-[var(--fg-2)] hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
            >
              {DEVICE_SETTINGS_TEXT.activate}
            </button>
          )}
          <Switch
            id={switchId}
            data-slot="me-device-tone"
            checked={on}
            onCheckedChange={onCheckedChange}
            aria-describedby={captionId}
            className="data-[state=checked]:bg-[var(--primary)]"
          />
        </span>
      </div>
    </section>
  );
}
