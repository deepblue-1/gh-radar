/**
 * Phase 28 Plan 13 — 상한가 보고서 e2e 픽스처 (P28-R1).
 *
 * 원천 = 워커 픽스처 실 export 20261002(`workers/limitup-sync/tests/fixtures/export/20261002/` — gh-trade `tickana/export.py`
 * 출력 그대로). 3종목: 덕우전자(잠김 ① 10초 뒤 깨짐) · 엑시온그룹(잠김 ② 종가 유지) · 형지글로벌(미도달).
 * - entries · locks · facts 는 export 행 그대로, marks 는 jumps 의 burst_sell · cancel(종목마다 krw 큰 순 40개 — RPC 와 같은 자르기),
 *   summaries 의 `q_krw` 는 실 격자 coarse 열 그대로(28-06 파생과 같은 원천).
 * - prev(어제 locks 2행 — 한 행은 D+1 미도착 null) · fingerprint(n 12 창구 1 · n 3 창구 1 + 21행 채움 = 23행)는 합성이다.
 * - `gridFixtureGz(isin)` = 격자 파일 `.json.gz` 바이트 그대로(브라우저가 `DecompressionStream` 으로 푼다).
 * ★ 실계좌 · 실서버 리터럴 없음 — 서명 URL 은 `grid.e2e.invalid`(예약 TLD) 가짜 주소이고 spec 의 `page.route` 가 받는다.
 */

import type {
  LimitupDate,
  LimitupFingerprintRow,
  LimitupGridSummaryRow,
  LimitupReportResponse,
} from '@gh-radar/shared';

import {
  AXION,
  DUKWOO,
  EXPORT_DATE,
  HYUNGJI,
  exportEntries,
  exportFacts,
  exportLocks,
  exportMarks,
  gridGzOf,
  gridOf,
} from '@/test-fixtures/limitup-export';
import { lockRow } from '@/test-fixtures/limitup-report';

export { AXION, DUKWOO, HYUNGJI };

export type LoadedLimitupReport = Extract<LimitupReportResponse, { loaded: true }>;

/** 적재 날짜(내림차순) — 최신 = export 날짜. */
export const LIMITUP_LATEST: LimitupDate = EXPORT_DATE;
export const LIMITUP_DATES: LimitupDate[] = [EXPORT_DATE, '20261001', '20260930'];

/** 지문표 — 게이트를 넘은 창구 · 관찰 중 창구. */
export const FP_LIVE_MEMBER = '00050';
export const FP_OBSERVING_MEMBER = '00002';
export const FP_ROWS = 23;

/** 어제 결과 — D+1 이 아직 없는 행의 종목명. */
export const PREV_PENDING_NAME = '어제대기종목';

function summaryOf(isin: string, date: LimitupDate): LimitupGridSummaryRow {
  const g = gridOf(isin);
  const q = (g.coarse.cols.q_krw ?? []).map((v) => (typeof v === 'number' ? v : null));
  const t = g.coarse.cols.t_ms ?? [];
  let max: number | null = null;
  let at: number | null = null;
  q.forEach((v, i) => {
    if (v != null && (max === null || v > max)) {
      max = v;
      at = typeof t[i] === 'number' ? (t[i] as number) : null;
    }
  });
  return {
    date,
    isin,
    step_s: g.coarse.step_s,
    sec0: g.coarse.sec[0]!,
    q_krw: q,
    q_max_krw: max,
    q_max_ms: at,
    sell_share_60s: isin === DUKWOO ? 0.37 : isin === AXION ? 0.07 : null,
  };
}

function fingerprint(): LimitupFingerprintRow[] {
  const base = {
    entry_sum: 0, entry_cnt: 0, lock_buy_sum: 0, lock_buy_cnt: 0, pre_sell_sum: 0, pre_sell_cnt: 0,
    lead: 0, n_broke: 0, n_lock: 0, n_held: 0,
  };
  return [
    { ...base, member: FP_LIVE_MEMBER, name: '키움증권', n: 12, entry_sum: 3.96, entry_cnt: 12, lock_buy_sum: 1.2,
      lock_buy_cnt: 4, pre_sell_sum: 0.6, pre_sell_cnt: 3, lead: 2, n_broke: 3, n_lock: 4, n_held: 1 },
    { ...base, member: FP_OBSERVING_MEMBER, name: '신한증권', n: 3, entry_sum: 0.9, entry_cnt: 3, pre_sell_sum: 0.41,
      pre_sell_cnt: 1, lead: 1, n_broke: 1, n_lock: 1 },
    ...Array.from({ length: FP_ROWS - 2 }, (_, i) => ({
      ...base,
      member: `7${String(i).padStart(4, '0')}`,
      name: `채움창구${i + 1}`,
      n: 1,
      entry_sum: 0.1,
      entry_cnt: 1,
    })),
  ];
}

/** 보고서 한 장(`GET /api/limitup/report?d=` 200 본문). 날짜를 바꾸면 행의 `date` 만 옮긴다. */
export function limitupReportFixture(
  opts: { date?: LimitupDate; dates?: LimitupDate[] } = {},
): LoadedLimitupReport {
  const date = opts.date ?? LIMITUP_LATEST;
  const dates = opts.dates ?? LIMITUP_DATES;
  const at = <T extends { date: LimitupDate }>(rows: T[]) => rows.map((r) => ({ ...r, date }));
  const idx = dates.indexOf(date);
  const prevDate = idx >= 0 && idx + 1 < dates.length ? dates[idx + 1]! : null;
  return {
    access: true,
    dates,
    date,
    loaded: true,
    day: {
      entries: at(exportEntries()),
      locks: at(exportLocks()),
      facts: at(exportFacts()),
      summaries: [DUKWOO, AXION, HYUNGJI].map((i) => summaryOf(i, date)),
      marks: exportMarks(),
      rows: null,
    },
    prev:
      prevDate === null
        ? null
        : {
            date: prevDate,
            locks: [
              lockRow({ date: prevDate, isin: 'KR7900000018', lock_id: 1, name: '어제상한종목', short_code: '900001',
                upper_px: 14100, close_px: 14100, broke: false, d1_open: 14450, d1_ret: 0.0248 }),
              lockRow({ date: prevDate, isin: 'KR7900000026', lock_id: 1, name: PREV_PENDING_NAME, short_code: '900002',
                upper_px: 5730, close_px: 5600, broke: true }),
            ],
          },
    fingerprint: fingerprint(),
  };
}

/** 격자 파일 바이트(`.json.gz`) — 서명 URL 목 응답 본문. */
export function gridFixtureGz(isin: string): Buffer {
  return gridGzOf(isin);
}
