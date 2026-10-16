/**
 * 팀 매집 차트 픽셀 기하 순수 함수 모듈 (Phase 33 · UI-SPEC T4 · T6 · T8).
 *
 * 표시 글자 변환은 `teamflow-report.ts`, 좌표 · 크기 계산은 여기 — 컴포넌트는 그리기만 한다(테스트가 기하를 직접 잠근다).
 * 33-03 = 행 미니막대(`stripBarsOf`) · 33-05 = 구간 가로 막대(`bandChartOf`) · 33-06 = 10분 흐름 차트(`bucketChartOf`).
 */

import type { TeamflowBand, TeamflowBucket, TeamflowWindow } from '@gh-radar/shared';

import { kstSecOf } from './limitup-report';
import { BUCKET_KEY_CLOSE, BUCKET_KEY_FIRST, BUCKET_SLOTS, kstHm, toneOf, type TeamflowTone } from './teamflow-report';

/** 측정 폭을 모를 때(jsdom clientWidth 0 · 첫 렌더) 쓰는 폭 — Pitfall 8. */
export const CHART_FALLBACK_W = 640;

/** 측정 폭이 유한 양수면 그대로, 아니면 `CHART_FALLBACK_W`. */
export function chartWidthOf(measured: number): number {
  return Number.isFinite(measured) && measured > 0 ? measured : CHART_FALLBACK_W;
}

/** 미니막대 viewBox `0 0 178 28` — 칸 18 · 사이 2 · 0선 y 14 · 막대 최대 높이 12. */
const STRIP_CELL_W = 18;
const STRIP_PITCH = 20;
const STRIP_MID = 14;
const STRIP_MAX_H = 12;
const STRIP_MIN_H = 1.5;
/** 행별 스케일 하한 — 값이 작은 행이 꽉 찬 막대로 과장되지 않게(5천만 원). */
const STRIP_MX_FLOOR = 5e7;

export interface StripBar {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 색 판정(반올림 억 1자리) — 빈 칸은 flat */
  tone: TeamflowTone;
  /** 값 없는 칸(체결 없음) — 1px 빈 선 */
  empty: boolean;
}

const isNum = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * 9칸 슬롯(`bandSlotsOf`) → 막대 기하. 칸 i: x = i × 20 · 폭 18 ·
 * null = y 13.5 높이 1(빈 선) · 값 = 높이 max(1.5, |v| ÷ mx × 12) · 0 이상은 0선 위(y = 14 − h) · 음수는 아래(y = 14).
 * mx = max(5천만 원, 행 |값| 최대) — 행마다 따로.
 */
export function stripBarsOf(slots: readonly (number | null)[]): StripBar[] {
  const mx = Math.max(STRIP_MX_FLOOR, ...slots.filter(isNum).map(Math.abs));
  return slots.map((v, i) => {
    const x = i * STRIP_PITCH;
    if (!isNum(v)) return { x, y: STRIP_MID - 0.5, w: STRIP_CELL_W, h: 1, tone: 'flat', empty: true };
    const h = Math.max(STRIP_MIN_H, (Math.abs(v) / mx) * STRIP_MAX_H);
    return { x, y: v >= 0 ? STRIP_MID - h : STRIP_MID, w: STRIP_CELL_W, h, tone: toneOf(v), empty: false };
  });
}

/** 구간 가로 막대(UI-SPEC T6 치수 표) — 행 28 · 막대 16 · 왼쪽 라벨 칸 96 · 오른쪽 값 칸 120 · 위 8 · 아래 각주 16. */
export const BAND_ROW_H = 28;
export const BAND_BAR_H = 16;
export const BAND_LABEL_W = 96;
export const BAND_VALUE_W = 120;
const BAND_TOP = 8;
const BAND_FOOT = 16;
/** 막대 끝과 판 가장자리 사이 여유. */
const BAND_PAD = 8;
/** 스케일 하한 — 값이 작은 종목의 막대가 판을 꽉 채워 과장되지 않게(5천만 원). */
const BAND_MX_FLOOR = 5e7;
/** 0 이 아닌 값의 최소 막대 폭. */
const BAND_MIN_W = 2;
const DAY_TOTAL = '하루 합계';

export interface BandChartRow {
  label: string;
  /** 행 위끝(투명 히트 rect y) */
  y: number;
  /** 막대 위끝 — 행 가운데 16px */
  barY: number;
  barX: number;
  /** null · 0 = 0 · 그 밖 max(2, |v| × sc) */
  barW: number;
  tone: TeamflowTone;
  /** net_val(원) */
  net: number | null;
  /** 매수 중 팀 0~1 */
  share: number | null;
  vol: number | null;
  /** 「상한가 가격」 행 — 라벨 600 `--fg` */
  isLimit: boolean;
}

export interface BandChart {
  W: number;
  H: number;
  /** 중앙 0선 x */
  cx: number;
  /** 원 → px */
  sc: number;
  /** 20% 점선 y — 「20~25%」 행이 있고 첫 행이 아닐 때만 */
  y20: number | null;
  rows: BandChartRow[];
}

/**
 * payload.bands + 측정 폭 → 구간 가로 막대 기하(D-12 · UI-SPEC T6). viewBox 를 측정 폭과 1:1 로 두기 위한 값이다.
 * W = chartWidthOf(측정) · 행 = 「하루 합계」 를 뺀 bands(export 순서) · H = 24 + 행 수 × 28 ·
 * 판 = W − 96 − 120 · cx = 96 + 판/2 · sc = max(0, 판/2 − 8) ÷ max(5천만, |net_val| 최대) ·
 * 막대 + 는 cx 오른쪽 · − 는 왼쪽 · 20% 점선 = 「20~25%」 행 위끝.
 */
export function bandChartOf(bands: readonly TeamflowBand[], measuredW: number): BandChart {
  const W = chartWidthOf(measuredW);
  const src = bands.filter((b) => b.label !== DAY_TOTAL);
  const H = BAND_TOP + BAND_FOOT + src.length * BAND_ROW_H;
  const plotW = W - BAND_LABEL_W - BAND_VALUE_W;
  const cx = BAND_LABEL_W + plotW / 2;
  const mx = Math.max(BAND_MX_FLOOR, ...src.map((b) => b.net_val).filter(isNum).map(Math.abs));
  // 측정 폭 < 232(라벨 96 + 값 120 + 여백 2×8)면 판 반폭이 음수 — 스케일을 0 으로 막아 음수 폭 계산을 막는다(IN-02).
  const sc = Math.max(0, plotW / 2 - BAND_PAD) / mx;
  const rows = src.map((b, i): BandChartRow => {
    const v = isNum(b.net_val) ? b.net_val : null;
    const y = BAND_TOP + i * BAND_ROW_H;
    const barW = v === null || v === 0 ? 0 : Math.max(BAND_MIN_W, Math.abs(v) * sc);
    return {
      label: b.label,
      y,
      barY: y + (BAND_ROW_H - BAND_BAR_H) / 2,
      barX: v !== null && v < 0 ? cx - barW : cx,
      barW,
      tone: toneOf(v),
      net: v,
      share: isNum(b.share) ? b.share : null,
      vol: isNum(b.vol) ? b.vol : null,
      isLimit: b.label === '상한가 가격',
    };
  });
  const i20 = src.findIndex((b) => b.label === '20~25%');
  return { W, H, cx, sc, y20: i20 > 0 ? BAND_TOP + i20 * BAND_ROW_H : null, rows };
}

/* ───────── 10분 흐름 차트 (UI-SPEC T8 치수 표 · D-13 39칸 고정축) ───────── */

/** 왼쪽 축 40 · 오른쪽 축 36 · 위 8 · 막대 판 128 · 판 사이 16 · 등락률 띠 판 56 · 시각 눈금 20 → 높이 228. */
export const BUCKET_L = 40;
export const BUCKET_R = 36;
export const BUCKET_T = 8;
export const BUCKET_H1 = 128;
export const BUCKET_GAP = 16;
export const BUCKET_H2 = 56;
export const BUCKET_TICK = 20;
export const BUCKET_H = BUCKET_T + BUCKET_H1 + BUCKET_GAP + BUCKET_H2 + BUCKET_TICK;
/** 팀 비중 선 위끝 = 60%(초과는 위끝 고정). */
const BUCKET_SHARE_TOP = 0.6;
/** 스케일 하한 5천만 원 · 최소 막대 / 띠 높이 1.5. */
const BUCKET_MX_FLOOR = 5e7;
const BUCKET_MIN_H = 1.5;
/** 「첫 상한가 HH:MM」 11/600 폭 추정(SVG 글자 측정 없음 — 33-07 E2E 백스톱) · 선과 라벨 사이 4. */
const FIRST_LIMIT_LABEL_W = 84;
const FIRST_LIMIT_PAD = 4;
/** 09:00 = 540분. */
const MARKET_OPEN_MIN = 540;

const slotOf = (W: number) => (W - BUCKET_L - BUCKET_R) / BUCKET_SLOTS;

const hmToMin = (hm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

const clampSlot = (i: number) => Math.min(BUCKET_SLOTS - 1, Math.max(0, i));

/**
 * payload.window → 10분 key 범위 `[k0, k1]`(양끝 포함 · 오름차순) — 「HH:MM」 → 분 → `floor(분 / 10)`. 축으로 자르지 않는다.
 * null · 형식이 틀린 시각 → null. 10분 표가 이 범위로 띠를 판정한다(축 밖 key 행도 원자료 그대로 — IN-03).
 */
export function windowKeysOf(window: Pick<TeamflowWindow, 'start' | 'end'> | null | undefined): [number, number] | null {
  if (!window) return null;
  const a = hmToMin(window.start);
  const b = hmToMin(window.end);
  if (a === null || b === null) return null;
  const k0 = Math.floor(a / 10);
  const k1 = Math.floor(b / 10);
  return k0 <= k1 ? [k0, k1] : [k1, k0];
}

/**
 * payload.window → 음영 칸 범위 `[s0, s1]`(양끝 포함) — `windowKeysOf` 의 key − 54 를 0~38 로 자른다.
 * 창 전체가 축 밖(끝 key < 54 · 시작 key > 93)이면 null — 가장자리 칸에 거짓 음영을 만들지 않는다(IN-03).
 * key 93(종가 단일가)은 슬롯 38 에 합산되므로 축 안이다. null · 형식이 틀린 시각 → null.
 */
export function windowSlotsOf(window: Pick<TeamflowWindow, 'start' | 'end'> | null | undefined): [number, number] | null {
  const ks = windowKeysOf(window);
  if (!ks) return null;
  const [k0, k1] = ks;
  if (k1 < BUCKET_KEY_FIRST || k0 > BUCKET_KEY_CLOSE) return null;
  return [clampSlot(k0 - BUCKET_KEY_FIRST), clampSlot(k1 - BUCKET_KEY_FIRST)];
}

export interface FirstLimitX {
  x: number;
  /** 라벨이 오른쪽 끝(W − 36)을 넘으면 'end'(선 왼쪽) */
  anchor: 'start' | 'end';
}

/**
 * first_limit_ms → 세로선 x — KST 분(초 포함 소수) 정확 위치 `40 + (분 − 540) ÷ 10 × slot` · `[40, W − 36]` 로 자른다
 * (09:00 이전 · 15:30 이후는 축 끝). 라벨(≈ 84px)이 `x + 4` 에서 오른쪽 끝을 넘으면 anchor 'end'. null → null.
 */
export function firstLimitXOf(ms: number | null | undefined, measuredW: number): FirstLimitX | null {
  if (!isNum(ms)) return null;
  const W = chartWidthOf(measuredW);
  const right = W - BUCKET_R;
  const min = kstSecOf(ms) / 60;
  const raw = BUCKET_L + ((min - MARKET_OPEN_MIN) / 10) * slotOf(W);
  const x = Math.min(right, Math.max(BUCKET_L, raw));
  return { x, anchor: x + FIRST_LIMIT_PAD + FIRST_LIMIT_LABEL_W > right ? 'end' : 'start' };
}

export interface BucketBar {
  i: number;
  x: number;
  y: number;
  w: number;
  h: number;
  tone: TeamflowTone;
}

export interface BucketRate {
  i: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BucketHit {
  i: number;
  /** 칸 전체 폭(투명 히트 rect) */
  x: number;
  w: number;
  bucket: TeamflowBucket;
}

export interface BucketChart {
  W: number;
  H: number;
  slot: number;
  barW: number;
  /** 0선 y — 막대 판 위에서 55% */
  zero: number;
  /** 막대 스케일(원) = max(5천만, |net_val| 최대) */
  mx: number;
  rlo: number;
  rhi: number;
  /** 20% 점선 y */
  y20: number;
  /** 등락률 축 위끝(rhi) y */
  yTop: number;
  bars: BucketBar[];
  rates: BucketRate[];
  /** 비중 선 구간 — 빈 칸 · share null 에서 끊긴다 */
  shareSegments: { x: number; y: number }[][];
  shade: { x: number; w: number } | null;
  firstLimit: (FirstLimitX & { label: string }) | null;
  ticks: { x: number; label: string }[];
  hits: BucketHit[];
  /** 39칸 전부 null */
  empty: boolean;
}

/**
 * 39칸 슬롯(`bucketSlotsOf`) + window + first_limit_ms + 측정 폭 → 10분 흐름 차트 기하(UI-SPEC T8 · 스케치 015 bucketChart 이식 —
 * 가변 칸 대신 39칸 고정). viewBox 를 측정 폭과 1:1 로 둔다.
 * slot = (W − 76) ÷ 39 · 막대 폭 max(2, slot − 2) · x(i) = 40 + i × slot + 1 · 0선 = 8 + 128 × 0.55 ·
 * 막대 h = max(1.5, |v| ÷ mx × (v ≥ 0 ? 위 여유 : 아래 여유)) · 비중 선 y = 8 + 128 − min(s, 0.6) ÷ 0.6 × 128 ·
 * 등락률 띠 축 rlo = min(0, lo 최소) · rhi = max(30, hi 최대) · 음영 = window 칸(양끝 포함) · 눈금 9~15시 = 슬롯 h × 6 − 54 가운데.
 */
export function bucketChartOf(
  slots: readonly (TeamflowBucket | null)[],
  window: Pick<TeamflowWindow, 'start' | 'end'> | null | undefined,
  firstLimitMs: number | null | undefined,
  measuredW: number,
): BucketChart {
  const W = chartWidthOf(measuredW);
  const slot = slotOf(W);
  const barW = Math.max(2, slot - 2);
  const xOf = (i: number) => BUCKET_L + i * slot + 1;
  const T = BUCKET_T;
  const H1 = BUCKET_H1;
  const zero = T + H1 * 0.55;
  const up = zero - T - 4;
  const dn = T + H1 - zero - 4;

  const filled = slots
    .map((bucket, i) => (bucket ? { i, bucket } : null))
    .filter((v): v is { i: number; bucket: TeamflowBucket } => v !== null);

  const mx = Math.max(BUCKET_MX_FLOOR, ...filled.map((f) => f.bucket.net_val).filter(isNum).map(Math.abs));
  const ys = (s: number) => T + H1 - (Math.min(s, BUCKET_SHARE_TOP) / BUCKET_SHARE_TOP) * H1;
  const rlo = Math.min(0, ...filled.map((f) => f.bucket.lo).filter(isNum));
  const rhi = Math.max(30, ...filled.map((f) => f.bucket.hi).filter(isNum));
  const bandBottom = T + H1 + BUCKET_GAP + BUCKET_H2;
  const yr = (r: number) => bandBottom - ((r - rlo) / (rhi - rlo)) * BUCKET_H2;

  const bars: BucketBar[] = [];
  const rates: BucketRate[] = [];
  const hits: BucketHit[] = [];
  for (const { i, bucket } of filled) {
    const x = xOf(i);
    hits.push({ i, x: BUCKET_L + i * slot, w: slot, bucket });
    const v = bucket.net_val;
    if (isNum(v)) {
      const h = Math.max(BUCKET_MIN_H, (Math.abs(v) / mx) * (v >= 0 ? up : dn));
      bars.push({ i, x, y: v >= 0 ? zero - h : zero, w: barW, h, tone: toneOf(v) });
    }
    const lo = isNum(bucket.lo) ? bucket.lo : bucket.hi;
    const hi = isNum(bucket.hi) ? bucket.hi : bucket.lo;
    if (isNum(lo) && isNum(hi)) {
      rates.push({ i, x, y: yr(hi), w: barW, h: Math.max(BUCKET_MIN_H, yr(lo) - yr(hi)) });
    }
  }

  const shareSegments: { x: number; y: number }[][] = [];
  let seg: { x: number; y: number }[] = [];
  slots.forEach((bucket, i) => {
    const s = bucket?.share;
    if (isNum(s)) seg.push({ x: xOf(i) + barW / 2, y: ys(s) });
    else if (seg.length > 0) {
      shareSegments.push(seg);
      seg = [];
    }
  });
  if (seg.length > 0) shareSegments.push(seg);

  const ws = windowSlotsOf(window);
  const shade = ws ? { x: xOf(ws[0]) - 1, w: xOf(ws[1]) + barW - xOf(ws[0]) + 2 } : null;

  const fl = firstLimitXOf(firstLimitMs, W);
  const firstLimit = fl && isNum(firstLimitMs) ? { ...fl, label: `첫 상한가 ${kstHm(firstLimitMs)}` } : null;

  const ticks = [9, 10, 11, 12, 13, 14, 15].map((h) => ({ x: xOf(h * 6 - BUCKET_KEY_FIRST) + barW / 2, label: `${h}시` }));

  return {
    W,
    H: BUCKET_H,
    slot,
    barW,
    zero,
    mx,
    rlo,
    rhi,
    y20: yr(20),
    yTop: yr(rhi),
    bars,
    rates,
    shareSegments,
    shade,
    firstLimit,
    ticks,
    hits,
    empty: filled.length === 0,
  };
}
