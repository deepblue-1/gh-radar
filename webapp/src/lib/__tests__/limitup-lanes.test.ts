import { describe, it, expect } from 'vitest';

import type { LimitupFactRow, LimitupGridCol, LimitupGridFile, LimitupMarkRow } from '@gh-radar/shared';

/**
 * Phase 28 Plan 13 Task 1 — 사건 카드 레인 · 표 계산 lib (D-11 · D-12 · gh-trade `_section_a_cards` 창 · 마커 규칙).
 *
 * 잠그는 것:
 *  - gridSeries: fine 우선 · coarse 보충 · sec 오름차순 · null 보존
 *  - quick-261005-vk1 D-04(스케치 011 A): eventsOf 번호 · 짧은 라벨 · 창 사실 · 표시 문장(시각 접두 제거 · 창구 머리 교체) ·
 *    storyOf 한 줄 요약 · memberWindowsOf 직전 1분 창 · layoutEventBand 라벨 띠 · 서식 도우미
 *  - laneEntryOf: 창 [a − 600, a + 60] ∩ 장중 · 상한가 선 + 탐지율 선만(25% 없음) · 번호 마커 · 직전 1분 파란 면 · 매도벽 소진
 *  - laneLockOf: 창 [첫 start − 120, 마지막 end + 60] · 음영 · 번호 마커(q_max 사실 krw · 창 끝 뒤 고정) · ▼ · ✕ title 만
 *  - memberBarsOf(+ range) · fingerprintRowsOf · yesterdayRowsOf
 * 입력은 실 export 20261002(덕우전자 깨짐 · 엑시온그룹 유지 · 형지글로벌 미도달)와 합성 행.
 */

import {
  EVENT_BAND_MAX_ROWS,
  estimateLabelWidth,
  eventsOf,
  fingerprintRowsOf,
  fmtDurPrecise,
  fmtKrwShort,
  gridSeries,
  laneEntryOf,
  laneLockOf,
  layoutEventBand,
  memberBarsOf,
  memberWindowsOf,
  storyOf,
  stripFactClock,
  yesterdayRowsOf,
} from '../limitup-lanes';
import { kstClock } from '../limitup-report';
import { entryRow, kstMs, lockRow } from '@/test-fixtures/limitup-report';
import {
  AXION,
  DUKWOO,
  EXPORT_DATE as D,
  HYUNGJI,
  exportEntries,
  exportFacts,
  exportLocks,
  exportMarks,
  gridOf,
} from '@/test-fixtures/limitup-export';

const entries = exportEntries();
const locks = exportLocks();
const facts = exportFacts();
const marks = exportMarks();
const entryOf = (isin: string) => entries.find((e) => e.isin === isin)!;
const locksOf = (isin: string) => locks.filter((l) => l.isin === isin);
const factsOf = (isin: string) => facts.filter((f) => f.isin === isin);
const marksOf = (isin: string) => marks.filter((m) => m.isin === isin);

const ALL_COLS: LimitupGridCol[] = [
  't_ms', 'last_px', 'rate', 'q_qty', 'q_krw', 'wall_krw_visible', 'wall_qty_hidden', 'wall_truncated',
  'ask1_px', 'ask1_qty', 'bid1_px', 'sell_led_10s', 'buy_led_10s', 'cancel_10s', 'new_10s', 'auction_fill_10s',
  'drain_s', 'lock_state', 'lock_id', 'lock_elapsed_s', 'auction', 'break_within_n', 'reach_within_n', 'label_n',
];

/** 합성 격자 — coarse 10초 하루 전체(값 = sec) + fine 1초 창 하나(값 = sec + 0.5 — 어느 쪽 점인지 구별). */
function synthGrid(fineFrom: number, fineTo: number, nullAt: number[] = []): LimitupGridFile {
  const cSec: number[] = [];
  for (let s = 32_400; s < 55_800; s += 10) cSec.push(s);
  const fSec: number[] = [];
  for (let s = fineFrom; s <= fineTo; s += 1) fSec.push(s);
  const cols = (secs: number[], bump: number) =>
    Object.fromEntries(
      ALL_COLS.map((c) => [c, secs.map((s) => (nullAt.includes(s) ? null : s + bump))]),
    ) as LimitupGridFile['coarse']['cols'];
  return {
    schema_version: 1,
    date: D,
    isin: 'KR7000000000',
    label_n: 60,
    coarse: { step_s: 10, sec: cSec, cols: cols(cSec, 0) },
    fine: { margin_s: 300, windows: [{ from_sec: fineFrom, to_sec: fineTo, sec: fSec, cols: cols(fSec, 0.5) }] },
  };
}

const inRange = (v: number) => v >= 0 && v <= 100;

// ---------------------------------------------------------------------------
// gridSeries
// ---------------------------------------------------------------------------

describe('gridSeries — fine 우선 · coarse 보충', () => {
  it('fine [34500, 41000] · 요청 [34000, 42000] → coarse 34000~34490 + fine 34500~41000 + coarse 41010~42000', () => {
    const pts = gridSeries(synthGrid(34_500, 41_000), 34_000, 42_000, 'q_krw');
    const before = pts.filter((p) => p.sec < 34_500);
    const fine = pts.filter((p) => p.sec >= 34_500 && p.sec <= 41_000);
    const after = pts.filter((p) => p.sec > 41_000);
    expect(before.map((p) => p.sec)).toEqual(Array.from({ length: 50 }, (_, i) => 34_000 + i * 10));
    expect(before.every((p) => p.v === p.sec)).toBe(true); // coarse 값
    expect(fine).toHaveLength(6_501);
    expect(fine.every((p) => p.v === p.sec + 0.5)).toBe(true); // fine 값(같은 초의 coarse 를 이긴다)
    expect(after.map((p) => p.sec)).toEqual(Array.from({ length: 100 }, (_, i) => 41_010 + i * 10));
    expect(pts.map((p) => p.sec)).toEqual([...pts.map((p) => p.sec)].sort((a, b) => a - b));
  });

  it('null 을 보존한다(곡선을 끊는 자리)', () => {
    const pts = gridSeries(synthGrid(34_500, 34_600, [34_100, 34_550]), 34_000, 34_700, 'q_krw');
    expect(pts.find((p) => p.sec === 34_100)?.v).toBeNull();
    expect(pts.find((p) => p.sec === 34_550)?.v).toBeNull();
  });

  it('창 밖 점은 없다 · 요청이 fine 창과 겹치지 않으면 coarse 만', () => {
    const pts = gridSeries(synthGrid(50_000, 50_100), 34_000, 34_050, 'last_px');
    expect(pts.map((p) => p.sec)).toEqual([34_000, 34_010, 34_020, 34_030, 34_040, 34_050]);
  });
});

// ---------------------------------------------------------------------------
// laneEntryOf
// ---------------------------------------------------------------------------

describe('laneEntryOf — 상한가 도달까지(창 [a − 600, a + 60]) · 탐지율 선 · 번호 마커', () => {
  const evOf = (isin: string) => eventsOf(entryOf(isin), locksOf(isin), factsOf(isin));

  it('덕우전자 — 첫 상한 체결 09:06:01 기준 · 09:00 에서 잘림 · 선 = 상한가 + 탐지 20% 뿐 · 눈금 4개', () => {
    const lane = laneEntryOf(gridOf(DUKWOO), entryOf(DUKWOO), locksOf(DUKWOO), evOf(DUKWOO))!;
    expect(lane).not.toBeNull();
    expect(lane.range).toBe('09:00~09:07');
    expect(lane.ticks.map((t) => t.label)).toEqual(['09:00', '09:02', '09:04', '09:07']);
    expect(lane.ticks.map((t) => Math.round(t.x))).toEqual([0, 33, 67, 100]);

    expect(lane.lines.map((l) => [l.kind, l.label, l.place])).toEqual([
      ['upper', '상한가 5,730원', 'right-above'],
      ['detect', '등락률 20% (탐지 기준) 5,292원', 'left-below'],
    ]);
    const [upper, detect] = lane.lines;
    expect(upper!.y).toBeLessThan(detect!.y); // 상한가가 위
    expect(detect!.y).toBeLessThan(50);

    // 25% 선 · 25% 도달 마커 · 글자 라벨은 없다
    expect(JSON.stringify(lane)).not.toMatch(/25%/);
    expect(lane.marks.map((m) => m.kind)).toEqual(['wallClear']);
    expect(lane.marks[0]!.title).toContain('09:03:40');

    // 번호 마커 ①②③ = 20% 도달 · 버스트 · 첫 상한가(창 안 레인 1 사건)
    expect(lane.points.map((p) => p.n)).toEqual([1, 2, 3]);
    expect(lane.points.map((p) => p.emph)).toEqual([true, false, true]);
    expect(lane.points[0]!.tone).toBe('detect');
    // 첫 상한 체결 = 창 끝에서 60초 앞(창 421초) — x ≈ 85.7%
    expect(lane.points[2]!.x).toBeCloseTo(((32_761.938 - 32_400) / 421) * 100, 1);
    // 첫 상한가 마커 높이 = 상한가 선
    expect(lane.points[2]!.y).toBeCloseTo(upper!.y, 1);

    // 상한가 직전 1분 파란 면 1개
    expect(lane.windows).toHaveLength(1);
    expect(lane.windows[0]!.caption).toBe('상한가 직전 1분');
    expect(lane.windows[0]!.x + lane.windows[0]!.w).toBeCloseTo(lane.points[2]!.x, 0);

    expect(lane.pricePath.startsWith('M')).toBe(true);
    expect(lane.wallPath.startsWith('M')).toBe(true);
    expect(lane.wallArea).toMatch(/Z$/);
    for (const m of [...lane.marks, ...lane.points]) expect(inRange(m.x) && inRange(m.y)).toBe(true);
  });

  it('엑시온그룹 — 20% 도달(11:44)은 창(14:35~14:46) 밖이라 ① 마커 없음(사실 목록엔 ①)', () => {
    const ev = evOf(AXION);
    const lane = laneEntryOf(gridOf(AXION), entryOf(AXION), locksOf(AXION), ev)!;
    expect(lane.range).toBe('14:35~14:46');
    expect(lane.points.map((p) => p.n)).toEqual([2, 3]);
    expect(ev.find((e) => e.templateId === 'entry_threshold')!.n).toBe(1);
    expect(lane.windows).toHaveLength(1);
  });

  it('미도달(형지글로벌) — 기준 = t{detect_rate_pct} 15:10:28 · 첫 상한 마커 없음', () => {
    const lane = laneEntryOf(gridOf(HYUNGJI), entryOf(HYUNGJI), [], evOf(HYUNGJI))!;
    expect(lane.range).toBe('15:00~15:11');
    expect(lane.summary).toContain('상한가 체결 없음');
  });

  it('탐지율 · 기준가가 없으면 탐지 선 없음 · 기준 시각이 하나도 없으면 null · entry 없이 잠김만 있으면 첫 잠김 시작', () => {
    const g = synthGrid(34_500, 34_600);
    expect(laneEntryOf(g, entryRow({ isin: 'X' }), [])).toBeNull();
    const lane = laneEntryOf(g, null, [lockRow({ isin: 'X', lock_id: 1, start_ms: kstMs(D, '10:00:00') })])!;
    expect(lane.range).toBe('09:50~10:01');
    expect(lane.lines.filter((l) => l.kind === 'detect')).toHaveLength(0);
    expect(lane.points).toEqual([]);
  });

  it('매도벽 소진 = 창 안 기준 시각 이하에서 wall_krw_visible 이 처음 0 인 초', () => {
    const g = synthGrid(35_000, 36_000);
    const w = g.fine.windows[0]!;
    w.cols.wall_krw_visible = w.sec.map((s) => (s >= 35_700 ? 0 : 1_000_000));
    const e = entryRow({ isin: 'X', first_upper_ms: kstMs(D, '09:55:00') }); // sec 35700
    const lane = laneEntryOf(g, e, [])!;
    const clear = lane.marks.find((m) => m.kind === 'wallClear')!;
    expect(clear.title).toContain(kstClock(kstMs(D, '09:55:00')));
    // 기준 시각 뒤에만 0 이면 없다
    w.cols.wall_krw_visible = w.sec.map((s) => (s > 35_700 ? 0 : 1_000_000));
    expect(laneEntryOf(g, e, [])!.marks.map((m) => m.kind)).not.toContain('wallClear');
  });
});

// ---------------------------------------------------------------------------
// laneLockOf
// ---------------------------------------------------------------------------

describe('laneLockOf — 잠김 구간(창 [첫 start − 120, 마지막 end + 60])', () => {
  const evOf = (isin: string) => eventsOf(entryOf(isin), locksOf(isin), factsOf(isin));

  it('잠김 없음 → null', () => {
    expect(laneLockOf(gridOf(HYUNGJI), [], [])).toBeNull();
  });

  it('덕우전자 — 음영 1 · 번호 ④~⑨ · ▼ · ✕ 는 title 만 · 깨짐 직전 1분 면 · 요약 그대로', () => {
    const lane = laneLockOf(gridOf(DUKWOO), locksOf(DUKWOO), marksOf(DUKWOO), evOf(DUKWOO))!;
    expect(lane.range).toBe('09:04~09:07');
    expect(lane.shades).toHaveLength(1);
    expect(lane.lines).toEqual([expect.objectContaining({ kind: 'base', label: '기준 10억', place: 'right-above' })]);

    expect(lane.points.map((p) => p.n)).toEqual([4, 5, 6, 7, 8, 9]);
    const brk = lane.points.find((p) => p.n === 9)!;
    expect(brk.tone).toBe('break');
    expect(brk.bandLabel).toBe('09:06:12 깨짐 · 5,720원 · 10.1초 유지');

    const sells = lane.marks.filter((m) => m.kind === 'sell');
    const cancels = lane.marks.filter((m) => m.kind === 'cancel');
    expect(sells).toHaveLength(7);
    expect(cancels).toHaveLength(6);
    for (const m of lane.marks) {
      expect(m.title).not.toBe('');
      expect(m).not.toHaveProperty('label');
    }

    expect(lane.windows.map((w) => w.caption)).toEqual(['깨짐 직전 1분']);
    expect(lane.summary).toBe('최대 27.5억 09:06:02, 깨짐 09:06:12');
    expect(lane.path.startsWith('M')).toBe(true);
    for (const m of [...lane.marks, ...lane.points]) expect(inRange(m.x) && inRange(m.y)).toBe(true);
  });

  it('엑시온그룹 — 종가까지 유지(15:30:08, 창 끝 15:29:59 밖)는 오른쪽 끝 x=100 에 고정 · q_max 마커 y = 사실 krw', () => {
    const ev = evOf(AXION);
    const lane = laneLockOf(gridOf(AXION), locksOf(AXION), marksOf(AXION), ev)!;
    expect(lane.range).toBe('14:43~15:29');
    const hold = lane.points.find((p) => p.bandLabel.includes('종가까지 유지'))!;
    expect(hold.x).toBe(100);
    expect(hold.bandLabel).toBe('15:30:08 종가까지 유지 · 44분 40초');
    // q_max 6.9억 — y 축 상한(20억 바닥) 안에서 사실 krw 높이
    const qmaxEv = ev.find((e) => e.templateId === 'q_max')!;
    const qmax = lane.points.find((p) => p.n === qmaxEv.n)!;
    expect(qmax.y).toBeGreaterThan(0);
    expect(lane.windows).toHaveLength(0);
    expect(lane.summary.startsWith('최대 ')).toBe(true);
  });

  it('y 축 상한은 q_max 사실 krw 를 포함한다', () => {
    const g = synthGrid(50_000, 50_100);
    for (const w of [g.coarse, g.fine.windows[0]!]) w.cols.q_krw = w.sec.map(() => 1_000_000_000);
    const lk = [lockRow({ isin: 'X', lock_id: 1, start_ms: kstMs(D, '13:55:00'), end_ms: kstMs(D, '14:00:00'), broke: true })];
    const f = [
      fact({ event_no: 1, fact_no: 1, t_ms: kstMs(D, '13:57:00'), template_id: 'q_max', values: { lock_id: 1, krw: 5_000_000_000 } }),
    ];
    const lane = laneLockOf(g, lk, [], eventsOf(null, lk, f))!;
    expect(lane.points[0]!.y).toBeCloseTo(8, 0); // LOCK_TOP — 최대가 맨 위
  });

  it('end_ms null(장 끝까지 잠김) → 음영이 창 끝까지 · 창 밖 마커는 버린다', () => {
    const g = synthGrid(50_000, 55_799);
    const lk = [lockRow({ isin: 'X', lock_id: 1, start_ms: kstMs(D, '14:00:00'), end_ms: null, broke: false })];
    const m: LimitupMarkRow[] = [
      { isin: 'X', jump_no: 1, t_ms: kstMs(D, '13:00:00'), kind: 'burst_sell', qty: 10, krw: 1_000, q_before: 0, q_after: 0 },
      { isin: 'X', jump_no: 2, t_ms: kstMs(D, '14:30:00'), kind: 'cancel', qty: 10, krw: 210_000_000, q_before: 0, q_after: 0 },
    ];
    const lane = laneLockOf(g, lk, m)!;
    expect(lane.range).toBe('13:58~15:29');
    const s = lane.shades[0]!;
    expect(s.x + s.w).toBeCloseTo(100, 0);
    expect(lane.marks.filter((x) => x.kind === 'sell')).toHaveLength(0);
    expect(lane.marks.find((x) => x.kind === 'cancel')?.title).toContain('−2.1억');
  });
});

// ---------------------------------------------------------------------------
// 사실 문장 · 창구 막대
// ---------------------------------------------------------------------------

const fact = (p: Partial<LimitupFactRow> & { event_no: number; fact_no: number }): LimitupFactRow => ({
  date: D,
  isin: 'X',
  t_ms: null,
  template_id: null,
  text: `e${p.event_no}f${p.fact_no}`,
  values: null,
  source: '실측',
  schema_version: 1,
  ...p,
});

describe('eventsOf — 번호 = 레인 마커 = 사실 문장', () => {
  it('합성 — 정렬 t_ms(없으면 뒤) → event_no → fact_no · 번호는 시각 있는 것만 · 짧은 이름 대체 · 시각 접두 제거', () => {
    const t = kstMs(D, '10:00:00');
    const rows = eventsOf(null, [], [
      fact({ event_no: 1, fact_no: 2, t_ms: null }),
      fact({ event_no: 1, fact_no: 1, t_ms: t, text: '10:00:00.000 아주 긴 미지의 사실 문장 하나입니다' }),
      fact({ event_no: 0, fact_no: 3, t_ms: t }),
      fact({ event_no: 0, fact_no: 1, t_ms: t - 1000 }),
    ]);
    expect(rows.map((r) => r.key)).toEqual(['0-1', '0-3', '1-1', '1-2']);
    expect(rows.map((r) => r.clock)).toEqual(['09:59:59', '10:00:00', '10:00:00', '—']);
    expect(rows.map((r) => r.n)).toEqual([1, 2, 3, null]);
    expect(rows.map((r) => r.lane)).toEqual(['entry', 'entry', 'lock', 'lock']);
    expect(rows[2]!.text).toBe('아주 긴 미지의 사실 문장 하나입니다');
    expect(rows[2]!.short).toBe('아주 긴 미지의 사실 문장…');
    expect(rows[2]!.emph).toBe(false);
  });

  it('덕우전자 — 번호 1~9 순서 · 창 사실 2개는 번호 없음 · 강조 5종', () => {
    const ev = eventsOf(entryOf(DUKWOO), locksOf(DUKWOO), factsOf(DUKWOO));
    const numbered = ev.filter((e) => e.n !== null);
    expect(numbered.map((e) => [e.n, e.templateId, e.clock])).toEqual([
      [1, 'entry_threshold', '09:02:26'],
      [2, 'burst_wall', '09:02:51'],
      [3, 'first_upper', '09:06:01'],
      [4, 'lock_start', '09:06:01'],
      [5, 'big_cancel', '09:06:01'],
      [6, 'q_max', '09:06:02'],
      [7, 'big_new', '09:06:02'],
      [8, 'big_cancel', '09:06:11'],
      [9, 'lock_break', '09:06:12'],
    ]);
    const wins = ev.filter((e) => e.window !== null);
    expect(wins.map((e) => [e.templateId, e.n, e.window!.range])).toEqual([
      ['member_entry_buy', null, '09:05:01~09:06:01'],
      ['member_prebreak_sell', null, '09:05:12~09:06:12'],
    ]);
    expect(ev.filter((e) => e.emph).map((e) => e.templateId)).toEqual([
      'entry_threshold',
      'first_upper',
      'lock_start',
      'lock_break',
    ]);
  });

  it('표시 문장 — 시각 접두 제거 · 창구 사실 머리 교체(+ range) · 출처 글자 그대로', () => {
    const ev = eventsOf(entryOf(DUKWOO), locksOf(DUKWOO), factsOf(DUKWOO));
    const by = (id: string) => ev.find((e) => e.templateId === id)!;
    expect(by('entry_threshold').text).toBe('등락률 20% 첫 도달 — 현재가 5,300원');
    expect(by('member_entry_buy').text).toBe(
      '상한가 직전 1분 매수 창구 (09:05:01~09:06:01): 한국증권 54.4% · 신한증권 42.1% · NH투자증권 3.4%',
    );
    expect(by('member_prebreak_sell').text).toBe(
      '깨짐 직전 1분 매도 창구 (09:05:12~09:06:12): 신한증권 96.2% · NH투자증권 3.8% · — —%',
    );
    expect(by('member_entry_buy').source).toBe('추정(분 단위)');
    expect(ev.every((e) => !/^\d{2}:\d{2}:\d{2}\.\d{3} /.test(e.text))).toBe(true);
  });

  it('띠 라벨 — 강조는 「시각 짧은 이름 · 값」 · 그 밖은 「시각 짧은 이름」', () => {
    const ev = eventsOf(entryOf(DUKWOO), locksOf(DUKWOO), factsOf(DUKWOO));
    const byN = (n: number) => ev.find((e) => e.n === n)!.bandLabel;
    expect(byN(1)).toBe('09:02:26 20% 도달 · 5,300원');
    expect(byN(2)).toBe('09:02:51 매수 버스트 3,314만');
    expect(byN(3)).toBe('09:06:01 첫 상한가 체결 · 5,730원');
    expect(byN(4)).toBe('09:06:01 잠김 1 시작 · 23.9억');
    expect(byN(5)).toBe('09:06:01 매수 취소 −7,000만');
    expect(byN(6)).toBe('09:06:02 최대 잔량 27.6억');
    expect(byN(7)).toBe('09:06:02 매수 신규 +4.6억');
  });
});

describe('storyOf — 한 줄 요약', () => {
  const text = (isin: string) =>
    storyOf(entryOf(isin), locksOf(isin), factsOf(isin))!.parts.map((p) => p.text).join('');

  it('덕우전자 — 깨짐 · 둘째 줄 = 상한가 직전 1분 매수 1위', () => {
    expect(text(DUKWOO)).toBe(
      '09:02:26 20% 도달 → 3분 35초 뒤 09:06:01 첫 상한가 5,730원 → 10.1초 만에 깨짐(5,720원) · 종가 5,290원 (−7.7%)',
    );
    const st = storyOf(entryOf(DUKWOO), locksOf(DUKWOO), factsOf(DUKWOO))!;
    expect(st.sub).toBe('상한가 직전 1분 매수 1위 한국증권 54.4%');
    expect(st.parts.filter((p) => p.strong).map((p) => p.text)).toEqual(['09:02:26', '09:06:01', '5,730원', '10.1초']);
    expect(st.parts.filter((p) => p.arrow)).toHaveLength(2);
  });

  it('엑시온그룹 — 종가까지 유지', () => {
    expect(text(AXION)).toBe('11:44:57 20% 도달 → 3시간 0분 뒤 14:45:27 첫 상한가 1,349원 → 잠김 44분 40초 유지, 종가 상한가');
  });

  it('잠김 2개 이상이면 결과 앞에 「잠김 {id} 」 · 잠김 없음 · entry · 잠김 둘 다 없으면 null', () => {
    const e = entryRow({ isin: 'X', detect_rate_pct: 20, t20_ms: kstMs(D, '09:00:00'), first_upper_ms: kstMs(D, '09:01:00'),
      upper_px: 1000, close_px: 900, close_ret: -0.1 });
    const lk = [
      lockRow({ isin: 'X', lock_id: 1, broke: true, dur_s: 30, break_px: 990 }),
      lockRow({ isin: 'X', lock_id: 2, broke: true, dur_s: 5.25, break_px: 980 }),
    ];
    expect(storyOf(e, lk, [])!.parts.map((p) => p.text).join('')).toBe(
      '09:00:00 20% 도달 → 1분 0초 뒤 09:01:00 첫 상한가 1,000원 → 잠김 2 5.3초 만에 깨짐(980원) · 종가 900원 (−10.0%)',
    );
    expect(storyOf(e, [], [])!.parts.map((p) => p.text).join('')).toContain('→ 잠김 없음 · 종가 900원 (−10.0%)');
    expect(storyOf(e, [], [])!.sub).toBeNull();
    expect(storyOf(null, [], [])).toBeNull();
  });
});

describe('memberWindowsOf — 직전 1분 창(derive.ts 와 같은 정의)', () => {
  it('덕우전자 — 매수 창 [anchor − 60s, anchor] · 깨진 잠김 창 [end − 60s, end]', () => {
    const w = memberWindowsOf(entryOf(DUKWOO), locksOf(DUKWOO));
    expect(w.entry!.range).toBe('09:05:01~09:06:01');
    expect(w.entry!.toMs - w.entry!.fromMs).toBe(60_000);
    expect(w.entry!.toMs).toBe(entryOf(DUKWOO).first_upper_ms);
    expect([...w.sell.entries()].map(([id, x]) => [id, x.range])).toEqual([[1, '09:05:12~09:06:12']]);
  });

  it('유지 잠김은 매도 창 없음 · 기준 시각 없으면 매수 창 null', () => {
    expect(memberWindowsOf(entryOf(AXION), locksOf(AXION)).sell.size).toBe(0);
    expect(memberWindowsOf(null, []).entry).toBeNull();
  });
});

describe('서식 도우미 — fmtDurPrecise · fmtKrwShort · stripFactClock', () => {
  it('fmtDurPrecise — 「10.1초」 · 「3분 35초」 · 「3시간 0분」(내림)', () => {
    expect(fmtDurPrecise(10.103)).toBe('10.1초');
    expect(fmtDurPrecise(215.247)).toBe('3분 35초');
    expect(fmtDurPrecise(2680.4)).toBe('44분 40초');
    expect(fmtDurPrecise(10829.87)).toBe('3시간 0분');
  });
  it('fmtKrwShort — 1억 이상 억 · 그 아래 만 · 0 「0만」', () => {
    expect(fmtKrwShort(458_400_000)).toBe('4.6억');
    expect(fmtKrwShort(69_997_680)).toBe('7,000만');
    expect(fmtKrwShort(0)).toBe('0만');
  });
  it('stripFactClock — 앞 「HH:MM:SS.mmm 」 하나만', () => {
    expect(stripFactClock('09:02:26.691 등락률 20% 첫 도달')).toBe('등락률 20% 첫 도달');
    expect(stripFactClock('잠김 2 종가까지 유지 — 2680.4초')).toBe('잠김 2 종가까지 유지 — 2680.4초');
  });
});

describe('memberBarsOf — 상한가 직전 1분 매수(event 0) · 마지막 깨진 잠김의 깨짐 직전 1분 매도 + 창', () => {
  it('덕우전자 — 매수 3 · 매도 2(「—」 자리 제외) · 이름 = memberName(m{k}_code) · range', () => {
    const bars = memberBarsOf(factsOf(DUKWOO), locksOf(DUKWOO), entryOf(DUKWOO));
    expect(bars.entry.range).toBe('09:05:01~09:06:01');
    expect(bars.sell!.range).toBe('09:05:12~09:06:12');
    expect(bars.entry.bars.map((b) => [b.name, b.pct])).toEqual([
      ['한국증권', 54.4],
      ['신한증권', 42.1],
      ['NH투자증권', 3.4],
    ]);
    expect(bars.sell?.bars.map((b) => [b.name, b.pct])).toEqual([
      ['신한증권', 96.2],
      ['NH투자증권', 3.8],
    ]);
    expect(bars.entry.bars[0]!.label).toBe('54.4%');
  });

  it('깨진 잠김 없음 → sell null (엑시온그룹)', () => {
    const bars = memberBarsOf(factsOf(AXION), locksOf(AXION), entryOf(AXION));
    expect(bars.sell).toBeNull();
    expect(bars.entry.bars[0]!.name).toBe('JP모간');
    expect(bars.entry.range).toBe('14:44:27~14:45:27');
  });

  it('깨진 잠김은 있는데 사실이 없으면 [] · 코드가 없으면 m{k} 글자 · 마지막 깨진 잠김 = end_ms 가장 늦은 것', () => {
    const lk = [
      lockRow({ isin: 'X', lock_id: 1, broke: true, end_ms: kstMs(D, '10:00:00') }),
      lockRow({ isin: 'X', lock_id: 2, broke: true, end_ms: kstMs(D, '11:00:00') }),
    ];
    const f = [
      fact({ event_no: 0, fact_no: 1, template_id: 'member_entry_buy', values: { m1: '어딘가', m1_code: null, s1: 12.5, m2: '—', m2_code: null, s2: '—' } }),
      fact({ event_no: 1, fact_no: 1, template_id: 'member_prebreak_sell', values: { m1: 'A', m1_code: '00050', s1: 70 } }),
    ];
    const bars = memberBarsOf(f, lk);
    expect(bars.entry.bars.map((b) => b.name)).toEqual(['어딘가']);
    expect(bars.sell?.bars).toEqual([]); // lock 2 의 사실이 없다
    expect(bars.sell?.range).toBe('10:59:00~11:00:00');
    expect(memberBarsOf([], []).entry).toEqual({ bars: [], range: null });
  });
});

// ---------------------------------------------------------------------------
// 지문표 · 어제 결과
// ---------------------------------------------------------------------------

describe('fingerprintRowsOf — gh-trade 지문표(MIN_FINGERPRINT_EVENTS = 10)', () => {
  const base = {
    entry_sum: 0, entry_cnt: 0, lock_buy_sum: 0, lock_buy_cnt: 0, pre_sell_sum: 0, pre_sell_cnt: 0,
    lead: 0, n_broke: 0, n_lock: 0, n_held: 0,
  };
  it('평균 = round(sum ÷ cnt × 100)% · cnt 0 → 「—」 · 선행 · 유지율 · 관찰 중 게이트', () => {
    const rows = fingerprintRowsOf([
      { ...base, member: '00050', name: '키움증권', n: 9, entry_sum: 2.97, entry_cnt: 9, lock_buy_sum: 1.45, lock_buy_cnt: 5,
        pre_sell_sum: 0.9, pre_sell_cnt: 5, lead: 2, n_broke: 5, n_lock: 9, n_held: 4 },
      { ...base, member: '00002', name: null, n: 12, lock_buy_sum: 0.5, lock_buy_cnt: 1 },
    ]);
    expect(rows[0]).toMatchObject({ member: '00002', label: '신한증권 00002', n: '12', entry: '—', lockBuy: '50%',
      preSell: '—', lead: '—', hold: '—', observing: false });
    expect(rows[1]).toMatchObject({ member: '00050', label: '키움증권 00050', n: '9', entry: '33%', lockBuy: '29%',
      preSell: '18%', lead: '2/5', hold: '4/9', observing: true });
  });

  it('표에 없는 회원번호는 번호만', () => {
    expect(fingerprintRowsOf([{ ...base, member: '98765', name: null, n: 1 }])[0]!.label).toBe('98765');
  });
});

describe('yesterdayRowsOf — 이전 적재 날짜 locks 를 종목마다 한 행', () => {
  it('prev null → null', () => {
    expect(yesterdayRowsOf(null)).toBeNull();
  });

  it('첫 잠김 행 · 손익 fmtRet(d1_ret × 100) · d1 없음 「—」 · 부제 날짜', () => {
    const y = yesterdayRowsOf({
      date: '20261001',
      locks: [
        lockRow({ isin: 'B', lock_id: 1, name: '덕우전자', upper_px: 5730, d1_open: 5640, d1_ret: -0.0157 }),
        lockRow({ isin: 'A', lock_id: 2, name: '원일티엔아이', upper_px: 14100, d1_open: 99, d1_ret: 0.9 }),
        lockRow({ isin: 'A', lock_id: 1, name: '원일티엔아이', upper_px: 14100, d1_open: 14450, d1_ret: 0.0248 }),
        lockRow({ isin: 'C', lock_id: 1, short_code: '000030', upper_px: 1000, d1_open: null, d1_ret: null }),
      ],
    })!;
    expect(y.date).toBe('10/01');
    expect(y.rows.map((r) => [r.label, r.upper, r.d1Open, r.pnl, r.tone])).toEqual([
      ['원일티엔아이', '14,100', '14,450', '+2.5%', 'up'],
      ['덕우전자', '5,730', '5,640', '−1.6%', 'down'],
      ['000030', '1,000', '—', '—', 'fg'],
    ]);
  });
});

// ---------------------------------------------------------------------------
// 오버레이 글자 배치 (E8 overflow backstop)
// ---------------------------------------------------------------------------

describe('layoutEventBand — 라벨 띠(최대 3줄 · 넘치면 점 위 번호만)', () => {
  const overlaps = (a: { row: number; left: number; width: number }, b: typeof a) =>
    a.row === b.row && a.row >= 0 && a.left < b.left + b.width && b.left < a.left + a.width;

  it('같은 x 근처 5개 → 3줄까지 쌓고 4 · 5번째는 row −1 · 겹침 0 · 폭 안', () => {
    const items = [1, 2, 3, 4, 5].map((n) => ({ n, xPx: 200 + n, text: `09:06:0${n} 매수 신규 +4.6억` }));
    const { rows, placed } = layoutEventBand(items, 600);
    expect(EVENT_BAND_MAX_ROWS).toBe(3);
    expect(rows).toBe(3);
    expect(placed.map((p) => p.row)).toEqual([0, 1, 2, -1, -1]);
    for (const p of placed.filter((x) => x.row >= 0)) {
      expect(p.left).toBeGreaterThanOrEqual(0);
      expect(p.left + p.width).toBeLessThanOrEqual(600);
    }
    for (let i = 0; i < placed.length; i += 1)
      for (let j = i + 1; j < placed.length; j += 1) expect(overlaps(placed[i]!, placed[j]!)).toBe(false);
  });

  it('번호 원이 마커 바로 위(left = x − 9) · 오른쪽 끝 마커는 폭 안으로 당긴다 · 왼쪽 끝은 0', () => {
    const { placed } = layoutEventBand(
      [
        { n: 1, xPx: 5, text: '09:02:26 20% 도달 · 5,300원' },
        { n: 2, xPx: 250, text: '09:02:51 매수 버스트 3,314만' },
        { n: 3, xPx: 798, text: '15:30:08 종가까지 유지 · 44분 40초' },
      ],
      800,
    );
    expect(placed[0]!.left).toBe(0);
    expect(placed[1]!.left).toBe(241);
    expect(placed[2]!.left + placed[2]!.width).toBe(800);
    expect(placed.map((p) => p.row)).toEqual([0, 0, 0]);
  });

  it('글자 없는(폰) 배지는 폭 18 · 띠 없음이면 rows 0', () => {
    const { placed } = layoutEventBand([{ n: 1, xPx: 100, text: '' }], 328);
    expect(placed[0]).toEqual({ n: 1, row: 0, left: 91, width: 18 });
    expect(layoutEventBand([], 328)).toEqual({ rows: 0, placed: [] });
  });

  it('폰 폭(328px · 번호만)에서 덕우전자 레인 2 번호 배지가 겹치지 않고 레인 안에 있다', () => {
    const lane = laneLockOf(
      gridOf(DUKWOO),
      locksOf(DUKWOO),
      marksOf(DUKWOO),
      eventsOf(entryOf(DUKWOO), locksOf(DUKWOO), factsOf(DUKWOO)),
    )!;
    const { placed } = layoutEventBand(
      lane.points.map((p) => ({ n: p.n, xPx: (p.x / 100) * 328, text: '' })),
      328,
    );
    for (const p of placed.filter((x) => x.row >= 0)) {
      expect(p.left).toBeGreaterThanOrEqual(0);
      expect(p.left + p.width).toBeLessThanOrEqual(328);
    }
    for (let i = 0; i < placed.length; i += 1)
      for (let j = i + 1; j < placed.length; j += 1) expect(overlaps(placed[i]!, placed[j]!)).toBe(false);
  });

  it('estimateLabelWidth — 한글 11px · 숫자 6.6px 어림', () => {
    expect(estimateLabelWidth('깨짐')).toBe(24);
    expect(estimateLabelWidth('10')).toBe(16);
  });
});
