/**
 * Phase 26 Plan 10 — 재구독 페이싱 (RESEARCH Pattern 7 · Pitfall 3). RED 골격 — 동작은 다음 커밋이 채운다.
 */
import type { RelayExchange, RelaySubLevel } from "@gh-radar/shared";

export const PACER_WINDOW = 0;
export const PACER_TIMEOUT_MS = 0;

export type PacerControlKind = "unsubscribe" | "demote";

export interface SubscribePacerDeps {
  isReady(): boolean;
  send(payload: Uint8Array): boolean;
  window?: number;
  timeoutMs?: number;
  tapeCount?: number;
  onIdle?: () => void;
}

export interface SubscribePacerStats {
  queued: number;
  inFlight: number;
  timeouts: number;
}

export class SubscribePacer {
  constructor(_deps: SubscribePacerDeps) {}

  subscribe(_key: string, _isin: string, _exchange: RelayExchange, _level: RelaySubLevel): void {}

  control(_key: string, _payload: Uint8Array, _kind: PacerControlKind): void {}

  onResponse(_key: string, _msgType: number): void {}

  reset(): void {}

  stats(): SubscribePacerStats {
    return { queued: 0, inFlight: 0, timeouts: 0 };
  }
}
