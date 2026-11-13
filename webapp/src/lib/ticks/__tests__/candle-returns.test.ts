import { describe, expect, it } from 'vitest';

import type { PricePoint } from '@/lib/accum-chart';
import { a3Msg, b6Msg, synthNs, synthSession } from '@/test-fixtures/tick-synth';

import {
  cumAvgAt,
  cumReturnPointsOf,
  dayReturnAt,
  dayReturnPointsOf,
  fmtReturnTick,
  returnPathOf,
  returnScalesOf,
  RETURN_PAD_ABS,
  RETURN_PAD_RATIO,
  RETURN_Z_MAX,
  RETURN_Z_MIN,
  withCursorReturnPoint,
  type ReturnPoint,
} from '../candle-returns';
import { teamKpiAt } from '../team-model';
import { msOfNs, priceIdxAt, priceSeriesOf } from '../tick-chart';
import { MINUS } from '../tick-format';

/**
 * Phase 42 Plan 02 — 수익률 판 계산(D-13 · D-14 · D-15 · SC-4 · SC-5 · UI-SPEC S6).
 *
 * 깨지면: 수익률 판 보라 선의 커서 값이 팀 거래정보 패널 「평단 대비 수익률」 과 다르다
 * (선은 패널과 같은 `teamKpiAt(…).pnl.ret` = 실현 + 미실현 ÷ 누적 매수 금액이어야 한다 — `(가격 − 평단) ÷ 평단` 이 아니다) ·
 * 누적 수익률(회색 · 미실현만 = (가격 − 누적 평단) ÷ 누적 평단)이 평단 0 구간을 잇거나 · 두 눈금의 0% 가 서로 다른 높이에 그려진다.
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
    // 창 밖 팀 체결은 넣지 않는다(창 [8.5ms, 10ms] — 열 샘플은 일반 체결 109 하나뿐)
    const late = dayReturnPointsOf(s, { t0: T13 + 8.5, t1: T13 + 10 }, 200, -1);
    expect(late.map((p) => p.rec)).toEqual([recOfSeq(109)]);
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

  it('withCursorReturnPoint — 창 안 커서는 커서 넣은 dayReturnPointsOf 와 같다 · −1 · 창 밖 · 이미 있는 rec · 팀 없음은 base 그대로(IN-02)', () => {
    const base = dayReturnPointsOf(s, view, 200, -1);
    // 창 안 모든 rec(B6 · A3 · 팀 체결 · 같은 ms 거래소순)에서 처음부터 만든 결과와 같다
    for (let r = 0; r < s.index.n; r++) {
      const ms = msOfNs(s.index.recvNs[r]!);
      if (ms < view.t0 || ms > view.t1) continue;
      expect(withCursorReturnPoint(base, s, view, r)).toEqual(dayReturnPointsOf(s, view, 200, r));
    }
    expect(withCursorReturnPoint(base, s, view, -1)).toBe(base);
    // 창 밖 커서(창 [8.5ms, 10ms] 에서 seq 104) — 점을 넣지 않는다(같은 객체)
    const lateView = { t0: T13 + 8.5, t1: T13 + 10 };
    const lateBase = dayReturnPointsOf(s, lateView, 200, -1);
    expect(withCursorReturnPoint(lateBase, s, lateView, recOfSeq(104))).toBe(lateBase);
    // 이미 점에 있는 rec(팀 체결)
    expect(withCursorReturnPoint(base, s, view, s.team.fills[0]!.rec)).toBe(base);
    // 팀 체결 없는 하루
    const none = synthSession([[1, a3Msg({ seq: 1, bs: '1', px: 16350, qty: 10, a1: 16400, b1: 16350, time: '130000001000' })]]);
    const noneBase = dayReturnPointsOf(none, view, 200, -1);
    expect(withCursorReturnPoint(noneBase, none, view, 0)).toBe(noneBase);
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

/** 합성 — 일반 체결만(팀 없음) · 1 ~ 8ms 매 1ms 가격 14,300. */
function flatDay() {
  const msgs: [number, Uint8Array][] = [[0, b6Msg({ seq: 100, ask1: [14350, 10], bid1: [14300, 10] })]];
  for (let k = 1; k <= 8; k++) {
    msgs.push([
      k,
      a3Msg({ seq: 100 + k * 2, bs: k % 2 ? '1' : '2', px: 14300, qty: 10, a1: 14350, b1: 14300, time: `13000000${k}000` }),
    ]);
  }
  return synthSession(msgs);
}

describe('누적 수익률', () => {
  it('cumAvgAt — 첫 점 전 null · 계단 값 · px 0 구간 null · 같은 ms 두 점이면 뒤 점', () => {
    const pts: PricePoint[] = [
      [1000, 13000],
      [2000, 0],
      [3000, 13500],
    ];
    expect(cumAvgAt(pts, 999)).toBeNull();
    expect(cumAvgAt(pts, 1000)).toBe(13000);
    expect(cumAvgAt(pts, 1999.5)).toBe(13000);
    expect(cumAvgAt(pts, 2000)).toBeNull();
    expect(cumAvgAt(pts, 2999)).toBeNull();
    expect(cumAvgAt(pts, 3000)).toBe(13500);
    expect(cumAvgAt(pts, 9e12)).toBe(13500);
    expect(cumAvgAt([], 1000)).toBeNull();
    const dupUp: PricePoint[] = [
      [1000, 13000],
      [1000, 14000],
    ];
    expect(cumAvgAt(dupUp, 1000)).toBe(14000);
    const dupZero: PricePoint[] = [
      [1000, 13000],
      [1000, 0],
    ];
    expect(cumAvgAt(dupZero, 1000)).toBeNull();
  });

  it('누적 평단 [] → [] · 가격 14,300 · 누적 평단 13,000 → v ≈ 0.1(미실현만 — 당일 수익률과 정의가 다르다)', () => {
    const s = flatDay();
    const view = { t0: T13, t1: T13 + 10 };
    expect(cumReturnPointsOf(s, view, 100, [])).toEqual([]);
    const pts = cumReturnPointsOf(s, view, 100, [[T13 - 3_600_000, 13000]]);
    expect(pts.length).toBeGreaterThan(3);
    const series = priceSeriesOf(s);
    for (const p of pts) {
      expect(p.v).toBeCloseTo(0.1, 12);
      expect(p.rec).toBe(series.rec[priceIdxAt(series, p.t)]);
    }
    for (let i = 1; i < pts.length; i++) expect(pts[i]!.t).toBeGreaterThanOrEqual(pts[i - 1]!.t);
  });

  it('px 0 구간 열은 null(끊김) · 계단 바뀌는 시각마다 점 하나 · 가격 전 계단 점은 null · rec −1', () => {
    const s = flatDay();
    const view = { t0: T13, t1: T13 + 10 };
    const cum: PricePoint[] = [
      [T13 + 0.5, 13000],
      [T13 + 3.5, 0],
      [T13 + 6.5, 13500],
    ];
    const pts = cumReturnPointsOf(s, view, 100, cum);
    for (const p of pts) {
      if (p.t < T13 + 1) {
        expect(p.v).toBeNull();
        expect(p.rec).toBe(-1);
      } else if (p.t < T13 + 3.5) expect(p.v).toBeCloseTo(0.1, 12);
      else if (p.t < T13 + 6.5) expect(p.v).toBeNull();
      else expect(p.v).toBeCloseTo((14300 - 13500) / 13500, 12);
    }
    for (const [t] of cum) expect(pts.some((p) => p.t === t)).toBe(true);
    expect(pts.some((p) => p.t > T13 + 3.5 && p.t < T13 + 6.5 && p.v === null)).toBe(true);
  });
});

const line = (vs: (number | null)[]): ReturnPoint[] => vs.map((v, i) => ({ t: i, v, rec: i }));

describe('두 눈금', () => {
  const yRa = 120;
  const yRb = 170;
  const top = yRa + 4;
  const bottom = yRb - 3;
  const pad = (a: number) => a * (1 + RETURN_PAD_RATIO) + RETURN_PAD_ABS;

  it('상수 — 여유 12% + 0.05%p · z 0.15 ~ 0.85', () => {
    expect([RETURN_PAD_RATIO, RETURN_PAD_ABS, RETURN_Z_MIN, RETURN_Z_MAX]).toEqual([0.12, 0.0005, 0.15, 0.85]);
  });

  it('당일 위 0.03 · 누적 위 0.25 아래 0.02 → z = 두 선 z 중 큰 쪽을 0.85 로 묶음 · 0% 한 줄 · 끝 값 = 판 끝', () => {
    const d = line([0, 0.01, 0.03, null]);
    const c = line([0.25, -0.02, 0.1]);
    const sc = returnScalesOf(d, c, yRa, yRb);
    const zDay = pad(0.03) / (pad(0.03) + pad(0));
    const zCum = pad(0.25) / (pad(0.25) + pad(0.02));
    expect(zDay).toBeGreaterThan(0.85);
    expect(sc.z).toBe(Math.min(RETURN_Z_MAX, Math.max(RETURN_Z_MIN, Math.max(zDay, zCum))));
    expect(sc.z).toBe(0.85);
    expect(sc.top).toBe(top);
    expect(sc.bottom).toBe(bottom);
    expect(sc.zeroY).toBeCloseTo(top + 0.85 * (bottom - top), 12);
    expect(sc.yDay(0)).toBe(sc.zeroY);
    expect(sc.yCum).not.toBeNull();
    expect(sc.yCum!(0)).toBe(sc.zeroY);
    // 단위 = max(위 ÷ z, 아래 ÷ (1 − z)) — 위 · 아래 끝 중 하나 이상이 판 끝에 닿는다
    const uDay = Math.max(pad(0.03) / 0.85, pad(0) / 0.15);
    expect(sc.dayTop).toBeCloseTo(0.85 * uDay, 12);
    expect(sc.dayBottom).toBeCloseTo(-0.15 * uDay, 12);
    const hitsDay = Math.abs(sc.yDay(sc.dayTop) - top) < 1e-9 || Math.abs(sc.yDay(sc.dayBottom) - bottom) < 1e-9;
    expect(hitsDay).toBe(true);
    const hitsCum =
      Math.abs(sc.yCum!(sc.cumTop!) - top) < 1e-9 || Math.abs(sc.yCum!(sc.cumBottom!) - bottom) < 1e-9;
    expect(hitsCum).toBe(true);
    // 모든 점 y 가 그림 영역 안
    for (const p of d) {
      if (p.v === null) continue;
      expect(sc.yDay(p.v)).toBeGreaterThanOrEqual(top - 1e-9);
      expect(sc.yDay(p.v)).toBeLessThanOrEqual(bottom + 1e-9);
    }
    for (const p of c) {
      if (p.v === null) continue;
      expect(sc.yCum!(p.v)).toBeGreaterThanOrEqual(top - 1e-9);
      expect(sc.yCum!(p.v)).toBeLessThanOrEqual(bottom + 1e-9);
    }
  });

  it('z 가 묶음 안이면 큰 쪽 그대로 · 아래로만 가면 0.15 로 묶음', () => {
    const a = returnScalesOf(line([0.02, -0.02]), line([0.01, -0.03]), yRa, yRb);
    expect(a.z).toBeCloseTo(0.5, 12);
    const b = returnScalesOf(line([-0.05, -0.01]), [], yRa, yRb);
    expect(b.z).toBe(0.15);
    expect(b.yDay(-0.05)).toBeLessThanOrEqual(bottom + 1e-9);
    expect(b.yDay(b.dayBottom)).toBeCloseTo(bottom, 9);
  });

  it('두 선 다 비면 z = 0.5 · 누적이 비면 yCum · 누적 눈금 null', () => {
    const e = returnScalesOf([], [], yRa, yRb);
    expect(e.z).toBe(0.5);
    expect(e.zeroY).toBe(top + 0.5 * (bottom - top));
    expect(e.yDay(0)).toBe(e.zeroY);
    expect(e.yCum).toBeNull();
    expect(e.cumTop).toBeNull();
    expect(e.cumBottom).toBeNull();
    // 값이 전부 null 인 선도 빈 선
    const n = returnScalesOf(line([null, null]), line([null]), yRa, yRb);
    expect(n.z).toBe(0.5);
    expect(n.yCum).toBeNull();
  });

  it('returnPathOf — null 에서 하위 경로가 끊긴다(M 둘) · 점 하나면 빈 문자열', () => {
    const x = (t: number) => t * 10;
    const y = (v: number) => v * 100;
    const d = returnPathOf(line([0.1, 0.2, null, 0.1, 0]), x, y);
    expect(d).toBe('M0,10L10,20M30,10L40,0');
    expect(d.match(/M/g)).toHaveLength(2);
    expect(returnPathOf(line([0.1]), x, y)).toBe('');
    expect(returnPathOf(line([0.1, null, 0.2]), x, y)).toBe('');
    expect(returnPathOf([], x, y)).toBe('');
  });
});

describe('눈금 글자', () => {
  it('부호 + 소수 1자리 퍼센트 · 0 은 「0.0%」 · 음수 기호 MINUS', () => {
    expect(fmtReturnTick(0.032)).toBe('+3.2%');
    expect(fmtReturnTick(-0.015)).toBe(`${MINUS}1.5%`);
    expect(fmtReturnTick(0)).toBe('0.0%');
    expect(fmtReturnTick(-0.00004)).toBe('0.0%');
    expect(fmtReturnTick(0.00004)).toBe('0.0%');
    expect(fmtReturnTick(0.25)).toBe('+25.0%');
  });
});
