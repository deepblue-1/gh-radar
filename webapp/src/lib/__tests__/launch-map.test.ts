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
  launchRangeParamOf,
  launchRibbonCellsOf,
  launchStackOf,
  launchTicksOf,
  launchHiddenDotsOf,
  launchHiddenDotsText,
  launchHoverOf,
  launchTooltipOf,
  mapNextOffsetOf,
  trianglePathOf,
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
/** 축 안인가(양 끝 포함). */
const inAxis = (axis: { xmin: number; xmax: number }, v: number): boolean => v >= axis.xmin && v <= axis.xmax;

describe('launchAxisOf — 첨부 4패널 축(첨부 식)', () => {
  it.each([
    ['KB', '코스닥', -337, -360, -280],
    ['KB', '코스피', -285, -320, -250],
    ['교보', '코스닥', -526, -560, -460],
    ['교보', '코스피', -400, -430, -350],
  ])('%s %s · next %d → %d ~ %d', (broker, market, next, xmin, xmax) => {
    const axis = launchAxisOf(relsOf(broker, market), [next], 'q16');
    expect([axis.xmin, axis.xmax]).toEqual([xmin, xmax]);
  });

  it('보통 점 · mark 는 모두 축 안 · 축 모양은 { xmin, xmax } 뿐(quick-261125-lju)', () => {
    const rels = relsOf('KB', '코스닥');
    const axis = launchAxisOf(rels, [-337], 'q16');
    for (const v of [...rels, -337]) expect(inAxis(axis, v), String(v)).toBe(true);
    expect(Object.keys(axis).sort()).toEqual(['xmax', 'xmin']);
  });

  it('marks 여러 개(서버 계획 조각마다 · Pitfall S8) — 축이 −350 · −325 를 담는다', () => {
    const axis = launchAxisOf([-347, -322], [-350, -345, -325], 'q16');
    for (const v of [-350, -345, -325]) expect(inAxis(axis, v)).toBe(true);
    expect(axis.xmin).toBeLessThanOrEqual(-350);
    expect(axis.xmax).toBeGreaterThanOrEqual(-325);
  });

  it('첫 mark 가 아닌 조각도 축을 넓힌다 — marks [−340, −345, −300] 의 −300 이 축 안', () => {
    const axis = launchAxisOf([-347, -322], [-340, -345, -300], 'q16');
    expect(inAxis(axis, -300)).toBe(true);
    expect(axis.xmax).toBeGreaterThanOrEqual(-300);
  });

  it('먼 mark(−35000 · 오타)도 축을 넓힌다 — xmin = floor((−35000 − 8)/10)·10 · xmax 는 그대로', () => {
    const base = launchAxisOf(relsOf('KB', '코스닥'), [], 'q16');
    const axis = launchAxisOf(relsOf('KB', '코스닥'), [-35000], 'q16');
    expect(axis.xmin).toBe(-35010);
    expect(axis.xmax).toBe(base.xmax);
  });

  it('marks [] 는 mark 없는 축(옛 next null) 과 같다 · values 가 비면 0 중심', () => {
    const axis = launchAxisOf([], [], 'n0930');
    expect([axis.xmin, axis.xmax]).toEqual([-3, 3]);
  });

  it('values 가 비면 첫 mark 를 중심으로 좁은 축', () => {
    const axis = launchAxisOf([], [-245], 'n0930');
    expect([axis.xmin, axis.xmax]).toEqual([-248, -242]);
  });
});

describe('launchTicksOf', () => {
  it('KB 코스닥 축(−360~−280) · plotPx 568 → step 10 · 9개', () => {
    const axis = launchAxisOf(relsOf('KB', '코스닥'), [-337], 'q16');
    expect(PLOT).toBe(568);
    const t = launchTicksOf(axis, PLOT);
    expect(t.step).toBe(10);
    expect(t.values).toEqual([-360, -350, -340, -330, -320, -310, -300, -290, -280]);
  });
});

describe('xOfUs', () => {
  const axis = launchAxisOf(relsOf('KB', '코스닥'), [-337], 'q16');
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
  const axis = launchAxisOf(relsOf('KB', '코스닥'), [-337], 'q16');
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
  it('교보 n0930 코스닥 — 머리가 N/K 1행뿐(quick-261109-eqv)이면 더 최근 N/K 값 · 같은 날이면 제 시장 · KB 는 대체 없음', () => {
    const n = (gateway: string, market: string, trade_date: string, v: number) =>
      head({ gateway, market, profile: 'N', fire_exchange: 'NXT', fire_base: '09:00:30', trade_date, next_offset_us: v });
    const ky = [n('KYOBO119', 'Q', '20261106', -348), n('KYOBO119', 'K', '20261110', -340)];
    expect(mapNextOffsetOf(ky, 'KYOBO119', 'Q', 'n0930')).toBe(-340);
    expect(mapNextOffsetOf([...ky, n('KYOBO119', 'Q', '20261110', -333)], 'KYOBO119', 'Q', 'n0930')).toBe(-333);
    expect(mapNextOffsetOf([n('KB120', 'K', '20261110', -245)], 'KB120', 'Q', 'n0930')).toBeNull();
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
    const axis = launchAxisOf(relsOf('KB', '코스닥'), [-337], 'q16');
    const r = launchRibbonCellsOf(days, axis, PLOT);
    expect(r.stepR).toBe(0.2);
    expect(r.cells).toHaveLength(400);
    expect(r.cells[0]!.v).toBe(-360);
    const c = r.cells.find((cell) => cell.v === -337);
    expect(c).toMatchObject({ ok: 5, bad: 3, unknown: 2 });
  });

  it('칸 v 는 정수 i 로 계산 — 0.2 누적 오차 없음', () => {
    const axis = launchAxisOf(relsOf('KB', '코스닥'), [-337], 'q16');
    const r = launchRibbonCellsOf(daysOf('KB', '코스닥'), axis, PLOT);
    for (const cell of r.cells) expect(Math.round(cell.v * 5)).toBeCloseTo(cell.v * 5, 9);
    expect(r.cells.at(-1)!.v).toBe(-280.2);
  });
});

describe('축 — 점은 중앙값 ± 퍼짐 상한 · 계획 · 초안 · 탐침은 전부(quick-261125-lju 사용자 결정)', () => {
  it('탐침 · 계획 −1500 은 축을 늘린다(상한 없음) · 점은 그대로 축 안 · 숨김 0', () => {
    const rels = relsOf('KB', '코스닥');
    const axis = launchAxisOf(rels, [-337, -1500], 'q16');
    expect(axis.xmin).toBe(-1510);
    expect(inAxis(axis, -1500)).toBe(true);
    for (const v of rels) expect(inAxis(axis, v)).toBe(true);
    expect(launchHiddenDotsOf(daysOf('KB', '코스닥'), axis)).toEqual([]);
  });

  it('launchHiddenDotsText — 0개 null · 「먼 점 n개 숨김」 · title 날짜 µs 목록', () => {
    expect(launchHiddenDotsText([])).toBeNull();
    expect(
      launchHiddenDotsText([
        { date: '20261026', us: -20148 },
        { date: '20261027', us: 900 },
      ]),
    ).toEqual({ text: '먼 점 2개 숨김', title: '10/26 −20,148µs · 10/27 +900µs' });
  });

  it('n0930 −20,149 … −20,138 만 → 좁은 축 −20152 ~ −20135 · 눈금 2 · 칸 0.2', () => {
    const axis = launchAxisOf(N_1026, [], 'n0930');
    expect([axis.xmin, axis.xmax]).toEqual([-20152, -20135]);
    expect(launchTicksOf(axis, PLOT).step).toBe(2);
    const days = launchDaysOf(N_1026.map((v, wire) => ({ trade_date: '20261026', wire, sent_rel_us: v, result: '101' })));
    expect(launchRibbonCellsOf(days, axis, PLOT).stepR).toBe(0.2);
  });

  it('n0930 −20,149 … −20,138 + next −245 → 축 −20160 ~ −230(next 포함) · 눈금 ≤ 12 · 칸 ≤ plotPx', () => {
    const axis = launchAxisOf(N_1026, [-245], 'n0930');
    expect([axis.xmin, axis.xmax]).toEqual([-20160, -230]);
    expect(inAxis(axis, -245)).toBe(true);
    expect(launchTicksOf(axis, PLOT).values.length).toBeLessThanOrEqual(12);
    const days = launchDaysOf(N_1026.map((v, wire) => ({ trade_date: '20261026', wire, sent_rel_us: v, result: '101' })));
    expect(launchRibbonCellsOf(days, axis, PLOT).cells.length).toBeLessThanOrEqual(PLOT);
  });

  it('먼 점 1개 [−300, −305, −20148] q16 → 축은 그 점으로 늘지 않는다(−308 ~ −297) · 숨김 1 · 눈금 ≤ 12 · 칸 ≤ plotPx', () => {
    const values = [-300, -305, -20148];
    const axis = launchAxisOf(values, [], 'q16');
    expect([axis.xmin, axis.xmax]).toEqual([-308, -297]);
    expect(inAxis(axis, -20148)).toBe(false);
    expect(launchHiddenDotsOf(launchDaysOf(values.map((v, wire) => ({ trade_date: '20261026', wire, sent_rel_us: v, result: '101' }))), axis)).toEqual([
      { date: '20261026', us: -20148 },
    ]);
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

describe('탐침 ▲(quick-261030-dz7 · 목업 A안) — launchMarkOf · trianglePathOf', () => {
  const tail = (result: string, result_code: string | null = null) => ({
    side: 'buy',
    result,
    probe: true,
    round: -2,
    result_code,
  });
  it('q16 탐침 — 101 bad · 기타 F083 ok · 접수 ok · 기타 E127 other · 무응답 other (전부 삼각형)', () => {
    expect(launchMarkOf(tail('101', '101'), 'q16')).toEqual({ shape: 'triangle', tone: 'bad' });
    expect(launchMarkOf(tail('기타', 'F083'), 'q16')).toEqual({ shape: 'triangle', tone: 'ok' });
    expect(launchMarkOf(tail('접수'), 'q16')).toEqual({ shape: 'triangle', tone: 'ok' });
    expect(launchMarkOf(tail('기타', 'E127'), 'q16')).toEqual({ shape: 'triangle', tone: 'other' });
    expect(launchMarkOf(tail('무응답'), 'q16')).toEqual({ shape: 'triangle', tone: 'other' });
  });
  it('앞쪽 탐침(round −1) 기타 F083 → 원 · other(지금 규칙)', () => {
    expect(
      launchMarkOf({ side: 'buy', result: '기타', probe: true, round: -1, result_code: 'F083' }, 'q16'),
    ).toEqual({ shape: 'circle', tone: 'other' });
  });
  it('trianglePathOf(10, 20, 10) · TRI_R 5.6', () => {
    expect(trianglePathOf(10, 20, 10)).toBe('M10 10 L19.5 27 L0.5 27 Z');
    expect(LAUNCH_CHART.TRI_R).toBe(5.6);
    expect(trianglePathOf(6, 6.8, LAUNCH_CHART.TRI_R)).toBe('M6 1.2 L11.32 10.72 L0.68 10.72 Z');
  });
});

describe('탐침 툴팁 · 호버(quick-261030-dz7 · 화면 이름 「탐침」 quick-261125-lju)', () => {
  const p = (result: string, result_code: string | null, piece_idx: number | null = 1) => ({
    sent_rel_us: -250,
    wire: 4,
    piece_idx,
    side: 'buy',
    result,
    retry: 0,
    probe: true,
    round: -2,
    result_code,
  });
  it('가격거부 열림 — 호버 「−250µs」 · 「10/30 · 탐침 2 · 가격거부(열림) · F083」 · title 같은 재료', () => {
    expect(launchHoverOf('20261030', p('기타', 'F083'), 'q16')).toEqual({
      value: '−250µs',
      detail: '10/30 · 탐침 2 · 가격거부(열림) · F083',
    });
    expect(launchTooltipOf('20261030', p('기타', 'F083'), 'q16')).toBe('10/30 −250µs · 탐침 2 · 가격거부(열림) · F083');
  });
  it('결과 글 — 접수 · 101(rc 안 붙임) · E127 경계 밖 · 무응답 경계 밖 · piece_idx 0 → 탐침 1 · 「축 밖」 꼬리 없음', () => {
    expect(launchHoverOf('20261030', p('접수', null, 0), 'q16').detail).toBe('10/30 · 탐침 1 · 접수');
    expect(launchHoverOf('20261030', p('101', '101'), 'q16').detail).toBe('10/30 · 탐침 2 · 101');
    expect(launchHoverOf('20261030', p('기타', 'E127'), 'q16').detail).toBe('10/30 · 탐침 2 · 기타(경계 밖) · E127');
    expect(launchHoverOf('20261030', p('무응답', null), 'q16').detail).toBe('10/30 · 탐침 2 · 무응답(경계 밖)');
    expect(launchHoverOf('20261030', p('기타', 'F083', null), 'q16').detail).toBe('10/30 · 탐침 · 가격거부(열림) · F083');
    expect(launchTooltipOf('20261030', p('101', '101'), 'q16')).toBe('10/30 −250µs · 탐침 2 · 101');
  });
});

describe('launchHoverOf', () => {
  it('q16 — 큰 줄 「−247µs」 · 작은 줄 「10/14 · wire 2 · 101」', () => {
    expect(
      launchHoverOf('20261014', { sent_rel_us: -247, wire: 2, side: null, result: '101', retry: null }, 'q16'),
    ).toEqual({ value: '−247µs', detail: '10/14 · wire 2 · 101' });
  });
  it('n0930 — 매도 · 재전송(「축 밖」 꼬리 없음)', () => {
    expect(
      launchHoverOf('20261027', { sent_rel_us: -245, wire: 0, side: 'sell', result: '515', retry: 2 }, 'n0930'),
    ).toEqual({ value: '−245µs', detail: '10/27 · wire 0 · 매도 · 515 · 재전송 2' });
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
  it('먼 점도 꼬리 없음(축이 값 전부를 담는다 · quick-261125-lju)', () => {
    expect(
      launchTooltipOf('20261026', { sent_rel_us: -20148, wire: 0, side: null, result: '101', retry: null }, 'q16'),
    ).toBe('10/26 −20,148µs · wire 0 · 101');
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

// ─────────────────────────────────────────────────────────────────────────────
// quick-261125-c2i — 08:30 G2 지도(머리 · 축 상한)
// ─────────────────────────────────────────────────────────────────────────────

describe('08:30 G2 지도(quick-261125-c2i)', () => {
  const G2 = { profile: 'G2', fire_exchange: 'KRX', fire_base: '08:30:00' } as const;

  it('mapNextOffsetOf(g0830) — 같은 날 Q16 · N 머리가 있어도 G2 머리 next_offset_us', () => {
    const heads = [
      head({ gateway: 'KB120', market: 'K', profile: 'Q16', next_offset_us: -337 }),
      head({ gateway: 'KB120', market: 'K', profile: 'N', next_offset_us: -245 }),
      head({ gateway: 'KB120', market: 'K', ...G2, next_offset_us: 12000 }),
    ];
    expect(mapNextOffsetOf(heads, 'KB120', 'K', 'g0830')).toBe(12000);
    expect(mapNextOffsetOf(heads, 'KB120', 'K', 'q16')).toBe(-337);
    expect(mapNextOffsetOf(heads, 'KB120', 'K', 'n0930')).toBe(-245);
    expect(mapNextOffsetOf(heads.slice(0, 2), 'KB120', 'K', 'g0830')).toBeNull();
  });

  it('08:30 퍼짐 상한 20000 — 중앙값에서 20000µs 안쪽 점은 축 안 · 넘는 점(40000)은 축 밖(숨김) · q16 상한이면 0 이 숨김', () => {
    const values = [0, 11000, 12000, 12500, 13000];
    const axis = launchAxisOf(values, [18000], 'g0830');
    for (const v of [...values, 18000]) expect(inAxis(axis, v)).toBe(true);
    // 같은 점을 q16 상한(300)으로 잡으면 0 은 축 후보가 아니다(mark 18000 은 그대로 축을 늘린다).
    expect(inAxis(launchAxisOf(values, [18000], 'q16'), 0)).toBe(false);
    const far = launchAxisOf([12000, 12000, 12000, 40000], [], 'g0830');
    expect(inAxis(far, 40000)).toBe(false);
    expect(inAxis(far, 12000)).toBe(true);
  });
});
