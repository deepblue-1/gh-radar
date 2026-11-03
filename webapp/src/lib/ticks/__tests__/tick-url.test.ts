import { describe, it, expect } from 'vitest';

import { defaultTickDateOf, nodataReasonOf, parseTickUrl, tickUrlOf } from '../tick-url';

/**
 * Phase 37 Plan 08 — 틱 뷰어 URL 계약(D-18) · 기본 날짜(D-15) · 「자료 없음」 사유(D-16).
 * 시각은 모두 KST 로 적고 `+09:00` 으로 만든다.
 */

const kst = (iso: string) => new Date(`${iso}+09:00`);
const sp = (q: string) => new URLSearchParams(q);

describe('parseTickUrl', () => {
  it('정상 값을 그대로 읽는다', () => {
    expect(parseTickUrl(sp('isin=KR7101360006&d=20261016&ex=NXT&t=09:07:50.300'))).toEqual({
      isin: 'KR7101360006',
      d: '20261016',
      ex: 'NXT',
      t: '09:07:50.300',
      k: null,
    });
  });

  it('빈 쿼리 = 기본값(ex KRX)', () => {
    expect(parseTickUrl(sp(''))).toEqual({ isin: null, d: null, ex: 'KRX', t: null, k: null });
  });

  it('잘못된 값은 버린다', () => {
    expect(parseTickUrl(sp('isin=kr7101360006&d=20261332&ex=nxt&t=9:07:50'))).toEqual({
      isin: null,
      d: null,
      ex: 'KRX',
      t: null,
      k: null,
    });
    expect(parseTickUrl(sp('isin=KR710136000&d=2026101&t=25:00:00')).isin).toBeNull();
    expect(parseTickUrl(sp('d=20260229')).d).toBeNull(); // 2026 은 윤년이 아니다
    expect(parseTickUrl(sp('t=09:61:00')).t).toBeNull();
    expect(parseTickUrl(sp('t=09:07:50')).t).toBe('09:07:50');
  });
});

describe('tickUrlOf', () => {
  it('순서 isin · d · ex · t · 빈 값과 KRX 는 뺀다', () => {
    expect(tickUrlOf({ isin: 'KR7101360006', d: '20261016', ex: 'NXT', t: '09:00:00.000' })).toBe(
      '/analytics/ticks?isin=KR7101360006&d=20261016&ex=NXT&t=09%3A00%3A00.000',
    );
    expect(tickUrlOf({ isin: null, d: '20261016', ex: 'KRX', t: null })).toBe('/analytics/ticks?d=20261016');
    expect(tickUrlOf({})).toBe('/analytics/ticks');
  });

  it('왕복 — 직렬화한 URL 을 다시 읽으면 같다', () => {
    const s = { isin: 'KR7101360006', d: '20261016', ex: 'NXT' as const, t: '13:00:41.090', k: null };
    const q = tickUrlOf(s).split('?')[1]!;
    expect(parseTickUrl(sp(q))).toEqual(s);
    const k = { isin: 'KR7005930003', d: '20261030', ex: 'KRX' as const, t: null, k: null };
    expect(parseTickUrl(sp(tickUrlOf(k).split('?')[1]!))).toEqual(k);
    const burst = { isin: 'KR7101360006', d: '20261016', ex: 'KRX' as const, t: '13:05:07.123', k: 3 };
    expect(tickUrlOf(burst)).toBe('/analytics/ticks?isin=KR7101360006&d=20261016&t=13%3A05%3A07.123&k=3');
    expect(parseTickUrl(sp(tickUrlOf(burst).split('?')[1]!))).toEqual(burst);
  });

  it('k(WR-65 — 같은 ms 안 순번) — 0 · 없음은 뺀다 · t 없으면 쓰지도 읽지도 않는다 · 잘못된 값은 버린다', () => {
    expect(tickUrlOf({ isin: 'KR7101360006', t: '13:05:07.123', k: 0 })).toBe(
      '/analytics/ticks?isin=KR7101360006&t=13%3A05%3A07.123',
    );
    expect(tickUrlOf({ isin: 'KR7101360006', t: null, k: 2 })).toBe('/analytics/ticks?isin=KR7101360006');
    expect(parseTickUrl(sp('k=2')).k).toBeNull();
    for (const bad of ['0', '-1', '1.5', 'x', '01', '1234567']) {
      expect(parseTickUrl(sp(`t=13:05:07.123&k=${bad}`)).k).toBeNull();
    }
  });
});

describe('defaultTickDateOf (D-15)', () => {
  it('평일 08:00 · 19:59 = today', () => {
    expect(defaultTickDateOf(kst('2026-11-02T08:00:00'))).toEqual({ mode: 'today', today: '20261102' });
    expect(defaultTickDateOf(kst('2026-11-02T19:59:59')).mode).toBe('today');
  });

  it('평일 07:59 · 20:00 = latest', () => {
    expect(defaultTickDateOf(kst('2026-11-02T07:59:59')).mode).toBe('latest');
    expect(defaultTickDateOf(kst('2026-11-02T20:00:00'))).toEqual({ mode: 'latest', today: '20261102' });
  });

  it('토요일 · KRX 휴장일 = latest', () => {
    expect(defaultTickDateOf(kst('2026-10-31T10:00:00')).mode).toBe('latest'); // 토
    expect(defaultTickDateOf(kst('2026-12-25T10:00:00')).mode).toBe('latest'); // 성탄절(금)
  });

  it('UTC 자정 근처도 KST 날짜로 판정한다', () => {
    // UTC 2026-11-01 23:30 = KST 11-02(월) 08:30
    expect(defaultTickDateOf(new Date('2026-11-01T23:30:00Z'))).toEqual({ mode: 'today', today: '20261102' });
  });
});

describe('nodataReasonOf (D-16)', () => {
  const now = kst('2026-11-02T21:00:00'); // 월요일 21:00

  it('주말 · 휴장일 = holiday', () => {
    expect(nodataReasonOf('20261031', now)).toBe('holiday');
    expect(nodataReasonOf('20261009', now)).toBe('holiday'); // 한글날(금)
  });

  it('오늘 뒤 · 오늘 08:00 전 = future', () => {
    expect(nodataReasonOf('20261103', now)).toBe('future');
    expect(nodataReasonOf('20261102', kst('2026-11-02T07:00:00'))).toBe('future');
  });

  it('오늘 20:00 뒤 = not-uploaded · 장중 = null', () => {
    expect(nodataReasonOf('20261102', now)).toBe('not-uploaded');
    expect(nodataReasonOf('20261102', kst('2026-11-02T10:00:00'))).toBeNull();
  });

  it('오늘 − 90일보다 이전 = retention · 경계 안쪽 = null', () => {
    expect(nodataReasonOf('20260803', now)).toBe('retention'); // 91일 전(월)
    expect(nodataReasonOf('20260804', now)).toBeNull(); // 90일 전(화)
    expect(nodataReasonOf('20261030', now)).toBeNull();
  });
});
