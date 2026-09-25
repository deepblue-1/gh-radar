'use client';

/**
 * 토스식 상따 설정 리스트 조각 (Phase 20 · 스케치 002 채택안 · UI-SPEC §2).
 *
 * 20-01 은 두 개만 만든다 — `SettingRow`(「라벨 ─ 값 ›」 44px 값 행)와 `FailureBubble`(흐름 밖
 * 실패 말풍선). 그룹 카드·스위치·체크 값 행·감시대상 행·파생 행은 20-04 가 이 파일에 더한다.
 *
 * ★ 행 높이는 **언제나 44px** 다 (D-20 · D-14a). 편집 중인 행만 요소 종류가 `<button>` → `<div>`
 *   로 바뀐다(`<button>` 안에 `<input>` 을 넣을 수 없다) — 높이·패딩이 같아서 레이아웃 이동이 0 이다.
 * ★ 폭 판정은 컨테이너 쿼리(`@min-[700px]/lc:` 등)만 쓴다. 뷰포트 브레이크포인트 유틸을 새로
 *   만들지 않는다 — 밴드 표·경계의 정본은 `webapp/src/styles/globals.css` §2.2b 다.
 * ★ 실패 표시는 행 **아래 흐름 밖**(Popover)이다 — 문구가 행 사이에 끼면 아래 행이 밀린다.
 */

import { useEffect, useRef, type ReactNode } from 'react';

import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type SettingUnit = '원' | '주' | '만원' | '%' | '건';

const NUM = new Intl.NumberFormat('ko-KR');

/** 「3건」「127,400원」 — 천 단위 쉼표 + 단위 붙여 씀(UI-SPEC §2). */
export function formatSettingValue(value: number, unit: SettingUnit): string {
  return `${NUM.format(value)}${unit}`;
}

/** 행 상자 — 버튼(평소)과 div(편집 중)가 **같은 기하**를 쓴다(D-14a). */
const ROW_BOX =
  'flex min-h-[44px] w-full min-w-0 items-center justify-between gap-1.5 rounded-[10px] px-1 text-left';

export interface SettingRowProps {
  /** 행 식별자 — 옛 입력 id 를 그대로 쓴다(예 `lc-sweep-tick`). 편집 입력의 id 이기도 하다. */
  id: string;
  label: string;
  unit: SettingUnit;
  value: number;
  disabled?: boolean;
  /** 반영 중 — 값 흐림 + `aria-busy`. 화면 문구는 없다(행 높이 불변). */
  busy?: boolean;
  /** 확정 뒤 900ms 강조(D-18). */
  flash?: boolean;
  /** 실패 — `--destructive` 링. */
  failed?: boolean;
  /** 실패 말풍선 문구(편집 중이 아닐 때 행 아래에 뜬다 · 포커스를 뺏지 않는다). */
  failureText?: string | null;
  editing: boolean;
  /** 편집 중 값 자리에 들어갈 편집기(`InlineValueEditor`). */
  editor?: ReactNode;
  onActivate: (el: HTMLElement) => void;
  /** 시트 모드 — `aria-haspopup="dialog"`. */
  hasPopup?: boolean;
  className?: string;
}

/** 「라벨 ─ 값 ›」 44px 값 행 (UI-SPEC §2 · 스케치 `.lrow`). */
export function SettingRow({
  id,
  label,
  unit,
  value,
  disabled = false,
  busy = false,
  flash = false,
  failed = false,
  failureText = null,
  editing,
  editor,
  onActivate,
  hasPopup = false,
  className,
}: SettingRowProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(editing);
  /*
    편집이 끝나 입력칸이 사라지면 포커스가 `body` 로 떨어진다 — 그때만 행으로 되돌린다.
    사용자가 다른 곳을 눌러 끝낸 경우(포커스가 이미 거기 있다)는 뺏지 않는다.
  */
  useEffect(() => {
    if (wasEditing.current && !editing) {
      const active = document.activeElement;
      if (active === null || active === document.body) buttonRef.current?.focus();
    }
    wasEditing.current = editing;
  }, [editing]);

  const text = formatSettingValue(value, unit);

  if (editing) {
    return (
      <div
        data-lc-field={id}
        data-editing="true"
        className={cn(
          ROW_BOX,
          'cursor-text bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]',
          failed
            ? 'shadow-[inset_0_0_0_1.5px_var(--destructive)]'
            : 'shadow-[inset_0_0_0_1.5px_var(--primary)]',
          className,
        )}
      >
        <label htmlFor={id} className="whitespace-nowrap text-[14px] leading-[1.5] text-[var(--muted-fg)]">
          {label}
        </label>
        {editor}
      </div>
    );
  }

  const row = (
    <button
      ref={buttonRef}
      type="button"
      data-lc-field={id}
      aria-label={`${label} ${text}`}
      aria-busy={busy ? 'true' : undefined}
      aria-haspopup={hasPopup ? 'dialog' : undefined}
      disabled={disabled}
      onClick={(e) => onActivate(e.currentTarget)}
      className={cn(
        ROW_BOX,
        'pointer-fine:hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)] disabled:opacity-50',
        failed && 'shadow-[inset_0_0_0_1.5px_var(--destructive)]',
        className,
      )}
    >
      <span className="whitespace-nowrap text-[14px] leading-[1.5] text-[var(--muted-fg)]">{label}</span>
      <span className="flex min-w-0 items-center whitespace-nowrap">
        <span
          data-slot="lc-row-value"
          className={cn(
            'whitespace-nowrap text-[15px] font-medium leading-[1.5] tabular-nums',
            flash ? 'text-[var(--primary)]' : 'text-[var(--fg-2)]',
            busy && 'opacity-60',
          )}
        >
          {text}
        </span>
        {/* 쉐브런은 값 슬롯 **밖**이다 — 값 슬롯 글자는 「3건」 그대로여야 한다. */}
        <span aria-hidden="true" className="whitespace-pre text-[15px] leading-[1.5] text-[var(--faint)]">
          {' ›'}
        </span>
      </span>
    </button>
  );

  return (
    <FailureBubble open={failureText != null && failureText !== ''} text={failureText ?? ''}>
      {row}
    </FailureBubble>
  );
}

/**
 * 실패 말풍선 — 행 아래 **흐름 밖**(Radix Popover). 행 높이 변화 0.
 *
 * ★ `onOpenAutoFocus` 를 막는다 — 말풍선이 뜰 때 입력 포커스를 뺏으면 「다음 Enter 가 재시도」가
 *   깨진다. 사용자가 이미 다른 행을 편집 중일 때도 마찬가지다(RESEARCH §Q6).
 */
export function FailureBubble({
  open,
  text,
  children,
}: {
  open: boolean;
  text: string;
  children: ReactNode;
}) {
  return (
    <Popover open={open}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent
        side="bottom"
        align="end"
        role="alert"
        data-slot="lc-failure-bubble"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="w-auto max-w-[280px] px-3 py-2 text-[12.5px] leading-[1.45] text-[var(--destructive)]"
      >
        {text}
      </PopoverContent>
    </Popover>
  );
}
