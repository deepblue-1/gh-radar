// RED 스켈레톤 — 표면만. 동작은 GREEN 에서 채운다.
import { EventEmitter } from "node:events";
import type { ObserverTransport } from "../journal/types.js";

export const QUOTE_CLIENT_NAME = "gh-radar-relay/quote";
export const QUOTE_ROLE = 1;
export type QuoteFeedState = "disabled" | "connecting" | "logging_in" | "ready" | "rejected" | "role_mismatch";
export type QuoteFeedDeps = {
  secret: string | undefined;
  host: string;
  port: number;
  transport?: ObserverTransport;
  loginTimeoutMs?: number;
};

export class QuoteFeed extends EventEmitter {
  constructor(_deps: QuoteFeedDeps) {
    super();
  }
  get state(): QuoteFeedState {
    return "disabled";
  }
  get isReady(): boolean {
    return false;
  }
  get reconnects(): number {
    return 0;
  }
  get lastFrameAtMs(): number | null {
    return null;
  }
  start(): void {}
  stop(): void {}
  send(_payload: Uint8Array): boolean {
    return false;
  }
}
