import type { KisNewsConfig } from "./config.js";
import type { NewsTitleQuery } from "./kis/newsTitle.js";
import type { KisNewsTitleRow } from "./kis/types.js";
import type { IngestRow, StockMeta } from "./pipeline/classify.js";
import type { IngestResult, IngestVia } from "./pipeline/ingest.js";
import type { TargetInfo } from "./pipeline/scheduler.js";

// RED 스텁 — 41-08 Task 2 GREEN 에서 구현한다.
export const LEASE_TTL_S = 0;
export const LEASE_RENEW_MS = 0;
export const FEED_INTERVAL_MS = 0;
export const DISCLOSURE_SAFETY_MS = 0;
export const TARGET_RELOAD_MS = 0;
export const USAGE_FLUSH_MS = 0;
export const META_RELOAD_MS = 0;
export const FEED_MAX_PAGES_FAST = 0;
export const FEED_MAX_PAGES_SLOW = 0;
export const RATE_LIMIT_STRIKES = 0;
export const RATE_LIMIT_PAUSE_MS = 0;
export const UNKNOWN_ERROR_STRIKES = 0;
export const STOCK_RATE_SHARE = 0;

export interface CollectorLog {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

export interface CollectorDeps {
  cfg: Pick<KisNewsConfig, "maxRps" | "dailyBudget" | "mode" | "targetCap">;
  log: CollectorLog;
  clock: { now(): number };
  sleep(ms: number): Promise<void>;
  signal?: AbortSignal;
  holder: string;
  db: {
    leaseAcquire(holder: string, ttlSeconds: number): Promise<boolean>;
    leaseRelease(holder: string): Promise<boolean>;
    readState(): Promise<{ lastSrno: string | null; cleanupDate: string | null }>;
    loadTargets(meta: ReadonlyMap<string, StockMeta>): Promise<TargetInfo[]>;
    loadStockMeta(): Promise<ReadonlyMap<string, StockMeta>>;
    ingest(rows: IngestRow[], via: IngestVia, queriedCode?: string): Promise<IngestResult>;
    cleanup(): Promise<unknown>;
    usage: {
      read(dateKst: string): Promise<number>;
      add(n: number): void;
      flush(dateKst: string): Promise<number | null>;
    };
    strikes: {
      read(dateKst: string): Promise<number>;
      record(dateKst: string): Promise<number>;
    };
  };
  kis: {
    token(args: { canIssue: boolean; force: boolean }): Promise<string>;
    page(query: NewsTitleQuery, token: string): Promise<KisNewsTitleRow[]>;
  };
}

export interface CollectorExit {
  code: 0 | 1;
  reason: string;
}

export async function runCollector(_deps: CollectorDeps): Promise<CollectorExit> {
  return { code: 1, reason: "not implemented" };
}
