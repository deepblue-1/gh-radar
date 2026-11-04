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
  row({ isin: 'KR7005930003', name: '삼성전자', high_rate: 3.2, last_rate: 1.1, open_rate: 0.4, sources: ['accum'] }),
  row({ isin: 'KR7101360006', name: '에코앤드림', high_rate: 29.9, last_rate: 27.9, open_rate: 3.1, sources: ['accum', 'up15'] }),
  row({ isin: 'KR7101360006', name: '에코앤드림', exchange: 'NXT', high_rate: 15.6, last_rate: 13.6, open_rate: null, sources: ['up15'] }),
  row({ isin: 'KR7035720002', name: '카카오', high_rate: -0.9, last_rate: -2.0, open_rate: -1.5, sources: ['request'] }),
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
  it('패널 머리 「10/16 격자 종목」 · n종목 · 등락률순(종가 기준 내림차순)', () => {
    renderEntry();
    expect(screen.getByRole('heading', { name: '10/16 격자 종목' })).toBeInTheDocument();
    expect(screen.getByText(/^4종목/)).toBeInTheDocument();
    expect(names()).toEqual(['KR7101360006:KRX', 'KR7101360006:NXT', 'KR7005930003:KRX', 'KR7035720002:KRX']);
    const rates = screen.getAllByRole('row').slice(1).map((r) => r.querySelector('[data-slot="tick-entry-rate"] b')!.textContent);
    expect(rates).toEqual(['+27.9%', '+13.6%', '+1.1%', '−2.0%']);
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

describe('TickEntry — 팀 열 · 폰 한 줄 · 정렬 4종(스케치 023 B · quick 261103-j4d)', () => {
  const TEAM: TickGridRow[] = [
    row({
      isin: 'KR7101360006', name: '에코앤드림', high_rate: 29.9, sources: ['accum'],
      team_fills: 120, team_day_net_krw: -312_000_000, team_day_pnl_krw: 184_000_000, accum_pos_net_krw: 4_520_000_000,
    }),
    row({
      isin: 'KR7101360006', name: '에코앤드림', exchange: 'NXT', high_rate: 15.6,
      team_fills: 14, team_day_net_krw: 89_000_000, team_day_pnl_krw: -21_500_000, accum_pos_net_krw: 4_520_000_000,
    }),
    row({
      isin: 'KR7000660001', name: 'SK하이닉스', high_rate: 18.0, sources: ['request'],
      team_fills: 0, team_day_net_krw: null, team_day_pnl_krw: null, accum_pos_net_krw: null,
    }),
    // 옛 RPC 행 — 팀 키 없음
    row({ isin: 'KR7005930003', name: '삼성전자', high_rate: 3.2 }),
    // 팀이 거래했고 순매수 · 손익이 정확히 0
    row({
      isin: 'KR7035720002', name: '카카오', high_rate: -0.9,
      team_fills: 3, team_day_net_krw: 0, team_day_pnl_krw: 0, accum_pos_net_krw: 0,
    }),
  ];
  const cells = (r: HTMLElement) =>
    ['tick-entry-day-net', 'tick-entry-cum', 'tick-entry-pnl'].map((s) => r.querySelector(`[data-slot="${s}"]`) as HTMLElement);
  const rowOf = (isin: string, ex = 'KRX') =>
    screen.getAllByRole('row').find((r) => r.getAttribute('data-isin') === isin && r.getAttribute('data-ex') === ex)!;

  it('머리 3열(고가 뒤 · sm 이상) — 당일순매수 · 누적순매수 · 당일손익', () => {
    renderEntry({ rows: TEAM });
    const ths = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(ths.slice(0, 8)).toEqual(['종목', '등락률', '시가', '고가', '당일순매수', '누적순매수', '당일손익', '출처']);
    for (const name of ['당일순매수', '누적순매수', '당일손익']) {
      expect(screen.getByRole('columnheader', { name })).toHaveClass('hidden', 'sm:table-cell');
    }
  });

  it('3칸 텍스트 · 색 · 굵기 — 순매수 · 손익 굵게 · 누적 보통', () => {
    renderEntry({ rows: TEAM });
    const [net, cum, pnl] = cells(rowOf('KR7101360006'));
    expect([net!.textContent, cum!.textContent, pnl!.textContent]).toEqual(['−3.12억', '+45.2억', '+1.84억']);
    expect(net).toHaveClass('text-[var(--down)]', 'font-bold', 'hidden', 'sm:table-cell');
    expect(cum).toHaveClass('text-[var(--up)]');
    expect(cum).not.toHaveClass('font-bold');
    expect(pnl).toHaveClass('text-[var(--up)]', 'font-bold');
    const [nNet, , nPnl] = cells(rowOf('KR7101360006', 'NXT'));
    expect(nNet!.textContent).toBe('+8,900만');
    expect(nPnl!.textContent).toBe('−2,150만');
    expect(nPnl).toHaveClass('text-[var(--down)]');
  });

  it('모름 「—」(팀 체결 없음 · 미등록 · 옛 RPC 행) · 0 「0」 — 둘 다 muted', () => {
    renderEntry({ rows: TEAM });
    for (const isin of ['KR7000660001', 'KR7005930003']) {
      const cs = cells(rowOf(isin));
      expect(cs.map((c) => c.textContent)).toEqual(['—', '—', '—']);
      for (const c of cs) expect(c).toHaveClass('text-[var(--muted-fg)]');
    }
    const zero = cells(rowOf('KR7035720002'));
    expect(zero.map((c) => c.textContent)).toEqual(['0', '0', '0']);
    for (const c of zero) expect(c).toHaveClass('text-[var(--muted-fg)]');
  });

  it('폰 한 줄 — 「순매수 … · 누적 … · 손익 …」 · sm:hidden', () => {
    renderEntry({ rows: TEAM });
    const line = rowOf('KR7101360006').querySelector('[data-slot="tick-entry-team-line"]') as HTMLElement;
    expect(line.textContent).toBe('순매수 −3.12억 · 누적 +45.2억 · 손익 +1.84억');
    expect(line).toHaveClass('sm:hidden');
    expect(within(line).getByText('−3.12억')).toHaveClass('text-[var(--down)]', 'font-bold');
    expect(within(line).getByText('+45.2억')).toHaveClass('text-[var(--up)]');
    expect(within(line).getByText('+45.2억')).not.toHaveClass('font-bold');
    expect(within(line).getByText('+1.84억')).toHaveClass('text-[var(--up)]', 'font-bold');
  });

  it('오늘 목록 — 키 없는 옛 RPC 행은 3칸 · 폰 줄 모두 「—」', () => {
    const today: TickTodayRow[] = [
      { isin: 'KR7005930003', code: '005930', name: '삼성전자', sources: ['accum'], rate: 1.1, high_rate: 3.2 },
    ];
    renderEntry({ todayRows: today });
    const r = rowOf('KR7005930003');
    expect(cells(r).map((c) => c.textContent)).toEqual(['—', '—', '—']);
    expect(r.querySelector('[data-slot="tick-entry-team-line"]')!.textContent).toBe('순매수 — · 누적 — · 손익 —');
  });

  it('오늘 목록 — 매집감지 kind 16 키가 있으면 당일순매수 · 누적순매수 · 폰 줄에 값', () => {
    const today: TickTodayRow[] = [
      {
        isin: 'KR7101360006', code: '101360', name: '에코앤드림', sources: ['accum'], rate: 22.1, high_rate: 29.9,
        team_day_net_krw: 450_000_000, accum_pos_net_krw: 4_520_000_000,
      },
    ];
    renderEntry({ todayRows: today });
    const [net, cum] = cells(rowOf('KR7101360006'));
    expect([net!.textContent, cum!.textContent]).toEqual(['+4.50억', '+45.2억']);
    expect(net).toHaveClass('text-[var(--up)]', 'font-bold');
    const line = rowOf('KR7101360006').querySelector('[data-slot="tick-entry-team-line"]') as HTMLElement;
    expect(within(line).getByText('+4.50억')).toBeInTheDocument();
    expect(within(line).getByText('+45.2억')).toBeInTheDocument();
  });

  const TODAY_ECO: TickTodayRow = {
    isin: 'KR7101360006', code: '101360', name: '에코앤드림', sources: ['accum'], rate: 22.1, high_rate: 29.9,
    team_day_net_krw: 450_000_000, accum_pos_net_krw: 4_520_000_000,
    team_day_buy_krw: 1_000_000_000, team_day_sell_krw: 550_000_000, team_day_avg_px: 10_000, team_day_net_qty: 50_000,
    accum_last_px: 12_000,
  };

  it('오늘 목록 — 추정 당일손익 「≈」 · 색 · 굵게 · 폰 줄', () => {
    renderEntry({ todayRows: [TODAY_ECO] });
    const r = rowOf('KR7101360006');
    const [, , pnl] = cells(r);
    expect(pnl!.textContent).toBe('≈+1.50억');
    expect(pnl).toHaveClass('text-[var(--up)]', 'font-bold');
    expect(r.querySelector('[data-slot="tick-entry-team-line"]')!.textContent).toBe(
      '순매수 +4.50억 · 누적 +45.2억 · 손익 ≈+1.50억',
    );
  });

  it('오늘 목록 툴팁 3종은 매집감지 실시간 문구 · 과거 행 툴팁은 그대로', () => {
    const { unmount } = renderEntry({ todayRows: [TODAY_ECO] });
    const [net, cum, pnl] = cells(rowOf('KR7101360006'));
    expect(net).toHaveAttribute('title', '팀 당일 순매수 — 매집감지 실시간(1분) · KRX+NXT 합산 · 우리 체결 제외');
    expect(cum).toHaveAttribute('title', '매집감지 등록 이후 팀 순매수(이월 포함) — 매집감지 실시간 · KRX+NXT 합산 · 우리 체결 제외');
    expect(pnl).toHaveAttribute(
      'title',
      '추정 — 매집감지 당일 매수·매도·평단 + 현재가 · KRX+NXT 합산 · 우리 체결 제외 · 장 마감 뒤 격자 값과 다를 수 있음',
    );
    unmount();
    renderEntry({ rows: TEAM });
    const [pNet, pCum, pPnl] = cells(rowOf('KR7101360006'));
    expect(pNet).toHaveAttribute('title', '팀 당일 순매수 — 그 거래소 팀만 · 상세 팀 거래정보 끝 틱 값');
    expect(pCum).toHaveAttribute('title', '매집감지 등록 이후 팀 순매수(이월 포함 · KRX+NXT 합산)');
    expect(pPnl).toHaveAttribute('title', '팀 당일 손익(실현+미실현) — 끝 틱 기준');
    expect(pPnl!.textContent).toBe('+1.84억');
  });

  it('오늘 목록 — 당일 매수 · 매도 0 이면 손익 「—」(≈ 없음)', () => {
    renderEntry({
      todayRows: [{ ...TODAY_ECO, team_day_net_krw: 0, team_day_buy_krw: 0, team_day_sell_krw: 0, team_day_avg_px: 0, team_day_net_qty: 0 }],
    });
    expect(cells(rowOf('KR7101360006'))[2]!.textContent).toBe('—');
  });

  it('오늘 손익순 — 추정값 내림차순 · 모름 뒤', () => {
    const today: TickTodayRow[] = [
      { ...TODAY_ECO, isin: 'KR7000000001', name: '가', team_day_sell_krw: 950_000_000, team_day_net_qty: 10_000 }, // −5천만+1.2억=+7천만
      { ...TODAY_ECO, isin: 'KR7000000002', name: '나' }, // +1.5억
      { isin: 'KR7000000003', code: '000003', name: '다', sources: ['up15'], rate: 16, high_rate: 17.5 }, // 모름
      { ...TODAY_ECO, isin: 'KR7000000004', name: '라', team_day_sell_krw: 100_000_000, team_day_net_qty: 90_000, accum_last_px: 9_000 }, // −9억+8.1억=−9천만
    ];
    renderEntry({ todayRows: today, sort: 'pnl' });
    expect(names()).toEqual(['KR7000000002:KRX', 'KR7000000001:KRX', 'KR7000000004:KRX', 'KR7000000003:KRX']);
  });

  it('순매수순 — 내림차순 · 값 없는 행 뒤(같으면 이름 → 거래소)', () => {
    renderEntry({ rows: TEAM, sort: 'net' });
    expect(names()).toEqual([
      'KR7101360006:NXT', // +8,900만
      'KR7035720002:KRX', // 0
      'KR7101360006:KRX', // −3.12억
      'KR7005930003:KRX', // 모름 — 이름순(삼성전자 · SK하이닉스)
      'KR7000660001:KRX',
    ]);
  });

  it('손익순 — 내림차순 · 값 없는 행 뒤', () => {
    renderEntry({ rows: TEAM, sort: 'pnl' });
    expect(names()).toEqual([
      'KR7101360006:KRX', // +1.84억
      'KR7035720002:KRX', // 0
      'KR7101360006:NXT', // −2,150만
      'KR7005930003:KRX',
      'KR7000660001:KRX',
    ]);
  });

  it('토글 4개 「등락률순 · 순매수순 · 손익순 · 이름순」 → onSort', () => {
    const { onSort } = renderEntry({ rows: TEAM });
    const group = screen.getByRole('group', { name: '정렬' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['등락률순', '순매수순', '손익순', '이름순']);
    fireEvent.click(screen.getByRole('button', { name: '순매수순' }));
    fireEvent.click(screen.getByRole('button', { name: '손익순' }));
    expect(onSort.mock.calls).toEqual([['net'], ['pnl']]);
  });
});

describe('TickEntry — 시가 · 고가 열 · 등락률 종가/현재가 기준 · 좁은 폭 보조 줄(quick 261104-n9h)', () => {
  const rowOf = (isin: string, ex = 'KRX') =>
    screen.getAllByRole('row').find((r) => r.getAttribute('data-isin') === isin && r.getAttribute('data-ex') === ex)!;
  const slot = (r: HTMLElement, s: string) => r.querySelector(`[data-slot="${s}"]`) as HTMLElement;
  const CQ_SHOW = /^@min-\[\d+px\]\/tlist:table-cell$/;
  const CQ_HIDE = /^@min-\[\d+px\]\/tlist:hidden$/;
  const hasClassLike = (el: HTMLElement, re: RegExp) => [...el.classList].some((c) => re.test(c));

  it('등락률순은 종가(last_rate) 기준 — 고가 순서와 달라도 종가로 정렬', () => {
    renderEntry({
      rows: [
        row({ isin: 'KR7000000001', name: '가', high_rate: 29.9, last_rate: 5.0 }),
        row({ isin: 'KR7000000002', name: '나', high_rate: 10.0, last_rate: 9.0 }),
        row({ isin: 'KR7000000003', name: '다', high_rate: 12.0, last_rate: null }),
      ],
    });
    expect(names()).toEqual(['KR7000000002:KRX', 'KR7000000001:KRX', 'KR7000000003:KRX']);
  });

  it('오늘 등락률은 현재가(rate) 기준 — 고가가 아니다', () => {
    const today: TickTodayRow[] = [
      { isin: 'KR7000000001', code: '000001', name: '가', sources: ['up15'], rate: 2.0, high_rate: 29.9 },
      { isin: 'KR7000000002', code: '000002', name: '나', sources: ['accum'], rate: 22.1, high_rate: 25.0, open_rate: 3.0 },
    ];
    renderEntry({ todayRows: today });
    expect(names()).toEqual(['KR7000000002:KRX', 'KR7000000001:KRX']);
    const r = rowOf('KR7000000002');
    expect(slot(r, 'tick-entry-rate').querySelector('b')!.textContent).toBe('+22.1%');
    expect(slot(r, 'tick-entry-open').textContent).toBe('+3.0%');
    expect(slot(r, 'tick-entry-high').textContent).toBe('+25.0%');
    // 키 없는 옛 RPC 행 — 시가 「—」
    expect(slot(rowOf('KR7000000001'), 'tick-entry-open').textContent).toBe('—');
  });

  it('시가 · 고가 칸 — 값 · 부호 색 · null 「—」 muted · 보통 굵기', () => {
    renderEntry();
    const eco = rowOf('KR7101360006');
    expect(slot(eco, 'tick-entry-open').textContent).toBe('+3.1%');
    expect(slot(eco, 'tick-entry-open')).toHaveClass('text-[var(--up)]', 'text-right', 'tabular-nums');
    expect(slot(eco, 'tick-entry-open')).not.toHaveClass('font-bold');
    expect(slot(eco, 'tick-entry-high').textContent).toBe('+29.9%');
    expect(slot(eco, 'tick-entry-high')).toHaveClass('text-[var(--up)]');
    const nxt = rowOf('KR7101360006', 'NXT');
    expect(slot(nxt, 'tick-entry-open').textContent).toBe('—');
    expect(slot(nxt, 'tick-entry-open')).toHaveClass('text-[var(--muted-fg)]');
    const kakao = rowOf('KR7035720002');
    expect(slot(kakao, 'tick-entry-open').textContent).toBe('−1.5%');
    expect(slot(kakao, 'tick-entry-open')).toHaveClass('text-[var(--down)]');
    expect(slot(kakao, 'tick-entry-high')).toHaveClass('text-[var(--down)]');
  });

  it('시가 · 고가 머리 · 칸은 카드 폭 문턱 미만에서 숨는다(hidden + 컨테이너 table-cell)', () => {
    renderEntry();
    for (const name of ['시가', '고가']) {
      const th = screen.getByRole('columnheader', { name });
      expect(th).toHaveClass('hidden');
      expect(hasClassLike(th, CQ_SHOW)).toBe(true);
    }
    for (const s of ['tick-entry-open', 'tick-entry-high']) {
      const td = slot(rowOf('KR7101360006'), s);
      expect(td).toHaveClass('hidden');
      expect(hasClassLike(td, CQ_SHOW)).toBe(true);
    }
  });

  it('등락률 칸 보조 두 줄 「시 … / 고 …」 — 문턱 이상에서 숨는 클래스 · 각 값 부호 색', () => {
    renderEntry();
    const line = slot(rowOf('KR7101360006'), 'tick-entry-oh-line');
    expect(hasClassLike(line, CQ_HIDE)).toBe(true);
    expect(line.children).toHaveLength(2);
    expect(line.children[0]!.textContent).toBe('시 +3.1%');
    expect(line.children[1]!.textContent).toBe('고 +29.9%');
    expect(within(line).getByText('+3.1%')).toHaveClass('text-[var(--up)]');
    const nxtLine = slot(rowOf('KR7101360006', 'NXT'), 'tick-entry-oh-line');
    expect(nxtLine.children[0]!.textContent).toBe('시 —');
    expect(within(nxtLine).getByText('—')).toHaveClass('text-[var(--muted-fg)]');
    const kakaoLine = slot(rowOf('KR7035720002'), 'tick-entry-oh-line');
    expect(within(kakaoLine).getByText('−0.9%')).toHaveClass('text-[var(--down)]');
  });

  it('툴팁 — 과거 = 종가 · 기준가 대비 / 오늘 = 현재가 · 시세 갱신 종목만', () => {
    const { unmount } = renderEntry();
    const eco = rowOf('KR7101360006');
    expect(slot(eco, 'tick-entry-rate')).toHaveAttribute('title', '그날 종가(마지막 체결) 기준 · 기준가 대비');
    expect(slot(eco, 'tick-entry-open').getAttribute('title')).toMatch(/— 기준가 대비$/);
    expect(slot(eco, 'tick-entry-high').getAttribute('title')).toMatch(/— 기준가 대비$/);
    unmount();
    renderEntry({
      todayRows: [{ isin: 'KR7000000002', code: '000002', name: '나', sources: ['accum'], rate: 22.1, high_rate: 25.0 }],
    });
    const t = rowOf('KR7000000002');
    expect(slot(t, 'tick-entry-rate')).toHaveAttribute('title', '현재가 기준 · 기준가 대비');
    expect(slot(t, 'tick-entry-open').getAttribute('title')).toMatch(/— 시세 갱신 종목만\(아니면 —\)$/);
    expect(slot(t, 'tick-entry-high').getAttribute('title')).toMatch(/— 시세 갱신 종목만\(아니면 —\)$/);
  });
});
