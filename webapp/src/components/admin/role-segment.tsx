"use client";

import type { AppRole } from "@gh-radar/shared";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

import type { FieldSaveState } from "./use-field-save";

/**
 * RoleSegment — 편집 시트 「역할」 필드 (Phase 29 D-15 · 목업 A `editor()` `.seg`).
 *
 * viewer · trader · admin 세그먼트 + 목업 경고 문장. 누르는 순간 부모가 그 한 필드를 저장한다(`useFieldSave`) —
 * 저장 버튼이 없다. 비행 중에도 막지 않는다(마지막 값만 대기열). 성공 플래시는 선택된 칸 글자를 성공 토큰으로
 * 0.7초(`limit-chaser-defaults` 의 FLASH 결 — 색만 바뀐다), 실패는 아래 한 줄(토스트 없음).
 */

export const ROLE_CHOICES: readonly AppRole[] = ["viewer", "trader", "admin"];

export const ROLE_SEGMENT_TEXT = {
  label: "역할",
  warning: "viewer 로 내리면 열린 트레이딩 화면이 다음 요청부터 막히고 relay 연결이 끊긴다.",
} as const;

/**
 * 세그먼트 틀 — 목업 `.seg`(muted 면 · r10 · 2px) / 칸 `.seg span`(13px · 5px 12px · r8 · 선택 = pill 면).
 * 칸 높이: 폰(640 미만) 36px 터치 타깃 · 데스크톱 종전 28px(29-31 UI-REVIEW-3).
 */
export const ADMIN_SEGMENT_ROOT = "gap-0.5 rounded-[10px] bg-[var(--muted)] p-0.5";
export const ADMIN_SEGMENT_ITEM =
  "h-9 sm:h-7 rounded-[8px]! border-0 px-3 text-[13px] font-medium text-[var(--muted-fg)] hover:text-[var(--fg)] data-[state=on]:font-semibold";

/** 성공 플래시 — 선택된 칸 글자만 `--led-armed`(움직임 없음). */
export const ADMIN_FLASH_CLASS = "[&_[data-state=on]]:text-[var(--led-armed)]!";

export interface RoleSegmentProps {
  value: AppRole;
  onChange: (role: AppRole) => void;
  state: FieldSaveState;
  error?: string | null;
}

export function RoleSegment({ value, onChange, state, error = null }: RoleSegmentProps) {
  return (
    <div data-slot="admin-field-role" data-state={state} className="flex flex-col gap-1.5">
      <ToggleGroup
        type="single"
        variant="outline"
        value={value}
        aria-label={ROLE_SEGMENT_TEXT.label}
        onValueChange={(v) => {
          // 같은 칸을 다시 누르면 Radix 가 "" 를 준다 — 선택 해제는 없다(역할은 늘 하나).
          if ((v === "viewer" || v === "trader" || v === "admin") && v !== value) onChange(v);
        }}
        className={cn(ADMIN_SEGMENT_ROOT, state === "flash" && ADMIN_FLASH_CLASS)}
      >
        {ROLE_CHOICES.map((role) => (
          <ToggleGroupItem key={role} value={role} className={ADMIN_SEGMENT_ITEM}>
            {role}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="text-[12px] leading-[1.5] break-keep text-[var(--muted-fg)]">{ROLE_SEGMENT_TEXT.warning}</p>
      {error && (
        <p data-slot="admin-field-error" role="alert" className="text-[12.5px] break-keep text-[var(--destructive)]">
          {error}
        </p>
      )}
    </div>
  );
}
