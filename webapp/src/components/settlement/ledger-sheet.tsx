"use client";

import type {
  SettlementAccKey,
  SettlementAccountView,
  SettlementKind,
  SettlementLedgerBody,
  SettlementLedgerRow,
  SettlementPerson,
  SettlementVia,
} from "@gh-radar/shared";

/** 자리 표시 — 44-10 T1 GREEN 이 채운다. */

export const LEDGER_SHEET_TEXT = {} as Record<string, string>;

export interface LedgerDraft {
  kind: SettlementKind;
  fromAcc: SettlementAccKey | null;
  toAcc: SettlementAccKey | null;
  who: SettlementPerson | null;
  via: SettlementVia;
  amountManwon: string;
  txDate: string;
  memo: string;
}

export function ledgerDraftToBody(_draft: LedgerDraft, _reflect: boolean): SettlementLedgerBody {
  return {} as SettlementLedgerBody;
}

export interface LedgerSheetProps {
  open: boolean;
  mode: "new" | "edit";
  row: SettlementLedgerRow | null;
  accounts: readonly SettlementAccountView[];
  nowIso: string;
  onClose: () => void;
  onSave: (body: SettlementLedgerBody) => Promise<void>;
}

export function LedgerSheet(_props: LedgerSheetProps) {
  return null;
}
