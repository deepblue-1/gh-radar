/**
 * launch-map — 발사 경계 지도 패널 순수 기하 (Phase 35 · D-16 ~ D-19).
 *
 * - 정본: 계산 = gh-trade 첨부 `launch-gate-map.html` 의 `drawPanel()` · 화면 = 채택 목업
 *   `reference/mockup-launch-gate-map.html`(좁은 축 · 마름모 · 「날짜별 표 보기」). 컴포넌트(`LaunchGateChart`)는
 *   그리기만 하고 축 · 눈금 · 쌓기 · 띠 · 리본 칸 · 표식 · 툴팁은 여기서 테스트가 잠근다.
 * - **경계 · 리본 값은 shared 한 벌**(`launchDaysOf` · `launchRibbonAt`) — 여기는 그것을 좌표로 옮길 뿐이다.
 * - **이상치 상한(Pitfall 4):** 10/26 N 의 −20,148µs 오발처럼 한 점이 축을 수천 배 늘리지 않게, 축은 중앙값 ± 상한
 *   (q16 300 · n0930 100µs) 안의 값으로만 잡는다. 밖의 점은 축 끝에 고정하고 컴포넌트가 바깥 표식(◂/▸)을 붙인다.
 *   눈금 ≤ 12개 · 간격 ≥ 28px · 리본 칸 수 ≤ 그림 폭 px 로 SVG 노드 수가 폭에 비례한다.
 * - 단위: µs(발사 기준시각 대비 송신 시각 · 왼쪽이 이름) · 폭 W 는 `useChartWidth` 실측과 viewBox 1:1(글자 11px 고정).
 */

import {
  launchFireOf,
  launchRibbonAt,
  type LaunchDay,
  type LaunchFire,
  type LaunchHeadRow,
  type LaunchRange,
  type LaunchRibbonCell,
} from '@gh-radar/shared';

import { fmtUs, resultToneOf, type LaunchResultTone } from './launch-format';

/**
 * 패널 배치 — 그림 영역 x = [L, W − R] · 첫 행 위끝 T · 날짜 행 RH · 행과 리본 사이 GAP_R · 리본 RIBBON_H ·
 * 아래 눈금 글 TICK_H · 점 반지름 DOT_R · 같은 µs 세로 간격 STACK_DY · 눈금 상한 TICK_MAX 개 · 눈금 최소 간격 TICK_MIN_PX.
 */
export const LAUNCH_CHART = {
  W_MIN: 640,
  L: 58,
  R: 14,
  T: 22,
  RH: 24,
  RIBBON_H: 40,
  GAP_R: 32,
  TICK_H: 22,
  DOT_R: 4.5,
  STACK_DY: 4,
  TICK_MAX: 12,
  TICK_MIN_PX: 28,
} as const;

/** 축 상한(µs) — 중앙값 ± 이 값 밖은 축을 늘리지 않는다. */
const AXIS_CAP: Record<LaunchFire, number> = { q16: 300, n0930: 100 };

/** 이 폭(µs)을 넘는 값 묶음은 넓은 축(여유 8 · 10 단위), 아니면 좁은 축(여유 3 · 1 단위). */
const WIDE_SPAN = 40;

export type LaunchOffAxis = 'lo' | 'hi' | null;

export interface LaunchAxis {
  xmin: number;
  xmax: number;
  /** 축 밖이면 쪽('lo' = 왼쪽 밖 · 'hi' = 오른쪽 밖), 안이면 null. */
  offAxis: (v: number) => LaunchOffAxis;
}

/** 최소 · 최대로 축을 만든다(테스트 · 강제 축용). */
export function launchAxisFrom(xmin: number, xmax: number): LaunchAxis {
  return { xmin, xmax, offAxis: (v) => (v < xmin ? 'lo' : v > xmax ? 'hi' : null) };
}

/** 정렬된 배열의 아래 중앙값 — 실제 값 하나라 core 가 비지 않는다. */
function lowerMedian(sorted: readonly number[]): number {
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
}

/**
 * 축 — 첨부 식(:170-173)에 상한을 더했다. m = values 아래 중앙값(비면 next ?? 0) · core = m ± cap 안의 values +
 * (next 가 m ± cap 안이면 next) · span = max − min · span > 40 이면 여유 8 · 10 단위, 아니면 여유 3 · 1 단위 ·
 * xmin = floor((min − pad)/unit)·unit · xmax = ceil((max + pad)/unit)·unit.
 */
export function launchAxisOf(values: readonly number[], next: number | null, fire: LaunchFire): LaunchAxis {
  const cap = AXIS_CAP[fire];
  const sorted = [...values].sort((a, b) => a - b);
  const m = sorted.length > 0 ? lowerMedian(sorted) : (next ?? 0);
  const near = (v: number) => Math.abs(v - m) <= cap;
  const core = sorted.filter(near);
  if (next !== null && near(next)) core.push(next);
  if (core.length === 0) core.push(m);
  const lo = Math.min(...core);
  const hi = Math.max(...core);
  const wide = hi - lo > WIDE_SPAN;
  const pad = wide ? 8 : 3;
  const unit = wide ? 10 : 1;
  return launchAxisFrom(Math.floor((lo - pad) / unit) * unit, Math.ceil((hi + pad) / unit) * unit);
}

/** 1 · 2 · 5 × 10^k 다음 값(> step). */
function nextNice(step: number): number {
  const exp = Math.floor(Math.log10(step) + 1e-9);
  const base = 10 ** exp;
  const f = Math.round((step / base) * 1e6) / 1e6;
  if (f < 1) return base;
  if (f < 2) return 2 * base;
  if (f < 5) return 5 * base;
  return 10 * base;
}

/** 부동소수 꼬리 정리(0.2 단계 누적 오차). */
const tidy = (v: number): number => Math.round(v * 1e6) / 1e6;

/**
 * 눈금 — 기본 step = 폭 > 200 이면 20 · > 40 이면 10 · 아니면 2(µs). 개수 > 12 이거나 간격 < 28px 이면 다음 nice step
 * (1 · 2 · 5 × 10^k) 으로 올린다. 값 = step 배수 중 [xmin, xmax].
 */
export function launchTicksOf(axis: LaunchAxis, plotPx: number): { step: number; values: number[] } {
  const span = axis.xmax - axis.xmin;
  let step = span > 200 ? 20 : span > 40 ? 10 : 2;
  const countOf = (s: number) => Math.floor(axis.xmax / s) - Math.ceil(axis.xmin / s) + 1;
  while (
    span > 0 &&
    (countOf(step) > LAUNCH_CHART.TICK_MAX || (step / span) * plotPx < LAUNCH_CHART.TICK_MIN_PX)
  ) {
    step = nextNice(step);
  }
  const first = Math.ceil(axis.xmin / step);
  const last = Math.floor(axis.xmax / step);
  const values: number[] = [];
  for (let i = first; i <= last; i++) values.push(tidy(i * step));
  return { step, values };
}

/** µs → x · 선형 · 축 밖은 끝(left · right)으로 고정. */
export function xOfUs(v: number, axis: LaunchAxis, left: number, right: number): number {
  const span = axis.xmax - axis.xmin;
  if (span <= 0) return (left + right) / 2;
  const c = Math.min(axis.xmax, Math.max(axis.xmin, v));
  return left + ((c - axis.xmin) / span) * (right - left);
}

/**
 * 같은 µs 쌓기 — 입력 순서 그대로 dy 배열. 같은 sent_rel_us 묶음 k개 안 i번째 dy = (i − (k − 1)/2) · 4
 * (그날 행 중심 기준 대칭).
 */
export function launchStackOf(pieces: readonly { sent_rel_us: number }[]): number[] {
  const total = new Map<number, number>();
  for (const p of pieces) total.set(p.sent_rel_us, (total.get(p.sent_rel_us) ?? 0) + 1);
  const seen = new Map<number, number>();
  return pieces.map((p) => {
    const i = seen.get(p.sent_rel_us) ?? 0;
    seen.set(p.sent_rel_us, i + 1);
    const k = total.get(p.sent_rel_us)!;
    return (i - (k - 1) / 2) * LAUNCH_CHART.STACK_DY;
  });
}

export type LaunchBandKind = 'gate' | 'reject_after' | 'accept_before';

export interface LaunchBand {
  kind: LaunchBandKind;
  x0: number;
  x1: number;
}

/** gate 띠 최소 폭(px) — lo 와 hi 가 붙어도 보이게(첨부 :189). */
const GATE_MIN_PX = 2;

/**
 * 그날 경계 띠(첨부 :189-191) — 경계 = lo~hi(최소 폭 2px) · 전부 거부 = lo 부터 오른쪽 끝 · 전부 접수 = 왼쪽부터 hi ·
 * 판단 불가 = null.
 */
export function launchGateBandOf(
  day: Pick<LaunchDay<unknown>, 'lo' | 'hi'>,
  axis: LaunchAxis,
  left: number,
  right: number,
): LaunchBand | null {
  const x = (v: number) => xOfUs(v, axis, left, right);
  const { lo, hi } = day;
  if (lo !== null && hi !== null) {
    const x0 = Math.min(x(lo), x(hi));
    return { kind: 'gate', x0, x1: x0 + Math.max(Math.abs(x(hi) - x(lo)), GATE_MIN_PX) };
  }
  if (lo !== null) return { kind: 'reject_after', x0: x(lo), x1: right };
  if (hi !== null) return { kind: 'accept_before', x0: left, x1: x(hi) };
  return null;
}

/**
 * 패널의 다음 첫 조각(µs) — q16 = Q16 머리 · n0930 = N 머리의 next_offset_us(같은 서버 · 시장 · 발사 기준).
 * 여러 행이면 가장 최근 거래일. 없거나 값이 null 이면 null(백필 머리 · 계획 어드민 전환 뒤 빈 값 — 점선 없음).
 */
export function mapNextOffsetOf(
  heads: readonly LaunchHeadRow[],
  gateway: string,
  market: string,
  fire: LaunchFire,
): number | null {
  const profile = fire === 'q16' ? 'Q16' : 'N';
  const mine = heads
    .filter((h) => h.gateway === gateway && h.market === market && h.profile === profile && launchFireOf(h) === fire)
    .sort((a, b) => (a.trade_date < b.trade_date ? 1 : a.trade_date > b.trade_date ? -1 : 0));
  return mine[0]?.next_offset_us ?? null;
}

/** 거래일(`YYYYMMDD` · `YYYY-MM-DD`) → 「MM/DD」. */
export function launchDateLabelOf(date: string): string {
  const d = date.replace(/\D/g, '');
  return d.length >= 8 ? `${d.slice(4, 6)}/${d.slice(6, 8)}` : date;
}

// ─────────────────────────────────────────────────────────────────────────────
// 「쐈다면」 리본 · 표식 · 툴팁
// ─────────────────────────────────────────────────────────────────────────────

export interface LaunchRibbon {
  /** 칸 폭(µs) */
  stepR: number;
  /** 칸 v = xmin + i·stepR(정수 i) · 값 = shared `launchRibbonAt(days, v)` */
  cells: (LaunchRibbonCell & { v: number })[];
}

/**
 * 리본 칸(첨부 :174-185 · 목업 :207) — stepR = 축 폭 > 100 이면 1 · 아니면 0.2(µs). 칸 수(v < xmax) > plotPx 면 stepR 을
 * 다음 nice(1 · 2 · 5 × 10^k)로 올린다 — SVG 노드 수가 그림 폭에 비례. 칸 v 는 정수 i 로 계산(부동소수 누적 금지).
 */
export function launchRibbonCellsOf(
  days: readonly LaunchDay<unknown>[],
  axis: LaunchAxis,
  plotPx: number,
): LaunchRibbon {
  const span = axis.xmax - axis.xmin;
  if (span <= 0) return { stepR: 1, cells: [] };
  let stepR = span > 100 ? 1 : 0.2;
  const countOf = (s: number) => Math.ceil(tidy(span / s));
  while (countOf(stepR) > Math.max(1, Math.floor(plotPx))) stepR = nextNice(stepR);
  const n = countOf(stepR);
  const cells: LaunchRibbon['cells'] = [];
  for (let i = 0; i < n; i++) {
    const v = tidy(axis.xmin + i * stepR);
    cells.push({ v, ...launchRibbonAt(days, v) });
  }
  return { stepR, cells };
}

export interface LaunchMark {
  shape: 'circle' | 'diamond';
  tone: LaunchResultTone;
}

/**
 * 점 표식(D-17 · 오케스트레이터 결정 5) — 09:00:30 합패널의 매도(A 매도 다리)만 마름모 · 그 밖(N 매수 · side null(D-08) ·
 * 16:00 전부)은 원. 색 축은 결과(`resultToneOf` — 접수 · 101/515 · 기타).
 */
export function launchMarkOf(piece: { side: string | null; result: string }, fire: LaunchFire): LaunchMark {
  return {
    shape: fire === 'n0930' && piece.side === 'sell' ? 'diamond' : 'circle',
    tone: resultToneOf(piece.result),
  };
}

/** 마름모 경로 — 중심 (cx, cy) · 꼭짓점까지 r. */
export function diamondPathOf(cx: number, cy: number, r: number): string {
  return `M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy} Z`;
}

const SIDE_TIP: Readonly<Record<string, string>> = { buy: '매수', sell: '매도' };

/**
 * 점 `<title>` — q16 「MM/DD −350µs · wire 2 · 101」 · n0930 「MM/DD −20,148µs · wire 0 · 매수 · 101 · 재전송 2」
 * (side null 「구분 없음」 · retry 0/null 이면 재전송 조각 생략) · 축 밖이면 끝에 「 · 축 밖」.
 * 재전송 1·2·3회는 점을 따로 그리지 않고 여기 횟수로만 싣는다(첫 발 송신 시각 점 하나).
 */
export function launchTooltipOf(
  date: string,
  piece: { sent_rel_us: number; wire: number; side: string | null; result: string; retry: number | null },
  fire: LaunchFire,
  offAxis = false,
): string {
  const parts = [`${launchDateLabelOf(date)} ${fmtUs(piece.sent_rel_us)}µs`, `wire ${piece.wire}`];
  if (fire === 'n0930') parts.push(piece.side === null ? '구분 없음' : (SIDE_TIP[piece.side] ?? piece.side));
  parts.push(piece.result);
  if (fire === 'n0930' && piece.retry) parts.push(`재전송 ${piece.retry}`);
  if (offAxis) parts.push('축 밖');
  return parts.join(' · ');
}

/**
 * 점 위 즉시 툴팁(사용자 UAT 2026-10-27 — 「점에 마우스를 대면 −247µs 처럼」) — 큰 줄 = 송신 µs 하나,
 * 작은 줄 = 날짜 · wire · (n0930 매수/매도) · 결과 · (재전송) · (축 밖). `<title>` 과 같은 재료를 두 줄로 나눈 것.
 */
export function launchHoverOf(
  date: string,
  piece: { sent_rel_us: number; wire: number; side: string | null; result: string; retry: number | null },
  fire: LaunchFire,
  offAxis = false,
): { value: string; detail: string } {
  const parts = [launchDateLabelOf(date), `wire ${piece.wire}`];
  if (fire === 'n0930') parts.push(piece.side === null ? '구분 없음' : (SIDE_TIP[piece.side] ?? piece.side));
  parts.push(piece.result);
  if (fire === 'n0930' && piece.retry) parts.push(`재전송 ${piece.retry}`);
  if (offAxis) parts.push('축 밖');
  return { value: `${fmtUs(piece.sent_rel_us)}µs`, detail: parts.join(' · ') };
}

// ─────────────────────────────────────────────────────────────────────────────
// 지도 탭 — 범위 글
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 지도 응답 days(거래일 내림차순) → 실제 범위 글 「MM/DD ~ MM/DD · N거래일」(가장 이른 ~ 가장 늦은) · 1일
 * 「MM/DD · 1거래일」 · 빈 배열 null. 프리셋 칩(10d · 20d · all)이 실제로 덮은 날을 응답 기준으로 보인다(D-15).
 */
export function launchRangeOf(days: readonly string[]): string | null {
  if (days.length === 0) return null;
  const sorted = [...days].sort();
  const from = launchDateLabelOf(sorted[0]!);
  const to = launchDateLabelOf(sorted[sorted.length - 1]!);
  return days.length === 1 ? `${to} · 1거래일` : `${from} ~ ${to} · ${days.length}거래일`;
}

/** `?range=` 원문 → '10d' | '20d' | 'all' (그 밖 null — 호출부가 기본 10d 로 정본화). */
export function launchRangeParamOf(raw: string | null | undefined): LaunchRange | null {
  return raw === '10d' || raw === '20d' || raw === 'all' ? raw : null;
}
