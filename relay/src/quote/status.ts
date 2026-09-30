/**
 * Phase 26 Plan 11 — 시세 공유 연결 상태 요약 (`QuoteStatus`). RED 골격 — 구현은 같은 플랜 GREEN 커밋.
 */
import { EventEmitter } from "node:events";
import type { RelayQuoteStateMsg } from "@gh-radar/shared";

import type { QuoteFeedState } from "./feed.js";

export const QUOTE_DOWN_AFTER_MS = 0;
export const QUOTE_ALERT_AFTER_MS = 0;

export type QuoteHealth = {
  state: QuoteFeedState;
  keyCount: number;
  lingerCount: number;
  lastFrameAgeSec: number | null;
  reconnects: number;
  subLimitRejects: number;
  disconnectedSec: number | null;
};

export function quoteAlerting(_health: QuoteHealth, _now: Date): boolean {
  return false;
}

export type QuoteStatusDeps = {
  feed: {
    readonly state: QuoteFeedState;
    readonly reconnects: number;
    readonly lastFrameAtMs: number | null;
    on(event: "state", listener: (state: QuoteFeedState) => void): unknown;
    off(event: "state", listener: (state: QuoteFeedState) => void): unknown;
  };
  hubStats: () => { subscriptionCount: number; lingerCount: number; subLimitRejects: number };
};

export class QuoteStatus extends EventEmitter {
  constructor(_deps: QuoteStatusDeps) {
    super();
  }

  frame(): RelayQuoteStateMsg | null {
    return null;
  }

  health(_nowMs: number): QuoteHealth {
    return {
      state: "disabled",
      keyCount: 0,
      lingerCount: 0,
      lastFrameAgeSec: null,
      reconnects: 0,
      subLimitRejects: 0,
      disconnectedSec: null,
    };
  }

  close(): void {}
}
