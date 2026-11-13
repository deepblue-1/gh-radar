/**
 * 봉 차트 수익률 판 계산(Phase 42 D-13 ~ D-15 · UI-SPEC S6) — 순수 함수.
 *
 * ① 당일 수익률(보라 · 오른쪽 눈금) = 팀 거래정보 패널 「평단 대비 수익률」 과 **같은 함수** `teamKpiAt(team, session, rec).pnl.ret`
 *   의 시계열(정의를 새로 만들지 않는다 · 38 D-16). 값 = (실현 + 미실현) ÷ 누적 매수 금액(shared team-pnl `ret`).
 *   점 = 보기 창 그림 폭 1px 열마다 그 열 끝 시각의 마지막 틱 rec(앞 열과 같으면 건너뜀) + 보기 창 안 팀 체결 rec + 커서 rec —
 *   커서 x 에서 선이 패널 값을 정확히 지난다(RESEARCH Pitfall 6). 팀 첫 매수 전 · 매수 금액 0 이면 null(선 끊김).
 * ② 누적 수익률(회색 · 왼쪽 눈금) = (그 시각 가격 − 그 시각 누적 평단) ÷ 누적 평단 — **미실현만**. 누적 평단 `px` ≤ 0 · 첫 점 전은 끊김.
 *   **두 선의 정의가 다르다** — 당일은 매수 금액 대비 실현 + 미실현, 누적은 평단 대비 가격.
 * ③ 두 눈금 0% 맞춤(UI-SPEC S6 · Researcher Decision 7) — 선마다 위 · 아래 최대에 12% + 0.05%p 여유 → 0% 높이 비율 z ·
 *   두 선 중 큰 z 를 0.15 ~ 0.85 로 묶어 같이 쓰고 선마다 단위 = max(위 ÷ z, 아래 ÷ (1 − z)). 0% 선은 하나.
 * ④ 그리기는 컴포넌트(42-05 · 42-06 · 42-10) · 계산은 여기서 테스트가 잠근다.
 */

import type { PricePoint, View } from '@/lib/accum-chart';

import { teamKpiAt } from './team-model';
import { msOfNs, priceIdxAt, priceSeriesOf } from './tick-chart';
import { MINUS } from './tick-format';
import type { TickSession } from './tick-session';

/** 수익률 점 — t = 수신 ms · v = 비율(0.032 = +3.2% · null = 끊김) · rec = 그 점 레코드(없으면 −1). */
export interface ReturnPoint {
  t: number;
  v: number | null;
  rec: number;
}

/** 그 rec 의 당일 팀 수익률 — 패널 「평단 대비 수익률」 과 같은 계산(rec −1 · 첫 매수 전 · 매수 0 이면 null). */
export function dayReturnAt(session: TickSession, rec: number): number | null {
  return rec < 0 ? null : (teamKpiAt(session.team, session, rec).pnl?.ret ?? null);
}

/** 보기 창 그림 폭 열마다 그 열 끝 시각 이하 마지막 가격 점 색인(앞 열과 같으면 건너뜀 · 가격 전이면 없음). */
function columnIdxOf(session: TickSession, view: View, plotW: number): number[] {
  const s = priceSeriesOf(session);
  const cols = Math.max(1, Math.ceil(plotW));
  const span = view.t1 - view.t0 || 1;
  const out: number[] = [];
  let prev = -2;
  for (let c = 0; c < cols; c++) {
    const i = priceIdxAt(s, view.t0 + ((c + 1) / cols) * span);
    if (i >= 0 && i !== prev) out.push(i);
    prev = i;
  }
  return out;
}

/**
 * 당일 수익률 점(t 오름차순 · 같은 t 는 거래소순) — 열 샘플 + 보기 창 안 팀 체결 rec + 커서 rec(−1 이면 없음).
 * 팀 체결이 하루에 하나도 없으면 []. 커서 rec 는 창 밖이어도 넣는다(값 띠 · 커서 점이 같은 값을 쓴다).
 */
export function dayReturnPointsOf(session: TickSession, view: View, plotW: number, cursorRec: number): ReturnPoint[] {
  const team = session.team;
  if (team.fills.length === 0) return [];
  const s = priceSeriesOf(session);
  const recv = session.index.recvNs;
  const recs = new Set<number>();
  for (const i of columnIdxOf(session, view, plotW)) recs.add(s.rec[i]!);
  for (const f of team.fills) {
    const ms = msOfNs(recv[f.rec]!);
    if (ms >= view.t0 && ms <= view.t1) recs.add(f.rec);
  }
  if (cursorRec >= 0) recs.add(cursorRec);
  const pos = session.exPos;
  return [...recs]
    .map((rec) => ({ t: msOfNs(recv[rec]!), v: dayReturnAt(session, rec), rec }))
    .sort((a, b) => a.t - b.t || pos[a.rec]! - pos[b.rec]!);
}

/**
 * 커서 없는 당일 점(`dayReturnPointsOf(…, −1)`)에 **보기 창 안** 커서 rec 점 하나만 정렬 자리에 끼운다(재생 · 커서 이동마다 열 샘플 ·
 * 점마다 `teamKpiAt` 을 처음부터 다시 하지 않게 — 커서 점 하나만 새로 계산). 커서가 −1 · 창 밖 · 이미 점에 있음 · 팀 체결 없는
 * 하루면 `base` 그대로(같은 객체). 창 안 커서면 결과 = `dayReturnPointsOf(session, view, plotW, cursorRec)` 와 같다.
 */
export function withCursorReturnPoint(
  base: readonly ReturnPoint[],
  session: TickSession,
  view: View,
  cursorRec: number,
): readonly ReturnPoint[] {
  if (cursorRec < 0 || session.team.fills.length === 0) return base;
  const t = msOfNs(session.index.recvNs[cursorRec]!);
  if (t < view.t0 || t > view.t1) return base;
  if (base.some((p) => p.rec === cursorRec)) return base;
  const pos = session.exPos;
  const before = (p: ReturnPoint) => p.t < t || (p.t === t && pos[p.rec]! < pos[cursorRec]!);
  let lo = 0;
  let hi = base.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (before(base[mid]!)) lo = mid + 1;
    else hi = mid;
  }
  return [...base.slice(0, lo), { t, v: dayReturnAt(session, cursorRec), rec: cursorRec }, ...base.slice(lo)];
}

// ---------------------------------------------------------------------------
// 누적 수익률(D-15 · 미실현만)
// ---------------------------------------------------------------------------

/**
 * 시각 t 의 누적 평단 — t 이하 마지막 점(같은 ms 두 점이면 뒤 점 · 점은 시각 오름차순 = `avgPxPointsOf` 순서).
 * 첫 점 전 · 그 점 `px` ≤ 0(등록 포지션 없음) 이면 null.
 */
export function cumAvgAt(pts: readonly PricePoint[], t: number): number | null {
  let lo = 0;
  let hi = pts.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (pts[mid]![0] <= t) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return null;
  const px = pts[lo - 1]![1];
  return px > 0 ? px : null;
}

/**
 * 누적 수익률 점(t 오름차순) — v = (그 시각 가격 − 그 시각 누적 평단) ÷ 누적 평단(미실현만 · 당일 수익률과 정의가 다르다).
 * 점 = 당일 수익률과 같은 열 샘플(t = 그 가격 점 수신 ms) + 보기 창 안 누적 평단 계단 바뀌는 시각마다 하나.
 * 누적 평단 null(첫 점 전 · px ≤ 0) · 그 시각 가격 없음이면 v null(끊김) · rec = 그 가격 점 rec(없으면 −1). 누적 평단 [] → [].
 */
export function cumReturnPointsOf(
  session: TickSession,
  view: View,
  plotW: number,
  cumAvg: readonly PricePoint[],
): ReturnPoint[] {
  if (cumAvg.length === 0) return [];
  const s = priceSeriesOf(session);
  const at = (t: number, i: number): ReturnPoint => {
    if (i < 0) return { t, v: null, rec: -1 };
    const a = cumAvgAt(cumAvg, t);
    const px = s.px[i]!;
    return { t, v: a === null ? null : (px - a) / a, rec: s.rec[i]! };
  };
  const out: ReturnPoint[] = [];
  for (const i of columnIdxOf(session, view, plotW)) out.push(at(s.t[i]!, i));
  for (const [t] of cumAvg) {
    if (t >= view.t0 && t <= view.t1) out.push(at(t, priceIdxAt(s, t)));
  }
  return out.sort((a, b) => a.t - b.t);
}

// ---------------------------------------------------------------------------
// 두 눈금 · 0% 맞춤(D-13 · UI-SPEC S6 Researcher Decision 7)
// ---------------------------------------------------------------------------

/** 위 · 아래 최대에 더하는 여유 비율(12%). */
export const RETURN_PAD_RATIO = 0.12;
/** 위 · 아래 최대에 더하는 여유 절댓값(0.05%p) — 값이 0 이어도 단위가 0 이 되지 않는다. */
export const RETURN_PAD_ABS = 0.0005;
/** 0% 높이 비율 z 묶음 — 0.15 ~ 0.85. */
export const RETURN_Z_MIN = 0.15;
export const RETURN_Z_MAX = 0.85;

/**
 * 수익률 판 눈금 — 그림 영역 [top, bottom] = [판 위 + 4, 판 아래 − 3] · 0% 높이 zeroY(두 선 공유) ·
 * y 함수(당일 · 누적 — 누적 점 없으면 null) · 위 끝 · 아래 끝 값(눈금 글자 — 누적 없으면 null).
 */
export interface ReturnScales {
  top: number;
  bottom: number;
  /** 0% 위쪽 높이 비율(위 ÷ (위 + 아래) · 두 선 중 큰 쪽 · 0.15 ~ 0.85). */
  z: number;
  zeroY: number;
  yDay: (v: number) => number;
  yCum: ((v: number) => number) | null;
  /** 판 위 끝 · 아래 끝의 당일 수익률 값(z × 단위 · −(1 − z) × 단위). */
  dayTop: number;
  dayBottom: number;
  cumTop: number | null;
  cumBottom: number | null;
}

/** 선 하나의 여유 더한 위 · 아래 최대(값 없으면 null). */
function paddedExtentOf(pts: readonly ReturnPoint[]): { up: number; dn: number } | null {
  let mx = Number.NEGATIVE_INFINITY;
  let mn = Number.POSITIVE_INFINITY;
  for (const p of pts) {
    if (p.v === null || !Number.isFinite(p.v)) continue;
    if (p.v > mx) mx = p.v;
    if (p.v < mn) mn = p.v;
  }
  if (mx === Number.NEGATIVE_INFINITY) return null;
  const pad = (a: number) => a * (1 + RETURN_PAD_RATIO) + RETURN_PAD_ABS;
  return { up: pad(Math.max(0, mx)), dn: pad(Math.max(0, -mn)) };
}

/**
 * 두 눈금 0% 맞춤 — 선마다 z = 위 ÷ (위 + 아래) · 점 있는 선들 중 큰 z 를 [0.15, 0.85] 로 묶어 같이 쓴다(점 있는 선 없음 → 0.5) ·
 * 선 단위 u = max(위 ÷ z, 아래 ÷ (1 − z)) · `y(v) = top + (z − v / u) × (bottom − top)`. 0% 선은 하나(`zeroY`).
 * 호출부는 보기 창 안 점을 준다(null 은 건너뜀). 당일 점이 없어도 `yDay` 는 있다(여유 절댓값만의 단위).
 */
export function returnScalesOf(
  day: readonly ReturnPoint[],
  cum: readonly ReturnPoint[],
  yRa: number,
  yRb: number,
): ReturnScales {
  const top = yRa + 4;
  const bottom = yRb - 3;
  const h = bottom - top;
  const ed = paddedExtentOf(day);
  const ec = paddedExtentOf(cum);
  const zs = [ed, ec].filter((e) => e !== null).map((e) => e.up / (e.up + e.dn));
  const z = zs.length === 0 ? 0.5 : Math.min(RETURN_Z_MAX, Math.max(RETURN_Z_MIN, Math.max(...zs)));
  const unitOf = (e: { up: number; dn: number }) => Math.max(e.up / z, e.dn / (1 - z));
  const yOf = (u: number) => (v: number) => top + (z - v / u) * h;
  const uDay = unitOf(ed ?? { up: RETURN_PAD_ABS, dn: RETURN_PAD_ABS });
  const uCum = ec === null ? null : unitOf(ec);
  return {
    top,
    bottom,
    z,
    zeroY: top + z * h,
    yDay: yOf(uDay),
    yCum: uCum === null ? null : yOf(uCum),
    dayTop: z * uDay,
    dayBottom: -(1 - z) * uDay,
    cumTop: uCum === null ? null : z * uCum,
    cumBottom: uCum === null ? null : -(1 - z) * uCum,
  };
}

// ---------------------------------------------------------------------------
// 경로 · 눈금 글자
// ---------------------------------------------------------------------------

const f1 = (v: number) => Math.round(v * 10) / 10;

/** 수익률 꺾은선 — 점을 차례로 잇고 null 에서 끊는다(점 하나뿐인 조각은 그리지 않는다) · 좌표 소수 1자리. */
export function returnPathOf(
  pts: readonly ReturnPoint[],
  x: (t: number) => number,
  y: (v: number) => number,
): string {
  let d = '';
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 2) d += `M${run.join('L')}`;
    run = [];
  };
  for (const p of pts) {
    if (p.v === null || !Number.isFinite(p.v)) {
      flush();
      continue;
    }
    run.push(`${f1(x(p.t))},${f1(y(p.v))}`);
  }
  flush();
  return d;
}

/** 눈금 글자 — 부호 + 소수 1자리 퍼센트 「+3.2%」 「−1.5%」(MINUS) · 반올림이 0 이면 「0.0%」 · 수가 아니면 「—」. */
export function fmtReturnTick(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.round(Math.abs(v) * 1000) / 10;
  if (a === 0) return '0.0%';
  return `${v > 0 ? '+' : MINUS}${a.toFixed(1)}%`;
}
