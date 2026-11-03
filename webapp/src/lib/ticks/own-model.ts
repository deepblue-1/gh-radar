/**
 * 틱 뷰어 「우리 체결」 모델 (Phase 38 D-02 · D-04 · D-15) — 세션 A3 열과 `GET /api/ticks/own` 응답을 shared
 * `matchOwnFills` 로 짝지어 전문 목록 · 차트 · 카드가 같이 읽는 모델을 만든다.
 *
 * ① 세션과 따로 만든다 — 세션(격자 · 증분)과 저널 도착은 주기가 다르므로 `TickSession` 안에 넣지 않고 뷰어가
 *   `useMemo([session, own])` 로 묶는다(RESEARCH Anti-Pattern).
 * ② 체결 순서 = (gw_time_ms, gateway, seq) — RPC 정렬과 같은 키로 한 번 더 정렬한다(방어 · 남은 수량 차감이 순서 의존 —
 *   Pitfall 2). 정렬은 안정이라 같은 키는 입력 순서를 지킨다.
 * ③ 표시: A3 rec 하나에 붙은 우리 체결 합 `our` 와 그 A3 수량 `total`(부분 체결이면 「n/m」) · 하나라도 추정이면 est.
 *   계좌 · 주문번호는 모델에 있지만 행에 그리지 않는다(D-02).
 */

import { matchOwnFills, type TickOwnResponse } from '@gh-radar/shared';

import type { TickSession } from './tick-session';

/** 우리 체결 한 건 — 짝 결과 포함(`a3j` −1 = 짝 전문 없음). */
export interface OwnFillView {
  /** 모델 안 순번(정렬 뒤 색인). */
  id: number;
  gateway: string;
  accountNo: string;
  orderNo: string;
  side: string;
  px: number;
  qty: number;
  gwMs: number;
  /** A3 열 색인 · 못 찾으면 −1. */
  a3j: number;
  /** 짝 A3 의 레코드 색인 · 못 찾으면 −1. */
  rec: number;
  est: boolean;
  candidates: number;
  /** gw − A3 시각(ms) · 못 찾으면 NaN. */
  dtMs: number;
  /** 짝 A3 수량(「n/m」 의 m) · 못 찾으면 0. */
  total: number;
}

export interface OwnModel {
  /** 켜진 서버 키(sort_order 순 — 응답 그대로). */
  servers: string[];
  fills: OwnFillView[];
  /** A3 rec → 그 rec 에 붙은 우리 체결 id 들(오름차순). */
  fillsOfRec: Map<number, number[]>;
}

export function buildOwnModel(session: TickSession, own: TickOwnResponse): OwnModel {
  const { index, a3 } = session;
  const sorted = own.fills
    .slice()
    .sort((x, y) =>
      x.gw_time_ms !== y.gw_time_ms
        ? x.gw_time_ms - y.gw_time_ms
        : x.gateway !== y.gateway
          ? x.gateway < y.gateway
            ? -1
            : 1
          : x.seq - y.seq,
    );
  const matches = matchOwnFills(
    index,
    a3,
    sorted.map((f) => ({ gwMs: f.gw_time_ms, px: f.exec_price, qty: f.exec_qty })),
  );

  const fills: OwnFillView[] = new Array(sorted.length);
  const fillsOfRec = new Map<number, number[]>();
  for (let i = 0; i < sorted.length; i++) {
    const f = sorted[i]!;
    const m = matches[i]!;
    const rec = m.a3j >= 0 ? a3.rec[m.a3j]! : -1;
    fills[i] = {
      id: i,
      gateway: f.gateway,
      accountNo: f.account_no,
      orderNo: f.order_no,
      side: f.side,
      px: f.exec_price,
      qty: f.exec_qty,
      gwMs: f.gw_time_ms,
      a3j: m.a3j,
      rec,
      est: m.est,
      candidates: m.candidates,
      dtMs: m.dtMs,
      total: m.a3j >= 0 ? a3.qty[m.a3j]! : 0,
    };
    if (rec >= 0) {
      const ids = fillsOfRec.get(rec);
      if (ids) ids.push(i);
      else fillsOfRec.set(rec, [i]);
    }
  }
  return { servers: own.servers, fills, fillsOfRec };
}

/** 전문 목록 칩 — 그 A3 rec 에 붙은 우리 체결 합 · 그 A3 수량 · 하나라도 추정이면 est. 없으면 null. */
export function ownChipOf(model: OwnModel, rec: number): { our: number; total: number; est: boolean } | null {
  const ids = model.fillsOfRec.get(rec);
  if (!ids || ids.length === 0) return null;
  let our = 0;
  let est = false;
  for (const id of ids) {
    const f = model.fills[id]!;
    our += f.qty;
    if (f.est) est = true;
  }
  return { our, total: model.fills[ids[0]!]!.total, est };
}
