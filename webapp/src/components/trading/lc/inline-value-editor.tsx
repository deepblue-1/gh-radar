'use client';

/**
 * InlineValueEditor — 마우스 기기 인라인 편집 (Phase 20 D-14 · D-14a · D-14c · UI-SPEC §6).
 *
 * ★ 44px 행 **안의 값 자리만** 입력칸으로 바뀐다. 안내 문구(「Enter 저장 · Esc 취소」)도 「저장」
 *   버튼도 없다(D-14a) — 행 높이가 변하지 않는 것이 이 편집기의 존재 조건이다.
 * ★ 들어가자마자 **값 전체 선택**(D-14c) — 첫 입력이 값을 덮는다. `NumInput` 의 iOS 재선택
 *   (`select()` 직후 한 번 더)을 그대로 차용한다.
 * ★ 편집기는 **자기 버퍼**를 든다 — 편집 중 에코가 와도 입력값을 덮지 않는다(UI-SPEC E4 partial).
 *   행 표시값은 편집이 끝난 뒤 에코 값이다.
 * ★ 키: Enter = 저장(즉시 반영) · Esc = 취소(전송 없음) · 포커스 이탈 = 저장.
 *   한 번 저장한 버퍼를 포커스 이탈이 다시 저장하지 않는다(같은 확정의 두 번째 전송 금지 ·
 *   T-16-10). 실패 뒤 다시 Enter 는 사용자가 누른 재시도이므로 다시 저장한다.
 *   Tab · ↑↓ · 한 번 클릭 전환(D-14b)은 20-05 가 더한다.
 */

import { useLayoutEffect, useRef, useState } from 'react';

import { FailureBubble, type SettingUnit } from '@/components/trading/lc/setting-group';
import { cn } from '@/lib/utils';

const NUM = new Intl.NumberFormat('ko-KR');
/** 입력 상한 — 키패드와 같은 9자리(UI-SPEC E4 long-text). 넘는 입력은 무시한다. */
const MAX_DIGITS = 9;

export type InlineSaveVia = 'enter' | 'blur';

export interface InlineValueEditorProps {
  id: string;
  label: string;
  unit: SettingUnit;
  initialValue: number;
  /** 실패 말풍선 문구 — 있으면 편집기 아래에 뜬다(입력 포커스 유지). */
  failureText?: string | null;
  /** 반영 중 — 입력 잠금 + `aria-busy`. */
  busy?: boolean;
  /** 저장 — 빈 입력은 0 이다(서버 계약상 빈 값 = 0). */
  onSave: (value: number, via: InlineSaveVia) => void;
  /** Esc — 서버 값으로 돌아가고 전송하지 않는다. */
  onCancel: () => void;
  /** 이미 저장한 버퍼에서 포커스가 빠졌다 — 다시 보내지 않고 편집만 끝낸다. */
  onDismiss?: () => void;
}

function formatDigits(digits: string): string {
  return digits === '' ? '' : NUM.format(Number(digits));
}

export function InlineValueEditor({
  id,
  label,
  unit,
  initialValue,
  failureText = null,
  busy = false,
  onSave,
  onCancel,
  onDismiss,
}: InlineValueEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [buffer, setBuffer] = useState(() => NUM.format(initialValue));
  /** 지금 버퍼를 이미 저장(또는 취소)했는가 — 포커스 이탈의 두 번째 저장을 막는다. */
  const settledRef = useRef(false);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (el === null) return;
    el.focus();
    el.select();
    const t = window.setTimeout(() => el.select(), 0);
    return () => window.clearTimeout(t);
  }, []);

  const valueOf = (): number => {
    const digits = buffer.replace(/[^0-9]/g, '');
    return digits === '' ? 0 : Number(digits);
  };

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
        aria-invalid={failureText ? 'true' : undefined}
        readOnly={busy}
        /* 포커스 표시는 행의 `inset` 링 한 겹이다(전역 규약 Q-02) — 입력 자체는 링을 그리지 않는다. */
        data-focus-ring="seamless"
        value={buffer}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
          if (digits.length > MAX_DIGITS) return;
          settledRef.current = false;
          setBuffer(formatDigits(digits));
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            if (busy) return;
            settledRef.current = true;
            onSave(valueOf(), 'enter');
          } else if (e.key === 'Escape') {
            e.preventDefault();
            settledRef.current = true;
            onCancel();
          }
        }}
        onBlur={() => {
          if (settledRef.current) {
            onDismiss?.();
            return;
          }
          settledRef.current = true;
          onSave(valueOf(), 'blur');
        }}
        className={cn(
          'w-[9ch] border-0 bg-transparent text-right text-[15px] font-semibold tabular-nums text-[var(--fg)] outline-none',
          'selection:bg-[color-mix(in_srgb,var(--primary)_35%,transparent)]',
          busy && 'opacity-60',
        )}
      />
      <span className="ml-[2px] text-[15px] font-medium leading-[1.5] text-[var(--fg-2)]">{unit}</span>
    </span>
  );

  // 말풍선 유무와 무관하게 **같은 트리**다 — 감싸기가 바뀌면 입력이 다시 마운트돼 포커스를 잃는다.
  return (
    <FailureBubble open={failureText != null && failureText !== ''} text={failureText ?? ''}>
      {editor}
    </FailureBubble>
  );
}
