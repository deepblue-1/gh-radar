/**
 * 팀 매집 차트 픽셀 기하 순수 함수 모듈 (Phase 33 · UI-SPEC T4 · T6 · T8).
 *
 * 표시 글자 변환은 `teamflow-report.ts`, 좌표 · 크기 계산은 여기 — 컴포넌트는 그리기만 한다(테스트가 기하를 직접 잠근다).
 * 33-03 = 행 미니막대(`stripBarsOf`). 뒤 플랜(33-05 구간 가로 막대 · 33-06 10분 흐름 차트)이 덧붙인다.
 */

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
