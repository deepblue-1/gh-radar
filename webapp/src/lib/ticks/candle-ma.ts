/**
 * 봉 차트 이동평균 (Phase 42 D-10 · D-11 · SC-3 · UI-SPEC S5 · Researcher Decisions 3 · 4 · 9).
 *
 * ① 정의식
 *   - 봉 단순 N = 그 봉 포함 앞 N 봉 종가 평균 · 그날 N 번째 봉부터(그 전은 값 없음 = NaN).
 *   - 봉 지수 N = 계수 α = 2 ÷ (N + 1) · 첫 값 = 처음 N 봉 단순 평균(N 번째 봉) · 이후 α·종가 + (1 − α)·앞 값.
 *   - 일 N = (보는 날짜 **앞** N − 1 거래일 종가 합 + 그 봉 종가) ÷ N(D-11) · 앞 거래일 종가가 N − 1 개 미만이면 선 전체 NaN.
 *   - **봉은 그날 것만 센다**(전날 봉 없음) — 그날 봉이 N 개에 못 미치면 봉 기준 선은 그리지 않는다.
 * ② 일 기준은 **단순만** — D-11 정의식 자체가 단순 평균이다(일 + 지수는 틀린 선 · `isValidMaSpec` 이 거부).
 * ③ 경로: 점 x = 봉 칸 가운데(`t0 + 단위 ÷ 2`). 이웃 봉 시작 간격이 30분 이상이고 한 단위보다 길면(사이에 빈 칸)
 *   끊는다 · 값 없음(NaN)에서도 끊는다 · 그보다 짧은 빈 분은 잇는다(15:30 ~ 16:00 같은 장 쉬는 구간을 잇지 않게).
 * ④ 색은 `var(--ma-{n})`(n = 1 ~ 6 · `globals.css`) — 이 파일은 번호만 다룬다(배정은 `candle-prefs.ts`).
 * ⑤ 순수 함수만 — 컴포넌트는 그리기만 하고 값은 여기서 테스트가 잠근다(`tick-chart.ts` ④ 와 같음).
 */

/** 이동평균 기준 — 봉(그날 그 단위 봉 종가) | 일(앞 거래일 종가 + 그 봉 종가). */
export type MaBase = 'bar' | 'day';
/** 이동평균 종류 — 단순 | 지수(일 기준은 단순만). */
export type MaKind = 'sma' | 'ema';
/** 선 하나의 정의. */
export interface MaSpec {
  base: MaBase;
  n: number;
  kind: MaKind;
}

/** 기간 하한 · 상한(봉 · 일 같음 — Researcher Decision 4). */
export const MA_N_MIN = 2;
export const MA_N_MAX = 240;
/** 선 최대 개수(켜짐 + 꺼짐 합 · D-10). */
export const MA_MAX_LINES = 6;
/** 앞 거래일 종가를 받는 개수 = 최대 기간 240 − 1(Q2 — 칩을 더해도 다시 받지 않게 늘 한 번에). */
export const PREV_CLOSES_N = 239;
/** 이웃 봉 사이 빈 칸이 이 이상이면 선을 끊는다(Researcher Decision 9). */
export const MA_GAP_BREAK_MS = 30 * 60_000;

/** 앞 거래일 종가 상태 — 배열(오름차순 · 받음) | 안 받음 | 받는 중 | 실패 | 종목 코드 없음. */
export type PrevClosesState = readonly number[] | 'idle' | 'loading' | 'error' | 'nocode';
/** 선을 그릴 수 있는지 — 캡션 줄(UI-SPEC S9)이 이유 문구를 고른다. */
export type MaStatus = 'ok' | 'short-bars' | 'short-days' | 'loading' | 'error';

/** 컴포넌트에 넘기는 켜진 선 하나(값 = 봉마다 · NaN = 값 없음). */
export interface CandleMaValue {
  key: string;
  name: string;
  /** 색 번호 1 ~ 6 → `var(--ma-{color})`. */
  color: number;
  values: Float64Array;
}

/** 선 고유 키 — 같은 기준 · 종류 · 기간이면 같은 선. */
export function maKeyOf(spec: MaSpec): string {
  return `${spec.base}:${spec.kind}:${spec.n}`;
}

/** 칩 · 판 제목 · 값 띠 이름 — 「단순 5」 · 「지수 20」 · 「일 20」. */
export function maNameOf(spec: MaSpec): string {
  if (spec.base === 'day') return `일 ${spec.n}`;
  return spec.kind === 'ema' ? `지수 ${spec.n}` : `단순 ${spec.n}`;
}

/** 정의 검사 — 알려진 기준 · 종류 · 정수 기간 2 ~ 240 · 일 + 지수 거부. */
export function isValidMaSpec(spec: unknown): spec is MaSpec {
  if (spec === null || typeof spec !== 'object') return false;
  const { base, n, kind } = spec as Record<string, unknown>;
  if (base !== 'bar' && base !== 'day') return false;
  if (kind !== 'sma' && kind !== 'ema') return false;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < MA_N_MIN || n > MA_N_MAX) return false;
  if (base === 'day' && kind === 'ema') return false;
  return true;
}

/** 봉 단순 — 누적합 O(n) · i < N − 1 은 NaN. */
export function smaOf(c: Float64Array, n: number): Float64Array {
  const out = new Float64Array(c.length).fill(Number.NaN);
  if (n < 1) return out;
  let s = 0;
  for (let i = 0; i < c.length; i++) {
    s += c[i]!;
    if (i >= n) s -= c[i - n]!;
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
}

/** 봉 지수 — α = 2 ÷ (N + 1) · 첫 값 = 처음 N 봉 단순 평균 · 봉 수 < N 이면 전부 NaN. */
export function emaOf(c: Float64Array, n: number): Float64Array {
  const out = new Float64Array(c.length).fill(Number.NaN);
  if (n < 1 || c.length < n) return out;
  const a = 2 / (n + 1);
  let s = 0;
  for (let i = 0; i < n; i++) s += c[i]!;
  let e = s / n;
  out[n - 1] = e;
  for (let i = n; i < c.length; i++) out[i] = e = a * c[i]! + (1 - a) * e;
  return out;
}

/** 일 단순 — `prevCloses` = 보는 날짜 앞 거래일 종가 오름차순 · 마지막 N − 1 개 합 + 그 봉 종가 ÷ N. */
export function daySmaOf(c: Float64Array, prevCloses: readonly number[], n: number): Float64Array {
  const out = new Float64Array(c.length).fill(Number.NaN);
  if (n < 1 || prevCloses.length < n - 1) return out; // 상장 직후 · 자료 부족 = 그리지 않음
  let s = 0;
  for (let k = prevCloses.length - (n - 1); k < prevCloses.length; k++) s += prevCloses[k]!;
  for (let i = 0; i < c.length; i++) out[i] = (s + c[i]!) / n;
  return out;
}

/** 선 하나의 봉별 값 — 일 기준은 종가 배열이 있을 때만(받는 중 · 실패 · 코드 없음 = 전부 NaN). */
export function maValuesOf(spec: MaSpec, closes: Float64Array, prev: PrevClosesState): Float64Array {
  if (spec.base === 'day') {
    if (typeof prev === 'string') return new Float64Array(closes.length).fill(Number.NaN);
    return daySmaOf(closes, prev, spec.n);
  }
  return spec.kind === 'ema' ? emaOf(closes, spec.n) : smaOf(closes, spec.n);
}

/**
 * 선을 그릴 수 있는지.
 * - 봉 기준: 그날 그 단위 봉 수 < 기간 → `short-bars`.
 * - 일 기준: 안 받음 · 받는 중 → `loading`(선 없음 · 캡션 없음 — UI-SPEC E6 플래너 가정) · 실패 → `error` ·
 *   코드 없음(종목 마스터 없음) → `short-days`(「종가가 모자라」 와 같은 안내 — Q5) · 종가 < N − 1 → `short-days`.
 */
export function maStatusOf(spec: MaSpec, nBars: number, prev: PrevClosesState): MaStatus {
  if (spec.base === 'bar') return nBars < spec.n ? 'short-bars' : 'ok';
  if (prev === 'idle' || prev === 'loading') return 'loading';
  if (prev === 'error') return 'error';
  if (prev === 'nocode') return 'short-days';
  return prev.length < spec.n - 1 ? 'short-days' : 'ok';
}

const f1 = (v: number) => v.toFixed(1);

/**
 * 이동평균 경로 — 점 x = 봉 칸 가운데 · NaN 이나 「간격 ≥ 30분 이고 > 한 단위」 면 새 하위 경로(M).
 * 자르기(봉 영역 클립)는 컴포넌트가 한다.
 */
export function maPathOf(
  t0: Float64Array,
  unitMs: number,
  v: Float64Array,
  x: (t: number) => number,
  y: (v: number) => number,
): string {
  let d = '';
  let open = false;
  const n = Math.min(t0.length, v.length);
  for (let i = 0; i < n; i++) {
    const val = v[i]!;
    if (!Number.isFinite(val)) {
      open = false;
      continue;
    }
    if (open && i > 0) {
      const gap = t0[i]! - t0[i - 1]!;
      if (gap >= MA_GAP_BREAK_MS && gap > unitMs) open = false;
    }
    d += `${open ? 'L' : 'M'}${f1(x(t0[i]! + unitMs / 2))},${f1(y(val))}`;
    open = true;
  }
  return d;
}
