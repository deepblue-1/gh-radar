/**
 * Phase 28 Plan 12 — 보고서 응답 테스트 빌더(lib 단위 · 컴포넌트 테스트 공용).
 *
 * 행은 shared 계약(`LimitupEntryRow` 35열 · `LimitupLockRow` 22열 · `LimitupGridSummaryRow`)을 그대로 채운다 —
 * 지정하지 않은 열은 실데이터 결측과 같은 `null` 이다.
 */

import type {
  LimitupDay,
  LimitupEntryRow,
  LimitupGridSummaryRow,
  LimitupLockRow,
  LimitupReportResponse,
} from '@gh-radar/shared';

export type LoadedReport = Extract<LimitupReportResponse, { loaded: true }>;

/** `YYYYMMDD` + KST `HH:MM:SS` → epoch ms. */
export function kstMs(ymd: string, hms: string): number {
  const [h, m, s] = hms.split(':').map(Number);
  return Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)), h! - 9, m!, s!);
}

export function entryRow(p: Partial<LimitupEntryRow> & { isin: string }): LimitupEntryRow {
  return {
    date: '20261002',
    short_code: null,
    name: null,
    base_px: null,
    upper_px: null,
    list_shares: null,
    mcap_krw: null,
    sec_group: null,
    max_rate: null,
    t15_ms: null,
    t20_ms: null,
    t25_ms: null,
    detect_rate_pct: null,
    reached: null,
    first_upper_ms: null,
    entry_from_ms: null,
    wall_krw_before: null,
    wall_truncated_before: null,
    wall_clear_s: null,
    max_burst_krw: null,
    max_burst_ms: null,
    max_burst_pieces: null,
    entry_buy_member1: null,
    entry_buy_share1: null,
    entry_buy_member2: null,
    entry_buy_share2: null,
    entry_buy_member3: null,
    entry_buy_share3: null,
    close_px: null,
    close_ret: null,
    d1_date: null,
    d1_open: null,
    d1_ret: null,
    schema_version: 1,
    ...p,
  };
}

export function lockRow(p: Partial<LimitupLockRow> & { isin: string; lock_id: number }): LimitupLockRow {
  return {
    date: '20261002',
    exchange: 'KRX',
    board: null,
    short_code: null,
    name: null,
    upper_px: null,
    close_px: null,
    close_ret: null,
    start_ms: null,
    end_ms: null,
    dur_s: null,
    broke: null,
    outcome: null,
    break_px: null,
    q0: null,
    d1_date: null,
    d1_open: null,
    d1_ret: null,
    data_end: null,
    schema_version: 1,
    ...p,
  };
}

export function summaryRow(p: Partial<LimitupGridSummaryRow> & { isin: string }): LimitupGridSummaryRow {
  return {
    date: '20261002',
    step_s: 10,
    sec0: 32400,
    q_krw: [],
    q_max_krw: null,
    q_max_ms: null,
    sell_share_60s: null,
    ...p,
  };
}

export function dayOf(p: Partial<LimitupDay>): LimitupDay {
  return { entries: [], locks: [], facts: [], summaries: [], marks: [], rows: null, ...p };
}

export function loadedReport(p: {
  date?: string;
  dates?: string[];
  day?: Partial<LimitupDay>;
  prev?: LoadedReport['prev'];
}): LoadedReport {
  return {
    access: true,
    dates: p.dates ?? ['20261002', '20261001'],
    date: p.date ?? '20261002',
    loaded: true,
    day: dayOf(p.day ?? {}),
    prev: p.prev ?? null,
    fingerprint: [],
  };
}
