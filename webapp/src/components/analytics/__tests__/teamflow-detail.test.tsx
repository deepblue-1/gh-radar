import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { TeamflowRow } from '@gh-radar/shared';

/**
 * Phase 33 Plan 05 — 펼친 상세 ① (UI-SPEC T6 · T7 · T9 · D-12 · D-14).
 *
 * 잠그는 것: 요약 아래 [구간 가로 막대 | 다섯 창구 거래원] 2열 · 구간 차트 접근 이름 · 측정 폭 1:1 viewBox(jsdom 폭 0 = 폴백 640).
 */

import { SMBEXCEL, teamflowRows } from '@/test-fixtures/teamflow-export';

import { TeamflowDetail } from '../teamflow-detail';

const rowOf = (isin: string): TeamflowRow => teamflowRows().find((r) => r.isin === isin)!;

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
