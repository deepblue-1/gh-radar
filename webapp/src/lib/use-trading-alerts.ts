"use client";

/**
 * useTradingAlerts — relay 컨텍스트의 **새 프레임**을 작업대 이벤트 알림으로 바꾼다
 * (quick-260923-pgu · 목업 ③A · 결정 갱신 D-36/D-27 — `trading-alerts.ts` ①).
 *
 * ① 새 프레임만 — 객체 정체성(WeakSet)
 *   relay 리듀서는 `orders`·`viNotices` 에 새 프레임을 **앞에 붙인 새 배열**을 만들 뿐 기존 객체는
 *   그대로 둔다. 그래서 마운트 첫 실행은 이미 있는 객체를 전부 「본 것」으로 기록만 하고(이력 재생
 *   금지), 이후에는 앞에서부터 훑다가 본 객체를 만나면 멈춘다. 같은 배열이 다시 와도 중복 0.
 * ② 돌파는 스트립이 목록에 새로 올린 비무음 행만 알린다(`BreakoutStrip onRowsAdded` → `notifyBreakouts`
 *   — 새 종목 76 · 이탈 뒤 새 구간 재돌파). 첫 채움 · 78 · 자리유지 재알림 · 발화 거래소 전환 · ✕ 지운
 *   종목은 알리지 않는다. gh-trade `RowAdded`(RateCrossWatchList.cs:662 → RateCrossListForm.cs:406-422)와
 *   같은 축이다. 알림음은 스트립(종목당 하루 1회)이 이미 낸다 — 여기서는 내지 않는다 (quick-260926-s5v).
 * ③ 색인 조인 보류 — 주문 통보가 계좌 델타보다 먼저 오면 `orderIndex` 에 아직 없다. 그 통보는
 *   최대 `ALERT_HOLD_MS` 보류하고, 그 사이 색인이 풀리면 이름을 붙여, 끝내 없으면 「주문 {No}」 로 낸다.
 * ④ 소리 — 「기록 먼저, 재생 나중」(breakout-strip ④). 체결·VI 의 **새** 알림만 `playBreakoutTone`
 *   (토글은 모듈이 스스로 본다). 묶음 병합된 조각 체결은 다시 울리지 않는다.
 * ⑤ 로그를 남기지 않는다(T-pgu-02) · 이력을 저장하지 않는다(A안).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RelayOrderMsg, RelayRateCrossItem, RelayViNoticeMsg } from "@gh-radar/shared";

import { playBreakoutTone } from "@/lib/alert-tone";
import {
  ALERT_HOLD_MS,
  alertFromBreakout,
  alertFromOrder,
  alertFromVi,
  mergeAlert,
  orderAlertKind,
  resolveOrderEntry,
  type OrderIndexEntry,
  type TradingAlert,
} from "@/lib/trading-alerts";

export interface UseTradingAlertsInput {
  orders: readonly RelayOrderMsg[];
  viNotices: readonly RelayViNoticeMsg[];
  /** relay 리듀서의 add-only 주문번호 색인(`RelayConnectionState.orderIndex`). */
  orderIndex: ReadonlyMap<string, OrderIndexEntry>;
  /** **새** 알림마다(병합 제외) — 작업대가 카드 표시(`data-alert`)를 건다. */
  onNew?: (a: TradingAlert) => void;
}

interface Pending {
  msg: RelayOrderMsg;
  at: number;
  id: string;
  timer: ReturnType<typeof setTimeout>;
}

/** 배열 앞(최신)에서부터 처음 보는 항목만 — 도착 순(오래된 것 먼저)으로 돌려준다. */
function takeFresh<T extends object>(items: readonly T[], seen: WeakSet<T>): T[] {
  const fresh: T[] = [];
  for (const it of items) {
    if (seen.has(it)) break;
    fresh.push(it);
  }
  for (const it of fresh) seen.add(it);
  return fresh.reverse();
}

export function useTradingAlerts(input: UseTradingAlertsInput): {
  alerts: TradingAlert[];
  dismiss: (id: string) => void;
  /** 스트립 새 행 신호(`BreakoutStrip onRowsAdded`) — 행마다 돌파 알림 1건(②). 안정 콜백. */
  notifyBreakouts: (items: readonly RelayRateCrossItem[]) => void;
} {
  const { orders, viNotices, orderIndex, onNew } = input;
  const [alerts, setAlerts] = useState<TradingAlert[]>([]);
  /** 상태 미러 — 병합 여부를 동기적으로 알아야 소리·`onNew` 를 한 번만 낸다. */
  const alertsRef = useRef<TradingAlert[]>([]);
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;
  const indexRef = useRef(orderIndex);
  indexRef.current = orderIndex;

  const seenOrders = useRef(new WeakSet<RelayOrderMsg>());
  const seenVi = useRef(new WeakSet<RelayViNoticeMsg>());
  const ordersPrimed = useRef(false);
  const viPrimed = useRef(false);
  const pending = useRef<Pending[]>([]);
  const seq = useRef(0);

  const nextId = () => {
    seq.current += 1;
    return `wb-alert-${seq.current}`;
  };

  const emit = useCallback((alert: TradingAlert) => {
    const r = mergeAlert(alertsRef.current, alert);
    alertsRef.current = r.alerts;
    setAlerts(r.alerts);
    // ④ 기록 먼저, 재생 나중.
    if (r.merged) return;
    onNewRef.current?.(alert);
    if (alert.kind === "fill" || alert.kind === "vi") playBreakoutTone();
  }, []);

  const dismiss = useCallback((id: string) => {
    const next = alertsRef.current.filter((a) => a.id !== id);
    if (next.length === alertsRef.current.length) return;
    alertsRef.current = next;
    setAlerts(next);
  }, []);

  // ③ 색인이 바뀌면 보류 중이던 통보 중 이제 풀리는 것을 낸다(도착 순 유지).
  useEffect(() => {
    if (pending.current.length === 0) return;
    const still: Pending[] = [];
    for (const p of pending.current) {
      const entry = resolveOrderEntry(orderIndex, p.msg);
      if (entry === null) {
        still.push(p);
        continue;
      }
      clearTimeout(p.timer);
      emit(alertFromOrder(p.msg, entry, p.at, p.id));
    }
    pending.current = still;
  }, [orderIndex, emit]);

  // ① 주문 통보.
  useEffect(() => {
    if (!ordersPrimed.current) {
      ordersPrimed.current = true;
      for (const o of orders) seenOrders.current.add(o);
      return;
    }
    for (const msg of takeFresh(orders, seenOrders.current)) {
      if (orderAlertKind(msg.nt) === null) continue;
      const at = Date.now();
      const id = nextId();
      const entry = resolveOrderEntry(indexRef.current, msg);
      if (entry !== null) {
        emit(alertFromOrder(msg, entry, at, id));
        continue;
      }
      const timer = setTimeout(() => {
        pending.current = pending.current.filter((p) => p.id !== id);
        // 마지막으로 한 번 더 — 같은 틱에 색인이 도착했을 수 있다.
        emit(alertFromOrder(msg, resolveOrderEntry(indexRef.current, msg), at, id));
      }, ALERT_HOLD_MS);
      pending.current.push({ msg, at, id, timer });
    }
  }, [orders, emit]);

  // VI 발동 통지.
  useEffect(() => {
    if (!viPrimed.current) {
      viPrimed.current = true;
      for (const v of viNotices) seenVi.current.add(v);
      return;
    }
    for (const v of takeFresh(viNotices, seenVi.current)) emit(alertFromVi(v, Date.now(), nextId()));
  }, [viNotices, emit]);

  // ② 돌파 — 스트립의 새 비무음 행 신호로만. 입력 순서대로 emit 한다.
  const notifyBreakouts = useCallback(
    (items: readonly RelayRateCrossItem[]) => {
      for (const it of items) emit(alertFromBreakout(it, Date.now(), nextId()));
    },
    [emit],
  );

  // 언마운트 — 보류 타이머 전부 해제(T-pgu-03).
  useEffect(
    () => () => {
      for (const p of pending.current) clearTimeout(p.timer);
      pending.current = [];
    },
    [],
  );

  return { alerts, dismiss, notifyBreakouts };
}
