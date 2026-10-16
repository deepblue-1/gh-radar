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

import { CHEONIL, DONGYANG, HANSUN, SMBEXCEL, teamflowRows } from '@/test-fixtures/teamflow-export';

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

describe('TeamflowDetail — 10분 흐름 차트 (T8 · D-13)', () => {
  const bucketSvg = () => document.querySelector('[data-slot="teamflow-bucket-chart"]') as SVGSVGElement;
  const bucketBlock = () => document.querySelector('[data-slot="teamflow-buckets"]') as HTMLElement;

  it('천일고속 — role=img 접근 이름 · viewBox 0 0 640 228 · 칸 g(title) 39개 · 캡션 음영 문구 · 첫 상한가 글자 · 범례', () => {
    renderDetail(rowOf(CHEONIL));
    const svg = screen.getByRole('img', {
      name: '천일고속 10분 흐름 — 최대 매집 12:00~12:09 +7.2억 · 첫 상한가 11:50',
    });
    expect(svg.getAttribute('data-slot')).toBe('teamflow-bucket-chart');
    expect(svg.getAttribute('viewBox')).toBe('0 0 640 228');
    expect(svg.getAttribute('height')).toBe('228');
    const titles = Array.from(svg.querySelectorAll('g > title')).map((t) => t.textContent);
    expect(titles).toHaveLength(39);
    expect(titles[18]).toBe('12:00 · 등락 21.1~29.8% · 팀 순매수 +7.2억 · 매수 중 팀 47% · 거래량 10,418주');
    expect(titles[38]!.startsWith('15:20 · ')).toBe(true);
    expect(svg.textContent).toContain('첫 상한가 11:50');
    expect(svg.textContent).toContain('+9.2억');
    expect(svg.textContent).toContain('9시');
    expect(svg.textContent).toContain('15시');
    const block = bucketBlock();
    expect(within(block).getByText('10분 단위 흐름')).toBeTruthy();
    expect(block.textContent).toContain('09:00~15:30 · 보라 음영 = 팀 순매수가 가장 크게 이어진 12:00~12:09 (+7.2억)');
    const legend = block.querySelector('[data-slot="teamflow-bucket-legend"]') as HTMLElement;
    expect(Array.from(legend.children).map((c) => c.textContent)).toEqual([
      '팀 순매수 +',
      '팀 순매수 −',
      '매수 중 팀 %',
      '등락률 범위',
      '최대 매집 창',
      '첫 상한가',
    ]);
  });

  it('배치 — 2열 그리드 다음 · 판정 기준 앞(전폭 · 그리드 밖)', () => {
    renderDetail(rowOf(CHEONIL));
    const block = bucketBlock();
    expect(block.closest('.xl\\:grid-cols-2')).toBeNull();
    const grid = document.querySelector('.xl\\:grid-cols-2') as HTMLElement;
    const rules = document.querySelector('[data-slot="teamflow-rules"]') as HTMLElement;
    expect(grid.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(block.compareDocumentPosition(rules) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('동양고속(미도달 · 팀 체결 거의 없음) — 차트 유지 · 「첫 상한가」 글자 · 범례 없음 · 안내 문구 없음', () => {
    renderDetail(rowOf(DONGYANG));
    const svg = bucketSvg();
    expect(svg.getAttribute('aria-label')).toBe('동양고속 10분 흐름 — 최대 매집 12:00~12:19 +1.9억');
    expect(svg.textContent).not.toContain('첫 상한가');
    expect(svg.querySelectorAll('g > title')).toHaveLength(39);
    expect(bucketBlock().textContent).not.toContain('첫 상한가');
    expect(screen.queryByText('10분 체결 기록이 없어요')).toBeNull();
  });

  it('window null(합성) → 이름 「최대 매집 창 없음」 · 캡션 음영 문구 없음 · 범례 「최대 매집 창」 없음', () => {
    renderDetail(withPayload(rowOf(CHEONIL), { window: null }));
    const svg = bucketSvg();
    expect(svg.getAttribute('aria-label')).toBe('천일고속 10분 흐름 — 최대 매집 창 없음 · 첫 상한가 11:50');
    const block = bucketBlock();
    expect(block.textContent).not.toContain('보라 음영');
    expect(block.textContent).not.toContain('최대 매집 창');
    expect(block.textContent).toContain('09:00~15:30');
  });

  it('buckets [](합성) → 축 · 0선은 그대로 + 「10분 체결 기록이 없어요」 · 칸 title 0', () => {
    renderDetail(withPayload(rowOf(CHEONIL), { buckets: [] }));
    const svg = bucketSvg();
    expect(svg.getAttribute('viewBox')).toBe('0 0 640 228');
    expect(svg.querySelectorAll('g > title')).toHaveLength(0);
    expect(svg.textContent).toContain('10분 체결 기록이 없어요');
    expect(svg.textContent).toContain('9시');
  });
});

describe('TeamflowDetail — 「10분 표 보기」 (T8 · D-14)', () => {
  const bucketTable = () => document.querySelector('[data-slot="teamflow-bucket-table"]') as HTMLElement | null;
  const bodyRows = () => within(bucketTable()!).getAllByRole('row').slice(1);
  const INSET = 'inset_3px_0_0_var(--team)';

  it('기본 접힘 → 클릭 → 7열 · 행 = buckets 전부(천일고속 39) · 마지막 「15:30」(key 93 따로) · 12:00 행 칸', () => {
    renderDetail(rowOf(CHEONIL));
    const btn = toggle('10분 표 보기');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(bucketTable()).toBeNull();

    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const table = bucketTable()!;
    expect(document.getElementById(btn.getAttribute('aria-controls')!)!.contains(table)).toBe(true);
    const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(['시각', '등락 범위', '거래량', '팀 매수', '팀 매도', '팀 순매수', '매수 중 팀']);
    const rows = bodyRows();
    expect(rows).toHaveLength(39);
    expect(within(rows[0]!).getAllByRole('cell')[0]!.textContent).toBe('09:00');
    expect(within(rows.at(-1)!).getAllByRole('cell')[0]!.textContent).toBe('15:30');
    const noon = rows.find((r) => within(r).getAllByRole('cell')[0]!.textContent === '12:00')!;
    expect(within(noon).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      '12:00',
      '21.1~29.8%',
      '10,418',
      '3,444',
      '219',
      '+7.2억',
      '47%',
    ]);
  });

  it('천일고속 window 12:00~12:09 → 그 행 첫 칸에만 inset 3px --team 띠', () => {
    renderDetail(rowOf(CHEONIL));
    fireEvent.click(toggle('10분 표 보기'));
    const striped = bodyRows().filter((r) => within(r).getAllByRole('cell')[0]!.className.includes(INSET));
    expect(striped).toHaveLength(1);
    expect(within(striped[0]!).getAllByRole('cell')[0]!.textContent).toBe('12:00');
    // 둘째 칸 이후에는 띠 없음
    expect(within(striped[0]!).getAllByRole('cell')[1]!.className.includes(INSET)).toBe(false);
  });

  it('한선엔지니어링 window 09:10~09:59 → 5행(09:10 · 09:20 · 09:30 · 09:40 · 09:50)에 띠', () => {
    renderDetail(rowOf(HANSUN));
    fireEvent.click(toggle('10분 표 보기'));
    const striped = bodyRows()
      .filter((r) => within(r).getAllByRole('cell')[0]!.className.includes(INSET))
      .map((r) => within(r).getAllByRole('cell')[0]!.textContent);
    expect(striped).toEqual(['09:10', '09:20', '09:30', '09:40', '09:50']);
  });

  it('합성 key 50(08:20 · 범위 밖) → 차트 칸 수 그대로 39 · 표에는 맨 위 행(key 오름차순)', () => {
    const ch = rowOf(CHEONIL);
    const extra = { ...ch.payload!.buckets[0]!, key: 50, start: '08:20' };
    renderDetail(withPayload(ch, { buckets: [...ch.payload!.buckets, extra] }));
    const svg = document.querySelector('[data-slot="teamflow-bucket-chart"]') as SVGSVGElement;
    expect(svg.querySelectorAll('g > title')).toHaveLength(39);
    fireEvent.click(toggle('10분 표 보기'));
    const rows = bodyRows();
    expect(rows).toHaveLength(40);
    expect(within(rows[0]!).getAllByRole('cell')[0]!.textContent).toBe('08:20');
  });

  it('합성 창 08:20~08:39(축 밖 전체) → 차트 음영 없음 · 표 띠는 08:20 · 08:30 행에만(09:00 행 아님 · IN-03)', () => {
    const ch = rowOf(CHEONIL);
    const b0 = ch.payload!.buckets[0]!;
    const extra = [
      { ...b0, key: 50, start: '08:20' },
      { ...b0, key: 51, start: '08:30' },
    ];
    renderDetail(
      withPayload(ch, {
        buckets: [...ch.payload!.buckets, ...extra],
        window: { ...ch.payload!.window!, start: '08:20', end: '08:39' },
      }),
    );
    const svg = document.querySelector('[data-slot="teamflow-bucket-chart"]') as SVGSVGElement;
    expect(svg.querySelector('rect[fill="var(--team-bg)"]')).toBeNull();
    fireEvent.click(toggle('10분 표 보기'));
    const striped = bodyRows()
      .filter((r) => within(r).getAllByRole('cell')[0]!.className.includes(INSET))
      .map((r) => within(r).getAllByRole('cell')[0]!.textContent);
    expect(striped).toEqual(['08:20', '08:30']);
  });

  it('창이 15:20 칸(key 92)까지 닿으면 차트가 거기 합산하는 15:30(key 93) 행에도 띠', () => {
    const ch = rowOf(CHEONIL);
    renderDetail(withPayload(ch, { window: { ...ch.payload!.window!, start: '15:10', end: '15:29' } }));
    // 같은 선택자가 축 안 창에서는 음영을 찾는다(위 「음영 없음」 단언의 대조군)
    expect(document.querySelector('[data-slot="teamflow-bucket-chart"] rect[fill="var(--team-bg)"]')).not.toBeNull();
    fireEvent.click(toggle('10분 표 보기'));
    const striped = bodyRows()
      .filter((r) => within(r).getAllByRole('cell')[0]!.className.includes(INSET))
      .map((r) => within(r).getAllByRole('cell')[0]!.textContent);
    // 천일고속 export 에는 key 92(15:20) 행이 없다(단일가 접수 구간 체결 없음) — 15:10 · 15:30 두 행
    expect(striped).toEqual(['15:10', '15:30']);
  });

  it('구간표 · 10분 표 · 판정 기준 — 차례로 열고 닫아도 서로의 상태를 바꾸지 않는다', () => {
    renderDetail(rowOf(CHEONIL));
    const state = () => ['구간표 보기', '10분 표 보기', '판정 기준'].map((l) => toggle(l).getAttribute('aria-expanded'));
    expect(state()).toEqual(['false', 'false', 'false']);
    fireEvent.click(toggle('구간표 보기'));
    expect(state()).toEqual(['true', 'false', 'false']);
    fireEvent.click(toggle('10분 표 보기'));
    expect(state()).toEqual(['true', 'true', 'false']);
    fireEvent.click(toggle('판정 기준'));
    expect(state()).toEqual(['true', 'true', 'true']);
    fireEvent.click(toggle('10분 표 보기'));
    expect(state()).toEqual(['true', 'false', 'true']);
    expect(bucketTable()).toBeNull();
    expect(document.querySelector('[data-slot="teamflow-band-table"]')).not.toBeNull();
    fireEvent.click(toggle('구간표 보기'));
    expect(state()).toEqual(['false', 'false', 'true']);
  });

  it('DayGrid — 10분 표 열기 → 행 접기 → 다시 열기 = 10분 표 닫힘(초기화)', () => {
    render(<TeamflowDayGrid rows={teamflowRows()} />);
    const rowBtn = () => document.getElementById(`teamflow-row-${CHEONIL}`) as HTMLButtonElement;
    fireEvent.click(rowBtn());
    fireEvent.click(toggle('10분 표 보기'));
    expect(bucketTable()).not.toBeNull();
    fireEvent.click(rowBtn());
    fireEvent.click(rowBtn());
    expect(toggle('10분 표 보기').getAttribute('aria-expanded')).toBe('false');
    expect(bucketTable()).toBeNull();
  });
});
