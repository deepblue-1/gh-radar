/**
 * Phase 29-43 — G-1 (가) 옛 주문 서버 계좌 전략 끄기. (RED 골격 — 구현은 다음 커밋)
 */
import type { RelayExchange, RelayLimitChaser } from "@gh-radar/shared";

import type { DmaSession } from "./session.js";
import type { DmaCredentials, SessionTarget } from "./session-manager.js";

export const SWEEP_STEP_TIMEOUT_MS = 5_000;
export const SWEEP_TOTAL_TIMEOUT_MS = 20_000;
export const SWEEP_VI_EXCHANGES: readonly RelayExchange[] = ["KRX", "NXT"];

export type StrategySweepTarget = {
  userId: string;
  serverKey: string;
  broker: string;
  accountNos: readonly string[];
};

export type StrategySweepFailReason = "no-session" | "not-ready" | "timeout" | "send-failed" | "remaining";

export type StrategySweepResult =
  | { ok: true; disabledLimitChasers: number; viDisabled: number; sessionCreated: boolean }
  | {
      ok: false;
      reason: StrategySweepFailReason;
      remaining: number | null;
      disabledLimitChasers: number;
      viDisabled: number;
    };

export type SweeperSessions = {
  acquireOn(userId: string, target: SessionTarget, creds: DmaCredentials): DmaSession | null;
  release(userId: string, serverKey: string): void;
  sessionsOf(userId: string): DmaSession[];
};

export type StrategySweeperOptions = {
  sessions: SweeperSessions;
  targetOf: (serverKey: string) => SessionTarget | undefined;
  stepTimeoutMs?: number;
  totalTimeoutMs?: number;
  now?: () => number;
};

export function isActiveLimitChaser(_item: RelayLimitChaser): boolean {
  return false;
}

export class StrategySweeper {
  constructor(_opts: StrategySweeperOptions) {}

  async sweep(_target: StrategySweepTarget, _creds: DmaCredentials): Promise<StrategySweepResult> {
    return { ok: false, reason: "timeout", remaining: null, disabledLimitChasers: 0, viDisabled: 0 };
  }
}
