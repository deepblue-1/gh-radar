/**
 * 내 푸시 기기 목록 모듈 저장소 + 훅 (Phase 40 · D-13 — 「알림 받는 기기」 카드 · 40-11 토스트 숨김 · 시작 갱신이 같이 읽는다).
 *
 * - 탭 메모리 하나 — 카드와 40-11 이 각자 서버를 부르지 않게 한 벌만 둔다. 로그아웃은 `/login` 하드 이동이라 새 사용자에게
 *   옛 목록이 남지 않는다.
 * - `refreshPushDevices()` 는 진행 중 요청을 공유한다. 단 켜기 · 끄기 · 지우기(`updatePushDevicesLocal`)가 끼면 세대가 바뀌어
 *   그 전에 시작한 응답은 버리고 새로 읽는다 — 끄기 직후 옛 목록(켜짐)이 덮어써 스위치가 되돌아가지 않게.
 * - `usePushDevices()` 는 마운트 뒤 60초보다 오래된(또는 없는) 목록이면 새로 읽는다. 서버 스냅숏은 늘 빈 목록이다
 *   (하이드레이션 — 서버 HTML 은 목록을 모른다).
 * - 읽기 실패는 `error: true` 로만 남기고 이전 목록은 그대로 둔다(빈 목록으로 감추지 않는다 · 로그 한 줄).
 */

import { useEffect, useSyncExternalStore } from "react";
import type { PushDevice } from "@gh-radar/shared";

import { pushErrorText } from "@/lib/push/native-push";
import { fetchPushDevices } from "@/lib/push/push-devices-api";

export type PushDevicesState = {
  devices: PushDevice[];
  /** 마지막으로 서버 목록을 받은 시각(epoch ms) — 한 번도 못 받았으면 null. */
  loadedAt: number | null;
  /** 마지막 읽기가 실패했는가. */
  error: boolean;
};

/** 이보다 오래된 목록은 카드 마운트 때 다시 읽는다. */
export const PUSH_DEVICES_STALE_MS = 60_000;

const EMPTY: PushDevicesState = { devices: [], loadedAt: null, error: false };

let state: PushDevicesState = EMPTY;
let generation = 0;
let inflight: { gen: number; promise: Promise<void> } | null = null;
const listeners = new Set<() => void>();

function emit(next: PushDevicesState): void {
  state = next;
  for (const fn of listeners) fn();
}

export function pushDevicesSnapshot(): PushDevicesState {
  return state;
}

export function subscribePushDevices(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 서버 목록을 다시 읽는다 — 같은 세대의 진행 중 요청이 있으면 그것을 돌려준다. throw 하지 않는다. */
export function refreshPushDevices(): Promise<void> {
  if (inflight && inflight.gen === generation) return inflight.promise;
  const gen = generation;
  const promise = fetchPushDevices()
    .then(
      (devices) => {
        if (gen !== generation) return;
        emit({ devices, loadedAt: Date.now(), error: false });
      },
      (err: unknown) => {
        console.warn("[gh-radar] push 기기 목록 읽기 실패", pushErrorText(err));
        if (gen !== generation) return;
        emit({ ...state, error: true });
      },
    )
    .finally(() => {
      if (inflight?.promise === promise) inflight = null;
    });
  inflight = { gen, promise };
  return promise;
}

/** 켜기 · 끄기 · 지우기 결과를 서버 응답 전에 반영한다 — 세대를 올려 그 전에 시작한 읽기 응답을 버린다. */
export function updatePushDevicesLocal(fn: (devices: PushDevice[]) => PushDevice[]): void {
  generation += 1;
  emit({ ...state, devices: fn(state.devices) });
}

function serverSnapshot(): PushDevicesState {
  return EMPTY;
}

/** 기기 목록 훅 — 마운트 뒤 낡았으면(없거나 60초 초과) 새로 읽는다. */
export function usePushDevices(): PushDevicesState {
  const snap = useSyncExternalStore(subscribePushDevices, pushDevicesSnapshot, serverSnapshot);
  useEffect(() => {
    const { loadedAt } = pushDevicesSnapshot();
    if (loadedAt === null || Date.now() - loadedAt > PUSH_DEVICES_STALE_MS) void refreshPushDevices();
  }, []);
  return snap;
}

/** 테스트 전용 — 저장소를 처음 상태로. */
export function __resetPushDevicesForTest(): void {
  state = EMPTY;
  generation += 1;
  inflight = null;
}
