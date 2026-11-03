/**
 * 틱 뷰어 팀 모델 (Phase 37 D-10 · D-12 · D-13 · 37-14) — 세션의 주문 판정(team 표식)을 팀 체결 · 손익 접두 · 당일 계단 ·
 * 10분 막대 · 주문 원으로 세션마다 한 번 묶는다(`TickSession.team` — 세션 생성 때). 계산은 shared 골든 함수 그대로(`teamFillsOf` · `buildPnlPrefix` · `pnlAt`).
 *
 * ① 팀 체결 — 범위 입력(KRX = `scopeTrades(…, 'accum')` · NXT = 그 거래소 A3 전부) 중 세션이 팀으로 판정한 주문의 조각 ·
 *   bs '1'/'2' 만(단일가 제외 · 상한가 가격 포함 · 우리 체결 포함 — D-12). 순서 = 체결 시각(shared `teamFillsOf`).
 * ② 선택 틱 손익(D-10) — 커서 이하(거래소순) 마지막 A3 j 까지 본 체결 시각의 최댓값 `runMaxNs[j]` 를 자르는 시각으로,
 *   `fillsUpTo` 이진 탐색 → `pnlAt(prefix, k, lastPx)` · lastPx = A3 j 체결가. 마지막 틱이면 k = 전체 → `teamPnlOf` 와 같다.
 * ③ 차트 — 당일 계단 · 주문 원 · 10분 막대는 **수신 시각**(커서 · 가격 선과 같은 축). 주문 시각 = 마지막 조각(거래소순 끝 자리)
 *   수신 시각 · 계단은 그 순서로 매수 +금액 · 매도 −금액 누적(0 에서 시작).
 * ④ NXT(D-13) — 세션의 NXT 런 팀(한 가격 2조각 이상)으로 같은 레이어. 같은 ISIN KRX 와 합산하지 않는다.
 */

import {
  buildPnlPrefix,
  fillsUpTo,
  pnlAt,
  scopeTrades,
  teamFillsOf,
  type PnlPrefix,
  type TeamFill,
  type TeamPnl,
} from '@gh-radar/shared';

import { msOfNs, tickBoundsOf, TEAM_BUCKETS } from './tick-chart';
import type { TickSession, ViewOrder, ViewScope } from './tick-session';

/** 팀 주문 하나 — 차트 원 · 계단 입력(수신 시각 · 마지막 조각). */
export interface TeamOrderPoint {
  order: ViewOrder;
  /** 마지막 조각 rec(거래소순 끝 자리) — 원 클릭 점프 대상. */
  lastRec: number;
  /** 마지막 조각 수신 ms. */
  tMs: number;
  /** 마지막 조각 체결가. */
  px: number;
  val: number;
  qty: number;
  side: 'B' | 'S';
}

export interface TeamModel {
  scope: ViewScope;
  /** 팀 체결(체결 시각 순 · shared teamFillsOf). */
  fills: TeamFill[];
  /** 체결 k 의 수신 ms(체결 순서로 단조 증가하게 앞 값과 max — 평단 계단 x). */
  fillMs: Float64Array;
  prefix: PnlPrefix;
  /** A3 열 j → 거래소순으로 j 까지 본 체결 시각 최댓값(ns · 못 읽은 시각은 수신 시각). 선택 틱 자르기 시각. */
  runMaxNs: BigInt64Array;
  /** 팀 주문(수신 ms 오름차순). */
  teamOrders: TeamOrderPoint[];
  /** 당일 팀 순매수 계단 — 주문마다 하나(teamOrders 순서) · net = 금액 누적 · qty = 수량 누적. */
  dayStairs: { tMs: number; net: number; qty: number }[];
  /** 08:00 ~ 20:00 10분 72칸 팀 매수 · 매도 금액(체결 수신 시각 기준). */
  buckets: { buy: Float64Array; sell: Float64Array };
}

/** 선택 틱 팀 KPI. */
export interface TeamKpi {
  /** 평균단가법 13키(그 시각까지 팀 체결 · 없으면 null). */
  pnl: TeamPnl | null;
  /** 당일 평단(잔량 0 이면 null). */
  avgPx: number | null;
  /** 당일 팀 순매수 금액 · 수량(매수 − 매도). */
  dayNetVal: number;
  dayNetQty: number;
  /** 커서 이하 마지막 A3 체결가(없으면 null). */
  lastPx: number | null;
  /** 반영한 팀 체결 수. */
  k: number;
}

export function buildTeamModel(session: TickSession): TeamModel {
  const { a3, a3Of, index, exOrder, teamOfRec } = session;

  // ① 팀 체결 — 범위 입력 순서 그대로 shared 에 넘긴다(정렬은 teamFillsOf)
  const all = a3.toTrades();
  const trades = session.scope === 'nxt' ? all : scopeTrades(all, session.scope);
  const fills = teamFillsOf(trades, (i) => teamOfRec[trades[i]!.rec] === 1);
  const prefix = buildPnlPrefix(fills);
  const fillMs = new Float64Array(fills.length);
  let prev = Number.NEGATIVE_INFINITY;
  for (let k = 0; k < fills.length; k++) {
    prev = Math.max(prev, msOfNs(index.recvNs[fills[k]!.rec]!));
    fillMs[k] = prev;
  }

  // ② 선택 틱 자르기 시각 — 거래소순 체결 시각 누적 최댓값
  const runMaxNs = new BigInt64Array(a3.n);
  let mx = -(2n ** 63n);
  for (let p = 0; p < exOrder.length; p++) {
    const j = a3Of[exOrder[p]!]!;
    if (j < 0) continue;
    const t = a3.tNs[j]!;
    const tt = t === -1n ? index.recvNs[a3.rec[j]!]! : t;
    if (tt > mx) mx = tt;
    runMaxNs[j] = mx;
  }

  // ③ 팀 주문 · 당일 계단
  const teamOrders: TeamOrderPoint[] = [];
  for (const o of session.orders) {
    if (!o.team || (o.bs !== '1' && o.bs !== '2')) continue;
    const lastRec = exOrder[session.orderEndPos[o.id]!]!;
    const j = a3Of[lastRec]!;
    teamOrders.push({
      order: o,
      lastRec,
      tMs: msOfNs(index.recvNs[lastRec]!),
      px: j >= 0 ? a3.px[j]! : 0,
      val: o.val,
      qty: o.qty,
      side: o.bs === '2' ? 'B' : 'S',
    });
  }
  teamOrders.sort((u, v) => u.tMs - v.tMs || session.orderEndPos[u.order.id]! - session.orderEndPos[v.order.id]!);
  const dayStairs: TeamModel['dayStairs'] = [];
  let net = 0;
  let qty = 0;
  for (const o of teamOrders) {
    net += o.side === 'B' ? o.val : -o.val;
    qty += o.side === 'B' ? o.qty : -o.qty;
    dayStairs.push({ tMs: o.tMs, net, qty });
  }

  // ④ 10분 막대(체결 수신 시각)
  const { T0 } = tickBoundsOf(session.date);
  const buy = new Float64Array(TEAM_BUCKETS);
  const sell = new Float64Array(TEAM_BUCKETS);
  for (const f of fills) {
    const slot = Math.floor((msOfNs(index.recvNs[f.rec]!) - T0) / 600_000);
    if (slot < 0 || slot >= TEAM_BUCKETS) continue;
    if (f.bs === '2') buy[slot]! += f.px * f.qty;
    else sell[slot]! += f.px * f.qty;
  }

  return { scope: session.scope, fills, fillMs, prefix, runMaxNs, teamOrders, dayStairs, buckets: { buy, sell } };
}

/**
 * 선택 틱(커서 rec) 팀 KPI — 커서 이하(거래소순) 마지막 A3 까지 본 체결 시각으로 팀 체결을 자르고 `pnlAt`(shared 골든 함수).
 * 첫 체결 전이면 k 0 · pnl null.
 */
export function teamKpiAt(model: TeamModel, session: TickSession, rec: number): TeamKpi {
  const j = rec >= 0 ? session.lastA3[session.exPos[rec]!]! : -1;
  if (j < 0) return { pnl: null, avgPx: null, dayNetVal: 0, dayNetQty: 0, lastPx: null, k: 0 };
  const lastPx = session.a3.px[j]!;
  const k = fillsUpTo(model.prefix, model.runMaxNs[j]!);
  const { pnl, avgPx } = pnlAt(model.prefix, k, lastPx);
  const p = model.prefix;
  return {
    pnl,
    avgPx,
    dayNetVal: p.buyVal[k]! - p.sellVal[k]!,
    dayNetQty: p.buyQty[k]! - p.sellQty[k]!,
    lastPx,
    k,
  };
}

/** 차트 주문 원 문턱 — 팀 주문 금액 500만 이상(스케치 019 D). */
export const TEAM_CIRCLE_MIN_VAL = 5_000_000;

/** 주문 원 — 팀 주문 중 금액 ≥ minVal(기본 500만 · 스케치 019 D). 수신 시각 순. */
export function teamCirclesOf(model: TeamModel, minVal = TEAM_CIRCLE_MIN_VAL): TeamOrderPoint[] {
  return model.teamOrders.filter((o) => o.val >= minVal);
}
