import { describe, expect, it } from 'vitest';

import { a3Msg, b6Msg, synthNs, synthSession } from '@/test-fixtures/tick-synth';

import { dayReturnAt, dayReturnPointsOf } from '../candle-returns';
import { teamKpiAt } from '../team-model';
import { msOfNs } from '../tick-chart';

/**
 * Phase 42 Plan 02 Task 1 — 당일 수익률 시계열(D-14 · SC-4).
 *
 * 깨지면: 수익률 판 보라 선의 커서 값이 팀 거래정보 패널 「평단 대비 수익률」 과 다르다
 * (선은 패널과 같은 `teamKpiAt(…).pnl.ret` = 실현 + 미실현 ÷ 누적 매수 금액이어야 한다 — `(가격 − 평단) ÷ 평단` 이 아니다).
 */

const T13 = msOfNs(synthNs(0));

/** 합성 — 일반 1건(팀 첫 매수 전 · 호가 있음 = 0/0 아님) · 팀 매수 SMP 3조각 · 일반 1조각 · 팀 매도 · 일반 1건(team-model.test.ts 합성 하루 + 앞뒤 일반 체결). */
function teamDay() {
  return synthSession([
    [-5, a3Msg({ seq: 99, bs: '1', px: 16350, qty: 10, a1: 16400, b1: 16350, time: '125959995000' })],
    [0, b6Msg({ seq: 100, ask1: [16400, 283], bid1: [16350, 121] })],
    [1, a3Msg({ seq: 101, bs: '2', px: 16400, qty: 100, time: '130000001000' })],
    [1.1, a3Msg({ seq: 102, bs: '2', px: 16400, qty: 200, time: '130000001100' })],
    [1.2, a3Msg({ seq: 103, bs: '2', px: 16400, qty: 300, time: '130000001200' })],
    [1.5, b6Msg({ seq: 104, ask1: [16450, 10], bid1: [16400, 20] })],
    [2, a3Msg({ seq: 105, bs: '1', px: 16350, qty: 50, a1: 16400, b1: 16350, time: '130000002000' })],
    [2.5, b6Msg({ seq: 106, ask1: [16400, 1], bid1: [16350, 2] })],
    [5, a3Msg({ seq: 107, bs: '1', px: 16300, qty: 400, time: '130000005000' })],
    [5.5, b6Msg({ seq: 108, ask1: [16400, 1], bid1: [16300, 2] })],
    [8, a3Msg({ seq: 109, bs: '2', px: 16350, qty: 5, a1: 16350, b1: 16300, time: '130000008000' })],
  ]);
}

describe('당일 수익률', () => {
  const s = teamDay();
  const recOfSeq = (seq: number) => {
    for (let r = 0; r < s.index.n; r++) if (s.index.seq[r] === seq) return r;
    throw new Error(`seq ${seq} 없음`);
  };
  const view = { t0: T13 - 10, t1: T13 + 10 };
  const panelRet = (rec: number) => teamKpiAt(s.team, s, rec).pnl?.ret ?? null;

  it('전제 — 합성 하루 팀 체결 4건(앞뒤 일반 체결은 팀이 아니다)', () => {
    expect(s.team.fills.map((f) => f.qty)).toEqual([100, 200, 300, 400]);
  });

  it('모든 점 값 = teamKpiAt(team, session, rec).pnl.ret(패널과 같은 함수 — 비트까지 같다)', () => {
    const pts = dayReturnPointsOf(s, view, 200, -1);
    expect(pts.length).toBeGreaterThan(3);
    expect(pts.some((p) => p.v !== null)).toBe(true);
    for (const p of pts) {
      expect(p.v).toBe(panelRet(p.rec));
      expect(p.t).toBe(msOfNs(s.index.recvNs[p.rec]!));
    }
  });

  it('커서 rec 를 주면 그 rec 의 점이 반드시 있고 값 = 패널 계산 · 커서 −1 이면 커서 점 없음', () => {
    const cursor = recOfSeq(104); // B6 — 열 샘플(A3 rec)에는 안 잡힌다
    const withCur = dayReturnPointsOf(s, view, 200, cursor);
    const hit = withCur.filter((p) => p.rec === cursor);
    expect(hit).toHaveLength(1);
    expect(hit[0]!.v).toBe(panelRet(cursor));
    expect(hit[0]!.v).not.toBeNull();
    expect(dayReturnPointsOf(s, view, 200, -1).some((p) => p.rec === cursor)).toBe(false);
  });

  it('보기 창 안 팀 체결 rec 이 모두 점으로 들어 있다 · 점은 t 오름차순', () => {
    const pts = dayReturnPointsOf(s, view, 3, -1);
    const recs = new Set(pts.map((p) => p.rec));
    for (const f of s.team.fills) expect(recs.has(f.rec)).toBe(true);
    for (let i = 1; i < pts.length; i++) expect(pts[i]!.t).toBeGreaterThanOrEqual(pts[i - 1]!.t);
    // 창 밖 팀 체결은 넣지 않는다
    const late = dayReturnPointsOf(s, { t0: T13 + 6, t1: T13 + 10 }, 200, -1);
    for (const f of s.team.fills) expect(late.some((p) => p.rec === f.rec)).toBe(false);
  });

  it('팀 첫 매수 전 시각의 점은 v null(선 끊김) · 첫 매수 뒤는 값', () => {
    const pts = dayReturnPointsOf(s, view, 200, -1);
    const firstFillMs = msOfNs(s.index.recvNs[s.team.fills[0]!.rec]!);
    const before = pts.filter((p) => p.t < firstFillMs);
    expect(before.length).toBeGreaterThan(0);
    for (const p of before) expect(p.v).toBeNull();
    const after = pts.filter((p) => p.t >= firstFillMs);
    expect(after.length).toBeGreaterThan(0);
    for (const p of after) expect(p.v).not.toBeNull();
  });

  it('팀 체결이 하나도 없는 세션 → []', () => {
    const none = synthSession([
      [0, b6Msg({ seq: 100, ask1: [16400, 283], bid1: [16350, 121] })],
      [1, a3Msg({ seq: 101, bs: '1', px: 16350, qty: 10, a1: 16400, b1: 16350, time: '130000001000' })],
      [2, a3Msg({ seq: 102, bs: '2', px: 16400, qty: 20, a1: 16400, b1: 16350, time: '130000002000' })],
    ]);
    expect(none.team.fills).toHaveLength(0);
    expect(dayReturnPointsOf(none, view, 200, -1)).toEqual([]);
    expect(dayReturnPointsOf(none, view, 200, 1)).toEqual([]);
  });

  it('그림 폭 3px 창이면 열 점은 많아야 3개(+ 팀 체결 · 커서)', () => {
    const cursor = recOfSeq(104);
    const pts = dayReturnPointsOf(s, view, 3, cursor);
    const fillRecs = new Set(s.team.fills.map((f) => f.rec));
    const colPts = pts.filter((p) => !fillRecs.has(p.rec) && p.rec !== cursor);
    expect(colPts.length).toBeLessThanOrEqual(3);
    expect(pts.length).toBeLessThanOrEqual(3 + fillRecs.size + 1);
    // 1px 미만 폭도 열 하나
    expect(dayReturnPointsOf(s, view, 0, -1).filter((p) => !fillRecs.has(p.rec)).length).toBeLessThanOrEqual(1);
  });

  it('dayReturnAt — rec −1 = null · 그 밖은 패널 값 그대로', () => {
    expect(dayReturnAt(s, -1)).toBeNull();
    expect(dayReturnAt(s, recOfSeq(99))).toBeNull();
    const r = recOfSeq(108);
    expect(dayReturnAt(s, r)).toBe(panelRet(r));
    // 매도 뒤 실현 −40만 + 미실현 −20만 ÷ 매수 984만
    expect(dayReturnAt(s, r)).toBeCloseTo((400 * (16300 - 16400) + 200 * (16300 - 16400)) / 9_840_000, 12);
  });
});
