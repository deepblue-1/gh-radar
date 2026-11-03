import { describe, it, expect } from 'vitest';

import { TAG_CODE, classifyKrxOrders, scopeTrades } from '@gh-radar/shared';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { TICK_FIXTURE_DATE, TICK_FIXTURE_ISIN, tickGridBytes } from '@/test-fixtures/tick-grid';
import { a3Msg, b6Msg, inversionSession, synthSession } from '@/test-fixtures/tick-synth';

import {
  MSG_ITEM,
  buildMsgRows,
  fmtA3Row,
  fmtB6Row,
  fmtDurNs,
  fmtLeadMs,
  fmtOtherRow,
  inversionText,
  itemIdxOf,
  itemKindOf,
  orderShapeLabel,
  slotText,
  tailInversionText,
  tailText,
  fmtGapNs,
  fmtRatio,
  teamBookText,
  teamGapText,
  teamOrderMetaOf,
} from '../msg-rows';
import { buildTickSession, recentOrdersOf } from '../tick-session';

/**
 * Phase 37 Plan 13 Task 1 — 세션 주문 판정 · buildMsgRows(거래소순 · 레일 · 꼬리) · 행 서식.
 */

/** 항목 → 「R<seq>」 · 「T<order>」 · 「S<seq>」 — 순서 단언용. */
function shapeOf(session: ReturnType<typeof synthSession>, items: Int32Array): string[] {
  return Array.from(items, (it) => {
    const k = itemKindOf(it);
    const i = itemIdxOf(it);
    if (k === MSG_ITEM.TAIL) return `T${i}`;
    return `${k === MSG_ITEM.SLOT ? 'S' : 'R'}${session.index.seq[i]}`;
  });
}

describe('buildMsgRows — 합성(팀 SMP 3조각 + 닫는 B6 · 1조각 일반 · 단일가 · 열린 주문)', () => {
  const s = synthSession([
    [0, b6Msg({ seq: 100, ask1: [16400, 283], bid1: [16350, 121] })],
    [1, a3Msg({ seq: 101, bs: '2', px: 16400, qty: 100, time: '130000001000' })],
    [1.1, a3Msg({ seq: 102, bs: '2', px: 16400, qty: 200, time: '130000001100' })],
    [1.2, a3Msg({ seq: 103, bs: '2', px: 16400, qty: 300, time: '130000001264' })],
    [1.5, b6Msg({ seq: 104, ask1: [16450, 10], bid1: [16400, 20] })],
    [2, a3Msg({ seq: 105, bs: '1', px: 16350, qty: 50, a1: 16400, b1: 16350, pct: '5', time: '130000002000' })],
    [2.5, b6Msg({ seq: 106, ask1: [16400, 1], bid1: [16350, 2] })],
    [3, a3Msg({ seq: 107, bs: '0', px: 16350, qty: 1000, a1: 16400, b1: 16350, time: '130000003000' })],
    [3.5, b6Msg({ seq: 108, ask1: [16400, 1], bid1: [16350, 2] })],
    [4, a3Msg({ seq: 109, bs: '2', px: 16400, qty: 7, a1: 16400, b1: 16350, time: '130000004000' })],
  ]);

  it('주문 판정 — 종류 · 팀 · 닫는 B6 · 열린 주문', () => {
    expect(s.scope).toBe('accum');
    expect(s.orders.map((o) => [o.kind, o.team, o.pieces])).toEqual([
      ['자전거래방지', true, 3],
      ['일반', false, 1],
      ['단일가', false, 1],
      ['일반', false, 1],
    ]);
    expect(s.orders.map((o) => orderShapeLabel(o))).toEqual(['팀 SMP', '일반', '단일가', '일반']);
    const seqOf = (r: number | null) => (r === null ? null : s.index.seq[r]);
    expect(s.orders.map((o) => seqOf(o.closingB6Rec))).toEqual([104, 106, 108, null]);
    expect(s.orders.map((o) => o.open)).toEqual([false, false, false, true]);
    expect(s.openOrder).toBe(3);
    // 닫는 B6 도 같은 주문 · 팀
    expect(s.orderOfRec[4]).toBe(0);
    expect(s.teamOfRec[4]).toBe(1);
    expect(s.orderOfRec[0]).toBe(-1);
    expect(s.orders[0]!.qty).toBe(600);
    expect(s.orders[0]!.val).toBe(600 * 16400);
  });

  it('거래소순 항목 — 묶음 끝(닫는 B6) 뒤 꼬리 · 1조각은 꼬리 없음', () => {
    const m = buildMsgRows(s, 'exchange');
    expect(shapeOf(s, m.items)).toEqual(['R100', 'R101', 'R102', 'R103', 'R104', 'T0', 'R105', 'R106', 'R107', 'R108', 'R109']);
    expect(m.posOfRec[4]).toBe(4);
    expect(m.posOfRec[5]).toBe(6);
    expect(m.tailPosOfOrder[0]).toBe(5);
    expect(m.tailPosOfOrder[1]).toBe(-1);
  });

  it('행 서식 — A3 가격 ±수량 (금액) 매수|매도 · 0/0 · 단일가 · B6 매도1/매수1', () => {
    expect(fmtA3Row(s, 1)!.text).toBe('16,400 +100 (164만) 매수 · 0/0');
    expect(fmtA3Row(s, 5)!.text).toBe('16,350 −50 (82만) 매도');
    expect(fmtA3Row(s, 5)!.dir).toBe(-1);
    expect(fmtA3Row(s, 7)!.text).toBe('16,350 1,000 (1,635만) 단일가');
    expect(fmtA3Row(s, 0)).toBeNull();
    expect(fmtB6Row(s, 0)!.text).toBe('매도1 16,400 ×283 (464만) 매수1 16,350 ×121 (198만)');
    expect(fmtB6Row(s, 1)).toBeNull();
  });

  it('꼬리 문구 — ┗ n조각 k단 · 수량 · 금액 · 지속(1ms 미만 µs)', () => {
    expect(tailText(s.orders[0]!)).toBe('┗ 3조각 1단 · 600주 · 984만 · 264µs');
    expect(fmtDurNs(264_000n)).toBe('264µs');
    expect(fmtDurNs(6_300_000n)).toBe('6.3ms');
  });

  it('최근 주문 — 커서 이하에서 끝난 주문 최신 먼저', () => {
    expect(recentOrdersOf(s, 8, 10).map((o) => o.id)).toEqual([2, 1, 0]);
    expect(recentOrdersOf(s, 0, 10)).toEqual([]);
    // 주문 가운데 조각 — 그 주문이 맨 앞
    expect(recentOrdersOf(s, 2, 10).map((o) => o.id)).toEqual([0]);
  });
});

describe('buildMsgRows — 70조각 주문은 71행 + 꼬리 1행', () => {
  const msgs: [number, Uint8Array][] = [];
  for (let i = 0; i < 70; i++) {
    msgs.push([i * 0.1, a3Msg({ seq: i + 1, bs: '2', px: 17100, qty: 100, time: `1300000${String(1000 + i * 90).padStart(5, '0')}` })]);
  }
  msgs.push([7.5, b6Msg({ seq: 71, ask1: [17150, 5], bid1: [17100, 9] })]);
  const s = synthSession(msgs);

  it('71 ROW + 1 TAIL · 꼬리가 마지막', () => {
    const m = buildMsgRows(s, 'exchange');
    expect(m.items.length).toBe(72);
    const kinds = Array.from(m.items, itemKindOf);
    expect(kinds.filter((k) => k === MSG_ITEM.ROW)).toHaveLength(71);
    expect(kinds.filter((k) => k === MSG_ITEM.TAIL)).toHaveLength(1);
    expect(kinds[71]).toBe(MSG_ITEM.TAIL);
    expect(s.orders).toHaveLength(1);
    expect(s.orders[0]!.kind).toBe('자전거래방지');
    expect(tailText(s.orders[0]!)).toBe('┗ 70조각 1단 · 7,000주 · 1.20억 · 6.2ms');
  });
});

describe('뒤집힘 3 — 수신순 점선 자리 · ↕ 꼬리말 두 꼴 · 다음 역전 (Task 2)', () => {
  const s = inversionSession();

  it('세션 — 닫는 B6 104 가 9.0ms 먼저(leadNs = 마지막 조각 − B6 수신) · 중복 B6 106', () => {
    expect(s.inversions).toHaveLength(1);
    const inv = s.inversionOfB6.get(1)!;
    expect(inv.leadNs).toBe(9_000_000n);
    expect(fmtLeadMs(inv.leadNs)).toBe('9.0ms');
    expect(fmtLeadMs(400_000n)).toBe('0.4ms');
    expect(s.duplicates[13]).toBe(1);
    expect(s.duplicates[6]).toBe(0);
  });

  it('수신순 — B6 는 조각 앞(실제 수신 자리) · 마지막 조각 바로 뒤 SLOT · 그 뒤 꼬리', () => {
    const m = buildMsgRows(s, 'recv');
    expect(shapeOf(s, m.items).slice(0, 8)).toEqual(['R100', 'R104', 'R101', 'R102', 'R103', 'S104', 'T0', 'R105']);
    expect(m.items.length).toBe(s.index.n + 2);
  });

  it('거래소순 — 제자리라 SLOT 없음 · 꼬리는 닫는 B6 뒤', () => {
    const m = buildMsgRows(s, 'exchange');
    const shape = shapeOf(s, m.items);
    expect(shape.slice(0, 6)).toEqual(['R100', 'R101', 'R102', 'R103', 'R104', 'T0']);
    expect(shape.some((x) => x.startsWith('S'))).toBe(false);
  });

  it('꼬리말 두 꼴 · 꼬리 줄 · 점선 문구', () => {
    expect(inversionText('recv', 9_000_000n)).toBe('↕ 9.0ms 먼저 수신');
    expect(inversionText('exchange', 9_000_000n)).toBe('↕ 수신은 9.0ms 먼저');
    expect(tailInversionText('exchange', 9_000_000n)).toBe('· 닫는 B6 ↕ 9.0ms 먼저');
    expect(tailInversionText('recv', 9_000_000n)).toBe('· 닫는 B6 ↕ 9.0ms 먼저 수신');
    const m = buildMsgRows(s, 'recv');
    expect(slotText(s, m, 1)).toBe('⋯ 거래소순 자리 — 이 B6 는 9.0ms 먼저 수신돼 위 4행에 있음');
  });

  it('다음 역전 — 자리 뒤 첫 역전 B6 · 없으면 -1', () => {
    const ex = buildMsgRows(s, 'exchange');
    expect(ex.nextInversionFrom(0)).toBe(ex.posOfRec[1]);
    expect(ex.nextInversionFrom(ex.posOfRec[1]!)).toBe(-1);
    const rv = buildMsgRows(s, 'recv');
    expect(rv.nextInversionFrom(0)).toBe(1);
  });

  it('기타 · B9 · C3 · R8 · A0 행 문구', () => {
    expect(fmtOtherRow(s, 7)).toBe('거래원 매수1 교보 3,400 · 매도1 한국 1,200');
    expect(fmtOtherRow(s, 8)).toBe('프로그램 순매수 차익 +600 · 비차익 −500');
    expect(fmtOtherRow(s, 9)).toBe('VI 발동(정적) 기준가 16,400 · 발동가 18,040');
    expect(fmtOtherRow(s, 10)).toBe('VI 해제');
    expect(fmtOtherRow(s, 11)).toBe('종목 정보 ECOANDDREAM');
    expect(fmtOtherRow(s, 12)).toBe('기타 · A3 · 01S · 150B');
  });
});

describe('세션 주문 판정 — 컷 13시 KRX = 37-03 오라클(주문 · 종류 · 팀)', () => {
  const s = buildTickSession(tickGridBytes(), { date: TICK_FIXTURE_DATE, ex: 'KRX', isin: TICK_FIXTURE_ISIN });
  const golden = JSON.parse(
    readFileSync(
      path.resolve(__dirname, '../../../../../packages/shared/src/__fixtures__/ticks/cut1300-krx.orders.json'),
      'utf8',
    ),
  ) as { rows: [number, number, string, number][] };

  it('accum 범위 주문 수 = 같은 범위 classifyKrxOrders · 오라클 2,687 · 팀 126', () => {
    const direct = classifyKrxOrders(scopeTrades(s.a3.toTrades(), 'accum')).orders;
    expect(s.orders.length).toBe(direct.length);
    expect(s.orders.length).toBe(2687);
    expect(s.orders.filter((o) => o.team).length).toBe(126);
    // 컷 끝까지 모든 주문에 닫는 B6(closing_b6_ok 2687/2687) — 열린 주문 없음
    expect(s.orders.every((o) => o.closingB6Rec !== null)).toBe(true);
    expect(s.openOrder).toBe(-1);
  });

  it('조각마다 [seq, 주문, 종류, 팀] 이 오라클과 같은 분할', () => {
    const recOfSeq = new Map<number, number>();
    for (let j = 0; j < s.a3.n; j++) recOfSeq.set(s.a3.seq[j]!, s.a3.rec[j]!);
    const map = new Map<number, number>();
    for (const [seq, oid, kind, team] of golden.rows) {
      const rec = recOfSeq.get(seq)!;
      const id = s.orderOfRec[rec]!;
      expect(id).toBeGreaterThanOrEqual(0);
      const o = s.orders[id]!;
      expect([o.kind, o.team ? 1 : 0]).toEqual([kind, team]);
      if (map.has(oid)) expect(map.get(oid)).toBe(id);
      else map.set(oid, id);
    }
    expect(new Set(map.values()).size).toBe(map.size);
  });

  it('항목 수 = 전문 + 2조각 이상 주문 꼬리(+ 수신순 점선 자리 = 역전 수) · 모든 rec 이 한 번씩', () => {
    // 다조각 역전 84(cut1300-runs.json inverted 84/182) · 1조각 런 역전도 점선 자리를 갖는다
    expect(s.inversions.filter((i) => i.pieces >= 2).length).toBe(84);
    for (const mode of ['exchange', 'recv'] as const) {
      const m = buildMsgRows(s, mode);
      const multi = s.orders.filter((o) => o.pieces >= 2).length;
      expect(m.items.length).toBe(s.index.n + multi + (mode === 'recv' ? s.inversions.length : 0));
      // 점선 자리는 늘 그 B6 행보다 아래
      for (const [b6, at] of m.slotPosOfB6) expect(at).toBeGreaterThan(m.posOfRec[b6]!);
      const seen = new Uint8Array(s.index.n);
      for (const it of m.items) if (itemKindOf(it) === MSG_ITEM.ROW) seen[itemIdxOf(it)]! += 1;
      expect(seen.every((v) => v === 1)).toBe(true);
    }
    // 거래소순 — 묶음 안 닫는 B6 는 마지막 조각 다음 행이고 꼬리가 그 뒤
    const m = buildMsgRows(s, 'exchange');
    const o = s.orders.find((x) => x.pieces >= 3)!;
    const tail = m.tailPosOfOrder[o.id]!;
    expect(itemIdxOf(m.items[tail - 1]!)).toBe(o.closingB6Rec);
    expect(s.index.tag[o.closingB6Rec!]).toBe(TAG_CODE.B6);
  });
});

describe('팀 주문 간격 · 주문 전 호가비(스케치 024 C)', () => {
  /** 팀 매수 SMP 3조각(13:00:00.001000~) · 일반 1조각 · 팀 매도 0/0 단독(13:00:00.005000). */
  const s = synthSession([
    [0, b6Msg({ seq: 100, ask1: [16400, 283], bid1: [16350, 121], total: [5_000, 2_000] })],
    [1, a3Msg({ seq: 101, bs: '2', px: 16400, qty: 100, time: '130000001000' })],
    [1.1, a3Msg({ seq: 102, bs: '2', px: 16400, qty: 200, time: '130000001100' })],
    [1.2, a3Msg({ seq: 103, bs: '2', px: 16400, qty: 300, time: '130000001200' })],
    [1.5, b6Msg({ seq: 104, ask1: [16450, 10], bid1: [16400, 20], total: [4_000, 0] })],
    [2, a3Msg({ seq: 105, bs: '1', px: 16350, qty: 50, a1: 16400, b1: 16350, time: '130000002000' })],
    [2.5, b6Msg({ seq: 106, ask1: [16400, 1], bid1: [16350, 4], total: [3_000, 6_000] })],
    [5, a3Msg({ seq: 107, bs: '1', px: 16300, qty: 400, time: '130000005000' })],
    [5.5, b6Msg({ seq: 108, ask1: [16400, 1], bid1: [16300, 2] })],
  ]);
  const teams = s.orders.filter((o) => o.team);

  it('첫 팀 주문 = 간격 없음 · 둘째 = 첫 조각 체결시각 차(µs) · 호가비 = 첫 조각 직전 B6', () => {
    expect(teams).toHaveLength(2);
    const [buy, sell] = teams;
    const m1 = teamOrderMetaOf(s, buy!.id)!;
    expect(m1.gapNs).toBeNull();
    expect(m1.totalRatio).toBeCloseTo(2.5, 12);
    expect(m1.l1Ratio).toBeCloseTo(283 / 121, 12);
    expect(teamGapText(m1)).toBe('그날 첫 팀 주문');
    expect(teamBookText(m1)).toBe('주문 전 호가 총 2.50 · 1호 2.34');
    const m2 = teamOrderMetaOf(s, sell!.id)!;
    expect(m2.gapNs).toBe(4_000_000n);
    expect(teamGapText(m2)).toBe('직전 팀 +0.004000s');
    expect(teamBookText(m2)).toBe('주문 전 호가 총 0.50 · 1호 0.25');
  });

  it('일반 주문 = null · 서식(µs 6자리 · 초 · 음수 · 분모 0 「—」)', () => {
    const plain = s.orders.find((o) => !o.team)!;
    expect(teamOrderMetaOf(s, plain.id)).toBeNull();
    expect(fmtGapNs(512_304_000n)).toBe('+0.512304s');
    expect(fmtGapNs(12_345_678_999n)).toBe('+12.345678s');
    expect(fmtGapNs(-1_000n)).toBe('−0.000001s');
    expect(fmtRatio(null)).toBe('—');
  });
});
