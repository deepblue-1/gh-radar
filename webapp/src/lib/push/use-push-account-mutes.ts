/**
 * 내 매매 알림 「끈 계좌」 모듈 저장소 + 훅 (quick-261109-dz1 · D-10 · use-push-devices 동형 · 폴링 없음).
 *
 * - 탭 메모리 하나 — 「매매 알림」 패널의 「받을 계좌」 섹션이 읽는다. 로그아웃은 `/login` 하드 이동이라 새 사용자에게
 *   옛 목록이 남지 않는다.
 * - `refreshPushAccountMutes()` 는 진행 중 요청을 공유한다. 단 스위치(`updatePushAccountMutesLocal`)가 끼면 세대가 바뀌어
 *   그 전에 시작한 응답은 버린다 — 끈 직후 옛 목록(켜짐)이 덮어써 스위치가 되돌아가지 않게.
 * - `usePushAccountMutes()` 는 마운트 뒤 60초보다 오래된(또는 없는) 목록이면 새로 읽는다. 서버 스냅숏은 늘 빈 목록이다
 *   (하이드레이션).
 * - 읽기 실패는 `error: true` 로만 남기고 이전 목록은 그대로 둔다(빈 목록으로 감추지 않는다 · 로그 한 줄).
 */

import { useEffect, useSyncExternalStore } from "react";

import { pushErrorText } from "@/lib/push/native-push";
import { fetchPushAccountMutes } from "@/lib/push/push-devices-api";

export type PushAccountMutesState = {
  /** 끈 계좌번호(행 있음 = 꺼짐 · D-02 기본 켜짐). */
  muted: string[];
  /** 마지막으로 서버 목록을 받은 시각(epoch ms) — 한 번도 못 받았으면 null. */
  loadedAt: number | null;
  /** 마지막 읽기가 실패했는가. */
  error: boolean;
};

/** 이보다 오래된 목록은 패널 마운트 때 다시 읽는다. */
export const PUSH_ACCOUNT_MUTES_STALE_MS = 60_000;

const EMPTY: PushAccountMutesState = { muted: [], loadedAt: null, error: false };

let state: PushAccountMutesState = EMPTY;
let generation = 0;
let inflight: { gen: number; promise: Promise<void> } | null = null;
const listeners = new Set<() => void>();

function emit(next: PushAccountMutesState): void {
  state = next;
  for (const fn of listeners) fn();
}

export function pushAccountMutesSnapshot(): PushAccountMutesState {
  return state;
}

export function subscribePushAccountMutes(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 서버 목록을 다시 읽는다 — 같은 세대의 진행 중 요청이 있으면 그것을 돌려준다. throw 하지 않는다. */
export function refreshPushAccountMutes(): Promise<void> {
  if (inflight && inflight.gen === generation) return inflight.promise;
  const gen = generation;
  const promise = fetchPushAccountMutes()
    .then(
      (muted) => {
        if (gen !== generation) return;
        emit({ muted, loadedAt: Date.now(), error: false });
      },
      (err: unknown) => {
        console.warn("[gh-radar] push 끈 계좌 읽기 실패", pushErrorText(err));
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

/** 스위치 결과를 서버 응답 전에 반영한다(D-10 낙관적) — 세대를 올려 그 전에 시작한 읽기 응답을 버린다. loadedAt 유지. */
export function updatePushAccountMutesLocal(fn: (muted: string[]) => string[]): void {
  generation += 1;
  emit({ ...state, muted: fn(state.muted) });
}

function serverSnapshot(): PushAccountMutesState {
  return EMPTY;
}

/** 끈 계좌 훅 — 마운트 뒤 낡았으면(없거나 60초 초과) 새로 읽는다. 폴링하지 않는다. */
export function usePushAccountMutes(): PushAccountMutesState {
  const snap = useSyncExternalStore(subscribePushAccountMutes, pushAccountMutesSnapshot, serverSnapshot);
  useEffect(() => {
    const { loadedAt } = pushAccountMutesSnapshot();
    if (loadedAt === null || Date.now() - loadedAt > PUSH_ACCOUNT_MUTES_STALE_MS) void refreshPushAccountMutes();
  }, []);
  return snap;
}

/** 테스트 전용 — 저장소를 처음 상태로. */
export function __resetPushAccountMutesForTest(): void {
  state = EMPTY;
  generation += 1;
  inflight = null;
}
