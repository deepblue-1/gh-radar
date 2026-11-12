/**
 * Phase 42 Plan 03 Task 3 — 봉 차트 브라우저 기억(차트 종류 · 봉 단위 · 이동평균 구성 · UI-SPEC S10 · S3 색 배정).
 *
 * 깨지면: 새로고침 뒤 고른 차트 · 봉 단위 · 이동평균이 사라지거나, 깨진 저장값 때문에 화면이 멈춘다.
 */

import { act, render, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_MA_CONFIG,
  TICK_CANDLE_MA_KEY,
  TICK_CANDLE_UNIT_KEY,
  TICK_CHART_KIND_KEY,
  addMaLine,
  nextMaColor,
  parseCandleUnit,
  parseChartKind,
  parseMaConfig,
  readCandleUnit,
  readChartKind,
  readMaConfig,
  removeMaLine,
  subscribeCandlePrefs,
  toggleMaLine,
  writeCandleUnit,
  writeChartKind,
  writeMaConfig,
  type MaConfig,
  type MaLine,
} from '../candle-prefs';
import { maKeyOf } from '../candle-ma';
import { useCandleUnitPref, useChartKind, useMaConfig } from '../use-candle-prefs';

const line = (base: 'bar' | 'day', n: number, kind: 'sma' | 'ema', color: number, on = true): MaLine => ({
  base,
  n,
  kind,
  on,
  color,
});
const raw = (lines: unknown, v: unknown = 1) => JSON.stringify({ v, lines });

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('봉 차트 기억 — 키 · 기본값', () => {
  it('키 셋은 gh-radar: 접두 · 전체 공통', () => {
    expect(TICK_CHART_KIND_KEY).toBe('gh-radar:tick-chart-kind');
    expect(TICK_CANDLE_UNIT_KEY).toBe('gh-radar:tick-candle-unit');
    expect(TICK_CANDLE_MA_KEY).toBe('gh-radar:tick-candle-ma');
  });

  it('저장 없음 → 선 차트 · 자동 · 기본 구성(단순 5 색 1 · 단순 20 색 2 · 둘 다 켜짐)', () => {
    expect(readChartKind()).toBe('line');
    expect(readCandleUnit()).toBe('auto');
    expect(readMaConfig()).toEqual({
      v: 1,
      lines: [line('bar', 5, 'sma', 1), line('bar', 20, 'sma', 2)],
    });
    expect(readMaConfig()).toBe(DEFAULT_MA_CONFIG);
  });

  it('parseChartKind — candle 만 봉 차트 · 모르는 값 · 없음은 선 차트', () => {
    expect(parseChartKind('candle')).toBe('candle');
    expect(parseChartKind('line')).toBe('line');
    expect(parseChartKind('bar')).toBe('line');
    expect(parseChartKind(null)).toBe('line');
  });

  it('parseCandleUnit — 1 · 5 · 10 · 15 · 30 · 60 은 수로 · 모르는 값은 자동', () => {
    expect(parseCandleUnit('15')).toBe(15);
    expect(parseCandleUnit('1')).toBe(1);
    expect(parseCandleUnit('60')).toBe(60);
    expect(parseCandleUnit('auto')).toBe('auto');
    expect(parseCandleUnit('7')).toBe('auto');
    expect(parseCandleUnit('x')).toBe('auto');
    expect(parseCandleUnit(' 5')).toBe('auto');
    expect(parseCandleUnit(null)).toBe('auto');
  });
});

describe('봉 차트 기억 — 이동평균 구성 읽기 검사', () => {
  it('깨진 JSON · v 불일치 · lines 가 배열 아님 · null → 기본 구성', () => {
    for (const r of ['{', 'null', '42', raw([], 2), JSON.stringify({ v: 1, lines: {} }), JSON.stringify({ v: 1 })]) {
      expect(parseMaConfig(r), r).toEqual(DEFAULT_MA_CONFIG);
    }
  });

  it('빈 배열 [] 은 「사용자가 다 지움」 이라 그대로 지킨다', () => {
    expect(parseMaConfig(raw([]))).toEqual({ v: 1, lines: [] });
  });

  it('틀린 항목(범위 밖 · 일 + 지수 · 모르는 기준 · 켜짐 값 아님 · 객체 아님)만 버린다', () => {
    const cfg = parseMaConfig(
      raw([
        line('bar', 300, 'sma', 1),
        line('day', 20, 'ema', 2),
        { base: 'week', n: 20, kind: 'sma', on: true, color: 3 },
        { base: 'bar', n: 10, kind: 'sma', on: 'yes', color: 4 },
        'x',
        null,
        line('bar', 10, 'ema', 5, false),
        line('day', 60, 'sma', 6),
      ]),
    );
    expect(cfg.lines).toEqual([line('bar', 10, 'ema', 5, false), line('day', 60, 'sma', 6)]);
  });

  it('같은 선이 두 번이면 첫 것만 · 7번째부터 버린다', () => {
    const dup = parseMaConfig(raw([line('bar', 5, 'sma', 1), line('bar', 5, 'sma', 2, false), line('bar', 5, 'ema', 3)]));
    expect(dup.lines.map(maKeyOf)).toEqual(['bar:sma:5', 'bar:ema:5']);
    expect(dup.lines[0]!.on).toBe(true);

    const many = parseMaConfig(raw([2, 3, 4, 5, 6, 7, 8, 9].map((n, i) => line('bar', n, 'sma', i + 1 > 6 ? 1 : i + 1))));
    expect(many.lines).toHaveLength(6);
    expect(many.lines.map((l) => l.n)).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it('색 번호 중복 · 범위 밖은 빈 가장 작은 번호로 다시 준다 — [1, 1, 9] → [1, 2, 3]', () => {
    const cfg = parseMaConfig(raw([line('bar', 5, 'sma', 1), line('bar', 20, 'sma', 1), line('day', 20, 'sma', 9)]));
    expect(cfg.lines.map((l) => l.color)).toEqual([1, 2, 3]);
    const keep = parseMaConfig(raw([line('bar', 5, 'sma', 4), line('bar', 20, 'sma', 0), line('bar', 60, 'sma', 1)]));
    expect(keep.lines.map((l) => l.color)).toEqual([4, 2, 1]);
  });
});

describe('봉 차트 기억 — 이동평균 더하기 · 켜고 끄기 · 지우기 · 색 배정', () => {
  it('addMaLine — 맨 뒤 · 켜짐 · 빈 가장 작은 색(3)', () => {
    const next = addMaLine(DEFAULT_MA_CONFIG, { base: 'bar', n: 20, kind: 'ema' });
    expect(next).not.toBe(DEFAULT_MA_CONFIG);
    expect(next.lines).toHaveLength(3);
    expect(next.lines[2]).toEqual(line('bar', 20, 'ema', 3));
    expect(DEFAULT_MA_CONFIG.lines).toHaveLength(2); // 원본 불변
  });

  it('addMaLine — 같은 선 · 틀린 선 · 6개 상태에서는 같은 객체를 돌려준다', () => {
    expect(addMaLine(DEFAULT_MA_CONFIG, { base: 'bar', n: 5, kind: 'sma' })).toBe(DEFAULT_MA_CONFIG);
    expect(addMaLine(DEFAULT_MA_CONFIG, { base: 'day', n: 20, kind: 'ema' })).toBe(DEFAULT_MA_CONFIG);
    expect(addMaLine(DEFAULT_MA_CONFIG, { base: 'bar', n: 1, kind: 'sma' })).toBe(DEFAULT_MA_CONFIG);
    let cfg: MaConfig = DEFAULT_MA_CONFIG;
    for (const n of [60, 120, 240, 3]) cfg = addMaLine(cfg, { base: 'bar', n, kind: 'sma' });
    expect(cfg.lines).toHaveLength(6);
    expect(nextMaColor(cfg.lines)).toBeNull();
    expect(addMaLine(cfg, { base: 'bar', n: 7, kind: 'sma' })).toBe(cfg);
  });

  it('removeMaLine 뒤 그 색이 빈다 — 다음 더하기가 그 번호 · toggleMaLine 은 색 불변', () => {
    let cfg = addMaLine(DEFAULT_MA_CONFIG, { base: 'day', n: 20, kind: 'sma' }); // 색 3
    cfg = removeMaLine(cfg, 'bar:sma:5'); // 색 1 이 빈다
    expect(cfg.lines.map((l) => l.color)).toEqual([2, 3]);
    expect(nextMaColor(cfg.lines)).toBe(1);
    cfg = addMaLine(cfg, { base: 'bar', n: 60, kind: 'ema' });
    expect(cfg.lines[2]).toEqual(line('bar', 60, 'ema', 1));

    const off = toggleMaLine(cfg, 'day:sma:20');
    expect(off.lines[1]).toEqual(line('day', 20, 'sma', 3, false));
    expect(toggleMaLine(off, 'day:sma:20').lines[1]).toEqual(line('day', 20, 'sma', 3, true));
    expect(toggleMaLine(cfg, 'bar:sma:999')).toBe(cfg);
    expect(removeMaLine(cfg, 'bar:sma:999')).toBe(cfg);
  });
});

describe('봉 차트 기억 — 읽기 · 쓰기 · 구독', () => {
  it('readMaConfig — 원문이 같으면 같은 참조 · 원문이 바뀌면 새로 읽는다', () => {
    window.localStorage.setItem(TICK_CANDLE_MA_KEY, raw([line('bar', 10, 'sma', 1)]));
    const a = readMaConfig();
    const b = readMaConfig();
    expect(b).toBe(a);
    expect(a.lines).toEqual([line('bar', 10, 'sma', 1)]);
    window.localStorage.setItem(TICK_CANDLE_MA_KEY, raw([]));
    expect(readMaConfig()).not.toBe(a);
    expect(readMaConfig().lines).toEqual([]);
  });

  it('쓰기는 저장 + 같은 탭 구독자 알림 · 봉 단위는 문자열로 · 구독 해제 뒤엔 알림 없음', () => {
    const cb = vi.fn();
    const off = subscribeCandlePrefs(cb);
    writeChartKind('candle');
    writeCandleUnit(5);
    writeCandleUnit('auto');
    const cfg = addMaLine(DEFAULT_MA_CONFIG, { base: 'day', n: 20, kind: 'sma' });
    writeMaConfig(cfg);
    expect(cb).toHaveBeenCalledTimes(4);
    expect(window.localStorage.getItem(TICK_CHART_KIND_KEY)).toBe('candle');
    expect(window.localStorage.getItem(TICK_CANDLE_UNIT_KEY)).toBe('auto');
    expect(JSON.parse(window.localStorage.getItem(TICK_CANDLE_MA_KEY)!)).toEqual({ v: 1, lines: cfg.lines });
    expect(readChartKind()).toBe('candle');
    expect(readMaConfig()).toEqual(cfg);
    writeCandleUnit(15);
    expect(window.localStorage.getItem(TICK_CANDLE_UNIT_KEY)).toBe('15');
    expect(readCandleUnit()).toBe(15);
    off();
    writeChartKind('line');
    expect(cb).toHaveBeenCalledTimes(5);
  });

  it('저장 쓰기가 throw 해도 예외가 밖으로 안 나오고 · 구독자는 알림 · 이 탭 화면은 고른 값', () => {
    const cb = vi.fn();
    const off = subscribeCandlePrefs(cb);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const cfg = addMaLine(DEFAULT_MA_CONFIG, { base: 'bar', n: 60, kind: 'sma' });
    expect(() => writeMaConfig(cfg)).not.toThrow();
    expect(() => writeChartKind('candle')).not.toThrow();
    expect(() => writeCandleUnit(30)).not.toThrow();
    expect(cb).toHaveBeenCalledTimes(3);
    expect(readMaConfig()).toEqual(cfg);
    expect(readChartKind()).toBe('candle');
    expect(readCandleUnit()).toBe(30);
    // 다음 쓰기가 성공하면 다시 저장소가 정본
    spy.mockRestore();
    writeMaConfig(DEFAULT_MA_CONFIG);
    writeChartKind('line');
    writeCandleUnit('auto');
    expect(window.localStorage.getItem(TICK_CHART_KIND_KEY)).toBe('line');
    off();
  });

  it('저장 읽기가 throw 하면 기본값', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(readChartKind()).toBe('line');
    expect(readCandleUnit()).toBe('auto');
    expect(readMaConfig()).toBe(DEFAULT_MA_CONFIG);
  });
});

describe('봉 차트 기억 — 훅', () => {
  function KindProbe() {
    const [kind] = useChartKind();
    const [unit] = useCandleUnitPref();
    const [cfg] = useMaConfig();
    return createElement('span', null, `${kind}|${unit}|${cfg.lines.length}`);
  }

  it('서버 렌더는 기본값(선 차트 · 자동 · 기본 구성) — 저장이 있어도', () => {
    window.localStorage.setItem(TICK_CHART_KIND_KEY, 'candle');
    window.localStorage.setItem(TICK_CANDLE_UNIT_KEY, '5');
    window.localStorage.setItem(TICK_CANDLE_MA_KEY, raw([]));
    expect(renderToString(createElement(KindProbe))).toContain('line|auto|2');
  });

  it('마운트 뒤 저장값 · setter 가 저장 + 같은 탭 구독자 갱신', () => {
    window.localStorage.setItem(TICK_CHART_KIND_KEY, 'candle');
    const kind = renderHook(() => useChartKind());
    expect(kind.result.current[0]).toBe('candle');
    const other = render(createElement(KindProbe));
    act(() => kind.result.current[1]('line'));
    expect(kind.result.current[0]).toBe('line');
    expect(window.localStorage.getItem(TICK_CHART_KIND_KEY)).toBe('line');
    expect(other.container.textContent).toBe('line|auto|2');

    const unit = renderHook(() => useCandleUnitPref());
    act(() => unit.result.current[1](10));
    expect(unit.result.current[0]).toBe(10);
    expect(other.container.textContent).toBe('line|10|2');

    const ma = renderHook(() => useMaConfig());
    const first = ma.result.current[0];
    ma.rerender();
    expect(ma.result.current[0]).toBe(first); // 같은 원문 = 같은 참조(무한 재렌더 없음)
    act(() => ma.result.current[1](addMaLine(first, { base: 'bar', n: 60, kind: 'ema' })));
    expect(ma.result.current[0].lines).toHaveLength(3);
    expect(other.container.textContent).toBe('line|10|3');
  });
});
