import { describe, it, expect, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';

import { a3TimeMs, type TickOwnEvent, type TickOwnFill, type TickOwnResponse } from '@gh-radar/shared';

import { a3Msg, b6Msg, synthNs, synthSession, SYNTH_DATE, SYNTH_ISIN } from '@/test-fixtures/tick-synth';

import { MSG_ITEM, buildMsgRows, itemIdxOf, itemKindOf, ownLineRec } from '../msg-rows';
import { buildOwnModel, type OwnModel, type OwnSel } from '../own-model';
import type { TickOrderMode } from '../use-tick-cursor';
import { ownNavOf, useOwnNav } from '../use-own-nav';

/**
 * Phase 38 Plan 08 Task 1 — 우리 탐색(D-09): 대상 = 우리 체결 A3 행 ∪ 짝 없음 줄 ∪ 주문 줄 ∪ 조건 근거 행(UAT · 같은 자리 = 한 대상) · 현재 정렬 순열 순 ·
 * k/n · ‹ › 끝 null · 짝 없음 줄 → 줄 선택 · 키 `[` `]`(입력칸 · 수정자 무시) · own 없음 → null.
 *
 * 세션: 수신순 A3 seq 220(16,400 ×1,064) → A3 seq 210(17,000 ×5) 이 뒤집혀 왔다 — 거래소순(seq)이면 210 이 먼저.
 * 체결: A(210 에 5주) · B(220 에 300 + 500 — 같은 A3 둘) · N(짝 없음 99,999 · .150) · C(231 에 500).
 */

const sess = synthSession([
  [100.5, a3Msg({ seq: 220, bs: '2', px: 16400, qty: 1064, time: '130000105000' })],
  [105.5, a3Msg({ seq: 210, bs: '2', px: 17000, qty: 5, time: '130000100000' })],
  [200.5, a3Msg({ seq: 231, bs: '1', px: 16500, qty: 500, time: '130000200000' })],
  [400.5, b6Msg({ seq: 241, ask1: [17000, 10], bid1: [16400, 20] })],
]);
const at = (ms: number) => Number(synthNs(ms) / 1_000_000n);
const tA3 = (j: number) => a3TimeMs(sess.index, sess.a3, j);
/** A3 rec — 수신 순서 그대로(0 = seq 220 · 1 = seq 210 · 2 = seq 231). */
const R220 = 0;
const R210 = 1;
const R231 = 2;

function fl(orderNo: string, gwMs: number, px: number, qty: number, seq: number): TickOwnFill {
  return { gateway: 'KB120', seq, gw_time_ms: gwMs, account_no: '1234563801', order_no: orderNo, side: 'B', exec_price: px, exec_qty: qty };
}
function respOf(fills: TickOwnFill[]): TickOwnResponse {
  return { access: true, date: SYNTH_DATE, exchange: 'KRX', isin: SYNTH_ISIN, servers: ['KB120'], fills, events: [], orders: [] };
}
const FILLS = [
  fl('A', tA3(1) + 3, 17000, 5, 1),
  fl('B', tA3(0) + 10, 16400, 300, 2),
  fl('B', tA3(0) + 20, 16400, 500, 3),
  fl('N', at(150), 99_999, 7, 4),
  fl('C', tA3(2) + 5, 16500, 500, 5),
];
const own = buildOwnModel(sess, respOf(FILLS));

/** 커서 · 고른 줄을 상태로 드는 하네스 — 뷰어 결선과 같은 꼴. */
function mount(mode: TickOrderMode, ownModel: OwnModel | null, startRec: number) {
  const rows = buildMsgRows(sess, mode, ownModel);
  const picks: [OwnSel, number][] = [];
  const hook = renderHook(() => {
    const [cursorRec, setCursorRec] = useState(startRec);
    const [ownSel, setOwnSel] = useState<OwnSel | null>(null);
    const nav = useOwnNav({
      rows,
      own: ownModel,
      cursorRec,
      ownSel,
      jumpToRec: (r) => {
        setOwnSel(null);
        setCursorRec(r);
      },
      pickLine: (sel, r) => {
        picks.push([sel, r]);
        setOwnSel(sel);
        setCursorRec(r);
      },
    });
    return { nav, cursorRec, ownSel };
  });
  return { ...hook, rows, picks };
}

function key(k: string, opts: KeyboardEventInit = {}, target: EventTarget = window) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ownNavOf — 탐색 대상', () => {
  it('짝 결과 전제 — A → 210 · B 둘 → 220 · N 짝 없음 · C → 231', () => {
    expect(own.fills.map((f) => [f.orderNo, f.rec, f.state])).toEqual([
      ['A', R210, 'matched'],
      ['B', R220, 'matched'],
      ['B', R220, 'matched'],
      ['N', -1, 'nofill'],
      ['C', R231, 'matched'],
    ]);
  });

  it('거래소순 · 수신순 — 같은 A3 두 체결은 한 대상 · 자리 오름차순 · 순열마다 순서가 다르다', () => {
    const shape = (mode: TickOrderMode) => {
      const rows = buildMsgRows(sess, mode, own);
      const t = ownNavOf(rows, own);
      return Array.from(t, (p) => {
        const it = rows.items[p]!;
        return itemKindOf(it) === MSG_ITEM.ROW ? `R${sess.index.seq[itemIdxOf(it)]}` : `N${itemIdxOf(it)}`;
      });
    };
    expect(shape('exchange')).toEqual(['R210', 'R220', 'N3', 'R231']);
    expect(shape('recv')).toEqual(['R220', 'R210', 'N3', 'R231']);
  });

  it('own 체결 없음 = 빈 대상', () => {
    const empty = buildOwnModel(sess, respOf([]));
    expect(ownNavOf(buildMsgRows(sess, 'exchange', empty), empty).length).toBe(0);
  });
});

describe('useOwnNav — k/n · ‹ › · 줄 대상', () => {
  it('처음 대상 앞 = k 0 · prev null · 주문 수 = 그날 우리 주문', () => {
    const { result } = mount('exchange', own, -1);
    expect(result.current.nav).toMatchObject({ k: 0, n: 4, orders: 4, prev: null });
    expect(result.current.nav!.next).not.toBeNull();
  });

  it('대상 위 = 그 대상까지 센다 · 사이 = 앞 대상까지', () => {
    const on = mount('exchange', own, R220);
    expect(on.result.current.nav!.k).toBe(2);
    // B6 241 은 마지막 대상(231) 뒤 — k = n · next null
    const after = mount('exchange', own, 3);
    expect(after.result.current.nav).toMatchObject({ k: 4, n: 4, next: null });
    expect(after.result.current.nav!.prev).not.toBeNull();
  });

  it('› 를 차례로 — 210 → 220 → 짝 없음 줄(pickLine) → 231 · 끝에서 null · ‹ 로 돌아온다', () => {
    const { result, rows, picks } = mount('exchange', own, -1);
    act(() => result.current.nav!.next!());
    expect(result.current.cursorRec).toBe(R210);
    expect(result.current.nav!.k).toBe(1);
    act(() => result.current.nav!.next!());
    expect(result.current.cursorRec).toBe(R220);
    act(() => result.current.nav!.next!());
    // 짝 없음 줄 — 그 줄 선택 + 기준 전문(다음 첫 ROW)
    const nPos = rows.ownPosOfFill[3]!;
    expect(picks).toEqual([[{ kind: 'fill', id: 3 }, ownLineRec(rows, nPos)]]);
    expect(result.current.ownSel).toEqual({ kind: 'fill', id: 3 });
    expect(result.current.nav!.k).toBe(3);
    act(() => result.current.nav!.next!());
    expect(result.current.cursorRec).toBe(R231);
    expect(result.current.nav).toMatchObject({ k: 4, next: null });
    act(() => result.current.nav!.prev!());
    expect(result.current.ownSel).toEqual({ kind: 'fill', id: 3 });
    expect(result.current.nav!.k).toBe(3);
    act(() => result.current.nav!.prev!());
    expect(result.current.cursorRec).toBe(R220);
    expect(result.current.ownSel).toBeNull();
  });

  it('수신순이면 220 이 먼저', () => {
    const { result } = mount('recv', own, -1);
    act(() => result.current.nav!.next!());
    expect(result.current.cursorRec).toBe(R220);
  });

  it('주문 줄 · 조건 근거 행도 대상(UAT) — 근거 B6 241 → 주문 D 줄 · › 가 근거는 커서 · 주문 줄은 줄 선택', () => {
    // D: 호가 근거(ev_kind 1) — B6 241 의 매도 17,000 단 잔량 10 · 이벤트 gw 401ms(창 [g−3000, g+50] 안) · 체결 없음
    const evD: TickOwnEvent = {
      gateway: 'KB120', seq: 9, gw_time_ms: at(401), kind: 3, group: 1, account_no: '1234563801', order_no: 'D',
      price: 17000, qty: 10, reason_code: '', cond_metric: 0, cond_threshold: 0, cond_actual: 0, ev_kind: 1,
      ev_price: 17000, ev_qty_before: 0, ev_qty_after: 10, ev_trade_qty: 0, cum_volume: 0,
    };
    const ownD = buildOwnModel(sess, { ...respOf(FILLS), events: [evD] });
    const d = ownD.orders.find((o) => o.orderNo === 'D')!;
    expect(d.evidenceRec).toBe(3);
    const rows = buildMsgRows(sess, 'exchange', ownD);
    const shape = Array.from(ownNavOf(rows, ownD), (p) => {
      const it = rows.items[p]!;
      const k = itemKindOf(it);
      return k === MSG_ITEM.ROW ? `R${sess.index.seq[itemIdxOf(it)]}` : k === MSG_ITEM.ORDER ? `O${itemIdxOf(it)}` : `N${itemIdxOf(it)}`;
    });
    expect(shape).toEqual(['R210', 'R220', 'N3', 'R231', 'R241', `O${d.id}`]);

    const { result, picks } = mount('exchange', ownD, R231);
    expect(result.current.nav).toMatchObject({ k: 4, n: 6, orders: 5 });
    act(() => result.current.nav!.next!());
    expect(result.current.cursorRec).toBe(3);
    expect(result.current.ownSel).toBeNull();
    act(() => result.current.nav!.next!());
    expect(picks.at(-1)![0]).toEqual({ kind: 'order', id: d.id });
    expect(result.current.ownSel).toEqual({ kind: 'order', id: d.id });
    expect(result.current.nav).toMatchObject({ k: 6, next: null });
    act(() => result.current.nav!.prev!());
    expect(result.current.cursorRec).toBe(3);
    expect(result.current.ownSel).toBeNull();
  });

  it('own null · 체결 · 주문 없는 own → null', () => {
    expect(mount('exchange', null, 0).result.current.nav).toBeNull();
    expect(mount('exchange', buildOwnModel(sess, respOf([])), 0).result.current.nav).toBeNull();
  });

  it('같은 자리에서 다시 렌더해도 같은 상태 객체(올려도 갱신이 돌지 않는다)', () => {
    const { result, rerender } = mount('exchange', own, R220);
    const a = result.current.nav;
    rerender();
    expect(result.current.nav).toBe(a);
  });
});

describe('useOwnNav — 키 [ ]', () => {
  it('] = 다음 · [ = 이전 · 기본 동작을 막는다', () => {
    const { result } = mount('exchange', own, -1);
    const e = new KeyboardEvent('keydown', { key: ']', bubbles: true, cancelable: true });
    act(() => {
      window.dispatchEvent(e);
    });
    expect(e.defaultPrevented).toBe(true);
    expect(result.current.cursorRec).toBe(R210);
    key(']');
    expect(result.current.cursorRec).toBe(R220);
    key('[');
    expect(result.current.cursorRec).toBe(R210);
  });

  it('입력칸 · textarea · contenteditable 포커스면 무시', () => {
    const { result } = mount('exchange', own, -1);
    const input = document.createElement('input');
    const area = document.createElement('textarea');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.append(input, area, editable);
    for (const el of [input, area, editable]) key(']', {}, el);
    expect(result.current.cursorRec).toBe(-1);
  });

  it('Meta · Ctrl · Alt + ] 와 이미 처리된 이벤트는 무시', () => {
    const { result } = mount('exchange', own, -1);
    key(']', { metaKey: true });
    key(']', { ctrlKey: true });
    key(']', { altKey: true });
    const e = new KeyboardEvent('keydown', { key: ']', bubbles: true, cancelable: true });
    e.preventDefault();
    act(() => {
      window.dispatchEvent(e);
    });
    expect(result.current.cursorRec).toBe(-1);
  });

  it('own 없으면 키를 가로채지 않는다', () => {
    mount('exchange', null, 0);
    const e = new KeyboardEvent('keydown', { key: ']', bubbles: true, cancelable: true });
    act(() => {
      window.dispatchEvent(e);
    });
    expect(e.defaultPrevented).toBe(false);
  });
});
