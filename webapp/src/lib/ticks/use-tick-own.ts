'use client';

/**
 * useTickOwn — 틱 뷰어 「우리 주문 · 체결」 조회 (Phase 38 D-14 · SC-4).
 *
 * ① 원천: server `GET /api/ticks/own?isin=&d=&ex=` 한 번(server 는 RPC `tick_own_for_user` 왕복 1회). 가시성(가시 계좌 ·
 *   어드민 전 계좌)과 켜진 서버 거름은 RPC 안이다 — 여기서 계좌를 고르는 입력은 보내지 않는다.
 * ② 호출 시점: (isin, d, ex) 가 바뀔 때 1회 + `refreshKey` 가 바뀔 때 1회(당일 「최신 받기」 같은 사용자 클릭).
 *   **자동 타이머 · 폴링 없음** — 호출량은 열기 · 클릭에만 비례한다(CLAUDE.md 공식 API 기준 3).
 * ③ 늦게 도착한 이전 요청의 응답은 버린다(effect 정리 때 그 요청 세대를 끊는다).
 * ④ 실패(401 · 403 · 404 · 5xx · 네트워크)는 우리 층만 없앤다 — `own` null · status 'error' · 콘솔 경고 한 줄(상태 코드 포함).
 *   화면 오류 카드는 없다(뷰어는 지금과 같다 · RESEARCH Pitfall 5 — e2e 목이 모르는 경로는 404 다).
 * ⑤ 같은 종목에서 다시 받는 동안(refreshKey 변경)은 직전 결과를 그대로 보여 준다 · 종목이 바뀌면 바로 비운다.
 */

import { useEffect, useState } from 'react';

import type { TickExchange, TickOwnResponse } from '@gh-radar/shared';

import { ApiClientError } from '../api';
import { fetchTickOwn } from './tick-api';

export type TickOwnStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface TickOwnState {
  own: TickOwnResponse | null;
  status: TickOwnStatus;
}

interface Settled {
  /** 종목 키 `${d}|${ex}|${isin}`. */
  key: string;
  /** 요청 키 = 종목 키 + refreshKey. */
  reqKey: string;
  own: TickOwnResponse | null;
  ok: boolean;
}

function warnOf(e: unknown): void {
  if (e instanceof ApiClientError) console.warn('[tick-own]', e.status, e.code);
  else console.warn('[tick-own]', 0, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
}

export function useTickOwn(
  q: { isin: string | null; d: string | null; ex: TickExchange },
  refreshKey = 0,
): TickOwnState {
  const { isin, d, ex } = q;
  const key = isin && d ? `${d}|${ex}|${isin}` : null;
  const reqKey = key === null ? null : `${key}#${refreshKey}`;
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!isin || !d) return;
    const k = `${d}|${ex}|${isin}`;
    const rk = `${k}#${refreshKey}`;
    let current = true; // 이 요청 세대 — 정리되면 늦게 온 응답을 버린다
    // 동기 throw 도 같은 실패 경로로(뷰어를 깨지 않는다) — Promise 안에서 부른다
    Promise.resolve()
      .then(() => fetchTickOwn({ isin, d, ex }))
      .then(
        (own) => {
          if (!current) return;
          if (!own || !Array.isArray(own.fills) || !Array.isArray(own.servers)) {
            console.warn('[tick-own]', 0, 'shape');
            setSettled({ key: k, reqKey: rk, own: null, ok: false });
            return;
          }
          setSettled({ key: k, reqKey: rk, own, ok: true });
        },
        (e: unknown) => {
          if (!current) return;
          warnOf(e);
          setSettled({ key: k, reqKey: rk, own: null, ok: false });
        },
      );
    return () => {
      current = false;
    };
  }, [isin, d, ex, refreshKey]);

  if (key === null) return { own: null, status: 'idle' };
  if (settled !== null && settled.reqKey === reqKey) {
    return { own: settled.own, status: settled.ok ? 'ready' : 'error' };
  }
  // 같은 종목을 다시 받는 중이면 직전 결과를 유지 · 다른 종목이면 비운다
  return { own: settled !== null && settled.key === key ? settled.own : null, status: 'loading' };
}
