import type { SettlementAccKey, SettlementSnapshotAccount } from "@gh-radar/shared";

/** 44-06 RED 자리 — GREEN 에서 계좌 표를 그린다. */
export function AccountTable(_props: {
  rows: SettlementSnapshotAccount[];
  cum: { cumKrw: number; prevKrw: number } | null;
  mode: "now" | "past";
  readLine?: string;
  mismatch?: SettlementAccKey[];
  nowIso: string;
  compact?: boolean;
}) {
  return null;
}
