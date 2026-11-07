import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import type { LaunchHeadRow, LaunchPieceQueueView, LaunchPieceRow } from '@gh-radar/shared';

import {
  MINUS,
  fireLegLabelOf,
  fmtAcceptTime,
  fmtEokMan,
  fmtUs,
  launchFireParamOf,
  launchGatewayParamOf,
  launchHeadCardOf,
  launchQueueCellOf,
  launchTabOf,
  orderTabPiecesOf,
  pieceKeyLabelOf,
  resultToneOf,
  serverMarketLabelOf,
  sideLabelOf,
} from '../launch-format';

/**
 * Phase 35 (35-06) — 발사 주문 내역 표기 · 카드 모델 골든 (D-12 · D-13 · 채택 목업 변형 A).
 *
 * 잠그는 것: µs 부호(U+2212) · 천 단위 · 접수 시각 9자리 패딩 · 발사 다리 라벨 · 키 열 · 서버 시장 라벨 · 세그먼트 거름/정렬 ·
 * 카드 모델(q16 머리 우선 · launchDaysOf 경계 폴백 · 학습 줄 / n0930 재전송 합 · 고정 다음 오프셋 · 「거부」).
 * 경계 폴백 픽스처 = shared `launch-pieces-1012-1026.json`(gh-trade 첨부 pieces.json) 실측. 09:00:30 조각은 첨부 로그
 * pieces120.txt 10/26 N 3줄 + 합성 A 두 다리 · 합성 N 머리.
 */

const M = MINUS;

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

interface RawPiece {
  date: string;
  broker: 'KB' | '교보';
  market: '코스피' | '코스닥';
  wire: number;
  q: string;
  j: number;
  rel: number;
  result: string;
}

const RAW = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../../../packages/shared/src/__fixtures__/launch-pieces-1012-1026.json'), 'utf8'),
) as RawPiece[];

/** 첨부 16:00 조각 — 그날 · 그 조합만. */
function attached(date: string, broker: 'KB' | '교보', market: '코스피' | '코스닥'): LaunchPieceRow[] {
  return RAW.filter((r) => r.date === date && r.broker === broker && r.market === market).map((r) =>
    piece({
      trade_date: r.date.replaceAll('-', ''),
      gateway: broker === 'KB' ? 'KB120' : 'KYOBO119',
      market: market === '코스피' ? 'K' : 'Q',
      wire: r.wire,
      queued_id: r.q,
      piece_idx: r.j,
      sent_rel_us: r.rel,
      result: r.result,
    }),
  );
}

/** 10/26 KB120 코스닥 09:00:30 — 로그 N 3줄(pieces120.txt) + 합성 A 두 다리. */
const N_KBQ: LaunchPieceRow[] = [
  piece({ gateway: 'KB120', market: 'Q', profile: 'N', fire_exchange: 'NXT', fire_base: '09:00:30', wire: 0, queued_id: 'N', piece_idx: 0, order_no: '3405000786', sent_rel_us: -20148, result: '101', retry: 2, accept_time: 90030092 }),
  piece({ gateway: 'KB120', market: 'Q', profile: 'N', fire_exchange: 'NXT', fire_base: '09:00:30', wire: 1, queued_id: 'N', piece_idx: 1, order_no: '3405000784', sent_rel_us: -20143, result: '101', retry: 1, accept_time: 90030025 }),
  piece({ gateway: 'KB120', market: 'Q', profile: 'N', fire_exchange: 'NXT', fire_base: '09:00:30', wire: 2, queued_id: 'N', piece_idx: 2, order_no: '3405000785', sent_rel_us: -20141, result: '101', retry: 1, accept_time: 90030060 }),
];
const A_KBQ: LaunchPieceRow[] = [
  piece({ gateway: 'KB120', market: 'Q', profile: 'A', fire_exchange: 'NXT', fire_base: '09:00:30', wire: 0, queued_id: 'A', piece_idx: 0, side: 'sell', sent_rel_us: -20139, result: '101' }),
  piece({ gateway: 'KB120', market: 'Q', profile: 'A', fire_exchange: 'KRX', fire_base: '09:00:27', wire: 0, queued_id: 'A', piece_idx: 0, side: 'buy', sent_rel_us: -1200, result: '접수', retry: 0 }),
];
const N_HEAD_KBQ = head({ gateway: 'KB120', market: 'Q', profile: 'N', fire_exchange: 'NXT', fire_base: '09:00:30', offset_used_us: -245, next_offset_us: -245 });
/** quick-261030-d7b — A KRX 재확인 회차(마감선 09:00:29.5 재발사 · expected_cum 090029000 · wire 0 부터 다시) 합성 조각 · A 머리 두 회차. */
const A_RECHECK_KBQ = piece({ gateway: 'KB120', market: 'Q', profile: 'A', fire_exchange: 'KRX', fire_base: '09:00:29', wire: 0, queued_id: 'A', piece_idx: 0, side: 'buy', sent_rel_us: -900, result: '접수', retry: 1 });
const A_HEADS_KBQ = [
  head({ gateway: 'KB120', market: 'Q', profile: 'A', fire_exchange: 'KRX', fire_base: '09:00:27', offset_used_us: -1200, n_pieces: 1 }),
  head({ gateway: 'KB120', market: 'Q', profile: 'A', fire_exchange: 'KRX', fire_base: '09:00:29', offset_used_us: -900, n_pieces: 1 }),
];

describe('fmtUs — 부호 U+2212 · 천 단위 ko-KR', () => {
  it.each([
    [0, '0'],
    [10, '+10'],
    [-305, `${M}305`],
    [-20148, `${M}20,148`],
    [null, '—'],
  ] as const)('%s → %s', (v, out) => {
    expect(fmtUs(v)).toBe(out);
  });
});

describe('fmtAcceptTime — HHMMSSmmm 9자리 패딩', () => {
  it.each([
    [155959999, '15:59:59.999'],
    [90030046, '09:00:30.046'],
    [null, '—'],
  ] as const)('%s → %s', (v, out) => {
    expect(fmtAcceptTime(v)).toBe(out);
  });
});

describe('fireLegLabelOf — 발사 다리', () => {
  it.each([
    ['N', 'NXT', '09:00:30', 'N NXT'],
    ['A', 'KRX', '09:00:27', 'A 09:00:27 KRX→'],
    ['A', 'KRX', '09:00:29', 'A 09:00:29 KRX→'],
    ['A', 'NXT', '09:00:30', 'A NXT'],
    ['Q16', 'KRX', '16:00:00', 'Q16'],
  ] as const)('(%s, %s, %s) → %s', (profile, fire_exchange, fire_base, out) => {
    expect(fireLegLabelOf({ profile, fire_exchange, fire_base })).toBe(out);
  });
});

describe('pieceKeyLabelOf — 키 열', () => {
  it('Q16 → 예약 · 조각 · 라운드', () => {
    expect(pieceKeyLabelOf({ profile: 'Q16', queued_id: 'Q153015001', piece_idx: 0, round: 0 })).toBe('Q153015001 · j0 · R0');
  });
  it('N → 키 · idx', () => {
    expect(pieceKeyLabelOf({ profile: 'N', queued_id: 'N', piece_idx: 1, round: null })).toBe('N · idx1');
  });
  it('round null → R—', () => {
    expect(pieceKeyLabelOf({ profile: 'Q16', queued_id: 'Q153015001', piece_idx: 0, round: null })).toBe('Q153015001 · j0 · R—');
  });
  it('Q16 뒤탐침(probe true · round −2) → 「예약 · 뒤탐침 piece_idx+1」(quick-261030-dz7)', () => {
    expect(
      pieceKeyLabelOf({ profile: 'Q16', queued_id: 'Q153015001', piece_idx: 1, round: -2, probe: true }),
    ).toBe('Q153015001 · 뒤탐침 2');
  });
  it('뒤탐침 piece_idx null → 「예약 · 뒤탐침」', () => {
    expect(
      pieceKeyLabelOf({ profile: 'Q16', queued_id: 'Q153015001', piece_idx: null, round: -2, probe: true }),
    ).toBe('Q153015001 · 뒤탐침');
  });
  it('앞쪽 탐침(round −1) 은 지금처럼 j · R', () => {
    expect(
      pieceKeyLabelOf({ profile: 'Q16', queued_id: 'Q153015001', piece_idx: 0, round: -1, probe: true }),
    ).toBe('Q153015001 · j0 · R-1');
  });
});

describe('serverMarketLabelOf · resultToneOf · sideLabelOf · 쿼리', () => {
  it('서버 시장 라벨 — 서버 라벨(quick-261107-iep)', () => {
    expect(serverMarketLabelOf('KB120', 'Q')).toBe('KB120 코스닥');
    expect(serverMarketLabelOf('KYOBO119', 'K')).toBe('교보119 코스피');
    expect(serverMarketLabelOf('KYOBO112', 'Q')).toBe('교보112 코스닥');
    expect(serverMarketLabelOf('KB120', 'X')).toBe('KB120 X');
    expect(serverMarketLabelOf('ZZ1', 'K')).toBe('ZZ1 코스피');
  });
  it('결과 색 축', () => {
    expect(['접수', '101', '515', '기타', '무응답', 'E127'].map(resultToneOf)).toEqual(['ok', 'bad', 'bad', 'other', 'other', 'other']);
  });
  it('구분', () => {
    expect(sideLabelOf('buy')).toEqual({ label: '매수', tone: 'up' });
    expect(sideLabelOf('sell')).toEqual({ label: '매도', tone: 'down' });
    expect(sideLabelOf(null)).toEqual({ label: '—', tone: null });
  });
  it('tab · fire 파라미터', () => {
    expect([launchTabOf('orders'), launchTabOf('map'), launchTabOf('x'), launchTabOf(null)]).toEqual(['orders', 'map', null, null]);
    expect([launchFireParamOf('q16'), launchFireParamOf('n0930'), launchFireParamOf('N0930')]).toEqual(['q16', 'n0930', null]);
  });
  it('gw 파라미터 — 발사 서버 정확 일치만(quick-261107-iep)', () => {
    expect([launchGatewayParamOf('KB120'), launchGatewayParamOf('KYOBO119'), launchGatewayParamOf('KYOBO112')]).toEqual([
      'KB120',
      'KYOBO119',
      'KYOBO112',
    ]);
    expect([
      launchGatewayParamOf('KB121'),
      launchGatewayParamOf('kyobo119'),
      launchGatewayParamOf(''),
      launchGatewayParamOf(null),
      launchGatewayParamOf(undefined),
    ]).toEqual([null, null, null, null, null]);
  });
});

describe('orderTabPiecesOf — 세그먼트 거름 · 정렬', () => {
  const q16 = attached('2026-10-26', 'KB', '코스닥').slice(0, 2);
  const all = [...N_KBQ, ...q16, ...A_KBQ];

  it('n0930 = N NXT · A KRX 09:00:27 · A NXT 전부 · Q16 은 뺀다 · 09:00:27 다리가 먼저', () => {
    const out = orderTabPiecesOf(all, 'n0930');
    expect(out.map((p) => fireLegLabelOf(p))).toEqual(['A 09:00:27 KRX→', 'A NXT', 'N NXT', 'N NXT', 'N NXT']);
    expect(out.every((p) => p.profile !== 'Q16')).toBe(true);
  });

  it('q16 = Q16 KRX 16:00:00 만 · wire 순', () => {
    const out = orderTabPiecesOf([...all].reverse(), 'q16');
    expect(out.map((p) => p.wire)).toEqual([0, 1]);
    expect(out.every((p) => p.profile === 'Q16')).toBe(true);
  });

  it('LAUNCH_ORDER 묶음 순 — KB120 코스닥 · KB120 코스피 · 교보119 코스닥 · 교보119 코스피', () => {
    const mixed = [
      ...attached('2026-10-23', '교보', '코스피').slice(0, 1),
      ...attached('2026-10-23', '교보', '코스닥').slice(0, 1),
      ...attached('2026-10-23', 'KB', '코스피').slice(0, 1),
      ...attached('2026-10-23', 'KB', '코스닥').slice(0, 1),
    ];
    expect(orderTabPiecesOf(mixed, 'q16').map((p) => `${p.gateway}|${p.market}`)).toEqual([
      'KB120|Q',
      'KB120|K',
      'KYOBO119|Q',
      'KYOBO119|K',
    ]);
  });

  it('n0930 — A KRX 재확인 회차(09:00:29)도 싣는다 · 09:00:27 뒤 · 09:00:30 NXT 앞 (quick-261030-d7b)', () => {
    const out = orderTabPiecesOf([A_RECHECK_KBQ, ...all], 'n0930');
    expect(out.map((p) => fireLegLabelOf(p))).toEqual(['A 09:00:27 KRX→', 'A 09:00:29 KRX→', 'A NXT', 'N NXT', 'N NXT', 'N NXT']);
  });

  it('q16 에는 재확인 회차가 없다 · A KRX 09:00:30 행은 두 탭 어디에도 없다', () => {
    const stray = piece({ ...A_RECHECK_KBQ, fire_base: '09:00:30' });
    const input = [A_RECHECK_KBQ, stray, ...all];
    expect(orderTabPiecesOf(input, 'q16').some((p) => p.profile === 'A')).toBe(false);
    expect(orderTabPiecesOf(input, 'n0930').filter((p) => p.profile === 'A' && p.fire_exchange === 'KRX').map((p) => p.fire_base)).toEqual([
      '09:00:27',
      '09:00:29',
    ]);
    expect(orderTabPiecesOf([stray], 'n0930')).toEqual([]);
    expect(orderTabPiecesOf([stray], 'q16')).toEqual([]);
  });
});

describe('launchHeadCardOf(q16) — 머리 우선 · 조각 폴백', () => {
  it('머리 있음 → 경계 · 오프셋 · 학습은 머리 값', () => {
    const pieces = attached('2026-10-26', 'KB', '코스닥');
    const h = head({
      gateway: 'KB120',
      market: 'Q',
      offset_used_us: -332,
      gate_lo_us: -360,
      gate_hi_us: -350,
      correction_before_us: -146,
      correction_after_us: -151,
      step_us: 5,
      next_offset_us: -337,
    });
    const card = launchHeadCardOf({ gateway: 'KB120', market: 'Q', fire: 'q16', pieces, heads: [h] });
    expect(card).toMatchObject({
      fire: 'q16',
      title: 'KB120 코스닥',
      count: 18,
      badLabel: '101',
      offset: `${M}332µs`,
      gate: `${M}360 ~ ${M}350`,
      learnLabel: '학습 → 다음 오프셋',
      learn: `${M}146 → ${M}151 · 다음 ${M}337µs (step 5)`,
    });
  });

  it('뒤탐침은 count · counts 에서 빼고 probes 로 따로 센다(머리 n_pieces 와 같은 정의 · 35 IN-02)', () => {
    const base = { gateway: 'KB120', market: 'Q' } as const;
    const tail = { probe: true, round: -2 } as const;
    const pieces = [
      piece({ ...base, wire: 0, sent_rel_us: -290, result: '101' }),
      piece({ ...base, wire: 1, sent_rel_us: -286, result: '접수' }),
      piece({ ...base, ...tail, wire: 2, piece_idx: 0, sent_rel_us: -260, result: '기타', result_code: 'F083' }),
      piece({ ...base, ...tail, wire: 3, piece_idx: 1, sent_rel_us: -250, result: '접수' }),
    ];
    const card = launchHeadCardOf({ ...base, fire: 'q16', pieces, heads: [] });
    expect(card).toMatchObject({ count: 2, counts: { ok: 1, bad: 1, other: 0 }, probes: 2 });
    expect(launchHeadCardOf({ ...base, fire: 'q16', pieces: pieces.slice(0, 2), heads: [] })?.probes).toBe(0);
  });

  it('머리 없음 → 경계 = launchDaysOf 폴백(10/14 KB120 코스닥) · 오프셋 = 최소 wire rel · 다음 발사 계획 첫 조각 「—」', () => {
    const card = launchHeadCardOf({ gateway: 'KB120', market: 'Q', fire: 'q16', pieces: attached('2026-10-14', 'KB', '코스닥'), heads: [] });
    expect(card).toMatchObject({ gate: `${M}350 ~ ${M}342`, offset: `${M}352µs`, learnLabel: '다음 발사 계획 첫 조각', learn: '—', count: 5 });
  });
});

describe('launchHeadCardOf(q16) — 학습 줄 세 갈래 (D-32 · Phase 43 뒤 kind 18 학습값 없음)', () => {
  const pieces = attached('2026-10-26', 'KB', '코스닥');
  const cardOf = (h: LaunchHeadRow) => launchHeadCardOf({ gateway: 'KB120', market: 'Q', fire: 'q16', pieces, heads: [h] });

  it('학습값이 하나라도 있으면(학습 시절 · 백필 머리) 옛 라벨 · 옛 문형', () => {
    const card = cardOf(head({ gateway: 'KB120', market: 'Q', correction_before_us: -146, correction_after_us: -151, step_us: 5, next_offset_us: -337 }));
    expect(card).toMatchObject({ learnLabel: '학습 → 다음 오프셋', learn: `${M}146 → ${M}151 · 다음 ${M}337µs (step 5)` });
    const stepOnly = cardOf(head({ gateway: 'KB120', market: 'Q', step_us: 5, next_offset_us: -337 }));
    expect(stepOnly).toMatchObject({ learnLabel: '학습 → 다음 오프셋', learn: `— → — · 다음 ${M}337µs (step 5)` });
  });

  it('학습값 전부 null · next −350 (Phase 43 뒤 journal 머리) → 「다음 발사 계획 첫 조각」 · 「−350µs」', () => {
    const card = cardOf(head({ gateway: 'KB120', market: 'Q', offset_used_us: -350, next_offset_us: -350 }));
    expect(card).toMatchObject({ learnLabel: '다음 발사 계획 첫 조각', learn: `${M}350µs` });
  });

  it('머리 값 전부 null → 「다음 발사 계획 첫 조각」 · 「—」', () => {
    const card = cardOf(head({ gateway: 'KB120', market: 'Q' }));
    expect(card).toMatchObject({ learnLabel: '다음 발사 계획 첫 조각', learn: '—' });
  });

  it('결과 수 = 탭 조각(10/14 KB120 코스피 접수 4 · 101 5 · 기타 1)', () => {
    const card = launchHeadCardOf({ gateway: 'KB120', market: 'K', fire: 'q16', pieces: attached('2026-10-14', 'KB', '코스피'), heads: [] });
    expect(card?.counts).toEqual({ ok: 4, bad: 5, other: 1 });
  });

  it('전부 접수 날 · 전부 101 날', () => {
    const acc = launchHeadCardOf({ gateway: 'KB120', market: 'Q', fire: 'q16', pieces: attached('2026-10-12', 'KB', '코스닥'), heads: [] });
    const rej = launchHeadCardOf({ gateway: 'KB120', market: 'K', fire: 'q16', pieces: attached('2026-10-12', 'KB', '코스피'), heads: [] });
    expect(acc?.fire === 'q16' && acc.gate).toBe(`전부 접수 (첫 접수 ${M}342µs)`);
    expect(rej?.fire === 'q16' && rej.gate).toBe(`전부 101 (마지막 ${M}302µs)`);
  });

  it('조각 0 · 머리 0 → null (다른 세그먼트 조각만 있어도)', () => {
    expect(launchHeadCardOf({ gateway: 'KYOBO119', market: 'K', fire: 'q16', pieces: [], heads: [] })).toBeNull();
    expect(launchHeadCardOf({ gateway: 'KB120', market: 'Q', fire: 'q16', pieces: N_KBQ, heads: [N_HEAD_KBQ] })).toBeNull();
  });
});

describe('launchHeadCardOf(n0930) — 두 다리 · 재전송 합 · 고정 다음 오프셋', () => {
  const pieces = [...attached('2026-10-26', 'KB', '코스닥'), ...N_KBQ, ...A_KBQ];

  it('10/26 KB120 코스닥 — 5조각 · 재전송 2+1+1 = 4 · 「고정 −245µs」 · 「거부」', () => {
    const card = launchHeadCardOf({ gateway: 'KB120', market: 'Q', fire: 'n0930', pieces, heads: [N_HEAD_KBQ] });
    expect(card).toMatchObject({
      fire: 'n0930',
      count: 5,
      badLabel: '거부',
      counts: { ok: 1, bad: 4, other: 0 },
      offset: `${M}245µs`,
      retries: 4,
      next: `고정 ${M}245µs`,
    });
  });

  it('N 머리 없음 → 다음 오프셋 「—」 · 오프셋 = N NXT 최소 wire rel', () => {
    const card = launchHeadCardOf({ gateway: 'KB120', market: 'Q', fire: 'n0930', pieces, heads: [] });
    expect(card).toMatchObject({ fire: 'n0930', next: '—', offset: `${M}20,148µs` });
  });

  it('A KRX 머리 둘(09:00:27 · 09:00:29) + N 머리 — 6조각 · 재전송 2+1+1+0+1 = 5 · 오프셋 · 다음은 N 머리 그대로 (quick-261030-d7b)', () => {
    const card = launchHeadCardOf({
      gateway: 'KB120',
      market: 'Q',
      fire: 'n0930',
      pieces: [...pieces, A_RECHECK_KBQ],
      heads: [...A_HEADS_KBQ, N_HEAD_KBQ],
    });
    expect(card).toMatchObject({
      fire: 'n0930',
      count: 6,
      badLabel: '거부',
      counts: { ok: 2, bad: 4, other: 0 },
      offset: `${M}245µs`,
      retries: 5,
      next: `고정 ${M}245µs`,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// quick-261103-pei — 대기열 열(목업 027 변형 A)
// ─────────────────────────────────────────────────────────────────────────────

describe('fmtEokMan — 1억 이상 x.xx억 · 미만 n만(반올림)', () => {
  it('목업 실측값', () => {
    expect(fmtEokMan(177_180_600)).toBe('1.77억');
    expect(fmtEokMan(1_081_572_500)).toBe('10.82억');
    expect(fmtEokMan(100_000_000)).toBe('1.00억');
    expect(fmtEokMan(78_692_000)).toBe('7,869만');
    expect(fmtEokMan(318_000)).toBe('32만');
    expect(fmtEokMan(0)).toBe('0만');
    expect(fmtEokMan(null)).toBe('—');
  });
});

const QV = (over: Partial<LaunchPieceQueueView>): LaunchPieceQueueView => ({
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

describe('launchQueueCellOf — 16:00 대기열', () => {
  const base = { kind: 'queue', rank: 9, ahead_qty: 68808, ahead_amt: 177_180_600 } as const;
  it('open → 「9번째 · 앞 68,808주 · 1.77억」 / 주황 「마감 앞 4건 · 30,560주 · 7,869만 (추정)」', () => {
    const c = launchQueueCellOf({ qty: 16666, queue: QV({ ...base, end_state: 'open', end_n: 4, end_qty: 30560, end_amt: 78_692_000 }) });
    expect(c).toEqual({
      lead: '9번째',
      leadTone: null,
      rest: ' · 앞 68,808주 · 1.77억',
      sub: '마감 앞 4건 · 30,560주 · 7,869만 (추정)',
      subTone: 'est',
    });
  });
  it('cancelled → 회색 「마감 — 취소됨」 · filled → 둘째 줄 없음', () => {
    expect(launchQueueCellOf({ qty: 1, queue: QV({ ...base, end_state: 'cancelled' }) })).toMatchObject({
      sub: '마감 — 취소됨',
      subTone: 'dim',
    });
    expect(launchQueueCellOf({ qty: 1, queue: QV({ ...base, end_state: 'filled' }) })!.sub).toBeNull();
  });
  it('order_est → 첫 줄 끝 「 (추정)」(게이트웨이 순서 가정)', () => {
    expect(launchQueueCellOf({ qty: 1, queue: QV({ ...base, end_state: 'cancelled', order_est: true }) })!.rest).toBe(
      ' · 앞 68,808주 · 1.77억 (추정)',
    );
  });
});

describe('launchQueueCellOf — 09:00:30 체결 순번', () => {
  it('체결 → 「2번째 체결 · 앞 2주 · 32만」 / 「체결 18/20 @ 159,300~160,100」', () => {
    const c = launchQueueCellOf({
      qty: 20,
      queue: QV({ kind: 'run', rank: 2, ahead_n: 1, ahead_qty: 2, ahead_amt: 318_000, fill_qty: 18, fill_px_min: 159_300, fill_px_max: 160_100 }),
    });
    expect(c).toEqual({
      lead: '2번째 체결',
      leadTone: null,
      rest: ' · 앞 2주 · 32만',
      sub: '체결 18/20 @ 159,300~160,100',
      subTone: 'dim',
    });
  });
  it('앞 금액 0 → 금액 생략 · 같은 가격이면 @ 하나', () => {
    const c = launchQueueCellOf({
      qty: 281,
      queue: QV({ kind: 'run', rank: 1, ahead_n: 0, ahead_qty: 0, ahead_amt: 0, fill_qty: 281, fill_px_min: 18_000, fill_px_max: 18_000 }),
    });
    expect(c).toMatchObject({ lead: '1번째 체결', rest: ' · 앞 0주', sub: '체결 281/281 @ 18,000' });
  });
  it('미체결 → 빨강 「미체결 · 앞선 1건이 한도 안 4,861주 · 10.82억 가져감」 / 「적어도 2번째 이후」', () => {
    const c = launchQueueCellOf({
      qty: 22,
      queue: QV({ kind: 'run', rank: null, ahead_n: 1, ahead_qty: 4861, ahead_amt: 1_081_572_500, fill_qty: 0 }),
    });
    expect(c).toEqual({
      lead: '미체결',
      leadTone: 'bad',
      rest: ' · 앞선 1건이 한도 안 4,861주 · 10.82억 가져감',
      sub: '적어도 2번째 이후',
      subTone: 'dim',
    });
  });
  it('미체결 · 한도 안 런 0건 → 「 · 1초 안 한도 안 체결 없음」 · 둘째 줄 없음', () => {
    const c = launchQueueCellOf({ qty: 7, queue: QV({ kind: 'run', rank: null, ahead_n: 0, ahead_qty: 0, ahead_amt: 0, fill_qty: 0 }) });
    expect(c).toMatchObject({ lead: '미체결', leadTone: 'bad', rest: ' · 1초 안 한도 안 체결 없음', sub: null });
  });
});

describe('launchQueueCellOf — 값 없음 → null(「—」)', () => {
  it('queue 키 없음(옛 RPC) · null(미계산 · 거부) · matched false', () => {
    expect(launchQueueCellOf({ qty: 1 })).toBeNull();
    expect(launchQueueCellOf({ qty: 1, queue: null })).toBeNull();
    expect(launchQueueCellOf({ qty: 1, queue: QV({ matched: false }) })).toBeNull();
  });
});

describe('launchQueueCellOf — 당일 값(live_as_of · quick 261104-n7i D-5)', () => {
  const base = { kind: 'queue', rank: 9, ahead_qty: 68808, ahead_amt: 177_180_600 } as const;
  const PM = '2026-11-04T07:03:12.000Z'; // 16:03 KST
  const AM = '2026-11-04T00:03:05.000Z'; // 09:03 KST
  it('queue open + live → 둘째 줄 「16:03 기준 앞 4건 · 30,560주 · 7,869만 (추정)」 · 첫 줄 · tone 그대로', () => {
    const c = launchQueueCellOf({
      qty: 16666,
      queue: QV({ ...base, end_state: 'open', end_n: 4, end_qty: 30560, end_amt: 78_692_000, live_as_of: PM }),
    });
    expect(c).toEqual({
      lead: '9번째',
      leadTone: null,
      rest: ' · 앞 68,808주 · 1.77억',
      sub: '16:03 기준 앞 4건 · 30,560주 · 7,869만 (추정)',
      subTone: 'est',
    });
  });
  it('queue cancelled + live → 「16:03 기준 — 취소됨」 · filled + live → 「16:03 기준」(dim)', () => {
    expect(launchQueueCellOf({ qty: 1, queue: QV({ ...base, end_state: 'cancelled', live_as_of: PM }) })).toMatchObject({
      sub: '16:03 기준 — 취소됨',
      subTone: 'dim',
    });
    expect(launchQueueCellOf({ qty: 1, queue: QV({ ...base, end_state: 'filled', live_as_of: PM }) })).toMatchObject({
      sub: '16:03 기준',
      subTone: 'dim',
    });
  });
  it('run 체결 + live → 「체결 18/20 @ 159,300~160,100 · 09:03 기준」', () => {
    const c = launchQueueCellOf({
      qty: 20,
      queue: QV({
        kind: 'run',
        rank: 2,
        ahead_n: 1,
        ahead_qty: 2,
        ahead_amt: 318_000,
        fill_qty: 18,
        fill_px_min: 159_300,
        fill_px_max: 160_100,
        live_as_of: AM,
      }),
    });
    expect(c).toMatchObject({ lead: '2번째 체결', rest: ' · 앞 2주 · 32만', sub: '체결 18/20 @ 159,300~160,100 · 09:03 기준' });
  });
  it('run 미체결(n>0) + live → 「적어도 2번째 이후 · 09:03 기준」 · 미체결(n=0) + live → 「09:03 기준」(dim)', () => {
    expect(
      launchQueueCellOf({
        qty: 22,
        queue: QV({ kind: 'run', rank: null, ahead_n: 1, ahead_qty: 4861, ahead_amt: 1_081_572_500, fill_qty: 0, live_as_of: AM }),
      }),
    ).toMatchObject({ lead: '미체결', sub: '적어도 2번째 이후 · 09:03 기준', subTone: 'dim' });
    expect(
      launchQueueCellOf({
        qty: 7,
        queue: QV({ kind: 'run', rank: null, ahead_n: 0, ahead_qty: 0, ahead_amt: 0, fill_qty: 0, live_as_of: AM }),
      }),
    ).toMatchObject({ lead: '미체결', rest: ' · 1초 안 한도 안 체결 없음', sub: '09:03 기준', subTone: 'dim' });
  });
  it('live_as_of 가 날짜로 안 읽히면 비 live 와 같다(지금 문구)', () => {
    expect(
      launchQueueCellOf({ qty: 1, queue: QV({ ...base, end_state: 'cancelled', live_as_of: 'not-a-date' }) })!.sub,
    ).toBe('마감 — 취소됨');
    expect(launchQueueCellOf({ qty: 1, queue: QV({ ...base, end_state: 'filled', live_as_of: '' }) })!.sub).toBeNull();
  });
});
