'use client';

import { Switch as SwitchPrimitive } from 'radix-ui';
import {
  SETTLEMENT_ACCOUNTS,
  formatEokManMinus,
  type SettlementAccKey,
  type SettlementAccountView,
  type SettlementEffect,
} from '@gh-radar/shared';

import { cn } from '@/lib/utils';

/**
 * Phase 44 — 「예수금에도 반영」 상자(⑩ · D-10 · D-11 · D-13 · D-23).
 *
 * ⑦ 거래 시트 · ⑧ 정산 시트 · ⑨ 확인 창이 같은 상자를 끼운다. 상자는 상태를 갖지 않는다 — 켜짐 · 미리 보기 줄 ·
 * 장중 여부를 호출부가 넘긴다.
 *
 * - 미리 보기 증감은 호출부가 shared 로 만든다: ⑦ 새 거래 `reflectEffect(draft)` · 고치기
 *   `effectDiff(appliedEffectAt(old, 지금 값), reflectEffect(draft))` · ⑧ `addEffects(plan.outs.map(reflectEffect))` ·
 *   ⑨ 지우기 · 정산 취소 `effectDiff(revertApplied(줄들), {})`(목표값 대조 — 들어갔을 수 있는 계좌 포함 · CR-01).
 *   그 결과를 `reflectPreviewLines(effect, view.accounts)` 로 줄로 바꿔 `lines` 에 넘긴다.
 * - 장중 여부는 호출부가 shared `isSettlementMarketHours()`(평일 KST `08:00` ~ `20:00`)로 정해 `marketHours` 에 넘긴다.
 * - `ui/switch.tsx` · 상따 `GroupSwitch` 는 쓰지 않는다 — 같은 기하(시각 40×24 · thumb 20 · 히트 44)로 Radix 프리미티브를 직접 그린다.
 */

export const REFLECT_TEXT = {
  label: '예수금에도 반영',
  off: '예수금은 그대로 둬요',
  /** 반영했던 거래를 스위치를 끄고 고칠 때(IN-04) — 옛 증감은 예수금에 남고 그 줄은 「반영 안 함」 이 된다(목업 동작 그대로). */
  offKeepsApplied: '이전 반영분은 예수금에 그대로 남아요',
  market: '체결과 겹치면 어긋날 수 있어요',
  belowOne: '0 이하라 보내지 않아요',
  unset: '미설정',
} as const;

/** 미리 보기 한 줄 — 계좌 하나의 예수금이 어떻게 바뀌나. */
export interface ReflectLine {
  accKey: SettlementAccKey;
  label: string;
  /** 지금 예수금 — 미설정이면 null. */
  fromKrw: number | null;
  /** 반영한 뒤 예수금 = (지금 값 ?? 0) + 증감. */
  toKrw: number;
  /** 새 예수금이 1원 미만 — 서버가 보내지 않는다(server 반영의 1원 판정과 같다). */
  belowOne: boolean;
}

/** 증감을 미리 보기 줄로 — 0 이 아닌 계좌만 · SETTLEMENT_ACCOUNTS 순서. */
export function reflectPreviewLines(
  effect: SettlementEffect,
  accounts: readonly SettlementAccountView[],
): ReflectLine[] {
  const lines: ReflectLine[] = [];
  for (const def of SETTLEMENT_ACCOUNTS) {
    const delta = effect[def.key] ?? 0;
    if (delta === 0) continue;
    const fromKrw = accounts.find((a) => a.accKey === def.key)?.budgetKrw ?? null;
    const toKrw = (fromKrw ?? 0) + delta;
    lines.push({ accKey: def.key, label: def.label, fromKrw, toKrw, belowOne: toKrw < 1 });
  }
  return lines;
}

/** 스위치 기본값(D-11) — 거래 날짜(`YYYY-MM-DD`)가 오늘(KST `YYYY-MM-DD`)이면 켜짐 · 지난 날짜면 꺼짐. */
export function defaultReflectOn(txDate: string, todayIso: string): boolean {
  return txDate === todayIso;
}

export interface ReflectBoxProps {
  on: boolean;
  onToggle: (next: boolean) => void;
  lines: readonly ReflectLine[];
  /** 평일 KST `08:00` ~ `20:00` — 호출부가 shared `isSettlementMarketHours()` 로 정한다. 켜짐일 때만 줄을 보인다. */
  marketHours: boolean;
  /** 보내는 중(시트 · 확인 창 비행 중) — 스위치를 잠근다. */
  disabled?: boolean;
  /** 꺼짐일 때 「예수금은 그대로 둬요」 아래 덧붙이는 경고 한 줄(반영했던 거래 고치기 · IN-04). */
  offNote?: string;
}

const CAPTION = 'text-[length:var(--t-caption)] leading-[1.5]';
const WARN = 'text-[var(--led-latent)]';

function fromText(fromKrw: number | null): string {
  return fromKrw === null ? REFLECT_TEXT.unset : formatEokManMinus(fromKrw);
}

export function ReflectBox({ on, onToggle, lines, marketHours, disabled = false, offNote }: ReflectBoxProps) {
  return (
    <div data-slot="reflect-box" className="rounded-[12px] bg-[var(--muted)] px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 text-[length:var(--t-sm)] font-semibold break-keep">{REFLECT_TEXT.label}</span>
        <SwitchPrimitive.Root
          aria-label={REFLECT_TEXT.label}
          checked={on}
          disabled={disabled}
          onCheckedChange={onToggle}
          className={cn(
            'relative inline-flex h-6 w-10 flex-none items-center rounded-full bg-[var(--switch-off)]',
            'transition-colors duration-150 motion-reduce:transition-none',
            'data-[state=checked]:bg-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50',
            "after:absolute after:-inset-x-[2px] after:-inset-y-[10px] after:content-['']",
          )}
        >
          <SwitchPrimitive.Thumb className="block size-5 translate-x-[2px] rounded-full bg-white transition-transform duration-150 motion-reduce:transition-none data-[state=checked]:translate-x-[18px]" />
        </SwitchPrimitive.Root>
      </div>
      <div aria-live="polite">
        {on ? (
          <>
            {lines.map((l, i) =>
              l.belowOne ? (
                <div key={l.accKey} data-slot="reflect-line" className={cn(CAPTION, WARN, 'break-keep', i === 0 ? 'mt-2' : 'mt-1')}>
                  {`${l.label} 예수금 ${fromText(l.fromKrw)} → ${REFLECT_TEXT.belowOne}`}
                </div>
              ) : (
                <div key={l.accKey} data-slot="reflect-line" className={cn(CAPTION, 'break-keep', i === 0 ? 'mt-2' : 'mt-1')}>
                  {`${l.label} 예수금 `}
                  <span className="text-[var(--muted-fg)]">{fromText(l.fromKrw)}</span>
                  {' → '}
                  <b className="font-semibold">{formatEokManMinus(l.toKrw)}</b>
                </div>
              ),
            )}
            {/* 바뀌는 계좌가 없으면 스위치 줄만(UI-SPEC E10 empty) — 보낼 것이 없으니 장중 경고도 없다. */}
            {marketHours && lines.length > 0 && <div className={cn(CAPTION, WARN, 'mt-2 break-keep')}>{REFLECT_TEXT.market}</div>}
          </>
        ) : (
          <>
            <div className={cn(CAPTION, 'mt-2 text-[var(--muted-fg)]')}>{REFLECT_TEXT.off}</div>
            {offNote && (
              <div data-slot="reflect-off-note" className={cn(CAPTION, WARN, 'mt-1 break-keep')}>
                {offNote}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
