'use client';

/**
 * useOrderLogFeed — 주문로그 하루치 피드 (Phase 25-07 · D-07 · R10). 작업대 공용 패널 · 카드 탭 · 창 분리가 쓴다.
 *
 * ① 원천 둘: REST 하루치 복원(`fetchStrategyEvents` — `GET /api/strategy-events`) + relay 스토어 `strategyEvents`
 *   (`journal.events` 푸시 누적). 병합 · 오늘 경계는 순수 함수 `mergeStrategyEvents` 하나다.
 *
 * ② 복원은 **날짜별 1회** + `retry()` + relay 인증(ready **로 전이**)마다 1회 — 폴링은 없다.
 *   마운트 때 이미 ready 였으면 전이가 아니라 마운트 조회만 한다(조회가 인증 뒤라 빈틈이 없다). 마운트 때 ready 가
 *   아니었으면(창 분리처럼 새 wss 를 여는 경우) **첫** ready 에서도 한 번 더 조회한다 (WR-05) — 마운트 조회와 relay
 *   인증은 병렬이라, 조회가 DB 를 읽은 뒤 · 인증 전에 적재된 이벤트는 REST 에도 없고 `journal.events` 로도 오지 않는다
 *   (relay 는 삽입 시점에 연결된 사용자에게만 밀고 재생하지 않는다). 조회가 아직 진행 중이어도 그 DB 읽기 시점이 인증
 *   전일 수 있으므로 새로 조회한다(`reqRef` 가 옛 응답을 버린다). 겹친 줄은 병합이 키로 흡수한다. 오늘 주문 카드 ⑦ 은
 *   첫 ready 를 건너뛰지만 `journalState` 전이 재조회라는 보완 경로가 따로 있다 — 주문로그에는 없다. ready 가 유지되는
 *   동안의 리렌더는 전이가 아니다. 과거일은 푸시가 없어 재조회하지 않는다.
 *
 * ③ 과거일(창 분리 날짜 이동)은 그 날짜 조회 결과만 보인다 — 푸시 무시 · newKeys 없음 · latestPush null.
 *
 * ④ 새 줄 강조(R10) · 배지 원천 — 스토어 `strategyEvents` 에 **새로 나타난 키**를 직전 스냅샷과 비교해 가려낸다
 *   (`latestPush`). 스토어의 `strategyEventsBatch` 는 마지막 프레임 삽입분 하나만 들고 있어, 프레임 둘이 한 렌더로
 *   합쳐지면(연속 푸시) 앞 프레임 줄을 놓친다 — 키 집합 비교는 놓치지 않는다(상한 5,000 · O(n)). 마운트 시점에 이미
 *   있던 줄은 새 줄이 아니다. 복원이 **성공한 뒤** 도착한 그날 줄 키를 `newKeys` 에 넣고 `NEW_LINE_HIGHLIGHT_MS`(3초)
 *   뒤 뺀다. 복원 줄 · 복원과 겹친 푸시 줄은 강조하지 않는다. 언마운트 시 타이머 정리.
 *
 * ⑤ 실패는 `status: "error"` 로 수렴한다(사유를 풀어 쓰지 않는다 — 할 일은 「다시 시도」 하나). 복원이 실패해도
 *   푸시로 온 줄은 rows 에 그대로 있다.
 *
 * ⑥ Phase 28 D-18 · D-07 — 「상한가 특징」 체크(`showLimitFeature`). kind 15(분당 · 키당 1행)는 기본 조회에서 빠지고
 *   (서버 기본 = kind 15 제외) relay 스토어도 별도 목록(`limitFeatureEvents`)이라, 꺼져 있으면 이 피드의 rows · latestPush
 *   어디에도 없다. 켜면 그 날짜의 `?lf=1` 을 **날짜별 1회** 더 불러 kind 15 행만 보관하고(같은 날짜 재켜기는 캐시),
 *   오늘이면 라이브 `limitFeatureEvents` 와 합친다. 끄면 rows 에서 뺀다. relay ready 전이 때 켜져 있으면 함께 재조회하고,
 *   꺼져 있으면 캐시를 버린다(다음에 켤 때 단절 구간까지 새로 받는다). 배지 · 새 줄 원천(latestPush)에는 켜진 동안 도착한
 *   kind 15 만 싣는다 — 꺼짐이면 분마다 오르는 소음 금지. 켜는 순간 이미 스토어에 있던 줄은 새 줄이 아니다(기준선 유지).
 *   체크 값은 `writePanelsPref({ orderLogLimitFeature })` 로 기억한다 — 세 표면이 같은 출처(localStorage)를 읽는다.
 *
 * `useUnseenOrderLogCount` — 새 로그 배지(R2): 탭이 가려진 동안 도착한 **범위 안** 푸시 줄 수(필터 선택 미적용).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STRATEGY_EVENT_KIND, compareStrategyEventAsc, kstDateIso, strategyEventKey } from '@gh-radar/shared';
import type { StrategyEventRow } from '@gh-radar/shared';

import { useRelayContext } from './relay-provider';
import { fetchStrategyEvents } from './strategy-events-api';
import { readPanelsPref, writePanelsPref } from './trading-layout';
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
  /** 마지막으로 스토어에 새로 나타난 그날 행(오늘일 때만 · 스냅샷 비교 ④) — 배지 카운트 원천. */
  latestPush: { seq: number; rows: StrategyEventRow[] } | null;
  /** 보고 있는 KST 날짜 `YYYY-MM-DD`. */
  date: string;
  isToday: boolean;
  /** 「상한가 특징」 체크(⑥) — 켜져 있을 때만 rows · latestPush 에 kind 15 가 있다. */
  showLimitFeature: boolean;
  setShowLimitFeature: (next: boolean) => void;
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
  showLimitFeature: false,
  setShowLimitFeature: () => {},
});

const isLimitFeature = (row: StrategyEventRow): boolean => row.kind === STRATEGY_EVENT_KIND.LimitFeature;

/** 스토어 목록에서 직전 키 집합에 없던 행을 뽑고 기준선을 갱신한다(④). 첫 호출(기준선 없음)은 아무것도 새 줄이 아니다. */
function takeNewRows(
  rows: readonly StrategyEventRow[],
  seenRef: { current: ReadonlySet<string> | null },
): StrategyEventRow[] {
  const seen = seenRef.current;
  const next = new Set<string>();
  const added: StrategyEventRow[] = [];
  for (const row of rows) {
    const key = strategyEventKey(row);
    next.add(key);
    if (seen !== null && !seen.has(key)) added.push(row);
  }
  seenRef.current = next;
  return added;
}

export function useOrderLogFeed({ date: dateOpt }: { date?: string } = {}): OrderLogFeed {
  const { strategyEvents, limitFeatureEvents, status: relayStatus } = useRelayContext();
  const today = kstDateIso();
  const date = dateOpt ?? today;
  const isToday = date === today;

  const [restored, setRestored] = useState<{ date: string; rows: StrategyEventRow[] } | null>(null);
  const [status, setStatus] = useState<OrderLogFeedStatus>('loading');
  /** 마지막 요청 번호 — 늦게 도착한 옛 날짜 응답을 버린다. */
  const reqRef = useRef(0);
  /** 이 날짜로 복원이 성공한 적이 있는가 — 새 줄 강조의 기준선(④). */
  const restoredOkRef = useRef(false);

  // ⑥ 「상한가 특징」 체크 — 초기값은 pref(없으면 꺼짐).
  const [showLimitFeature, setShowLimitFeatureState] = useState(() => readPanelsPref().orderLogLimitFeature === true);
  const setShowLimitFeature = useCallback((next: boolean) => {
    setShowLimitFeatureState(next);
    writePanelsPref({ orderLogLimitFeature: next });
  }, []);
  const [restoredLf, setRestoredLf] = useState<{ date: string; rows: StrategyEventRow[] } | null>(null);
  const [lfStatus, setLfStatus] = useState<OrderLogFeedStatus>('ready');
  const lfReqRef = useRef(0);

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

  // ⑥ kind 15 조회 — `?lf=1` 응답에서 kind 15 만 보관한다(주문 행은 기본 복원 한 벌이 정본).
  const loadLf = useCallback(async () => {
    const req = ++lfReqRef.current;
    setLfStatus('loading');
    try {
      const rows = await fetchStrategyEvents(isToday ? undefined : date, { limitFeature: true });
      if (req !== lfReqRef.current) return;
      setRestoredLf({ date, rows: rows.filter(isLimitFeature).sort(compareStrategyEventAsc) });
      setLfStatus('ready');
    } catch {
      if (req !== lfReqRef.current) return;
      setLfStatus('error');
    }
  }, [date, isToday]);

  const lfCached = restoredLf !== null && restoredLf.date === date;
  // 켜짐 · 그 날짜 캐시 없음 → 1회. 실패 뒤에는 여기서 다시 부르지 않는다(「다시 시도」 = retry).
  useEffect(() => {
    if (!showLimitFeature || lfCached) return;
    void loadLf();
  }, [showLimitFeature, lfCached, loadLf]);

  // ② relay 인증(ready 로 전이) — 오늘만. 마운트 뒤 첫 ready 도 포함한다(WR-05 — 복원 ~ 인증 사이 누락 메우기).
  const prevRelayRef = useRef(relayStatus);
  useEffect(() => {
    const prev = prevRelayRef.current;
    prevRelayRef.current = relayStatus;
    if (relayStatus !== 'ready' || prev === 'ready') return;
    if (!isToday) return;
    void load();
    // ⑥ 켜져 있으면 kind 15 도 함께 재조회, 꺼져 있으면 캐시를 버린다(다음에 켤 때 단절 구간까지 새로 받는다).
    if (showLimitFeature) void loadLf();
    else setRestoredLf(null);
  }, [relayStatus, isToday, load, showLimitFeature, loadLf]);

  const restoredRows = restored !== null && restored.date === date ? restored.rows : null;
  const restoredLfRows = showLimitFeature && lfCached ? restoredLf.rows : null;

  const rows = useMemo(() => {
    if (!showLimitFeature) {
      return isToday ? mergeStrategyEvents(restoredRows ?? [], strategyEvents, date) : (restoredRows ?? []);
    }
    // ⑥ 켜짐 — 복원 둘(주문 · kind 15) ∪ (오늘이면) 라이브 둘. 키 · 정렬은 mergeStrategyEvents 하나다.
    const restoredAll = [...(restoredRows ?? []), ...(restoredLfRows ?? [])];
    return isToday
      ? mergeStrategyEvents(restoredAll, [...strategyEvents, ...limitFeatureEvents], date)
      : mergeStrategyEvents(restoredAll, [], date);
  }, [showLimitFeature, isToday, restoredRows, restoredLfRows, strategyEvents, limitFeatureEvents, date]);

  // ④ 새로 나타난 스토어 줄 — 직전 키 집합과 비교(마운트 시점 줄은 기준선). 두 목록은 기준선을 따로 둔다 — 바뀐 목록만
  // 훑는다(kind 15 는 분마다 바뀌어도 주문 목록 5,000 을 다시 훑지 않는다). kind 15 새 줄은 켜진 동안만 싣는다(⑥).
  const seenKeysRef = useRef<ReadonlySet<string> | null>(null);
  const seenLfKeysRef = useRef<ReadonlySet<string> | null>(null);
  const lastEventsRef = useRef<readonly StrategyEventRow[] | null>(null);
  const lastLfEventsRef = useRef<readonly StrategyEventRow[] | null>(null);
  const pushSeqRef = useRef(0);
  const [latestPush, setLatestPush] = useState<{ seq: number; rows: StrategyEventRow[] } | null>(null);
  useEffect(() => {
    const added: StrategyEventRow[] = [];
    if (lastEventsRef.current !== strategyEvents) {
      lastEventsRef.current = strategyEvents;
      added.push(...takeNewRows(strategyEvents, seenKeysRef));
    }
    if (lastLfEventsRef.current !== limitFeatureEvents) {
      lastLfEventsRef.current = limitFeatureEvents;
      const addedLf = takeNewRows(limitFeatureEvents, seenLfKeysRef);
      if (showLimitFeature) added.push(...addedLf);
    }
    if (!isToday) return;
    const todays = added.filter((r) => r.tradeDate === date);
    if (todays.length === 0) return;
    pushSeqRef.current += 1;
    setLatestPush({ seq: pushSeqRef.current, rows: todays });
  }, [strategyEvents, limitFeatureEvents, showLimitFeature, isToday, date]);

  const [newKeys, setNewKeys] = useState<ReadonlySet<string>>(EMPTY_KEYS);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const lastPushSeqRef = useRef(0);
  useEffect(() => {
    if (latestPush === null || latestPush.seq === lastPushSeqRef.current) return;
    lastPushSeqRef.current = latestPush.seq;
    if (!restoredOkRef.current) return;
    const restoredKeys = new Set([...(restoredRows ?? []), ...(restoredLfRows ?? [])].map(strategyEventKey));
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
  }, [latestPush, restoredRows, restoredLfRows]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const retry = useCallback(() => {
    void load();
    if (showLimitFeature) void loadLf();
  }, [load, loadLf, showLimitFeature]);

  // ⑥ 켜짐이면 kind 15 조회 상태를 합친다 — 실패가 이기고, 캐시가 아직 없으면 로딩(기존 로딩 줄은 줄 0 일 때만 보인다).
  const effectiveStatus: OrderLogFeedStatus = !showLimitFeature
    ? status
    : status === 'error' || lfStatus === 'error'
      ? 'error'
      : status === 'loading' || !lfCached
        ? 'loading'
        : 'ready';

  return useMemo(
    () => ({
      rows,
      status: effectiveStatus,
      retry,
      newKeys: isToday ? newKeys : EMPTY_KEYS,
      latestPush: isToday ? latestPush : null,
      date,
      isToday,
      showLimitFeature,
      setShowLimitFeature,
    }),
    [rows, effectiveStatus, retry, newKeys, latestPush, date, isToday, showLimitFeature, setShowLimitFeature],
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
