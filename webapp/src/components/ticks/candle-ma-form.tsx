'use client';

import type { ReactNode } from 'react';

import type { MaBase, MaKind, MaSpec } from '@/lib/ticks/candle-ma';
import type { MaConfig } from '@/lib/ticks/candle-prefs';

/** RED 뼈대 — 계약 이름만. GREEN 에서 채운다. */
export interface MaFormInput {
  base: MaBase;
  nText: string;
  kind: MaKind;
}
export interface MaFormState {
  spec: MaSpec | null;
  error: 'range' | 'dup' | null;
  name: string | null;
}
export function maFormStateOf(_input: MaFormInput, _config: MaConfig): MaFormState {
  return { spec: null, error: null, name: '' };
}

export function CandleMaForm({
  trigger,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: MaConfig;
  onAdd: (spec: MaSpec) => void;
  trigger: ReactNode;
}) {
  return <>{trigger}</>;
}
