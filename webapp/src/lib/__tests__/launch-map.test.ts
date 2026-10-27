import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { LaunchHeadRow } from '@gh-radar/shared';

import {
  LAUNCH_CHART,
  launchAxisOf,
  launchDateLabelOf,
  launchGateBandOf,
  launchStackOf,
  launchTicksOf,
  mapNextOffsetOf,
  xOfUs,
} from '../launch-map';

/**
 * Phase 35 (35-07) — 경계 지도 패널 순수 기하 (D-16 · D-17 · D-18 · Pitfall 4).
 *
 * 입력 = shared 픽스처 `launch-pieces-1012-1026.json`(gh-trade 첨부 pieces.json 바이트 사본) + 첨부 NEXT
 * (KB 코스닥 −337 · KB 코스피 −285 · 교보 코스닥 −526 · 교보 코스피 −400). 기대 축 = 35-RESEARCH 「축(첨부 식)」 열.
 */

interface AttachRow {
  date: string;
  broker: string;
  market: string;
  rel: number;
}

const RAW = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../../../packages/shared/src/__fixtures__/launch-pieces-1012-1026.json'), 'utf8'),
) as AttachRow[];

function relsOf(broker: string, market: string): number[] {
  return RAW.filter((r) => r.broker === broker && r.market === market).map((r) => r.rel);
}

const { L, R, W_MIN } = LAUNCH_CHART;
const LEFT = L;
const RIGHT = W_MIN - R;
const PLOT = RIGHT - LEFT;

describe('launchAxisOf — 첨부 4패널 축(첨부 식)', () => {
  it.each([
    ['KB', '코스닥', -337, -360, -280],
    ['KB', '코스피', -285, -320, -250],
    ['교보', '코스닥', -526, -560, -460],
    ['교보', '코스피', -400, -430, -350],
  ])('%s %s · next %d → %d ~ %d', (broker, market, next, xmin, xmax) => {
    const axis = launchAxisOf(relsOf(broker, market), next, 'q16');
    expect([axis.xmin, axis.xmax]).toEqual([xmin, xmax]);
  });

  it('offAxis — 안 null · 왼쪽 밖 lo · 오른쪽 밖 hi', () => {
    const axis = launchAxisOf(relsOf('KB', '코스닥'), -337, 'q16');
    expect(axis.offAxis(-340)).toBeNull();
    expect(axis.offAxis(-360)).toBeNull();
    expect(axis.offAxis(-361)).toBe('lo');
    expect(axis.offAxis(-279)).toBe('hi');
  });

  it('values 가 비면 next 를 중심으로 좁은 축', () => {
    const axis = launchAxisOf([], -245, 'n0930');
    expect([axis.xmin, axis.xmax]).toEqual([-248, -242]);
  });
});

describe('launchTicksOf', () => {
  it('KB 코스닥 축(−360~−280) · plotPx 568 → step 10 · 9개', () => {
    const axis = launchAxisOf(relsOf('KB', '코스닥'), -337, 'q16');
    expect(PLOT).toBe(568);
    const t = launchTicksOf(axis, PLOT);
    expect(t.step).toBe(10);
    expect(t.values).toEqual([-360, -350, -340, -330, -320, -310, -300, -290, -280]);
  });
});

describe('xOfUs', () => {
  const axis = launchAxisOf(relsOf('KB', '코스닥'), -337, 'q16');
  it('선형 — xmin = left · xmax = right · 가운데', () => {
    expect(xOfUs(-360, axis, LEFT, RIGHT)).toBe(LEFT);
    expect(xOfUs(-280, axis, LEFT, RIGHT)).toBe(RIGHT);
    expect(xOfUs(-320, axis, LEFT, RIGHT)).toBeCloseTo(LEFT + PLOT / 2, 6);
  });
  it('축 밖은 끝으로 고정', () => {
    expect(xOfUs(-20148, axis, LEFT, RIGHT)).toBe(LEFT);
    expect(xOfUs(100, axis, LEFT, RIGHT)).toBe(RIGHT);
  });
});

describe('launchStackOf', () => {
  it('같은 µs 3개 → −4 · 0 · 4 · 혼자인 점은 0', () => {
    const ps = [-330, -340, -330, -320, -330].map((sent_rel_us) => ({ sent_rel_us }));
    expect(launchStackOf(ps)).toEqual([-4, 0, 0, 0, 4]);
  });
  it('같은 µs 2개 → −2 · 2(대칭)', () => {
    expect(launchStackOf([{ sent_rel_us: 1 }, { sent_rel_us: 1 }])).toEqual([-2, 2]);
  });
});

describe('launchGateBandOf — 4종', () => {
  const axis = launchAxisOf(relsOf('KB', '코스닥'), -337, 'q16');
  const x = (v: number) => xOfUs(v, axis, LEFT, RIGHT);

  it('경계(10/14 lo −350 · hi −342) → lo~hi', () => {
    const b = launchGateBandOf({ lo: -350, hi: -342 }, axis, LEFT, RIGHT);
    expect(b).toEqual({ kind: 'gate', x0: x(-350), x1: x(-342) });
  });
  it('경계 최소 폭 2px — lo = hi', () => {
    const b = launchGateBandOf({ lo: -340, hi: -340 }, axis, LEFT, RIGHT)!;
    expect(b.kind).toBe('gate');
    expect(b.x1 - b.x0).toBe(2);
  });
  it('전부 거부(10/21 lo −322) → lo 부터 오른쪽 끝', () => {
    expect(launchGateBandOf({ lo: -322, hi: null }, axis, LEFT, RIGHT)).toEqual({
      kind: 'reject_after',
      x0: x(-322),
      x1: RIGHT,
    });
  });
  it('전부 접수(hi −342) → 왼쪽 끝부터 hi', () => {
    expect(launchGateBandOf({ lo: null, hi: -342 }, axis, LEFT, RIGHT)).toEqual({
      kind: 'accept_before',
      x0: LEFT,
      x1: x(-342),
    });
  });
  it('판단 불가 → null', () => {
    expect(launchGateBandOf({ lo: null, hi: null }, axis, LEFT, RIGHT)).toBeNull();
  });
});

function head(over: Partial<LaunchHeadRow> & Pick<LaunchHeadRow, 'gateway' | 'market' | 'profile'>): LaunchHeadRow {
  const nxt = over.profile === 'N' || (over.profile === 'A' && over.fire_exchange === 'NXT');
  return {
    trade_date: '20261026',
    fire_exchange: nxt ? 'NXT' : 'KRX',
    fire_base: nxt ? '09:00:30' : over.profile === 'A' ? '09:00:27' : '16:00:00',
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

describe('mapNextOffsetOf', () => {
  const heads = [
    head({ gateway: 'KB120', market: 'Q', profile: 'Q16', next_offset_us: -337 }),
    head({ gateway: 'KB120', market: 'Q', profile: 'Q16', trade_date: '20261023', next_offset_us: -330 }),
    head({ gateway: 'KB120', market: 'Q', profile: 'N', next_offset_us: -245 }),
    head({ gateway: 'KB120', market: 'Q', profile: 'A', fire_exchange: 'NXT', next_offset_us: -999 }),
    head({ gateway: 'KYOBO119', market: 'K', profile: 'Q16', next_offset_us: null }),
  ];
  it('q16 → Q16 머리(가장 최근 거래일)', () => {
    expect(mapNextOffsetOf(heads, 'KB120', 'Q', 'q16')).toBe(-337);
  });
  it('n0930 → N 머리(A 다리 머리 무시)', () => {
    expect(mapNextOffsetOf(heads, 'KB120', 'Q', 'n0930')).toBe(-245);
  });
  it('머리 없음 · next null → null', () => {
    expect(mapNextOffsetOf(heads, 'KB120', 'K', 'q16')).toBeNull();
    expect(mapNextOffsetOf(heads, 'KYOBO119', 'K', 'q16')).toBeNull();
    expect(mapNextOffsetOf([], 'KB120', 'Q', 'n0930')).toBeNull();
  });
});

describe('launchDateLabelOf', () => {
  it('YYYYMMDD · YYYY-MM-DD → MM/DD', () => {
    expect(launchDateLabelOf('20261026')).toBe('10/26');
    expect(launchDateLabelOf('2026-10-12')).toBe('10/12');
  });
});
