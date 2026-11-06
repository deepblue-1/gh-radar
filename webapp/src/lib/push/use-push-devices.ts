/**
 * 기기 목록 모듈 저장소 — 인터페이스만(Phase 40 · 40-10 Task 2 RED). 구현은 GREEN 커밋.
 */

import type { PushDevice } from "@gh-radar/shared";

export type PushDevicesState = {
  devices: PushDevice[];
  loadedAt: number | null;
  error: boolean;
};

const EMPTY: PushDevicesState = { devices: [], loadedAt: null, error: false };

export function pushDevicesSnapshot(): PushDevicesState {
  return EMPTY;
}

export function subscribePushDevices(_fn: () => void): () => void {
  return () => {};
}

export async function refreshPushDevices(): Promise<void> {}

export function updatePushDevicesLocal(_fn: (devices: PushDevice[]) => PushDevice[]): void {}

export function usePushDevices(): PushDevicesState {
  return EMPTY;
}

/** 테스트 전용 — 저장소를 처음 상태로. */
export function __resetPushDevicesForTest(): void {}
