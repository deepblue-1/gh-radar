/**
 * 파생 2표 계산(D-17) — 보고서가 요청마다 계산하면 안 되는 값을 적재 때 미리 만든다.
 *
 * 「같은 숫자 원칙」(gh-trade D-16): 정의는 gh-trade 보고서 Python 원문을 그대로 옮긴다 — 밤 보고서 숫자 =
 * gh-trade 보고서 숫자. 골든 대조는 tests/fixtures/make-golden.py(gh-trade venv) → tests/derive.test.ts.
 *   - `kstSecOfDay`          ← `report.py` `_sec`(epoch → 그날 00:00 KST 기준 초, 내림)
 *   - `gridSummaryOf`        ← `_sell_share_after`(+60초 매도) · B 격자 행의 s0 = `_sec(min start)` · q_max = max(q_krw)
 *   - `memberTopShares`      ← `facts.py` `member_top`(겹친 길이 가중) — 곱셈은 float(아래 주의)
 *   - `memberDailyOf`        ← `report.py` `fingerprint_agg` · `_anchor_ns` — 날짜 하루분 기여(sum · cnt).
 *                               지문표(28-10)는 90일 SUM 으로 평균 = sum ÷ cnt 를 낸다.
 *
 * 단위: export 는 `*_ms`, gh-trade 원문은 `*_ns`. 비중은 비율이라 단위가 약분되고 `max(e − s, 1)` 의 1 은 길이 0 구간
 * (그때 겹침도 0)에서만 쓰여 결과가 같다.
 *
 * 창구 가중은 정의(「d_value 를 겹친 길이 ÷ 구간 길이로 가중」)대로 실수 곱셈이다. gh-trade `member_top` 도
 * f483d409 부터 float64 로 곱한다(전에는 int64 라 6e19 급에서 감겼다 — 28-06 발견) — 골든은 보정 없이 gh-trade 함수 그대로.
 */
import type { Row } from "./load";

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000;
/** 진입 1분 · 깨짐 전 1분 창(gh-trade MEMBER_WINDOW_S = 60). */
const MEMBER_WINDOW_MS = 60_000;
/** +60초 매도 비중 창(gh-trade `_sell_share_after` span). */
const SELL_SPAN_S = 60;

type Cell = number | boolean | null;
export type GridCols = Record<string, Cell[]> & { q_krw: (number | null)[]; t_ms: (number | null)[] };
export type GridJson = {
  schema_version: number;
  date: string;
  isin: string;
  label_n?: number;
  coarse: { step_s: number; sec: number[]; cols: GridCols };
  fine: { margin_s: number; windows: { from_sec: number; to_sec: number; sec: number[]; cols: Partial<GridCols> & Record<string, Cell[]> }[] };
};

export type GridSummaryRow = {
  date: string;
  isin: string;
  step_s: number;
  sec0: number;
  q_krw: (number | null)[];
  q_max_krw: number | null;
  q_max_ms: number | null;
  sell_share_60s: number | null;
};

export type MemberDailyRow = {
  date: string;
  member: string;
  name: string | null;
  n: number;
  entry_sum: number;
  entry_cnt: number;
  lock_buy_sum: number;
  lock_buy_cnt: number;
  pre_sell_sum: number;
  pre_sell_cnt: number;
  lead: number;
  n_broke: number;
  n_lock: number;
  n_held: number;
};

/** null · NaN · 숫자가 아닌 값이면 null(gh-trade `_nn` 의 부정). */
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** `pd.to_numeric(errors="coerce").fillna(0)` — 숫자가 아니면 0. */
function num0(v: unknown): number {
  return num(v) ?? 0;
}

/** epoch ms → 그날 00:00 KST 기준 초(내림) — 격자 `sec` 와 같은 축. */
export function kstSecOfDay(ms: number): number {
  return Math.floor(((ms + KST_OFFSET_MS) % DAY_MS) / 1000);
}

/** 잠김 행들의 첫 시작(ms) — start_ms 가 없는 행은 무시, 하나도 없으면 null. */
function firstLockStartMs(locks: Row[]): number | null {
  let lo: number | null = null;
  for (const r of locks) {
    const s = num(r.start_ms);
    if (s !== null && (lo === null || s < lo)) lo = s;
  }
  return lo;
}

/**
 * 종목 격자 요약 한 행. `locks` = 그 종목의 잠김 행(같은 날짜).
 * - `q_krw` = coarse 그대로(null 유지) · `sec0` = coarse 첫 초 · `step_s` = coarse 간격
 * - `q_max_krw`/`q_max_ms` = coarse ∪ fine 의 q_krw 최대와 그 점의 t_ms(동률은 이른 시각)
 * - `sell_share_60s` = s0 = 첫 잠김 시작의 KST 하루 초(내림), fine 점 중 `sec > s0 · sec ≤ s0+60 · (sec−s0) % 10 == 0`
 *   의 sell_led_10s 합 ÷ (sell_led_10s + buy_led_10s) 합 — 합 0 · 잠김 없음 · fine 점 없음이면 null.
 */
export function gridSummaryOf(date: string, grid: GridJson, locks: Row[]): GridSummaryRow {
  if (grid.date !== date) throw new Error(`grid ${grid.isin}: date ${grid.date} != ${date}`);
  const c = grid.coarse;
  if (c.cols.q_krw.length !== c.sec.length) throw new Error(`grid ${grid.isin}: coarse q_krw length != sec length`);

  // fine 점 — 같은 sec 가 창 둘에 있으면 먼저 나온 것(gh-trade 격자는 sec 당 한 행).
  const fine = new Map<number, { sell: unknown; buy: unknown }>();
  let qMax: number | null = null;
  let qMaxMs: number | null = null;
  const consider = (q: unknown, t: unknown) => {
    const qv = num(q);
    if (qv === null) return;
    const tv = num(t);
    if (qMax === null || qv > qMax) {
      qMax = qv;
      qMaxMs = tv;
    } else if (qv === qMax && tv !== null && (qMaxMs === null || tv < qMaxMs)) {
      qMaxMs = tv;
    }
  };
  for (let i = 0; i < c.sec.length; i++) consider(c.cols.q_krw[i], c.cols.t_ms[i]);
  for (const w of grid.fine.windows) {
    for (let i = 0; i < w.sec.length; i++) {
      consider(w.cols.q_krw?.[i], w.cols.t_ms?.[i]);
      if (!fine.has(w.sec[i])) fine.set(w.sec[i], { sell: w.cols.sell_led_10s?.[i], buy: w.cols.buy_led_10s?.[i] });
    }
  }

  let share: number | null = null;
  const firstStart = firstLockStartMs(locks);
  if (firstStart !== null && fine.size > 0) {
    const s0 = kstSecOfDay(firstStart);
    let sell = 0;
    let buy = 0;
    for (let k = 10; k <= SELL_SPAN_S; k += 10) {
      const p = fine.get(s0 + k);
      if (!p) continue;
      sell += num0(p.sell);
      buy += num0(p.buy);
    }
    share = sell + buy > 0 ? sell / (sell + buy) : null;
  }

  return {
    date,
    isin: grid.isin,
    step_s: c.step_s,
    sec0: c.sec[0],
    q_krw: c.cols.q_krw.map((v) => num(v)),
    q_max_krw: qMax,
    q_max_ms: qMaxMs,
    sell_share_60s: share,
  };
}

/**
 * 창 [loMs, hiMs] 의 `side` 배분을 창구별 비중으로 — `d_value × 겹친 길이 ÷ max(end − start, 1)` 를 창구별로 더해
 * 0 이하는 빼고, 비중 = 그 창구 합 ÷ 남은 창구 합. `alloc` 은 한 종목(같은 날짜)의 행.
 */
export function memberTopShares(alloc: Row[], side: string, loMs: number, hiMs: number): Map<string, number> {
  const by = new Map<string, number>();
  for (const r of alloc) {
    if (r.side !== side) continue;
    const s = Number(r.start_ms);
    const e = Number(r.end_ms);
    const ov = Math.max(Math.min(e, hiMs) - Math.max(s, loMs), 0);
    const w = (Number(r.d_value) * ov) / Math.max(e - s, 1);
    const m = String(r.member);
    by.set(m, (by.get(m) ?? 0) + w);
  }
  const out = new Map<string, number>();
  let tot = 0;
  for (const [m, v] of by) if (v > 0) tot += v;
  if (tot <= 0) return out;
  for (const [m, v] of by) if (v > 0) out.set(m, v / tot);
  return out;
}

/** 진입 기준 시각(gh-trade `_anchor_ns`) — first_upper → t{detect_rate_pct} → t25 → t20 → t15 → 첫 잠김 시작. */
function anchorMs(entry: Row | undefined, locks: Row[]): number | null {
  if (entry) {
    const fu = num(entry.first_upper_ms);
    if (fu !== null) return fu;
    const pct = num(entry.detect_rate_pct);
    const cols = [...(pct !== null ? [`t${Math.trunc(pct)}_ms`] : []), "t25_ms", "t20_ms", "t15_ms"];
    for (const col of cols) {
      const v = num(entry[col]);
      if (v !== null) return v;
    }
  }
  return firstLockStartMs(locks);
}

type Acc = { n: number; entry: number[]; lockBuy: number[]; preSell: number[]; lead: number; nBroke: number; nLock: number; nHeld: number };

const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);

/**
 * 창구(회원번호)별 그날 기여분 — gh-trade `fingerprint_agg` 를 날짜 하루로.
 * 관여 사건 = 진입 1분 매수 비중 > 0 인 진입 + 잠김 구간(start · end 둘 다 있을 때만) 안 매수 ∪ 매도 창구.
 * `lock_buy` 는 매도만 한 창구도 0.0 으로 센다 · 깨진 잠김은 깨짐 전 1분 매도 비중(`pre_sell`, 없으면 0.0)을 세고
 * 그 1위(동률은 회원번호 큰 쪽)가 `lead`. 배분 행이 없는 종목은 건너뛴다. 결과는 회원번호 정렬,
 * `name` = 그날 그 창구 배분 행의 마지막 non-null name.
 */
export function memberDailyOf(date: string, entries: Row[], locks: Row[], alloc: Row[]): MemberDailyRow[] {
  const entryOf = new Map<string, Row>();
  for (const r of entries) entryOf.set(String(r.isin), r);
  const locksOf = new Map<string, Row[]>();
  for (const r of locks) {
    const k = String(r.isin);
    (locksOf.get(k) ?? locksOf.set(k, []).get(k)!).push(r);
  }
  const allocOf = new Map<string, Row[]>();
  const names = new Map<string, string>();
  for (const r of alloc) {
    const k = String(r.isin);
    (allocOf.get(k) ?? allocOf.set(k, []).get(k)!).push(r);
    if (typeof r.name === "string") names.set(String(r.member), r.name);
  }

  const agg = new Map<string, Acc>();
  const acc = (m: string): Acc => {
    let x = agg.get(m);
    if (!x) {
      x = { n: 0, entry: [], lockBuy: [], preSell: [], lead: 0, nBroke: 0, nLock: 0, nHeld: 0 };
      agg.set(m, x);
    }
    return x;
  };

  const isins = [...new Set([...entryOf.keys(), ...locksOf.keys()])].sort();
  for (const isin of isins) {
    const al = allocOf.get(isin);
    if (!al || al.length === 0) continue;
    const lk = [...(locksOf.get(isin) ?? [])].sort((a, b) => Number(a.lock_id) - Number(b.lock_id));

    const a = anchorMs(entryOf.get(isin), lk);
    if (a !== null) {
      for (const [m, sh] of memberTopShares(al, "buy", a - MEMBER_WINDOW_MS, a)) {
        const x = acc(m);
        x.n += 1;
        x.entry.push(sh);
      }
    }

    for (const r of lk) {
      const st = num(r.start_ms);
      const en = num(r.end_ms);
      if (st === null || en === null) continue;
      const broke = r.broke === null || r.broke === undefined ? false : Boolean(r.broke);
      const buy = memberTopShares(al, "buy", st, en);
      const duringSell = memberTopShares(al, "sell", st, en);
      const pre = broke ? memberTopShares(al, "sell", en - MEMBER_WINDOW_MS, en) : new Map<string, number>();
      let topPre: string | null = null;
      let topSh = -Infinity;
      for (const [m, sh] of pre) {
        if (sh > topSh || (sh === topSh && topPre !== null && m > topPre)) {
          topPre = m;
          topSh = sh;
        }
      }
      for (const m of new Set([...buy.keys(), ...duringSell.keys()])) {
        const x = acc(m);
        x.n += 1;
        x.nLock += 1;
        x.lockBuy.push(buy.get(m) ?? 0);
        if (broke) {
          x.nBroke += 1;
          x.preSell.push(pre.get(m) ?? 0);
          x.lead += m === topPre ? 1 : 0;
        } else {
          x.nHeld += 1;
        }
      }
    }
  }

  return [...agg.keys()].sort().map((m) => {
    const x = agg.get(m)!;
    return {
      date,
      member: m,
      name: names.get(m) ?? null,
      n: x.n,
      entry_sum: sum(x.entry),
      entry_cnt: x.entry.length,
      lock_buy_sum: sum(x.lockBuy),
      lock_buy_cnt: x.lockBuy.length,
      pre_sell_sum: sum(x.preSell),
      pre_sell_cnt: x.preSell.length,
      lead: x.lead,
      n_broke: x.nBroke,
      n_lock: x.nLock,
      n_held: x.nHeld,
    };
  });
}
