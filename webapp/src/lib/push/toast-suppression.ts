/**
 * D-20 작업대 주문 토스트 숨김 판단 — 인터페이스 스텁(Task 2 RED · GREEN 에서 구현).
 */

import type { PushPermission } from "@/lib/push/native-push";

export interface OrderToastSuppressionState {
  native: boolean;
  pluginAvailable: boolean;
  permission: PushPermission | null;
  thisDeviceEnabled: boolean;
}

export function orderToastSuppressed(_s: OrderToastSuppressionState): boolean {
  return false;
}

export function useOrderToastSuppression(): boolean {
  return false;
}
