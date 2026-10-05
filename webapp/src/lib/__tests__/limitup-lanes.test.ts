import { describe, it, expect } from 'vitest';

import type { LimitupFactRow, LimitupGridCol, LimitupGridFile, LimitupMarkRow } from '@gh-radar/shared';

/**
 * Phase 28 Plan 13 Task 1 — 사건 카드 레인 · 표 계산 lib (D-11 · D-12 · gh-trade `_section_a_cards` 창 · 마커 규칙).
 *
 * 잠그는 것(behavior 1~9):
 *  - gridSeries: fine 우선 · coarse 보충 · sec 오름차순 · null 보존
 *  - laneEntryOf: 기준 시각 사슬 · 창 [a − 600, a + 60] ∩ 장중 · 25% 도달 · 매도벽 소진 · 첫 상한가 체결 · 눈금 4개 · 상한가 · 25% 선
 *  - laneLockOf: 창 [첫 start − 120, 마지막 end + 60] · 음영 · 최대 점 라벨 · 가장 큰 ▼ · ✕ 하나씩만 글자 · 깨짐 ●
 *  - lockTagsOf · fmtSpan · circledNumber · factsSorted · memberBarsOf · fingerprintRowsOf · yesterdayRowsOf
 * 입력은 실 export 20261002(덕우전자 깨짐 · 엑시온그룹 유지 · 형지글로벌 미도달)와 합성 행.
 */

import {
  circledNumber,
  factsSorted,
  fingerprintRowsOf,
  fmtSpan,
  gridSeries,
  laneEntryOf,
  laneLockOf,
  lockTagsOf,
  memberBarsOf,
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

describe('laneEntryOf — 진입 10분(gh-trade ENTRY_WINDOW_S 600 · MEMBER_WINDOW_S 60)', () => {
  it('덕우전자 — 첫 상한 체결 09:06:01 기준 · 09:00 에서 잘림 · 마커 3종 · 눈금 4개', () => {
    const lane = laneEntryOf(gridOf(DUKWOO), entryOf(DUKWOO), locksOf(DUKWOO))!;
    expect(lane).not.toBeNull();
    expect(lane.range).toBe('09:00~09:07');
    expect(lane.ticks.map((t) => t.label)).toEqual(['09:00', '09:02', '09:04', '09:07']);
    expect(lane.ticks.map((t) => Math.round(t.x))).toEqual([0, 33, 67, 100]);

    const byKind = Object.fromEntries(lane.marks.map((m) => [m.kind, m]));
    expect(byKind.reach25?.label).toBe('25% 도달');
    expect(byKind.wallClear?.label).toBe('매도벽 소진');
    expect(byKind.wallClear?.title).toContain('09:03:40');
    expect(byKind.firstUpper?.label).toBe('첫 상한가 체결');
    expect(byKind.firstUpper?.title).toContain('09:06:01');
    // 첫 상한 체결 = 창 끝에서 60초 앞(창 421초) — x ≈ 85.7%
    expect(byKind.firstUpper!.x).toBeCloseTo(((32_761 - 32_400) / 421) * 100, 1);

    const upper = lane.lines.find((l) => l.kind === 'upper')!;
    const p25 = lane.lines.find((l) => l.kind === 'p25')!;
    expect(upper.label).toBe('상한가 5,730');
    expect(p25.label).toBe('등락률 25%');
    // 가격은 위 절반 — 상한가가 25% 선보다 위(y 작음)
    expect(upper.y).toBeLessThan(p25.y);
    expect(p25.y).toBeLessThan(50);

    expect(lane.pricePath.startsWith('M')).toBe(true);
    expect(lane.wallPath.startsWith('M')).toBe(true);
    expect(lane.wallArea).toMatch(/Z$/);
    for (const m of lane.marks) expect(inRange(m.x) && inRange(m.y)).toBe(true);
  });

  it('25% 도달이 창 밖이면 그 마커는 없다(엑시온그룹 t25 12:09:57 · 창 14:35:27~14:46:27)', () => {
    const lane = laneEntryOf(gridOf(AXION), entryOf(AXION), locksOf(AXION))!;
    expect(lane.range).toBe('14:35~14:46');
    expect(lane.marks.map((m) => m.kind)).not.toContain('reach25');
    expect(lane.marks.map((m) => m.kind)).toContain('firstUpper');
  });

  it('미도달(형지글로벌) — 기준 = t{detect_rate_pct} 15:10:28 · 첫 체결 · 25% 마커 없음', () => {
    const lane = laneEntryOf(gridOf(HYUNGJI), entryOf(HYUNGJI), [])!;
    expect(lane.range).toBe('15:00~15:11');
    expect(lane.marks.map((m) => m.kind)).not.toContain('firstUpper');
    expect(lane.marks.map((m) => m.kind)).not.toContain('reach25');
  });

  it('기준 시각이 하나도 없으면 null · entry 없이 잠김만 있으면 첫 잠김 시작', () => {
    const g = synthGrid(34_500, 34_600);
    expect(laneEntryOf(g, entryRow({ isin: 'X' }), [])).toBeNull();
    const lane = laneEntryOf(g, null, [lockRow({ isin: 'X', lock_id: 1, start_ms: kstMs(D, '10:00:00') })])!;
    expect(lane.range).toBe('09:50~10:01');
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

describe('laneLockOf — 잠김 전 구간(창 [첫 start − 120, 마지막 end + 60])', () => {
  it('잠김 없음 → null', () => {
    expect(laneLockOf(gridOf(HYUNGJI), [], [])).toBeNull();
  });

  it('덕우전자 — 음영 1 · 최대 점 · 가장 큰 ▼ · ✕ 하나씩만 글자 · 깨짐 ● 라벨', () => {
    const lane = laneLockOf(gridOf(DUKWOO), locksOf(DUKWOO), marksOf(DUKWOO))!;
    expect(lane.range).toBe('09:04~09:07');
    expect(lane.shades).toHaveLength(1);
    expect(lane.lines.find((l) => l.kind === 'base')?.label).toBe('기준 10억');

    const max = lane.marks.filter((m) => m.kind === 'max');
    expect(max).toHaveLength(1);
    expect(max[0]!.label).toBe('최대 27.5억 @09:06:02');

    const sells = lane.marks.filter((m) => m.kind === 'sell');
    const cancels = lane.marks.filter((m) => m.kind === 'cancel');
    expect(sells).toHaveLength(7);
    expect(cancels).toHaveLength(6);
    expect(sells.filter((m) => m.label !== null).map((m) => m.label)).toEqual(['09:06 매도 6,713주']);
    expect(cancels.filter((m) => m.label !== null).map((m) => m.label)).toEqual(['취소 −4.6억']);
    for (const m of [...sells, ...cancels]) expect(m.title).not.toBe('');

    const br = lane.marks.filter((m) => m.kind === 'break');
    expect(br.map((m) => m.label)).toEqual(['깨짐 09:06:12']);
    expect(lane.summary).toBe('최대 27.5억 09:06:02, 깨짐 09:06:12');
    expect(lane.path.startsWith('M')).toBe(true);
    for (const m of lane.marks) expect(inRange(m.x) && inRange(m.y)).toBe(true);
  });

  it('엑시온그룹 — 유지 잠김(깨짐 ● 없음) · 창 끝 = 15:30 에서 잘림', () => {
    const lane = laneLockOf(gridOf(AXION), locksOf(AXION), marksOf(AXION))!;
    expect(lane.range).toBe('14:43~15:29');
    expect(lane.marks.filter((m) => m.kind === 'break')).toHaveLength(0);
    expect(lane.summary.startsWith('최대 ')).toBe(true);
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
    expect(lane.marks.find((x) => x.kind === 'cancel')?.label).toBe('취소 −2.1억');
  });
});

// ---------------------------------------------------------------------------
// 태그 · 지속 · 원숫자
// ---------------------------------------------------------------------------

describe('lockTagsOf · fmtSpan · circledNumber', () => {
  it('깨짐 = 「잠김 ③ · 43분 뒤 깨짐」(up) · 유지 = 「잠김 ④ · 종가 유지」(down) · 21 이상 원숫자 없음', () => {
    const { tags, more } = lockTagsOf([
      lockRow({ isin: 'X', lock_id: 4, broke: false, dur_s: 900 }),
      lockRow({ isin: 'X', lock_id: 3, broke: true, dur_s: 2580 }),
      lockRow({ isin: 'X', lock_id: 21, broke: true, dur_s: 45 }),
    ]);
    expect(tags).toEqual([
      { text: '잠김 ③ · 43분 뒤 깨짐', tone: 'up' },
      { text: '잠김 ④ · 종가 유지', tone: 'down' },
      { text: '잠김 21 · 45초 뒤 깨짐', tone: 'up' },
    ]);
    expect(more).toBeNull();
  });

  it('실 export — 덕우전자 「잠김 ① · 10초 뒤 깨짐」 · 엑시온그룹 「잠김 ② · 종가 유지」', () => {
    expect(lockTagsOf(locksOf(DUKWOO)).tags.map((t) => t.text)).toEqual(['잠김 ① · 10초 뒤 깨짐']);
    expect(lockTagsOf(locksOf(AXION)).tags.map((t) => t.text)).toEqual(['잠김 ② · 종가 유지']);
  });

  it('8개 → 6개 + 「+2」(title 에 나머지)', () => {
    const many = Array.from({ length: 8 }, (_, i) => lockRow({ isin: 'X', lock_id: i + 1, broke: true, dur_s: 30 }));
    const { tags, more } = lockTagsOf(many);
    expect(tags).toHaveLength(6);
    expect(more?.text).toBe('+2');
    expect(more?.title).toBe('잠김 ⑦ · 30초 뒤 깨짐 · 잠김 ⑧ · 30초 뒤 깨짐');
  });

  it('fmtSpan — 60초 미만 「N초」 · 60분 미만 「N분」 · 그 이상 「N시간 M분」', () => {
    expect(fmtSpan(45)).toBe('45초');
    expect(fmtSpan(10.103)).toBe('10초');
    expect(fmtSpan(2580)).toBe('43분');
    expect(fmtSpan(3700)).toBe('1시간 1분');
  });

  it('circledNumber — 1~20 원숫자 · 그 밖 숫자', () => {
    expect(circledNumber(1)).toBe('①');
    expect(circledNumber(20)).toBe('⑳');
    expect(circledNumber(21)).toBe('21');
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

describe('factsSorted — t_ms(없으면 뒤) → event_no → fact_no · 글자 그대로', () => {
  it('합성', () => {
    const t = kstMs(D, '10:00:00');
    const rows = factsSorted([
      fact({ event_no: 1, fact_no: 2, t_ms: null }),
      fact({ event_no: 1, fact_no: 1, t_ms: t }),
      fact({ event_no: 0, fact_no: 3, t_ms: t }),
      fact({ event_no: 0, fact_no: 1, t_ms: t - 1000 }),
    ]);
    expect(rows.map((r) => r.text)).toEqual(['e0f1', 'e0f3', 'e1f1', 'e1f2']);
    expect(rows.map((r) => r.clock)).toEqual(['09:59:59', '10:00:00', '10:00:00', '—']);
  });

  it('실 export — 덕우전자 첫 줄 = 20% 첫 도달 · 출처 글자 그대로', () => {
    const rows = factsSorted(factsOf(DUKWOO));
    expect(rows[0]!.text).toBe('09:02:26.691 등락률 20% 첫 도달 — 현재가 5,300원');
    expect(rows.map((r) => r.source)).toContain('추정(분 단위)');
    expect(rows).toHaveLength(factsOf(DUKWOO).length);
  });
});

describe('memberBarsOf — 진입 1분 매수(event 0) · 마지막 깨진 잠김의 깨짐 전 1분 매도', () => {
  it('덕우전자 — 매수 3 · 매도 2(「—」 자리 제외) · 이름 = memberName(m{k}_code)', () => {
    const bars = memberBarsOf(factsOf(DUKWOO), locksOf(DUKWOO));
    expect(bars.entry.map((b) => [b.name, b.pct])).toEqual([
      ['한국증권', 54.4],
      ['신한증권', 42.1],
      ['NH투자증권', 3.4],
    ]);
    expect(bars.sell?.map((b) => [b.name, b.pct])).toEqual([
      ['신한증권', 96.2],
      ['NH투자증권', 3.8],
    ]);
    expect(bars.entry[0]!.label).toBe('54.4%');
  });

  it('깨진 잠김 없음 → sell null (엑시온그룹)', () => {
    const bars = memberBarsOf(factsOf(AXION), locksOf(AXION));
    expect(bars.sell).toBeNull();
    expect(bars.entry[0]!.name).toBe('JP모간');
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
    expect(bars.entry.map((b) => b.name)).toEqual(['어딘가']);
    expect(bars.sell).toEqual([]); // lock 2 의 사실이 없다
    expect(memberBarsOf([], []).entry).toEqual([]);
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
