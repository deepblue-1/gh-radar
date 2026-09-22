"use client";

import { useEffect, useRef } from "react";
import type { RelayViOrderItem } from "@gh-radar/shared";

import { viOrderKey } from "@/lib/use-relay-socket";
import { notifyViEnd, scheduleViAlert } from "@/lib/vi-alert";

/**
 * VI 마감 알림 타이머 — 화면이 소유한다.
 *
 * 18-11 에서 옛 VI 화면(18-13 삭제)의 지역 함수를 여기로 옮겼다. 마감알림 토글이 작업대 상태줄로 이관되면서
 * (Q-1) `/trading` 도 같은 타이머를 걸어야 토글이 「켜져 있는데 안 울리는」 스위치가 되지 않는다.
 * 옛 VI 화면은 18-12 에서 사라질 때까지 같은 훅을 빌려 쓴다(정의 1벌).
 *
 * 주문 1건당 타이머 하나. 73 델타는 **같은 주문을 여러 번** 실어 오므로 키로 중복을 막지
 * 않으면 한 종목이 여러 번 울린다. 스위치가 꺼져 있으면 타이머 자체를 걸지 않는다 —
 * 걸어 두고 발화 시점에 판단하면, 끄고 나서도 이미 걸린 알림이 울린다.
 * ★ 켜져 있다가 **꺼지면 이미 걸린 타이머도 푼다**(18-11) — 옛 구현은 끈 뒤에도 걸려 있던
 *   알림이 울렸다.
 */
export function useViEndAlerts(items: readonly RelayViOrderItem[], enabled: boolean): void {
  const timers = useRef(new Map<string, number>());

  useEffect(() => {
    const map = timers.current;
    if (!enabled) {
      for (const id of map.values()) window.clearTimeout(id);
      map.clear();
      return;
    }
    for (const item of items) {
      const key = viOrderKey(item);
      if (map.has(key)) continue;
      const { at } = scheduleViAlert(item);
      const delay = at.getTime() - Date.now();
      if (delay <= 0) continue; // 이미 지난 알림은 만들지 않는다(뒤늦은 알림은 소음이다)
      const label = item.name !== undefined && item.name !== "" ? item.name : item.isin;
      map.set(
        key,
        window.setTimeout(() => {
          map.delete(key);
          notifyViEnd(label);
        }, delay),
      );
    }
  }, [items, enabled]);

  // 언마운트 시 전부 정리 — 화면을 떠난 뒤 울리는 알림은 사용자가 원인을 찾을 수 없다.
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const id of map.values()) window.clearTimeout(id);
      map.clear();
    };
  }, []);
}
