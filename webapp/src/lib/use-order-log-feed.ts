'use client';

/**
 * useOrderLogFeed — 주문로그 하루치 피드 (Phase 25-07 · D-07 · R10). 작업대 공용 패널 · 카드 탭 · 창 분리가 쓴다.
 *
 * ① 원천 둘: REST 하루치 복원(`fetchStrategyEvents` — `GET /api/strategy-events`) + relay 스토어 `strategyEvents`
 *   (`journal.events` 푸시 누적). 병합 · 오늘 경계는 순수 함수 `mergeStrategyEvents` 하나다.
 *
 * ② 복원은 **날짜별 1회** + `retry()` + relay 재인증(ready **재진입**) 때만 1회 — 폴링은 없다.
 *   ready 재진입 판정은 `today-orders-card.tsx` ⑦ 과 같다: 마운트 뒤 **첫** ready 는 마운트 조회와 같은 시점이라
 *   건너뛰고, ready 가 유지되는 동안의 리렌더는 전이가 아니다. 과거일은 푸시가 없어 재조회하지 않는다.
 *
 * ③ 과거일(창 분리 날짜 이동)은 그 날짜 조회 결과만 보인다 — 푸시 무시 · newKeys 없음 · latestPush null.
 *
 * ④ 새 줄 강조(R10) — 복원이 **성공한 뒤** 도착한 batch(`strategyEventsBatch` 삽입분)의 그날 행 키를 `newKeys` 에
 *   넣고 `NEW_LINE_HIGHLIGHT_MS`(3초) 뒤 뺀다. 복원 줄 · 복원과 겹친 푸시 줄은 강조하지 않는다. 언마운트 시 타이머 정리.
 *
 * ⑤ 실패는 `status: "error"` 로 수렴한다(사유를 풀어 쓰지 않는다 — 할 일은 「다시 시도」 하나). 복원이 실패해도
 *   푸시로 온 줄은 rows 에 그대로 있다.
 *
 * `useUnseenOrderLogCount` — 새 로그 배지(R2): 탭이 가려진 동안 도착한 **범위 안** 푸시 줄 수(필터 선택 미적용).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compareStrategyEventAsc, kstDateIso, strategyEventKey } from '@gh-radar/shared';
import type { StrategyEventRow } from '@gh-radar/shared';

import { useRelayContext } from './relay-provider';
import { fetchStrategyEvents } from './strategy-events-api';
import { inScope, mergeStrategyEvents, type OrderLogScope } from './order-log-feed';

/** 새로 도착한 줄 강조 유지 시간(ms) — R10. */
export const NEW_LINE_HIGHLIGHT_MS = 3_000;

export type OrderLogFeedStatus = 'loading' | 'ready' | 'error';

export interface OrderLogFeed {
  /** 오름차순(새 로그는 아래). */
  rows: readonly StrategyEventRow[];
  status: OrderLogFeedStatus;
  retry: () => void;
  /** 3초 강조 중인 푸시 줄 키(`strategyEventKey`). */
  newKeys: ReadonlySet<string>;
  /** 마지막 푸시 batch 의 그날 행(오늘일 때만) — 배지 카운트 원천. */
  latestPush: { seq: number; rows: StrategyEventRow[] } | null;
  /** 보고 있는 KST 날짜 `YYYY-MM-DD`. */
  date: string;
  isToday: boolean;
}

const EMPTY_KEYS: ReadonlySet<string> = new Set();

/** Provider 밖(작업대 밖 렌더 · 단위 테스트) 안전 기본값 — 빈 준비 상태. */
export const EMPTY_ORDER_LOG_FEED: OrderLogFeed = Object.freeze({
  rows: [],
  status: 'ready' as const,
  retry: () => {},
  newKeys: EMPTY_KEYS,
  latestPush: null,
  date: '',
  isToday: true,
});

export function useOrderLogFeed({ date: dateOpt }: { date?: string } = {}): OrderLogFeed {
  const { strategyEvents, strategyEventsBatch, status: relayStatus } = useRelayContext();
  const today = kstDateIso();
  const date = dateOpt ?? today;
  const isToday = date === today;

  const [restored, setRestored] = useState<{ date: string; rows: StrategyEventRow[] } | null>(null);
  const [status, setStatus] = useState<OrderLogFeedStatus>('loading');
  /** 마지막 요청 번호 — 늦게 도착한 옛 날짜 응답을 버린다. */
  const reqRef = useRef(0);
  /** 이 날짜로 복원이 성공한 적이 있는가 — 새 줄 강조의 기준선(④). */
  const restoredOkRef = useRef(false);

  const load = useCallback(async () => {
    const req = ++reqRef.current;
    setStatus('loading');
    try {
      const rows = await fetchStrategyEvents(isToday ? undefined : date);
      if (req !== reqRef.current) return;
      setRestored({ date, rows: [...rows].sort(compareStrategyEventAsc) });
      restoredOkRef.current = true;
      setStatus('ready');
    } catch {
      if (req !== reqRef.current) return;
      setStatus('error');
    }
  }, [date, isToday]);

  useEffect(() => {
    restoredOkRef.current = false;
    void load();
  }, [load]);

  // ② relay 재인증(ready 재진입) — 오늘만.
  const wasReadyRef = useRef(relayStatus === 'ready');
  const prevRelayRef = useRef(relayStatus);
  useEffect(() => {
    const prev = prevRelayRef.current;
    prevRelayRef.current = relayStatus;
    if (relayStatus !== 'ready' || prev === 'ready') return;
    if (!wasReadyRef.current) {
      wasReadyRef.current = true;
      return;
    }
    if (isToday) void load();
  }, [relayStatus, isToday, load]);

  const restoredRows = restored !== null && restored.date === date ? restored.rows : null;

  const rows = useMemo(
    () => (isToday ? mergeStrategyEvents(restoredRows ?? [], strategyEvents, date) : (restoredRows ?? [])),
    [isToday, restoredRows, strategyEvents, date],
  );

  // ④ 새 줄 강조 · 배지 원천. 마운트 시점에 이미 있던 batch 는 새 것이 아니다.
  const mountBatchSeqRef = useRef(strategyEventsBatch.seq);
  const latestPush = useMemo(() => {
    if (!isToday || strategyEventsBatch.seq === mountBatchSeqRef.current) return null;
    return {
      seq: strategyEventsBatch.seq,
      rows: strategyEventsBatch.rows.filter((r) => r.tradeDate === date),
    };
  }, [isToday, strategyEventsBatch, date]);

  const [newKeys, setNewKeys] = useState<ReadonlySet<string>>(EMPTY_KEYS);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const lastBatchSeqRef = useRef(strategyEventsBatch.seq);
  useEffect(() => {
    if (latestPush === null || latestPush.seq === lastBatchSeqRef.current) return;
    lastBatchSeqRef.current = latestPush.seq;
    if (!restoredOkRef.current) return;
    const restoredKeys = new Set((restoredRows ?? []).map(strategyEventKey));
    const keys = latestPush.rows.map(strategyEventKey).filter((k) => !restoredKeys.has(k));
    if (keys.length === 0) return;
    setNewKeys((prev) => {
      const next = new Set(prev);
      for (const k of keys) next.add(k);
      return next;
    });
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      setNewKeys((prev) => {
        const next = new Set(prev);
        for (const k of keys) next.delete(k);
        return next.size === 0 ? EMPTY_KEYS : next;
      });
    }, NEW_LINE_HIGHLIGHT_MS);
    timersRef.current.add(timer);
  }, [latestPush, restoredRows]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const retry = useCallback(() => {
    void load();
  }, [load]);

  return useMemo(
    () => ({ rows, status, retry, newKeys: isToday ? newKeys : EMPTY_KEYS, latestPush, date, isToday }),
    [rows, status, retry, newKeys, latestPush, date, isToday],
  );
}

/**
 * 새 로그 배지 수 (R2 · 결정 4-B) — `visible` 이 false 인 동안 도착한 **범위 안** 푸시 줄 수를 센다.
 * 필터줄 선택은 적용하지 않는다(필터는 보는 방식, 배지는 새로 쌓인 것). 보이면 0 · 피드가 없으면 0.
 */
export function useUnseenOrderLogCount(
  feed: OrderLogFeed | null,
  scope: OrderLogScope,
  visible: boolean,
): number {
  const [count, setCount] = useState(0);
  const latestPush = feed?.latestPush ?? null;
  const seenSeqRef = useRef(latestPush?.seq ?? 0);
  const { accountNo, isin, exchange } = scope;

  useEffect(() => {
    if (latestPush === null || latestPush.seq === seenSeqRef.current) return;
    seenSeqRef.current = latestPush.seq;
    if (visible) return;
    const n = latestPush.rows.filter((r) => inScope(r, { accountNo, isin, exchange })).length;
    if (n > 0) setCount((c) => c + n);
  }, [latestPush, visible, accountNo, isin, exchange]);

  useEffect(() => {
    if (visible) setCount(0);
  }, [visible]);

  return visible ? 0 : count;
}
