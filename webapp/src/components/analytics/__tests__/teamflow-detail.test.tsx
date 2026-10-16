import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import type { TeamflowRow } from '@gh-radar/shared';

/**
 * Phase 33 Plan 05 — 펼친 상세 ① (UI-SPEC T6 · T7 · T9 · D-12 · D-14).
 *
 * 잠그는 것: 요약 아래 [구간 가로 막대 | 다섯 창구 거래원] 2열 · 구간 차트 접근 이름 · 측정 폭 1:1 viewBox(jsdom 폭 0 = 폴백 640) ·
 * 「구간표 보기」 · 「판정 기준」 기본 접힘 · 서로 독립 · 행 접으면 초기화(상세 언마운트) ·
 * 다섯 창구 거래원 2단 막대(net 내림차순 · null 뒤 · null 칸 채움 없음 · 상위 5 밖 · 범례 · 참고 줄 · 자료 없음).
 */

import { CHEONIL, SMBEXCEL, teamflowRows } from '@/test-fixtures/teamflow-export';

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

describe('TeamflowDetail — 다섯 창구 거래원 (T7)', () => {
  const membersBox = () => document.querySelector('[data-slot="teamflow-members"]') as HTMLElement;
  const memberRows = () => Array.from(membersBox().querySelectorAll<HTMLElement>('[data-slot="teamflow-member-row"]'));
  const nameOf = (el: HTMLElement) => el.getAttribute('data-member');
  const fill = (el: HTMLElement, side: 'buy' | 'sell') =>
    el.querySelector<HTMLElement>(`[data-slot="teamflow-member-${side}"]`);

  it('천일고속 — 4행 net 큰 순 · 상위 5 밖: 유진 · 15:30 캡션 · 교보 매도 채움 없음 · 폭 = max(buy, sell) 정규화 · 2열 오른쪽', () => {
    renderDetail(rowOf(CHEONIL));
    const box = membersBox();
    expect(box).not.toBeNull();
    expect(box.closest('.xl\\:grid-cols-2')).not.toBeNull();
    expect(within(box).getByText('다섯 창구 거래원')).toBeTruthy();
    expect(within(box).getByText('15:30 기준 하루 누적 · 창구 전체(일반 고객 포함)')).toBeTruthy();
    const rows = memberRows();
    expect(rows.map(nameOf)).toEqual(['신한', '한국', 'NH', '교보']);
    expect(rows[0]!.textContent).toContain('+3,625주');
    expect(rows[2]!.textContent).toContain('−2,191주');
    expect(rows[0]!.getAttribute('title')).toBe('신한 · 매수 15,096주 · 매도 11,471주');
    // 막대 폭 = 값 ÷ 이 종목 max(buy, sell)(신한 매수 15,096) × 100
    expect(fill(rows[0]!, 'buy')!.style.width).toBe('100%');
    expect(parseFloat(fill(rows[0]!, 'sell')!.style.width)).toBeCloseTo((11471 / 15096) * 100, 6);
    // 교보: sell null → 매도 채움 없음 · net null → 「—」
    const kyobo = rows[3]!;
    expect(fill(kyobo, 'buy')).not.toBeNull();
    expect(fill(kyobo, 'sell')).toBeNull();
    expect(kyobo.getAttribute('title')).toBe('교보 · 매수 6,994주 · 매도 —');
    expect(within(box).getByText('상위 5 밖: 유진')).toBeTruthy();
    expect(within(box).getByText('매수')).toBeTruthy();
    expect(within(box).getByText('매도')).toBeTruthy();
    expect(within(box).getByText('오른쪽 = 순매수(주)')).toBeTruthy();
    expect(within(box).getByText('참고: 매수 1위 키움증권 17,487주 · 매도 1위 키움증권 20,192주')).toBeTruthy();
  });

  it('에스엠벡셀 — 캡션 「19:50 기준」(장 마감 뒤 시각 그대로) · 상위 5 밖: 교보 · 유진', () => {
    renderDetail(rowOf(SMBEXCEL));
    const box = membersBox();
    expect(within(box).getByText('19:50 기준 하루 누적 · 창구 전체(일반 고객 포함)')).toBeTruthy();
    expect(within(box).getByText('상위 5 밖: 교보 · 유진')).toBeTruthy();
    expect(memberRows().map(nameOf)).toEqual(['NH', '신한', '한국']);
  });

  it('members null → 「거래원 자료 없음」(teamflow-members-none) · 소제목 남음 · 범례 없음', () => {
    renderDetail(withPayload(rowOf(CHEONIL), { members: null }));
    const none = document.querySelector('[data-slot="teamflow-members-none"]');
    expect(none?.textContent).toBe('거래원 자료 없음');
    expect(within(membersBox()).getByText('다섯 창구 거래원')).toBeTruthy();
    expect(within(membersBox()).getByText('하루 누적 · 창구 전체(일반 고객 포함)')).toBeTruthy();
    expect(memberRows()).toHaveLength(0);
    expect(within(membersBox()).queryByText('오른쪽 = 순매수(주)')).toBeNull();
  });

  it('rows [] + absent [교보] → 막대 0 · 「상위 5 밖: 교보」 한 줄 · 자료 없음 아님', () => {
    const ch = rowOf(CHEONIL);
    renderDetail(
      withPayload(ch, {
        members: { ...ch.payload!.members!, rows: [], absent: ['교보'], top_buy: null, top_sell: null },
      }),
    );
    expect(memberRows()).toHaveLength(0);
    expect(within(membersBox()).getByText('상위 5 밖: 교보')).toBeTruthy();
    expect(document.querySelector('[data-slot="teamflow-members-none"]')).toBeNull();
    expect(within(membersBox()).queryByText('오른쪽 = 순매수(주)')).toBeNull();
    expect(within(membersBox()).queryByText(/^참고:/)).toBeNull();
  });

  it('net null 행 → 값 「—」 · 맨 뒤(입력 첫 행이어도)', () => {
    const ch = rowOf(CHEONIL);
    const m = ch.payload!.members!;
    renderDetail(
      withPayload(ch, {
        members: { ...m, rows: [{ member: '00001', name: '교보', buy: null, sell: 500, net: null }, ...m.rows.slice(0, 3)] },
      }),
    );
    const rows = memberRows();
    expect(rows.map(nameOf)).toEqual(['신한', '한국', 'NH', '교보']);
    const last = rows.at(-1)!;
    expect(last.querySelector('[data-slot="teamflow-member-net"]')!.textContent).toBe('—');
    expect(fill(last, 'buy')).toBeNull();
    expect(fill(last, 'sell')).not.toBeNull();
  });

  it('top_buy 만 → 참고 줄 매수 1위만 · 둘 다 null → 참고 줄 없음', () => {
    const ch = rowOf(CHEONIL);
    const m = ch.payload!.members!;
    const { unmount } = renderDetail(withPayload(ch, { members: { ...m, top_sell: null } }));
    expect(within(membersBox()).getByText('참고: 매수 1위 키움증권 17,487주')).toBeTruthy();
    unmount();
    renderDetail(withPayload(ch, { members: { ...m, top_buy: null, top_sell: null } }));
    expect(within(membersBox()).queryByText(/^참고:/)).toBeNull();
  });
});
