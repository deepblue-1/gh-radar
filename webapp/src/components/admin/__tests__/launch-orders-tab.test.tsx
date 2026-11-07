import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import type { LaunchHeadRow, LaunchOrdersResponse, LaunchPieceQueue, LaunchPieceRow } from '@gh-radar/shared';

import { LaunchHeadCard, LaunchOrdersView, type LaunchOrdersViewProps } from '../launch-orders-tab';

/**
 * Phase 35 (35-06) — 주문 내역 탭 순수 렌더 `LaunchOrdersView` (D-12 · D-13 · D-02 · 채택 목업 변형 A).
 *
 * 잠그는 것: 16:00 카드 = 고른 서버 2장(LAUNCH_ORDER 순 · quick-261107-iep 서버별) · 서버 라벨 · 출처 칩 · 빈 카드 문구 · 학습 → 다음 오프셋 · 계좌 마스킹 없음 · 결과 알약 tone/토큰 ·
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
    gw: 'KB120',
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
  it('KB120 카드 2장(코스닥 → 코스피) · 빈 카드 문구 · 학습 → 다음 오프셋', () => {
    const { container } = view();
    const cards = cardsOf(container);
    expect(cards.map((c) => `${c.dataset.gateway}|${c.dataset.market}`)).toEqual(['KB120|Q', 'KB120|K']);
    expect(cards[1]).toHaveTextContent('KB120 코스피 · 이 날 발사 없음');
    expect(cards[0]).toHaveTextContent('3조각 · Q16');
    expect(cards[0]).toHaveTextContent(`학습 → 다음 오프셋${M}146 → ${M}151 · 다음 ${M}337µs (step 5)`);
    expect(cards[0]).not.toHaveTextContent('다음 발사 계획 첫 조각');
    expect(cards[0]).toHaveTextContent('접수 1101 1기타 1');
  });

  it('학습값 없는 Q16 머리(Phase 43 뒤 · next −350) → 「다음 발사 계획 첫 조각 · −350µs」 · 09:00:30 카드 무변경 (D-32)', () => {
    const resp: LaunchOrdersResponse = {
      ...RESP,
      heads: [head({ gateway: 'KB120', market: 'Q', offset_used_us: -350, next_offset_us: -350 }), RESP.heads[1]!],
    };
    const { container, unmount } = view({ resp });
    const card = cardsOf(container)[0]!;
    expect(card).toHaveTextContent(`다음 발사 계획 첫 조각${M}350µs`);
    expect(card).not.toHaveTextContent('학습 → 다음 오프셋');
    unmount();

    const { container: n } = view({ resp, fire: 'n0930' });
    const nCard = cardsOf(n)[0]!;
    expect(nCard).toHaveTextContent(`다음 오프셋고정 ${M}245µs`);
    expect(nCard).not.toHaveTextContent('다음 발사 계획 첫 조각');
  });

  it('조각 표 — 계좌 그대로 · 접수 시각 · 결과 알약 tone/토큰 · null 칸 「—」', () => {
    const { container } = view();
    const table = groupOf(container, 'KB120', 'Q');
    expect(table).toHaveTextContent('KB120 코스닥3조각 · wire 순');
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
    expect(cardsOf(container)[1]).toHaveTextContent('KB120 코스피 · 이 날 발사 없음');
  });

  it('교보119 의 09:00:30 은 그 날 발사 없음 — 빈 카드 2장 · 묶음 0', () => {
    const { container } = view({ fire: 'n0930', gw: 'KYOBO119' });
    expect(cardsOf(container).map((c) => c.textContent)).toEqual([
      '교보119 코스닥 · 이 날 발사 없음',
      '교보119 코스피 · 이 날 발사 없음',
    ]);
    expect(container.querySelectorAll('[data-slot="launch-group"]')).toHaveLength(0);
  });
});

describe('LaunchOrdersView — 서버별(quick-261107-iep · 기존 기록 보존)', () => {
  it('KB120 — 카드 · 묶음은 KB120 만 · 교보 조각은 없다 · 출처 칩 「KB120 저널 80 · 16:00:01 적재」', () => {
    const { container } = view();
    expect(container.querySelectorAll('[data-slot="launch-group"]')).toHaveLength(1);
    expect(groupOf(container, 'KB120', 'Q')).not.toBeNull();
    expect(container.querySelector('[data-gateway="KYOBO119"]')).toBeNull();
    expect(container.querySelector('[data-slot="launch-source"]')).toHaveTextContent(/^KB120 저널 80 · 16:00:01 적재$/);
  });

  it('KYOBO119 — 옛 교보 기록이 교보119 칩에서 그대로(카드 1조각 · 묶음) · 코스피 빈 카드 · 출처 칩', () => {
    const { container } = view({ gw: 'KYOBO119' });
    const cards = cardsOf(container);
    expect(cards.map((c) => `${c.dataset.gateway}|${c.dataset.market}`)).toEqual(['KYOBO119|Q', 'KYOBO119|K']);
    expect(cards[0]).toHaveTextContent('교보119 코스닥1조각 · Q16');
    expect(cards[0]).toHaveTextContent('접수 1101 0기타 0');
    expect(cards[1]).toHaveTextContent('교보119 코스피 · 이 날 발사 없음');
    const groups = Array.from(container.querySelectorAll<HTMLElement>('[data-slot="launch-group"]'));
    expect(groups.map((g) => `${g.dataset.gateway}|${g.dataset.market}`)).toEqual(['KYOBO119|Q']);
    expect(groups[0]).toHaveTextContent('교보119 코스닥1조각 · wire 순');
    expect(within(groups[0]!).getAllByRole('row').slice(1)[0]).toHaveTextContent('Q153740001 · j0');
    expect(container.querySelector('[data-slot="launch-source"]')).toHaveTextContent(/^KYOBO119 저널 80 · 16:00:01 적재$/);
  });

  it('KYOBO112 — 빈 카드 2장 · 묶음 0 · 「이 날은 발사가 없어요」 아님(그 날 다른 서버 발사가 있다)', () => {
    const { container } = view({ gw: 'KYOBO112' });
    expect(cardsOf(container).map((c) => c.textContent)).toEqual([
      '교보112 코스닥 · 이 날 발사 없음',
      '교보112 코스피 · 이 날 발사 없음',
    ]);
    expect(cardsOf(container).every((c) => c.dataset.empty === 'true')).toBe(true);
    expect(container.querySelectorAll('[data-slot="launch-group"]')).toHaveLength(0);
    expect(screen.queryByText('이 날은 발사가 없어요')).toBeNull();
  });

  it('09:00:30 출처 칩 = 「<서버키> 저널 80 · 09:00:31 적재」', () => {
    const { container } = view({ fire: 'n0930', gw: 'KYOBO112' });
    expect(container.querySelector('[data-slot="launch-source"]')).toHaveTextContent(/^KYOBO112 저널 80 · 09:00:31 적재$/);
  });

  it('날짜 내비는 서버와 무관하게 응답 날짜 목록 그대로', () => {
    const { props } = view({ gw: 'KYOBO112', d: '20261026' });
    // 응답 dates = [20261026, 20261023] — 그 서버 발사가 없어도 이전 날(10/23)로 갈 수 있다(서버별로 좁히지 않는다).
    fireEvent.click(screen.getByRole('button', { name: '이전 보고서' }));
    expect(props.onGoDate).toHaveBeenCalledWith('20261023');
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

describe('LaunchHeadCard — 뒤탐침 표기(35 IN-02)', () => {
  const model = {
    gateway: 'KB120',
    market: 'Q',
    title: 'KB120 코스닥',
    count: 10,
    counts: { ok: 3, bad: 7, other: 0 },
    probes: 3,
    badLabel: '101',
    offset: `${M}332µs`,
    fire: 'q16',
    gate: `${M}360 ~ ${M}350`,
    learnLabel: '다음 발사 계획 첫 조각',
    learn: '—',
  } as const;

  it('실조각 수 + 「· 탐침 n」 따로 · 탐침 0 이면 없음', () => {
    const { container, rerender } = render(<LaunchHeadCard gateway="KB120" market="Q" model={model} />);
    expect(container).toHaveTextContent('10조각 · Q16 · 탐침 3');
    rerender(<LaunchHeadCard gateway="KB120" market="Q" model={{ ...model, probes: 0 }} />);
    expect(container.querySelector('[data-slot="launch-card-probes"]')).toBeNull();
    expect(container).toHaveTextContent('10조각 · Q16');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// quick-261103-pei — 대기열 열(목업 027 변형 A)
// ─────────────────────────────────────────────────────────────────────────────

const QV = (over: Partial<LaunchPieceQueue>): LaunchPieceQueue => ({
  kind: 'queue',
  matched: true,
  rank: null,
  ahead_n: null,
  ahead_qty: null,
  ahead_amt: null,
  end_state: null,
  end_n: null,
  end_qty: null,
  end_amt: null,
  fill_qty: null,
  fill_px_min: null,
  fill_px_max: null,
  order_est: false,
  ...over,
});

describe('LaunchOrdersView — 대기열 열(quick-261103-pei)', () => {
  const Q16_ROWS: LaunchPieceRow[] = [
    piece({
      gateway: 'KB120', market: 'Q', wire: 0, sent_rel_us: -332, result: '접수', qty: 16666,
      queue: QV({ rank: 9, ahead_qty: 68808, ahead_amt: 177_180_600, end_state: 'open', end_n: 4, end_qty: 30560, end_amt: 78_692_000 }),
    }),
    piece({
      gateway: 'KB120', market: 'Q', wire: 1, sent_rel_us: -330, result: '접수', qty: 7766,
      queue: QV({ rank: 20, ahead_qty: 177272, ahead_amt: 456_475_400, end_state: 'cancelled' }),
    }),
    piece({ gateway: 'KB120', market: 'Q', wire: 2, sent_rel_us: -329, result: '101', queue: null }),
    piece({ gateway: 'KB120', market: 'Q', wire: 3, sent_rel_us: -328, result: '접수' }), // 옛 RPC — queue 키 없음
  ];

  it('16:00 — 머리글 「대기열 (접수 때 · 마감 때)」 이 주문번호 뒤 마지막 · 두 줄 · 추정 줄 var(--vi) · 값 없으면 「—」', () => {
    const { container } = view({ resp: { ...RESP, heads: [], pieces: Q16_ROWS } });
    const table = groupOf(container, 'KB120', 'Q');
    const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads.slice(-2)).toEqual(['주문번호', '대기열 (접수 때 · 마감 때)']);
    const cells = Array.from(table.querySelectorAll<HTMLElement>('[data-slot="launch-queue-cell"]'));
    expect(cells).toHaveLength(4);
    expect(cells[0]).toHaveTextContent('9번째 · 앞 68,808주 · 1.77억마감 앞 4건 · 30,560주 · 7,869만 (추정)');
    const sub0 = cells[0]!.querySelector<HTMLElement>('[data-slot="launch-queue-sub"]')!;
    expect(sub0.className).toContain('text-[var(--vi)]');
    expect(cells[1]).toHaveTextContent('20번째 · 앞 177,272주 · 4.56억마감 — 취소됨');
    expect(cells[1]!.querySelector<HTMLElement>('[data-slot="launch-queue-sub"]')!.className).toContain('--muted-fg');
    expect(cells[2]).toHaveTextContent(/^—$/);
    expect(cells[3]).toHaveTextContent(/^—$/);
  });

  it('09:00:30 — 머리글 「체결 순번」 · 체결 / 미체결(빨강) 두 줄', () => {
    const rows: LaunchPieceRow[] = [
      piece({
        gateway: 'KB120', market: 'Q', ...N, wire: 1, sent_rel_us: -20143, result: '접수', qty: 20,
        queue: QV({ kind: 'run', rank: 2, ahead_n: 1, ahead_qty: 2, ahead_amt: 318_000, fill_qty: 18, fill_px_min: 159_300, fill_px_max: 160_100 }),
      }),
      piece({
        gateway: 'KB120', market: 'Q', ...N, wire: 2, sent_rel_us: -20140, result: '접수', qty: 22,
        queue: QV({ kind: 'run', rank: null, ahead_n: 1, ahead_qty: 4861, ahead_amt: 1_081_572_500, fill_qty: 0 }),
      }),
    ];
    const { container } = view({ resp: { ...RESP, heads: [], pieces: rows }, fire: 'n0930' });
    const table = groupOf(container, 'KB120', 'Q');
    expect(within(table).getAllByRole('columnheader').at(-1)).toHaveTextContent('체결 순번');
    const cells = Array.from(table.querySelectorAll<HTMLElement>('[data-slot="launch-queue-cell"]'));
    expect(cells[0]).toHaveTextContent('2번째 체결 · 앞 2주 · 32만체결 18/20 @ 159,300~160,100');
    expect(cells[1]).toHaveTextContent('미체결 · 앞선 1건이 한도 안 4,861주 · 10.82억 가져감적어도 2번째 이후');
    expect(cells[1]!.querySelector('b')!.className).toContain('--launch-bad');
  });
});
