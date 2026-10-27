import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PnlGroup, PnlReport } from '@gh-radar/shared';

import { PnlPeriodControl, PnlReportView, pnlStockLabelOf } from '../pnl-report';

/*
  Phase 36-08 Task 1 — 일자별 매매손익 공통 부품(UI-SPEC ⑤ 공통 부품 1~7 · D-18).
  픽스처 = 2일 · 종목 3(이름 있음 · 이름 없음 → 코드 · 둘 다 없음 → ISIN) · 수익/손실 섞음.
*/

const GROUP: PnlGroup = {
  key: '1111150701',
  accounts: [{ broker: 'KB', gateway: 'KB120', account_no: '1111150701' }],
  dma_user_ids: [],
  account_name: null,
  total: { pnl: 1_234_567, fee: 16_400, tax: 33_000, buy: 15_000_000, sell: 16_400_000, fills: 9 },
  days: [
    {
      date: '2026-10-27',
      pnl: 1_246_912,
      fee: 12_000,
      tax: 33_000,
      buy: 14_000_000,
      sell: 16_400_000,
      fills: 7,
      stocks: [
        { isin: 'KR7005930003', code: '005930', name: '삼성전자', pnl: 1_259_257, buy: 7_500_000, sell: 8_200_000, fills: 3 },
        { isin: 'KR7999999990', code: null, name: null, pnl: -12_345, buy: 6_500_000, sell: 8_200_000, fills: 4 },
      ],
    },
    {
      date: '2026-10-26',
      pnl: -12_345,
      fee: 4_400,
      tax: 0,
      buy: 1_000_000,
      sell: 0,
      fills: 2,
      stocks: [{ isin: 'KR7000660001', code: '000660', name: null, pnl: -12_345, buy: 1_000_000, sell: 0, fills: 2 }],
    },
  ],
};

const REPORT: PnlReport = { from: '2026-09-28', to: '2026-10-27', groups: [GROUP] };

function view(over: Partial<Parameters<typeof PnlReportView>[0]> = {}) {
  const onRetry = vi.fn();
  render(<PnlReportView status="ready" report={REPORT} rangeLabel="30일" onRetry={onRetry} {...over} />);
  return { onRetry };
}

const days = () => Array.from(document.querySelectorAll('[data-slot="pnl-day"]')) as HTMLElement[];
const dayButton = (i: number) => within(days()[i]!).getAllByRole('button')[0]!;

describe('PnlReportView — data (E5 populated)', () => {
  it('요약 행: 「30일 실현손익」 · 「+123만」 --up · 수수료 「1.6만」 · 세금 「3.3만」 · 매수 · 매도 만원 내림 · 「9건」', () => {
    view();
    const summary = document.querySelector('[data-slot="pnl-summary"]') as HTMLElement;
    expect(summary).toHaveTextContent('30일 실현손익');
    const pnl = summary.querySelector('[data-slot="pnl-summary-pnl"] [data-tone]') as HTMLElement;
    expect(pnl).toHaveTextContent('+123만');
    expect(pnl.className).toContain('text-[var(--up)]');
    expect(summary.querySelector('[data-slot="pnl-summary-fee"]')).toHaveTextContent('1.6만');
    expect(summary.querySelector('[data-slot="pnl-summary-tax"]')).toHaveTextContent('3.3만');
    expect(summary.querySelector('[data-slot="pnl-summary-buy"]')).toHaveTextContent('1,500만');
    expect(summary.querySelector('[data-slot="pnl-summary-sell"]')).toHaveTextContent('1,640만');
    expect(summary.querySelector('[data-slot="pnl-summary-fills"]')).toHaveTextContent('9건');
    // 수수료 · 세금 · 매수 · 매도에는 방향색이 없다.
    expect(summary.querySelector('[data-slot="pnl-summary-fee"]')!.innerHTML).not.toContain('var(--up)');
  });

  it('일자 행: 최신 위 · 「10/27 (화)」 · 손실 「−1만」 --down · 폰 아랫줄 「매수 … · 매도 … · N건」 · 받은 일자만(2행)', () => {
    view();
    expect(days().map((d) => d.dataset.date)).toEqual(['2026-10-27', '2026-10-26']);
    expect(days()[0]!.querySelector('[data-slot="pnl-day-date"]')).toHaveTextContent('10/27 (화)');
    const loss = days()[1]!.querySelector('[data-slot="pnl-day-pnl"]') as HTMLElement;
    expect(loss).toHaveTextContent('−1만');
    expect(loss.className).toContain('text-[var(--down)]');
    expect(days()[0]!.querySelector('[data-slot="pnl-day-phone-line"]')).toHaveTextContent(
      '매수 1,400만 · 매도 1,640만 · 7건',
    );
  });

  it('펼침: 첫(최신) 행만 열림 · 두 번째 클릭 → 그 행도 열림(행마다 따로) · 다시 클릭 → 닫힘 · aria-controls 는 열렸을 때만', async () => {
    const user = userEvent.setup();
    view();
    expect(dayButton(0)).toHaveAttribute('aria-expanded', 'true');
    expect(dayButton(0)).toHaveAttribute('aria-controls');
    expect(dayButton(1)).toHaveAttribute('aria-expanded', 'false');
    expect(dayButton(1)).not.toHaveAttribute('aria-controls');
    expect(document.querySelectorAll('[data-slot="pnl-day-body"]')).toHaveLength(1);

    await user.click(dayButton(1));
    expect(dayButton(1)).toHaveAttribute('aria-expanded', 'true');
    expect(dayButton(0)).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelectorAll('[data-slot="pnl-day-body"]')).toHaveLength(2);

    await user.click(dayButton(1));
    expect(dayButton(1)).toHaveAttribute('aria-expanded', 'false');
  });

  it('펼침 본문: 요약 줄 「수수료 1.2만 · 세금 3.3만 · 체결 7건」 · 종목명 폴백 name → code → ISIN · 종목 손익색', async () => {
    const user = userEvent.setup();
    view();
    const body0 = days()[0]!.querySelector('[data-slot="pnl-day-body"]') as HTMLElement;
    expect(body0).toHaveTextContent('수수료 1.2만 · 세금 3.3만 · 체결 7건');
    const names0 = Array.from(body0.querySelectorAll('[data-slot="pnl-stock-name"]'));
    expect(names0.map((n) => n.textContent)).toEqual(['삼성전자', 'KR7999999990']);
    expect(names0[0]).toHaveAttribute('title', '삼성전자');
    const stockPnl = body0.querySelectorAll('[data-slot="pnl-stock-pnl"]');
    expect(stockPnl[0]).toHaveTextContent('+125만');
    expect(stockPnl[0]!.className).toContain('text-[var(--up)]');
    expect(stockPnl[1]!.className).toContain('text-[var(--down)]');

    await user.click(dayButton(1));
    const body1 = days()[1]!.querySelector('[data-slot="pnl-day-body"]') as HTMLElement;
    expect(body1.querySelector('[data-slot="pnl-stock-name"]')).toHaveTextContent('000660');
    expect(pnlStockLabelOf({ name: '', code: null, isin: 'KR7X' })).toBe('KR7X');
  });

  it('/me 꼴 — 머리 없는 카드 1장 · 어드민 꼴 — renderHeader 로 묶음 머리 · 첫 묶음만 첫 행 열림', () => {
    const view1 = render(<PnlReportView status="ready" report={REPORT} rangeLabel="30일" onRetry={() => {}} />);
    expect(document.querySelectorAll('[data-slot="pnl-group"]')).toHaveLength(1);
    expect(document.querySelector('[data-slot="pnl-group-head"]')).toBeNull();
    view1.unmount();

    const two: PnlReport = { ...REPORT, groups: [GROUP, { ...GROUP, key: '2222' }] };
    render(
      <PnlReportView
        status="ready"
        report={two}
        rangeLabel="30일"
        onRetry={() => {}}
        renderHeader={(g) => <span data-testid="head">{g.key}</span>}
      />,
    );
    expect(screen.getAllByTestId('head').map((h) => h.textContent)).toEqual(['1111150701', '2222']);
    const groups = document.querySelectorAll('[data-slot="pnl-group"]');
    expect(groups[0]!.querySelectorAll('[aria-expanded="true"]')).toHaveLength(1);
    expect(groups[1]!.querySelectorAll('[aria-expanded="true"]')).toHaveLength(0);
  });
});

describe('PnlReportView — empty · error · loading (E5)', () => {
  it('empty — 묶음 0 또는 전부 days 0 → 빈 상자 1개(제목 + 본문) · 카드 없음', () => {
    const a = render(<PnlReportView status="ready" report={{ ...REPORT, groups: [] }} rangeLabel="30일" onRetry={() => {}} />);
    const empty = document.querySelector('[data-slot="pnl-empty"]');
    expect(empty).toHaveTextContent('이 기간에는 체결이 없어요');
    expect(empty).toHaveTextContent('손익은 기록을 시작한 날부터 쌓여요 — 기간을 넓혀 보세요');
    a.unmount();

    render(
      <PnlReportView
        status="ready"
        report={{ ...REPORT, groups: [{ ...GROUP, days: [] }] }}
        rangeLabel="30일"
        onRetry={() => {}}
      />,
    );
    expect(document.querySelector('[data-slot="pnl-empty"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="pnl-group"]')).toBeNull();
  });

  it('error — role=alert 「매매손익을 불러오지 못했어요」 · 「다시 시도」 → onRetry', async () => {
    const { onRetry } = view({ status: 'error', report: null });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('매매손익을 불러오지 못했어요');
    await userEvent.click(within(alert).getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('loading — Skeleton 카드 aria-busy · aria-label 「불러오는 중」', () => {
    view({ status: 'loading', report: null });
    const loading = screen.getByLabelText('불러오는 중');
    expect(loading).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelector('[data-slot="pnl-group"]')).toBeNull();
  });
});

describe('PnlPeriodControl — 기간 세그먼트 + 「이달」 + 캡션', () => {
  it('30일 선택 · 캡션 「9/28 ~ 10/27」 · 「이달」 → onChange("month") · 「7일」 → "7" · 선택된 칸 재클릭 0회', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PnlPeriodControl range="30" onChange={onChange} from="2026-09-28" to="2026-10-27" />);
    const group = screen.getByRole('group', { name: '기간' });
    expect(within(group).getByRole('button', { name: '30일' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: '이달' })).toHaveAttribute('aria-pressed', 'false');
    expect(document.querySelector('[data-slot="pnl-range-caption"]')).toHaveTextContent('9/28 ~ 10/27');

    await user.click(within(group).getByRole('button', { name: '이달' }));
    expect(onChange).toHaveBeenLastCalledWith('month');
    await user.click(within(group).getByRole('button', { name: '7일' }));
    expect(onChange).toHaveBeenLastCalledWith('7');
    await user.click(within(group).getByRole('button', { name: '30일' }));
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
