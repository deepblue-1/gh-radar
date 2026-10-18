'use client';

/**
 * useAccumSignals — 작업대 「매집」 패널 원천 (quick-261018-rfy · D-02).
 *
 * ① 복원 ∪ 라이브 — 마운트 1회 + relay `ready` 전이마다 `fetchAccumSignals()`(오늘 · 서버가 isin 별 최신 1행)를 받고,
 *   relay 리듀서의 kind 16 별도 목록(`accumSignalEvents` · 그날 행만)과 `strategyEventKey` 로 합친다
 *   (`mergeStrategyEvents` — 주문로그 피드와 같은 병합). 그 합집합에서 isin 별 최신 행(gwTimeMs desc → gateway asc → seq desc ·
 *   `latestAccumByIsin`)을 골라 `accumSignalOf` 로 이름을 푼다 — 라이브의 늦은 행이 복원 행을 이긴다.
 *   폴링 · 타이머가 없다(`use-order-log-feed.ts` ⑥/② 의 축소판).
 *
 * ② `filled` — 첫 요청이 끝났는가(성공 · 실패 모두 true). 패널은 이것으로 「첫 채움 = 무강조」 경계를 잡는다.
 *   실패해도 라이브 행은 보인다(복원이 없을 뿐).
 *
 * ③ 요청 번호 가드 — 늦게 도착한 옛 응답이 새 응답을 덮지 않는다(`reqRef`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  STRATEGY_EVENT_KIND,
  accumSignalOf,
  kstDateIso,
  type AccumSignal,
  type StrategyEventRow,
} from '@gh-radar/shared';

import { fetchAccumSignals } from './accum-signals-api';
import { latestAccumByIsin } from './accum-list';
import { mergeStrategyEvents } from './order-log-feed';
import { useRelayContext } from './relay-provider';

export interface AccumSignalsState {
  /** isin 별 현재 상태(정렬 전 — 표시 순서는 패널의 `sortAccum`). */
  signals: AccumSignal[];
  /** 첫 복원 요청이 끝났는가(성공 · 실패). */
  filled: boolean;
}

export function useAccumSignals(): AccumSignalsState {
  const { accumSignalEvents, status: relayStatus } = useRelayContext();
  const today = kstDateIso();

  const [restored, setRestored] = useState<{ date: string; rows: StrategyEventRow[] } | null>(null);
  const [filled, setFilled] = useState(false);
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    const req = ++reqRef.current;
    try {
      const rows = await fetchAccumSignals();
      if (req !== reqRef.current) return;
      setRestored({ date: kstDateIso(), rows });
    } catch {
      if (req !== reqRef.current) return;
      // 복원 실패 — 라이브 행만 보인다. 다음 ready 전이에서 다시 받는다.
    } finally {
      if (req === reqRef.current) setFilled(true);
    }
  }, []);

  // ① 마운트 1회.
  useEffect(() => {
    void load();
  }, [load]);

  // ① relay 인증(ready 로 전이) — 마운트 뒤 첫 ready 포함. ready 유지 리렌더는 부르지 않는다.
  const prevRelayRef = useRef(relayStatus);
  useEffect(() => {
    const prev = prevRelayRef.current;
    prevRelayRef.current = relayStatus;
    if (relayStatus !== 'ready' || prev === 'ready') return;
    void load();
  }, [relayStatus, load]);

  const restoredRows = restored !== null && restored.date === today ? restored.rows : null;

  const signals = useMemo(() => {
    const merged = mergeStrategyEvents(restoredRows ?? [], accumSignalEvents, today);
    const accumOnly = merged.filter((r) => r.kind === STRATEGY_EVENT_KIND.AccumSignal);
    const out: AccumSignal[] = [];
    for (const row of latestAccumByIsin(accumOnly)) {
      const sig = accumSignalOf(row);
      if (sig !== null) out.push(sig);
    }
    return out;
  }, [restoredRows, accumSignalEvents, today]);

  return { signals, filled };
}
