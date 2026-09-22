"use client";

import type { RelayExchange } from "@gh-radar/shared";

import type { LatchLedKind, LatchLedServer } from "@/components/trading/latch-led";

export const EXCHANGE_LOCKED_TITLE = "";

export interface CardHeaderProps {
  name: string;
  code: string | null;
  exchange: RelayExchange;
  onExchangeChange: (exchange: RelayExchange) => void;
  exchangeLocked: boolean;
  price: number | null;
  changeRate: number | null;
  ledServer: LatchLedServer;
  onArm: (kind: LatchLedKind) => void;
  open: boolean;
  onToggle: () => void;
  toggleId: string;
  controlsId: string;
  onInfo?: () => void;
  onClose: () => void;
}

/** RED 골격 — Task 2 GREEN 에서 채운다. */
export function CardHeader(_props: CardHeaderProps) {
  return <header data-slot="card-header" />;
}
