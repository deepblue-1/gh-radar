import { describe, it, expect } from 'vitest';

/**
 * Phase 34 Plan 04 — 매집감지 목록 표시 변환 골든 (UI-SPEC A2 · A3 · 「표시 변환 규칙 (A11)」 · D-08 ~ D-13).
 *
 * 잠그는 것: KPI 4칸 집계(합성 7행 · 빈 배열 · 실측 6행) · 사유 라벨/줄 · 흐림 · 결과 태그(+고가) · 이월/오늘 등록 판정 ·
 * 등록·종료 칸 · 폰 메타 줄 · 행 sr 설명. null · NaN · 결측(since_date "" · "None")에 throw 없음.
 * 픽스처 = 10/14 실측 6행(워커 gz 원문) + 합성 7행(`accumSyntheticListRows` — 목업 A 의 상태 조합 · KR79 합성 대역).
 *
 * quick-261026-01h 당일 축 — todayNetOf · prevDayOf · dayAxisOf · sortAccumRows({ dayAxis }) · daySum · metaLineOf/
 * accumRowDescriptionOf/detailKpisOf(row, true) · 새 임계 문구(th_recent_pieces > 0) · ACCUM_RULE_LINES_DAY · 원 문턱 500만원.
 * 옵션 없는 호출은 지금 결과와 같다(당일 축 아닌 날짜는 글자 하나 다르지 않다).
 */

import type { AccumDetailRow, AccumReportCycle, AccumReportRow } from '@gh-radar/shared';

import {
  ACCUM_DROP_TITLE,
  ACCUM_RULE_LINES,
  ACCUM_RULE_LINES_DAY,
  ACCUM_RULE_SOURCE,
  accumKpisOf,
  accumRowDescriptionOf,
  accumTagOf,
  cycleRowsOf,
  dayAxisOf,
  detailKpisOf,
  endReasonLabelOf,
  hasDayAvgOf,
  isCarry,
  isDimRow,
  isTodayReg,
  metaLineOf,
  payloadOf,
  reasonLineOf,
  prevDayOf,
  regCellOf,
  sortAccumRows,
  thresholdPartsOf,
  todayNetOf,
} from '../accum-report';
import {
  AC_CARRY,
  AC_DROP,
  AC_EXPIRE,
  AC_LIQ,
  AC_LIVE,
  AC_PARTIAL,
  AC_SELL,
  CHEONIL,
  DONGYANG,
  accumDayAvgListRows,
  accumDayAxisListRows,
  accumDetailRows,
  accumKstMs,
  accumListRows,
  accumSyntheticDetail,
  accumSyntheticListRows,
} from '@/test-fixtures/accum-export';

const syn = (isin: string): AccumReportRow => accumSyntheticListRows().find((r) => r.isin === isin)!;
const real = (isin: string): AccumReportRow => accumListRows().find((r) => r.isin === isin)!;

describe('accumKpisOf — KPI 4칸 (D-09 · A2)', () => {
  it('합성 7행 → 등록 7 · 이월 3 · 보유 4(매집중 3 · 매도중 1) · 종료 3(청산 1 · 탈락 1 · 만료 1) · 합 = null 제외', () => {
    expect(accumKpisOf(accumSyntheticListRows())).toEqual({
      total: 7,
      carry: 3,
      held: 4,
      accumulating: 3,
      selling: 1,
      ended: 3,
      liquidated: 1,
      terminated: 0,
      dropped: 1,
      expired: 1,
      // 9.3 − 2.4 + 3.6 − 6.9 + 0.4 + 0.2 = +4.2억(⑦ null 제외 · 종료 행 포함)
      posSum: 420_000_000,
      // pos_day 키 없음(당일 축 아닌 날짜) — quick-261026-01h
      daySum: null,
    });
  });

  it('빈 배열 → 전부 0 · posSum null · throw 없음', () => {
    expect(accumKpisOf([])).toEqual({
      total: 0,
      carry: 0,
      held: 0,
      accumulating: 0,
      selling: 0,
      ended: 0,
      liquidated: 0,
      terminated: 0,
      dropped: 0,
      expired: 0,
      posSum: null,
      daySum: null,
    });
  });

  it('실측 6행(모의 줄 — 전부 state 1 · carry 0) → 등록 6 · 이월 0 · 보유 6 · 매집중 6 · 매도중 0 · 종료 0', () => {
    const k = accumKpisOf(accumListRows());
    expect(k).toMatchObject({ total: 6, carry: 0, held: 6, accumulating: 6, selling: 0, ended: 0 });
    expect(k).toMatchObject({ liquidated: 0, dropped: 0, expired: 0 });
    expect(k.posSum).toBe(162_312_900 * 6);
  });

  it('pos_net_krw 가 전부 null 이면 posSum null', () => {
    const rows = accumListRows().map((r) => ({ ...r, pos_net_krw: null }));
    expect(accumKpisOf(rows).posSum).toBeNull();
  });
});

describe('종료 사유 · 흐림 (D-11)', () => {
  it('endReasonLabelOf 1/2/3/4/0 = 청산 / 이월 탈락(복원 안 됨) / 이월 만료 / 매집 종료 / null', () => {
    expect(endReasonLabelOf(1)).toBe('청산');
    expect(endReasonLabelOf(2)).toBe('이월 탈락(복원 안 됨)');
    expect(endReasonLabelOf(3)).toBe('이월 만료');
    expect(endReasonLabelOf(4)).toBe('매집 종료');
    expect(endReasonLabelOf(0)).toBeNull();
    expect(endReasonLabelOf(null)).toBeNull();
  });

  it('reasonLineOf — 종료 행만 「{사유} · HH:MM」 · end_time null 이면 시각 생략 · 살아 있는 행 null', () => {
    expect(reasonLineOf(syn(AC_LIQ))).toBe('청산 · 11:32');
    expect(reasonLineOf(syn(AC_DROP))).toBe('이월 탈락(복원 안 됨) · 06:00');
    expect(reasonLineOf(syn(AC_EXPIRE))).toBe('이월 만료 · 06:00');
    expect(reasonLineOf({ ...syn(AC_LIQ), end_time_ms: null })).toBe('청산');
    expect(reasonLineOf(syn(AC_LIVE))).toBeNull();
    // end_reason 4 매집 종료(장중 · 정상 농도 · 2줄 「HH:MM 종료」 · KPI terminated)
    const term = { ...syn(AC_LIQ), end_reason: 4 };
    expect(reasonLineOf(term)).toBe('매집 종료 · 11:32');
    expect(isDimRow(term)).toBe(false);
    expect(regCellOf(term)[1]).toBe('11:32 종료');
    expect(accumKpisOf([term])).toMatchObject({ ended: 1, terminated: 1, liquidated: 0 });
    expect(reasonLineOf(syn(AC_SELL))).toBeNull();
  });

  it('사유 2 title 상수', () => {
    expect(ACCUM_DROP_TITLE).toBe('서버 재기동 때 이월 파일에 없어 복원되지 않은 종목이에요');
  });

  it('isDimRow — state 3 & end_reason 2 · 3 만 true(장중 청산 · 살아 있는 행 false)', () => {
    expect(isDimRow(syn(AC_DROP))).toBe(true);
    expect(isDimRow(syn(AC_EXPIRE))).toBe(true);
    expect(isDimRow(syn(AC_LIQ))).toBe(false);
    expect(isDimRow(syn(AC_LIVE))).toBe(false);
    expect(isDimRow({ ...syn(AC_LIVE), end_reason: 2 })).toBe(false);
  });
});

describe('accumTagOf — 결과 태그 (D-12)', () => {
  it('last_px >= upper → limit 「상한가 +29.8%」 · 보조줄 없음', () => {
    expect(accumTagOf(real(CHEONIL))).toEqual({ kind: 'limit', text: '상한가 +29.8%', sub: null });
  });

  it('미도달 → rate 「+22.1%」 + 보조 「고가 +29.3%」', () => {
    expect(accumTagOf(real(DONGYANG))).toEqual({ kind: 'rate', text: '+22.1%', sub: '고가 +29.3%' });
  });

  it('음수 = U+2212 「−3.1%」', () => {
    expect(accumTagOf(syn(AC_EXPIRE))).toEqual({ kind: 'rate', text: '−3.1%', sub: '고가 +28.1%' });
  });

  it('last_rate null(상한가 아님) → none 「—」 · high_rate null 이면 보조 없음', () => {
    expect(accumTagOf(syn(AC_PARTIAL))).toEqual({ kind: 'none', text: '—', sub: null });
  });

  it('upper · last_px 중 하나라도 null 이면 상한가 판정 안 함 · 상한가인데 last_rate null 이면 「상한가」', () => {
    expect(accumTagOf({ ...real(CHEONIL), upper: null }).kind).toBe('rate');
    expect(accumTagOf({ ...real(CHEONIL), last_rate: null })).toEqual({ kind: 'limit', text: '상한가', sub: null });
    expect(accumTagOf({ ...real(CHEONIL), last_px: Number.NaN }).kind).toBe('rate');
  });
});

describe('이월 · 오늘 등록 · 등록·종료 칸 (D-08 · D-13)', () => {
  it('isCarry — since 20261010 · date 20261014 = true · since == date = false · "" · "None" · null = false', () => {
    expect(isCarry(syn(AC_CARRY))).toBe(true);
    expect(isCarry(syn(AC_LIVE))).toBe(false);
    expect(isCarry({ ...syn(AC_CARRY), since_date: '' })).toBe(false);
    expect(isCarry({ ...syn(AC_CARRY), since_date: 'None' })).toBe(false);
    expect(isCarry({ ...syn(AC_CARRY), since_date: null })).toBe(false);
  });

  it('isTodayReg — since == date 만 true', () => {
    expect(isTodayReg(syn(AC_LIVE))).toBe(true);
    expect(isTodayReg(syn(AC_CARRY))).toBe(false);
    expect(isTodayReg(syn(AC_PARTIAL))).toBe(false);
  });

  it('regCellOf — 오늘 등록 · 이월 · 청산 · 탈락 · 만료 · 결측', () => {
    expect(regCellOf(syn(AC_LIVE))).toEqual(['09:12', '장 마감까지']);
    expect(regCellOf(syn(AC_CARRY))).toEqual(['10/10 등록', '오늘 이월']);
    expect(regCellOf(syn(AC_LIQ))).toEqual(['09:05', '11:32 청산']);
    expect(regCellOf(syn(AC_DROP))).toEqual(['10/13 등록', '06:00 탈락']);
    expect(regCellOf(syn(AC_EXPIRE))).toEqual(['10/06 등록', '06:00 만료']);
    expect(regCellOf(syn(AC_PARTIAL))).toEqual(['—', '장 마감까지']);
    expect(regCellOf({ ...syn(AC_LIVE), reg_time_ms: null })[0]).toBe('—');
    expect(regCellOf({ ...syn(AC_LIQ), end_time_ms: null })[1]).toBe('청산');
  });

  it('metaLineOf — 폰 3줄 「팀 순매수」 · 「하루」 · 「등록 HH:MM」 / 「MM/DD 등록」 + 종료 「 → HH:MM」', () => {
    expect(metaLineOf(syn(AC_LIVE))).toEqual([
      { label: '팀 순매수', value: '+9.3억', tone: 'up' },
      { label: '하루', value: '+3.1억', tone: 'up' },
      { label: '등록', value: '09:12' },
    ]);
    expect(metaLineOf(syn(AC_LIQ))[2]).toEqual({ label: '등록', value: '09:05 → 11:32' });
    expect(metaLineOf(syn(AC_DROP))[2]).toEqual({ label: null, value: '10/13 등록 → 06:00' });
    expect(metaLineOf(syn(AC_DROP))[1]).toEqual({ label: '하루', value: '0.0억', tone: 'flat' });
    expect(metaLineOf(syn(AC_PARTIAL))).toEqual([
      { label: '팀 순매수', value: '—', tone: 'none' },
      { label: '하루', value: '—', tone: 'none' },
      { label: '등록', value: '—' },
    ]);
  });
});

describe('accumRowDescriptionOf — 행 sr 설명 (A3)', () => {
  it('이월 사이클 2 행', () => {
    expect(accumRowDescriptionOf(syn(AC_CARRY))).toBe(
      '매집중, 이월 D+2, 사이클 2, 결과 +13.8%, 고가 +29.8%, 팀 순매수 등록 후 +3.6억, 하루 순매수 +0.4억, 등록 10/10',
    );
  });

  it('종료 청산 행 — 사유 절에 종료 시각 · 끝 「종료 HH:MM」 은 생략(같은 시각 두 번 금지 · IN-02)', () => {
    expect(accumRowDescriptionOf(syn(AC_LIQ))).toBe(
      '종료, 청산 11:32, 결과 +18.1%, 고가 +30.0%, 팀 순매수 등록 후 −6.9억, 하루 순매수 −33.4억, 등록 09:05',
    );
    // 사유를 모르는 종료 행(end_reason 0)은 사유 절이 없으니 끝 「종료 HH:MM」 이 시각을 말한다
    expect(accumRowDescriptionOf({ ...syn(AC_LIQ), end_reason: 0 })).toBe(
      '종료, 결과 +18.1%, 고가 +30.0%, 팀 순매수 등록 후 −6.9억, 하루 순매수 −33.4억, 등록 09:05, 종료 11:32',
    );
  });

  it('상한가 행 — 고가 생략', () => {
    expect(accumRowDescriptionOf(real(CHEONIL))).toBe(
      '매집중, 결과 상한가 +29.8%, 팀 순매수 등록 후 +1.6억, 하루 순매수 −1.0억, 등록 09:57',
    );
  });

  it('결측 행 — throw 없음 · 「—」', () => {
    expect(accumRowDescriptionOf(syn(AC_PARTIAL))).toBe('매집중, 결과 —, 팀 순매수 등록 후 —, 하루 순매수 —, 등록 —');
    const broken = { ...syn(AC_PARTIAL), state: null, cycle: Number.NaN, carry_days: null, since_date: 'None' };
    expect(() => accumRowDescriptionOf(broken)).not.toThrow();
    expect(accumRowDescriptionOf(broken).startsWith('—, 결과 —')).toBe(true);
  });
});

describe('cycleRowsOf — 사이클 표 칸 (D-20 · A7 · CR-01)', () => {
  /** multiCycle 바탕에 사이클만 갈아 끼운 상세 행. */
  const withCycles = (cycles: Partial<AccumReportCycle>[]): AccumDetailRow => {
    const base = accumSyntheticDetail('multiCycle');
    const tpl = base.payload!.cycles[1]!;
    return { ...base, payload: { ...base.payload!, cycles: cycles.map((c) => ({ ...tpl, ...c })) } };
  };

  it('multiCycle → 2행 · # 1, 2(cycle 값 중복 — 둘 다 1이어도 나온 순서) · 1행 청산 · 2행 장 마감까지 · 매집중', () => {
    const row = accumSyntheticDetail('multiCycle');
    expect(row.payload!.cycles.map((c) => c.cycle)).toEqual([1, 1]);
    const rows = cycleRowsOf(row);
    expect(rows.map((r) => r.k)).toEqual([1, 2]);
    expect(rows[0]).toMatchObject({ reg: '09:12:40', end: '11:32:04', endIsOpen: false, status: '청산' });
    expect(rows[1]).toMatchObject({ reg: '13:05:20', end: '장 마감까지', endIsOpen: true, status: '매집중' });
    // 합성 사이클은 pos_* 가 null — 값 칸 전부 「—」
    expect(rows[1]).toMatchObject({ regPx: '—', avgPx: '—', net: '—', netTone: 'flat', peak: '—', qty: '—' });
  });

  it('이월 사이클(since 20261010 · date 20261014) 등록 칸 「10/10 09:20:00」 · reg null → 「—」 · since 결측은 날짜 없이', () => {
    const carry = cycleRowsOf(accumSyntheticDetail('carry'));
    expect(carry).toHaveLength(1);
    expect(carry[0]).toMatchObject({ k: 1, reg: '10/10 09:20:00', end: '14:56:30', status: '청산' });
    const r = cycleRowsOf(
      withCycles([
        { reg_time_ms: null },
        { since_date: null, reg_time_ms: accumKstMs('20261014', '09:20:00') },
      ]),
    );
    expect(r[0]!.reg).toBe('—');
    expect(r[1]!.reg).toBe('09:20:00');
  });

  it('값 칸 — 등록가 · 평단 원 쉼표 · 순매수 ±억 1자리(부호 색) · 최고 순매수 ±억 · 수량 「38,200 / 3,100」 · 한쪽 null 「—」', () => {
    const r = cycleRowsOf(
      withCycles([
        {
          state: 2,
          pos_reg_px: 11_410,
          pos_avg_px: 12_680,
          pos_net_krw: 930_000_000,
          pos_peak_net_krw: 1_020_000_000,
          pos_buy_qty: 38_200,
          pos_sell_qty: 3_100,
        },
        { pos_net_krw: -240_000_000, pos_peak_net_krw: 10_000_000, pos_buy_qty: 977, pos_sell_qty: null },
      ]),
    );
    expect(r[0]).toMatchObject({
      status: '매도중',
      regPx: '11,410',
      avgPx: '12,680',
      net: '+9.3억',
      netTone: 'up',
      peak: '+10.2억',
      qty: '38,200 / 3,100',
    });
    expect(r[1]).toMatchObject({ net: '−2.4억', netTone: 'down', peak: '+0.1억', qty: '977 / —' });
  });

  it('상태 — end_reason > 0 이면 사유(청산 / 이월 탈락(복원 안 됨) / 이월 만료) · 아니면 매집중 / 매도중', () => {
    const end = accumKstMs('20261014', '06:00:00');
    const r = cycleRowsOf(
      withCycles([
        { end_reason: 2, state: 3, end_time_ms: end },
        { end_reason: 3, state: 3, end_time_ms: end },
        { end_reason: 0, state: 1 },
      ]),
    );
    expect(r.map((x) => x.status)).toEqual(['이월 탈락(복원 안 됨)', '이월 만료', '매집중']);
    expect(r[0]!.end).toBe('06:00:00');
  });

  it('실측 행(사이클 1) → 1행 · payload null · cycles 키 결측 → 빈 배열(throw 없음)', () => {
    const real = accumDetailRows().find((r) => r.isin === CHEONIL)!;
    const one = cycleRowsOf(real);
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ k: 1, reg: '09:57:20', end: '장 마감까지', regPx: '205,500', avgPx: '200,407', qty: '977 / 164' });
    expect(cycleRowsOf({ ...real, payload: null })).toEqual([]);
    const noKey: Partial<NonNullable<AccumDetailRow['payload']>> = { ...real.payload! };
    delete noKey.cycles;
    expect(cycleRowsOf({ ...real, payload: noKey as NonNullable<AccumDetailRow['payload']> })).toEqual([]);
    // WR-05 — 배열이 아닌 cycles · 객체 아닌 항목은 throw 없이 버린다
    const bad = (cycles: unknown) => ({ ...real, payload: { ...real.payload!, cycles } as unknown as AccumDetailRow['payload'] });
    expect(cycleRowsOf(bad({ 0: 1 }))).toEqual([]);
    expect(cycleRowsOf(bad([null, real.payload!.cycles[0]]))).toHaveLength(1);
  });
});

describe('payloadOf — 차트가 읽는 payload 모양 확인 (WR-05)', () => {
  const row = () => accumDetailRows().find((r) => r.isin === CHEONIL)!;
  const withPayload = (p: unknown) => ({ payload: p as AccumDetailRow['payload'] });

  it('실측 행 · 합성 행 → payload 그대로(같은 참조) · payload null → null', () => {
    const r = row();
    expect(payloadOf(r)).toBe(r.payload);
    for (const kind of ['multiCycle', 'carry', 'drop0600', 'preOpenReg', 'noTeam', 'noPrice'] as const) {
      const d = accumSyntheticDetail(kind);
      expect(payloadOf(d), kind).toBe(d.payload);
    }
    expect(payloadOf({ payload: null })).toBeNull();
  });

  it('6키 중 하나라도 어긋나면 null — price null · price.px 결측 · t0_ms 문자열 · orders 열 결측 · buckets null 항목 · day_cum_net 결측 · cycles 객체', () => {
    const p = row().payload!;
    const { side: _side, ...ordersNoSide } = p.orders;
    const { px: _px, ...priceNoPx } = p.price;
    const { day_cum_net: _cum, ...noCum } = p;
    const cases: unknown[] = [
      { ...p, price: null },
      { ...p, price: priceNoPx },
      { ...p, price: { ...p.price, t0_ms: '1760400000000' } },
      { ...p, orders: ordersNoSide },
      { ...p, buckets: [null] },
      noCum,
      { ...p, cycles: {} },
      'payload',
      [],
    ];
    for (const c of cases) expect(payloadOf(withPayload(c)), JSON.stringify(c).slice(0, 60)).toBeNull();
  });
});

describe('판정 기준 — thresholdPartsOf · ACCUM_RULE_LINES (D-22 · A9)', () => {
  const TH = { th_net_krw: 1e8, th_same: 30, th_mcap_krw: 5e11, mcap_krw: 3.144e11 };
  /** 본문 1 한 문자열 — 조각을 이은 것(화면은 조각을 그대로 그린다 · IN-03 으로 프로덕션 API 에서 내림). */
  const thresholdLineOf = (row: Parameters<typeof thresholdPartsOf>[0]) =>
    thresholdPartsOf(row)
      .map((p) => p.text)
      .join('');

  it('본문 1 — 「이 종목의 등록 임계 — 순매수 1.0억 이상 · 한 가격 30조각 이상 · 시총 5,000억 이하 (현재 시총 3,144억)」', () => {
    expect(thresholdLineOf(TH)).toBe(
      '이 종목의 등록 임계 — 순매수 1.0억 이상 · 한 가격 30조각 이상 · 시총 5,000억 이하 (현재 시총 3,144억)',
    );
  });

  it('th_mcap_krw 0 → 「시총 상한 없음」 · th_same null → 「한 가격 —」 · mcap_krw null → 「(현재 시총 —)」', () => {
    expect(thresholdLineOf({ ...TH, th_mcap_krw: 0 })).toBe(
      '이 종목의 등록 임계 — 순매수 1.0억 이상 · 한 가격 30조각 이상 · 시총 상한 없음 (현재 시총 3,144억)',
    );
    expect(thresholdLineOf({ ...TH, th_same: null })).toBe(
      '이 종목의 등록 임계 — 순매수 1.0억 이상 · 한 가격 — · 시총 5,000억 이하 (현재 시총 3,144억)',
    );
    expect(thresholdLineOf({ ...TH, mcap_krw: null })).toBe(
      '이 종목의 등록 임계 — 순매수 1.0억 이상 · 한 가격 30조각 이상 · 시총 5,000억 이하 (현재 시총 —)',
    );
    expect(thresholdLineOf({ th_net_krw: null, th_same: Number.NaN, th_mcap_krw: null, mcap_krw: null })).toBe(
      '이 종목의 등록 임계 — 순매수 — · 한 가격 — · 시총 — (현재 시총 —)',
    );
  });

  it('수 조각은 num 표시(mono --fg-2 한 덩어리) — 「1.0억」 · 「30조각」 · 「5,000억」 · 「3,144억」', () => {
    expect(thresholdPartsOf(TH).filter((p) => p.num).map((p) => p.text)).toEqual(['1.0억', '30조각', '5,000억', '3,144억']);
  });

  it('본문 2~5 · 출처 줄 — UI-SPEC A9 문구 글자 그대로', () => {
    expect(ACCUM_RULE_LINES).toEqual([
      '등록 후 순매수(pos)는 KYOBO119 서버 상태기 값이에요 — 등록 이후 누적, 우리 서버 체결 제외, 마지막 사이클 기준. 목록 · KPI · 사이클 표가 이 값이에요.',
      '하루 순매수(day)는 119 pcap 으로 다시 계산한 하루 전체예요 — 등록 전 구간 · 우리 체결 · 상한가 가격 체결 포함(KRX 연속매매 09:00~20:00). 누적 판의 얇은 회색 계단이 이 값이고, 굵은 보라 선은 포지션 순매수(등록 후 · 이월 포함 · 우리 체결 제외 — 목록 · KPI 와 같은 값)예요. 그래서 두 값은 부호까지 다를 수 있고, 팀 매집 보고서의 하루 합계(상한가 가격 제외)와도 달라요.',
      '원은 500만원 이상 팀 주문 + 사이클마다 첫 팀 매수(금액 무관 · 「팀매수 시작」)예요. 누적 계단은 전체 팀 주문이에요.',
      '종료 사유 — 청산(순매수 1억 미만 — 서버는 계속 추적하고 다시 1억 이상이면 같은 사이클로 재등장) / 매집 종료(청산 뒤 순매수가 사이클 최고의 −30% 이하 · 우리 체결 제외 — 다음 등록은 새 사이클) / 이월 탈락(서버 재기동 때 복원 안 됨) / 이월 만료(이월 10일 초과).',
    ]);
    expect(ACCUM_RULE_SOURCE).toBe('규칙 원문: gh-trade 매집감지(accum-signal) · 팀 매집 분석 §13');
  });
});

// ---------------------------------------------------------------------------
// quick-261026-01h — 당일 축(스케치 018 · 인박스 261025-accum-day-axis)
// ---------------------------------------------------------------------------

const dax = (isin: string): AccumReportRow => accumDayAxisListRows().find((r) => r.isin === isin)!;

describe('당일 축 판정 — todayNetOf · prevDayOf · dayAxisOf (quick-261026-01h)', () => {
  it('todayNetOf = pos_day_buy − pos_day_sell · 하나라도 수가 아니면 null', () => {
    expect(todayNetOf(dax(AC_CARRY))).toBe(241_000_000);
    expect(todayNetOf(dax(AC_LIVE))).toBe(-60_000_000);
    expect(todayNetOf(dax(AC_PARTIAL))).toBeNull();
    expect(todayNetOf(syn(AC_LIVE))).toBeNull();
    expect(todayNetOf({ ...dax(AC_LIVE), pos_day_sell_krw: Number.NaN })).toBeNull();
  });

  it('prevDayOf = { buyKrw, sellKrw, netKrw } · prev 2키 둘 다 수일 때만', () => {
    expect(prevDayOf(dax(AC_CARRY))).toEqual({ buyKrw: 984_000_000, sellKrw: 674_000_000, netKrw: 310_000_000 });
    expect(prevDayOf(dax(AC_LIVE))).toBeNull();
    expect(prevDayOf({ ...dax(AC_CARRY), prev_pos_day_sell_krw: undefined })).toBeNull();
    expect(prevDayOf(syn(AC_CARRY))).toBeNull();
  });

  it('dayAxisOf — 한 행이라도 todayNet 수 + th_recent_pieces > 0 → true · 재생성 전(pos_day null) · 옛 export 0 값 · 빈 배열 → false', () => {
    expect(dayAxisOf(accumDayAxisListRows())).toBe(true);
    expect(dayAxisOf(accumSyntheticListRows())).toBe(false);
    expect(dayAxisOf(accumListRows())).toBe(false);
    const oldExport = accumSyntheticListRows().map((r) => ({
      ...r,
      pos_day_buy_krw: 0,
      pos_day_sell_krw: 0,
      th_recent_pieces: 0,
      th_recent_sec: 0,
    }));
    expect(dayAxisOf(oldExport)).toBe(false);
    expect(dayAxisOf([])).toBe(false);
  });
});

describe('당일 축 목록 · KPI · 메타 · 설명 · 상세 KPI (quick-261026-01h)', () => {
  it('sortAccumRows({ dayAxis: true }) — state → 당일 큰 순(null 뒤) → pos 큰 순 → isin · 옵션 없음 = 지금 결과', () => {
    const rows = accumDayAxisListRows();
    expect(sortAccumRows(rows, { dayAxis: true }).map((r) => r.isin)).toEqual([
      AC_CARRY,
      AC_LIVE,
      AC_PARTIAL,
      AC_SELL,
      AC_DROP,
      AC_EXPIRE,
      AC_LIQ,
    ]);
    expect(sortAccumRows(rows).map((r) => r.isin)).toEqual([AC_LIVE, AC_CARRY, AC_PARTIAL, AC_SELL, AC_DROP, AC_EXPIRE, AC_LIQ]);
    expect(sortAccumRows(rows, { dayAxis: false }).map((r) => r.isin)).toEqual(sortAccumRows(rows).map((r) => r.isin));
    // 당일 같으면 pos 큰 순
    const tie = [
      { ...dax(AC_LIVE), pos_day_buy_krw: 1, pos_day_sell_krw: 0, pos_net_krw: 1 },
      { ...dax(AC_CARRY), pos_day_buy_krw: 1, pos_day_sell_krw: 0, pos_net_krw: 5 },
    ];
    expect(sortAccumRows(tie, { dayAxis: true }).map((r) => r.isin)).toEqual([AC_CARRY, AC_LIVE]);
  });

  it('accumKpisOf.daySum — todayNetOf 수의 합 · 하나도 없으면 null · 기존 필드 불변', () => {
    const k = accumKpisOf(accumDayAxisListRows());
    expect(k.daySum).toBe(41_000_000);
    expect(k.posSum).toBe(420_000_000);
    expect(accumKpisOf(accumSyntheticListRows()).daySum).toBeNull();
    expect(accumKpisOf([]).daySum).toBeNull();
  });

  it('metaLineOf(row, true) — 당일 · 누적 · 하루 · 등록 · 인자 없음은 3항목 그대로', () => {
    expect(metaLineOf(dax(AC_CARRY), true)).toEqual([
      { label: '당일', value: '+2.4억', tone: 'up' },
      { label: '누적', value: '+3.6억', tone: 'up' },
      { label: '하루', value: '+0.4억', tone: 'up' },
      { label: null, value: '10/10 등록' },
    ]);
    expect(metaLineOf(dax(AC_PARTIAL), true)[0]).toEqual({ label: '당일', value: '—', tone: 'none' });
    expect(metaLineOf(dax(AC_LIVE))).toEqual(metaLineOf(syn(AC_LIVE)));
    expect(metaLineOf(dax(AC_LIVE))).toHaveLength(3);
  });

  it('accumRowDescriptionOf(row, true) — 금액 절 「당일 순매수 · 누적 · 하루 순매수」 · 인자 없음은 지금 문장', () => {
    expect(accumRowDescriptionOf(dax(AC_CARRY), true)).toBe(
      '매집중, 이월 D+2, 사이클 2, 결과 +13.8%, 고가 +29.8%, 당일 순매수 +2.4억, 누적 +3.6억, 하루 순매수 +0.4억, 등록 10/10',
    );
    expect(accumRowDescriptionOf(dax(AC_CARRY))).toBe(
      '매집중, 이월 D+2, 사이클 2, 결과 +13.8%, 고가 +29.8%, 팀 순매수 등록 후 +3.6억, 하루 순매수 +0.4억, 등록 10/10',
    );
  });

  it('detailKpisOf(row, true) — 당일 순매수(tone) · 누적 순매수(tone) · 누적 평단 · 등록가 · 최고 순매수 · 인자 없음 = 4항목', () => {
    const k = detailKpisOf(dax(AC_LIVE), true);
    expect(k.map((x) => x.label)).toEqual(['당일 순매수', '누적 순매수', '누적 평단', '등록가', '최고 순매수']);
    expect(k[0]).toEqual({ label: '당일 순매수', text: '−0.6억', tone: 'down' });
    expect(k[1]).toEqual({ label: '누적 순매수', text: '+9.3억', tone: 'up' });
    expect(k[2]!.text).toBe('12,680');
    expect(k[3]!.text).toBe('11,410');
    expect(detailKpisOf(dax(AC_LIVE)).map((x) => x.label)).toEqual(['등록가', '평단', '등록 후 순매수', '최고 순매수']);
  });
});

describe('당일 축 판정 기준 — 새 임계 문구 · ACCUM_RULE_LINES_DAY (quick-261026-01h)', () => {
  const TH = { th_net_krw: 1e8, th_same: 30, th_mcap_krw: 5e11, mcap_krw: 1.284e11, th_recent_pieces: 30, th_recent_sec: 60 };
  const lineOf = (row: Parameters<typeof thresholdPartsOf>[0]) =>
    thresholdPartsOf(row)
      .map((p) => p.text)
      .join('');

  it('th_recent_pieces > 0 → 「당일 순매수 · 최근 S초 팀 매수 조각 P개 · 시총」 · num 조각 5개', () => {
    expect(lineOf(TH)).toBe(
      '이 종목의 등록 임계 — 당일 순매수 1.0억 이상 · 최근 60초 팀 매수 조각 30개 이상 · 시총 5,000억 이하 (현재 시총 1,284억)',
    );
    expect(thresholdPartsOf(TH).filter((p) => p.num).map((p) => p.text)).toEqual(['1.0억', '60초', '30개', '5,000억', '1,284억']);
    expect(lineOf({ ...TH, th_recent_sec: 0 })).toBe(
      '이 종목의 등록 임계 — 당일 순매수 1.0억 이상 · 최근 — 팀 매수 조각 30개 이상 · 시총 5,000억 이하 (현재 시총 1,284억)',
    );
  });

  it('th_recent_pieces 0 · null · 결측 → 지금 문구 그대로', () => {
    const old = '이 종목의 등록 임계 — 순매수 1.0억 이상 · 한 가격 30조각 이상 · 시총 5,000억 이하 (현재 시총 1,284억)';
    expect(lineOf({ ...TH, th_recent_pieces: 0 })).toBe(old);
    expect(lineOf({ ...TH, th_recent_pieces: null })).toBe(old);
    const { th_recent_pieces: _p, th_recent_sec: _s, ...noKeys } = TH;
    expect(lineOf(noKeys)).toBe(old);
  });

  it('ACCUM_RULE_LINES_DAY 4줄 — 본문 1 · 2 당일 축용 · 3 · 4 는 ACCUM_RULE_LINES 공유(500만원)', () => {
    expect(ACCUM_RULE_LINES_DAY).toEqual([
      '당일 순매수는 KYOBO119 서버 상태기 값이에요 — 그날 06:00(또는 새 사이클 시작)부터 팀 매수 − 매도, 우리 서버 체결 제외. 목록 · KPI 의 큰 숫자가 이 값이에요. 누적 순매수(pos)는 등록 이후 사이클 누적(이월 포함 · 우리 체결 제외)이고 목록 아랫줄 · 사이클 표 · 누적 판 왼쪽 회색 축 선이 이 값이에요. 당일 매수가 없으면 작업대의 당일 평단은 「—」(누적으로 채우지 않아요).',
      '하루 순매수(day)는 119 pcap 으로 다시 계산한 하루 전체예요 — 등록 전 구간 · 우리 체결 · 상한가 가격 체결 포함(KRX 연속매매 09:00~20:00). 누적 판 굵은 보라 계단(오른쪽 축)이 이 값의 흐름이라 끝값이 목록의 당일 순매수와 다를 수 있고, 팀 매집 보고서의 하루 합계(상한가 가격 제외)와도 달라요.',
      ACCUM_RULE_LINES[2],
      ACCUM_RULE_LINES[3],
    ]);
    expect(ACCUM_RULE_LINES_DAY[2]).toContain('500만원 이상');
  });
});

// ---------------------------------------------------------------------------
// quick-261026-0ty — 당일 평단(pos_day_avg_px · gh-trade 261026-0q3)
// ---------------------------------------------------------------------------

const dav = (isin: string): AccumReportRow => accumDayAvgListRows().find((r) => r.isin === isin)!;

describe('당일 평단 — hasDayAvgOf · detailKpisOf(row, true, true) (quick-261026-0ty)', () => {
  it('hasDayAvgOf — 한 행이라도 pos_day_avg_px 가 수(0 포함)면 true · 열 없음 · 빈 배열 → false', () => {
    expect(hasDayAvgOf(accumDayAvgListRows())).toBe(true);
    expect(hasDayAvgOf(accumDayAxisListRows())).toBe(false);
    expect(hasDayAvgOf(accumDayAxisListRows().map((r) => ({ ...r, pos_day_avg_px: 0 })))).toBe(true);
    expect(hasDayAvgOf([])).toBe(false);
  });

  it('detailKpisOf(row, true, true) — 6항목 · 당일 평단 = pos_day_avg_px > 0 · 아니면 「—」(누적으로 채우지 않음)', () => {
    const k = detailKpisOf(dav(AC_CARRY), true, true);
    expect(k.map((x) => x.label)).toEqual(['당일 순매수', '당일 평단', '누적 순매수', '누적 평단', '등록가', '최고 순매수']);
    expect(k[1]).toEqual({ label: '당일 평단', text: '21,480' });
    const live = detailKpisOf(dav(AC_LIVE), true, true);
    expect(live[1]!.text).toBe('—');
    expect(live[3]).toEqual({ label: '누적 평단', text: '12,680' });
    expect(detailKpisOf(dav(AC_PARTIAL), true, true)[1]!.text).toBe('—');
    expect(detailKpisOf(dav(AC_CARRY), true).map((x) => x.label)).toEqual([
      '당일 순매수',
      '누적 순매수',
      '누적 평단',
      '등록가',
      '최고 순매수',
    ]);
    expect(detailKpisOf(dav(AC_CARRY)).map((x) => x.label)).toEqual(['등록가', '평단', '등록 후 순매수', '최고 순매수']);
  });
});
