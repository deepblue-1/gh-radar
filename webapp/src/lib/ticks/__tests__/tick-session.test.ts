import { describe, it, expect } from 'vitest';

import { DENSITY_BUCKETS, TAG_CODE, fmtTickTime } from '@gh-radar/shared';

import { TICK_FIXTURE_A3, TICK_FIXTURE_DATE, TICK_FIXTURE_ISIN, TICK_FIXTURE_RECORDS, tickGridBytes } from '@/test-fixtures/tick-grid';

import { buildTickSession } from '../tick-session';

/**
 * Phase 37 Plan 10 Task 1 — buildTickSession(컷 13시 KRX 픽스처 · 해제 바이트) — 표 길이 · 순열 · 역순열 · 마지막 B6 · 밀도 144.
 */

describe('buildTickSession — 컷 13시 KRX', () => {
  const buf = tickGridBytes();
  const t0 = performance.now();
  const s = buildTickSession(buf, { date: TICK_FIXTURE_DATE, ex: 'KRX', isin: TICK_FIXTURE_ISIN });
  const ms = performance.now() - t0;

  it('레코드 · A3 수 · 키', () => {
    // 측정값(SUMMARY) — jsdom 안 1회 · JIT 예열 포함
    console.info(`[tick-session] 해제 ${buf.length}B · 세션 생성 ${ms.toFixed(1)}ms`);
    expect(s.key).toBe(`${TICK_FIXTURE_DATE}|KRX|${TICK_FIXTURE_ISIN}`);
    expect(s.index.n).toBe(TICK_FIXTURE_RECORDS);
    expect(s.a3.n).toBe(TICK_FIXTURE_A3);
    expect(s.index.label).toBe('krx');
  });

  it('순열 · 역순열 길이와 왕복', () => {
    const n = s.index.n;
    for (const a of [s.recvOrder, s.exOrder, s.recvPos, s.exPos, s.lastB6, s.lastB9, s.a3Of]) expect(a.length).toBe(n);
    for (let p = 0; p < n; p += 97) {
      expect(s.recvPos[s.recvOrder[p]!]).toBe(p);
      expect(s.exPos[s.exOrder[p]!]).toBe(p);
    }
  });

  it('a3Of — A3 rec 만 열 색인', () => {
    let k = 0;
    for (let r = 0; r < s.index.n; r++) {
      if (s.a3Of[r]! >= 0) {
        expect(s.index.tag[r]).toBe(TAG_CODE.A3);
        expect(s.a3.rec[s.a3Of[r]!]).toBe(r);
        k += 1;
      }
    }
    expect(k).toBe(TICK_FIXTURE_A3);
  });

  it('마지막 B6 — 거래소순 자리마다 B6 rec(첫 B6 이후 -1 없음)', () => {
    const firstB6 = s.exOrder.findIndex((r) => s.index.tag[r] === TAG_CODE.B6);
    expect(firstB6).toBeGreaterThanOrEqual(0);
    for (let p = firstB6; p < s.index.n; p += 101) {
      const b = s.lastB6[p]!;
      expect(b).toBeGreaterThanOrEqual(0);
      expect(s.index.tag[b]).toBe(TAG_CODE.B6);
    }
  });

  it('밀도 144칸 · 13시 칸(60..71)만 값 · 08:00 시작', () => {
    expect(s.density.length).toBe(DENSITY_BUCKETS);
    let inside = 0;
    for (let k = 0; k < DENSITY_BUCKETS; k++) {
      if (k >= 60 && k < 72) inside += s.density[k]!;
      else expect(s.density[k]).toBe(0);
    }
    expect(inside).toBeGreaterThan(0);
    expect(fmtTickTime(s.dayStartNs)).toBe('08:00:00.000');
    expect(Array.isArray(s.vi)).toBe(true);
  });
});
