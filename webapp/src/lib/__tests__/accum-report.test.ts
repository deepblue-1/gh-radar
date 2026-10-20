import { describe, it, expect } from 'vitest';

/**
 * Phase 34 Plan 04 — 매집감지 목록 표시 변환 골든 (UI-SPEC A2 · A3 · 「표시 변환 규칙 (A11)」 · D-08 ~ D-13).
 *
 * 잠그는 것: KPI 4칸 집계(합성 7행 · 빈 배열 · 실측 6행) · 사유 라벨/줄 · 흐림 · 결과 태그(+고가) · 이월/오늘 등록 판정 ·
 * 등록·종료 칸 · 폰 메타 줄 · 행 sr 설명. null · NaN · 결측(since_date "" · "None")에 throw 없음.
 * 픽스처 = 10/14 실측 6행(워커 gz 원문) + 합성 7행(`accumSyntheticListRows` — 목업 A 의 상태 조합 · KR79 합성 대역).
 */

import type { AccumReportRow } from '@gh-radar/shared';

import {
  ACCUM_DROP_TITLE,
  accumKpisOf,
  accumRowDescriptionOf,
  accumTagOf,
  endReasonLabelOf,
  isCarry,
  isDimRow,
  isTodayReg,
  metaLineOf,
  reasonLineOf,
  regCellOf,
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
  accumListRows,
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
      dropped: 1,
      expired: 1,
      // 9.3 − 2.4 + 3.6 − 6.9 + 0.4 + 0.2 = +4.2억(⑦ null 제외 · 종료 행 포함)
      posSum: 420_000_000,
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
      dropped: 0,
      expired: 0,
      posSum: null,
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
  it('endReasonLabelOf 1/2/3/0 = 청산 / 이월 탈락(복원 안 됨) / 이월 만료 / null', () => {
    expect(endReasonLabelOf(1)).toBe('청산');
    expect(endReasonLabelOf(2)).toBe('이월 탈락(복원 안 됨)');
    expect(endReasonLabelOf(3)).toBe('이월 만료');
    expect(endReasonLabelOf(0)).toBeNull();
    expect(endReasonLabelOf(null)).toBeNull();
  });

  it('reasonLineOf — 종료 행만 「{사유} · HH:MM」 · end_time null 이면 시각 생략 · 살아 있는 행 null', () => {
    expect(reasonLineOf(syn(AC_LIQ))).toBe('청산 · 11:32');
    expect(reasonLineOf(syn(AC_DROP))).toBe('이월 탈락(복원 안 됨) · 06:00');
    expect(reasonLineOf(syn(AC_EXPIRE))).toBe('이월 만료 · 06:00');
    expect(reasonLineOf({ ...syn(AC_LIQ), end_time_ms: null })).toBe('청산');
    expect(reasonLineOf(syn(AC_LIVE))).toBeNull();
    expect(reasonLineOf(syn(AC_SELL))).toBeNull();
  });

  it('사유 2 title 상수', () => {
    expect(ACCUM_DROP_TITLE).toBe('06:00 이월 판정에서 탈락했거나 서버 재기동 때 복원되지 않은 종목이에요');
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

  it('종료 청산 행 — 사유 · 종료 시각', () => {
    expect(accumRowDescriptionOf(syn(AC_LIQ))).toBe(
      '종료, 청산 11:32, 결과 +18.1%, 고가 +30.0%, 팀 순매수 등록 후 −6.9억, 하루 순매수 −33.4억, 등록 09:05, 종료 11:32',
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
