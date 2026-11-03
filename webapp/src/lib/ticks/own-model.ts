/**
 * 틱 뷰어 「우리 체결」 모델 (Phase 38 D-02 · D-04 · D-05 · D-12 · D-13 · D-15) — 세션 A3 열과 `GET /api/ticks/own` 응답을
 * shared `matchOwnFills` 로 짝지어 전문 목록 · 차트 · 카드가 같이 읽는 모델을 만든다.
 *
 * ① 세션과 따로 만든다 — 세션(격자 · 증분)과 저널 도착은 주기가 다르므로 `TickSession` 안에 넣지 않고 뷰어가
 *   `useMemo([session, own])` 로 묶는다(RESEARCH Anti-Pattern).
 * ② 체결 순서 = (gw_time_ms, gateway, seq) — RPC 정렬과 같은 키로 한 번 더 정렬한다(방어 · 남은 수량 차감이 순서 의존 —
 *   Pitfall 2). 정렬은 안정이라 같은 키는 입력 순서를 지킨다.
 *   짝짓기 · 근거 · 앵커 모두 세션 `duplicates`(같은 보드 · seq 재수신)를 뺀다 — 차트와 같은 거름(WR-03).
 * ③ 표시: A3 rec 하나에 붙은 우리 체결 합 `our` 와 그 A3 수량 `total`(부분 체결이면 「n/m」) · 하나라도 추정이면 est.
 *   계좌 · 주문번호는 모델에 있지만 전문 행에 그리지 않는다(D-02 — 주문 줄 「···끝4」 · 카드 · 툴팁에서만).
 * ④ 주문(38-04): 묶기 키 `${gateway}|${order_no}` — 주문 집합 = 이벤트(kind 3 · 6) ∪ 체결의 주문번호. 주문 시각 · 값은
 *   그 주문의 가장 이른 이벤트 → 없으면 보조 주문 행(`orders[]` · created_ms) → 둘 다 없으면 체결만(주문 줄 없음 · gwMs null).
 * ⑤ 슬롯(38-04): 주문 · 짝 없는 체결의 자리 = 수신순 `lowerBoundRecv`(그 시각 이후 첫 전문) — 거래소순은 수신순 자리를
 *   보드별로 다시 채운 순열이라 슬롯 p 하나가 두 순열 공통이다(`exchangeOrderOf`). 전문 목록은 ROW(order[p]) **앞**에 줄을 넣는다.
 * ⑥ 대기(38-04 · Pitfall 4): 당일(`live`)에는 저널이 틱보다 먼저 올 수 있다. 그래서 짝은 늘 다 짓되(과거 격자와 같은 한 번의
 *   `matchOwnFills`), **지금 고른 짝이 더 가까운 A3 가 아직 올 수 있어 바뀔 수 있으면** 대기('pending')로 둔다(R2 WR-02).
 *   더 나은 A3(|dt| 가 더 작거나 「추정」 을 바꿀 만큼 가까운 것)의 시각은 g + 닿는 거리(짝 있음 = min(|dt| + 20, 200) ·
 *   짝 없음 = 짝 창 끝 200) 앞이다. 그 A3 는 늦어도 그 시각 + 여유 1,000ms 안에 받았어야 하므로 그 끝이 세션 마지막 수신보다
 *   뒤면 아직 모른다. 진짜 A3 가 이미 있어 |dt| 가 작은 체결은 그만큼 빨리 확정되고, 진짜 A3 가 없어 더 이른 같은 가격
 *   A3 에 붙은 체결(상한가 · 원 WR-02)은 대기로 남는다. 짝 없음은 지금과 같다(gw + 1,200ms).
 *   남은 수량 차감이 순서 의존이라 확정은 앞자리만 — 한 체결이 대기면 그 뒤 체결은 모두 대기(대기 체결의 차감은 버린다).
 *   장 끝(KRX 18:00 · NXT 20:00 KST) + 5분 뒤에 받은 세션(`asOfMs` = 마지막 성공 응답의 브라우저 시각 · 상태 ready)은
 *   그날 전문이 다 왔으므로 대기가 없다 — 날짜를 넘기지 않아도 장 끝 체결이 영구 대기로 남지 않는다. 장중에는 브라우저
 *   시계를 쓰지 않는다(게이트웨이 시계와 어긋날 수 있다 — 서버 시각이 응답에 없다). 세션이 자라면 모델을 다시 만들어 풀린다.
 *   과거 격자는 늘 확정.
 * ⑦ 근거 · 앵커(38-06 · D-11 · D-13 · D-15 · SC-3): 세션당 `cumIndexOf(a3, duplicates)` 한 번 → 이벤트가 있는 주문마다 shared
 *   `locateEvidence`(호가 B6 · 체결 단건 A3 · 주기매도 구간 · 없음) · `anchorOf`(「주문 직전 마지막 체결」). ev_kind 3(체결통보)은
 *   shared 가 none 으로 돌려주므로 여기서 같은 게이트웨이 · 계좌의 그 이전 우리 체결(gw ≤ 이벤트 gw ∧ 가격 == ev_price ∧
 *   수량 == ev_trade_qty) 중 마지막 것의 짝 A3 로 잇는다 — 그 체결이 짝이 없으면 근거 없음(RESEARCH Open Q3 · UAT 확인 대상).
 *   앵커가 근거 행과 같으면 앵커는 없다(−1 · 카드 「직전 체결」 줄 생략).
 */

import {
  EVIDENCE_KIND_LABELS,
  OWN_MATCH_DT_MIN_MS,
  OWN_MATCH_EST_MS,
  anchorOf,
  conditionTextOf,
  cumIndexOf,
  dayStartNs,
  evidenceTextOf,
  locateEvidence,
  lowerBoundRecv,
  matchOwnFills,
  orderGroupLabel,
  orderGroupOriginText,
  strategyEventSide,
  type OwnEvidence,
  type OwnFillMatch,
  type TickExchange,
  type TickOwnEvent,
  type TickOwnResponse,
} from '@gh-radar/shared';

import { fmtQty } from './tick-format';
import type { TickSession } from './tick-session';

/** 짝 창 +200ms + 여유 1,000ms — 이 안의 짝 없는 체결은 당일이면 대기(RESEARCH Pattern 6). */
export const OWN_PENDING_GRACE_MS = 1200;

/** 여유 1,000ms — A3 시각 뒤 이만큼 안에 받는다고 본다(`OWN_PENDING_GRACE_MS` − 짝 창 +200 · 머리 주석 ⑥). */
const OWN_PENDING_SLACK_MS = OWN_PENDING_GRACE_MS + OWN_MATCH_DT_MIN_MS;

/** 그날 전문 끝(KST HHMM) — KRX 시간외 단일가 18:00 · NXT 20:00. 이 뒤에 받은 당일 세션은 대기가 없다(⑥ · R2 WR-02). */
export const OWN_DAY_END_HHMM: Readonly<Record<TickExchange, string>> = { KRX: '1800', NXT: '2000' };

/** 장 끝 뒤 여유(ms) — 브라우저 시계 어긋남 · tickgw 폴링 지연. */
export const OWN_DAY_END_SETTLE_MS = 5 * 60_000;

/** 체결 상태 — 짝 A3 있음 · 짝 전문 없음(확정) · 전문 아직 안 옴(당일 대기). */
export type OwnFillState = 'matched' | 'nofill' | 'pending';

/** 우리 체결 한 건 — 짝 결과 포함(`a3j` −1 = 짝 전문 없음). */
export interface OwnFillView {
  /** 모델 안 순번(정렬 뒤 색인). */
  id: number;
  /**
   * 안정 키 `${gateway}|${order_no}|${gw_time_ms}|${seq}` — own 을 다시 받아 id 가 밀려도 같은 체결(고른 줄 기억 · WR-04).
   * 원천 PK 는 (gateway, journal_epoch, seq) 인데 RPC 가 epoch 를 내보내지 않아, 장중 저널 초기화로 seq 가 다시 쓰여도
   * 갈리도록 주문번호 · gw 시각을 더한다(R2 IN-01 · 계약 그대로).
   */
  key: string;
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
  /** 이 체결의 주문 id(`OwnModel.orders` 색인). */
  order: number;
  state: OwnFillState;
}

/** 우리 주문 한 건 — 주문 줄(●) · 레일 구간의 단위. */
export interface OwnOrderView {
  /** 모델 안 순번(주문 시각 순). */
  id: number;
  /** 묶기 키 `${gateway}|${order_no}`. */
  key: string;
  gateway: string;
  accountNo: string;
  orderNo: string;
  side: 'buy' | 'sell' | null;
  px: number | null;
  qty: number | null;
  /** 주문 시각(이벤트 gw_time_ms · 없으면 보조 주문 created_ms) · 체결만 있는 주문은 null(주문 줄 없음). */
  gwMs: number | null;
  source: 'event' | 'order' | 'fill';
  /** 그 주문의 가장 이른 kind 3 · 6 이벤트 · 없으면 null. */
  event: TickOwnEvent | null;
  /** 보조 주문 행 출처(`manual` · `limit_chaser` · `vi`) · 없으면 null. */
  origin: string | null;
  /** 이 주문의 체결 id(오름차순). */
  fills: number[];
  /** 조건 근거(shared `locateEvidence` · ev_kind 3 은 우리 체결 짝) — 이벤트 없는 주문은 none. */
  evidence: OwnEvidence;
  /** 근거 종류 낱말 — 호가 · 체결 · 체결통보 · 체결 구간 · 없으면 null. */
  evidenceLabel: string | null;
  /** 근거 전문 rec(b6 rec · 단건 A3 rec · 구간 끝 A3 rec) · 없으면 −1. */
  evidenceRec: number;
  /** 구간 첫 A3 rec · 구간이 아니면 evidenceRec 과 같다. */
  evidenceFirstRec: number;
  /** 앵커(「주문 직전 마지막 체결」) A3 rec · 없거나 근거 행과 같으면 −1. */
  anchorRec: number;
}

/** 전문 목록 · 카드가 고른 우리 줄 — 주문 줄(order id) 또는 짝 없는 체결 줄(fill id). */
export type OwnSel = { kind: 'order' | 'fill'; id: number };

/** 고른 우리 줄의 안정 키 — 주문 `${gateway}|${order_no}` · 체결 `OwnFillView.key`(id 는 모델마다 다시 매긴다). */
export type OwnSelKey = { kind: 'order' | 'fill'; key: string };

/** 고른 줄 → 안정 키 · 모델에 그 id 가 없으면 null. */
export function ownSelKeyOf(model: OwnModel, sel: OwnSel): OwnSelKey | null {
  const v = sel.kind === 'order' ? model.orders[sel.id] : model.fills[sel.id];
  return v ? { kind: sel.kind, key: v.key } : null;
}

/**
 * 안정 키 → 지금 모델의 고른 줄 — 그 주문 · 체결이 없으면 null. 체결은 아직 줄(짝 없음 · 대기)일 때만 —
 * 다시 받아 짝이 붙었으면 줄이 없으므로 선택도 없다.
 */
export function resolveOwnSel(model: OwnModel, k: OwnSelKey): OwnSel | null {
  if (k.kind === 'order') {
    const o = model.orders.find((x) => x.key === k.key);
    return o ? { kind: 'order', id: o.id } : null;
  }
  const f = model.fills.find((x) => x.key === k.key);
  return f && f.rec < 0 ? { kind: 'fill', id: f.id } : null;
}

export interface OwnModel {
  /** 켜진 서버 키(sort_order 순 — 응답 그대로). */
  servers: string[];
  fills: OwnFillView[];
  /** A3 rec → 그 rec 에 붙은 우리 체결 id 들(오름차순). */
  fillsOfRec: Map<number, number[]>;
  /** 주문(주문 시각 순 · 시각 없는 주문은 첫 체결 시각으로 끼운다). */
  orders: OwnOrderView[];
  /** 주문 id → 수신순 슬롯 p(그 시각 이후 첫 전문 자리 · 0..n) · 주문 시각이 없으면 −1. */
  slotOfOrder: Int32Array;
  /** 체결 id → 수신순 슬롯 p — 짝 없음 · 대기만 · 짝 있으면 −1. */
  slotOfFill: Int32Array;
  /** 근거 전문 rec(evidenceRec · 구간 첫 rec 둘 다) → 그 전문을 보고 나간 주문 id 들(오름차순). */
  ordersOfEvidenceRec: Map<number, number[]>;
}

type EvidenceKeys = 'evidence' | 'evidenceLabel' | 'evidenceRec' | 'evidenceFirstRec' | 'anchorRec';

/** 대기 체결의 짝 자리(잠정 짝은 버린다) — 짝 없음과 같은 모양(읽기 전용). */
const PENDING_MATCH: OwnFillMatch = { a3j: -1, est: false, candidates: 0, dtMs: Number.NaN };

/** 근거 없음 — 주문마다 같은 객체를 써도 된다(읽기 전용). */
const NO_EVIDENCE: OwnEvidence = { kind: 'none' };

const sideOfCode = (s: string | null): 'buy' | 'sell' | null => (s === 'B' ? 'buy' : s === 'S' ? 'sell' : null);

interface OrderAcc {
  key: string;
  gateway: string;
  accountNo: string;
  orderNo: string;
  event: TickOwnEvent | null;
  aux: TickOwnResponse['orders'][number] | null;
  fills: number[];
}

export interface BuildOwnModelOpts {
  /** 당일 바이트 경로 — 대기 판정을 한다(⑥). */
  live?: boolean;
  /** 마지막 성공 응답 시각(브라우저 epoch ms · tickgw 상태 ready 일 때만) — 장 끝 뒤면 대기 없음(⑥). */
  asOfMs?: number | null;
}

/** 당일 세션이 그날 전문을 다 받았는가 — 장 끝 + 여유 뒤에 받은 응답(⑥). */
function dayDoneOf(session: TickSession, asOfMs: number | null | undefined): boolean {
  if (asOfMs === null || asOfMs === undefined) return false;
  const endMs = Number(dayStartNs(session.date, OWN_DAY_END_HHMM[session.ex]) / 1_000_000n);
  return asOfMs >= endMs + OWN_DAY_END_SETTLE_MS;
}

export function buildOwnModel(session: TickSession, own: TickOwnResponse, opts?: BuildOwnModelOpts): OwnModel {
  const { index, a3, recvOrder, duplicates } = session;
  const live = opts?.live === true && !dayDoneOf(session, opts.asOfMs);
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
  // 짝은 늘 다 짓는다 — 과거 격자와 같은 한 번의 호출(오라클 수치 그대로).
  const matches = matchOwnFills(
    index,
    a3,
    sorted.map((f) => ({ gwMs: f.gw_time_ms, px: f.exec_price, qty: f.exec_qty })),
    duplicates,
  );
  // 당일 대기(⑥) — 더 가까운 A3 가 아직 올 수 있는 첫 체결부터 끝까지(차감 순서 의존이라 앞자리만 확정).
  // 세션 마지막 수신 ms — 레코드가 없으면 모두 대기.
  let settledN = sorted.length;
  if (live) {
    const n = recvOrder.length;
    const lastRecvMs = n > 0 ? Number(index.recvNs[recvOrder[n - 1]!]! / 1_000_000n) : Number.NEGATIVE_INFINITY;
    const windowEnd = -OWN_MATCH_DT_MIN_MS;
    for (let i = 0; i < sorted.length; i++) {
      const m = matches[i]!;
      const reach = m.a3j >= 0 ? Math.min(Math.abs(m.dtMs) + OWN_MATCH_EST_MS, windowEnd) : windowEnd;
      if (sorted[i]!.gw_time_ms + reach + OWN_PENDING_SLACK_MS > lastRecvMs) {
        settledN = i;
        break;
      }
    }
  }

  // ── 주문 묶기 — 이벤트(가장 이른 것) ∪ 체결의 주문번호 · 보조 주문 행은 시각 보조로만
  const acc = new Map<string, OrderAcc>();
  const accOf = (gateway: string, orderNo: string, accountNo: string): OrderAcc => {
    const key = `${gateway}|${orderNo}`;
    let a = acc.get(key);
    if (!a) {
      a = { key, gateway, accountNo, orderNo, event: null, aux: null, fills: [] };
      acc.set(key, a);
    }
    return a;
  };
  for (const e of own.events) {
    const a = accOf(e.gateway, e.order_no, e.account_no);
    if (
      a.event === null ||
      e.gw_time_ms < a.event.gw_time_ms ||
      (e.gw_time_ms === a.event.gw_time_ms && e.seq < a.event.seq)
    ) {
      a.event = e;
    }
  }
  for (let i = 0; i < sorted.length; i++) {
    const f = sorted[i]!;
    accOf(f.gateway, f.order_no, f.account_no).fills.push(i);
  }
  for (const o of own.orders) {
    const a = acc.get(`${o.gateway}|${o.order_no}`);
    if (a && a.aux === null) a.aux = o;
  }

  const draft = Array.from(acc.values(), (a) => {
    const e = a.event;
    const o = a.aux;
    const first = a.fills.length > 0 ? sorted[a.fills[0]!]! : null;
    let view: Omit<OwnOrderView, 'id' | 'fills' | EvidenceKeys>;
    if (e) {
      view = {
        key: a.key,
        gateway: a.gateway,
        accountNo: a.accountNo,
        orderNo: a.orderNo,
        side: strategyEventSide(e.group, e.kind),
        px: e.price,
        qty: e.qty,
        gwMs: e.gw_time_ms,
        source: 'event',
        event: e,
        origin: o?.origin ?? null,
      };
    } else if (o) {
      view = {
        key: a.key,
        gateway: a.gateway,
        accountNo: a.accountNo,
        orderNo: a.orderNo,
        side: sideOfCode(o.side),
        px: o.price,
        qty: o.qty,
        gwMs: o.created_ms,
        source: 'order',
        event: null,
        origin: o.origin,
      };
    } else {
      view = {
        key: a.key,
        gateway: a.gateway,
        accountNo: a.accountNo,
        orderNo: a.orderNo,
        side: first ? sideOfCode(first.side) : null,
        px: null,
        qty: null,
        gwMs: null,
        source: 'fill',
        event: null,
        origin: null,
      };
    }
    // 정렬 시각 — 주문 시각 · 없으면 첫 체결 시각
    const sortMs = view.gwMs ?? (first ? first.gw_time_ms : Number.MAX_SAFE_INTEGER);
    return { view, fills: a.fills, sortMs };
  });
  draft.sort((x, y) => x.sortMs - y.sortMs || (x.view.key < y.view.key ? -1 : x.view.key > y.view.key ? 1 : 0));

  const orders: OwnOrderView[] = new Array(draft.length);
  const orderOfFill = new Int32Array(sorted.length).fill(-1);
  for (let id = 0; id < draft.length; id++) {
    const d = draft[id]!;
    orders[id] = {
      ...d.view,
      id,
      fills: d.fills,
      evidence: NO_EVIDENCE,
      evidenceLabel: null,
      evidenceRec: -1,
      evidenceFirstRec: -1,
      anchorRec: -1,
    };
    for (const fi of d.fills) orderOfFill[fi] = id;
  }

  const slotAt = (ms: number): number => lowerBoundRecv(index.recvNs, recvOrder, BigInt(Math.trunc(ms)) * 1_000_000n);

  const fills: OwnFillView[] = new Array(sorted.length);
  const fillsOfRec = new Map<number, number[]>();
  const slotOfFill = new Int32Array(sorted.length).fill(-1);
  for (let i = 0; i < sorted.length; i++) {
    const f = sorted[i]!;
    // 확정 앞자리 밖(당일 · 짝이 아직 바뀔 수 있음) = 대기 · 확정인데 못 찾으면 「짝 전문 없음」
    const pending = i >= settledN;
    const m = pending ? PENDING_MATCH : matches[i]!;
    const rec = m.a3j >= 0 ? a3.rec[m.a3j]! : -1;
    const state: OwnFillState = pending ? 'pending' : m.a3j >= 0 ? 'matched' : 'nofill';
    fills[i] = {
      id: i,
      key: `${f.gateway}|${f.order_no}|${f.gw_time_ms}|${f.seq}`,
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
      order: orderOfFill[i]!,
      state,
    };
    if (rec >= 0) {
      const ids = fillsOfRec.get(rec);
      if (ids) ids.push(i);
      else fillsOfRec.set(rec, [i]);
    } else {
      slotOfFill[i] = slotAt(f.gw_time_ms);
    }
  }

  const slotOfOrder = new Int32Array(orders.length).fill(-1);
  for (const o of orders) if (o.gwMs !== null) slotOfOrder[o.id] = slotAt(o.gwMs);

  // ── 근거 · 앵커(⑦) — 색인은 세션당 한 번(이벤트가 있을 때만)
  const ordersOfEvidenceRec = new Map<number, number[]>();
  const cumIdx = own.events.length > 0 ? cumIndexOf(a3, duplicates) : null;
  if (cumIdx) {
    for (const o of orders) {
      const e = o.event;
      if (!e) continue;
      let evidence: OwnEvidence;
      if (e.ev_kind === 3) {
        // 체결통보 — 같은 게이트웨이 · 계좌의 그 이전 우리 체결 중 마지막 것(fills 는 gw 시각 오름차순)
        let last: OwnFillView | null = null;
        for (const f of fills) {
          if (f.gwMs > e.gw_time_ms) break;
          if (f.gateway !== e.gateway || f.accountNo !== e.account_no) continue;
          if (f.px === e.ev_price && f.qty === e.ev_trade_qty) last = f;
        }
        evidence = last !== null && last.a3j >= 0 ? { kind: 'a3', j: last.a3j } : NO_EVIDENCE;
      } else {
        evidence = locateEvidence(
          session.buf,
          index,
          recvOrder,
          a3,
          cumIdx,
          {
            gwMs: e.gw_time_ms,
            evKind: e.ev_kind,
            evPrice: e.ev_price,
            evQtyBefore: e.ev_qty_before,
            evQtyAfter: e.ev_qty_after,
            evTradeQty: e.ev_trade_qty,
          },
          duplicates,
        );
      }
      o.evidence = evidence;
      if (evidence.kind === 'b6') {
        o.evidenceLabel = EVIDENCE_KIND_LABELS[1] ?? null;
        o.evidenceRec = o.evidenceFirstRec = evidence.rec;
      } else if (evidence.kind === 'a3') {
        o.evidenceLabel = EVIDENCE_KIND_LABELS[e.ev_kind] ?? null;
        o.evidenceRec = o.evidenceFirstRec = a3.rec[evidence.j]!;
      } else if (evidence.kind === 'range') {
        o.evidenceLabel = '체결 구간';
        o.evidenceRec = a3.rec[evidence.lastJ]!;
        o.evidenceFirstRec = a3.rec[evidence.firstJ]!;
      }
      const aj = anchorOf(cumIdx, e.cum_volume);
      const anchor = aj >= 0 ? a3.rec[aj]! : -1;
      o.anchorRec = anchor === o.evidenceRec || anchor === o.evidenceFirstRec ? -1 : anchor;
      if (o.evidenceRec >= 0) {
        for (const r of o.evidenceFirstRec === o.evidenceRec ? [o.evidenceRec] : [o.evidenceFirstRec, o.evidenceRec]) {
          const ids = ordersOfEvidenceRec.get(r);
          if (ids) ids.push(o.id);
          else ordersOfEvidenceRec.set(r, [o.id]);
        }
      }
    }
  }

  return { servers: own.servers, fills, fillsOfRec, orders, slotOfOrder, slotOfFill, ordersOfEvidenceRec };
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

/** 출처 그룹 — 이벤트 group · 이벤트가 없으면 보조 주문 출처(manual 7 · vi 8) · 그 밖 0(구분 · 출처 생략). */
function originGroupOf(o: OwnOrderView): number {
  if (o.event) return o.event.group;
  if (o.origin === 'manual') return 7;
  if (o.origin === 'vi') return 8;
  return 0;
}

/**
 * 주문 줄 문구(D-05) — 「● 주문 {구분} {매수|매도} {가격 ×수량} · {조건 | 조건 없음[ · 출처]} · {게이트웨이} ···{계좌 끝 4} #{주문번호}」.
 * 구분 · 조건 · 출처 낱말은 shared `strategy-event-labels` · `strategy-event-text` 그대로(문장 새로 짓지 않음 — 25 D-09/D-10).
 * 값이 없는 조각은 생략한다(가짜 0 금지 — 가격 · 수량 0 이하도 없는 값). 근거가 있으면 조건 뒤 · 게이트웨이 앞에
 * 「 · 근거 {호가|체결|체결통보|체결 구간} ↑」(38-06 · 근거 행은 레일 ○).
 */
export function ownOrderLineText(o: OwnOrderView): string {
  const g = originGroupOf(o);
  const head: string[] = ['● 주문'];
  const label = g > 0 ? orderGroupLabel(g) : null;
  if (label) head.push(label);
  if (o.side) head.push(o.side === 'buy' ? '매수' : '매도');
  const px = o.px !== null && o.px > 0 ? fmtQty(o.px) : null;
  const qty = o.qty !== null && o.qty > 0 ? `×${fmtQty(o.qty)}` : null;
  if (px !== null || qty !== null) head.push([px, qty].filter((s) => s !== null).join(' '));

  const e = o.event;
  let cond: string | null = null;
  if (e && e.cond_metric > 0) {
    cond = conditionTextOf({
      condMetric: e.cond_metric,
      condThreshold: e.cond_threshold,
      condActual: e.cond_actual,
      reasonCode: e.reason_code,
      group: e.group,
      kind: e.kind,
      price: e.price,
    });
  }
  if (cond === null) {
    const src = g > 0 ? orderGroupOriginText(g) : null;
    cond = src ? `조건 없음 · ${src}` : '조건 없음';
  }

  const ev = o.evidenceLabel !== null ? ` · 근거 ${o.evidenceLabel} ↑` : '';
  const last4 = o.accountNo.length > 0 ? ` ···${o.accountNo.slice(-4)}` : '';
  const no = o.orderNo !== '' ? ` #${o.orderNo}` : '';
  return `${head.join(' ')} · ${cond}${ev} · ${o.gateway}${last4}${no}`;
}

/** 주문 구분 낱말(선매수 · 수동 · VI …) — 주문 줄과 같은 출처 그룹 · 없으면 null. */
export function ownOrderGroupLabel(o: OwnOrderView): string | null {
  const g = originGroupOf(o);
  return g > 0 ? orderGroupLabel(g) : null;
}

/**
 * 카드 「조건」 줄(D-07 ① · D-13) — 조건이 있으면 `conditionTextOf` 그대로(「조건 … / 실측 …」) ·
 * 수동이면 「없음 · 수동 주문 — 주문 시각 위치만」 · 그 밖 「없음 — 주문 시각 위치만」.
 */
export function ownConditionLineText(o: OwnOrderView): string {
  const e = o.event;
  if (e && e.cond_metric > 0) {
    const t = conditionTextOf({
      condMetric: e.cond_metric,
      condThreshold: e.cond_threshold,
      condActual: e.cond_actual,
      reasonCode: e.reason_code,
      group: e.group,
      kind: e.kind,
      price: e.price,
    });
    if (t !== null) return t;
  }
  return originGroupOf(o) === 7 ? '없음 · 수동 주문 — 주문 시각 위치만' : '없음 — 주문 시각 위치만';
}

/** 근거 조각(`evidenceTextOf` 그대로 · 예 「근거 호가(매도1잔량 52,100→38,200)」) — 이벤트 · 근거가 없으면 null. */
export function ownEvidenceText(o: OwnOrderView): string | null {
  const e = o.event;
  if (!e || o.evidenceRec < 0) return null;
  return evidenceTextOf({
    evKind: e.ev_kind,
    evPrice: e.ev_price,
    evQtyBefore: e.ev_qty_before,
    evQtyAfter: e.ev_qty_after,
    evTradeQty: e.ev_trade_qty,
    condMetric: e.cond_metric,
    group: e.group,
    kind: e.kind,
  });
}
