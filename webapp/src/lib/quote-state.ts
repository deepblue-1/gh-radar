/**
 * Phase 26 Plan 14 — 배지 2축 판정 (RED 스텁 · 구현은 다음 커밋).
 */

import type { RelayQuoteStateMsg, RelaySubLimitMsg } from "@gh-radar/shared";

import type { IsinLabel } from "@/lib/isin-labels";
import type { RelayStatus } from "@/lib/use-relay-socket";

export interface QuotePill {
  tone: "ok" | "down";
  label: "시세";
  detail: string | null;
  srDetail: string | null;
  title: string | null;
}

export interface OrderPill {
  tone: "ok" | "off";
  label: "주문";
  detail: string | null;
  srDetail: string | null;
  pulse: boolean;
}

export function quotePillOf(
  _quoteState: RelayQuoteStateMsg | null,
  _subLimit: RelaySubLimitMsg | null,
  _subject?: IsinLabel,
): QuotePill | null {
  return null;
}

export function orderPillOf(_status: RelayStatus, _statusLabel: string): OrderPill {
  return { tone: "off", label: "주문", detail: null, srDetail: null, pulse: false };
}
