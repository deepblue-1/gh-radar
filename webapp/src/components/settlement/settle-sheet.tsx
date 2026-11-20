"use client";

import type { SettlementSettleBody, SettlementView } from "@gh-radar/shared";

/** RED 자리 — Task 1 GREEN 에서 채운다. */
export const SETTLE_SHEET_TEXT = {} as const;

export interface SettleSheetProps {
  open: boolean;
  view: SettlementView;
  nowIso: string;
  onClose: () => void;
  onConfirm: (body: SettlementSettleBody) => Promise<void>;
}

export function SettleSheet(_props: SettleSheetProps) {
  return null;
}
