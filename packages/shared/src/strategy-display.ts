/**
 * Phase 17 Plan 01 — 전략 표시 헬퍼 (TRADE-04 / D-13 · D-17). **RED 골격.**
 *
 * 시그니처와 방향 단어만 있다. 접미 규칙(Q · P · /종가)과 출처 배지 분기는 아직 없다 —
 * `__tests__/strategy-display.test.ts` 가 그 부재를 단언으로 먼저 드러낸다.
 */

import type { OrderSide } from "./relay";

export function sideDisplayText(
  side: OrderSide,
  _orderNo: string,
  _pendingStatus: string,
  _board: string,
): string {
  return side === "B" ? "매수" : "매도";
}

export function serverMsgBadge(_src: string): string {
  return "[서버]";
}
