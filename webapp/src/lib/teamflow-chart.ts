/**
 * 팀 매집 차트 픽셀 기하 순수 함수 모듈 (Phase 33 · UI-SPEC T4 · T6 · T8).
 *
 * 표시 글자 변환은 `teamflow-report.ts`, 좌표 · 크기 계산은 여기 — 컴포넌트는 그리기만 한다(테스트가 기하를 직접 잠근다).
 * 33-03 = 행 미니막대(`stripBarsOf`) · 33-05 = 구간 가로 막대(`bandChartOf`). 뒤 플랜(33-06 10분 흐름 차트)이 덧붙인다.
 */

import type { TeamflowBand } from '@gh-radar/shared';

import { toneOf, type TeamflowTone } from './teamflow-report';

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
 * 판 = W − 96 − 120 · cx = 96 + 판/2 · sc = (판/2 − 8) ÷ max(5천만, |net_val| 최대) ·
 * 막대 + 는 cx 오른쪽 · − 는 왼쪽 · 20% 점선 = 「20~25%」 행 위끝.
 */
export function bandChartOf(bands: readonly TeamflowBand[], measuredW: number): BandChart {
  const W = chartWidthOf(measuredW);
  const src = bands.filter((b) => b.label !== DAY_TOTAL);
  const H = BAND_TOP + BAND_FOOT + src.length * BAND_ROW_H;
  const plotW = W - BAND_LABEL_W - BAND_VALUE_W;
  const cx = BAND_LABEL_W + plotW / 2;
  const mx = Math.max(BAND_MX_FLOOR, ...src.map((b) => b.net_val).filter(isNum).map(Math.abs));
  const sc = (plotW / 2 - BAND_PAD) / mx;
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
