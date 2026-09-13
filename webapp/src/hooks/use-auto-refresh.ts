'use client';

import { useEffect, useRef } from 'react';

import {
  AUTO_REFRESH_INTERVAL_MS,
  isAutoRefreshWindow,
} from '@/lib/auto-refresh-window';

export interface UseAutoRefreshOptions {
  /** false 면 타이머·리스너를 등록하지 않는다. */
  enabled: boolean;
  /** 주기 (ms). 기본 30초. */
  intervalMs?: number;
}

/**
 * quick-260913-g4c — 공용 자동 갱신 훅 (`/scanner` usePolling · 홈 useHomeQuery).
 *
 * onTick 호출 조건 = `document.visibilityState === 'visible'` **이고** `isAutoRefreshWindow(now)`
 * (KST 평일·비휴장일 08:00~20:05).
 *   - interval: intervalMs 마다 조건을 보고 onTick.
 *   - visibilitychange: visible 로 돌아오면(창 안이면) 즉시 1회 onTick.
 *   - 창 밖·hidden 에서는 자동 요청 0.
 *
 * 수동 새로고침·초기 로드는 이 훅을 거치지 않는다 — 게이트 무관.
 * onTick 은 ref 로 보관해 stale closure 를 막는다(effect 재등록 없음).
 */
export function useAutoRefresh(
  onTick: () => void,
  { enabled, intervalMs = AUTO_REFRESH_INTERVAL_MS }: UseAutoRefreshOptions,
): void {
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  useEffect(() => {
    if (!enabled) return;

    const tickIfAllowed = () => {
      if (document.visibilityState === 'visible' && isAutoRefreshWindow(new Date())) {
        onTickRef.current();
      }
    };

    const id = setInterval(tickIfAllowed, intervalMs);
    const onVisibility = () => {
      tickIfAllowed();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, intervalMs]);
}
