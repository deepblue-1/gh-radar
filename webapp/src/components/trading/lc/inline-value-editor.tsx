'use client';

/**
 * InlineValueEditor — 마우스 기기 인라인 편집 (Phase 20 D-14 · D-14a · D-14c · D-15 · UI-SPEC §6 · E4).
 *
 * ★ 44px 행 **안의 값 자리만** 입력칸으로 바뀐다. 「Enter 저장 · Esc 취소」 같은 **안내 문구도 「저장」
 *   버튼도 두지 않는다**(D-14a) — 행 높이가 변하지 않는 것이 이 편집기의 존재 조건이다. 검증 이유·실패
 *   문구는 흐름 밖 말풍선(`FailureBubble`)으로만 뜬다.
 * ★ 들어가자마자 **값 전체 선택**(D-14c) — 첫 입력이 값을 덮는다. `NumInput` 의 iOS 재선택
 *   (`select()` 직후 한 번 더)을 그대로 차용한다.
 * ★ 편집기는 **자기 버퍼**를 든다 — 편집 중 에코가 와도 입력값을 덮지 않는다(UI-SPEC E4 partial).
 *   행 표시값은 편집이 끝난 뒤 에코 값이다.
 *
 * 키 (D-14 · UI-SPEC §6):
 *   - Enter = 저장(즉시 반영). 실패 뒤 다시 Enter 는 사용자가 누른 **재시도**라 다시 저장한다.
 *   - Tab / Shift+Tab = 저장 뒤 `onNavigate('next' | 'prev')` — 같은 그룹 다음/이전 값 행은 폼이
 *     고른다(가정 A5 · Shift+Tab 은 Tab 의 대칭). 이미 저장한 버퍼면 다시 보내지 않고 이동만 한다.
 *   - Esc = 취소(서버 값 복귀 · 전송 없음).
 *   - ↑/↓ = 원은 한 호가(+tick(v) / −tick(v−1)) · 그 밖은 1 · [0, 999,999,999] (`stepValue`).
 *     **버퍼만 바꾼다** — 저장은 여전히 사용자의 Enter/Tab/이탈이다(T-20-10).
 *   - 포커스 이탈 = 저장. 단 위반 값이면 **Esc 처럼 취소**한다(가정 A6 — 포커스를 가두지 않으면서
 *     잘못된 값이 나가지 않게). 한 번 저장한 버퍼를 포커스 이탈이 다시 저장하지 않는다(같은 확정의
 *     두 번째 전송 금지 · T-16-10).
 *
 * 검증 (D-15): 원 단위는 `padIssue`(호가 단위 · 상한가) → 그 다음 `validate`(무장 불가 등, 호출부 판정).
 *   위반이면 **저장을 거부하고 이유만 말한다 — 값을 보정하지 않는다.** 검증 이유가 실패 문구보다 먼저다.
 *   빈 값 저장 = 0 이다(서버 계약상 빈 값 = 0 · E4 empty).
 *
 * 반영 중 (E4 loading): `readOnly` · `aria-busy` · 값 opacity .6 · 링 유지 · 화면 문구 없이 sr-only live
 *   region 에 「반영 중…」. 타이핑·↑↓ 는 무시하고 포커스 이탈은 다시 저장하지 않는다.
 */

import { useLayoutEffect, useRef, useState } from 'react';

import { FailureBubble, type SettingUnit } from '@/components/trading/lc/setting-group';
import { LC_COMMIT_TEXT } from '@/components/trading/lc/use-lc-field-commit';
import { PAD_MAX_DIGITS, padIssue, stepValue } from '@/lib/numpad';
import { cn } from '@/lib/utils';

const NUM = new Intl.NumberFormat('ko-KR');

export type InlineSaveVia = 'enter' | 'tab' | 'blur';

export interface InlineValueEditorProps {
  id: string;
  label: string;
  unit: SettingUnit;
  initialValue: number;
  /** 상한가 — 원 단위 D-15 검증(0·없음 = 시세 미수신 → 상한 검사 생략). */
  upperLimit?: number;
  /** 추가 검증(무장 불가 등) — 문장이면 저장을 거부하고 그 문장을 보인다. */
  validate?: (value: number) => string | null;
  /** 실패 말풍선 문구 — 있으면 편집기 아래에 뜬다(입력 포커스 유지). */
  failureText?: string | null;
  /** 반영 중 — 입력 잠금 + `aria-busy`. */
  busy?: boolean;
  /** 저장 — 빈 입력은 0 이다(서버 계약상 빈 값 = 0). */
  onSave: (value: number, via: InlineSaveVia) => void;
  /** Esc · 위반 값 포커스 이탈 — 서버 값으로 돌아가고 전송하지 않는다. */
  onCancel: () => void;
  /** 이미 저장한 버퍼(또는 반영 중)에서 포커스가 빠졌다 — 다시 보내지 않고 편집만 끝낸다. */
  onDismiss?: () => void;
  /** Tab / Shift+Tab — 저장(또는 이미 저장됨) **뒤** 부른다. */
  onNavigate?: (dir: 'next' | 'prev') => void;
}

function formatDigits(digits: string): string {
  return digits === '' ? '' : NUM.format(Number(digits));
}

export function InlineValueEditor({
  id,
  label,
  unit,
  initialValue,
  upperLimit = 0,
  validate,
  failureText = null,
  busy = false,
  onSave,
  onCancel,
  onDismiss,
  onNavigate,
}: InlineValueEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [buffer, setBuffer] = useState(() => NUM.format(initialValue));
  /** Enter/Tab 에서 걸린 검증 이유 — 값을 고치면 걷힌다. */
  const [issue, setIssue] = useState<string | null>(null);
  /** 지금 버퍼를 이미 저장(또는 취소)했는가 — 포커스 이탈의 두 번째 저장을 막는다. */
  const settledRef = useRef(false);
  /** Tab 으로 떠났다 — 언마운트 중 늦게 오는 포커스 이탈이 편집을 다시 끝내지 않게 한다. */
  const leftRef = useRef(false);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (el === null) return;
    el.focus();
    el.select();
    const t = window.setTimeout(() => el.select(), 0);
    return () => window.clearTimeout(t);
  }, []);

  const digitsOf = (): string => buffer.replace(/[^0-9]/g, '');
  const valueOf = (): number => {
    const digits = digitsOf();
    return digits === '' ? 0 : Number(digits);
  };
  /** D-15 — 원 단위 호가·상한가 → 호출부 검증. 문제 없으면 null. */
  const issueOf = (): string | null =>
    padIssue({ buf: digitsOf(), fresh: false }, unit, { current: 0, upper: upperLimit }) ??
    validate?.(valueOf()) ??
    null;

  const setDigits = (digits: string) => {
    settledRef.current = false;
    setIssue(null);
    setBuffer(formatDigits(digits));
  };

  /** Enter · Tab 저장 — 위반이면 이유만 보이고 false. */
  const trySave = (via: 'enter' | 'tab'): boolean => {
    const why = issueOf();
    if (why !== null) {
      setIssue(why);
      return false;
    }
    settledRef.current = true;
    onSave(valueOf(), via);
    return true;
  };

  const bubbleText = issue ?? failureText;

  const editor = (
    <span className="flex min-w-0 items-center whitespace-nowrap">
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={label}
        aria-busy={busy ? 'true' : undefined}
        aria-invalid={bubbleText ? 'true' : undefined}
        readOnly={busy}
        /* 포커스 표시는 행의 `inset` 링 한 겹이다(전역 규약 Q-02) — 입력 자체는 링을 그리지 않는다. */
        data-focus-ring="seamless"
        value={buffer}
        onChange={(e) => {
          if (busy) return;
          const digits = e.target.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
          if (digits.length > PAD_MAX_DIGITS) return;
          setDigits(digits);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          switch (e.key) {
            case 'Enter':
              e.preventDefault();
              if (busy) return;
              trySave('enter');
              return;
            case 'Tab': {
              e.preventDefault();
              // 반영 중이거나 이미 저장한 버퍼 — 다시 보내지 않고 이동만 한다(T-16-10).
              const saved = busy || settledRef.current ? true : trySave('tab');
              if (!saved || onNavigate === undefined) return;
              leftRef.current = true;
              onNavigate(e.shiftKey ? 'prev' : 'next');
              return;
            }
            case 'Escape':
              e.preventDefault();
              settledRef.current = true;
              onCancel();
              return;
            case 'ArrowUp':
            case 'ArrowDown': {
              e.preventDefault();
              if (busy) return;
              const next = stepValue(valueOf(), unit, e.key === 'ArrowUp' ? 1 : -1);
              setDigits(String(next));
              return;
            }
          }
        }}
        onBlur={() => {
          if (leftRef.current) return;
          if (busy || settledRef.current) {
            onDismiss?.();
            return;
          }
          settledRef.current = true;
          // A6 — 위반 값을 둔 채 떠나면 Esc 와 같다(저장 안 함).
          if (issueOf() !== null) onCancel();
          else onSave(valueOf(), 'blur');
        }}
        className={cn(
          'w-[9ch] border-0 bg-transparent text-right text-[15px] font-semibold tabular-nums text-[var(--fg)] outline-none',
          'selection:bg-[color-mix(in_srgb,var(--primary)_35%,transparent)]',
          busy && 'opacity-60',
        )}
      />
      <span className="ml-[2px] text-[15px] font-medium leading-[1.5] text-[var(--fg-2)]">{unit}</span>
      {/* 반영 중 — 화면 문구 없이 보조기기에만(행 높이 불변 · E4 loading). */}
      <span className="sr-only" aria-live="polite">
        {busy ? LC_COMMIT_TEXT.busy : ''}
      </span>
    </span>
  );

  // 말풍선 유무와 무관하게 **같은 트리**다 — 감싸기가 바뀌면 입력이 다시 마운트돼 포커스를 잃는다.
  return (
    <FailureBubble open={bubbleText != null && bubbleText !== ''} text={bubbleText ?? ''}>
      {editor}
    </FailureBubble>
  );
}
