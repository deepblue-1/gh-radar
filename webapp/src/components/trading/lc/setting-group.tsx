'use client';

/**
 * 토스식 상따 설정 리스트 조각 (Phase 20 · 스케치 002 채택안 · UI-SPEC §1~§4).
 *
 * 20-01 이 `SettingRow`(「라벨 ─ 값 ›」 44px 값 행)와 `FailureBubble`(흐름 밖 실패 말풍선)을 만들었고,
 * 20-04 가 나머지를 더했다 — `SettingGroup`(그룹 카드) · `GroupSwitch`(그룹 스위치) ·
 * `CheckValueRow`(체크 값 행) · `WatchTargetRow`(감시대상 행) · `DerivedRow`(읽기 전용 기준선 행).
 * 무엇을 어떤 순서로 그리는지는 이 파일이 아니라 `lc-fields.ts` 가 정한다.
 *
 * ★ 행 높이는 **언제나 44px** 다 (D-20 · D-14a). 편집 중인 행만 요소 종류가 `<button>` → `<div>`
 *   로 바뀐다(`<button>` 안에 `<input>` 을 넣을 수 없다) — 높이·패딩이 같아서 레이아웃 이동이 0 이다.
 * ★ 폭 판정은 컨테이너 쿼리(`@min-[700px]/lc:` 등)만 쓴다. 뷰포트 브레이크포인트 유틸을 새로
 *   만들지 않는다 — 밴드 표·경계의 정본은 `webapp/src/styles/globals.css` §2.2b 다.
 * ★ 라벨·값은 `whitespace-nowrap` 이고 **말줄임 유틸을 쓰지 않는다** — 잘린 라벨은 오발주다.
 *   안 맞으면 보이게 넘치고 20-07 P20-3 이 잡는다.
 * ★ 실패 표시는 행 **아래 흐름 밖**(Popover)이다 — 문구가 행 사이에 끼면 아래 행이 밀린다.
 */

import { useEffect, useRef, type ReactNode, type Ref, type RefObject } from 'react';
import { Check } from 'lucide-react';
import { Switch as SwitchPrimitive } from 'radix-ui';

import type { LcGroupSpec } from '@/components/trading/lc/lc-fields';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type SettingUnit = '원' | '주' | '만원' | '%' | '건';

const NUM = new Intl.NumberFormat('ko-KR');

/** 「3건」「127,400원」 — 천 단위 쉼표 + 단위 붙여 씀(UI-SPEC §2). */
export function formatSettingValue(value: number, unit: SettingUnit): string {
  return `${NUM.format(value)}${unit}`;
}

/**
 * 행 상자 — 버튼(평소)과 div(편집 중)가 **같은 기하**를 쓴다(D-14a). 값 행 · 체크 행 · 감시대상 행 ·
 * 기준선 행이 전부 이 상자라 라벨의 x 가 한 줄로 맞는다.
 *
 * ★ 폭 백스톱(UI-SPEC overflow · 20-02 폭 스파이크) — **폰 밴드(<700)만 L2**: 행 좌우 패딩 4→0 ·
 *   라벨–값 간격 6→4. 본문 344 에서 「잔량추적 기준선 | 100,000주」가 L0 −9.1px → L2 +0.9px 이다
 *   (쉐브런이 없는 행이라 L3 는 효과가 없어 쓰지 않는다). ≥700 은 D-02a 로 감시대상 행이 풀폭
 *   토글이 되어 값 행 최소 여유 +12.9(700) · +7.9(830) · +33.6(992) 로 L0 에서 다 들어간다 — 그래서
 *   원래 값(4 · 6)으로 돌려놓는다. 글자 크기는 줄이지도 키우지도 않는다. 여유가 얇으므로(+0.9)
 *   20-07 P20-3 이 실브라우저로 단언한다.
 */
const ROW_BOX =
  'flex min-h-[44px] w-full min-w-0 items-center justify-between gap-1 rounded-[10px] px-0 text-left @min-[700px]/lc:gap-1.5 @min-[700px]/lc:px-1';

/** 행 라벨 14/400 `--muted-fg`(UI-SPEC §2). */
const LABEL_TEXT = 'whitespace-nowrap text-[14px] leading-[1.5] text-[var(--muted-fg)]';
/** 행 값 15/500 `--fg-2` · 확정 뒤 900ms `--primary`(D-18). */
function valueTextClass(flash: boolean, busy: boolean): string {
  return cn(
    'whitespace-nowrap text-[15px] font-medium leading-[1.5] tabular-nums',
    flash ? 'text-[var(--primary)]' : 'text-[var(--fg-2)]',
    busy && 'opacity-60',
  );
}
/** 편집 중 행 링 — 평소 `--primary` · 실패 `--destructive` (한 겹 inset, Q-02). */
function editRingClass(failed: boolean): string {
  return failed
    ? 'shadow-[inset_0_0_0_1.5px_var(--destructive)]'
    : 'shadow-[inset_0_0_0_1.5px_var(--primary)]';
}
const EDIT_BG = 'cursor-text bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]';

/**
 * 편집이 끝나 입력칸이 사라지면 포커스가 `body` 로 떨어진다 — 그때만 행(값 버튼)으로 되돌린다.
 * 사용자가 다른 곳을 눌러 끝낸 경우(포커스가 이미 거기 있다)는 뺏지 않는다.
 */
function useRefocusAfterEdit(editing: boolean, target: RefObject<HTMLElement | null>): void {
  const wasEditing = useRef(editing);
  useEffect(() => {
    if (wasEditing.current && !editing) {
      const active = document.activeElement;
      if (active === null || active === document.body) target.current?.focus();
    }
    wasEditing.current = editing;
  }, [editing, target]);
}

/** 값 슬롯 + 쉐브런 — 값 행과 체크 값 행의 값 버튼이 같은 모양을 쓴다. */
function ValueWithChevron({ text, flash, busy }: { text: string; flash: boolean; busy: boolean }) {
  return (
    <span className="flex min-w-0 items-center whitespace-nowrap">
      <span data-slot="lc-row-value" className={valueTextClass(flash, busy)}>
        {text}
      </span>
      {/* 쉐브런은 값 슬롯 **밖**이다 — 값 슬롯 글자는 「3건」 그대로여야 한다. */}
      <span aria-hidden="true" className="whitespace-pre text-[15px] leading-[1.5] text-[var(--faint)]">
        {' ›'}
      </span>
    </span>
  );
}

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
  useRefocusAfterEdit(editing, buttonRef);

  const text = formatSettingValue(value, unit);

  if (editing) {
    return (
      <div
        data-lc-field={id}
        data-editing="true"
        className={cn(ROW_BOX, EDIT_BG, editRingClass(failed), className)}
      >
        <label htmlFor={id} className={LABEL_TEXT}>
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
      <span className={LABEL_TEXT}>{label}</span>
      <ValueWithChevron text={text} flash={flash} busy={busy} />
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

/* ───────────────────────── 20-04 — 그룹 · 스위치 · 체크 · 감시대상 · 기준선 ───────────────────────── */

export interface SettingGroupProps {
  spec: LcGroupSpec;
  /** 제목 옆 상태 문구(「감시 중」「무장 · 대기」「발주 완료 · 무장 해제」「켜짐」「꺼짐」). */
  statusText?: string;
  /** 그룹 스위치 상태 — `spec.dimWhenOff` 이고 false 면 행을 흐린다. */
  on?: boolean;
  /** 제목줄 오른쪽 끝에 설 스위치(`GroupSwitch`). */
  switchNode?: ReactNode;
  children: ReactNode;
}

/**
 * 그룹 카드 (UI-SPEC §1 · 스케치 `.grp`) — `--group-bg` 면 · radius 16 · 패딩 10 10 4.
 * 그룹 사이 간격 10 은 부모(`flex flex-col gap-2.5`)가 준다.
 *
 * ★ 헤더는 `title` 이 있을 때만 그린다 — 가격 섹션은 헤더 없이 접근성 이름만 갖는다.
 * ★ 제목과 상태는 **한 텍스트 흐름**이다(`min-w-0 flex-1`). 폰 밴드에서 「발주 완료 · 무장 해제」가
 *   길면 상태가 둘째 줄로 내려간다 — 헤더만 커지고 행 높이는 불변이며 말줄임은 없다(E1 long-text).
 *   제목과 상태 사이의 공백 문자는 장식이 아니다 — `keep-all` 에서 둘 사이의 유일한 줄바꿈 기회다.
 * ★ 스위치는 제목줄 **오른쪽 끝**(마지막 자식)이다 — 위치가 오터치 방어의 일부다(Phase 16 D-05).
 * ★ 꺼진 그룹(`dimWhenOff && !on`)의 행은 opacity .45 지만 **여전히 편집할 수 있다** — 값을 미리
 *   맞춰 두는 흐름이다(D-01). 매수취소는 스위치가 꺼져도 체크를 켤 수 있어 흐리지 않는다(D-21).
 */
export function SettingGroup({ spec, statusText, on, switchNode, children }: SettingGroupProps) {
  const dim = spec.dimWhenOff && on === false;
  return (
    <section
      data-slot={`lc-group-${spec.slot}`}
      title={spec.hint}
      aria-label={spec.ariaLabel}
      className="min-w-0 rounded-[16px] bg-[var(--group-bg)] px-2.5 pt-2.5 pb-1"
    >
      {spec.title ? (
        <div data-slot="lc-group-header" className="flex min-h-6 min-w-0 items-center gap-2 px-0.5 pb-0.5">
          <span className="min-w-0 flex-1 leading-normal">
            <span className="mr-1 text-[15px] font-semibold text-[var(--fg)]">{spec.title}</span>
            {statusText ? (
              <>
                {' '}
                <span
                  data-slot="lc-group-status"
                  className={cn(
                    'text-[12px]',
                    statusText === '감시 중' ? 'text-[var(--led-armed)]' : 'text-[var(--muted-fg)]',
                  )}
                >
                  {statusText}
                </span>
              </>
            ) : null}
          </span>
          {switchNode}
        </div>
      ) : null}
      <div data-slot="lc-group-rows" className={cn('min-w-0', dim && 'opacity-45')}>
        {children}
      </div>
    </section>
  );
}

export interface GroupSwitchProps {
  id?: string;
  label: string;
  checked: boolean;
  /** 지금 누를 수 없는가 — 판정은 호출부(`gateBlocked` · 세션)다. 끄기는 언제나 허용이 규율이다. */
  disabled?: boolean;
  onCheckedChange: (next: boolean) => void;
  /** 거부·무응답 말풍선 「반영하지 못했어요」 — 스위치에 앵커한다(E2 error · A-P4). */
  failureText?: string | null;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * 그룹 스위치 — 누르면 **확인 없이 즉시** 전송된다(Phase 16 D-05).
 *
 * ★ `ui/switch.tsx` 를 쓰지 않고 Radix Switch primitive 를 직접 그린다 — 그 파일은 thumb 기하
 *   (16px · `translate-x-4`)를 컴포넌트 안에 하드코딩해 호출부가 못 바꾼다(RESEARCH Pitfall 9).
 *   공용 primitive 를 이 한 화면 때문에 고치지 않는다.
 * ★ 시각 40×24 · thumb 20 · on 이동 16px · **히트 44×44**(`after:` 가상요소 — 시각 크기 불변).
 *   크기·위치(제목줄 오른쪽 끝)가 이 화면의 오터치 방어다 — 줄이는 변경은 안전장치를 줄이는 변경이다.
 */
export function GroupSwitch({
  id,
  label,
  checked,
  disabled = false,
  onCheckedChange,
  failureText = null,
  ref,
}: GroupSwitchProps) {
  return (
    <FailureBubble open={failureText != null && failureText !== ''} text={failureText ?? ''}>
      <SwitchPrimitive.Root
        ref={ref}
        id={id}
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className={cn(
          'relative inline-flex h-6 w-10 flex-none items-center rounded-full bg-[var(--switch-off)]',
          'transition-colors duration-150 motion-reduce:transition-none',
          'data-[state=checked]:bg-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50',
          "after:absolute after:-inset-x-[2px] after:-inset-y-[10px] after:content-['']",
        )}
      >
        <SwitchPrimitive.Thumb className="block size-5 translate-x-[2px] rounded-full bg-white transition-transform duration-150 motion-reduce:transition-none data-[state=checked]:translate-x-[18px]" />
      </SwitchPrimitive.Root>
    </FailureBubble>
  );
}

export interface CheckValueRowProps {
  /** 체크 버튼 id — 옛 체크박스 id(`lc-buy-trade`) 그대로. */
  checkId: string;
  /** 접근성 이름 접두 — 「매수주문 체결」「매수취소 체결」처럼 같은 라벨을 가른다. */
  groupTitle: string;
  label: string;
  checked: boolean;
  onToggle: () => void;
  /** 체크 전송 중 — `aria-busy`. */
  checkBusy?: boolean;
  /** 체크 확정 뒤 900ms 강조(라벨 글자). */
  checkFlash?: boolean;
  /** 체크 거부·무응답 말풍선(E2 error). */
  checkFailureText?: string | null;
  /** 값 — 없으면 값 버튼이 없고 체크 버튼이 행을 채운다(매수취소 체결·잔량추적). */
  value?: number;
  unit?: SettingUnit;
  /** 값 행 식별자 · 인라인 입력 id — 옛 입력 id(`lc-buy-min-trade-qty`) 그대로. */
  valueId?: string;
  disabled?: boolean;
  /** 값 반영 중. */
  busy?: boolean;
  /** 값 확정 뒤 900ms 강조. */
  flash?: boolean;
  /** 값 실패 링. */
  failed?: boolean;
  /** 값 실패 말풍선(편집 중이 아닐 때). */
  failureText?: string | null;
  editing?: boolean;
  editor?: ReactNode;
  onActivateValue?: (el: HTMLElement) => void;
  /** 시트 모드 — 값 버튼 `aria-haspopup="dialog"`. */
  hasPopup?: boolean;
}

/**
 * 체크 값 행 「○ 라벨 ─ 값 ›」 (UI-SPEC §3 · CONTEXT D-22).
 *
 * ★ 체크와 값은 **다른 버튼**이다 — 체크(`role="checkbox"`)는 누르면 즉시 반영(한 필드 = 1회 전송),
 *   값 버튼은 누르면 시트/인라인 편집을 연다. 체크가 꺼져 있어도 값은 편집할 수 있다
 *   (quick-260912-u58 ④) — 입력 가능 여부와 무장 판정은 별개다(`lib/limit-chaser.ts` 무변경).
 * ★ 체크 접근성 이름은 「{그룹} {라벨}」 — 「체결」이 매수주문·매도주문·매수취소 세 곳에 있다.
 */
export function CheckValueRow({
  checkId,
  groupTitle,
  label,
  checked,
  onToggle,
  checkBusy = false,
  checkFlash = false,
  checkFailureText = null,
  value,
  unit = '주',
  valueId,
  disabled = false,
  busy = false,
  flash = false,
  failed = false,
  failureText = null,
  editing = false,
  editor,
  onActivateValue,
  hasPopup = false,
}: CheckValueRowProps) {
  const valueRef = useRef<HTMLButtonElement>(null);
  useRefocusAfterEdit(editing, valueRef);
  const hasValue = value !== undefined;
  const text = hasValue ? formatSettingValue(value, unit) : '';

  const check = (
    <button
      type="button"
      role="checkbox"
      id={checkId}
      aria-checked={checked}
      aria-label={`${groupTitle} ${label}`}
      aria-busy={checkBusy ? 'true' : undefined}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'flex min-h-[44px] min-w-0 flex-none items-center gap-2 rounded-[10px] text-left disabled:opacity-50',
        !hasValue && 'flex-1',
      )}
    >
      <span
        data-slot="lc-check-circle"
        aria-hidden="true"
        className={cn(
          'flex size-5 flex-none items-center justify-center rounded-full border-[1.5px]',
          checked ? 'border-[var(--primary)] bg-[var(--primary)]' : 'border-[var(--switch-off)] bg-transparent',
        )}
      >
        {checked ? <Check className="size-3.5 text-white" strokeWidth={3} /> : null}
      </span>
      <span className={cn(LABEL_TEXT, checkFlash && 'text-[var(--primary)]')}>{label}</span>
    </button>
  );

  let valuePart: ReactNode = null;
  if (hasValue && editing) {
    valuePart = (
      <span data-lc-field={valueId} data-editing="true" className="flex min-w-0 items-center">
        {editor}
      </span>
    );
  } else if (hasValue) {
    valuePart = (
      <FailureBubble open={failureText != null && failureText !== ''} text={failureText ?? ''}>
        <button
          ref={valueRef}
          type="button"
          data-lc-field={valueId}
          aria-label={`${label} ${text}`}
          aria-busy={busy ? 'true' : undefined}
          aria-haspopup={hasPopup ? 'dialog' : undefined}
          disabled={disabled}
          onClick={(e) => onActivateValue?.(e.currentTarget)}
          className="flex min-h-[44px] min-w-0 items-center justify-end rounded-[10px] disabled:opacity-50"
        >
          <ValueWithChevron text={text} flash={flash} busy={busy} />
        </button>
      </FailureBubble>
    );
  }

  return (
    <div
      data-slot="lc-check-row"
      className={cn(
        ROW_BOX,
        editing && EDIT_BG,
        editing ? editRingClass(failed) : failed && 'shadow-[inset_0_0_0_1.5px_var(--destructive)]',
      )}
    >
      <FailureBubble open={checkFailureText != null && checkFailureText !== ''} text={checkFailureText ?? ''}>
        {check}
      </FailureBubble>
      {valuePart}
    </div>
  );
}

export interface WatchTargetRowProps {
  /** `buyWatchSide` — '0' 매도잔량 · '1' 매수잔량. */
  value: '0' | '1';
  onSelect: (side: '0' | '1') => void;
  /** 세션 미준비 — 두 버튼 비활성 + opacity .5. */
  disabled?: boolean;
  /** 전송 중(에코까지) — 두 버튼 비활성. 선택 면은 낙관 표시 그대로다(E2 loading). */
  busy?: boolean;
  /** 확정 뒤 900ms 강조. */
  flash?: boolean;
  /** 거부·무응답 말풍선(E2 error). */
  failureText?: string | null;
}

const WATCH_SIDES = [
  { side: '0', text: '매도잔량' },
  { side: '1', text: '매수잔량' },
] as const;

/**
 * 감시대상 행 — 시트를 열지 않는 **행 안 토글** (UI-SPEC §4 · D-02 · **D-02a**).
 *
 * ★ **D-02a (2026-09-25 사용자 결정):** 모든 밴드에서 시각 「감시대상」 라벨이 없고 토글이 행 전체
 *   폭이다. 본문 830 에서 「라벨 + 인라인 토글」이 백스톱 L2 로도 3.4px 넘쳤다(20-02 폭 스파이크) —
 *   목업 `watch-row-830.html` 안 D 채택(여유 830 +20.2 · 700 +22.7px). 밴드별 차이는 버튼 높이·글자만
 *   남는다(폰 32 · 14/600 ↔ ≥700 26 · 13/600). 접근성 이름은 `role="group" aria-label` 이 유지한다.
 * ★ `aria-pressed` 버튼 두 개다 — 라디오 그룹으로 바꾸면 방향키로 선택이 바뀌어 **전송되는** 사고가
 *   난다. 누르면 즉시 전송(D-04)이고 에코까지 두 버튼이 잠긴다.
 * ★ 선택 면은 중립 `--seg-on-*` 다(방향색 소멸 · D-02). 라벨 4글자 고정 nowrap · `flex-1` 이라 넘칠
 *   여지가 없다(E2 long-text).
 */
export function WatchTargetRow({
  value,
  onSelect,
  disabled = false,
  busy = false,
  flash = false,
  failureText = null,
}: WatchTargetRowProps) {
  return (
    <div data-slot="lc-watch-row" className={cn(ROW_BOX, 'cursor-default')}>
      <FailureBubble open={failureText != null && failureText !== ''} text={failureText ?? ''}>
        <div
          role="group"
          aria-label="감시대상"
          aria-busy={busy ? 'true' : undefined}
          className="flex w-full min-w-0 rounded-[8px] bg-[var(--raised-2)] p-0.5"
        >
          {WATCH_SIDES.map(({ side, text }) => {
            const on = value === side;
            return (
              <button
                key={side}
                type="button"
                aria-pressed={on}
                disabled={disabled || busy}
                onClick={() => onSelect(side)}
                className={cn(
                  'h-8 min-w-0 flex-1 whitespace-nowrap rounded-[6px] px-2 text-[14px] font-semibold',
                  '@min-[700px]/lc:h-[26px] @min-[700px]/lc:text-[13px]',
                  on
                    ? 'bg-[var(--seg-on-bg)] text-[var(--seg-on-fg)] shadow-[var(--seg-on-shadow)]'
                    : 'bg-transparent text-[var(--muted-fg)]',
                  on && flash && 'text-[var(--primary)]',
                  'disabled:cursor-not-allowed',
                  disabled && 'opacity-50',
                )}
              >
                {text}
              </button>
            );
          })}
        </div>
      </FailureBubble>
    </div>
  );
}

/**
 * 읽기 전용 파생 행 — 「잔량추적 기준선」(S→C 전용 · 서버 계산값이 정본). 버튼이 아니고 쉐브런이 없다.
 */
export function DerivedRow({ label, value, unit }: { label: string; value: number; unit: SettingUnit }) {
  return (
    <div data-slot="lc-derived" className={ROW_BOX}>
      <span className={LABEL_TEXT}>{label}</span>
      <span className="whitespace-nowrap text-[15px] font-medium leading-[1.5] tabular-nums text-[var(--fg-2)]">
        {formatSettingValue(value, unit)}
      </span>
    </div>
  );
}
