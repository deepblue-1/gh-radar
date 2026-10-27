import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { launchDaysOf, type LaunchHeadRow } from '@gh-radar/shared';

import {
  LAUNCH_CHART,
  diamondPathOf,
  launchAxisFrom,
  launchAxisOf,
  launchDateLabelOf,
  launchGateBandOf,
  launchMarkOf,
  launchRangeOf,
  launchRangeParamOf,
  launchRibbonCellsOf,
  launchStackOf,
  launchTicksOf,
  launchHoverOf,
  launchTooltipOf,
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
  wire: number;
  rel: number;
  result: string;
}

const RAW = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../../../packages/shared/src/__fixtures__/launch-pieces-1012-1026.json'), 'utf8'),
) as AttachRow[];

function relsOf(broker: string, market: string): number[] {
  return RAW.filter((r) => r.broker === broker && r.market === market).map((r) => r.rel);
}

function daysOf(broker: string, market: string) {
  return launchDaysOf(
    RAW.filter((r) => r.broker === broker && r.market === market).map((r) => ({
      trade_date: r.date,
      wire: r.wire,
      sent_rel_us: r.rel,
      result: r.result,
    })),
  );
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

// ─────────────────────────────────────────────────────────────────────────────
// Task 2 — 리본 · 이상치 상한 · 표식 · 툴팁
// ─────────────────────────────────────────────────────────────────────────────

/** 10/26 09:00:30 N 조각 10개(pieces120.txt · pieces119.txt) — 휴장 중 오발 −20,1xxµs. */
const N_1026 = [-20148, -20143, -20148, -20143, -20141, -20149, -20142, -20149, -20140, -20138];

describe('launchRibbonCellsOf — 첨부 리본 식 · 칸 값 = shared launchRibbonAt', () => {
  it('KB 코스닥(−360~−280 · plotPx 568) → stepR 0.2 · 칸 400 · v −337 = 접수 5 · 거부 3 · 모름 2', () => {
    const days = daysOf('KB', '코스닥');
    const axis = launchAxisOf(relsOf('KB', '코스닥'), -337, 'q16');
    const r = launchRibbonCellsOf(days, axis, PLOT);
    expect(r.stepR).toBe(0.2);
    expect(r.cells).toHaveLength(400);
    expect(r.cells[0]!.v).toBe(-360);
    const c = r.cells.find((cell) => cell.v === -337);
    expect(c).toMatchObject({ ok: 5, bad: 3, unknown: 2 });
  });

  it('칸 v 는 정수 i 로 계산 — 0.2 누적 오차 없음', () => {
    const axis = launchAxisOf(relsOf('KB', '코스닥'), -337, 'q16');
    const r = launchRibbonCellsOf(daysOf('KB', '코스닥'), axis, PLOT);
    for (const cell of r.cells) expect(Math.round(cell.v * 5)).toBeCloseTo(cell.v * 5, 9);
    expect(r.cells.at(-1)!.v).toBe(-280.2);
  });
});

describe('이상치 상한(Pitfall 4)', () => {
  it('n0930 −20,149 … −20,138 + next −245 → 축 −20152 ~ −20135(next 제외) · next hi · 눈금 2 · 칸 0.2', () => {
    const axis = launchAxisOf(N_1026, -245, 'n0930');
    expect([axis.xmin, axis.xmax]).toEqual([-20152, -20135]);
    expect(axis.offAxis(-245)).toBe('hi');
    expect(launchTicksOf(axis, PLOT).step).toBe(2);
    const days = launchDaysOf(N_1026.map((v, wire) => ({ trade_date: '20261026', wire, sent_rel_us: v, result: '101' })));
    expect(launchRibbonCellsOf(days, axis, PLOT).stepR).toBe(0.2);
  });

  it('섞인 축 [−300, −305, −20148] q16 → −20148 은 lo · 축 폭 < 700 · 눈금 ≤ 12 · 칸 ≤ plotPx', () => {
    const values = [-300, -305, -20148];
    const axis = launchAxisOf(values, null, 'q16');
    expect(axis.offAxis(-20148)).toBe('lo');
    expect(axis.offAxis(-300)).toBeNull();
    expect(axis.xmax - axis.xmin).toBeLessThan(700);
    expect(launchTicksOf(axis, PLOT).values.length).toBeLessThanOrEqual(12);
    const days = launchDaysOf(values.map((v, wire) => ({ trade_date: '20261026', wire, sent_rel_us: v, result: '접수' })));
    expect(launchRibbonCellsOf(days, axis, PLOT).cells.length).toBeLessThanOrEqual(PLOT);
  });

  it.each([PLOT, 1200])('극단 폭 강제 축 −10000 ~ 10000 · plotPx %d → 눈금 ≤ 12 · 간격 ≥ 28px · 칸 ≤ plotPx', (plotPx) => {
    const axis = launchAxisFrom(-10000, 10000);
    const t = launchTicksOf(axis, plotPx);
    expect(t.values.length).toBeLessThanOrEqual(LAUNCH_CHART.TICK_MAX);
    expect(t.values.length).toBeGreaterThanOrEqual(2);
    expect((t.step / 20000) * plotPx).toBeGreaterThanOrEqual(LAUNCH_CHART.TICK_MIN_PX);
    const r = launchRibbonCellsOf(daysOf('KB', '코스닥'), axis, plotPx);
    expect(r.cells.length).toBeLessThanOrEqual(plotPx);
    expect(r.cells.length).toBeGreaterThan(0);
  });

  it('극단 좁은 축 −300 ~ −299 · plotPx 568 → 눈금 ≥ 1 · 칸 ≤ plotPx', () => {
    const axis = launchAxisFrom(-300, -299);
    const t = launchTicksOf(axis, PLOT);
    expect(t.values.length).toBeGreaterThanOrEqual(1);
    expect(t.values.length).toBeLessThanOrEqual(12);
    expect(launchRibbonCellsOf(daysOf('KB', '코스닥'), axis, PLOT).cells.length).toBeLessThanOrEqual(PLOT);
  });
});

describe('launchMarkOf · diamondPathOf', () => {
  it('n0930 매도 101 → 마름모 · bad', () => {
    expect(launchMarkOf({ side: 'sell', result: '101' }, 'n0930')).toEqual({ shape: 'diamond', tone: 'bad' });
  });
  it('n0930 구분 없음 접수 → 원 · ok', () => {
    expect(launchMarkOf({ side: null, result: '접수' }, 'n0930')).toEqual({ shape: 'circle', tone: 'ok' });
  });
  it('q16 매도 기타 → 원 · other(마름모는 09:00:30 만)', () => {
    expect(launchMarkOf({ side: 'sell', result: '기타' }, 'q16')).toEqual({ shape: 'circle', tone: 'other' });
  });
  it('diamondPathOf(10, 20, 5)', () => {
    expect(diamondPathOf(10, 20, 5)).toBe('M10 15 L15 20 L10 25 L5 20 Z');
  });
});

describe('launchHoverOf', () => {
  it('q16 — 큰 줄 「−247µs」 · 작은 줄 「10/14 · wire 2 · 101」', () => {
    expect(
      launchHoverOf('20261014', { sent_rel_us: -247, wire: 2, side: null, result: '101', retry: null }, 'q16'),
    ).toEqual({ value: '−247µs', detail: '10/14 · wire 2 · 101' });
  });
  it('n0930 — 매도 · 재전송 · 축 밖', () => {
    expect(
      launchHoverOf('20261027', { sent_rel_us: -245, wire: 0, side: 'sell', result: '515', retry: 2 }, 'n0930', true),
    ).toEqual({ value: '−245µs', detail: '10/27 · wire 0 · 매도 · 515 · 재전송 2 · 축 밖' });
  });
});

describe('launchTooltipOf', () => {
  it('n0930 — 「10/26 −20,148µs · wire 0 · 매수 · 101 · 재전송 2」', () => {
    expect(
      launchTooltipOf('20261026', { sent_rel_us: -20148, wire: 0, side: 'buy', result: '101', retry: 2 }, 'n0930'),
    ).toBe('10/26 −20,148µs · wire 0 · 매수 · 101 · 재전송 2');
  });
  it('n0930 — side null 「구분 없음」 · retry 0 은 재전송 생략', () => {
    expect(
      launchTooltipOf('20261026', { sent_rel_us: -245, wire: 1, side: null, result: '접수', retry: 0 }, 'n0930'),
    ).toBe('10/26 −245µs · wire 1 · 구분 없음 · 접수');
  });
  it('q16 — 「10/14 −350µs · wire 2 · 101」', () => {
    expect(
      launchTooltipOf('20261014', { sent_rel_us: -350, wire: 2, side: null, result: '101', retry: null }, 'q16'),
    ).toBe('10/14 −350µs · wire 2 · 101');
  });
  it('축 밖이면 끝에 「 · 축 밖」', () => {
    expect(
      launchTooltipOf('20261026', { sent_rel_us: -20148, wire: 0, side: null, result: '101', retry: null }, 'q16', true),
    ).toBe('10/26 −20,148µs · wire 0 · 101 · 축 밖');
  });
});

describe('launchRangeOf — 실제 범위 글(35-08 · D-15)', () => {
  const ELEVEN = [
    '20261026', '20261023', '20261022', '20261021', '20261020', '20261019',
    '20261016', '20261015', '20261014', '20261013', '20261012',
  ];
  it('11일(내림차순) — 「10/12 ~ 10/26 · 11거래일」', () => {
    expect(launchRangeOf(ELEVEN)).toBe('10/12 ~ 10/26 · 11거래일');
  });
  it('10일 — 「10/13 ~ 10/26 · 10거래일」', () => {
    expect(launchRangeOf(ELEVEN.slice(0, 10))).toBe('10/13 ~ 10/26 · 10거래일');
  });
  it('1일 — 「10/26 · 1거래일」', () => {
    expect(launchRangeOf(['20261026'])).toBe('10/26 · 1거래일');
  });
  it('빈 배열 — null', () => {
    expect(launchRangeOf([])).toBeNull();
  });
});

describe('launchRangeParamOf — ?range 원문', () => {
  it('10d · 20d · all 만 받고 그 밖 null', () => {
    expect(launchRangeParamOf('10d')).toBe('10d');
    expect(launchRangeParamOf('20d')).toBe('20d');
    expect(launchRangeParamOf('all')).toBe('all');
    expect(launchRangeParamOf('30d')).toBeNull();
    expect(launchRangeParamOf(null)).toBeNull();
  });
});
