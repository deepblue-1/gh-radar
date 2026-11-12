/**
 * 봉 차트 브라우저 기억 (Phase 42 D-02 · D-09 · D-10 · UI-SPEC S10 · S3 「색 배정」 · RESEARCH Pattern 7 · Pitfall 9).
 *
 * ① 키 셋(`localStorage` · 종목별이 아니라 전체 공통 · `gh-radar:` 접두 관례):
 *   - `gh-radar:tick-chart-kind` = `line` | `candle` — 기본 `line`(처음 보이는 차트 = 기존 선 차트 · D-02).
 *   - `gh-radar:tick-candle-unit` = `auto` | `1` | `5` | `10` | `15` | `30` | `60` — 기본 `auto`(D-09).
 *   - `gh-radar:tick-candle-ma` = `{ v: 1, lines: [{ base, n, kind, on, color }] }` — 기본 단순 5(색 1 · 켜짐) · 단순 20(색 2 · 켜짐)(D-10).
 * ② 읽기: 못 읽음 · 모르는 값 → 기본. 이동평균은 JSON 실패 · `v` 불일치 · `lines` 배열 아님 → 기본 구성, 배열 안은
 *   **틀린 항목만 버리고**(범위 밖 · 일 + 지수 · 모르는 값) · 같은 선은 첫 것만 · 7번째부터 버리고 · 색 번호 중복 · 범위 밖은
 *   빈 가장 작은 번호로 다시 준다. **빈 배열 `[]` 은 「사용자가 다 지움」 이라 그대로 지킨다**(기본으로 되돌리지 않는다).
 * ③ 색 배정: 새 선 = 비어 있는 가장 작은 번호(1 ~ 6) · 지우면 그 번호가 빈다 · 켜고 끄기는 번호를 바꾸지 않는다.
 * ④ 쓰기: 바뀔 때마다 저장 + 같은 탭 구독자 알림. 저장 실패(사생활 모드 · 용량)는 조용히 삼키고 이 탭에서는 고른 값을
 *   메모리로 기억해 화면이 그대로 따라간다(다음 쓰기가 성공하면 다시 저장소가 정본).
 * ⑤ `useSyncExternalStore` 스냅숏 안정: `readMaConfig` 는 원문 문자열이 같으면 같은 객체를 돌려준다(Pitfall 9 — 무한 재렌더 방지).
 * ⑥ 탭 간 동기화(storage 이벤트)는 하지 않는다 — `sidebar-collapse.ts` 와 같은 단순성. 다른 탭은 다음 열 때 맞춰진다.
 * ⑦ 순수 lib — 클라이언트 지시문 · React import 없음. 훅은 `use-candle-prefs.ts`.
 */

import { MA_MAX_LINES, isValidMaSpec, maKeyOf, type MaSpec } from './candle-ma';

export const TICK_CHART_KIND_KEY = 'gh-radar:tick-chart-kind';
export const TICK_CANDLE_UNIT_KEY = 'gh-radar:tick-candle-unit';
export const TICK_CANDLE_MA_KEY = 'gh-radar:tick-candle-ma';

/** 차트 종류 — 선 차트(기존) | 봉 차트. */
export type ChartKindPref = 'line' | 'candle';
/** 봉 단위 기억 — 자동 | 분(`candle-chart.ts` `CandleUnit` 과 같은 숫자 집합 · 구조 타입으로 맞물린다). */
export type CandleUnitPref = 'auto' | 1 | 5 | 10 | 15 | 30 | 60;
/** 기억하는 이동평균 선 하나 — 정의 + 켜짐 + 색 번호(1 ~ 6 → `var(--ma-{color})`). */
export interface MaLine extends MaSpec {
  on: boolean;
  color: number;
}
/** 이동평균 구성(칩 순서 = 더한 순서). */
export interface MaConfig {
  v: 1;
  lines: readonly MaLine[];
}

/** 색 번호 개수(= 선 최대 개수). */
const MA_COLORS = MA_MAX_LINES;

/** 기본 구성 — 단순 5(색 1) · 단순 20(색 2) 켜짐. 같은 참조를 돌려줘야 하므로 얼려 둔다. */
export const DEFAULT_MA_CONFIG: MaConfig = Object.freeze({
  v: 1 as const,
  lines: Object.freeze([
    Object.freeze({ base: 'bar' as const, n: 5, kind: 'sma' as const, on: true, color: 1 }),
    Object.freeze({ base: 'bar' as const, n: 20, kind: 'sma' as const, on: true, color: 2 }),
  ]),
});

const CANDLE_UNIT_VALUES: readonly Exclude<CandleUnitPref, 'auto'>[] = [1, 5, 10, 15, 30, 60];

/** 차트 종류 원문 → `candle` 만 봉 차트 · 그 밖(없음 · 모르는 값)은 선 차트. */
export function parseChartKind(raw: string | null): ChartKindPref {
  return raw === 'candle' ? 'candle' : 'line';
}

/** 봉 단위 원문 → 알려진 분 숫자 문자열만 수로 · 그 밖은 자동. */
export function parseCandleUnit(raw: string | null): CandleUnitPref {
  if (raw === null) return 'auto';
  for (const u of CANDLE_UNIT_VALUES) if (raw === String(u)) return u;
  return 'auto';
}

/** 이동평균 구성 원문(JSON) → 검사한 구성(②). throw 하지 않는다. */
export function parseMaConfig(raw: string): MaConfig {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return DEFAULT_MA_CONFIG;
  }
  if (obj === null || typeof obj !== 'object') return DEFAULT_MA_CONFIG;
  const { v, lines } = obj as Record<string, unknown>;
  if (v !== 1 || !Array.isArray(lines)) return DEFAULT_MA_CONFIG;

  const kept: { spec: MaSpec; on: boolean; color: unknown }[] = [];
  const seen = new Set<string>();
  for (const item of lines) {
    if (kept.length >= MA_MAX_LINES) break; // 7번째부터 버림
    if (item === null || typeof item !== 'object') continue;
    const { base, n, kind, on, color } = item as Record<string, unknown>;
    const spec = { base, n, kind };
    if (!isValidMaSpec(spec) || typeof on !== 'boolean') continue; // 틀린 항목만 버림
    const key = maKeyOf(spec);
    if (seen.has(key)) continue; // 같은 선은 첫 것만
    seen.add(key);
    kept.push({ spec: { base: spec.base, n: spec.n, kind: spec.kind }, on, color });
  }

  // 색: 유효하고 아직 안 쓴 번호는 그대로 · 중복 · 범위 밖은 뒤에서 빈 가장 작은 번호로
  const used = new Set<number>();
  const colors: (number | null)[] = kept.map(({ color }) => {
    if (typeof color === 'number' && Number.isInteger(color) && color >= 1 && color <= MA_COLORS && !used.has(color)) {
      used.add(color);
      return color;
    }
    return null;
  });
  const out: MaLine[] = kept.map(({ spec, on }, i) => {
    let c = colors[i]!;
    if (c === null) {
      c = 1;
      while (used.has(c)) c++;
      used.add(c);
    }
    return { ...spec, on, color: c };
  });
  return { v: 1, lines: out };
}

/** 비어 있는 가장 작은 색 번호(1 ~ 6) · 다 찼으면 null. */
export function nextMaColor(lines: readonly MaLine[]): number | null {
  const used = new Set(lines.map((l) => l.color));
  for (let c = 1; c <= MA_COLORS; c++) if (!used.has(c)) return c;
  return null;
}

/** 선 더하기 — 맨 뒤 · 켜짐 · 빈 가장 작은 색. 틀린 선 · 같은 선 · 6개면 같은 객체를 돌려준다(아무 일도 안 함). */
export function addMaLine(cfg: MaConfig, spec: MaSpec): MaConfig {
  if (!isValidMaSpec(spec) || cfg.lines.length >= MA_MAX_LINES) return cfg;
  const key = maKeyOf(spec);
  if (cfg.lines.some((l) => maKeyOf(l) === key)) return cfg;
  const color = nextMaColor(cfg.lines);
  if (color === null) return cfg;
  return { v: 1, lines: [...cfg.lines, { base: spec.base, n: spec.n, kind: spec.kind, on: true, color }] };
}

/** 켜고 끄기 — 색 번호는 그대로. 없는 키면 같은 객체. */
export function toggleMaLine(cfg: MaConfig, key: string): MaConfig {
  if (!cfg.lines.some((l) => maKeyOf(l) === key)) return cfg;
  return { v: 1, lines: cfg.lines.map((l) => (maKeyOf(l) === key ? { ...l, on: !l.on } : l)) };
}

/** 지우기 — 그 색 번호가 빈다. 없는 키면 같은 객체. */
export function removeMaLine(cfg: MaConfig, key: string): MaConfig {
  const lines = cfg.lines.filter((l) => maKeyOf(l) !== key);
  return lines.length === cfg.lines.length ? cfg : { v: 1, lines };
}

// ── 저장소 접근 ─────────────────────────────────────────────────────────────

const listeners = new Set<() => void>();
/** 저장 실패한 쓰기의 원문(이 탭에서만 정본) — 다음 쓰기가 성공하면 지운다. */
const unsaved = new Map<string, string>();

/** 원문 읽기 — 서버 · 저장소 접근 실패면 null(= 기본). */
function readRaw(key: string): string | null {
  if (typeof window === 'undefined') return null;
  const mem = unsaved.get(key);
  if (mem !== undefined) return mem;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** 원문 쓰기 — 실패는 조용히 삼키고 메모리에 남긴다 · 끝에 구독자 알림. */
function writeRaw(key: string, raw: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, raw);
    unsaved.delete(key);
  } catch {
    /* 저장 불가(사생활 모드 · 용량 초과) — 이 탭 화면만 고른 값을 따른다 */
    unsaved.set(key, raw);
  }
  for (const cb of listeners) cb();
}

export function readChartKind(): ChartKindPref {
  return parseChartKind(readRaw(TICK_CHART_KIND_KEY));
}

export function writeChartKind(kind: ChartKindPref): void {
  writeRaw(TICK_CHART_KIND_KEY, kind);
}

export function readCandleUnit(): CandleUnitPref {
  return parseCandleUnit(readRaw(TICK_CANDLE_UNIT_KEY));
}

/** 문자열로 저장 — `'auto'` · `'5'`. */
export function writeCandleUnit(unit: CandleUnitPref): void {
  writeRaw(TICK_CANDLE_UNIT_KEY, String(unit));
}

let lastMaRaw: string | null | undefined;
let lastMaVal: MaConfig = DEFAULT_MA_CONFIG;

/** 이동평균 구성 — 원문이 같으면 같은 객체(Pitfall 9). */
export function readMaConfig(): MaConfig {
  const raw = readRaw(TICK_CANDLE_MA_KEY);
  if (raw === lastMaRaw) return lastMaVal;
  lastMaRaw = raw;
  lastMaVal = raw === null ? DEFAULT_MA_CONFIG : parseMaConfig(raw);
  return lastMaVal;
}

/** 이동평균 구성 저장 — 필요한 다섯 키만(`{ v: 1, lines: [{ base, n, kind, on, color }] }`). */
export function writeMaConfig(cfg: MaConfig): void {
  const lines = cfg.lines.map(({ base, n, kind, on, color }) => ({ base, n, kind, on, color }));
  writeRaw(TICK_CANDLE_MA_KEY, JSON.stringify({ v: 1, lines }));
}

/** 세 키 공용 변경 구독 — 해제 함수를 돌려준다(`useSyncExternalStore` 규약). */
export function subscribeCandlePrefs(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
