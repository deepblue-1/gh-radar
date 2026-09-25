'use client';

// RED 스텁 — 시그니처만. GREEN 에서 교체한다.
import type { PadCtx, PadUnit } from '@/lib/numpad';

export interface NumberPadSheetProps {
  open: boolean;
  title: string;
  description: string;
  unit: PadUnit;
  purpose: 'apply' | 'fill';
  initialValue: number | null;
  serverValue?: number | null;
  ctx: PadCtx;
  status?: 'editing' | 'busy' | 'failed';
  failureText?: string | null;
  armedNotice?: boolean;
  validate?: (value: number) => string | null;
  returnFocusRef: { current: HTMLElement | null };
  onConfirm: (value: number) => void;
  onClose: () => void;
}

export function NumberPadSheet(_p: NumberPadSheetProps) {
  return null;
}
