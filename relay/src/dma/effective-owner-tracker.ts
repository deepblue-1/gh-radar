/**
 * Phase 29-44 — G-1 ⑤c (가) 보강. 전 DMA 유저 × 계좌의 **유효 주문 서버** 스냅샷과 그 변화(`OwnerMove`).
 *
 * (RED 골격 — 구현은 GREEN 커밋.)
 */
import type { DmaBroker } from "../registry/registry.js";

/** 계좌 1건의 유효 주문 서버 변화. `from` · `to` undefined = 그 시점 소유자 없음. */
export type OwnerMove = {
  dmaUserId: string;
  broker: DmaBroker;
  accountNo: string;
  from: string | undefined;
  to: string | undefined;
};

/** 계좌 1건의 지금 값. */
export type OwnerSnapshotEntry = {
  broker: DmaBroker;
  accountNo: string;
  owner: string | undefined;
  effective: string | undefined;
  servers: readonly string[];
};

export type EffectiveOwnerTrackerDeps = {
  dmaUserIds: () => Iterable<string>;
  accountsOf: (serverKey: string, dmaUserId: string) => ReadonlySet<string> | undefined;
  servers: () => ReadonlyArray<{ key: string; broker: string }>;
  effectiveOrderServer: (dmaUserId: string, broker: DmaBroker, accountNo: string) => string | undefined;
  ready?: () => boolean;
};

export class EffectiveOwnerTracker {
  constructor(_deps: EffectiveOwnerTrackerDeps) {}

  refresh(): OwnerMove[] {
    return [];
  }

  snapshotOf(_dmaUserId: string): ReadonlyMap<string, OwnerSnapshotEntry> {
    return new Map();
  }
}
