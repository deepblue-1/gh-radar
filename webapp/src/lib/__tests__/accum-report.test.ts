import { describe, it, expect } from 'vitest';

/**
 * Phase 34 Plan 04 — 매집감지 목록 표시 변환 골든 (UI-SPEC A2 · A3 · 「표시 변환 규칙 (A11)」 · D-08 ~ D-13).
 *
 * 잠그는 것: KPI 4칸 집계(합성 7행 · 빈 배열 · 실측 6행).
 * 픽스처 = 10/14 실측 6행(워커 gz 원문) + 합성 7행(`accumSyntheticListRows` — 목업 A 의 상태 조합 · KR79 합성 대역).
 */

import { accumKpisOf } from '../accum-report';
import { accumListRows, accumSyntheticListRows } from '@/test-fixtures/accum-export';

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
