/**
 * accum-report — 매집감지 보고서(`/analytics/accum`) 표시 변환 (Phase 34 · UI-SPEC A11 「표시 변환 규칙」).
 *
 * - 행 키는 export 열 이름 그대로(snake_case · `@gh-radar/shared` AccumReportRow). 원 → 억 · % · 시각 변환은 여기와
 *   `lib/teamflow-report.ts` 의 포매터만 한다 — **억 · % · 시각 포매터를 새로 만들지 않는다**(D-13 · fmtEok · toneOf 재사용).
 * - 라이브 작업대(`lib/accum-list.ts` `sortAccum` · shared `ACCUM_STATE_LABELS`)를 import 하지 않는다 — 행 모양이 다르고
 *   정렬 규칙(매집중/매도중을 가른다 · D-08)과 상태 3 라벨(「종료」 · D-11)이 다르다.
 * - kind 16(라이브)과 join 하지 않는다 — 이 보고서의 이력 정본은 `limitup_accum_flow` 다(D-22).
 */

import type { AccumReportRow } from '@gh-radar/shared';

import { fmtEok, isNum, toneOf, type TeamflowTone } from './teamflow-report';

/**
 * 밤 적재 시각 「HH:MM」 — 빈 상태 2곳 · 머리 출처 칩 · 상세 출처 칩이 모두 이 값 하나를 읽는다.
 * D-24 ① 10분 미루기(운반 20:20 → 20:30 · 적재 20:30 → 20:40)가 실행되면 **여기 하나만** 「20:40」 으로 바꾼다.
 */
export const ACCUM_LOAD_HM = '20:30';

const DASH = '—';

/** state 정렬 순위 — 1 매집중 → 2 매도중 → 3 종료 → 그 밖(null 포함) 맨 뒤. */
function stateRank(state: number | null): number {
  return state === 1 || state === 2 || state === 3 ? state : 4;
}

/**
 * 목록 정렬(D-08): state 1 → 2 → 3 · 그 안 `pos_net_krw` 내림차순(null 맨 뒤) · 같으면 isin 오름차순.
 * 원본 배열을 바꾸지 않는다.
 */
export function sortAccumRows<R extends AccumReportRow>(rows: readonly R[]): R[] {
  return [...rows].sort((a, b) => {
    const s = stateRank(a.state) - stateRank(b.state);
    if (s !== 0) return s;
    const an = isNum(a.pos_net_krw);
    const bn = isNum(b.pos_net_krw);
    if (an !== bn) return an ? -1 : 1;
    if (an && bn && a.pos_net_krw !== b.pos_net_krw) return b.pos_net_krw! - a.pos_net_krw!;
    return a.isin < b.isin ? -1 : a.isin > b.isin ? 1 : 0;
  });
}

/** 상태 라벨(D-11 자체 라벨) — 1 「매집중」 · 2 「매도중」 · 3 「종료」 · 그 밖 「—」. */
export function stateLabelOf(state: number | null | undefined): string {
  if (state === 1) return '매집중';
  if (state === 2) return '매도중';
  if (state === 3) return '종료';
  return DASH;
}

const PX_FMT = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

/** 가격(원) → 「205,500」 · null/NaN/0 이하 「—」. */
export function fmtPx(n: number | null | undefined): string {
  if (!isNum(n) || n <= 0) return DASH;
  return PX_FMT.format(Math.round(n));
}

export interface AccumDetailKpi {
  label: string;
  text: string;
  /** 부호 색이 필요한 항목만(등록 후 순매수) */
  tone?: TeamflowTone;
}

/**
 * 상세 KPI 줄 4항목(D-19 · 마지막 사이클 = 평평한 열 · 임계 없음):
 * 「등록가」 · 「평단」(fmtPx) · 「등록 후 순매수」(±억 1자리 · 부호 색) · 「최고 순매수」(±억 1자리).
 */
export function detailKpisOf(row: AccumReportRow): AccumDetailKpi[] {
  return [
    { label: '등록가', text: fmtPx(row.pos_reg_px) },
    { label: '평단', text: fmtPx(row.pos_avg_px) },
    { label: '등록 후 순매수', text: fmtEok(row.pos_net_krw, { signed: true }), tone: toneOf(row.pos_net_krw) },
    { label: '최고 순매수', text: fmtEok(row.pos_peak_net_krw, { signed: true }) },
  ];
}
