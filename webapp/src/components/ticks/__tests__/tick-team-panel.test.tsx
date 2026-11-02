import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { fmtTickTime, type TickOpenResponse } from '@gh-radar/shared';

import { teamKpiAt } from '@/lib/ticks/team-model';
import { tickBoundsOf } from '@/lib/ticks/tick-chart';
import { tickFixtureBytes, tickFixtureJson } from '@/test-fixtures/tick-grid';
import { SYNTH_DATE, a3Msg, b6Msg, b9Msg, synthSession } from '@/test-fixtures/tick-synth';
import { buildTickSession } from '@/lib/ticks/tick-session';

import { TickTeamPanel } from '../tick-team-panel';

/**
 * Phase 37 Plan 14 Task 3 — 팀 거래정보 패널(D-10 · D-11 · D-12 · D-13).
 *
 * 깨지면: 틱을 옮겨도 손익이 그대로거나(선택 틱) · 상위 5 밖 창구에 0 이 찍혀 「안 샀다」 로 읽히거나(「—」) · 최소치 캡션이
 * 빠져 팀 포지션을 과신하거나 · NXT 수치가 KRX 와 합산된 것처럼 읽힌다.
 */

const B = tickBoundsOf(SYNTH_DATE);

const s = synthSession([
  [0, b6Msg({ seq: 100, ask1: [16400, 283], bid1: [16350, 121] })],
  [1, a3Msg({ seq: 101, bs: '2', px: 16400, qty: 100, time: '130000001000' })],
  [1.1, a3Msg({ seq: 102, bs: '2', px: 16400, qty: 200, time: '130000001100' })],
  [1.2, a3Msg({ seq: 103, bs: '2', px: 16400, qty: 300, time: '130000001200' })],
  [1.5, b6Msg({ seq: 104, ask1: [16450, 10], bid1: [16400, 20] })],
  [3, b9Msg({ sell: [['00003', 1200, 19_680_000]], buy: [['00001', 3400, 55_760_000], ['00012', 500, 8_200_000]] })],
  [5, a3Msg({ seq: 107, bs: '1', px: 16300, qty: 400, time: '130000005000' })],
  [5.5, b6Msg({ seq: 108, ask1: [16400, 1], bid1: [16300, 2] })],
]);

const recOfSeq = (seq: number) => {
  for (let r = 0; r < s.index.n; r++) if (s.index.seq[r] === seq) return r;
  throw new Error(`seq ${seq} 없음`);
};
const B9_REC = 5;

function slot(c: HTMLElement, name: string) {
  return c.querySelector(`[data-slot="${name}"]`)?.textContent ?? null;
}

describe('TickTeamPanel — KPI(선택 틱까지)', () => {
  it('첫 체결 전 — 순매수 「—」 · B9 없음 · 최소치 캡션은 늘', () => {
    const { container } = render(<TickTeamPanel session={s} cursorRec={0} />);
    expect(slot(container, 'tick-team-day-net')).toBe('—');
    expect(slot(container, 'tick-team-members-empty')).toBe('아직 B9 없음');
    const cap = slot(container, 'tick-team-caption')!;
    expect(cap).toContain('B9 없음 · ≈1분 해상도');
    expect(cap).toContain('우리 체결 포함 · 호가 걸어 둔 팀 주문 미포함(최소치)');
    expect(cap).not.toContain('NXT');
  });

  it('매수 끝 조각 — 순매수 +984만 · +600주 · 평단 16,400원 · 수익률 0.00% (= teamKpiAt)', () => {
    const rec = recOfSeq(103);
    const kpi = teamKpiAt(s.team, s, rec);
    const { container } = render(<TickTeamPanel session={s} cursorRec={rec} />);
    expect(kpi.dayNetVal).toBe(9_840_000);
    expect(slot(container, 'tick-team-day-net')).toBe('+984만');
    expect(slot(container, 'tick-team-day-net-sub')).toBe('+600주');
    expect(slot(container, 'tick-team-avg')).toBe('16,400원');
    expect(slot(container, 'tick-team-avg-sub')).toBe('잔량 600주');
    expect(slot(container, 'tick-team-ret')).toBe('0.00%');
  });

  it('매도 뒤 — 순매수 +332만 · 수익률 = (실현 + 미실현) ÷ 매수 금액 · 실현/미실현 작은 글자', () => {
    const rec = recOfSeq(108);
    const kpi = teamKpiAt(s.team, s, rec);
    const { container } = render(<TickTeamPanel session={s} cursorRec={rec} />);
    expect(slot(container, 'tick-team-day-net')).toBe('+332만');
    expect(slot(container, 'tick-team-day-net-sub')).toBe('+200주');
    // 실현 −4만 · 미실현 −2만 · 매수 984만 → −0.61%
    expect(kpi.pnl!.ret).toBeCloseTo(-60_000 / 9_840_000, 12);
    expect(slot(container, 'tick-team-ret')).toBe('−0.61%');
    expect(slot(container, 'tick-team-ret-sub')).toBe('실현 −4만 · 미실현 −2만');
  });
});

describe('TickTeamPanel — 5창구 B9 · 누적 · NXT', () => {
  it('선택 틱 시점 마지막 B9 그대로 — 교보 매수 3,400 · 5,576만 · 한국 매도 · 상위 5 밖은 「—」 · 캡션 시각', () => {
    const rec = recOfSeq(108);
    const { container } = render(<TickTeamPanel session={s} cursorRec={rec} />);
    const row = (m: string) =>
      Array.from(container.querySelectorAll(`tr[data-member="${m}"] td`)).map((td) => td.textContent);
    expect(row('00001')).toEqual(['3,400', '5,576만', '—', '—']);
    expect(row('00003')).toEqual(['—', '—', '1,200', '1,968만']);
    expect(row('00012')).toEqual(['500', '820만', '—', '—']);
    expect(row('00008')).toEqual(['—', '—', '—', '—']);
    expect(row('00002')).toEqual(['—', '—', '—', '—']);
    const hhmmss = fmtTickTime(s.index.recvNs[B9_REC]!).slice(0, 8);
    expect(slot(container, 'tick-team-caption')).toContain(`B9 ${hhmmss} 기준 · ≈1분 해상도`);
  });

  it('누적 — pos_net 있으면 커서 시각 이하 마지막 점 · 없으면 「—」 + 매집감지 미등록 · 당일이면 누적 없음', () => {
    const accum: TickOpenResponse['accum'] = {
      reg_time_ms: B.T0900,
      pos_net: { t_ms: [B.T0900, B.T0900 + 3_600_000 * 5], net_krw: [1_240_000_000, 1_300_000_000], cycle: [1, 1] },
    };
    const rec = recOfSeq(103); // 13:00 — 두 번째 점(14:00) 전
    const a = render(<TickTeamPanel session={s} cursorRec={rec} accum={accum} />);
    expect(slot(a.container, 'tick-team-cum')).toBe('+12.4억');
    const none = render(<TickTeamPanel session={s} cursorRec={rec} accum={null} />);
    expect(slot(none.container, 'tick-team-cum-none')).toBe('—');
    expect(slot(none.container, 'tick-team-cum-none-sub')).toBe('매집감지 미등록');
    const today = render(<TickTeamPanel session={s} cursorRec={rec} accum={accum} isToday />);
    expect(slot(today.container, 'tick-team-cum')).toBeNull();
    expect(slot(today.container, 'tick-team-cum-none-sub')).toBe('당일 — 누적 선 없음');
  });

  it('NXT 컷 — 캡션에 「NXT 런 규칙 · KRX 와 합산 안 함」 · 마지막 틱 KPI = teamKpiAt(그 거래소 팀만)', () => {
    const nxt = buildTickSession(tickFixtureBytes('cut1300-nxt.ticks.zst'), { date: '20261016', ex: 'NXT' });
    const last = nxt.exOrder[nxt.exOrder.length - 1]!;
    const kpi = teamKpiAt(nxt.team, nxt, last);
    const { container } = render(<TickTeamPanel session={nxt} cursorRec={last} />);
    expect(slot(container, 'tick-team-caption')).toContain('NXT 런 규칙(한 가격 2조각 이상) · KRX 와 합산 안 함');
    expect(kpi.k).toBe(nxt.team.prefix.n);
    expect(kpi.k).toBeGreaterThan(0);
    expect(slot(container, 'tick-team-day-net')).not.toBe('—');
  });

  it('천일 10/14 마지막 틱 — 수익률 +1.18% · 실현 +2,862만 · 미실현 +316만(export payload.pnl 그대로)', () => {
    const golden = tickFixtureJson<{ accum: { ret: number } }>('chunil-1014.pnl.json');
    const ch = buildTickSession(tickFixtureBytes('chunil-1014-a3.ticks.zst'), { date: '20261014', ex: 'KRX' });
    const last = ch.exOrder[ch.exOrder.length - 1]!;
    const { container } = render(<TickTeamPanel session={ch} cursorRec={last} />);
    expect(golden.accum.ret).toBeCloseTo(0.0118, 4);
    expect(slot(container, 'tick-team-ret')).toBe('+1.18%');
    expect(slot(container, 'tick-team-ret-sub')).toBe('실현 +2,862만 · 미실현 +316만');
    expect(slot(container, 'tick-team-avg-sub')).toBe('잔량 3,406주');
  });
});
