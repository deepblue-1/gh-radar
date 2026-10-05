/**
 * limitup-lanes — 상한가 보고서 사건 카드 레인 · 창구 지문표 · 어제 결과의 순수 계산 (Phase 28 Plan 13 · D-11 · D-12).
 *
 * ★ 창 · 마커 규칙은 gh-trade 와 같고 그림 규칙은 UI-SPEC ④-4 다. 정의 정본 = gh-trade
 *   `server/tools/analysis/tickana/report.py`:
 *   - 상수 · `_anchor_ns`(543~560행) — 기준 시각 = 첫 상한 체결 → t{detect_rate_pct} → t25 → t20 → t15 → 첫 잠김 시작
 *   - `_section_a_cards` · `_card`(600~700행) — 레인 1 「진입 10분」 창 [a − ENTRY_WINDOW_S, a + MEMBER_WINDOW_S] ·
 *     레인 2 「잠김 전 구간」 창 [첫 잠김 시작 − 120, 마지막 잠김 끝 + MEMBER_WINDOW_S] · `_clip_secs`(09:00 ~ 15:30 − 1초) ·
 *     ▼ = burst_sell · ✕ = cancel · ● = 깨진 잠김의 끝 · 사실 문장 정렬(t 없음 뒤 → t → event_no → fact_no) ·
 *     창구 막대(진입 1분 매수 · 마지막 깨진 잠김의 깨짐 전 1분 매도)
 *   - `_section_c_fingerprint`(826~880행) — 평균 · 「선행/관여 깨진 잠김」 · 「유지/관여 잠김」 · `MIN_FINGERPRINT_EVENTS = 10`
 *   - `_section_yesterday`(889~935행) — 이전 적재 날짜 잠김의 D+1 시가 손익
 *   - `facts.py` `_member_fact`(111~121행) — values `m{k}` · `m{k}_code` · `s{k}`(% 소수 1자리 또는 「—」)
 *   웹이 gh-trade 와 다르게 그리는 곳(UI-SPEC ④-4 · R-6): 레인 1 은 가격(위) + 매도벽(아래)을 한 레인에 겹쳐 그리고
 *   마커는 25% 도달 · 매도벽 소진 · 첫 상한가 체결 3개다(gh-trade 의 ▲ 매도벽 먹기 대신). 레인 2 의 마커는 RPC 가
 *   종목마다 krw 큰 순 40개로 자른 것이고, 글자 라벨은 가장 큰 ▼ · ✕ 하나씩 + 최대 점 + 깨짐만 단다(나머지는 title).
 *
 * 좌표: 레인 SVG 는 `viewBox="0 0 100 100"` + `preserveAspectRatio="none"` 이다. 모든 x · y 를 0~100(%)로 정규화해
 * 돌려주므로 SVG 경로와 HTML 오버레이(left/top %)가 같은 값을 쓴다. 하루 초 = KST 00:00 기준(`kstSecOf`).
 * 억 표기 `formatEok` · 주 수 `formatGroup` · 음수 부호 U+2212.
 */

import {
  formatEok,
  formatGroup,
  memberName,
  type LimitupDate,
  type LimitupEntryRow,
  type LimitupFactRow,
  type LimitupFingerprintRow,
  type LimitupGridCol,
  type LimitupGridFile,
  type LimitupLockRow,
  type LimitupMarkRow,
} from '@gh-radar/shared';

import { fmtRet } from './limit-up-format';
import { fmtYmdShort, kstClock, kstSecOf } from './limitup-report';

const DASH = '—';
const MINUS = '−';

/** 장 시작 · 끝(하루 초). 창은 [09:00, 15:30 − 1초] 로 자른다(gh-trade `_clip_secs`). */
export const SECS_START = 32_400;
export const SECS_END = 55_800;
/** 레인 1 「진입 10분」 — 기준 시각 앞 600초 · 뒤 60초. */
export const ENTRY_WINDOW_S = 600;
export const MEMBER_WINDOW_S = 60;
/** 레인 2 — 첫 잠김 시작 앞 120초. */
export const LOCK_LEAD_S = 120;
/** 기준선 10억(사용자 가설 기준선 — 선만 그린다). */
export const LANE_BASELINE_KRW = 1_000_000_000;
/** 레인 2 y 하한(20억) — 하루 격자 스파크와 같은 바닥(기준선 10억이 늘 아래 절반 안에 보인다). */
const LANE_Y_FLOOR_KRW = 2_000_000_000;
/** gh-trade `MIN_FINGERPRINT_EVENTS` — 관여 사건이 이 미만이면 「관찰 중」. */
export const MIN_FINGERPRINT_EVENTS = 10;
/** 사건 카드 머리 잠김 태그 최대 개수 — 넘치면 「+N」. */
export const MAX_LOCK_TAGS = 6;

// 레인 1 의 위 · 아래 절반(y 0~100 · 위 0).
const PRICE_TOP = 8;
const PRICE_BOTTOM = 46;
const WALL_TOP = 56;
const WALL_BOTTOM = 100;
// 레인 2 의 곡선 띠 — 위 8% 는 라벨 자리.
const LOCK_TOP = 8;

const r2 = (v: number) => Math.round(v * 100) / 100;

function hhmm(sec: number): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(sec / 3600))}:${p(Math.floor((sec % 3600) / 60))}`;
}

function clockSec(sec: number): string {
  return `${hhmm(sec)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

function clip(lo: number, hi: number): [number, number] {
  return [Math.max(lo, SECS_START), Math.min(hi, SECS_END - 1)];
}

function nonEmpty(s: string | null | undefined): s is string {
  return s != null && s !== '';
}

// ---------------------------------------------------------------------------
// 격자 시리즈
// ---------------------------------------------------------------------------

export interface GridPoint {
  sec: number;
  v: number | null;
}

function num(v: number | boolean | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * 격자 열 `col` 의 [loSec, hiSec] 점들 — fine(1초) 창 안은 fine, 그 밖은 coarse(10초)로 보충한다. sec 오름차순 · null 보존
 * (곡선을 끊는 자리). gh-trade `grid_fine_of` 와 같은 우선순위.
 */
export function gridSeries(grid: LimitupGridFile, loSec: number, hiSec: number, col: LimitupGridCol): GridPoint[] {
  const out: GridPoint[] = [];
  const windows = grid.fine?.windows ?? [];
  for (const w of windows) {
    const vals = w.cols[col] ?? [];
    w.sec.forEach((s, i) => {
      if (s >= loSec && s <= hiSec) out.push({ sec: s, v: num(vals[i]) });
    });
  }
  const cVals = grid.coarse.cols[col] ?? [];
  grid.coarse.sec.forEach((s, i) => {
    if (s < loSec || s > hiSec) return;
    if (windows.some((w) => s >= w.from_sec && s <= w.to_sec)) return;
    out.push({ sec: s, v: num(cVals[i]) });
  });
  return out.sort((a, b) => a.sec - b.sec);
}

/** 그 초(없으면 직전 점)의 값 — 마커 높이(gh-trade `_y_at`). */
function valueAt(points: readonly GridPoint[], sec: number): number | null {
  let v: number | null = null;
  for (const p of points) {
    if (p.sec > sec) break;
    v = p.v;
  }
  return v;
}

/** 0~100 x 축 — [lo, hi] 초. */
function xOf(sec: number, lo: number, hi: number): number {
  if (hi <= lo) return 0;
  return r2((Math.min(Math.max(sec, lo), hi) - lo) / (hi - lo) * 100);
}

/** 선형 y — v 가 [vMin, vMax] 일 때 [yBottom, yTop]. 폭이 0 이면 가운데. */
function yScale(vMin: number, vMax: number, yTop: number, yBottom: number) {
  return (v: number) => {
    if (vMax <= vMin) return r2((yTop + yBottom) / 2);
    const t = (Math.min(Math.max(v, vMin), vMax) - vMin) / (vMax - vMin);
    return r2(yBottom - t * (yBottom - yTop));
  };
}

/** `M`/`L` 경로 — null 에서 끊고 다음 값에서 `M` 으로 다시 시작한다. */
function pathOf(points: readonly GridPoint[], x: (s: number) => number, y: (v: number) => number): string {
  let d = '';
  let pen = false;
  for (const p of points) {
    if (p.v == null) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${x(p.sec)} ${y(p.v)}`;
    pen = true;
  }
  return d;
}

/** 곡선 아래 면 — 이어진 구간마다 바닥(yBase)으로 닫는다. */
function areaOf(
  points: readonly GridPoint[],
  x: (s: number) => number,
  y: (v: number) => number,
  yBase: number,
): string {
  let d = '';
  let seg: GridPoint[] = [];
  const flush = () => {
    if (seg.length === 0) return;
    const first = seg[0]!;
    const last = seg[seg.length - 1]!;
    d += `M${x(first.sec)} ${yBase}`;
    for (const p of seg) d += `L${x(p.sec)} ${y(p.v!)}`;
    d += `L${x(last.sec)} ${yBase}Z`;
    seg = [];
  };
  for (const p of points) {
    if (p.v == null) flush();
    else seg.push(p);
  }
  flush();
  return d;
}

/** x 눈금 4개 — 시작 · ⅓ · ⅔ · 끝, 「HH:MM」. */
function ticksOf(lo: number, hi: number): LaneTick[] {
  return [0, 1 / 3, 2 / 3, 1].map((f) => {
    const s = Math.floor(lo + (hi - lo) * f);
    return { x: r2(f * 100), label: hhmm(s) };
  });
}

// ---------------------------------------------------------------------------
// 레인 공통 타입
// ---------------------------------------------------------------------------

export interface LaneTick {
  x: number;
  label: string;
}

export interface LaneLine {
  kind: 'upper' | 'p25' | 'base';
  y: number;
  label: string;
}

export type LaneMarkKind = 'reach25' | 'wallClear' | 'firstUpper' | 'max' | 'sell' | 'cancel' | 'break';

export interface LaneMark {
  kind: LaneMarkKind;
  x: number;
  y: number;
  /** 오버레이 글자 — 지정된 마커만. 나머지는 null(`title` 만). */
  label: string | null;
  title: string;
}

export interface LaneShade {
  x: number;
  w: number;
}

// ---------------------------------------------------------------------------
// 레인 1 「진입 10분」
// ---------------------------------------------------------------------------

/** 카드 · 지문표의 진입 기준 시각(gh-trade `_anchor_ns`) — epoch ms. */
export function anchorMsOf(
  entry: LimitupEntryRow | null,
  locks: readonly Pick<LimitupLockRow, 'start_ms'>[],
): number | null {
  if (entry) {
    if (entry.first_upper_ms != null) return entry.first_upper_ms;
    const pct = entry.detect_rate_pct;
    const det =
      pct === 15 ? entry.t15_ms : pct === 20 ? entry.t20_ms : pct === 25 ? entry.t25_ms : null;
    for (const t of [det, entry.t25_ms, entry.t20_ms, entry.t15_ms]) if (t != null) return t;
  }
  const starts = locks.map((l) => l.start_ms).filter((v): v is number => v != null);
  return starts.length > 0 ? Math.min(...starts) : null;
}

export interface LaneWindow {
  lo: number;
  hi: number;
  /** 「09:00~09:07」 — 캡션 조각(격자 파일 없이도 계산된다 — 로딩 중 캡션). */
  range: string;
}

/** 레인 1 창 [a − 600, a + 60] ∩ 장중 — 기준 시각이 없으면 null. */
export function entryWindowOf(
  entry: LimitupEntryRow | null,
  locks: readonly Pick<LimitupLockRow, 'start_ms'>[],
): (LaneWindow & { anchorSec: number }) | null {
  const anchor = anchorMsOf(entry, locks);
  if (anchor == null) return null;
  const a = kstSecOf(anchor);
  const [lo, hi] = clip(a - ENTRY_WINDOW_S, a + MEMBER_WINDOW_S);
  return { lo, hi, range: `${hhmm(lo)}~${hhmm(hi)}`, anchorSec: a };
}

/** 레인 2 창 [첫 잠김 시작 − 120, 마지막 잠김 끝(장 끝까지면 15:30) + 60] ∩ 장중 — 잠김이 없으면 null. */
export function lockWindowOf(locks: readonly Pick<LimitupLockRow, 'start_ms' | 'end_ms'>[]): LaneWindow | null {
  const lk = locks.filter((l) => l.start_ms != null);
  if (lk.length === 0) return null;
  const starts = lk.map((l) => kstSecOf(l.start_ms!));
  const ends = lk.map((l) => (l.end_ms != null ? kstSecOf(l.end_ms) : SECS_END));
  const [lo, hi] = clip(Math.min(...starts) - LOCK_LEAD_S, Math.max(...ends) + MEMBER_WINDOW_S);
  return { lo, hi, range: `${hhmm(lo)}~${hhmm(hi)}` };
}

export interface LaneEntry {
  kind: 'entry';
  loSec: number;
  hiSec: number;
  /** 「09:00~09:07」 — 캡션 조각. */
  range: string;
  /** 위 절반 가격선(`last_px`). */
  pricePath: string;
  /** 아래 절반 매도벽 금액(`wall_krw_visible`) 곡선과 그 아래 면. */
  wallPath: string;
  wallArea: string;
  lines: LaneLine[];
  marks: LaneMark[];
  ticks: LaneTick[];
  /** SVG aria-label 의 요약 조각(종목명 뒤). */
  summary: string;
}

export function laneEntryOf(
  grid: LimitupGridFile,
  entry: LimitupEntryRow | null,
  locks: readonly LimitupLockRow[],
): LaneEntry | null {
  const win = entryWindowOf(entry, locks);
  if (win === null) return null;
  const { lo, hi, anchorSec: a } = win;
  const x = (s: number) => xOf(s, lo, hi);

  const price = gridSeries(grid, lo, hi, 'last_px');
  const wall = gridSeries(grid, lo, hi, 'wall_krw_visible');

  const upper = entry?.upper_px ?? locks.find((l) => l.upper_px != null)?.upper_px ?? null;
  const p25 = entry?.base_px != null ? entry.base_px * 1.25 : null;
  const pv = price.map((p) => p.v).filter((v): v is number => v != null);
  const refs = [...pv, ...(upper != null ? [upper] : []), ...(p25 != null ? [p25] : [])];
  const py = yScale(refs.length ? Math.min(...refs) : 0, refs.length ? Math.max(...refs) : 1, PRICE_TOP, PRICE_BOTTOM);
  const wv = wall.map((p) => p.v).filter((v): v is number => v != null);
  const wy = yScale(0, wv.length ? Math.max(...wv, 1) : 1, WALL_TOP, WALL_BOTTOM);

  const lines: LaneLine[] = [];
  if (upper != null) lines.push({ kind: 'upper', y: py(upper), label: `상한가 ${formatGroup(upper)}` });
  if (p25 != null) lines.push({ kind: 'p25', y: py(p25), label: '등락률 25%' });

  const marks: LaneMark[] = [];
  const inWin = (s: number) => s >= lo && s <= hi;
  const t25 = entry?.t25_ms;
  if (t25 != null && inWin(kstSecOf(t25))) {
    const s = kstSecOf(t25);
    marks.push({
      kind: 'reach25',
      x: x(s),
      y: p25 != null ? py(p25) : py(valueAt(price, s) ?? 0),
      label: '25% 도달',
      title: `${kstClock(t25)} 등락률 25% 도달`,
    });
  }
  const clear = wall.find((p) => p.sec <= a && p.v === 0);
  if (clear) {
    marks.push({
      kind: 'wallClear',
      x: x(clear.sec),
      y: WALL_BOTTOM,
      label: '매도벽 소진',
      title: `${clockSec(clear.sec)} 매도벽 소진`,
    });
  }
  const fu = entry?.first_upper_ms;
  if (fu != null && inWin(kstSecOf(fu))) {
    marks.push({
      kind: 'firstUpper',
      x: x(kstSecOf(fu)),
      y: upper != null ? py(upper) : PRICE_TOP,
      label: '첫 상한가 체결',
      title: `${kstClock(fu)} 첫 상한가 체결`,
    });
  }

  const range = win.range;
  const firstUpperText = fu != null ? `첫 상한가 체결 ${kstClock(fu)}` : '상한가 체결 없음';
  return {
    kind: 'entry',
    loSec: lo,
    hiSec: hi,
    range,
    pricePath: pathOf(price, x, py),
    wallPath: pathOf(wall, x, wy),
    wallArea: areaOf(wall, x, wy, WALL_BOTTOM),
    lines,
    marks,
    ticks: ticksOf(lo, hi),
    summary: `${range} 가격 · 매도벽 — ${firstUpperText}`,
  };
}

// ---------------------------------------------------------------------------
// 레인 2 「잠김 전 구간」
// ---------------------------------------------------------------------------

export interface LaneLock {
  kind: 'lock';
  loSec: number;
  hiSec: number;
  range: string;
  /** 상한가 매수잔량 금액(`q_krw`) 곡선. */
  path: string;
  shades: LaneShade[];
  lines: LaneLine[];
  marks: LaneMark[];
  ticks: LaneTick[];
  /** 「최대 17.3억 13:57:47, 깨짐 14:40:07」 — SVG aria-label 의 요약 조각. */
  summary: string;
}

export function laneLockOf(
  grid: LimitupGridFile,
  locks: readonly LimitupLockRow[],
  marks: readonly LimitupMarkRow[],
): LaneLock | null {
  const win = lockWindowOf(locks);
  if (win === null) return null;
  const { lo, hi } = win;
  const lk = locks.filter((l) => l.start_ms != null).sort((p, q) => p.lock_id - q.lock_id);
  const starts = lk.map((l) => kstSecOf(l.start_ms!));
  // 장 끝까지 잠김(end_ms null) = 15:30.
  const ends = lk.map((l) => (l.end_ms != null ? kstSecOf(l.end_ms) : SECS_END));
  const x = (s: number) => xOf(s, lo, hi);

  const q = gridSeries(grid, lo, hi, 'q_krw');
  const qv = q.map((p) => p.v).filter((v): v is number => v != null);
  const yMax = Math.max(LANE_Y_FLOOR_KRW, ...qv);
  const y = yScale(0, yMax, LOCK_TOP, 100);
  const yAt = (s: number) => y(valueAt(q, s) ?? 0);

  const shades: LaneShade[] = lk.map((l, i) => {
    const x0 = x(starts[i]!);
    const x1 = x(ends[i]!);
    return { x: x0, w: r2(Math.max(x1 - x0, 0.2)) };
  });

  const out: LaneMark[] = [];

  // 최대 점 — 잠김 구간 안의 최대(gh-trade 사실 「잠김 N 최대 잔량」 과 같은 축). 같은 값이면 이른 초.
  const inLock = (s: number) => lk.some((_, i) => s >= starts[i]! && s < ends[i]!);
  let max: GridPoint | null = null;
  for (const p of q) {
    if (p.v == null || !inLock(p.sec)) continue;
    if (max === null || p.v > max.v!) max = p;
  }
  if (max !== null) {
    const t = clockSec(max.sec);
    out.push({
      kind: 'max',
      x: x(max.sec),
      y: y(max.v!),
      label: `최대 ${formatEok(max.v!)} @${t}`,
      title: `${t} 최대 잔량 ${formatEok(max.v!)}`,
    });
  }

  // ▼ 큰 매도 · ✕ 취소 — 창 안만 · 가장 큰 krw 하나씩만 글자.
  const inWin = marks.filter((m) => m.t_ms != null && kstSecOf(m.t_ms) >= lo && kstSecOf(m.t_ms) <= hi);
  const biggest = (kind: LimitupMarkRow['kind']) => {
    let best: LimitupMarkRow | null = null;
    for (const m of inWin) if (m.kind === kind && (best === null || (m.krw ?? 0) > (best.krw ?? 0))) best = m;
    return best;
  };
  const topSell = biggest('burst_sell');
  const topCancel = biggest('cancel');
  for (const m of inWin) {
    const s = kstSecOf(m.t_ms!);
    const qty = m.qty != null ? `${formatGroup(m.qty)}주` : DASH;
    const krw = m.krw != null ? formatEok(m.krw) : DASH;
    if (m.kind === 'burst_sell') {
      out.push({
        kind: 'sell',
        x: x(s),
        y: yAt(s),
        label: m === topSell ? `${hhmm(s)} 매도 ${qty}` : null,
        title: `${kstClock(m.t_ms!)} 큰 매도 ${qty} · ${krw}`,
      });
    } else {
      out.push({
        kind: 'cancel',
        x: x(s),
        y: yAt(s),
        label: m === topCancel ? `취소 ${MINUS}${krw}` : null,
        title: `${kstClock(m.t_ms!)} 취소 ${qty} · ${MINUS}${krw}`,
      });
    }
  }

  // ● 깨진 잠김의 끝.
  const breakClocks: string[] = [];
  lk.forEach((l, i) => {
    if (l.broke !== true || l.end_ms == null) return;
    const s = ends[i]!;
    if (s < lo || s > hi) return;
    const t = kstClock(l.end_ms);
    breakClocks.push(t);
    out.push({ kind: 'break', x: x(s), y: yAt(s), label: `깨짐 ${t}`, title: `${t} 잠김 ${l.lock_id} 깨짐` });
  });

  const summary = [
    max !== null ? `최대 ${formatEok(max.v!)} ${clockSec(max.sec)}` : '최대 —',
    ...breakClocks.map((t) => `깨짐 ${t}`),
  ].join(', ');

  return {
    kind: 'lock',
    loSec: lo,
    hiSec: hi,
    range: win.range,
    path: pathOf(q, x, y),
    shades,
    lines: [{ kind: 'base', y: y(LANE_BASELINE_KRW), label: '기준 10억' }],
    marks: out,
    ticks: ticksOf(lo, hi),
    summary,
  };
}

// ---------------------------------------------------------------------------
// 사건 카드 머리 — 잠김 태그
// ---------------------------------------------------------------------------

/** 1~20 → ①~⑳, 그 밖은 숫자 그대로. */
export function circledNumber(n: number): string {
  return Number.isInteger(n) && n >= 1 && n <= 20 ? String.fromCodePoint(0x2460 + n - 1) : String(n);
}

/** 지속 — 60초 미만 「N초」 · 60분 미만 「N분」 · 그 이상 「N시간 M분」(내림). */
export function fmtSpan(durS: number): string {
  const s = Math.max(0, Math.floor(durS));
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}

export interface LockTag {
  text: string;
  tone: 'up' | 'down';
}

export function lockTagsOf(locks: readonly LimitupLockRow[]): {
  tags: LockTag[];
  more: { text: string; title: string } | null;
} {
  const all = [...locks]
    .sort((a, b) => a.lock_id - b.lock_id)
    .map((l): LockTag => {
      const head = `잠김 ${circledNumber(l.lock_id)}`;
      if (l.broke === true) {
        return { text: l.dur_s != null ? `${head} · ${fmtSpan(l.dur_s)} 뒤 깨짐` : `${head} · 깨짐`, tone: 'up' };
      }
      return { text: `${head} · 종가 유지`, tone: 'down' };
    });
  if (all.length <= MAX_LOCK_TAGS) return { tags: all, more: null };
  const rest = all.slice(MAX_LOCK_TAGS);
  return {
    tags: all.slice(0, MAX_LOCK_TAGS),
    more: { text: `+${rest.length}`, title: rest.map((t) => t.text).join(' · ') },
  };
}

// ---------------------------------------------------------------------------
// 사실 문장
// ---------------------------------------------------------------------------

export interface FactLine {
  key: string;
  /** 「HH:MM:SS」 · t_ms 없으면 「—」. */
  clock: string;
  /** `facts.text` 그대로(재조립 없음). */
  text: string;
  /** `facts.source` 글자 그대로(「실측」·「추정(분 단위)」·「모형」). */
  source: string | null;
}

export function factsSorted(facts: readonly LimitupFactRow[]): FactLine[] {
  return [...facts]
    .sort((a, b) => {
      const an = a.t_ms == null;
      const bn = b.t_ms == null;
      if (an !== bn) return an ? 1 : -1;
      if (!an && a.t_ms !== b.t_ms) return a.t_ms! - b.t_ms!;
      if (a.event_no !== b.event_no) return a.event_no - b.event_no;
      return a.fact_no - b.fact_no;
    })
    .map((f) => ({
      key: `${f.event_no}-${f.fact_no}`,
      clock: f.t_ms != null ? kstClock(f.t_ms) : DASH,
      text: f.text ?? DASH,
      source: nonEmpty(f.source) ? f.source : null,
    }));
}

// ---------------------------------------------------------------------------
// 창구 막대
// ---------------------------------------------------------------------------

export interface MemberBar {
  name: string;
  /** 비중 % (0~100 · 소수 1자리 — facts values 그대로). */
  pct: number;
  /** 「54.4%」. */
  label: string;
}

function barsOfValues(values: Record<string, unknown> | null | undefined): MemberBar[] {
  if (!values) return [];
  const out: MemberBar[] = [];
  for (let k = 1; k <= 3; k += 1) {
    const s = values[`s${k}`];
    if (typeof s !== 'number' || !Number.isFinite(s)) continue; // 「—」 자리
    const code = values[`m${k}_code`];
    const raw = values[`m${k}`];
    const name = typeof code === 'string' && code !== '' ? memberName(code) : typeof raw === 'string' ? raw : DASH;
    out.push({ name, pct: s, label: s >= 99.95 ? '100%' : `${s.toFixed(1)}%` });
  }
  return out;
}

/**
 * 진입 1분 매수(event 0 `member_entry_buy`) · 마지막 깨진 잠김(end_ms 가장 늦은 것)의 깨짐 전 1분 매도
 * (`member_prebreak_sell`, event_no = lock_id). 깨진 잠김이 없으면 sell = null(막대 묶음 자체 없음).
 */
export function memberBarsOf(
  facts: readonly LimitupFactRow[],
  locks: readonly LimitupLockRow[],
): { entry: MemberBar[]; sell: MemberBar[] | null } {
  const entryFact = facts.find((f) => f.event_no === 0 && f.template_id === 'member_entry_buy');
  const broke = locks
    .filter((l) => l.broke === true)
    .sort((a, b) => (a.end_ms ?? 0) - (b.end_ms ?? 0) || a.lock_id - b.lock_id);
  const last = broke[broke.length - 1];
  const sellFact =
    last !== undefined
      ? facts.find((f) => f.event_no === last.lock_id && f.template_id === 'member_prebreak_sell')
      : undefined;
  return {
    entry: barsOfValues(entryFact?.values),
    sell: last === undefined ? null : barsOfValues(sellFact?.values),
  };
}

// ---------------------------------------------------------------------------
// 창구 지문표
// ---------------------------------------------------------------------------

export interface FingerprintRowView {
  member: string;
  /** 「{회원사명} {회원번호}」(이름 모르면 번호만). */
  label: string;
  n: string;
  entry: string;
  lockBuy: string;
  preSell: string;
  /** 「{선행}/{관여 깨진 잠김}」 · 관여 깨진 잠김 0 → 「—」. */
  lead: string;
  /** 「{유지}/{관여 잠김}」 · 관여 잠김 0 → 「—」. */
  hold: string;
  /** 사건 < 10 → 「관찰 중」(gh-trade D-11). */
  observing: boolean;
}

function avgPct(sum: number, cnt: number): string {
  return cnt > 0 ? `${Math.round((sum / cnt) * 100)}%` : DASH;
}

export function fingerprintRowsOf(rows: readonly LimitupFingerprintRow[]): FingerprintRowView[] {
  return [...rows]
    .sort((a, b) => b.n - a.n || (a.member < b.member ? -1 : a.member > b.member ? 1 : 0))
    .map((r) => {
      const nm = nonEmpty(r.name) ? r.name : memberName(r.member);
      return {
        member: r.member,
        label: nm !== '' && nm !== r.member ? `${nm} ${r.member}` : r.member,
        n: formatGroup(r.n),
        entry: avgPct(r.entry_sum, r.entry_cnt),
        lockBuy: avgPct(r.lock_buy_sum, r.lock_buy_cnt),
        preSell: avgPct(r.pre_sell_sum, r.pre_sell_cnt),
        lead: r.n_broke > 0 ? `${r.lead}/${r.n_broke}` : DASH,
        hold: r.n_lock > 0 ? `${r.n_held}/${r.n_lock}` : DASH,
        observing: r.n < MIN_FINGERPRINT_EVENTS,
      };
    });
}

// ---------------------------------------------------------------------------
// 어제 결과
// ---------------------------------------------------------------------------

export interface YesterdayRowView {
  isin: string;
  label: string;
  upper: string;
  d1Open: string;
  pnl: string;
  tone: 'up' | 'down' | 'fg';
}

/** 이전 적재 날짜 locks → 종목마다 첫 잠김 행(isin 순 — gh-trade 정렬) · 손익 = `fmtRet(d1_ret × 100)`. */
export function yesterdayRowsOf(
  prev: { date: LimitupDate; locks: readonly LimitupLockRow[] } | null,
): { date: string; rows: YesterdayRowView[] } | null {
  if (prev === null) return null;
  const first = new Map<string, LimitupLockRow>();
  for (const l of [...prev.locks].sort((a, b) => a.lock_id - b.lock_id)) {
    if (!first.has(l.isin)) first.set(l.isin, l);
  }
  const rows = [...first.values()]
    .sort((a, b) => (a.isin < b.isin ? -1 : a.isin > b.isin ? 1 : 0))
    .map((l): YesterdayRowView => {
      const has = l.d1_open != null;
      const ret = has ? l.d1_ret : null;
      return {
        isin: l.isin,
        label: nonEmpty(l.name) ? l.name : nonEmpty(l.short_code) ? l.short_code : l.isin,
        upper: l.upper_px != null ? formatGroup(l.upper_px) : DASH,
        d1Open: has ? formatGroup(l.d1_open!) : DASH,
        pnl: ret != null ? fmtRet(ret * 100) : DASH,
        tone: ret == null || ret === 0 ? 'fg' : ret > 0 ? 'up' : 'down',
      };
    });
  return { date: fmtYmdShort(prev.date), rows };
}

// ---------------------------------------------------------------------------
// 레인 오버레이 글자 배치 (UI-SPEC E8 overflow — 폰 360px 에서 라벨이 겹치지 않는다)
// ---------------------------------------------------------------------------

export interface LaneLabelItem {
  id: string;
  text: string;
  /** 붙을 자리(0~100 %). */
  xPct: number;
  yPct: number;
  /** start = 자리 오른쪽으로 · end = 자리 왼쪽으로 · auto = 왼쪽 절반이면 start. */
  align: 'start' | 'end' | 'auto';
}

export interface PlacedLaneLabel {
  id: string;
  left: number;
  top: number;
  width: number;
}

export const LANE_LABEL_ROW_H = 14;
const LABEL_GAP = 4;
const LABEL_OFFSET = 5;

/** 11px 글자 폭 어림(px) — 한글 · 원숫자 1em, 좁은 문장부호 0.32em, 그 밖 0.6em. 실제보다 조금 넓게 잡는다. */
export function estimateLabelWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if ((c >= 0xac00 && c <= 0xd7a3) || (c >= 0x2460 && c <= 0x24ff) || c >= 0x3000) w += 11;
    else if (' .,:;'.includes(ch)) w += 3.5;
    else w += 6.6;
  }
  return Math.ceil(w) + 2;
}

/**
 * 오버레이 글자를 14px 줄 칸에 하나씩 놓는다 — 붙을 자리 바로 위 줄을 먼저 보고, 겹치면 위 · 아래 줄로 번갈아 옮긴다.
 * 어느 줄에도 들어가지 않는 글자는 버린다(그 마커는 `title` 로만 남는다). 앞에 둔 항목이 우선이다.
 * 좌우는 레인 폭 안으로 민다. 반환 좌표는 px(레인 왼쪽 위 기준).
 */
export function layoutLaneLabels(
  items: readonly LaneLabelItem[],
  widthPx: number,
  heightPx: number,
): PlacedLaneLabel[] {
  const rows = Math.max(1, Math.floor(heightPx / LANE_LABEL_ROW_H));
  const taken: { left: number; right: number }[][] = Array.from({ length: rows }, () => []);
  const out: PlacedLaneLabel[] = [];
  for (const it of items) {
    const w = estimateLabelWidth(it.text);
    if (w > widthPx) continue;
    const x = (it.xPct / 100) * widthPx;
    const y = (it.yPct / 100) * heightPx;
    const align = it.align === 'auto' ? (it.xPct < 50 ? 'start' : 'end') : it.align;
    let left = align === 'start' ? x + (it.xPct <= 0 ? 0 : LABEL_OFFSET) : x - (it.xPct >= 100 ? 0 : LABEL_OFFSET) - w;
    left = Math.min(Math.max(left, 0), widthPx - w);
    // 자리 바로 위 줄 — 맨 위면 자리를 덮지 않게 아래 줄.
    let pref = Math.floor((y - 2) / LANE_LABEL_ROW_H) - 1;
    if (pref < 0) pref = Math.min(rows - 1, Math.floor((y + 4) / LANE_LABEL_ROW_H) + 1);
    pref = Math.min(Math.max(pref, 0), rows - 1);
    const order = [pref];
    for (let d = 1; d < rows; d += 1) {
      if (pref - d >= 0) order.push(pref - d);
      if (pref + d < rows) order.push(pref + d);
    }
    const lo = left - LABEL_GAP;
    const hi = left + w + LABEL_GAP;
    const row = order.find((r) => taken[r]!.every((t) => hi <= t.left || lo >= t.right));
    if (row === undefined) continue;
    taken[row]!.push({ left, right: left + w });
    out.push({ id: it.id, left: r2(left), top: row * LANE_LABEL_ROW_H, width: w });
  }
  return out;
}
