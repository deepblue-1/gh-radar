import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import type { TickGridRow, TickTodayRow } from '@gh-radar/shared';

import { TickEntry } from '../tick-entry';

/**
 * Phase 37 Plan 08 — 진입 목록(목업 A `.panel`) — 행 · 정렬 토글 · 출처 칩 · 클릭 · 빈 목록 · 캡션 · 오늘 「라이브」.
 */

function row(p: Partial<TickGridRow> & Pick<TickGridRow, 'isin' | 'name'>): TickGridRow {
  return {
    date: '20261016',
    exchange: 'KRX',
    code: p.isin.slice(3, 9),
    mode: 'nightly',
    sources: ['up15'],
    bytes: 1000,
    records: 10,
    a3_count: 1,
    high_rate: null,
    last_rate: null,
    created_at: '2026-10-16T15:00:00Z',
    ...p,
  };
}

const ROWS: TickGridRow[] = [
  row({ isin: 'KR7005930003', name: '삼성전자', high_rate: 3.2, sources: ['accum'] }),
  row({ isin: 'KR7101360006', name: '에코앤드림', high_rate: 29.9, sources: ['accum', 'up15'] }),
  row({ isin: 'KR7101360006', name: '에코앤드림', exchange: 'NXT', high_rate: 15.6, sources: ['up15'] }),
  row({ isin: 'KR7035720002', name: '카카오', high_rate: -0.9, sources: ['request'] }),
];

const names = () =>
  screen.getAllByRole('row').slice(1).map((r) => `${r.getAttribute('data-isin')}:${r.getAttribute('data-ex')}`);

function renderEntry(over: Partial<Parameters<typeof TickEntry>[0]> = {}) {
  const onOpen = vi.fn();
  const onSort = vi.fn();
  const utils = render(
    <TickEntry date="20261016" rows={ROWS} sort="rate" onSort={onSort} onOpen={onOpen} etaMin={2} {...over} />,
  );
  return { ...utils, onOpen, onSort };
}

describe('TickEntry', () => {
  it('패널 머리 「10/16 격자 종목」 · n종목 · 등락률순(고가 기준 내림차순)', () => {
    renderEntry();
    expect(screen.getByRole('heading', { name: '10/16 격자 종목' })).toBeInTheDocument();
    expect(screen.getByText(/^4종목/)).toBeInTheDocument();
    expect(names()).toEqual(['KR7101360006:KRX', 'KR7101360006:NXT', 'KR7005930003:KRX', 'KR7035720002:KRX']);
    expect(screen.getByText('+29.9%')).toBeInTheDocument();
    expect(screen.getByText('−0.9%')).toBeInTheDocument();
  });

  it('이름순 — 가나다', () => {
    renderEntry({ sort: 'name' });
    expect(names()).toEqual(['KR7005930003:KRX', 'KR7101360006:KRX', 'KR7101360006:NXT', 'KR7035720002:KRX']);
  });

  it('정렬 토글은 onSort 를 부른다(같은 값이면 안 부른다)', () => {
    const { onSort } = renderEntry();
    fireEvent.click(screen.getByRole('button', { name: '등락률순' }));
    expect(onSort).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '이름순' }));
    expect(onSort).toHaveBeenCalledWith('name');
    expect(screen.getByRole('button', { name: '등락률순' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('출처 칩 — 매집감지 · 15%↑ · 요청 변환 · NXT', () => {
    renderEntry();
    const [eco, ecoNxt, , kakao] = screen.getAllByRole('row').slice(1);
    expect(within(eco!).getByText('매집감지')).toBeInTheDocument();
    expect(within(eco!).getByText('15%↑')).toBeInTheDocument();
    expect(within(eco!).queryByText('NXT')).toBeNull();
    expect(within(ecoNxt!).getByText('NXT', { selector: '[data-chip="nxt"]' })).toBeInTheDocument();
    expect(within(kakao!).getByText('요청 변환')).toBeInTheDocument();
  });

  it('행 클릭 = onOpen(isin, ex)', () => {
    const { onOpen } = renderEntry();
    fireEvent.click(screen.getAllByRole('row')[2]!);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('KR7101360006', 'NXT');
    fireEvent.click(screen.getByRole('button', { name: '삼성전자 KRX 열기' }));
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onOpen).toHaveBeenLastCalledWith('KR7005930003', 'KRX');
  });

  it('캡션 「약 2분」', () => {
    renderEntry();
    expect(screen.getByText('목록에 없는 종목은 위 검색으로 — 그 종목만 변환해서 열어요(약 2분)')).toBeInTheDocument();
  });

  it('빈 목록 = 「이 날짜 격자 종목이 없어요」', () => {
    renderEntry({ rows: [] });
    expect(screen.getByText('이 날짜 격자 종목이 없어요')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('오늘 목록 — 「오늘 종목」 · 「라이브」 칩 · 캡션 없음', () => {
    const today: TickTodayRow[] = [
      { isin: 'KR7005930003', code: '005930', name: '삼성전자', sources: ['accum'], rate: 1.1, high_rate: 3.2 },
      { isin: 'KR7101360006', code: '101360', name: '에코앤드림', sources: ['up15'], rate: 20, high_rate: 29.9 },
    ];
    renderEntry({ todayRows: today });
    expect(screen.getByRole('heading', { name: '오늘 종목' })).toBeInTheDocument();
    expect(screen.getAllByText('라이브')).toHaveLength(2);
    expect(names()[0]).toBe('KR7101360006:KRX');
    expect(screen.queryByText(/목록에 없는 종목은/)).toBeNull();
  });
});
