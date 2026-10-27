import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import type { LaunchHeadRow, LaunchOrdersResponse, LaunchPieceRow } from '@gh-radar/shared';

import { LaunchOrdersView, type LaunchOrdersViewProps } from '../launch-orders-tab';

/**
 * Phase 35 (35-06) — 주문 내역 탭 순수 렌더 `LaunchOrdersView` (D-12 · D-13 · D-02 · 채택 목업 변형 A).
 *
 * 잠그는 것: 16:00 카드 4장 순서(LAUNCH_ORDER) · 빈 카드 문구 · 학습 → 다음 오프셋 · 계좌 마스킹 없음 · 결과 알약 tone/토큰 ·
 * 09:00:30 전환 시 「발사」 · 「재전송」 열 · 「A 09:00:27 KRX→」 · 「09:00:30.046」(8자리 패딩) · 「고정 −245µs」 · null 칸 「—」 ·
 * 빈 상태 3종(이력 0 · 행 없는 날 → 최신 보기 · 오류 → 다시 시도). 값은 e2e 픽스처와 같은 꼴(합성 계좌 · 가짜 값).
 */

const M = '−';

function piece(over: Partial<LaunchPieceRow> & Pick<LaunchPieceRow, 'gateway' | 'market' | 'wire' | 'sent_rel_us' | 'result'>): LaunchPieceRow {
  return {
    trade_date: '20261026',
    profile: 'Q16',
    fire_exchange: 'KRX',
    fire_base: '16:00:00',
    side: null,
    queued_id: null,
    piece_idx: null,
    round: null,
    probe: null,
    order_no: null,
    result_code: null,
    accept_time: null,
    retry: null,
    abandoned: null,
    isin: null,
    price: null,
    qty: null,
    filled_qty: null,
    account: null,
    dma_user_id: null,
    source: 'backfill',
    journal_epoch: null,
    seq: null,
    gw_time_ms: null,
    stock_code: null,
    stock_name: null,
    ...over,
  };
}

function head(over: Partial<LaunchHeadRow> & Pick<LaunchHeadRow, 'gateway' | 'market'>): LaunchHeadRow {
  return {
    trade_date: '20261026',
    profile: 'Q16',
    fire_exchange: 'KRX',
    fire_base: '16:00:00',
    offset_used_us: null,
    fire_at_us: null,
    n_pieces: null,
    n_accepted: null,
    n_reject: null,
    n_other: null,
    first_accept_idx: null,
    retries: null,
    abandoned: null,
    gate_lo_us: null,
    gate_hi_us: null,
    nonmono: null,
    correction_before_us: null,
    correction_after_us: null,
    step_us: null,
    last_dir: null,
    bracketed: null,
    same_dir_run: null,
    reject_span_us: null,
    jump: null,
    one_way_us: null,
    rtt_min_us: null,
    next_offset_us: null,
    source: 'journal',
    journal_epoch: null,
    seq: null,
    gw_time_ms: null,
    ...over,
  };
}

const N = { profile: 'N', fire_exchange: 'NXT', fire_base: '09:00:30', queued_id: 'N' } as const;

const RESP: LaunchOrdersResponse = {
  dates: ['20261026', '20261023'],
  date: '20261026',
  heads: [
    head({ gateway: 'KB120', market: 'Q', offset_used_us: -332, correction_before_us: -146, correction_after_us: -151, step_us: 5, next_offset_us: -337 }),
    head({ gateway: 'KB120', market: 'Q', ...N, offset_used_us: -245, next_offset_us: -245 }),
  ],
  pieces: [
    piece({
      gateway: 'KB120', market: 'Q', wire: 0, queued_id: 'Q153015001', piece_idx: 0, round: 0, sent_rel_us: -332, result: '접수',
      isin: 'KR7005930003', stock_name: '삼성전자', stock_code: '005930', side: 'buy', price: 12680, qty: 150, filled_qty: 150,
      account: '1234567801', dma_user_id: 'e2e-user', order_no: '3404000288', accept_time: 155959999,
    }),
    piece({ gateway: 'KB120', market: 'Q', wire: 1, queued_id: 'Q153309001', piece_idx: 0, sent_rel_us: -330, result: '101' }),
    piece({ gateway: 'KB120', market: 'Q', wire: 2, queued_id: 'Q153343001', piece_idx: 0, sent_rel_us: -329, result: '기타' }),
    piece({ gateway: 'KYOBO119', market: 'Q', wire: 0, queued_id: 'Q153740001', piece_idx: 0, sent_rel_us: -521, result: '접수' }),
    piece({ gateway: 'KB120', market: 'Q', ...N, wire: 0, piece_idx: 0, sent_rel_us: -20148, result: '101', retry: 2, accept_time: 90030046 }),
    piece({ gateway: 'KB120', market: 'Q', ...N, wire: 1, piece_idx: 1, sent_rel_us: -20143, result: '101', retry: 1, accept_time: 90030007 }),
    piece({ gateway: 'KB120', market: 'Q', profile: 'A', fire_exchange: 'KRX', fire_base: '09:00:27', queued_id: 'A', wire: 0, piece_idx: 0, side: 'buy', sent_rel_us: -1200, result: '접수' }),
    piece({ gateway: 'KB120', market: 'Q', profile: 'A', fire_exchange: 'NXT', fire_base: '09:00:30', queued_id: 'A', wire: 0, piece_idx: 0, side: 'sell', sent_rel_us: -20139, result: '101' }),
  ],
};

function view(over: Partial<LaunchOrdersViewProps> = {}) {
  const props: LaunchOrdersViewProps = {
    resp: RESP,
    fire: 'q16',
    d: null,
    onGoDate: vi.fn(),
    onFire: vi.fn(),
    onLatest: vi.fn(),
    onRetry: vi.fn(),
    ...over,
  };
  return { props, ...render(<LaunchOrdersView {...props} />) };
}

const cardsOf = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('[data-slot="launch-head-card"]'));
const groupOf = (c: HTMLElement, gw: string, mk: string) =>
  c.querySelector<HTMLElement>(`[data-slot="launch-group"][data-gateway="${gw}"][data-market="${mk}"]`)!;

describe('LaunchOrdersView — 16:00 예약', () => {
  it('카드 4장 LAUNCH_ORDER 순 · 빈 카드 문구 · 학습 → 다음 오프셋', () => {
    const { container } = view();
    const cards = cardsOf(container);
    expect(cards.map((c) => `${c.dataset.gateway}|${c.dataset.market}`)).toEqual(['KB120|Q', 'KB120|K', 'KYOBO119|Q', 'KYOBO119|K']);
    expect(cards[1]).toHaveTextContent('KB 코스피 · 이 날 발사 없음');
    expect(cards[3]).toHaveTextContent('교보 코스피 · 이 날 발사 없음');
    expect(cards[0]).toHaveTextContent('3조각 · Q16');
    expect(cards[0]).toHaveTextContent(`${M}146 → ${M}151 · 다음 ${M}337µs (step 5)`);
    expect(cards[0]).toHaveTextContent('접수 1101 1기타 1');
  });

  it('조각 표 — 계좌 그대로 · 접수 시각 · 결과 알약 tone/토큰 · null 칸 「—」', () => {
    const { container } = view();
    const table = groupOf(container, 'KB120', 'Q');
    expect(table).toHaveTextContent('KB 코스닥3조각 · wire 순');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('1234567801');
    expect(rows[0]).toHaveTextContent('e2e-user');
    expect(rows[0]).toHaveTextContent('15:59:59.999');
    expect(rows[0]).toHaveTextContent('Q153015001 · j0 · R0');
    expect(rows[0]).toHaveTextContent('매수');
    expect(rows[0]).toHaveTextContent('12,680');
    expect(rows[0]).toHaveTextContent('150/150');
    const pills = table.querySelectorAll<HTMLElement>('[data-slot="launch-result"]');
    expect(Array.from(pills).map((p) => p.dataset.tone)).toEqual(['ok', 'bad', 'other']);
    expect(pills[0]!.className).toContain('--launch-ok');
    expect(pills[1]!.className).toContain('--launch-bad');
    expect(pills[2]!.className).toContain('--launch-other');
    const nullCells = within(rows[1]!).getAllByText('—');
    expect(nullCells.length).toBeGreaterThanOrEqual(7);
    expect(within(table).queryByRole('columnheader', { name: '발사' })).toBeNull();
  });
});

describe('LaunchOrdersView — 09:00:30 개장차익', () => {
  it('발사 · 재전송 열 · 두 다리 · 8자리 패딩 · 고정 다음 오프셋', () => {
    const { container } = view({ fire: 'n0930' });
    const table = groupOf(container, 'KB120', 'Q');
    expect(within(table).getByRole('columnheader', { name: '발사' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: '재전송' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: '키 · idx' })).toBeInTheDocument();
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent('A 09:00:27 KRX→');
    expect(rows[1]).toHaveTextContent('A NXT');
    expect(rows[1]).toHaveTextContent('매도');
    expect(rows[2]).toHaveTextContent('N NXT');
    expect(rows[2]).toHaveTextContent('09:00:30.046');
    expect(rows[2]).toHaveTextContent('N · idx0');
    const card = cardsOf(container)[0]!;
    expect(card).toHaveTextContent('4조각 · N·A');
    expect(card).toHaveTextContent(`고정 ${M}245µs`);
    expect(card).toHaveTextContent('재전송3회');
    expect(card).toHaveTextContent('거부 3');
    expect(cardsOf(container)[2]).toHaveTextContent('교보 코스닥 · 이 날 발사 없음');
  });
});

describe('LaunchOrdersView — 빈 상태 · 오류', () => {
  it('dates [] → 이력 0 문구', () => {
    view({ resp: { dates: [], date: null, heads: [], pieces: [] } });
    expect(screen.getByText('아직 적재된 발사가 없어요 · 첫 적재는 16:00:01')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot="launch-head-card"]')).toHaveLength(0);
  });

  it('행 없는 날 → 「이 날은 발사가 없어요」 + 최신 보기', () => {
    const { props } = view({ d: '20261024', resp: { dates: RESP.dates, date: '20261024', heads: [], pieces: [] } });
    expect(screen.getByText('이 날은 발사가 없어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '최신 보기' }));
    expect(props.onLatest).toHaveBeenCalledTimes(1);
  });

  it('오류 → 「발사 기록을 불러오지 못했어요」 + 다시 시도', () => {
    const { props } = view({ status: 'error', resp: null });
    expect(screen.getByRole('alert')).toHaveTextContent('발사 기록을 불러오지 못했어요');
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });

  it('세그먼트 → onFire', () => {
    const { props } = view();
    fireEvent.click(screen.getByRole('button', { name: '09:00:30 개장차익' }));
    expect(props.onFire).toHaveBeenCalledWith('n0930');
  });
});
