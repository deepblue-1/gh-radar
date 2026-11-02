import { describe, it, expect } from 'vitest';

import type { TeamflowRow } from '@gh-radar/shared';

import { accumJumpMs, limitupJumpMs, teamflowJumpMs, tickHrefOf } from '../tick-link';

/**
 * Phase 37 Plan 11 — 세 보고서 「틱 보기 ›」 링크(D-17). 시각은 KST 로 적고 `+09:00` 으로 epoch ms 를 만든다.
 */

const ms = (kstIso: string) => Date.parse(`${kstIso}+09:00`);
const ISIN = 'KR7101360006';

describe('tickHrefOf', () => {
  it('epoch ms → KST HH:MM:SS.mmm 로 t · 기본 거래소 KRX 는 뺀다(tickUrlOf 정본)', () => {
    expect(tickHrefOf({ isin: ISIN, date: '20261016', ms: ms('2026-10-16T09:07:50.300') })).toBe(
      `/analytics/ticks?isin=${ISIN}&d=20261016&t=09%3A07%3A50.300`,
    );
  });

  it('밀리초 0 · 오후 시각 · 자정 넘김 없이 그날 KST 시각', () => {
    expect(tickHrefOf({ isin: ISIN, date: '20261016', ms: 1792130100000 })).toBe(
      `/analytics/ticks?isin=${ISIN}&d=20261016&t=14%3A55%3A00.000`,
    );
  });

  it('ms 가 null · undefined 면 t 없이', () => {
    expect(tickHrefOf({ isin: ISIN, date: '20261016', ms: null })).toBe(`/analytics/ticks?isin=${ISIN}&d=20261016`);
    expect(tickHrefOf({ isin: ISIN, date: '20261016' })).toBe(`/analytics/ticks?isin=${ISIN}&d=20261016`);
  });

  it('시각의 KST 날짜가 date 와 다르면(이월 행 등록 시각) t 없이', () => {
    expect(tickHrefOf({ isin: ISIN, date: '20261016', ms: ms('2026-10-14T13:02:11.000') })).toBe(
      `/analytics/ticks?isin=${ISIN}&d=20261016`,
    );
    // UTC 로는 전날(10/15 23:30Z)이지만 KST 로는 10/16 08:30 — 같은 날로 본다
    expect(tickHrefOf({ isin: ISIN, date: '20261016', ms: ms('2026-10-16T08:30:00.000') })).toBe(
      `/analytics/ticks?isin=${ISIN}&d=20261016&t=08%3A30%3A00.000`,
    );
  });

  it('NXT 는 ex 를 싣는다', () => {
    expect(tickHrefOf({ isin: ISIN, date: '20261016', ms: null, ex: 'NXT' })).toBe(
      `/analytics/ticks?isin=${ISIN}&d=20261016&ex=NXT`,
    );
  });
});

describe('accumJumpMs', () => {
  it('reg_time_ms 그대로 · 없으면 null', () => {
    expect(accumJumpMs({ reg_time_ms: 1792130100000 })).toBe(1792130100000);
    expect(accumJumpMs({ reg_time_ms: null })).toBeNull();
  });
});

describe('teamflowJumpMs — reach.t_ms ?? first_limit_ms ?? t20_ms', () => {
  const reach = { t_ms: 300, buy: 1, team: 1, team_val: 1 };
  const row = (p: Partial<Pick<TeamflowRow, 'first_limit_ms' | 't20_ms'>> & { reach?: typeof reach | null }) =>
    ({
      first_limit_ms: p.first_limit_ms ?? null,
      t20_ms: p.t20_ms,
      payload: p.reach === undefined ? null : ({ reach: p.reach } as TeamflowRow['payload']),
    }) as Pick<TeamflowRow, 'payload' | 'first_limit_ms' | 't20_ms'>;

  it('reach 가 있으면 reach.t_ms', () => {
    expect(teamflowJumpMs(row({ reach, first_limit_ms: 200, t20_ms: 100 }))).toBe(300);
  });
  it('reach 없음 → first_limit_ms', () => {
    expect(teamflowJumpMs(row({ reach: null, first_limit_ms: 200, t20_ms: 100 }))).toBe(200);
  });
  it('상한가 미도달 → t20_ms', () => {
    expect(teamflowJumpMs(row({ reach: null, first_limit_ms: null, t20_ms: 100 }))).toBe(100);
  });
  it('payload 없음 · 옛 RPC(t20_ms 키 없음) → null', () => {
    expect(teamflowJumpMs(row({}))).toBeNull();
  });
});

describe('limitupJumpMs — first_upper_ms ?? t20_ms', () => {
  it('상한 도달이면 first_upper_ms', () => {
    expect(limitupJumpMs({ first_upper_ms: 200, t20_ms: 100 })).toBe(200);
  });
  it('미도달이면 t20_ms', () => {
    expect(limitupJumpMs({ first_upper_ms: null, t20_ms: 100 })).toBe(100);
  });
  it('둘 다 없으면 null', () => {
    expect(limitupJumpMs({ first_upper_ms: null, t20_ms: null })).toBeNull();
  });
});
