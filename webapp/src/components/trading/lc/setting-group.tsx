'use client';

/**
 * 토스식 상따 설정 리스트 조각 (Phase 20 · 스케치 002 채택안 · UI-SPEC §1~§4).
 *
 * 20-01 이 `SettingRow`(「라벨 ─ 값 ›」 44px 값 행)와 `FailureBubble`(흐름 밖 실패 말풍선)을 만들었고,
 * 20-04 가 나머지를 더했다 — `SettingGroup`(그룹 카드) · `GroupSwitch`(그룹 스위치) ·
 * `CheckValueRow`(체크 값 행) · `DerivedRow`(읽기 전용 기준선 행). (감시대상 행 조각은 Phase 24 ⑤ 로
 * 지웠다 — 새 서버는 감시대상을 읽지 않는다.) Phase 27 이 `ChoiceRow`(3택 행 — 자동매도 방법 · `/me` 방법 기본값)를 더했다.
 * 무엇을 어떤 순서로 그리는지는 이 파일이 아니라 `lc-fields.ts` 가 정한다.
 *
 * ★ 행 높이는 **언제나 44px** 다 (D-20 · D-14a). 편집 중인 행만 요소 종류가 `<button>` → `<div>`
 *   로 바뀐다(`<button>` 안에 `<input>` 을 넣을 수 없다) — 높이·패딩이 같아서 레이아웃 이동이 0 이다.
 * ★ 폭 판정은 컨테이너 쿼리(`@min-[685px]/lc:` 등)만 쓴다. 뷰포트 브레이크포인트 유틸을 새로
 *   만들지 않는다 — 밴드 표·경계의 정본은 `webapp/src/styles/globals.css` §2.2b 다.
 * ★ 라벨·값은 `whitespace-nowrap` 이고 **말줄임 유틸을 쓰지 않는다** — 잘린 라벨은 오발주다.
 *   안 맞으면 보이게 넘치고 20-07 P20-3 이 잡는다.
 * ★ 실패 표시는 행 **아래 흐름 밖**(Popover)이다 — 문구가 행 사이에 끼면 아래 행이 밀린다.
 */

import {
  Fragment,
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import { Check } from 'lucide-react';
import { Switch as SwitchPrimitive } from 'radix-ui';

import type { LcGroupSpec } from '@/components/trading/lc/lc-fields';
import { LcSheetShell } from '@/components/trading/lc/number-pad-sheet';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { useEditMode } from '@/lib/use-edit-mode';
import { cn } from '@/lib/utils';

export type SettingUnit = '원' | '주' | '만원' | '%' | '건' | '회';

const NUM = new Intl.NumberFormat('ko-KR');

/**
 * 제목줄 상태 문구를 줄바꿈 단위 조각으로 가른다(`SettingGroup` 주석 · 24-08) — 「무장 · 대기 · 후매수 발동」 →
 * 「무장 ·」 「대기 ·」 「후매수 발동」. 조각은 `nowrap` 이고 조각 사이 공백만 줄바꿈 기회라, 구분점은 앞 조각에 붙고
 * 「후매수 / 발동」처럼 낱말이 갈리지 않는다. 글자 · 접근성 이름은 원문 그대로다(보통 공백).
 */
function statusPiecesOf(text: string): string[] {
  const segs = text.split(' · ');
  return segs.map((seg, i) => (i < segs.length - 1 ? `${seg} ·` : seg));
}

/** 「3건」「127,400원」「3회」 — 천 단위 쉼표 + 단위 붙여 씀(UI-SPEC §2). */
export function formatSettingValue(value: number, unit: SettingUnit): string {
  return `${NUM.format(value)}${unit}`;
}

/**
 * 행 상자 — 버튼(평소)과 div(편집 중)가 **같은 기하**를 쓴다(D-14a). 값 행 · 체크 행 ·
 * 기준선 행이 전부 이 상자라 라벨의 x 가 한 줄로 맞는다.
 *
 * ★ 폭 백스톱(UI-SPEC overflow · 20-02 폭 스파이크) — **폰 밴드(<685)만 L2**: 행 좌우 패딩 4→0 ·
 *   라벨–값 간격 6→4. 본문 344 에서 「잔량추적 기준선 | 100,000주」가 L0 −9.1px → L2 +0.9px 이다
 *   (쉐브런이 없는 행이라 L3 는 그 행에 효과가 없다 — L3 는 Phase 24 에서 새 행 때문에 폰 밴드 전체에 켰다 ·
 *   `ValueWithChevron`). ≥685 은 D-02a 로 감시대상 행이 풀폭
 *   토글이 되어 L0 에서 다 들어간다(첫 경계 685 최악값 행 최소 여유 +1.2px — e2e P20-3 · P24-7 · quick-260928-q5e) — 그래서
 *   원래 값(4 · 6)으로 돌려놓는다. 글자 크기는 줄이지도 키우지도 않는다. 여유가 얇으므로(+0.9)
 *   20-07 P20-3 이 실브라우저로 단언한다.
 */
const ROW_BOX =
  'flex min-h-[44px] w-full min-w-0 items-center justify-between gap-1 rounded-[10px] px-0 text-left @min-[685px]/lc:gap-1.5 @min-[685px]/lc:px-1';

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
 * 행 단위 흐림(Phase 24 ⑩ · UI-SPEC §9 · R10) — opacity .45 를 **한 요소에 한 번** 건다. 조작하는 순간
 * (포커스 · fine pointer hover)에는 제 대비로 돌아온다. 편집 중인 행에는 걸지 않는다.
 * 흐린 행도 편집할 수 있다 — `aria-disabled` 를 쓰지 않는다(조작 가능한 것을 불가라 말하게 된다).
 */
const DIM_SELF = 'opacity-45 focus-within:opacity-100 pointer-fine:hover:opacity-100';
/** 체크 값 행용 — 라벨 · 값 조각이 행(`group/lcrow`) 포커스 · hover 로 함께 돌아온다(원형 체크는 흐리지 않는다). */
const DIM_IN_ROW = 'opacity-45 group-focus-within/lcrow:opacity-100 pointer-fine:group-hover/lcrow:opacity-100';

/**
 * 그룹 상태 문구 색(UI-SPEC §11 · R3) — **첫 단어 기준**. 새 색 토큰 0 · 색은 보조 신호이고 의미는 단어가
 * 싣는다(WCAG 1.4.1). 「감시 중 · 후매수 발동」은 초록, 「무장 · 대기 · 후매수 발동」은 중립이다.
 * 「구서버 전략 · 끄기만 가능」(WR-02 · `LC_LEGACY_BUY_STATUS`)은 「포기」 와 같은 `--destructive` 다.
 * ★ 자동매도 칩 낱말(Phase 27 D-03 · 2026-10-05 개정 — 헤더 LED D-04 와 같은 WinForms 색 규칙)은 **정확 일치**다:
 *   「감시」「매도중」 = `--led-armed`(초록) · 「대기」「완료」 = `--led-latent`(주황). 목업의 「대기 중립 · 완료 파랑」은
 *   이 개정으로 대체됐다(새 토큰 · 파랑 없음). 기존 startsWith 규칙 **뒤**에 두어 「무장 · 대기」 등 기존 문구 결과가
 *   바뀌지 않는다.
 */
export function groupStatusClassOf(text: string): string {
  if (text.startsWith('감시 중')) return 'text-[var(--led-armed)]';
  if (text.startsWith('보유중')) return 'text-[var(--led-latent)]';
  if (text.startsWith('포기')) return 'text-[var(--destructive)]';
  if (text.startsWith('구서버')) return 'text-[var(--destructive)]'; // WR-02 구서버 에코 — 「포기」 와 같은 경고 결
  if (text === '감시' || text === '매도중') return 'text-[var(--led-armed)]';
  if (text === '대기' || text === '완료') return 'text-[var(--led-latent)]';
  return 'text-[var(--muted-fg)]';
}

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

/**
 * 그룹의 제목 요소 id + 상태 문구 id(공백으로 이은 id 목록) — 값 버튼의 `aria-describedby`
 * 가 된다(20-07 a11y · Phase 24 R10).
 *
 * ★ ≥685 두 열에서는 매수·매도 쪽 값 버튼이 **같은 이름**을 가질 수 있다(「비교가격 127,400원」 ·
 *   「체결 30,000주」). 이름과 별개로 **설명**에 그룹 제목을 붙여 가른다. Phase 24 부터는 상태 문구도
 *   함께 가리킨다 — 흐린 행의 비시각 경로다(「주문가격 13,000원, 매수주문 꺼짐」). 보이는 변화는 없다.
 *   그룹 밖 렌더는 `undefined` 다.
 */
const GroupTitleIdContext = createContext<string | undefined>(undefined);

/** 값 슬롯 + 쉐브런 — 값 행과 체크 값 행의 값 버튼이 같은 모양을 쓴다. */
function ValueWithChevron({ text, flash, busy }: { text: string; flash: boolean; busy: boolean }) {
  return (
    <span className="flex min-w-0 items-center whitespace-nowrap">
      <span data-slot="lc-row-value" className={valueTextClass(flash, busy)}>
        {text}
      </span>
      {/*
        쉐브런은 값 슬롯 **밖**이다 — 값 슬롯 글자는 「3건」 그대로여야 한다.
        ★ 폭 백스톱 L3(Phase 24 · UI-SPEC E1 overflow) — 폰 밴드(<685)에서는 상따 설정 **전체**의 쉐브런을
          한 번에 숨긴다. 본문 344 에서 「최소 잔량 | 177,000,000주 ›」가 L2 만으로 ≈4px 넘쳤다(P20-3 실측) —
          말줄임은 오발주라 금지이고 글자도 줄이지 않으므로 장식 글리프를 뺀다. 행마다 다르게 두지 않는다.
      */}
      <span
        aria-hidden="true"
        data-slot="lc-row-chevron"
        className="hidden whitespace-pre text-[15px] leading-[1.5] text-[var(--faint)] @min-[685px]/lc:inline"
      >
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
  /** `null` = 서버가 모르는 값(레거시 전략의 주문금액 · D-04a) — 「—」 로 그린다. */
  value: number | null;
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
  /**
   * 표시 문자열(Phase 24 D-10 · D-11) — 주면 값 슬롯과 기본 접근성 이름이 이 글자를 쓴다(「무제한」 ·
   * 「3회 · 남은 2회」). 판정은 `lcValueTextOf` 한 곳이다. 편집은 여전히 숫자 `value` 로 한다.
   */
  valueText?: string;
  /** 값 버튼 `aria-label` 전체(「선매수 금액 4,000만원」 — UI-SPEC 접근성 이름 접두 표). */
  ariaName?: string;
  /** 행 단위 흐림(⑩) — 편집 중이면 걸지 않는다. */
  dim?: boolean;
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
  valueText,
  ariaName,
  dim = false,
  className,
}: SettingRowProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useRefocusAfterEdit(editing, buttonRef);
  const groupTitleId = useContext(GroupTitleIdContext);

  const text = valueText ?? (value === null ? '—' : formatSettingValue(value, unit));
  const defaultName = value === null && valueText === undefined ? `${label} 미입력` : `${label} ${text}`;

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
      aria-label={ariaName ?? defaultName}
      aria-describedby={groupTitleId}
      aria-busy={busy ? 'true' : undefined}
      aria-haspopup={hasPopup ? 'dialog' : undefined}
      disabled={disabled}
      onClick={(e) => onActivate(e.currentTarget)}
      className={cn(
        ROW_BOX,
        'pointer-fine:hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)] disabled:opacity-50',
        failed && 'shadow-[inset_0_0_0_1.5px_var(--destructive)]',
        dim && DIM_SELF,
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
  tone = 'alert',
  children,
}: {
  open: boolean;
  text: string;
  /** `warn` = 잠그지 않는 경고(D-15a) — 입력마다 바뀌므로 `alert` 로 끊어 읽지 않고 `status` 로 둔다. */
  tone?: 'alert' | 'warn';
  children: ReactNode;
}) {
  return (
    <Popover open={open}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent
        side="bottom"
        align="end"
        role={tone === 'warn' ? 'status' : 'alert'}
        data-slot="lc-failure-bubble"
        data-tone={tone}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="w-auto max-w-[280px] px-3 py-2 text-[12.5px] leading-[1.45] text-[var(--destructive)]"
      >
        {text}
      </PopoverContent>
    </Popover>
  );
}

/* ───────────────────────── 20-04 — 그룹 · 스위치 · 체크 · 기준선 ───────────────────────── */

export interface SettingGroupFold {
  /** false = 접힘(기본). 보관은 호출부(폼 인스턴스 `useState`) — 에코 재렌더에 풀리지 않는다(R1). */
  expanded: boolean;
  onToggle: () => void;
  /** 접힘일 때만 보이는 요약 줄(`GroupSummary`). */
  summary: ReactNode;
}

export interface SettingGroupProps {
  spec: LcGroupSpec;
  /** 제목 옆 상태 문구(「감시 중」「보유중」「소진」「포기」「꺼짐」「켜짐 · 켠 매수 없음」 …). */
  statusText?: string;
  /** 그룹 스위치 상태 — `spec.dimWhenOff` 이고 false 면 행(과 요약 줄)을 흐린다. */
  on?: boolean;
  /** 제목줄 오른쪽 끝에 설 스위치(`GroupSwitch`). */
  switchNode?: ReactNode;
  /**
   * 제목줄 체크(`GroupHeaderCheck` — quick-260929-vzy 후매수 ☐자동). 제목줄에서 스위치 **바로 앞**에 선다 —
   * 스위치는 마지막 자식 그대로다(Phase 16 D-05 오터치 방어 · 여섯 그룹 스위치 세로 정렬).
   * 「스위치 오른쪽」 으로 옮기려면 아래 제목줄에서 `{headerCheck}` · `{switchNode}` 두 노드 순서만 바꾼다.
   */
  headerCheck?: ReactNode;
  /**
   * 접이식 제목줄(Phase 24 ⑤ · UI-SPEC §2) — 주면 제목줄이 `<button aria-expanded>` 가 되고 접힌 행 영역은
   * `hidden` 클래스로 숨는다(**언마운트하지 않는다** — 나가 있던 확정 · 열린 편집기 보존).
   */
  fold?: SettingGroupFold;
  /** 사전 검증 줄(UI-SPEC §7) — 제목줄 바로 아래 `role="alert"` 빨간 한 줄. 접힘/펼침 무관하게 보인다. */
  precheckText?: string | null;
  /**
   * true(기본) = 꺼진 그룹이면 행 컨테이너를 흐린다(기존 경로). false = 컨테이너는 흐리지 않고 행마다
   * `dim` 에 맡긴다 — 컨테이너와 행에 겹쳐 걸면 .45 × .45 = .2 가 된다(UI-SPEC §9).
   */
  dimRows?: boolean;
  /**
   * 그룹 꼬리 노드(Phase 27 D-05 — 자동매도 바로시작 · 중지 버튼 행 자리) — 펼친 본문의 **마지막 행 뒤에만** 그린다.
   * 접힌 카드에서는 렌더하지 않는다(행 영역은 CSS 로 숨기지만 꼬리는 마운트조차 안 한다 — 접힌 채 누를 수 없게 ·
   * 오터치 방지). 접기 없는 카드는 늘 그린다.
   */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * 그룹 카드 (UI-SPEC §1 · 스케치 `.grp`) — `--group-bg` 면 · radius 16 · 패딩 10 10 4.
 * 그룹 사이 간격 10 은 부모(`flex flex-col gap-2.5`)가 준다.
 *
 * ★ 모든 그룹 카드는 제목줄을 갖는다(quick-261001-gjk) — 상단 패딩 pt-2.5.
 * ★ 제목과 상태는 **한 텍스트 흐름**이다(`min-w-0 flex-1`). 폰 밴드에서 「발주 완료 · 무장 해제」가
 *   길면 상태가 둘째 줄로 내려간다 — 헤더만 커지고 행 높이는 불변이며 말줄임은 없다(E1 long-text).
 *   제목과 상태 사이의 공백 문자는 장식이 아니다 — `keep-all` 에서 둘 사이의 유일한 줄바꿈 기회다.
 *   상태 문구는 `inline-block max-w-full` 한 덩어리다(24-08 실측) — 그냥 인라인이면 「켜짐 · 켠 매수 없음」이 본문
 *   344 에서 「켜짐 ·」 / 「켠 매수 없음」 으로 쪼개졌다. 덩어리라 통째로 둘째 줄에 내려간다. 흐름 폭보다 길면(최장
 *   「무장 · 대기 · 후매수 발동」은 344 에서 흐름 폭을 1px 안쪽으로 넘는다 — P24-7 이 잰다) 넘치지 않고 덩어리 안에서
 *   「 · 」 조각 경계에서만 줄바꿈한다(조각은 `nowrap` · 구분점은 앞 조각에 붙는다 — 「후매수 / 발동」처럼 낱말이
 *   갈리지 않는다). 전체를 `nowrap` 으로 두지 않는 이유가 이 폴백이다(글꼴이 조금만 넓어도 스위치를 덮는다).
 * ★ 스위치는 제목줄 **오른쪽 끝**(마지막 자식)이다 — 위치가 오터치 방어의 일부다(Phase 16 D-05).
 * ★ 꺼진 그룹(`dimWhenOff && !on`)의 행은 opacity .45 지만 **여전히 편집할 수 있다** — 값을 미리
 *   맞춰 두는 흐름이다(D-01). 매수취소는 스위치가 꺼져도 체크를 켤 수 있어 흐리지 않는다(D-21).
 */
export function SettingGroup({
  spec,
  statusText,
  on,
  switchNode,
  headerCheck,
  fold,
  precheckText = null,
  dimRows = true,
  footer,
  children,
}: SettingGroupProps) {
  const dim = spec.dimWhenOff && on === false;
  const titleId = useId();
  const statusId = useId();
  const rowsId = useId();
  const collapsed = fold !== undefined && !fold.expanded;
  const describedBy = statusText ? `${titleId} ${statusId}` : titleId;

  // 제목 · (쉐브런) · 상태는 **한 텍스트 흐름**이다 — 길면 상태가 둘째 줄로 내려가고 말줄임하지 않는다.
  const titleFlow = (
    <span className="min-w-0 flex-1 leading-normal">
      <span id={titleId} className={cn('text-[15px] font-semibold text-[var(--fg)]', fold ? 'mr-2' : 'mr-1')}>
        {spec.title}
      </span>
      {fold ? (
        <span
          aria-hidden="true"
          className={cn(
            '-ml-0.5 mr-1 inline-block text-[14px] text-[var(--faint)] transition-transform duration-150 motion-reduce:transition-none',
            fold.expanded && 'rotate-90',
          )}
        >
          ›
        </span>
      ) : null}
      {statusText ? (
        <>
          {' '}
          <span
            id={statusId}
            data-slot="lc-group-status"
            className={cn('inline-block max-w-full text-[12px]', groupStatusClassOf(statusText))}
          >
            {statusPiecesOf(statusText).map((piece, i) => (
              <Fragment key={i}>
                {i > 0 ? ' ' : null}
                <span className="whitespace-nowrap">{piece}</span>
              </Fragment>
            ))}
          </span>
        </>
      ) : null}
    </span>
  );

  return (
    <section
      data-slot={`lc-group-${spec.slot}`}
      title={spec.hint}
      className="min-w-0 rounded-[16px] bg-[var(--group-bg)] px-2.5 pt-2.5 pb-1"
    >
      <div
        data-slot="lc-group-header"
        className={cn('flex min-h-6 min-w-0 items-center gap-2 px-0.5', !fold && 'pb-0.5')}
      >
        {fold ? (
          // 스위치는 이 버튼 **밖 형제**다 — 버튼 안 스위치는 HTML 상 불가하고, 형제라 전파 차단 없이
          // 스위치가 접기와 독립으로 동작한다(UI-SPEC §2).
          <button
            type="button"
            data-slot="lc-group-fold"
            aria-expanded={fold.expanded}
            aria-controls={rowsId}
            onClick={fold.onToggle}
            className="-mx-0.5 flex min-h-8 min-w-0 flex-1 items-center rounded-[10px] px-1 pb-0.5 text-left pointer-fine:hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]"
          >
            {titleFlow}
          </button>
        ) : (
          titleFlow
        )}
        {headerCheck}
        {switchNode}
      </div>
      {precheckText ? (
        <p
          data-slot="lc-group-precheck"
          role="alert"
          className="px-1.5 pt-0.5 pb-1.5 text-[12.5px] leading-[1.45] text-[var(--destructive)]"
        >
          {precheckText}
        </p>
      ) : null}
      {fold ? <div className={cn('min-w-0', fold.expanded && 'hidden', dim && 'opacity-45')}>{fold.summary}</div> : null}
      <div
        id={rowsId}
        data-slot="lc-group-rows"
        className={cn('min-w-0', dimRows && dim && 'opacity-45', collapsed && 'hidden')}
      >
        <GroupTitleIdContext.Provider value={describedBy}>
          {children}
          {footer != null && !collapsed ? <div data-slot="lc-group-footer">{footer}</div> : null}
        </GroupTitleIdContext.Provider>
      </div>
    </section>
  );
}

/**
 * 접힌 카드의 요약 줄(UI-SPEC §3 · 스케치 `.sumline`) — 순수 텍스트(버튼 아님 · 접기 트리거 아님).
 * kv 는 `nowrap` 이고 **kv 사이에서만** 줄바꿈한다. 꺼진 kv 는 값 글자만 `--muted-fg` 다.
 * `sr` 이 있는 kv 만 값 앞에 sr-only 접두를 둔다(후매수 잠금 해제선 · quick-261002-fim).
 * `hot` kv 는 값 글자만 `--up`(자동매도 누적 > 0 · Phase 27 D-02 · 목업 `.kv.hot`).
 */
export function GroupSummary({
  items,
}: {
  items: readonly { key: string; value: string; off: boolean; sr?: string; hot?: boolean }[];
}) {
  return (
    <div
      data-slot="lc-group-summary"
      className="flex flex-wrap gap-x-2.5 gap-y-1 px-1 pt-0.5 pb-2 text-[13px] leading-[1.4]"
    >
      {items.map((kv) => (
        <span key={kv.key} className="whitespace-nowrap">
          <span className="mr-[3px] text-[12px] text-[var(--muted-fg)]">{kv.key}</span>
          {kv.sr ? <span className="sr-only">{`${kv.sr} `}</span> : null}
          <span
            data-hot={kv.hot ? 'true' : undefined}
            className={cn(
              'font-medium tabular-nums',
              kv.hot ? 'text-[var(--up)]' : kv.off ? 'text-[var(--muted-fg)]' : 'text-[var(--fg-2)]',
            )}
          >
            {kv.value}
          </span>
        </span>
      ))}
    </div>
  );
}

/** 카드 안 정적 안내 줄(후매수 소진 안내 — UI-SPEC §5) · 역할 없음 · 흐리지 않는다. */
export function GroupNote({ slot, children }: { slot: string; children: ReactNode }) {
  return (
    <p data-slot={slot} className="px-1.5 pt-0.5 pb-1.5 text-[12.5px] leading-[1.45] text-[var(--muted-fg)]">
      {children}
    </p>
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

export interface GroupHeaderCheckProps {
  id: string;
  /** 화면 라벨(「자동」). */
  label: string;
  /** 접근성 이름(「후매수 자동」) — 라벨만으로는 어느 그룹의 체크인지 모른다. */
  ariaLabel: string;
  /** 툴팁(`title`). */
  hint: string;
  checked: boolean;
  disabled?: boolean;
  /** 전송 중 — `aria-busy`. */
  busy?: boolean;
  /** 확정 뒤 900ms 강조(라벨 글자). */
  flash?: boolean;
  /** 거부·무응답 말풍선(E2 error). */
  failureText?: string | null;
  onToggle: () => void;
}

/**
 * 그룹 제목줄 체크 「○ 자동」 (quick-260929-vzy — 후매수 ☐자동 · WinForms 동형).
 *
 * ★ 그룹 스위치와 같은 지위다 — 어느 행에도 속하지 않고, 게이트가 꺼져도 흐리지 않는다.
 * ★ 원형은 `CheckValueRow` 의 `lc-check-circle` 과 같은 기하 · 색이다(size-5 · 테두리 1.5 · 켜지면 `--primary`).
 * ★ 시각 높이 32 · **히트 44**(`GroupSwitch` 와 같은 `after:` 세로 확장 — 시각 크기 불변).
 * ★ 라벨은 `whitespace-nowrap` · 말줄임 없음 — 잘린 라벨은 오발주다(P24-7 이 폭을 잰다).
 */
export function GroupHeaderCheck({
  id,
  label,
  ariaLabel,
  hint,
  checked,
  disabled = false,
  busy = false,
  flash = false,
  failureText = null,
  onToggle,
}: GroupHeaderCheckProps) {
  return (
    <FailureBubble open={failureText != null && failureText !== ''} text={failureText ?? ''}>
      <button
        type="button"
        role="checkbox"
        id={id}
        data-slot="lc-group-header-check"
        aria-checked={checked}
        aria-label={ariaLabel}
        aria-busy={busy ? 'true' : undefined}
        title={hint}
        disabled={disabled}
        onClick={onToggle}
        className={cn(
          // -ml-2 = 제목줄 gap-2 를 체크 앞에서만 되돌린다 — 본문 344 에서 「후매수 ›」 가 한 줄에 서게(P24-7 실측).
          //   체크 → 스위치 간격 8 은 그대로 둔다(두 컨트롤 오터치 방어).
          'relative -ml-2 flex min-h-8 flex-none items-center gap-1 whitespace-nowrap rounded-[10px]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          "after:absolute after:inset-x-0 after:-inset-y-[6px] after:content-['']",
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
        <span
          className={cn(
            'text-[13px] font-medium',
            flash ? 'text-[var(--primary)]' : checked ? 'text-[var(--fg)]' : 'text-[var(--muted-fg)]',
          )}
        >
          {label}
        </span>
      </button>
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
  /** 값 표시 문자열(`SettingRow.valueText` 와 같음). */
  valueText?: string;
  /** 값 버튼 `aria-label` 전체. */
  ariaName?: string;
  /** 라벨 · 값만 흐림(⑩) — 원형 체크는 흐리지 않는다(켜는 컨트롤은 늘 제 대비). */
  dim?: boolean;
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
  valueText,
  ariaName,
  dim = false,
}: CheckValueRowProps) {
  const valueRef = useRef<HTMLButtonElement>(null);
  useRefocusAfterEdit(editing, valueRef);
  const groupTitleId = useContext(GroupTitleIdContext);
  const hasValue = value !== undefined;
  const text = valueText ?? (hasValue ? formatSettingValue(value, unit) : '');
  const dimPart = dim && !editing ? DIM_IN_ROW : undefined;

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
      <span className={cn(LABEL_TEXT, checkFlash && 'text-[var(--primary)]', dimPart)}>{label}</span>
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
          aria-label={ariaName ?? `${label} ${text}`}
          aria-describedby={groupTitleId}
          aria-busy={busy ? 'true' : undefined}
          aria-haspopup={hasPopup ? 'dialog' : undefined}
          disabled={disabled}
          onClick={(e) => onActivateValue?.(e.currentTarget)}
          className={cn('flex min-h-[44px] min-w-0 items-center justify-end rounded-[10px] disabled:opacity-50', dimPart)}
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
        'group/lcrow',
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

export interface DerivedRowProps {
  label: string;
  value: number;
  unit: SettingUnit;
  /** 값이 있을 때 `--up` 15/600(발동잔량 — UI-SPEC §6 · TY-2). 매수 방향 축이지 오류 색이 아니다. */
  emphasis?: boolean;
  /** 값 0 일 때 보이는 글자(「—」) — 주면 `--muted-fg` 로 그린다. */
  valueText?: string;
  /** 값 0 일 때 스크린리더 글자(「없음」) — 「—」 를 「대시」로 읽지 않게 한다. */
  srText?: string;
  /**
   * 값 0 일 때 대신 회색으로 보일 보조값 — 후매수 잠금 해제선(quick-261002-fim). 0 · 미지정이면
   * `valueText` 로 떨어진다. 값이 있으면 쓰지 않는다(값 우선).
   */
  mutedValue?: number;
  /** `mutedValue` 앞에 읽힐 sr-only 접두(「잠금 해제선」). */
  mutedSrText?: string;
  /**
   * 값이 있을 때 보일 글자 전체 — 주면 「{값}{단위}」 대신 이 글자다(자동매도 「기준 상한가 13,000원」 · Phase 27 D-02).
   * 판정(「—」 여부 · 기준 낱말)은 호출부가 `lc-fields.ts` 순수 함수에서 받는다. 값 0 이면 `valueText` 로 떨어진다.
   */
  display?: string;
  /** `data-slot` — 기본 `lc-derived`(기준선 행). 발동잔량은 `lc-post-buy-trigger`. */
  slot?: string;
  /** 흐림(⑩) — 그룹 에코 OFF. */
  dim?: boolean;
}

/**
 * 읽기 전용 파생 행 — 「잔량추적 기준선」 · 「발동잔량」 · 자동매도 「누적 매도」 · 「기준」(S→C 전용 · 서버 계산값이
 * 정본). 버튼이 아니고 쉐브런이 없고 탭 순서 밖이다. 누적 매도는 발동잔량과 같은 `emphasis`(`--up` = 목업 `.v.hot`).
 */
export function DerivedRow({
  label,
  value,
  unit,
  emphasis = false,
  valueText,
  srText,
  mutedValue,
  mutedSrText,
  display,
  slot = 'lc-derived',
  dim = false,
}: DerivedRowProps) {
  const muted = value === 0 && (mutedValue ?? 0) > 0;
  const empty = value === 0 && valueText !== undefined;
  return (
    <div data-slot={slot} className={cn(ROW_BOX, dim && 'opacity-45 pointer-fine:hover:opacity-100')}>
      <span className={LABEL_TEXT}>{label}</span>
      {muted ? (
        <span className="whitespace-nowrap text-[15px] font-medium leading-[1.5]">
          {mutedSrText ? <span className="sr-only">{`${mutedSrText} `}</span> : null}
          <span data-muted-value="true" className="tabular-nums text-[var(--muted-fg)]">
            {formatSettingValue(mutedValue ?? 0, unit)}
          </span>
        </span>
      ) : empty ? (
        <span className="whitespace-nowrap text-[15px] font-medium leading-[1.5]">
          <span aria-hidden={srText ? 'true' : undefined} className="text-[var(--muted-fg)]">
            {valueText}
          </span>
          {srText ? <span className="sr-only">{srText}</span> : null}
        </span>
      ) : (
        <span
          className={cn(
            'whitespace-nowrap text-[15px] leading-[1.5] tabular-nums',
            emphasis ? 'font-semibold text-[var(--up)]' : 'font-medium text-[var(--fg-2)]',
          )}
        >
          {display ?? formatSettingValue(value, unit)}
        </span>
      )}
    </div>
  );
}

/* ───────────────────────── Phase 27 — 3택 행 ───────────────────────── */

export interface ChoiceOption {
  value: number;
  label: string;
}

export interface ChoiceRowProps {
  /** 행 식별자(`data-lc-field`) — 예 `lc-auto-sell-method`. */
  id: string;
  /** 보이는 라벨(「방법」). */
  label: string;
  /** 지금 값(서버 값 — 낙관 반영 없음). 옵션 밖(0 등)이면 「—」 · 선택 없음. */
  value: number;
  /** 화면 순서 그대로(「양쪽 / 매도1호가 / 매수1호가」 = 3 · 1 · 2). */
  options: readonly ChoiceOption[];
  /** 다른 옵션을 고른 순간 1회 — 같은 옵션은 부르지 않는다. 전송 · 확정은 호출부(`commit`) 몫이다. */
  onSelect: (value: number) => void;
  /** 접근성 이름(「자동매도 방법」) — 데스크톱 radiogroup 이름 · 폰 행 버튼 이름 접두. */
  a11yName: string;
  /** 폰 시트 제목 — 없으면 `a11yName`. */
  sheetTitle?: string;
  /** 폰 시트 설명 한 줄. */
  description?: string;
  disabled?: boolean;
  /** 행 단위 흐림(⑩) — 조작 가능은 그대로. */
  dim?: boolean;
  /** 반영 중 — `aria-busy` · 값 흐림. */
  busy?: boolean;
  /** 확정 뒤 900ms 강조. */
  flash?: boolean;
  /** 실패 말풍선 문구(흐름 밖 — 행 높이 불변). */
  failureText?: string | null;
}

/**
 * 3택 행 「라벨 ─ 값」 (Phase 27 D-02 — 자동매도 방법 · 27-06 `/me` 「방법 기본값」이 재사용한다).
 *
 * ★ 폰/데스크톱 갈래는 값 행과 **같은 판정**이다 — `useEditMode()`(주 포인터 coarse = 시트 · 그 밖 = 인라인 · 폭 무관 ·
 *   `lib/use-edit-mode.ts`). 새 미디어 질의를 두지 않는다.
 *   - 데스크톱(인라인): 행 오른쪽 인라인 세그먼트(목업 `.mseg` — 높이 26 · 간격 2 · 트랙 `--muted` · 선택 면 `--seg-on-*` =
 *     기존 세그먼트 토큰 · 방향색 아님). `role="radiogroup"` + `role="radio"` 버튼. 화살표는 **포커스만** 옮긴다 — 선택이
 *     곧 전송이라 화살표 한 번마다 `lc.set` 이 나가지 않게 Enter/Space(클릭)로만 고른다.
 *     ★ 폭 백스톱 — 「라벨 + 세그먼트」(≈235px)는 데스크톱 밴드(카드 ≥992 — 호가 460 | 옵션 두 열) 행에만 들어간다.
 *       폰 · 컴팩트 · 와이드 밴드의 옵션 열 행은 ≈176~210px 라 넘친다(P24-7 685 2열 실측 +20px 넘침). 그래서 인라인
 *       모드도 992 미만 카드에서는 아래 「라벨 ─ 값 ›」 행 + 시트로 그린다(두 갈래를 모두 마운트하고 기존 경계 992
 *       컨테이너 쿼리로 하나만 보인다 — 새 경계 숫자 0 · 폭 판정은 CSS 몫 · `limit-chaser-form.tsx` 탭 숨김과 같은 규율).
 *   - 폰(시트): 「라벨 ─ 값 ›」 44px 행(`SettingRow` 그대로) → 키패드와 같은 시트 껍데기(`LcSheetShell`)에 옵션 목록 ·
 *     고르면 `onSelect` 1회 + 시트 닫힘 · 포커스는 연 행으로 돌아간다.
 * ★ 실패 말풍선은 두 갈래를 감싼 상자 하나에 앵커한다 — 숨은 갈래에 앵커하면 말풍선이 0,0 에 뜬다.
 * ★ 낙관 반영이 없다 — 선택 표시는 `value`(서버 값)만 따른다(Phase 20 D-06 「보인 값 = 서버 값」).
 */
export function ChoiceRow({
  id,
  label,
  value,
  options,
  onSelect,
  a11yName,
  sheetTitle,
  description = '',
  disabled = false,
  dim = false,
  busy = false,
  flash = false,
  failureText = null,
}: ChoiceRowProps) {
  const mode = useEditMode();
  const groupTitleId = useContext(GroupTitleIdContext);
  const [sheetOpen, setSheetOpen] = useState(false);
  const rowRef = useRef<HTMLElement | null>(null);
  const segRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);
  const text = current?.label ?? '—';
  const failed = failureText != null && failureText !== '';
  const pick = (v: number) => {
    if (v !== value) onSelect(v);
  };

  // 「라벨 ─ 값 ›」 행 — 시트 모드의 유일한 갈래 · 인라인 모드의 폰 밴드 갈래.
  const sheetRow = (
    <SettingRow
      id={id}
      label={label}
      unit="%"
      value={value}
      valueText={text}
      ariaName={current === undefined ? `${a11yName} 미입력` : `${a11yName} ${text}`}
      disabled={disabled}
      busy={busy}
      flash={flash}
      failed={failed}
      editing={false}
      hasPopup
      dim={dim}
      className={mode === 'inline' ? '@min-[992px]/lc:hidden' : undefined}
      onActivate={(el) => {
        if (busy) return;
        rowRef.current = el;
        setSheetOpen(true);
      }}
    />
  );

  // 데스크톱 — 화살표는 포커스만 옮긴다(선택 = 전송).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const buttons = Array.from(segRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    buttons[(at + step + buttons.length) % buttons.length]?.focus();
  };
  const tabStop = current?.value ?? options[0]?.value;
  const segmentRow =
    mode === 'inline' ? (
      <div data-lc-field={id} className={cn(ROW_BOX, 'hidden @min-[992px]/lc:flex', dim && DIM_SELF)}>
        <span className={LABEL_TEXT}>{label}</span>
        <div
          ref={segRef}
          role="radiogroup"
          aria-label={a11yName}
          aria-describedby={groupTitleId}
          aria-busy={busy ? 'true' : undefined}
          onKeyDown={onKeyDown}
          className={cn(
            'inline-flex flex-none items-center gap-0.5 rounded-[9px] bg-[var(--muted)] p-0.5',
            busy && 'opacity-60',
            failed && 'shadow-[inset_0_0_0_1.5px_var(--destructive)]',
          )}
        >
          {options.map((o) => {
            const on = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                data-choice-value={o.value}
                tabIndex={o.value === tabStop ? 0 : -1}
                disabled={disabled}
                onClick={() => pick(o.value)}
                className={cn(
                  'h-[26px] whitespace-nowrap rounded-[7px] px-[9px] text-[12.5px] font-semibold disabled:opacity-50',
                  on
                    ? cn(
                        'bg-[var(--seg-on-bg)] shadow-[var(--seg-on-shadow)]',
                        // 확정 뒤 900ms 강조(D-18) — 값 행의 값 글자와 같은 자리(선택된 값)에 건다.
                        flash ? 'text-[var(--primary)]' : 'text-[var(--seg-on-fg)]',
                      )
                    : 'text-[var(--muted-fg)] pointer-fine:hover:text-[var(--fg-2)]',
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
    ) : null;

  return (
    <>
      <FailureBubble open={failed && !sheetOpen} text={failureText ?? ''}>
        <div data-slot="lc-choice-row" className="min-w-0">
          {sheetRow}
          {segmentRow}
        </div>
      </FailureBubble>
      <LcSheetShell
        open={sheetOpen}
        slot="lc-choice-sheet"
        overlaySlot="lc-choice-overlay"
        title={sheetTitle ?? a11yName}
        description={description}
        returnFocusRef={rowRef}
        onClose={() => setSheetOpen(false)}
      >
        <div role="radiogroup" aria-label={sheetTitle ?? a11yName} className="mb-3 flex flex-col gap-1.5">
          {options.map((o) => {
            const on = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                data-choice-value={o.value}
                onClick={() => {
                  pick(o.value);
                  setSheetOpen(false);
                }}
                className={cn(
                  'flex min-h-[52px] w-full items-center rounded-[14px] bg-[var(--muted)] px-4 text-left text-[16px] font-semibold text-[var(--fg)]',
                  on && 'shadow-[inset_0_0_0_2px_var(--primary)]',
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(false)}
          className="h-14 w-full rounded-[16px] bg-[var(--muted)] text-[17px] font-semibold text-[var(--fg-2)]"
        >
          닫기
        </button>
      </LcSheetShell>
    </>
  );
}
