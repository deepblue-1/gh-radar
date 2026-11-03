/**
 * 틱뷰어 3판 차트 마우스 · 터치 툴팁 (2026-11-03 사용자 요청 「매집감지 차트처럼 툴팁 · 근처 버블 합산」).
 *
 * 매집감지 상세 차트(`lib/accum-chart.ts` 마우스 툴팁 · 묶음 툴팁 quick-261028-ggj)와 같은 규칙을 틱 세션 팀 모델에 옮긴다 —
 * 판마다 대상 하나, 대상이 바뀔 때만 상자를 다시 그린다(key).
 *
 * ① 가격 판 — 마우스 세로선이 지나는 원(|mx − cx| ≤ r + 2) 중 세로로 가장 가까운 원이 씨앗. 씨앗 중심 가로 ± 5px 안의 보이는 원
 *   (창 안 · 가격 > 0 · 세로 무시 · 사슬 없음 · 매수/매도 섞임)이 묶음. 한 원이면 2줄(주문 사실 · 「당일 순매수 · 등락률 · 평단 대비」),
 *   묶음이면 3줄(고른 원 한 줄 · 「묶음 N건 … 합계 · 가격 첫 → 끝」 · 「큰 주문」 상위 3).
 * ② 순매수 판 — 시각 t 이하 마지막 계단 「HH:MM:SS · 당일 순매수 ±X[ · 누적 ±Y(이월 포함) | 누적 —][ · 팀 평단 N원]」.
 *   누적(pos_net)의 끊김 규칙은 매집감지 `cumTipAt` 당일 축 갈래 그대로.
 * ③ 10분 판 — 시각 t 가 든 칸 「HH:MM~HH:MM · 팀 매수 X / 매도 Y / 순 ±Z」(빈 칸은 없음).
 * ④ 누적 판(스케치 022 A) — 시각 t 이하 마지막 A3 까지 「HH:MM:SS까지 · 거래량 N주 · 거래대금 X(시총 대비 n.n%)」 ·
 *   「팀 X n.n% · 매수 Y · 매도 Z」(팀 체결 전이면 「팀 체결 없음」). 시총을 모르면 시총 대비를 뺀다.
 *
 * ⑤ 우리 점(Phase 38-07 · D-08 · D-02 · D-16) — ◆ 체결마다 「우리 체결 n주[ / 전체 m주] · 계좌 ···끝4 · 주문 #…[ · 추정]」 ·
 *   ◇ 「… · 짝 전문 없음」(대기 「… · 전문 아직 안 옴」) · ○ 주문마다 「조건 근거 {종류} · 주문 #…」. 팀 원 툴팁이 뜨는 자리면 씨앗
 *   가로 ± 5px 안(판 안에 보이는) 우리 점 줄을 팀 줄 **뒤에** 덧붙인다 — 팀 줄 문구 · 순서는 그대로. 계좌는 끝 4자리만(D-02).
 *
 * 금액은 이 화면 표기(`fmtAmountC` — 「984만」 「7.96억」), 등락률 · 평단 대비는 매집감지 툴팁처럼 소수 2자리.
 */

import { orderRadiusOf, type PosNetPoint, type View } from '@/lib/accum-chart';
import { kstClock } from '@/lib/limitup-report';
import { kstHm } from '@/lib/teamflow-report';

import type { OwnModel } from './own-model';
import { TEAM_CIRCLE_MIN_VAL, type TeamModel, type TeamOrderPoint } from './team-model';
import { OWN_MARK_HIT_PAD, OWN_MARK_R, turnoverIdxAt, type OwnMark, type TickPanels, type TurnoverSeries } from './tick-chart';
import { MINUS, fmtAmountC, fmtQty } from './tick-format';

/** 원을 그리는 창 여유(창 폭의 2% — 컴포넌트가 그리는 원과 같은 범위). */
const VIEW_PAD_RATIO = 0.02;
/** 원 판정 가로 여유(매집감지 HOVER_PAD). */
const HOVER_PAD = 2;
/** 묶음 가로 반폭(화면 px · 매집감지 ORDER_GROUP_HALF_WIDTH). */
export const TICK_GROUP_HALF_WIDTH = 5;
const SLOT_MS = 600_000;

const INT = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
const SIDE_WORD = { B: '매수', S: '매도' } as const;

/** 그려진 주문 원 하나 — `k` = teamOrders 번호(당일 계단 · 툴팁이 그 주문을 다시 찾는다). */
export interface TickCircle {
  k: number;
  o: TeamOrderPoint;
  cx: number;
  cy: number;
  r: number;
}

export interface TickHover {
  key: string;
  lines: string[];
  /** 가격 판이면 고른 원(씨앗). */
  circle: TickCircle | null;
  /** 묶음(2개 이상 · 시간순 · 씨앗 포함)일 때만. */
  group?: readonly TickCircle[];
}

/** 주문 원 — 팀 주문 전부(`TEAM_CIRCLE_MIN_VAL` 0) · 창 ± 2% 안 · 그리기 순서 = 큰 원 먼저(작은 원이 위). */
export function tickCirclesOf(
  model: Pick<TeamModel, 'teamOrders'>,
  view: View,
  x: (t: number) => number,
  y: (px: number) => number,
): TickCircle[] {
  const pad = (view.t1 - view.t0) * VIEW_PAD_RATIO;
  const out: TickCircle[] = [];
  model.teamOrders.forEach((o, k) => {
    if (o.val < TEAM_CIRCLE_MIN_VAL || o.tMs < view.t0 - pad || o.tMs > view.t1 + pad) return;
    out.push({ k, o, cx: x(o.tMs), cy: y(o.px), r: orderRadiusOf(o.val) });
  });
  return out.sort((a, b) => b.o.val - a.o.val);
}

/** 가격 판 씨앗 — 세로선이 지나는 원 중 세로로 가장 가까운 것. 가격 판 밖이면 null. */
export function nearestTickCircleOf(circles: readonly TickCircle[], mx: number, my: number, p: TickPanels): TickCircle | null {
  if (my < p.y1a || my > p.y1b) return null;
  let best: TickCircle | null = null;
  let bestDy = Infinity;
  for (const c of circles) {
    if (Math.abs(mx - c.cx) > c.r + HOVER_PAD) continue;
    const dy = Math.abs(my - c.cy);
    if (dy < bestDy) {
      bestDy = dy;
      best = c;
    }
  }
  return best;
}

/** 씨앗 + 가로 ± 5px 안 보이는 원(창 안 · 가격 > 0) — 시간순 · 같으면 주문 번호순. 씨앗이 안 보이면 [씨앗]. */
export function tickCircleGroupOf(circles: readonly TickCircle[], seed: TickCircle, view: View): TickCircle[] {
  const visible = (c: TickCircle) => c.o.tMs >= view.t0 && c.o.tMs <= view.t1 && c.o.px > 0;
  if (!visible(seed)) return [seed];
  const group = [seed];
  for (const c of circles) {
    if (c.k !== seed.k && visible(c) && Math.abs(c.cx - seed.cx) <= TICK_GROUP_HALF_WIDTH) group.push(c);
  }
  return group.sort((a, b) => a.o.tMs - b.o.tMs || a.k - b.k);
}

/** 부호 붙은 금액(「+984만」 · 「−1.20억」 · 0 은 「0」). */
function signedAmount(v: number): string {
  return v > 0 ? `+${fmtAmountC(v)}` : fmtAmountC(v);
}

/** 부호 붙은 % 2자리(「+5.13%」 · 음수 U+2212). */
function pct2(v: number): string {
  const r = Math.round(v * 100) / 100;
  if (r === 0) return '0.00%';
  return `${r > 0 ? '+' : MINUS}${Math.abs(r).toFixed(2)}%`;
}

/** 시각 t 까지 팀 체결로 본 평단(잔량 0 · 체결 전이면 null) — 평단 점점선(teamAvgPathOf)과 같은 값. */
export function teamAvgAt(model: Pick<TeamModel, 'prefix' | 'fillMs'>, t: number): number | null {
  const { fillMs, prefix } = model;
  let lo = 0;
  let hi = fillMs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (fillMs[mid]! <= t) lo = mid + 1;
    else hi = mid;
  }
  const hold = prefix.hold[lo];
  return hold !== undefined && hold > 0 ? prefix.cost[lo]! / hold : null;
}

/** 주문 사실 한 줄 — 「HH:MM:SS 팀 매수 N주 · 984만 @16,400 · N조각」. */
function orderFactOf(o: TeamOrderPoint): string {
  return `${kstClock(o.tMs)} 팀 ${SIDE_WORD[o.side]} ${INT.format(o.qty)}주 · ${fmtAmountC(o.val)} @${INT.format(o.px)} · ${o.order.pieces}조각`;
}

/** 한 원 2줄 — 주문 사실 · 「당일 순매수(그 주문 포함) · 등락률(기준가 대비) · 평단 대비(그 시각 팀 평단)」. 모르는 항목은 뺀다. */
export function tickOrderTipOf(
  model: Pick<TeamModel, 'dayStairs' | 'prefix' | 'fillMs'>,
  basePx: number | null,
  c: TickCircle,
): string[] {
  const parts: string[] = [];
  const step = model.dayStairs[c.k];
  if (step !== undefined) parts.push(`당일 순매수 ${signedAmount(step.net)}`);
  if (basePx !== null && basePx > 0 && c.o.px > 0) parts.push(`등락률 ${pct2(((c.o.px - basePx) / basePx) * 100)}`);
  const avg = teamAvgAt(model, c.o.tMs);
  if (avg !== null && c.o.px > 0) parts.push(`평단 대비 ${pct2(((c.o.px - avg) / avg) * 100)}`);
  const fact = orderFactOf(c.o);
  return parts.length > 0 ? [fact, parts.join(' · ')] : [fact];
}

/** 묶음 툴팁 — 2개 미만이면 한 원 2줄, 아니면 3줄(매집감지 `orderGroupTipOf` 꼴). */
export function tickGroupTipOf(
  model: Pick<TeamModel, 'dayStairs' | 'prefix' | 'fillMs'>,
  basePx: number | null,
  seed: TickCircle,
  group: readonly TickCircle[],
): string[] {
  const single = tickOrderTipOf(model, basePx, seed);
  if (group.length < 2) return single;
  const first = group[0]!.o;
  const last = group[group.length - 1]!.o;
  const clock =
    Math.floor(first.tMs / 1000) === Math.floor(last.tMs / 1000)
      ? kstClock(first.tMs)
      : `${kstClock(first.tMs)} ~ ${kstClock(last.tMs)}`;

  let b = 0;
  let s = 0;
  let bv = 0;
  let sv = 0;
  for (const c of group) {
    if (c.o.side === 'B') {
      b++;
      bv += c.o.val;
    } else {
      s++;
      sv += c.o.val;
    }
  }
  const mixed = b > 0 && s > 0;
  const dir = mixed
    ? `팀 매수 ${b}건 ${fmtAmountC(bv)} · 팀 매도 ${s}건 ${fmtAmountC(sv)}`
    : b > 0
      ? `팀 매수 ${b}건 합계 ${fmtAmountC(bv)}`
      : `팀 매도 ${s}건 합계 ${fmtAmountC(sv)}`;
  const chg = first.px > 0 ? ((last.px - first.px) / first.px) * 100 : 0;
  const priceTxt = `가격 ${INT.format(first.px)} → ${INT.format(last.px)} (${pct2(chg)})`;

  const big = [...group]
    .sort((p, q) => q.o.val - p.o.val)
    .slice(0, 3)
    .map((c) => `${mixed ? `${SIDE_WORD[c.o.side]} ` : ''}${fmtAmountC(c.o.val)}@${INT.format(c.o.px)}`)
    .join(' · ');

  return [single.join(' · '), `묶음 ${group.length}건 ${clock} · ${dir} · ${priceTxt}`, `큰 주문 ${big}`];
}

/** 가격 판 hover — 씨앗에서 묶음 · 줄. key = `o{씨앗 번호}`. */
export function tickOrderHoverOf(
  model: Pick<TeamModel, 'dayStairs' | 'prefix' | 'fillMs'>,
  basePx: number | null,
  circles: readonly TickCircle[],
  seed: TickCircle,
  view: View,
): TickHover {
  const group = tickCircleGroupOf(circles, seed, view);
  const hover: TickHover = { key: `o${seed.k}`, lines: tickGroupTipOf(model, basePx, seed, group), circle: seed };
  if (group.length >= 2) hover.group = group;
  return hover;
}

/**
 * 순매수 판 — 시각 t 의 당일 계단(t 이하 마지막 팀 주문) · 누적(pos_net · 있을 때만) · 팀 평단.
 * 누적 점이 없으면 당일 첫 주문 전은 null. 누적 점이 있으면 둘 다 없을 때만 null · 시각 = 둘 중 늦은 점 · 당일 첫 주문 전 값은 0.
 */
export function tickNetTipAt(
  model: Pick<TeamModel, 'dayStairs' | 'prefix' | 'fillMs'>,
  cum: readonly PosNetPoint[],
  t: number,
): TickHover | null {
  const st = model.dayStairs;
  let k = -1;
  for (let i = 0; i < st.length; i++) {
    if (st[i]!.tMs > t) break;
    k = i;
  }
  let kp = -1;
  for (let i = 0; i < cum.length; i++) {
    if (cum[i]!.t > t) break;
    kp = i;
  }
  if (k < 0 && kp < 0) return null;
  const tk = Math.max(k >= 0 ? st[k]!.tMs : -Infinity, kp >= 0 ? cum[kp]!.t : -Infinity);
  const avg = teamAvgAt(model, tk);
  const avgText = avg === null ? '' : ` · 팀 평단 ${INT.format(Math.round(avg))}원`;
  const day = `당일 순매수 ${signedAmount(k >= 0 ? st[k]!.net : 0)}`;
  if (cum.length === 0) return { key: `c${k}`, lines: [`${kstClock(tk)} · ${day}${avgText}`], circle: null };

  // 누적 조각 끊김(매집감지 posNetPathOf 짝) — 그 점 뒤인데 end ≠ 0 이거나 다음 점 cycle 이 다르면 값 없음
  let posVal: number | null = null;
  if (kp >= 0) {
    const p = cum[kp]!;
    const next = cum[kp + 1];
    const gap = tk > p.t && (p.end !== 0 || (next !== undefined && next.cycle !== p.cycle));
    if (!gap) posVal = p.net;
  }
  const posText = posVal === null ? '누적 —' : `누적 ${signedAmount(posVal)}(이월 포함)`;
  return { key: `c${k}p${kp}`, lines: [`${kstClock(tk)} · ${day} · ${posText}${avgText}`], circle: null };
}

/** 10분 판 — 시각 t 가 든 칸(08:00 = 0) · 빈 칸 · 범위 밖은 null. */
export function tickBucketTipAt(model: Pick<TeamModel, 'buckets'>, T0: number, t: number): TickHover | null {
  const slot = Math.floor((t - T0) / SLOT_MS);
  const buy = model.buckets.buy[slot];
  const sell = model.buckets.sell[slot];
  if (buy === undefined || sell === undefined || (buy <= 0 && sell <= 0)) return null;
  const s0 = T0 + slot * SLOT_MS;
  const text =
    `${kstHm(s0)}~${kstHm(s0 + SLOT_MS)} · 팀 매수 ${fmtAmountC(buy)} / 매도 ${fmtAmountC(sell)}` +
    ` / 순 ${signedAmount(buy - sell)}`;
  return { key: `b${slot}`, lines: [text], circle: null };
}

/** 비율 → 「n.n%」(부호 없음). */
export function pct1(r: number): string {
  return `${(Math.round(r * 1000) / 10).toFixed(1)}%`;
}

/** 누적 판 — 시각 t 이하 마지막 A3 까지 누적. 첫 체결 전이면 null. key = `v{색인}`. */
export function tickTurnoverTipAt(s: TurnoverSeries, t: number, mcap: number | null): TickHover | null {
  const i = turnoverIdxAt(s, t);
  if (i < 0) return null;
  const val = s.val[i]!;
  const cap = mcap === null ? '' : `(시총 대비 ${pct1(val / mcap)})`;
  const b = s.teamBuy[i]!;
  const sl = s.teamSell[i]!;
  const team =
    b + sl > 0 ? `팀 ${fmtAmountC(b + sl)} ${pct1(s.share[i]!)} · 매수 ${fmtAmountC(b)} · 매도 ${fmtAmountC(sl)}` : '팀 체결 없음';
  return {
    key: `v${i}`,
    lines: [`${kstClock(s.t[i]!)}까지 · 거래량 ${INT.format(s.qty[i]!)}주 · 거래대금 ${fmtAmountC(val)}${cap}`, team],
    circle: null,
  };
}

// ---------------------------------------------------------------------------
// 우리 점(Phase 38-07) — ◆ · ◇ · ○ 툴팁 줄 · 팀 묶음 합치기
// ---------------------------------------------------------------------------

type OwnTipModel = Pick<OwnModel, 'fills' | 'orders'>;

/** 우리 점 툴팁 — key(대상이 바뀔 때만 다시 그림) · 줄 · 고른 점. */
export interface TickOwnTip {
  key: string;
  lines: string[];
  mark: OwnMark;
}

const acctTail = (accountNo: string) => (accountNo.length > 0 ? ` · 계좌 ···${accountNo.slice(-4)}` : '');
const orderNoText = (orderNo: string) => `주문 #${orderNo !== '' ? orderNo : '—'}`;

/** 점 하나의 줄 — ◆ 체결마다 · ◇ 그 체결 · ○ 주문마다. 계좌는 끝 4자리만(D-02). */
export function tickOwnLinesOf(own: OwnTipModel, m: OwnMark): string[] {
  if (m.kind === 'ev') {
    return m.orderIds.map((id) => {
      const o = own.orders[id]!;
      return `조건 근거 ${o.evidenceLabel ?? '—'} · ${orderNoText(o.orderNo)}`;
    });
  }
  return m.fillIds.map((id) => {
    const f = own.fills[id]!;
    const head = `우리 체결 ${fmtQty(f.qty)}주`;
    if (m.kind === 'nofill') {
      const tail = f.state === 'pending' ? '전문 아직 안 옴' : '짝 전문 없음';
      return `${head}${acctTail(f.accountNo)} · ${orderNoText(f.orderNo)} · ${tail}`;
    }
    const part = f.total > f.qty ? ` / 전체 ${fmtQty(f.total)}주` : '';
    return `${head}${part}${acctTail(f.accountNo)} · ${orderNoText(f.orderNo)}${f.est ? ' · 추정' : ''}`;
  });
}

const ownKeyOf = (m: OwnMark) => (m.kind === 'nofill' ? `nf${m.fillIds[0]}` : `${m.kind === 'ev' ? 'e' : 'f'}${m.rec}`);
/** 판 안에 보이는 점(가격 판 클립 안) — 판 밖으로 잘린 점은 툴팁에도 올리지 않는다. */
const ownVisible = (m: OwnMark, p: TickPanels, r: number) => m.cy >= p.y1a - r && m.cy <= p.y1b + r;

/**
 * 가격 판 안 · 가로 R + 3px 안(판 안에 보이는) 우리 점 중 세로로 가장 가까운 것(같으면 위에 그린 것)의 줄 · 없으면 null.
 * key = `own:{점}`.
 */
export function tickOwnTipOf(
  marks: readonly OwnMark[],
  own: OwnTipModel,
  mx: number,
  my: number,
  p: TickPanels,
  r: number = OWN_MARK_R.desktop,
): TickOwnTip | null {
  if (my < p.y1a || my > p.y1b) return null;
  let best: OwnMark | null = null;
  let bestDy = Infinity;
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i]!;
    if (Math.abs(mx - m.cx) > r + OWN_MARK_HIT_PAD || !ownVisible(m, p, r)) continue;
    const dy = Math.abs(my - m.cy);
    if (dy < bestDy) {
      bestDy = dy;
      best = m;
    }
  }
  return best === null ? null : { key: `own:${ownKeyOf(best)}`, lines: tickOwnLinesOf(own, best), mark: best };
}

/**
 * 가격 판 hover 에 우리 줄 합치기 — 팀 hover(씨앗 원)가 있으면 씨앗 가로 ± 5px 안 보이는 우리 점(그리기 순서) + 마우스 자리
 * 우리 점의 줄을 팀 줄 뒤에 덧붙인다(팀 줄 · 고리 그대로 · 없으면 팀 hover 그 객체). 팀 hover 가 없으면 우리 줄만(circle null).
 */
export function tickHoverWithOwn(
  team: TickHover | null,
  marks: readonly OwnMark[],
  own: OwnTipModel,
  mx: number,
  my: number,
  p: TickPanels,
  r: number = OWN_MARK_R.desktop,
): TickHover | null {
  if (marks.length === 0) return team;
  const at = tickOwnTipOf(marks, own, mx, my, p, r);
  const seed = team?.circle ?? null;
  if (team === null || seed === null) {
    if (at === null) return team;
    return { key: at.key, lines: at.lines, circle: null };
  }
  const near = marks.filter(
    (m) => (Math.abs(m.cx - seed.cx) <= TICK_GROUP_HALF_WIDTH && ownVisible(m, p, r)) || m === at?.mark,
  );
  if (near.length === 0) return team;
  return {
    ...team,
    key: `${team.key}|own:${near.map(ownKeyOf).join(',')}`,
    lines: [...team.lines, ...near.flatMap((m) => tickOwnLinesOf(own, m))],
  };
}
