// RED 스텁 — Task 1 GREEN 에서 교체된다.
import type { RelayExchange, RelayQueuedWindowMsg } from "@gh-radar/shared";

export type OrderButtonMode = "normal" | "queued";
export interface ManualOrderAffordance {
  buttonMode: OrderButtonMode;
  showPieceInput: boolean;
  maxPieces: number;
  confirmNote: string | null;
  offHoursSelectable: boolean;
}
export const PREOPEN_CONFIRM_NOTE = "";
export const NXT_PREOPEN_CONFIRM_NOTE = "";
export function affordanceOf(
  _w: RelayQueuedWindowMsg | undefined,
  _exchange: RelayExchange,
  _orderType: "limit" | "offhours",
): ManualOrderAffordance {
  return { buttonMode: "normal", showPieceInput: false, maxPieces: 1, confirmNote: null, offHoursSelectable: false };
}
