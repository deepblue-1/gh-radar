import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import type { LimitupFingerprintRow } from '@gh-radar/shared';

import { lockRow } from '@/test-fixtures/limitup-report';

import { LimitupFingerprintTable } from '../limitup-fingerprint-table';
import { LimitupYesterdayTable } from '../limitup-yesterday-table';

/**
 * Phase 28 Plan 13 Task 2 — 창구 지문표 · 어제 결과 (UI-SPEC ④-5 · ④-6 · E9 · E10).
 *
 * 잠그는 것: 8열 머리 · 사건 ≥ 10 행 매수 두 칸 `--up` · 매도 칸 `--down` · 상태 「—」 / < 10 행 `--muted-fg` + 「관찰 중」
 * (수치는 그대로) · 상위 20 + 「창구 N개 더 보기」 → 전부(다시 접기 없음) · 행 0 「집계할 창구가 없어요」 ·
 * 어제 결과 손익 표기 · 색 · 「—」 · 부제 날짜 · 빈 문구.
 */

const fp = (p: Partial<LimitupFingerprintRow> & { member: string; n: number }): LimitupFingerprintRow => ({
  name: null,
  entry_sum: 0,
  entry_cnt: 0,
  lock_buy_sum: 0,
  lock_buy_cnt: 0,
  pre_sell_sum: 0,
  pre_sell_cnt: 0,
  lead: 0,
  n_broke: 0,
  n_lock: 0,
  n_held: 0,
  ...p,
});

const rows: LimitupFingerprintRow[] = [
  fp({ member: '00050', name: '키움증권', n: 12, entry_sum: 3.96, entry_cnt: 12, lock_buy_sum: 1.2, lock_buy_cnt: 4,
    pre_sell_sum: 0.6, pre_sell_cnt: 3, lead: 2, n_broke: 3, n_lock: 4, n_held: 1 }),
  fp({ member: '00002', name: '신한증권', n: 3, entry_sum: 0.9, entry_cnt: 3, pre_sell_sum: 0.41, pre_sell_cnt: 1,
    lead: 1, n_broke: 1, n_lock: 1 }),
  ...Array.from({ length: 21 }, (_, i) => fp({ member: `9${String(i).padStart(4, '0')}`, n: 1 })),
];

describe('LimitupFingerprintTable', () => {
  it('머리 8열 · 사건 ≥ 10 행 색 · 상태 「—」 · < 10 행 회색 + 「관찰 중」(수치 그대로)', () => {
    render(<LimitupFingerprintTable rows={rows} />);
    const sec = screen.getByRole('region', { name: '창구 지문표' });
    expect(within(sec).getByText('사건 10건 미만은 관찰 중')).toBeTruthy();
    const heads = within(sec).getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(['창구', '사건', '진입 1분 매수', '잠김 중 매수', '깨짐 전 1분 매도', '매도 선행', '유지율', '상태']);

    const live = sec.querySelector('tr[data-member="00050"]')!;
    const cells = [...live.querySelectorAll('td')];
    expect(cells.map((c) => c.textContent)).toEqual(['키움증권 00050', '12', '33%', '30%', '20%', '2/3', '1/4', '—']);
    expect(cells[2]!.className).toContain('text-[var(--up)]');
    expect(cells[3]!.className).toContain('text-[var(--up)]');
    expect(cells[4]!.className).toContain('text-[var(--down)]');
    expect(live.getAttribute('data-observing')).toBeNull();

    const obs = sec.querySelector('tr[data-member="00002"]')!;
    expect(obs.getAttribute('data-observing')).toBe('true');
    expect(obs.className).toContain('text-[var(--muted-fg)]');
    const oc = [...obs.querySelectorAll('td')];
    expect(oc.map((c) => c.textContent)).toEqual(['신한증권 00002', '3', '30%', '—', '41%', '1/1', '0/1', '관찰 중']);
    expect(oc[2]!.className).not.toContain('text-[var(--up)]');
    expect(oc[4]!.className).not.toContain('text-[var(--down)]');
  });

  it('상위 20행 + 「창구 3개 더 보기」 → 누르면 전부 · 버튼 사라짐', () => {
    render(<LimitupFingerprintTable rows={rows} />);
    const sec = screen.getByRole('region', { name: '창구 지문표' });
    expect(sec.querySelectorAll('tbody tr')).toHaveLength(20);
    fireEvent.click(within(sec).getByRole('button', { name: '창구 3개 더 보기' }));
    expect(sec.querySelectorAll('tbody tr')).toHaveLength(23);
    expect(within(sec).queryByRole('button', { name: /더 보기/ })).toBeNull();
  });

  it('가로 넘침은 래퍼 스크롤 · 행 0 → 「집계할 창구가 없어요」(섹션 유지)', () => {
    const { container, unmount } = render(<LimitupFingerprintTable rows={rows.slice(0, 2)} />);
    expect(container.querySelector('.overflow-x-auto table')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /더 보기/ })).toBeNull();
    unmount();
    render(<LimitupFingerprintTable rows={[]} />);
    const sec = screen.getByRole('region', { name: '창구 지문표' });
    expect(within(sec).getByText('집계할 창구가 없어요')).toBeTruthy();
    expect(sec.querySelector('table')).toBeNull();
  });
});

describe('LimitupYesterdayTable', () => {
  it('부제 「{MM/DD} 잠김 → 다음 날 시가」 · 손익 표기 + 색 · D+1 미도착 「—」', () => {
    render(
      <LimitupYesterdayTable
        prev={{
          date: '20261001',
          locks: [
            lockRow({ isin: 'A', lock_id: 1, name: '원일티엔아이', upper_px: 14100, d1_open: 14450, d1_ret: 0.0248 }),
            lockRow({ isin: 'B', lock_id: 1, name: '덕우전자', upper_px: 5730, d1_open: 5640, d1_ret: -0.0157 }),
            lockRow({ isin: 'C', lock_id: 1, name: '대기종목', upper_px: 1000 }),
          ],
        }}
      />,
    );
    const sec = screen.getByRole('region', { name: '어제 결과' });
    expect(within(sec).getByText('10/01 잠김 → 다음 날 시가')).toBeTruthy();
    expect(within(sec).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      '종목',
      '상한가',
      'D+1 시가',
      '손익',
    ]);
    const cellsOf = (isin: string) => [...sec.querySelectorAll(`tr[data-isin="${isin}"] td`)];
    expect(cellsOf('A').map((c) => c.textContent)).toEqual(['원일티엔아이', '14,100', '14,450', '+2.5%']);
    expect(cellsOf('A')[3]!.className).toContain('text-[var(--up)]');
    expect(cellsOf('B')[3]!.textContent).toBe('−1.6%');
    expect(cellsOf('B')[3]!.className).toContain('text-[var(--down)]');
    expect(cellsOf('C').map((c) => c.textContent)).toEqual(['대기종목', '1,000', '—', '—']);
    expect(cellsOf('C')[3]!.className).toContain('text-[var(--fg)]');
  });

  it('prev null · 잠김 0 → 「어제 보고서가 없어요」', () => {
    const { unmount } = render(<LimitupYesterdayTable prev={null} />);
    expect(screen.getByText('어제 보고서가 없어요')).toBeTruthy();
    unmount();
    render(<LimitupYesterdayTable prev={{ date: '20261001', locks: [] }} />);
    expect(screen.getByText('어제 보고서가 없어요')).toBeTruthy();
  });
});
