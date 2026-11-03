import { describe, it, expect } from 'vitest';

import {
  TAG_CODE,
  a3TimeMs,
  classifyKrxOrders,
  scopeTrades,
  type TickOwnEvent,
  type TickOwnFill,
  type TickOwnResponse,
} from '@gh-radar/shared';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { TICK_FIXTURE_DATE, TICK_FIXTURE_ISIN, tickGridBytes } from '@/test-fixtures/tick-grid';
import { a3Msg, b6Msg, inversionSession, synthNs, synthSession, SYNTH_DATE, SYNTH_ISIN } from '@/test-fixtures/tick-synth';

import {
  MSG_ITEM,
  RAIL_NODE,
  buildMsgRows,
  fmtA3Row,
  fmtB6Row,
  fmtDurNs,
  fmtLeadMs,
  fmtOtherRow,
  inversionText,
  itemIdxOf,
  itemKindOf,
  msgItem,
  orderShapeLabel,
  ownLineRec,
  ownRailOf,
  slotText,
  tailInversionText,
  tailText,
  fmtGapNs,
  fmtShare,
  l1ShareAt,
  preBookOf,
  teamBookText,
  teamGapText,
  teamOrderMetaOf,
} from '../msg-rows';
import { buildOwnModel } from '../own-model';
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

/**
 * Phase 38 Plan 04 Task 1 — 우리 줄 ORDER · NOFILL(D-05 · D-12 · Pitfall 3).
 * 뒤집힘 세션(수신 0 B6 100 · 1 B6 104 닫는 · 1.05/1.1/10 A3 101~103 팀 SMP 3조각 · 11 A3 105 …).
 */
describe('buildMsgRows — 우리 주문 줄 · 짝 없음 줄(Phase 38)', () => {
  const s = inversionSession();
  /** 13:00:00.000 + ms → epoch ms(정수). */
  const at = (ms: number) => Number(synthNs(ms) / 1_000_000n);

  function ev(orderNo: string, gwMs: number): TickOwnEvent {
    return {
      gateway: 'KB120',
      seq: 1,
      gw_time_ms: gwMs,
      kind: 3,
      group: 7,
      account_no: '1234563801',
      order_no: orderNo,
      price: 16400,
      qty: 100,
      reason_code: '',
      cond_metric: 0,
      cond_threshold: 0,
      cond_actual: 0,
      ev_kind: 0,
      ev_price: 0,
      ev_qty_before: 0,
      ev_qty_after: 0,
      ev_trade_qty: 0,
      cum_volume: 0,
    };
  }
  function nofill(orderNo: string, gwMs: number, seq: number): TickOwnFill {
    return { gateway: 'KB120', seq, gw_time_ms: gwMs, account_no: '1234563801', order_no: orderNo, side: 'B', exec_price: 99_999, exec_qty: 7 };
  }
  function ownOf(events: TickOwnEvent[], fills: TickOwnFill[] = []): TickOwnResponse {
    return { access: true, date: SYNTH_DATE, exchange: 'KRX', isin: SYNTH_ISIN, servers: ['KB120'], fills, events, orders: [] };
  }
  /** 항목 → R<seq> · T<order> · S<seq> · O<우리 주문 id> · N<우리 체결 id>. */
  function shape(items: Int32Array): string[] {
    return Array.from(items, (it) => {
      const k = itemKindOf(it);
      const i = itemIdxOf(it);
      if (k === MSG_ITEM.TAIL) return `T${i}`;
      if (k === MSG_ITEM.ORDER) return `O${i}`;
      if (k === MSG_ITEM.NOFILL) return `N${i}`;
      return `${k === MSG_ITEM.SLOT ? 'S' : 'R'}${s.index.seq[i]}`;
    });
  }

  it('항목 종류 상수 — ORDER 3 · NOFILL 4 · 종류 비트가 Int32 양수', () => {
    expect([MSG_ITEM.ORDER, MSG_ITEM.NOFILL]).toEqual([3, 4]);
    expect(itemKindOf(msgItem(MSG_ITEM.NOFILL, 12345))).toBe(MSG_ITEM.NOFILL);
    expect(itemIdxOf(msgItem(MSG_ITEM.NOFILL, 12345))).toBe(12345);
    expect(msgItem(MSG_ITEM.NOFILL, 0)).toBeGreaterThan(0);
  });

  it('own 없음 · null · 줄 0인 own = Phase 37 과 같은 항목 · 색인', () => {
    for (const mode of ['exchange', 'recv'] as const) {
      const base = buildMsgRows(s, mode);
      for (const m of [buildMsgRows(s, mode, null), buildMsgRows(s, mode, buildOwnModel(s, ownOf([])))]) {
        expect(Array.from(m.items)).toEqual(Array.from(base.items));
        expect(Array.from(m.posOfRec)).toEqual(Array.from(base.posOfRec));
        expect(Array.from(m.tailPosOfOrder)).toEqual(Array.from(base.tailPosOfOrder));
        expect([...m.slotPosOfB6]).toEqual([...base.slotPosOfB6]);
        expect(Array.from(m.inversionPos)).toEqual(Array.from(base.inversionPos));
      }
      expect(base.ownPosOfOrder.length).toBe(0);
      expect(base.ownPosOfFill.length).toBe(0);
    }
  });

  it('주문 줄 = 그 시각 이후 첫 전문 앞 — 수신순(B6 104 앞) · 거래소순(같은 슬롯 = A3 101 앞)', () => {
    const own = buildOwnModel(s, ownOf([ev('O1', at(1))]));
    expect(own.slotOfOrder[0]).toBe(1);
    const rv = buildMsgRows(s, 'recv', own);
    expect(shape(rv.items).slice(0, 3)).toEqual(['R100', 'O0', 'R104']);
    expect(rv.ownPosOfOrder[0]).toBe(1);
    const ex = buildMsgRows(s, 'exchange', own);
    expect(shape(ex.items).slice(0, 3)).toEqual(['R100', 'O0', 'R101']);
    expect(ex.items.length).toBe(buildMsgRows(s, 'exchange').items.length + 1);
    // 그 줄의 기준 전문 = 다음 첫 ROW
    expect(ownLineRec(rv, 1)).toBe(1);
    expect(ownLineRec(ex, 1)).toBe(2);
    // posOfRec 은 항목 자리 그대로 따라간다
    for (let r = 0; r < s.index.n; r++) expect(itemIdxOf(ex.items[ex.posOfRec[r]!]!)).toBe(r);
  });

  it('Pitfall 3 — 3조각 주문 가운데 시각(2ms → 슬롯 = 조각 사이)은 그 묶음 꼬리 뒤로(두 순열)', () => {
    const own = buildOwnModel(s, ownOf([ev('O1', at(2))]));
    const rv = buildMsgRows(s, 'recv', own);
    expect(shape(rv.items).slice(0, 9)).toEqual(['R100', 'R104', 'R101', 'R102', 'R103', 'S104', 'T0', 'O0', 'R105']);
    const ex = buildMsgRows(s, 'exchange', own);
    expect(shape(ex.items).slice(0, 8)).toEqual(['R100', 'R101', 'R102', 'R103', 'R104', 'T0', 'O0', 'R105']);
    expect(ex.ownPosOfOrder[0]).toBe(ex.tailPosOfOrder[0]! + 1);
  });

  it('같은 슬롯 둘 — 시각 오름차순 · 동률이면 주문 먼저 · 짝 없음 자리는 ownPosOfFill', () => {
    // 11ms 슬롯(A3 105 앞 · 앞 행은 꼬리라 밀기 없음)에 주문 둘 · 짝 없는 체결 하나 — 모두 같은 시각
    const own = buildOwnModel(s, ownOf([ev('B', at(11)), ev('A', at(11))], [nofill('X', at(11), 1)]));
    // 주문 id 는 시각 · 키 순 — A(0) · B(1) · X(2 · 체결만)
    expect(own.orders.map((o) => o.orderNo)).toEqual(['A', 'B', 'X']);
    expect(own.fills[0]!.state).toBe('nofill');
    const ex = buildMsgRows(s, 'exchange', own);
    const sh = shape(ex.items);
    const i = sh.indexOf('R105');
    expect(sh.slice(i - 3, i + 1)).toEqual(['O0', 'O1', 'N0', 'R105']);
    expect(ex.ownPosOfFill[0]).toBe(i - 1);
    expect(ex.ownPosOfOrder[2]).toBe(-1); // 체결만 — 주문 줄 없음
  });

  it('p = n — 마지막 전문보다 늦은 줄은 목록 끝', () => {
    const own = buildOwnModel(s, ownOf([ev('Z', at(100))], [nofill('Y', at(99), 2)]));
    for (const mode of ['exchange', 'recv'] as const) {
      const m = buildMsgRows(s, mode, own);
      expect(shape(m.items).slice(-2)).toEqual(['N0', 'O1']);
      expect(ownLineRec(m, m.items.length - 1)).toBe(itemIdxOf(m.items[m.items.length - 3]!));
    }
  });
});

/**
 * Phase 38 Plan 04 Task 2 — 둘째 레일 계산 `ownRailOf`(D-04). half 비트 1 위 실선 · 2 위 점선 · 4 아래 실선 · 8 아래 점선 ·
 * node 0 없음 · 1 ● 주문 줄 · 2 ◆ 우리 체결 A3 행 · 3 ◇ 짝 없음/대기 줄.
 */
describe('ownRailOf — 둘째 레일(Phase 38 D-04)', () => {
  const at = (ms: number) => Number(synthNs(ms) / 1_000_000n);
  // seq 를 띄워 각 A3 가 1조각 주문(꼬리 없음)이 되게 한다
  const sess = synthSession([
    [100.5, a3Msg({ seq: 201, bs: '2', px: 16400, qty: 1064, time: '130000100000' })],
    [105.5, a3Msg({ seq: 211, bs: '2', px: 16400, qty: 100, time: '130000105000' })],
    [110.5, a3Msg({ seq: 221, bs: '2', px: 17000, qty: 5, time: '130000110000' })],
    [200.5, a3Msg({ seq: 231, bs: '1', px: 16400, qty: 500, time: '130000200000' })],
    [400.5, b6Msg({ seq: 241, ask1: [17000, 10], bid1: [16400, 20] })],
  ]);
  const tA3 = (j: number) => a3TimeMs(sess.index, sess.a3, j);

  function ev(orderNo: string, gwMs: number): TickOwnEvent {
    return {
      gateway: 'KB120', seq: 1, gw_time_ms: gwMs, kind: 3, group: 1, account_no: '1234563801', order_no: orderNo,
      price: 16400, qty: 100, reason_code: '', cond_metric: 0, cond_threshold: 0, cond_actual: 0, ev_kind: 0, ev_price: 0,
      ev_qty_before: 0, ev_qty_after: 0, ev_trade_qty: 0, cum_volume: 0,
    };
  }
  function fl(orderNo: string, gwMs: number, px: number, qty: number, seq: number): TickOwnFill {
    return { gateway: 'KB120', seq, gw_time_ms: gwMs, account_no: '1234563801', order_no: orderNo, side: 'B', exec_price: px, exec_qty: qty };
  }
  function railOf(events: TickOwnEvent[], fills: TickOwnFill[]) {
    const own = buildOwnModel(sess, {
      access: true, date: SYNTH_DATE, exchange: 'KRX', isin: SYNTH_ISIN, servers: ['KB120'], fills, events, orders: [],
    });
    const rows = buildMsgRows(sess, 'exchange', own);
    return { own, rows, rail: ownRailOf(rows, own) };
  }
  const arr = (a: Uint8Array) => Array.from(a);

  it('own 없음 = 빈 배열 · 줄 없는 own = 항목 수만큼 0', () => {
    const rows = buildMsgRows(sess, 'exchange');
    const none = ownRailOf(rows, null);
    expect([none.half.length, none.node.length]).toEqual([0, 0]);
    const { rail, rows: r2 } = railOf([], []);
    expect(rail.half.length).toBe(r2.items.length);
    expect(arr(rail.half).every((v) => v === 0) && arr(rail.node).every((v) => v === 0)).toBe(true);
  });

  it('구간 — 주문 줄 ● → 체결 ◆ ◆ 실선(위 절반 · 아래 절반) · 구간 밖 0', () => {
    // O(.050) → A3 201(.130 · 300주) · A3 231(.210 · 500주) — 항목: O0 R201 R211 R221 R231 R241
    const { rows, rail } = railOf([ev('O', at(50))], [fl('O', tA3(0) + 30, 16400, 300, 1), fl('O', tA3(3) + 10, 16400, 500, 2)]);
    expect(rows.ownPosOfOrder[0]).toBe(0);
    expect(arr(rail.node)).toEqual([1, 2, 0, 0, 2, 0]);
    expect(arr(rail.half)).toEqual([4, 5, 5, 5, 1, 0]);
  });

  it('추정 체결이 하나라도 있으면 그 주문 구간은 점선', () => {
    // 같은 가격 · 수량 A3 201(1064) 은 수량이 달라 후보 아님 — A3 211(100) 단독이면 추정 아님이라, 211 과 같은 값 A3 를 쓰지 않고
    // 16400 ×100 을 201(.100 · 남은 1064) · 211(.105 · 100) 둘 다 후보로: gw .115 → |dt| 15 · 10 → 211 · 차 5 < 20 → 추정
    const { own, rail } = railOf([ev('E', at(50))], [fl('E', tA3(0) + 15, 16400, 100, 1)]);
    expect(own.fills[0]!.est).toBe(true);
    expect(own.fills[0]!.rec).toBe(1);
    // 항목: O0 R201 R211 … — 0..2 점선
    expect(arr(rail.half).slice(0, 4)).toEqual([8, 10, 2, 0]);
    expect(arr(rail.node).slice(0, 4)).toEqual([1, 0, 2, 0]);
  });

  it('겹침 — 경계마다 실선이 하나라도 있으면 실선(옆 칸 없음)', () => {
    // E(점선): O0 → R211 · S(실선): O1 → R221. 항목: O0 O1 R201 R211 R221 R241(…)
    const { rows, rail } = railOf(
      [ev('E', at(50)), ev('S', at(50))],
      [fl('E', tA3(0) + 15, 16400, 100, 1), fl('S', tA3(2) + 3, 17000, 5, 2)],
    );
    expect([rows.ownPosOfOrder[0], rows.ownPosOfOrder[1]]).toEqual([0, 1]);
    expect(arr(rail.half).slice(0, 6)).toEqual([8, 6, 5, 5, 1, 0]);
    expect(arr(rail.node).slice(0, 6)).toEqual([1, 1, 0, 2, 2, 0]);
  });

  it('길이 1 — 주문 줄만(미체결) ● · 체결만 ◆ · 짝 없음 ◇ 는 마디만(선 없음)', () => {
    const { rows, rail } = railOf(
      [ev('U', at(300))],
      [fl('F', tA3(2) + 3, 17000, 5, 1), fl('N', at(150), 99_999, 1, 2)],
    );
    const uPos = rows.ownPosOfOrder[rows.ownPosOfOrder.length - 1]!;
    expect(rail.node[uPos]).toBe(1);
    expect(rail.node[rows.posOfRec[2]!]).toBe(2);
    const nPos = rows.ownPosOfFill[1]!;
    expect(rail.node[nPos]).toBe(3);
    expect(arr(rail.half).every((v) => v === 0)).toBe(true);
  });
});

/**
 * Phase 38 Plan 06 Task 1 — 둘째 레일 근거 마디(D-04 · D-11): node 4 ○ 근거 전문 행 · 5 ◌ 앵커. 띠 = [근거 ○ 또는 주문 ●] → ◆ ·
 * 구간 근거는 첫 ○ … 끝 ○ 점선 · 앵커는 마디만 · 우선순위 ◆ > ● > ○ > ◇ > ◌.
 */
describe('ownRailOf — 근거 ○ · 앵커 ◌(Phase 38-06)', () => {
  const at = (ms: number) => Number(synthNs(ms) / 1_000_000n);
  // rec 0 A3 cum 1,000 · rec 1 B6(매도1 16,400 ×38,200) · rec 2 A3 cum 1,200 · rec 3 A3 cum 1,500 · rec 4 A3 cum 1,550 · rec 5 B6
  // seq 를 띄워 각 A3 가 1조각 주문(꼬리 없음)
  const es = synthSession([
    [100.5, a3Msg({ seq: 401, bs: '2', px: 16400, qty: 100, time: '130000100000', cumVolume: 1000 })],
    [150.5, b6Msg({ seq: 411, ask1: [16400, 38_200], bid1: [16350, 10] })],
    [250.5, a3Msg({ seq: 421, bs: '2', px: 16400, qty: 200, time: '130000250000', cumVolume: 1200 })],
    [260.5, a3Msg({ seq: 431, bs: '2', px: 16400, qty: 300, time: '130000260000', cumVolume: 1500 })],
    [300.5, a3Msg({ seq: 441, bs: '2', px: 16450, qty: 50, time: '130000300000', cumVolume: 1550 })],
    [400.5, b6Msg({ seq: 451, ask1: [16450, 10], bid1: [16400, 20] })],
  ]);
  const eA3 = (j: number) => a3TimeMs(es.index, es.a3, j);

  function ev(orderNo: string, gwMs: number, over: Partial<TickOwnEvent>): TickOwnEvent {
    return {
      gateway: 'KB120', seq: 1, gw_time_ms: gwMs, kind: 3, group: 1, account_no: '1234563801', order_no: orderNo,
      price: 16400, qty: 300, reason_code: '', cond_metric: 0, cond_threshold: 0, cond_actual: 0, ev_kind: 0, ev_price: 0,
      ev_qty_before: 0, ev_qty_after: 0, ev_trade_qty: 0, cum_volume: 0, ...over,
    };
  }
  function fl(orderNo: string, gwMs: number, px: number, qty: number, seq: number): TickOwnFill {
    return { gateway: 'KB120', seq, gw_time_ms: gwMs, account_no: '1234563801', order_no: orderNo, side: 'B', exec_price: px, exec_qty: qty };
  }
  function railOf(events: TickOwnEvent[], fills: TickOwnFill[]) {
    const own = buildOwnModel(es, {
      access: true, date: SYNTH_DATE, exchange: 'KRX', isin: SYNTH_ISIN, servers: ['KB120'], fills, events, orders: [],
    });
    const rows = buildMsgRows(es, 'exchange', own);
    return { own, rows, rail: ownRailOf(rows, own) };
  }
  const arr = (a: Uint8Array) => Array.from(a);

  it('상수 — ○ 4 · ◌ 5', () => {
    expect([RAIL_NODE.EVIDENCE, RAIL_NODE.ANCHOR]).toEqual([4, 5]);
  });

  it('호가 근거 — 띠 시작이 근거 행(○) · 주문 ● 을 지나 ◆ 까지 실선 · 앵커 ◌ 는 띠 밖 마디만', () => {
    // 근거 B6 rec 1 · 앵커 rec 0 · 주문 .200 → R2 앞 · 체결 16,400 ×300 → rec 3. 항목: R0 R1 O0 R2 R3 R4 R5
    const { own, rows, rail } = railOf(
      [ev('B', at(200), { ev_kind: 1, ev_price: 16400, ev_qty_after: 38_200, cum_volume: 1000 })],
      [fl('B', eA3(2) + 5, 16400, 300, 1)],
    );
    expect([own.orders[0]!.evidenceRec, own.orders[0]!.anchorRec, own.fills[0]!.rec]).toEqual([1, 0, 3]);
    expect(rows.ownPosOfOrder[0]).toBe(2);
    expect(arr(rail.node)).toEqual([5, 4, 1, 0, 2, 0, 0]);
    expect(arr(rail.half)).toEqual([0, 4, 5, 5, 1, 0, 0]);
  });

  it('구간 근거 — 첫 ○ … 끝 ○ 점선 · 끝 ○ → 주문 ● 실선 · 구간 안 앵커 ◌', () => {
    // 구간 rec 2 … rec 4 · 앵커 rec 3 · 주문 .350 → R5 앞. 항목: R0 R1 R2 R3 R4 O0 R5
    const { own, rail } = railOf(
      [ev('R', at(350), { ev_kind: 2, ev_price: 16400, ev_trade_qty: 999, ev_qty_before: 1000, ev_qty_after: 1550, cum_volume: 1500 })],
      [],
    );
    expect([own.orders[0]!.evidenceFirstRec, own.orders[0]!.evidenceRec, own.orders[0]!.anchorRec]).toEqual([2, 4, 3]);
    expect(arr(rail.node)).toEqual([0, 0, 4, 5, 4, 1, 0]);
    // 2: 아래 점선 · 3: 위·아래 점선 · 4: 위 점선 + 아래 실선 · 5: 위 실선
    expect(arr(rail.half)).toEqual([0, 0, 8, 10, 6, 1, 0]);
  });

  it('우선순위 — 근거 행이 우리 체결 행이면 ◆(체결통보 근거 = 우리 체결 짝)', () => {
    const { own, rows, rail } = railOf(
      [ev('N', eA3(2) + 50, { ev_kind: 3, ev_price: 16400, ev_trade_qty: 300 })],
      [fl('P', eA3(2) + 5, 16400, 300, 1)],
    );
    const n = own.orders.find((o) => o.orderNo === 'N')!;
    expect(n.evidenceRec).toBe(3);
    expect(rail.node[rows.posOfRec[3]!]).toBe(RAIL_NODE.FILL);
  });
});

describe('팀 주문 간격 · 주문 전 매도비중 · 1호 매도 열(스케치 024 C · 025 A)', () => {
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

  it('첫 팀 주문 = 간격 없음 · 둘째 = 첫 조각 체결시각 차(µs) · 매도비중 = 첫 조각 직전 B6 의 매도 ÷ (매도 + 매수)', () => {
    expect(teams).toHaveLength(2);
    const [buy, sell] = teams;
    const m1 = teamOrderMetaOf(s, buy!.id)!;
    expect(m1.gapNs).toBeNull();
    expect(m1.totalShare).toBeCloseTo(5 / 7, 12);
    expect(m1.l1Share).toBeCloseTo(283 / 404, 12);
    expect(teamGapText(m1)).toBe('그날 첫 팀 주문');
    expect(teamBookText(m1)).toBe('주문 전 매도비중 총 71% · 1호 70%');
    const m2 = teamOrderMetaOf(s, sell!.id)!;
    expect(m2.gapNs).toBe(4_000_000n);
    expect(teamGapText(m2)).toBe('직전 팀 +0.004000s');
    expect(teamBookText(m2)).toBe('주문 전 매도비중 총 33% · 1호 20%');
  });

  it('일반 주문 = 팀 정보 null · 주문 전 매도비중은 있음 · 서식(µs 6자리 · 초 · 음수 · 비중 % · 모름 「—」)', () => {
    const plain = s.orders.find((o) => !o.team)!;
    expect(teamOrderMetaOf(s, plain.id)).toBeNull();
    const pre = preBookOf(s, plain);
    // 첫 조각 직전 B6 104 — 총 4,000 · 0(한쪽 0 이어도 100%) · 1호 10 · 20
    expect(pre.totalShare).toBe(1);
    expect(teamBookText(pre)).toBe('주문 전 매도비중 총 100% · 1호 33%');
    expect(fmtGapNs(512_304_000n)).toBe('+0.512304s');
    expect(fmtGapNs(12_345_678_999n)).toBe('+12.345678s');
    expect(fmtGapNs(-1_000n)).toBe('−0.000001s');
    expect(fmtShare(null)).toBe('—');
    expect(fmtShare(0)).toBe('0%');
    expect(fmtShare(1)).toBe('100%');
  });

  it('1호 매도 열 — 그 행 이하(거래소순) 같은 보드 마지막 B6 의 매도1 ÷ (매도1 + 매수1) · B6 행은 자기 값', () => {
    const recOf = (seq: number) => Array.from(s.index.seq).indexOf(seq);
    expect(l1ShareAt(s, recOf(100))).toBeCloseTo(283 / 404, 12);
    expect(l1ShareAt(s, recOf(101))).toBeCloseTo(283 / 404, 12);
    expect(l1ShareAt(s, recOf(104))).toBeCloseTo(10 / 30, 12);
    expect(l1ShareAt(s, recOf(105))).toBeCloseTo(10 / 30, 12);
    expect(l1ShareAt(s, recOf(106))).toBeCloseTo(1 / 5, 12);
    expect(l1ShareAt(s, recOf(108))).toBeCloseTo(1 / 3, 12);
  });
});
