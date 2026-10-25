'use client';

/**
 * useAccumSignals — 작업대 「매집」 패널 원천 (quick-261018-rfy · D-02).
 *
 * ① 복원 ∪ 라이브 — 마운트 1회 + relay `ready` 전이마다 `fetchAccumSignals()`(오늘 · 서버가 (gateway, isin) 별 최신 1행 + 그날 최신 청산 행 — 20261024230000)를 받고,
 *   relay 리듀서의 kind 16 별도 목록(`accumSignalEvents` · 그날 행만)과 `strategyEventKey` 로 합친다
 *   (`mergeStrategyEvents` — 주문로그 피드와 같은 병합). 그 합집합에서 isin 별 최신 행(gwTimeMs desc → gateway asc → seq desc ·
 *   `latestAccumByIsin`)을 골라 `accumSignalOf` 로 이름을 푼다 — 라이브의 늦은 행이 복원 행을 이긴다.
 *   목록 규칙(accum-list ②')은 여기서 한 번 — 고른 게이트웨이 행(`mine`)에서 `closedRowsOf` 로 그날 청산 행을 구해
 *   `isListedAccum` 으로 거르고, 실은 매집 종료(4)는 그 청산 행의 값 · 시각에 종료 사유 4 만 덮는다. 패널은 거르지 않는다.
 *   폴링 · 타이머가 없다(`use-order-log-feed.ts` ⑥/② 의 축소판).
 *
 * ② `filled` — 첫 요청이 끝났는가(성공 · 실패 모두 true). 패널은 이것으로 「첫 채움 = 무강조」 경계를 잡는다.
 *   실패해도 라이브 행은 보인다(복원이 없을 뿐).
 *
 * ③ 요청 번호 가드 — 늦게 도착한 옛 응답이 새 응답을 덮지 않는다(`reqRef`).
 *
 * ④ 서버 기준(2026-10-19 사용자 결정) — KB120 · KYOBO119 는 등록 종목 집합이 다르다(「우리 체결 제외」 가 서버마다 달라 임계 통과가
 *   갈린다). gh-trade 클라는 접속한 서버 하나만 보이므로 웹도 **한 게이트웨이**만 보인다: `gateway` = 작업대에서 고른 계좌의
 *   서버 키(`RelayAccount.serverKey`). null(계좌 미정 · serverKey 없음)이면 행이 있는 게이트웨이 중 키 사전순 첫 것(KB120 < KYOBO119).
 *   REST(20261019160000)는 (gateway, isin) 별 최신 행을 다 주고 여기서 거른다 — 계좌를 바꾸면 재조회 없이 목록이 바뀐다.
 *   고른 서버에 오늘 행이 없으면 빈 목록이다(그 서버 클라도 비어 있다).
 *
 * ⑤ 전날 순매수(quick-261026-01h · 스케치 018 B) — 이월 행의 「전날 ±x.x억」 원천은 기존 매집감지 보고서 목록
 *   `fetchAccumReport()`(d 없음 = 최신 · KYOBO119 판정)다. **오늘 1회**(마운트 + KST 날짜가 바뀔 때)만 부르고 relay ready
 *   전이로는 다시 부르지 않는다 — 보고서는 하루 한 번(20:30) 적재라 장중에 바뀌지 않는다. 값 계산은 `prevDayNetOf`(accum-list ⑥).
 *   실패(403 DMA 미매핑 · 네트워크)는 복원 실패와 같은 규약으로 조용히 비운다 — 전날 없이 패널은 그대로 보인다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  STRATEGY_EVENT_KIND,
  accumSignalOf,
  kstDateIso,
  type AccumSignal,
  type StrategyEventRow,
} from '@gh-radar/shared';

import { fetchAccumReport } from './accum-api';
import { fetchAccumSignals } from './accum-signals-api';
import { closedRowsOf, isListedAccum, latestAccumByIsin, prevDayNetOf } from './accum-list';
import { mergeStrategyEvents } from './order-log-feed';
import { useRelayContext } from './relay-provider';

export interface AccumSignalsState {
  /** 목록에 싣는 isin 별 현재 상태(accum-list ②' 적용 · 정렬 전 — 표시 순서는 패널의 `sortAccum`). */
  signals: AccumSignal[];
  /** 첫 복원 요청이 끝났는가(성공 · 실패). */
  filled: boolean;
  /** 지금 보이는 목록의 게이트웨이(④) — 고른 서버, 또는 폴백. 행이 없으면 null. */
  gateway: string | null;
  /** 이월 행 전날 순매수(⑤) — isin → 원. 오늘 받은 것만 · 모르면 빈 Map. */
  prevNet: ReadonlyMap<string, number>;
}

/** 전날 값이 없을 때 — 매 렌더 같은 참조(패널 memo 안정). */
const NO_PREV: ReadonlyMap<string, number> = new Map();

/** ④ 표시 게이트웨이 — 고른 서버가 있으면 그것, 없으면 행이 있는 게이트웨이 중 사전순 첫 것. */
export function displayGatewayOf(rows: readonly Pick<StrategyEventRow, 'gateway'>[], selected: string | null): string | null {
  if (selected !== null) return selected;
  let first: string | null = null;
  for (const r of rows) if (first === null || r.gateway < first) first = r.gateway;
  return first;
}

export function useAccumSignals(gateway: string | null = null): AccumSignalsState {
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

  // ⑤ 전날 순매수 — 오늘 1회(날짜가 바뀌면 다시). 별도 요청 번호로 늦은 응답을 버린다.
  const [prev, setPrev] = useState<{ date: string; map: ReadonlyMap<string, number> } | null>(null);
  const prevReqRef = useRef(0);
  useEffect(() => {
    const req = ++prevReqRef.current;
    fetchAccumReport()
      .then((resp) => {
        if (req !== prevReqRef.current) return;
        setPrev({ date: today, map: prevDayNetOf(resp, today.replace(/-/g, '')) });
      })
      .catch(() => {
        if (req !== prevReqRef.current) return;
        // 실패 — 전날 없이 보인다(복원 실패와 같은 규약).
        setPrev({ date: today, map: NO_PREV });
      });
  }, [today]);
  const prevNet = prev !== null && prev.date === today ? prev.map : NO_PREV;

  const restoredRows = restored !== null && restored.date === today ? restored.rows : null;

  const { signals, shown } = useMemo(() => {
    const merged = mergeStrategyEvents(restoredRows ?? [], accumSignalEvents, today);
    const accumOnly = merged.filter((r) => r.kind === STRATEGY_EVENT_KIND.AccumSignal);
    // ④ 한 게이트웨이만 — 자르기(복원 묶음)도 그 게이트웨이 행 안에서 돈다.
    const shownGateway = displayGatewayOf(accumOnly, gateway);
    const mine = shownGateway === null ? [] : accumOnly.filter((r) => r.gateway === shownGateway);
    // ②' 목록 규칙 — 고른 게이트웨이 행에서만 판정(다른 서버의 청산은 세지 않는다).
    const closed = closedRowsOf(mine);
    const out: AccumSignal[] = [];
    for (const row of latestAccumByIsin(mine)) {
      const sig = accumSignalOf(row);
      if (sig === null || !isListedAccum(sig, closed)) continue;
      // 매집 종료 — 값 · 「갱신」 시각은 그날 최신 청산 행, 종료 사유만 4(WinForms 동형).
      const closedRow = sig.state === 3 && sig.endReason === 4 ? closed.get(sig.isin) : undefined;
      const closedSig = closedRow === undefined ? null : accumSignalOf(closedRow);
      out.push(closedSig === null ? sig : { ...closedSig, endReason: 4 });
    }
    return { signals: out, shown: shownGateway };
  }, [restoredRows, accumSignalEvents, today, gateway]);

  return { signals, filled, gateway: shown, prevNet };
}
