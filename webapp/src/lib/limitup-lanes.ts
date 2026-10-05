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
 *   웹이 gh-trade 와 다르게 그리는 곳(UI-SPEC ④-4 · R-6 · quick-261005-vk1 D-04 스케치 011 A): 레인 1 「상한가 도달까지」 는
 *   가격(위) + 매도벽(아래)을 한 레인에 겹쳐 그리고 기준선은 상한가 선 + **탐지율 선 하나**(사실 문장과 같은 기준 —
 *   25% 선 · 「25% 도달」 마커 없음)다. 시각이 있는 사실은 `eventsOf` 가 시간순 번호를 매기고, 같은 번호가 레인 위 라벨 띠
 *   (`layoutEventBand`)와 사실 문장 앞 배지에 함께 나온다. 창 사실(직전 1분 매수 · 깨짐 직전 1분 매도)은 번호 대신 레인의
 *   파란 면이다(창 = `memberWindowsOf` — workers/limitup-sync derive.ts 와 같은 [anchor − 60s, anchor] · [end − 60s, end]).
 *   레인 2 「잠김 구간」 의 ▼ · ✕ 는 RPC 가 종목마다 krw 큰 순 40개로 자른 맥락 글리프(title 만)다.
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
import { entryBuyTopOf, fmtYmdShort, kstClock, kstSecOf } from './limitup-report';

const DASH = '—';
const MINUS = '−';

/** 장 시작 · 끝(하루 초). 창은 [09:00, 15:30 − 1초] 로 자른다(gh-trade `_clip_secs`). */
export const SECS_START = 32_400;
export const SECS_END = 55_800;
/** 레인 1 「상한가 도달까지」(gh-trade 「진입 10분」) — 기준 시각 앞 600초 · 뒤 60초. */
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

/** epoch ms → 그날 KST 초(소수 — 마커 x 위치용). */
function kstSecF(ms: number): number {
  return kstSecOf(ms) + (((ms % 1000) + 1000) % 1000) / 1000;
}

function numOf(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// ---------------------------------------------------------------------------
// 서식 도우미 (D-04)
// ---------------------------------------------------------------------------

/** 지속(정밀) — 60초 미만 「10.1초」 · 60분 미만 「3분 35초」(내림) · 그 이상 「3시간 0분」(내림). */
export function fmtDurPrecise(durS: number): string {
  const s = Math.max(0, durS);
  if (s < 60) return `${s.toFixed(1)}초`;
  if (s < 3600) return `${Math.floor(s / 60)}분 ${Math.floor(s % 60)}초`;
  return `${Math.floor(s / 3600)}시간 ${Math.floor((s % 3600) / 60)}분`;
}

/** 금액 짧게 — 1억 이상 「4.6억」(formatEok) · 그 아래 「7,000만」 · 0 「0만」. 부호는 붙이지 않는다(호출부가 단다). */
export function fmtKrwShort(krw: number): string {
  const a = Math.abs(krw);
  if (a >= 100_000_000) return formatEok(a);
  return `${formatGroup(Math.round(a / 10_000))}만`;
}

/** 사실 문장 앞 「HH:MM:SS.mmm 」 하나만 뗀다(시각 칸과 중복 — D-04). */
export function stripFactClock(text: string): string {
  return text.replace(/^\d{2}:\d{2}:\d{2}\.\d{3} /, '');
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

/** 격자 한 칸 — 그 초가 든 표(fine 창 또는 coarse)의 열들과 행 번호. 어느 열이든 같은 칸에서 읽는다. */
interface GridCell {
  sec: number;
  cols: Partial<LimitupGridFile['coarse']['cols']>;
  i: number;
}

/**
 * [loSec, hiSec] 칸들 — fine(1초) 창 안은 fine, 그 밖은 coarse(10초)로 보충한다. sec 오름차순.
 * gh-trade `grid_fine_of` 와 같은 우선순위. 열 값은 원값(숫자 · boolean · null) 그대로 둔다.
 */
function gridCells(grid: LimitupGridFile, loSec: number, hiSec: number): GridCell[] {
  const out: GridCell[] = [];
  const windows = grid.fine?.windows ?? [];
  for (const w of windows) {
    w.sec.forEach((s, i) => {
      if (s >= loSec && s <= hiSec) out.push({ sec: s, cols: w.cols, i });
    });
  }
  grid.coarse.sec.forEach((s, i) => {
    if (s < loSec || s > hiSec) return;
    if (windows.some((w) => s >= w.from_sec && s <= w.to_sec)) return;
    out.push({ sec: s, cols: grid.coarse.cols, i });
  });
  return out.sort((a, b) => a.sec - b.sec);
}

/**
 * 격자 열 `col` 의 [loSec, hiSec] 점들 — `gridCells` 걷기(fine 우선 · coarse 보충) 위에 숫자만 남긴다. sec 오름차순 ·
 * null 보존(곡선을 끊는 자리). boolean 열(`auction`)은 null 이 되므로 `auctionSpansOf` 가 원값으로 따로 읽는다.
 */
export function gridSeries(grid: LimitupGridFile, loSec: number, hiSec: number, col: LimitupGridCol): GridPoint[] {
  return gridCells(grid, loSec, hiSec).map((c) => ({ sec: c.sec, v: num(c.cols[col]?.[c.i]) }));
}

/**
 * 미잠김 단일가 구간(초) — `auction === true` 이고 `lock_state === 0` 인 연속 칸(VI · 장 마감 단일가 포함).
 * 잠김 중 단일가(`lock_state` 1)는 잠김 음영이 이미 덮으므로 뺀다. 칸 집합은 `gridSeries` 와 같다(fine 우선 · coarse 보충).
 * 구간 끝 b = 구간 뒤 첫 비해당 칸의 sec(상태는 다음 표본까지 유지) · 끝까지 이어지면 hiSec. auction 이 숫자/null 이거나
 * lock_state 가 1 · 2 · null 이면 비해당(quick-261005-x9o).
 * ★ 목록 스파크라인에는 칠하지 않는다 — grid_summary 에 auction · lock_state 열이 없고, 행마다 격자 파일을 받으면
 *   「격자 파일은 연 행만」 계약이 깨진다. 그래서 펼친 카드 레인 2 「잠김 구간」 에만 칠한다.
 */
export function auctionSpansOf(
  grid: LimitupGridFile,
  loSec: number,
  hiSec: number,
): { a: number; b: number }[] {
  const out: { a: number; b: number }[] = [];
  let a: number | null = null;
  for (const c of gridCells(grid, loSec, hiSec)) {
    const hit = c.cols.auction?.[c.i] === true && c.cols.lock_state?.[c.i] === 0;
    if (hit && a === null) a = c.sec;
    else if (!hit && a !== null) {
      out.push({ a, b: c.sec });
      a = null;
    }
  }
  if (a !== null) out.push({ a, b: hiSec });
  return out;
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
  /** upper = 상한가(--border-subtle) · detect = 탐지율(--led-latent) · base = 기준 10억(--led-latent). */
  kind: 'upper' | 'detect' | 'base';
  y: number;
  label: string;
  /** 라벨 자리 — 오른쪽 위(선 위 · 오른쪽 정렬) / 왼쪽 아래(선 아래 · 왼쪽 정렬). */
  place: 'right-above' | 'left-below';
}

/** 번호 없는 맥락 마커 — 글자 없이 `title` 만(라벨 띠는 번호 사건 전용). */
export type LaneMarkKind = 'wallClear' | 'sell' | 'cancel';

export interface LaneMark {
  kind: LaneMarkKind;
  x: number;
  y: number;
  title: string;
}

export interface LaneShade {
  x: number;
  w: number;
}

/** 창 음영(파란 면) — 「상한가 직전 1분」 · 「깨짐 직전 1분」. */
export interface LaneWindowShade extends LaneShade {
  caption: string;
}

/** 번호 사건 마커 — 라벨 띠 배지 · 지시선 · 점. */
export interface LanePoint {
  n: number;
  x: number;
  y: number;
  emph: boolean;
  tone: LimitupEventTone;
  /** 띠 배지 글자(「09:06:01 첫 상한가 체결 · 5,730원」). */
  bandLabel: string;
}

// ---------------------------------------------------------------------------
// 기준 시각 · 창
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

// ---------------------------------------------------------------------------
// 직전 1분 창 (D-04 — workers/limitup-sync derive.ts 와 같은 정의)
// ---------------------------------------------------------------------------

export interface MemberWindow {
  fromMs: number;
  toMs: number;
  /** 「09:05:01~09:06:01」. */
  range: string;
}

function memberWindow(toMs: number): MemberWindow {
  const fromMs = toMs - MEMBER_WINDOW_S * 1000;
  return { fromMs, toMs, range: `${kstClock(fromMs)}~${kstClock(toMs)}` };
}

/**
 * 상한가 직전 1분 매수 창 = [anchorMsOf − 60s, anchorMsOf](기준 시각이 없으면 null) · 깨짐 직전 1분 매도 창 = 깨진 잠김마다
 * [end_ms − 60s, end_ms](lock_id → 창). 새 창 정의를 만들지 않는다 — derive.ts `anchorMs` 와 같은 사슬인 `anchorMsOf` 재사용.
 */
export function memberWindowsOf(
  entry: LimitupEntryRow | null,
  locks: readonly Pick<LimitupLockRow, 'lock_id' | 'start_ms' | 'end_ms' | 'broke'>[],
): { entry: MemberWindow | null; sell: Map<number, MemberWindow> } {
  const a = anchorMsOf(entry, locks);
  const sell = new Map<number, MemberWindow>();
  for (const l of locks) if (l.broke === true && l.end_ms != null) sell.set(l.lock_id, memberWindow(l.end_ms));
  return { entry: a != null ? memberWindow(a) : null, sell };
}

// ---------------------------------------------------------------------------
// 사건 — 번호 = 레인 마커 = 사실 문장 (D-04)
// ---------------------------------------------------------------------------

/** detect = 탐지율 도달(--led-latent) · break = 깨짐(--up) · fg = 그 밖. */
export type LimitupEventTone = 'detect' | 'break' | 'fg';

export interface LimitupEvent {
  key: string;
  tMs: number | null;
  /** 「HH:MM:SS」 · t_ms 없으면 「—」. */
  clock: string;
  /** event_no 0 = 상한가 도달까지(레인 1) · 그 밖 = 잠김 구간(레인 2). */
  lane: 'entry' | 'lock';
  templateId: string | null;
  /** 창 사실(직전 1분 매수/매도)의 창 — 그 밖 null. */
  window: MemberWindow | null;
  /** 시간순 번호(1부터) — 시각이 있고 창 사실이 아닌 것만. */
  n: number | null;
  /** 강조 사건(20% 도달 · 첫 상한가 · 잠김 시작 · 깨짐 · 종가까지 유지). */
  emph: boolean;
  tone: LimitupEventTone;
  short: string;
  val: string | null;
  /** 라벨 띠 글자 「{clock} {short}」(+ 강조면 「 · {val}」). */
  bandLabel: string;
  /** 표시 문장 — 시각 접두 뗀 원문 · 창 사실은 머리만 「상한가 직전 1분 매수 창구 (range): 」 로 바꾼다. */
  text: string;
  /** `facts.source` 글자 그대로(「실측」·「추정(분 단위)」·「모형」). */
  source: string | null;
  /** values.px · values.krw(숫자일 때만) — 레인 마커 높이(사실 문장과 같은 원천). */
  px: number | null;
  krw: number | null;
}

const WINDOW_TEMPLATES = new Set(['member_entry_buy', 'member_prebreak_sell']);
const SHORT_FALLBACK_LEN = 14;

function sortFacts(facts: readonly LimitupFactRow[]): LimitupFactRow[] {
  return [...facts].sort((a, b) => {
    const an = a.t_ms == null;
    const bn = b.t_ms == null;
    if (an !== bn) return an ? 1 : -1;
    if (!an && a.t_ms !== b.t_ms) return a.t_ms! - b.t_ms!;
    if (a.event_no !== b.event_no) return a.event_no - b.event_no;
    return a.fact_no - b.fact_no;
  });
}

function shortOf(f: LimitupFactRow): { short: string | null; val: string | null; emph: boolean; tone: LimitupEventTone } {
  const v = f.values ?? {};
  const won = (k: string) => {
    const x = numOf(v[k]);
    return x != null ? `${formatGroup(x)}원` : null;
  };
  const krw = (k: string) => {
    const x = numOf(v[k]);
    return x != null ? fmtKrwShort(x) : null;
  };
  const plain = { emph: false, tone: 'fg' as const };
  switch (f.template_id) {
    case 'entry_threshold': {
      const pct = numOf(v.pct);
      return { short: pct != null ? `${pct}% 도달` : null, val: won('px'), emph: true, tone: 'detect' };
    }
    case 'burst_wall': {
      const k = krw('krw');
      return { short: k != null ? `매수 버스트 ${k}` : null, val: null, ...plain };
    }
    case 'first_upper':
      return { short: '첫 상한가 체결', val: won('px'), emph: true, tone: 'fg' };
    case 'lock_start': {
      const id = numOf(v.lock_id);
      return { short: id != null ? `잠김 ${id} 시작` : null, val: krw('q_krw'), emph: true, tone: 'fg' };
    }
    case 'big_new': {
      const k = krw('krw');
      return { short: k != null ? `매수 신규 +${k}` : null, val: null, ...plain };
    }
    case 'big_cancel': {
      const k = krw('krw');
      return { short: k != null ? `매수 취소 ${MINUS}${k}` : null, val: null, ...plain };
    }
    case 'q_max': {
      const k = krw('krw');
      return { short: k != null ? `최대 잔량 ${k}` : null, val: null, ...plain };
    }
    case 'lock_break': {
      const px = won('px');
      const dur = numOf(v.dur_s);
      const val = [px, dur != null ? `${fmtDurPrecise(dur)} 유지` : null].filter(nonEmpty).join(' · ');
      return { short: '깨짐', val: val !== '' ? val : null, emph: true, tone: 'break' };
    }
    case 'lock_hold': {
      const dur = numOf(v.dur_s);
      return { short: '종가까지 유지', val: dur != null ? fmtDurPrecise(dur) : null, emph: true, tone: 'fg' };
    }
    default:
      return { short: null, val: null, ...plain };
  }
}

/**
 * 사실 → 사건 배열. 순서 = 사실 문장 정렬(t 없음 뒤 → t → event_no → fact_no — gh-trade 와 같다). 번호는 시각이 있고 창
 * 사실이 아닌 것에만 시간순 1부터. 표시 문장 재조립은 창 사실 머리 교체와 시각 접두 제거뿐이다(나머지는 원문 그대로).
 */
export function eventsOf(
  entry: LimitupEntryRow | null,
  locks: readonly LimitupLockRow[],
  facts: readonly LimitupFactRow[],
): LimitupEvent[] {
  const wins = memberWindowsOf(entry, locks);
  let n = 0;
  return sortFacts(facts).map((f) => {
    const raw = f.text ?? DASH;
    const stripped = stripFactClock(raw);
    const isWindow = f.template_id !== null && WINDOW_TEMPLATES.has(f.template_id);
    const window = !isWindow
      ? null
      : f.template_id === 'member_entry_buy'
        ? wins.entry
        : (wins.sell.get(f.event_no) ?? null);
    let text = stripped;
    let short: string;
    let val: string | null = null;
    let emph = false;
    let tone: LimitupEventTone = 'fg';
    if (isWindow) {
      const head = f.template_id === 'member_entry_buy' ? '상한가 직전 1분 매수 창구' : '깨짐 직전 1분 매도 창구';
      const i = raw.indexOf(': ');
      const body = i >= 0 ? raw.slice(i + 2) : raw;
      text = `${head}${window ? ` (${window.range})` : ''}: ${body}`;
      short = head;
    } else {
      const o = shortOf(f);
      short =
        o.short ?? (stripped.length > SHORT_FALLBACK_LEN ? `${stripped.slice(0, SHORT_FALLBACK_LEN)}…` : stripped);
      val = o.val;
      emph = o.emph;
      tone = o.tone;
    }
    const clock = f.t_ms != null ? kstClock(f.t_ms) : DASH;
    const num = !isWindow && f.t_ms != null ? (n += 1) : null;
    return {
      key: `${f.event_no}-${f.fact_no}`,
      tMs: f.t_ms,
      clock,
      lane: f.event_no === 0 ? 'entry' : 'lock',
      templateId: f.template_id,
      window,
      n: num,
      emph,
      tone,
      short,
      val,
      bandLabel: `${clock} ${short}${emph && val ? ` · ${val}` : ''}`,
      text,
      source: nonEmpty(f.source) ? f.source : null,
      px: numOf(f.values?.px),
      krw: numOf(f.values?.krw),
    };
  });
}

// ---------------------------------------------------------------------------
// 한 줄 요약 (D-04)
// ---------------------------------------------------------------------------

export interface StoryPart {
  text: string;
  strong?: boolean;
  arrow?: boolean;
}

/**
 * 한 줄 요약 — 「{탐지 시각} {pct}% 도달 → {간격} 뒤 {첫 상한 시각} 첫 상한가 {N}원 → {결과}」 + 둘째 줄(상한가 직전 1분 매수
 * 1위). 사실만 — 해석 문구 없음. entry 도 잠김도 없으면 null.
 */
export function storyOf(
  entry: LimitupEntryRow | null,
  locks: readonly LimitupLockRow[],
  facts: readonly LimitupFactRow[],
): { parts: StoryPart[]; sub: string | null } | null {
  if (entry === null && locks.length === 0) return null;
  const segs: StoryPart[][] = [];

  const pct = entry?.detect_rate_pct ?? null;
  const tDet =
    pct === 15 ? entry?.t15_ms : pct === 20 ? entry?.t20_ms : pct === 25 ? entry?.t25_ms : null;
  if (tDet != null) segs.push([{ text: kstClock(tDet), strong: true }, { text: ` ${pct}% 도달` }]);

  const fu = entry?.first_upper_ms ?? null;
  const upper = entry?.upper_px ?? locks.find((l) => l.upper_px != null)?.upper_px ?? null;
  if (fu != null) {
    const seg: StoryPart[] = [];
    if (tDet != null && fu >= tDet) seg.push({ text: `${fmtDurPrecise((fu - tDet) / 1000)} 뒤 ` });
    seg.push({ text: kstClock(fu), strong: true }, { text: ' 첫 상한가' });
    if (upper != null) seg.push({ text: ' ' }, { text: `${formatGroup(upper)}원`, strong: true });
    segs.push(seg);
  }

  const sorted = [...locks].sort((a, b) => a.lock_id - b.lock_id);
  const last = sorted[sorted.length - 1];
  const closePx = entry?.close_px ?? last?.close_px ?? null;
  const closeRet = entry?.close_ret ?? last?.close_ret ?? null;
  const closeText =
    closePx != null ? `종가 ${formatGroup(closePx)}원${closeRet != null ? ` (${fmtRet(closeRet * 100)})` : ''}` : null;
  if (last === undefined) {
    segs.push([{ text: ['잠김 없음', closeText].filter(nonEmpty).join(' · ') }]);
  } else {
    const head = sorted.length > 1 ? `잠김 ${last.lock_id} ` : '';
    const dur = last.dur_s != null ? fmtDurPrecise(last.dur_s) : null;
    if (last.broke === true) {
      const bp = last.break_px != null ? `(${formatGroup(last.break_px)}원)` : '';
      const tail = `만에 깨짐${bp}${closeText ? ` · ${closeText}` : ''}`;
      segs.push(
        dur != null
          ? [{ text: head }, { text: dur, strong: true }, { text: ` ${tail}` }].filter((p) => p.text !== '')
          : [{ text: `${head}깨짐${bp}${closeText ? ` · ${closeText}` : ''}` }],
      );
    } else {
      segs.push(
        dur != null
          ? [{ text: `${head || '잠김 '}` }, { text: dur, strong: true }, { text: ' 유지, 종가 상한가' }]
          : [{ text: `${head || '잠김 '}종가까지 유지` }],
      );
    }
  }

  const parts: StoryPart[] = [];
  segs.forEach((seg, i) => {
    if (i > 0) parts.push({ text: ' → ', arrow: true });
    parts.push(...seg);
  });
  const top = entryBuyTopOf(facts);
  return { parts, sub: top !== null ? `상한가 직전 1분 매수 1위 ${top.label}` : null };
}

// ---------------------------------------------------------------------------
// 레인 1 「상한가 도달까지」
// ---------------------------------------------------------------------------

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
  /** 번호 없는 맥락 마커(매도벽 소진 — title 만). */
  marks: LaneMark[];
  /** 번호 사건 마커(창 안 · 레인 1 사건만). */
  points: LanePoint[];
  /** 상한가 직전 1분 파란 면. */
  windows: LaneWindowShade[];
  ticks: LaneTick[];
  /** SVG aria-label 의 요약 조각(종목명 뒤). */
  summary: string;
}

function windowShade(w: MemberWindow, lo: number, hi: number, caption: string): LaneWindowShade | null {
  const a = kstSecF(w.fromMs);
  const b = kstSecF(w.toMs);
  if (b < lo || a > hi) return null;
  const x0 = xOf(a, lo, hi);
  const x1 = xOf(b, lo, hi);
  const w2 = Math.max(x1 - x0, 0.4);
  const x = Math.min(x0, 100 - w2);
  return { x: r2(x), w: r2(w2), caption };
}

export function laneEntryOf(
  grid: LimitupGridFile,
  entry: LimitupEntryRow | null,
  locks: readonly LimitupLockRow[],
  events: readonly LimitupEvent[] = [],
): LaneEntry | null {
  const win = entryWindowOf(entry, locks);
  if (win === null) return null;
  const { lo, hi, anchorSec: a } = win;
  const x = (s: number) => xOf(s, lo, hi);

  const price = gridSeries(grid, lo, hi, 'last_px');
  const wall = gridSeries(grid, lo, hi, 'wall_krw_visible');

  const upper = entry?.upper_px ?? locks.find((l) => l.upper_px != null)?.upper_px ?? null;
  const pct = entry?.detect_rate_pct ?? null;
  const detect = entry?.base_px != null && pct != null ? Math.round(entry.base_px * (1 + pct / 100)) : null;
  const pv = price.map((p) => p.v).filter((v): v is number => v != null);
  const refs = [...pv, ...(upper != null ? [upper] : []), ...(detect != null ? [detect] : [])];
  const py = yScale(refs.length ? Math.min(...refs) : 0, refs.length ? Math.max(...refs) : 1, PRICE_TOP, PRICE_BOTTOM);
  const wv = wall.map((p) => p.v).filter((v): v is number => v != null);
  const wy = yScale(0, wv.length ? Math.max(...wv, 1) : 1, WALL_TOP, WALL_BOTTOM);

  const lines: LaneLine[] = [];
  if (upper != null)
    lines.push({ kind: 'upper', y: py(upper), label: `상한가 ${formatGroup(upper)}원`, place: 'right-above' });
  if (detect != null)
    lines.push({
      kind: 'detect',
      y: py(detect),
      label: `등락률 ${pct}% (탐지 기준) ${formatGroup(detect)}원`,
      place: 'left-below',
    });

  const marks: LaneMark[] = [];
  const clear = wall.find((p) => p.sec <= a && p.v === 0);
  if (clear) {
    marks.push({ kind: 'wallClear', x: x(clear.sec), y: WALL_BOTTOM, title: `${clockSec(clear.sec)} 매도벽 소진` });
  }

  const clamp = (v: number) => r2(Math.min(Math.max(v, 0), 100));
  const points: LanePoint[] = [];
  const windows: LaneWindowShade[] = [];
  for (const e of events) {
    if (e.lane !== 'entry') continue;
    if (e.window !== null) {
      const sh = windowShade(e.window, lo, hi, '상한가 직전 1분');
      if (sh) windows.push(sh);
      continue;
    }
    if (e.n == null || e.tMs == null) continue;
    const s = kstSecF(e.tMs);
    if (s < lo || s > hi + 1) continue;
    const pxFact = e.templateId === 'entry_threshold' || e.templateId === 'first_upper' ? e.px : null;
    const v = pxFact ?? valueAt(price, s);
    points.push({
      n: e.n,
      x: x(s),
      y: clamp(v != null ? py(v) : PRICE_BOTTOM),
      emph: e.emph,
      tone: e.tone,
      bandLabel: e.bandLabel,
    });
  }

  const range = win.range;
  const fu = entry?.first_upper_ms;
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
    points,
    windows,
    ticks: ticksOf(lo, hi),
    summary: `${range} 가격 · 매도벽 — ${firstUpperText}`,
  };
}

// ---------------------------------------------------------------------------
// 레인 2 「잠김 구간」
// ---------------------------------------------------------------------------

export interface LaneLock {
  kind: 'lock';
  loSec: number;
  hiSec: number;
  range: string;
  /** 상한가 매수잔량 금액(`q_krw`) 곡선. */
  path: string;
  shades: LaneShade[];
  /** 깨짐 직전 1분 파란 면. */
  windows: LaneWindowShade[];
  /** 미잠김 단일가 회색 면(caption 「단일가」 — `auctionSpansOf`). */
  auctions: LaneWindowShade[];
  lines: LaneLine[];
  /** ▼ 큰 매도 · ✕ 취소 맥락 글리프(title 만). */
  marks: LaneMark[];
  points: LanePoint[];
  ticks: LaneTick[];
  /** 「최대 17.3억 13:57:47, 깨짐 14:40:07, 단일가 09:04:01~09:06:01」 — SVG aria-label 의 요약 조각. */
  summary: string;
}

export function laneLockOf(
  grid: LimitupGridFile,
  locks: readonly LimitupLockRow[],
  marks: readonly LimitupMarkRow[],
  events: readonly LimitupEvent[] = [],
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
  const qMaxFacts = events
    .filter((e) => e.lane === 'lock' && e.templateId === 'q_max')
    .map((e) => e.krw)
    .filter((v): v is number => v != null);
  const yMax = Math.max(LANE_Y_FLOOR_KRW, ...qv, ...qMaxFacts);
  const y = yScale(0, yMax, LOCK_TOP, 100);
  const yAt = (s: number) => y(valueAt(q, s) ?? 0);

  const shades: LaneShade[] = lk.map((l, i) => {
    const x0 = x(starts[i]!);
    const x1 = x(ends[i]!);
    return { x: x0, w: r2(Math.max(x1 - x0, 0.2)) };
  });

  // 최대(요약 문자열 — 잠김 구간 안의 격자 최대 · 같은 값이면 이른 초).
  const inLock = (s: number) => lk.some((_, i) => s >= starts[i]! && s < ends[i]!);
  let max: GridPoint | null = null;
  for (const p of q) {
    if (p.v == null || !inLock(p.sec)) continue;
    if (max === null || p.v > max.v!) max = p;
  }

  // ▼ 큰 매도 · ✕ 취소 — 창 안만 · 글자 없이 title.
  const out: LaneMark[] = [];
  for (const m of marks) {
    if (m.t_ms == null) continue;
    const s = kstSecOf(m.t_ms);
    if (s < lo || s > hi) continue;
    const qty = m.qty != null ? `${formatGroup(m.qty)}주` : DASH;
    const krw = m.krw != null ? formatEok(m.krw) : DASH;
    out.push(
      m.kind === 'burst_sell'
        ? { kind: 'sell', x: x(s), y: yAt(s), title: `${kstClock(m.t_ms)} 큰 매도 ${qty} · ${krw}` }
        : { kind: 'cancel', x: x(s), y: yAt(s), title: `${kstClock(m.t_ms)} 취소 ${qty} · ${MINUS}${krw}` },
    );
  }

  const breakClocks: string[] = [];
  lk.forEach((l, i) => {
    if (l.broke !== true || l.end_ms == null) return;
    const s = ends[i]!;
    if (s < lo || s > hi) return;
    breakClocks.push(kstClock(l.end_ms));
  });

  const clamp = (v: number) => r2(Math.min(Math.max(v, 0), 100));
  const points: LanePoint[] = [];
  const windows: LaneWindowShade[] = [];
  for (const e of events) {
    if (e.lane !== 'lock') continue;
    if (e.window !== null) {
      const sh = windowShade(e.window, lo, hi, '깨짐 직전 1분');
      if (sh) windows.push(sh);
      continue;
    }
    if (e.n == null || e.tMs == null) continue;
    const sRaw = kstSecF(e.tMs);
    if (sRaw < lo) continue;
    // 창 끝(장 끝 clip) 뒤 — 종가까지 유지 등 — 은 오른쪽 끝에 고정한다.
    const s = Math.min(sRaw, hi);
    const v = e.templateId === 'q_max' ? (e.krw ?? valueAt(q, s)) : valueAt(q, s);
    points.push({ n: e.n, x: x(s), y: clamp(y(v ?? 0)), emph: e.emph, tone: e.tone, bandLabel: e.bandLabel });
  }

  // 미잠김 단일가 — 회색 면 · 캡션은 aria-hidden/SVG 라 요약 끝 「단일가 HH:MM:SS~HH:MM:SS」 가 대체 텍스트다.
  const spans = auctionSpansOf(grid, lo, hi);
  const auctions: LaneWindowShade[] = spans.map(({ a, b }) => ({
    x: x(a),
    w: r2(Math.max(x(b) - x(a), 0.2)),
    caption: '단일가',
  }));

  const summary = [
    max !== null ? `최대 ${formatEok(max.v!)} ${clockSec(max.sec)}` : '최대 —',
    ...breakClocks.map((t) => `깨짐 ${t}`),
    ...spans.map(({ a, b }) => `단일가 ${clockSec(a)}~${clockSec(b)}`),
  ].join(', ');

  return {
    kind: 'lock',
    loSec: lo,
    hiSec: hi,
    range: win.range,
    path: pathOf(q, x, y),
    shades,
    windows,
    auctions,
    lines: [{ kind: 'base', y: y(LANE_BASELINE_KRW), label: '기준 10억', place: 'right-above' }],
    marks: out,
    points,
    ticks: ticksOf(lo, hi),
    summary,
  };
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

export interface MemberBarGroup {
  bars: MemberBar[];
  /** 창 「09:05:01~09:06:01」 · 기준 시각이 없으면 null. */
  range: string | null;
}

/**
 * 상한가 직전 1분 매수(event 0 `member_entry_buy`) · 마지막 깨진 잠김(end_ms 가장 늦은 것)의 깨짐 직전 1분 매도
 * (`member_prebreak_sell`, event_no = lock_id) + 각 창 range. 깨진 잠김이 없으면 sell = null(막대 묶음 자체 없음).
 */
export function memberBarsOf(
  facts: readonly LimitupFactRow[],
  locks: readonly LimitupLockRow[],
  entry: LimitupEntryRow | null = null,
): { entry: MemberBarGroup; sell: MemberBarGroup | null } {
  const wins = memberWindowsOf(entry, locks);
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
    entry: { bars: barsOfValues(entryFact?.values), range: wins.entry?.range ?? null },
    sell:
      last === undefined
        ? null
        : { bars: barsOfValues(sellFact?.values), range: wins.sell.get(last.lock_id)?.range ?? null },
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
// 라벨 띠 배치 (D-04 · UI-SPEC E8 overflow — 폰 360px 에서 배지가 겹치지 않는다)
// ---------------------------------------------------------------------------

/** 라벨 띠 한 줄 높이(px) · 최대 줄 수 — 넘치면 점 위 번호만. */
export const EVENT_BAND_ROW_H = 20;
export const EVENT_BAND_MAX_ROWS = 3;
/** 글자 없는(폰) 배지 폭 = 번호 원 하나. */
export const EVENT_BADGE_NUM_W = 18;
const BADGE_GAP = 4;
/** 배지의 번호 원 중심 = 배지 왼쪽 + 9 — 마커 x 바로 위에 원이 오도록 왼쪽을 x − 9 로 둔다. */
const BADGE_HALF = 9;

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

export interface EventBandItem {
  n: number;
  /** 마커 x(px · 레인 왼쪽 기준). */
  xPx: number;
  /** 배지 글자 — 빈 문자열이면 번호만(폰). */
  text: string;
}

export interface PlacedEventBadge {
  n: number;
  /** 0 ~ MAX_ROWS − 1 · −1 = 띠에 자리가 없어 점 위 번호만. */
  row: number;
  left: number;
  width: number;
}

/**
 * 번호 배지를 라벨 띠에 시간순 탐욕 배치한다(스케치 011 `lane()` 의 rows 로직). 줄 r 은 그 줄 마지막 오른쪽 끝 + 4 가
 * 배지 왼쪽(x − 9) 이하이고 배지가 폭 안에 들어가면 빈 줄이다. 세 줄이 다 차면 row −1(점 위 번호만). 배지는 폭 밖으로
 * 나가지 않는다. 반환 rows = 쓰인 줄 수(0 이면 띠 없음).
 */
export function layoutEventBand(
  items: readonly EventBandItem[],
  widthPx: number,
): { rows: number; placed: PlacedEventBadge[] } {
  const ends: number[] = [];
  const placed: PlacedEventBadge[] = [];
  for (const it of items) {
    const w = it.text === '' ? EVENT_BADGE_NUM_W : estimateLabelWidth(it.text) + 24;
    const want = Math.max(0, Math.min(it.xPx - BADGE_HALF, widthPx - w));
    let row = -1;
    for (let r = 0; r < EVENT_BAND_MAX_ROWS; r += 1) {
      const end = ends[r];
      if (end === undefined) {
        if (w <= widthPx) row = r;
        break;
      }
      if (end + BADGE_GAP <= it.xPx - BADGE_HALF && end + BADGE_GAP + w <= widthPx) {
        row = r;
        break;
      }
    }
    if (row < 0) {
      placed.push({ n: it.n, row: -1, left: r2(it.xPx - BADGE_HALF), width: EVENT_BADGE_NUM_W });
      continue;
    }
    const end = ends[row];
    const left = end === undefined ? want : Math.max(want, end + BADGE_GAP);
    ends[row] = left + w;
    placed.push({ n: it.n, row, left: r2(left), width: w });
  }
  return { rows: ends.length, placed };
}
