import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 28 Plan 12 Task 1 — 보고서 순수 계산 lib + API (D-11 · D-12).
 *
 * 잠그는 것:
 *  - KPI 5칸 값 정의 = gh-trade `_section_b_grid`(같은 숫자 원칙 · UI-SPEC P-5)
 *  - 결과 태그(UI-SPEC ④-3 · 종가 규칙 = gh-trade `_result_tag`) · 행 순서(gh-trade `_stocks`) · 행 메타 표기
 *  - 날짜 탐색 · `?d` 파싱 · 「10/02 (금)」 · 「HH:MM:SS」 · 스파크 경로
 *  - API 경로(`/api/limitup/report` · `/api/limitup/grid-urls`)
 */

const authFetchMock = vi.fn();
vi.mock('../auth-fetch', () => ({
  authFetch: (...args: unknown[]) => authFetchMock(...args),
}));

import { fetchLimitupGridUrls, fetchLimitupReport } from '../limitup-api';
import {
  dateNavOf,
  dayRowsOf,
  fmtYmdLabel,
  kpisOf,
  kstClock,
  parseYmdParam,
  resultTagsOf,
  sparkPathOf,
  sparkYMaxOf,
  stocksOf,
} from '../limitup-report';
import { entryRow, kstMs, loadedReport, lockRow, summaryRow } from '@/test-fixtures/limitup-report';

const D = '20261002';
const A = 'KR7000001001';
const B = 'KR7000002009';
const C = 'KR7000003007';

beforeEach(() => {
  authFetchMock.mockReset();
  authFetchMock.mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// KPI
// ---------------------------------------------------------------------------

describe('kpisOf — gh-trade _section_b_grid 정의', () => {
  const day = {
    entries: [
      entryRow({ isin: A, reached: true, t25_ms: 1, first_upper_ms: kstMs(D, '09:05:00') }),
      entryRow({ isin: B, reached: true, t25_ms: 1, first_upper_ms: kstMs(D, '09:10:00') }),
      // 미도달 · 25% 는 찍었다
      entryRow({ isin: C, reached: false, t25_ms: kstMs(D, '10:00:00') }),
    ],
    locks: [
      lockRow({ isin: A, lock_id: 1, upper_px: 10000, close_px: 10000, broke: true }),
      lockRow({ isin: A, lock_id: 2, upper_px: 10000, close_px: 10000, broke: true }),
      lockRow({ isin: A, lock_id: 3, upper_px: 10000, close_px: 10000, broke: false }),
      lockRow({ isin: B, lock_id: 1, upper_px: 20000, close_px: 18000, broke: true }),
    ],
  };

  it('탐지 3 · 잠김 4 · 유지 1 / 2 · 25%↑ 미도달 1 · 어제 D+1 중앙값 +0.9% (3건)', () => {
    const r = loadedReport({
      day,
      prev: {
        date: '20261001',
        locks: [
          lockRow({ isin: A, lock_id: 1, d1_ret: 0.02 }),
          lockRow({ isin: B, lock_id: 1, d1_ret: -0.01 }),
          lockRow({ isin: C, lock_id: 1, d1_ret: 0.009 }),
          lockRow({ isin: C, lock_id: 2, d1_ret: null }),
        ],
      },
    });
    expect(kpisOf(r)).toEqual({
      detected: '3',
      locks: '4',
      held: '1 / 2',
      missed25: '1',
      d1: '+0.9%',
      d1Title: '중앙값 · 3건',
    });
  });

  it('탐지 = entries ∪ locks 종목 수 (entries 없는 잠김 종목도 센다)', () => {
    const r = loadedReport({
      day: {
        entries: [entryRow({ isin: A, reached: true })],
        locks: [lockRow({ isin: B, lock_id: 1, upper_px: 1, close_px: 1 })],
      },
    });
    expect(kpisOf(r).detected).toBe('2');
  });

  it('중앙값은 짝수 개면 가운데 둘 평균(pandas median 동형) · 음수는 U+2212', () => {
    const r = loadedReport({
      day,
      prev: {
        date: '20261001',
        locks: [
          lockRow({ isin: A, lock_id: 1, d1_ret: -0.03 }),
          lockRow({ isin: B, lock_id: 1, d1_ret: -0.01 }),
          lockRow({ isin: C, lock_id: 1, d1_ret: -0.02 }),
          lockRow({ isin: C, lock_id: 2, d1_ret: 0.05 }),
        ],
      },
    });
    expect(kpisOf(r).d1).toBe('−1.5%');
    expect(kpisOf(r).d1Title).toBe('중앙값 · 4건');
  });

  it('prev 없음 · d1_ret 전부 null → 「—」 · title 없음', () => {
    expect(kpisOf(loadedReport({ day })).d1).toBe('—');
    expect(kpisOf(loadedReport({ day })).d1Title).toBeNull();
    const r = loadedReport({ day, prev: { date: '20261001', locks: [lockRow({ isin: A, lock_id: 1 })] } });
    expect(kpisOf(r).d1).toBe('—');
  });

  it('탐지 0 → 모든 수 「0」 · 유지 「0 / 0」', () => {
    expect(kpisOf(loadedReport({}))).toEqual({
      detected: '0',
      locks: '0',
      held: '0 / 0',
      missed25: '0',
      d1: '—',
      d1Title: null,
    });
  });

  it('reached null 은 거짓으로 센다(t25 있음 ∧ ¬reached)', () => {
    const r = loadedReport({ day: { entries: [entryRow({ isin: A, t25_ms: 1, reached: null })] } });
    expect(kpisOf(r).missed25).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// 결과 태그
// ---------------------------------------------------------------------------

describe('resultTagsOf — UI-SPEC ④-3 · 종가 규칙', () => {
  const lk = (broke: boolean) => lockRow({ isin: A, lock_id: 1, broke });

  it('미도달 → ["미도달"]', () => {
    expect(resultTagsOf({ reached: false, locks: [], closePx: null, upperPx: null })).toEqual(['미도달']);
  });
  it('도달 · 잠김 0 → ["잠김 없음"]', () => {
    expect(resultTagsOf({ reached: true, locks: [], closePx: 1, upperPx: 1 })).toEqual(['잠김 없음']);
  });
  it('잠김 + 종가 == 상한가 + 앞선 깨짐 → ["깨짐", "유지"]', () => {
    expect(resultTagsOf({ reached: true, locks: [lk(true), lk(false)], closePx: 100, upperPx: 100 })).toEqual([
      '깨짐',
      '유지',
    ]);
  });
  it('잠김 + 종가 == 상한가 + 깨짐 없음 → ["유지"]', () => {
    expect(resultTagsOf({ reached: true, locks: [lk(false)], closePx: 100, upperPx: 100 })).toEqual(['유지']);
  });
  it('종가 ≠ 상한가 · 종가 결측 → ["깨짐"]', () => {
    expect(resultTagsOf({ reached: true, locks: [lk(true)], closePx: 90, upperPx: 100 })).toEqual(['깨짐']);
    expect(resultTagsOf({ reached: true, locks: [lk(false)], closePx: null, upperPx: 100 })).toEqual(['깨짐']);
  });
});

// ---------------------------------------------------------------------------
// 행 순서 · 메타
// ---------------------------------------------------------------------------

describe('stocksOf · dayRowsOf — gh-trade _stocks 순서 · 행 메타', () => {
  const day = {
    entries: [
      // 미도달 — 맨 뒤
      entryRow({ isin: 'KR0000000001', name: '미도달주', reached: false, t25_ms: 1 }),
      // 도달 · 첫 상한 09:20
      entryRow({
        isin: 'KR0000000002',
        name: '늦은도달',
        short_code: '000002',
        reached: true,
        first_upper_ms: kstMs(D, '09:20:00'),
      }),
      // 도달 · 첫 상한 없음 → 첫 잠김 09:08:31
      entryRow({
        isin: 'KR0000000003',
        name: '잠김기준',
        short_code: '000003',
        reached: true,
        entry_buy_member1: '00050',
        entry_buy_member2: '00002',
        entry_buy_member3: '00001',
        upper_px: 5000,
        close_px: 5000,
      }),
      // 도달 · 첫 상한·잠김 모두 없음 → 도달 그룹 맨 뒤
      entryRow({ isin: 'KR0000000004', name: null, short_code: null, reached: true }),
    ],
    locks: [
      lockRow({ isin: 'KR0000000003', lock_id: 2, start_ms: kstMs(D, '10:00:00'), broke: false }),
      lockRow({ isin: 'KR0000000003', lock_id: 1, start_ms: kstMs(D, '09:08:31'), broke: true }),
      // entries 없는 옛 잠김 행 — reached 참 · 이름은 lock 에서
      lockRow({
        isin: 'KR0000000005',
        lock_id: 1,
        name: '잠김만',
        short_code: '000005',
        start_ms: kstMs(D, '09:01:00'),
        upper_px: 3000,
        close_px: 2900,
        broke: true,
      }),
    ],
    summaries: [summaryRow({ isin: 'KR0000000003', q_max_krw: 6_270_000_000, sell_share_60s: 0.04 })],
  };

  it('순서 = 도달 먼저 → 첫 상한(없으면 첫 잠김 시작) → 시각 없음 → isin · 미도달 맨 뒤', () => {
    const order = stocksOf(loadedReport({ day }).day).map((s) => s.isin);
    expect(order).toEqual(['KR0000000005', 'KR0000000003', 'KR0000000002', 'KR0000000004', 'KR0000000001']);
  });

  it('잠김은 lock_id 순 · entries 없는 종목은 lock 첫 행으로 채운다', () => {
    const stocks = stocksOf(loadedReport({ day }).day);
    const s3 = stocks.find((s) => s.isin === 'KR0000000003')!;
    expect(s3.locks.map((l) => l.lock_id)).toEqual([1, 2]);
    const s5 = stocks.find((s) => s.isin === 'KR0000000005')!;
    expect(s5).toMatchObject({ reached: true, name: '잠김만', shortCode: '000005', upperPx: 3000, closePx: 2900 });
  });

  it('메타 — 첫 잠김 · 잠김 수 · 최대 잔량 · +60초 매도 · 창구(상위 2) · 결과', () => {
    const rows = dayRowsOf(loadedReport({ day }));
    const r3 = rows.find((r) => r.isin === 'KR0000000003')!;
    expect(r3).toMatchObject({
      label: '잠김기준',
      code: '000003',
      firstLock: '09:08:31',
      lockCount: '2',
      maxQ: '62.7억',
      sell60: '4%',
      members: '키움증권 · 신한증권',
      tags: ['깨짐', '유지'],
    });
    expect(r3.summary).not.toBeNull();
  });

  it('값 없는 칸 = 「—」 · 이름 null 은 코드 → isin 으로 강등', () => {
    const rows = dayRowsOf(loadedReport({ day }));
    const r4 = rows.find((r) => r.isin === 'KR0000000004')!;
    expect(r4).toMatchObject({
      label: 'KR0000000004',
      code: null,
      firstLock: '—',
      lockCount: '0',
      maxQ: '—',
      sell60: '—',
      members: '—',
      tags: ['잠김 없음'],
      summary: null,
    });
    expect(rows.find((r) => r.isin === 'KR0000000001')!.tags).toEqual(['미도달']);
    expect(rows.find((r) => r.isin === 'KR0000000005')!.tags).toEqual(['깨짐']);
  });

  it('+60초 매도는 정수 % (0.5 는 위로) · 최대 잔량 0 → 「0」', () => {
    const rows = dayRowsOf(
      loadedReport({
        day: {
          entries: [entryRow({ isin: A, reached: true })],
          summaries: [summaryRow({ isin: A, q_max_krw: 0, sell_share_60s: 0.125 })],
        },
      }),
    );
    expect(rows[0]).toMatchObject({ sell60: '13%', maxQ: '0' });
  });
});

// ---------------------------------------------------------------------------
// 날짜
// ---------------------------------------------------------------------------

describe('dateNavOf — 적재 날짜 목록(내림차순) 이동', () => {
  const dates = ['20261002', '20261001', '20260930'];
  it('가운데 → 양쪽', () => {
    expect(dateNavOf(dates, '20261001')).toEqual({ prev: '20260930', next: '20261002' });
  });
  it('최신 → next null · 가장 오래된 → prev null · null = 최신', () => {
    expect(dateNavOf(dates, '20261002')).toEqual({ prev: '20261001', next: null });
    expect(dateNavOf(dates, '20260930')).toEqual({ prev: null, next: '20261001' });
    expect(dateNavOf(dates, null)).toEqual({ prev: '20261001', next: null });
  });
  it('빈 목록 → 둘 다 null', () => {
    expect(dateNavOf([], '20261002')).toEqual({ prev: null, next: null });
    expect(dateNavOf([], null)).toEqual({ prev: null, next: null });
  });
  it('목록에 없는 날(적재 안 됨) → 앞뒤 적재 날짜', () => {
    expect(dateNavOf(dates, '20261003')).toEqual({ prev: '20261002', next: null });
    expect(dateNavOf(['20261002', '20260930'], '20261001')).toEqual({ prev: '20260930', next: '20261002' });
  });
});

describe('parseYmdParam · fmtYmdLabel · kstClock', () => {
  it('parseYmdParam — 실재하는 YYYYMMDD 만', () => {
    expect(parseYmdParam('20261002')).toBe('20261002');
    for (const bad of ['2026-10-02', '20261340', '20260230', '2026100', '', 'abcdefgh', null, undefined]) {
      expect(parseYmdParam(bad)).toBeNull();
    }
  });
  it('fmtYmdLabel — 「MM/DD (요일)」 KST 실제 요일', () => {
    expect(fmtYmdLabel('20261002')).toBe('10/02 (금)');
    expect(fmtYmdLabel('20261005')).toBe('10/05 (월)');
  });
  it('kstClock — epoch ms → KST HH:MM:SS', () => {
    expect(kstClock(kstMs(D, '09:08:31'))).toBe('09:08:31');
    expect(kstClock(kstMs(D, '15:30:00') + 999)).toBe('15:30:00');
  });
});

// ---------------------------------------------------------------------------
// 스파크
// ---------------------------------------------------------------------------

describe('sparkPathOf · sparkYMaxOf', () => {
  it('2340점 — x = 09:00 기준 coarse 인덱스 · y = 100 − q/yMax×100', () => {
    const q = Array.from({ length: 2340 }, (_, i) => (i === 0 ? 0 : 1_000_000_000));
    const d = sparkPathOf(summaryRow({ isin: A, q_krw: q }), 2_000_000_000);
    expect(d.startsWith('M0 100L1 50')).toBe(true);
    expect(d.endsWith('L2339 50')).toBe(true);
    expect((d.match(/M/g) ?? []).length).toBe(1);
  });

  it('null 은 선을 끊고 다음 점에서 M', () => {
    const d = sparkPathOf(summaryRow({ isin: A, q_krw: [0, 0, null, null, 2_000_000_000, 0] }), 2_000_000_000);
    expect(d).toBe('M0 100L1 100M4 0L5 100');
  });

  it('sec0 가 09:00 보다 늦으면 x 를 민다 · 빈 배열 = 빈 경로', () => {
    expect(sparkPathOf(summaryRow({ isin: A, sec0: 32420, q_krw: [0, 0] }), 1)).toBe('M2 100L3 100');
    expect(sparkPathOf(summaryRow({ isin: A, q_krw: [] }), 1)).toBe('');
  });

  it('yMax = max(행 최대, 20억)', () => {
    expect(sparkYMaxOf(summaryRow({ isin: A, q_krw: [1, 2], q_max_krw: 500_000_000 }))).toBe(2_000_000_000);
    expect(sparkYMaxOf(summaryRow({ isin: A, q_krw: [3_500_000_000, null], q_max_krw: null }))).toBe(3_500_000_000);
    expect(sparkYMaxOf(summaryRow({ isin: A, q_krw: [1], q_max_krw: 4_000_000_000 }))).toBe(4_000_000_000);
  });
});

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

describe('limitup-api', () => {
  it('fetchLimitupReport() → /api/limitup/report · (d) → ?d=', async () => {
    await fetchLimitupReport();
    expect(authFetchMock.mock.calls[0]![0]).toBe('/api/limitup/report');
    await fetchLimitupReport('20261002');
    expect(authFetchMock.mock.calls[1]![0]).toBe('/api/limitup/report?d=20261002');
  });
  it('fetchLimitupGridUrls(d) → /api/limitup/grid-urls?d=', async () => {
    await fetchLimitupGridUrls('20261002');
    expect(authFetchMock.mock.calls[0]![0]).toBe('/api/limitup/grid-urls?d=20261002');
  });
});
