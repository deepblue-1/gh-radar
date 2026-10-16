import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import type { TeamflowRow } from '@gh-radar/shared';

/**
 * Phase 33 Plan 05 — 펼친 상세 ① (UI-SPEC T6 · T7 · T9 · D-12 · D-14).
 *
 * 잠그는 것: 요약 아래 [구간 가로 막대 | 다섯 창구 거래원] 2열 · 구간 차트 접근 이름 · 측정 폭 1:1 viewBox(jsdom 폭 0 = 폴백 640) ·
 * 「구간표 보기」 · 「판정 기준」 기본 접힘 · 서로 독립 · 행 접으면 초기화(상세 언마운트).
 */

import { SMBEXCEL, teamflowRows } from '@/test-fixtures/teamflow-export';

import { TeamflowDayGrid } from '../teamflow-day-grid';
import { TeamflowDetail } from '../teamflow-detail';

const rowOf = (isin: string): TeamflowRow => teamflowRows().find((r) => r.isin === isin)!;

/** 픽스처 행 복제 + payload 일부 교체(합성 행). */
const withPayload = (row: TeamflowRow, patch: Partial<NonNullable<TeamflowRow['payload']>>): TeamflowRow => ({
  ...row,
  payload: { ...row.payload!, ...patch },
});

const toggle = (label: string) => screen.getByRole('button', { name: label });

const renderDetail = (row: TeamflowRow) => render(<TeamflowDetail row={row} labelledBy={`teamflow-row-${row.isin}`} />);

describe('TeamflowDetail — 구간 가로 막대 (T6)', () => {
  it('에스엠벡셀 — role=img 접근 이름 · viewBox 0 0 640 276(측정 0 → 폴백 640) · 2열 그리드 안', () => {
    renderDetail(rowOf(SMBEXCEL));
    const svg = screen.getByRole('img', {
      name: '에스엠벡셀 등락 구간별 팀 순매수 — 20% 아래 −3.3억 · 20%~상한 +2.2억',
    });
    expect(svg.getAttribute('viewBox')).toBe('0 0 640 276');
    expect(svg.getAttribute('data-slot')).toBe('teamflow-band-chart');
    expect(svg.getAttribute('height')).toBe('276');
    expect(svg.closest('.xl\\:grid-cols-2')).not.toBeNull();
    // 「하루 합계」 를 뺀 9행 — 행마다 <title> 툴팁
    const titles = Array.from(svg.querySelectorAll('g > title')).map((t) => t.textContent);
    expect(titles).toHaveLength(9);
    expect(titles[7]).toBe('28%~상한 미만 · 팀 순매수 +4.4억 · 매수 중 팀 22% · 거래량 956,522주');
    expect(titles.some((t) => t?.startsWith('하루 합계'))).toBe(false);
    expect(screen.getByText('등락 구간별 팀 순매수')).toBeTruthy();
    expect(screen.getByText('막대 = 팀 순매수 · 오른쪽 % = 매수 중 팀')).toBeTruthy();
  });
});

describe('TeamflowDetail — 접힘 토글 · 구간표 · 판정 기준 (T6 · T9 · D-14)', () => {
  it('「구간표 보기」 기본 접힘(표 없음) → 클릭 → aria-expanded · aria-controls = 표 래퍼 id · 10행 · 마지막 「하루 합계」', () => {
    renderDetail(rowOf(SMBEXCEL));
    const btn = toggle('구간표 보기');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.hasAttribute('aria-controls')).toBe(false);
    expect(document.querySelector('[data-slot="teamflow-band-table"]')).toBeNull();

    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const wrap = document.getElementById(btn.getAttribute('aria-controls')!)!;
    expect(wrap).not.toBeNull();
    const table = wrap.querySelector('[data-slot="teamflow-band-table"]') as HTMLElement;
    expect(table).not.toBeNull();
    const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(['구간', '거래량', '매수 중 팀', '팀 매수', '팀 매도', '팀 순매수']);
    const body = within(table).getAllByRole('row').slice(1);
    expect(body).toHaveLength(10);
    const last = body.at(-1)!;
    expect(within(last).getAllByRole('cell')[0]!.textContent).toBe('하루 합계');
    // 하루 합계 행: 팀 매수 1,136,685 + 27.5억 · 팀 순매수 −1.1억 + −74,310주
    const cells = within(last).getAllByRole('cell').map((c) => c.textContent);
    expect(cells[3]).toBe('1,136,68527.5억');
    expect(cells[5]).toBe('−1.1억−74,310주');
  });

  it('「판정 기준」 은 구간표를 열어도 닫힌 채 → 클릭 → li 6개 + 출처 줄', () => {
    renderDetail(rowOf(SMBEXCEL));
    fireEvent.click(toggle('구간표 보기'));
    const rulesBtn = toggle('판정 기준');
    expect(rulesBtn.getAttribute('aria-expanded')).toBe('false');
    const rules = document.querySelector('[data-slot="teamflow-rules"]') as HTMLElement;
    expect(rules).not.toBeNull();
    expect(rules.querySelectorAll('li')).toHaveLength(0);

    fireEvent.click(rulesBtn);
    expect(rulesBtn.getAttribute('aria-expanded')).toBe('true');
    const items = rules.querySelectorAll('li');
    expect(items).toHaveLength(6);
    expect(items[0]!.textContent).toBe('팀 = 교보 · 한국 · 유진 · 신한 · NH 다섯 창구.');
    expect(within(rules).getByText('출처: gh-trade 팀 매집 분석 규칙')).toBeTruthy();
    // 구간표는 그대로 열려 있다(서로 독립)
    expect(toggle('구간표 보기').getAttribute('aria-expanded')).toBe('true');
  });

  it('bands 가 「하루 합계」 뿐 → 「구간 체결이 없어요」 + 「구간표 보기」 버튼은 남는다', () => {
    const sm = rowOf(SMBEXCEL);
    const total = sm.payload!.bands.filter((b) => b.label === '하루 합계');
    renderDetail(withPayload(sm, { bands: total }));
    expect(screen.getByText('구간 체결이 없어요')).toBeTruthy();
    expect(screen.queryByRole('img', { name: /등락 구간별 팀 순매수/ })).toBeNull();
    expect(toggle('구간표 보기')).toBeTruthy();
  });

  it('DayGrid — 행 열기 → 구간표 열기 → 행 접기 → 다시 열기 = 구간표 닫힘(상세 언마운트로 초기화)', () => {
    render(<TeamflowDayGrid rows={teamflowRows()} />);
    const rowBtn = () => document.getElementById(`teamflow-row-${SMBEXCEL}`) as HTMLButtonElement;
    fireEvent.click(rowBtn());
    fireEvent.click(toggle('구간표 보기'));
    expect(document.querySelector('[data-slot="teamflow-band-table"]')).not.toBeNull();
    fireEvent.click(rowBtn());
    expect(document.getElementById(`tf-${SMBEXCEL}`)).toBeNull();
    fireEvent.click(rowBtn());
    expect(toggle('구간표 보기').getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('[data-slot="teamflow-band-table"]')).toBeNull();
  });
});
