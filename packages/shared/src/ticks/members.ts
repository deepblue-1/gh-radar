// RED 스텁 — 구현 전(37-05 Task 2). 시그니처만 있고 값은 틀린다.
import type { TickIndex } from "./record-index";
export const TEAM_MEMBERS = ["00001", "00003", "00008", "00002", "00012"] as const;
export type TeamMember = (typeof TEAM_MEMBERS)[number];
export const TEAM_MEMBER_LABEL: Readonly<Record<TeamMember, string>> = {
  "00001": "",
  "00003": "",
  "00008": "",
  "00002": "",
  "00012": "",
};
export interface MemberRow {
  member: string;
  label: string;
  sell: { qty: number; value: number } | null;
  buy: { qty: number; value: number } | null;
}
export function lastB9Of(index: TickIndex, _recvOrder: Int32Array): Int32Array {
  return new Int32Array(index.n);
}
export function memberTableAt(
  _buf: Uint8Array,
  _index: TickIndex,
  _b9Rec: number,
): { recvNs: bigint; b9Rec: number; rows: MemberRow[] } | null {
  return { recvNs: 0n, b9Rec: -1, rows: [] };
}
