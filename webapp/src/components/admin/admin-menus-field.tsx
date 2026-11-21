"use client";

import { ADMIN_MENU_KEYS, type AdminMenu } from "@gh-radar/shared";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import type { FieldSaveState } from "./use-field-save";

/**
 * AdminMenusField — 편집 시트 「어드민 메뉴」 칸 (quick 261121-n1b · 스케치 034 A 안 — 사용자 채택).
 *
 * trader 시트에서만 「역할」 바로 아래에 그린다(admin 은 원래 전부 · viewer 는 효력 없음 — 칸 없음). 메뉴마다 이름 · 한 줄 설명 ·
 * 스위치. 누르는 즉시 부모가 배열 하나를 저장한다(`useFieldSave` 1개 — 저장 버튼 없음 · 토스트 없음). 다음 배열은 받은 `value`
 * (부모의 낙관 값)에서 그 키만 넣고 빼서 `ADMIN_MENU_KEYS` 순서로 만든다 — 연달아 누른 첫 변경이 사라지지 않게.
 *
 * 성공 플래시는 RoleSegment 결(켜진 줄 이름 글자만 `--led-armed` 0.7초) · 실패는 칸 아래 한 줄. 스위치는 기존 `Switch`
 * 그대로(포커스 링 포함)이고 크기만 목업 44×26 으로 키운다 — 위아래 9px 투명 덧칸으로 터치 높이 44.
 */

/** 메뉴 이름 — 사이드바 「Admin」 하위 이름과 같다. */
export const ADMIN_MENU_LABEL: Readonly<Record<AdminMenu, string>> = {
  pnl: "매매손익",
  settlement: "정산",
};

export const ADMIN_MENUS_TEXT = {
  label: "어드민 메뉴",
  description: {
    pnl: "모든 계좌의 일자별 손익을 봐요",
    settlement: "정산 화면을 보고 거래 · 정산 확정까지 할 수 있어요",
  } satisfies Record<AdminMenu, string>,
  note: "켠 메뉴만 이 사람 사이드바의 Admin 아래에 보여요. 사용자 · 계좌 · 서버 · 러쉬 주문은 열 수 없어요.",
} as const;

/** 목록 줄 메뉴 칩 — 목업 `.ch.menu`(투명 면 · 주색 글자 · 주색 45% 안쪽 테두리). `ADMIN_CHIP_BASE` 위에 얹는다. */
export const ADMIN_MENU_CHIP_CLASS =
  "bg-transparent text-[var(--primary)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_45%,transparent)]";

/** 스위치 44×26 · 썸 20 · 터치 덧칸(위아래 9px → 44). `switch.tsx` 는 고치지 않고 여기서만 키운다. */
const MENU_SWITCH =
  "relative h-[26px] w-11 after:absolute after:inset-x-0 after:-inset-y-[9px] after:content-[''] " +
  "[&_[data-slot=switch-thumb]]:size-5 " +
  "[&[data-state=unchecked]_[data-slot=switch-thumb]]:translate-x-[2px] " +
  "[&[data-state=checked]_[data-slot=switch-thumb]]:translate-x-[20px]";

/** 다음 메뉴 배열 — `current` 에서 `key` 를 넣거나 빼고 `ADMIN_MENU_KEYS` 순서로. */
export function toggleAdminMenu(current: readonly AdminMenu[], key: AdminMenu, on: boolean): AdminMenu[] {
  return ADMIN_MENU_KEYS.filter((k) => (k === key ? on : current.includes(k)));
}

export interface AdminMenusFieldProps {
  value: readonly AdminMenu[];
  onChange: (next: AdminMenu[]) => void;
  state: FieldSaveState;
  error?: string | null;
}

export function AdminMenusField({ value, onChange, state, error = null }: AdminMenusFieldProps) {
  return (
    <div data-slot="admin-field-menus" data-state={state} className="flex flex-col">
      {ADMIN_MENU_KEYS.map((key, i) => {
        const on = value.includes(key);
        return (
          <div
            key={key}
            data-slot="admin-menu-row"
            data-menu={key}
            className={cn(
              "flex min-h-[52px] items-center gap-3 py-1.5",
              i > 0 && "border-t border-[var(--border-subtle)]",
            )}
          >
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block text-[14px] font-semibold text-[var(--fg)]",
                  state === "flash" && on && "text-[var(--led-armed)]",
                )}
              >
                {ADMIN_MENU_LABEL[key]}
              </span>
              <span className="mt-px block text-[12px] break-keep text-[var(--muted-fg)]">
                {ADMIN_MENUS_TEXT.description[key]}
              </span>
            </span>
            <Switch
              checked={on}
              aria-label={ADMIN_MENU_LABEL[key]}
              onCheckedChange={(next) => onChange(toggleAdminMenu(value, key, next))}
              className={MENU_SWITCH}
            />
          </div>
        );
      })}
      <p className="mt-1 text-[12px] leading-[1.5] break-keep text-[var(--muted-fg)]">{ADMIN_MENUS_TEXT.note}</p>
      {error && (
        <p data-slot="admin-menus-error" role="alert" className="text-[12.5px] break-keep text-[var(--destructive)]">
          {error}
        </p>
      )}
    </div>
  );
}
