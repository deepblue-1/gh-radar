/**
 * Phase 38 (D-15 · SC-2) 우리 체결 ↔ A3 짝짓기 오라클 — 10/30 다섯 종목.
 *
 * 픽스처(생성 `node scripts/tick-oracle/gen-own-fixtures.mjs` · README `own1030` 행):
 *   own1030-{krx|nxt}-{ISIN}.ticks.zst  창만 남긴 격자 5개(생성기가 원본 격자와 짝짓기 결과가 같음을 확인했다)
 *   own1030.journal.json                체결 406 · 이벤트 124 · (gw_time_ms, gateway, seq) 정렬 · 계좌 익명 ACC1…
 *
 * 수치 출처 = ROADMAP Phase 38 · 38-RESEARCH Pattern 1 (a) 표(이전 세션 probe 출력 원문). 규칙(창 −200~+1500ms · 추정 =
 * 첫째 · 둘째 후보 |dt| 차 < 20ms · 남은 수량 차감 · 동률 = 작은 j)을 이 숫자에 맞추려고 바꾸지 않는다 — 다르면 멈추고 보고.
 * 단언은 probe 그대로 전 A3 ∧ ok(중복 수신 포함)다(RESEARCH Open Q4). 「중복 제외 시」 수치는 console.info 한 줄로만 찍는다.
 * dt p50 / p95 도 정의가 probe 원문에 없어 찍기만 한다.
 *
 * SC-3 절(38-05) — 조건 근거 · 앵커(RESEARCH Pattern 1 (b) · own-trigger probe 출력 원문): 호가 근거 29/29 · 체결 단건 2 ·
 * 주기매도 구간 9 · 근거 없음 2 · 앵커 100/100. 규칙은 own-fills.ts 「조건 근거 · 앵커」 머리 주석 — 수치에 맞추려고 바꾸지 않는다.
 */
import { describe, expect, it } from "vitest";
import {
  anchorOf,
  cumIndexOf,
  locateEvidence,
  matchOwnFills,
  type OwnEvidence,
  type OwnFillMatch,
} from "../ticks/own-fills";
import { TAG_CODE, a3ColumnsOf, buildTickIndex, recvOrderOf, type A3Columns, type TickIndex } from "../ticks/record-index";
import { readTickJson, readTicksZst } from "./helpers/tick-digest";

interface JournalFill {
  key: string;
  gateway: string;
  seq: number;
  gw_time_ms: number;
  account_no: string;
  order_no: string;
  side: string;
  exchange: string;
  isin: string;
  exec_price: number;
  exec_qty: number;
}

interface Journal {
  source: { fills: number; events: number; keys: string[] };
  fills: JournalFill[];
  events: JournalEvent[];
}

interface JournalEvent {
  key: string;
  gw_time_ms: number;
  kind: number;
  reason_code: string;
  cum_volume: number;
  ev_kind: number;
  ev_price: number;
  ev_qty_before: number;
  ev_qty_after: number;
  ev_trade_qty: number;
}

/** 키 · 라벨 · ISIN · 체결 · 같은수량 · 큰 전문의 일부 · 못찾음 · 추정(RESEARCH Pattern 1 (a) 표). */
const TABLE: [string, "krx" | "nxt", string, number, number, number, number, number][] = [
  ["KRX_KR7184230001", "krx", "KR7184230001", 227, 153, 72, 2, 71],
  ["KRX_KR7011080009", "krx", "KR7011080009", 58, 25, 33, 0, 12],
  ["KRX_KR7051630002", "krx", "KR7051630002", 43, 20, 22, 1, 3],
  ["KRX_KR7092190008", "krx", "KR7092190008", 35, 13, 20, 2, 12],
  ["NXT_KR7046890000", "nxt", "KR7046890000", 43, 25, 18, 0, 10],
];

const journal = readTickJson<Journal>("own1030.journal.json");

interface KeyRun {
  index: TickIndex;
  a3: A3Columns;
  fills: JournalFill[];
  m: OwnFillMatch[];
}

interface Tally {
  fills: number;
  same: number;
  part: number;
  miss: number;
  est: number;
}

function runKey(key: string, label: "krx" | "nxt", isin: string, qty?: (a3: A3Columns, index: TickIndex) => Float64Array): KeyRun {
  const buf = readTicksZst(`own1030-${label}-${isin}.ticks.zst`);
  const index = buildTickIndex(buf, label);
  const base = a3ColumnsOf(buf, index);
  const a3 = qty ? { ...base, qty: qty(base, index) } : base;
  const fills = journal.fills.filter((f) => f.key === key); // 파일 순서 그대로
  const m = matchOwnFills(
    index,
    a3,
    fills.map((f) => ({ gwMs: f.gw_time_ms, px: f.exec_price, qty: f.exec_qty })),
  );
  return { index, a3, fills, m };
}

function tallyOf(r: KeyRun): Tally {
  const t: Tally = { fills: r.fills.length, same: 0, part: 0, miss: 0, est: 0 };
  r.m.forEach((m, i) => {
    if (m.a3j < 0) t.miss += 1;
    else if (r.a3.qty[m.a3j] === r.fills[i]!.exec_qty) t.same += 1;
    else t.part += 1;
    if (m.est) t.est += 1;
  });
  return t;
}

/** 37 `duplicatesOf` 와 같은 규칙 — 파일 순서로 훑어 같은 (board, seq) 의 둘째 이후 A3 는 중복. 중복 행 qty 만 0 인 사본. */
function qtyWithoutDuplicates(a3: A3Columns): Float64Array {
  const seen = new Set<number>();
  const qty = Float64Array.from(a3.qty);
  for (let j = 0; j < a3.n; j++) {
    const k = a3.board[j]! * 1e9 + a3.seq[j]!;
    if (seen.has(k)) qty[j] = 0;
    else seen.add(k);
  }
  return qty;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

describe("우리 체결 ↔ A3 짝짓기 오라클 10/30 (SC-2)", () => {
  const runs = new Map(TABLE.map(([key, label, isin]) => [key, runKey(key, label, isin)]));

  it("저널 = 체결 406 · 이벤트 124 · 계좌 익명", () => {
    expect(journal.fills.length).toBe(406);
    expect(journal.events.length).toBe(124);
    expect(journal.source.keys).toEqual(TABLE.map((r) => r[0]));
    for (const f of journal.fills) expect(f.account_no).toMatch(/^ACC\d+$/);
  });

  it.each(TABLE)("%s(%s · %s) — 체결 %i · 같은수량 %i · 일부 %i · 못찾음 %i · 추정 %i", (key, _l, _i, fills, same, part, miss, est) => {
    const r = runs.get(key)!;
    const t = tallyOf(r);
    expect(t).toEqual({ fills, same, part, miss, est });
    const dts = r.m.filter((m) => m.a3j >= 0).map((m) => m.dtMs).sort((x, y) => x - y);
    console.info(
      `[own-oracle] ${key} dt p50 ${quantile(dts, 0.5).toFixed(1)} · p95 ${quantile(dts, 0.95).toFixed(1)} · max ${dts[dts.length - 1]!.toFixed(1)} ms`,
    );
  });

  it("합 — 406 · 같은수량 236 · 일부 165 · 못찾음 5 · 추정 108 · 짝 401/406 ≥ 98%", () => {
    const sum: Tally = { fills: 0, same: 0, part: 0, miss: 0, est: 0 };
    for (const r of runs.values()) {
      const t = tallyOf(r);
      sum.fills += t.fills;
      sum.same += t.same;
      sum.part += t.part;
      sum.miss += t.miss;
      sum.est += t.est;
    }
    expect(sum).toEqual({ fills: 406, same: 236, part: 165, miss: 5, est: 108 });
    const matched = sum.same + sum.part;
    expect(matched).toBe(401);
    expect(matched / sum.fills).toBeGreaterThanOrEqual(0.98);
  });

  it("못찾음 5건 = {S 2490×193 · S 2510×246 · B 3150×11 · S 10210×151 · B 9110×4}", () => {
    const missed: string[] = [];
    for (const r of runs.values()) {
      r.m.forEach((m, i) => {
        if (m.a3j >= 0) return;
        const f = r.fills[i]!;
        missed.push(`${f.side} ${f.exec_price}x${f.exec_qty}`);
      });
    }
    expect(missed.sort()).toEqual(["B 3150x11", "B 9110x4", "S 10210x151", "S 2490x193", "S 2510x246"].sort());
  });

  it("(참고 · 단언 아님) 중복 수신 A3 제외 시 합 — RESEARCH Open Q4", () => {
    const sum = { dup: 0, same: 0, part: 0, miss: 0, est: 0 };
    for (const [key, label, isin] of TABLE) {
      const r = runKey(key, label, isin, (a3) => qtyWithoutDuplicates(a3));
      for (let j = 0; j < r.a3.n; j++) if (r.a3.qty[j] === 0 && runs.get(key)!.a3.qty[j] !== 0) sum.dup += 1;
      // 같은수량 · 일부 판정은 원래 A3 수량으로(중복 행 qty 0 사본은 후보에서만 빠진다)
      const t = tallyOf({ ...r, a3: runs.get(key)!.a3 });
      sum.same += t.same;
      sum.part += t.part;
      sum.miss += t.miss;
      sum.est += t.est;
    }
    console.info(
      `[own-oracle] 중복 제외 시 — 중복 A3 ${sum.dup} · 같은수량 ${sum.same} · 일부 ${sum.part} · 못찾음 ${sum.miss} · 추정 ${sum.est} (짝 ${sum.same + sum.part}/406)`,
    );
    expect(sum.same + sum.part + sum.miss).toBe(406);
  });
});

interface EvidenceRun {
  index: TickIndex;
  a3: A3Columns;
  cumIdx: Map<number, number[]>;
  events: JournalEvent[];
  ev: OwnEvidence[];
}

/** 키마다 픽스처 → recvOrderOf · a3ColumnsOf · cumIndexOf(세션당 한 번) → 그 키 이벤트 전부 locateEvidence. */
function evidenceOf(key: string, label: "krx" | "nxt", isin: string): EvidenceRun {
  const buf = readTicksZst(`own1030-${label}-${isin}.ticks.zst`);
  const index = buildTickIndex(buf, label);
  const recvOrder = recvOrderOf(index);
  const a3 = a3ColumnsOf(buf, index);
  const cumIdx = cumIndexOf(a3);
  const events = journal.events.filter((e) => e.key === key);
  const ev = events.map((e) =>
    locateEvidence(buf, index, recvOrder, a3, cumIdx, {
      gwMs: e.gw_time_ms,
      evKind: e.ev_kind,
      evPrice: e.ev_price,
      evQtyBefore: e.ev_qty_before,
      evQtyAfter: e.ev_qty_after,
      evTradeQty: e.ev_trade_qty,
    }),
  );
  return { index, a3, cumIdx, events, ev };
}

describe("조건 근거 · 앵커 오라클 10/30 (SC-3)", () => {
  const runs = TABLE.map(([key, label, isin]) => evidenceOf(key, label, isin));

  it("호가 근거(ev_kind 1) — B6 29/29", () => {
    let total = 0;
    let found = 0;
    const lags: number[] = [];
    for (const r of runs) {
      r.events.forEach((e, i) => {
        if (e.ev_kind !== 1) return;
        total += 1;
        const v = r.ev[i]!;
        if (v.kind !== "b6") return;
        found += 1;
        expect(r.index.tag[v.rec]).toBe(TAG_CODE.B6);
        lags.push(e.gw_time_ms - Number(r.index.recvNs[v.rec]! / 1000n) / 1000);
      });
    }
    expect(total).toBe(29);
    expect(found).toBe(29);
    lags.sort((x, y) => x - y);
    console.info(
      `[own-oracle] 호가 근거 gw − 수신 p50 ${quantile(lags, 0.5).toFixed(1)} · p95 ${quantile(lags, 0.95).toFixed(1)} · min ${lags[0]!.toFixed(1)} · max ${lags[lags.length - 1]!.toFixed(1)} ms`,
    );
  });

  it("분포(ev_kind × 결과) — 1 = b6 29 · 2 = a3 2 · range 9 · none 2 · 0 = none 82", () => {
    const dist: Record<string, number> = {};
    for (const r of runs) {
      r.events.forEach((e, i) => {
        const k = `${e.ev_kind}:${r.ev[i]!.kind}`;
        dist[k] = (dist[k] ?? 0) + 1;
      });
    }
    console.info(`[own-oracle] 근거 분포 ${JSON.stringify(dist)}`);
    expect(dist).toEqual({ "1:b6": 29, "2:a3": 2, "2:range": 9, "2:none": 2, "0:none": 82 });
  });

  it("체결 근거 — 단건 2(cum · 수량 · 가격 일치 A3) · 구간 9(각 n ≥ 1 · (before, after]) · 없음 2(before = after = 0)", () => {
    let single = 0;
    let range = 0;
    let none = 0;
    for (const r of runs) {
      r.events.forEach((e, i) => {
        if (e.ev_kind !== 2) return;
        const v = r.ev[i]!;
        if (v.kind === "a3") {
          single += 1;
          expect(r.a3.cumVolume[v.j]).toBe(e.ev_qty_after);
          expect(r.a3.qty[v.j]).toBe(e.ev_trade_qty);
          expect(r.a3.px[v.j]).toBe(e.ev_price);
        } else if (v.kind === "range") {
          range += 1;
          expect(v.n).toBeGreaterThanOrEqual(1);
          expect(v.firstJ).toBeLessThanOrEqual(v.lastJ);
          for (const j of [v.firstJ, v.lastJ]) {
            expect(r.a3.cumVolume[j]).toBeGreaterThan(e.ev_qty_before);
            expect(r.a3.cumVolume[j]).toBeLessThanOrEqual(e.ev_qty_after);
          }
        } else if (v.kind === "none") {
          none += 1;
          expect([e.ev_qty_before, e.ev_qty_after]).toEqual([0, 0]);
        }
      });
    }
    expect({ single, range, none }).toEqual({ single: 2, range: 9, none: 2 });
  });

  it("앵커 — cum_volume > 0 이벤트 100/100 이 같은 누적거래량 A3(마지막 일치)를 가진다", () => {
    let total = 0;
    let found = 0;
    const lags: number[] = [];
    for (const r of runs) {
      for (const e of r.events) {
        if (!(e.cum_volume > 0)) {
          expect(anchorOf(r.cumIdx, e.cum_volume)).toBe(-1);
          continue;
        }
        total += 1;
        const j = anchorOf(r.cumIdx, e.cum_volume);
        if (j < 0) continue;
        found += 1;
        expect(r.a3.cumVolume[j]).toBe(e.cum_volume);
        const list = r.cumIdx.get(e.cum_volume)!;
        expect(j).toBe(list[list.length - 1]);
        lags.push(e.gw_time_ms - Number(r.index.recvNs[r.a3.rec[j]!]! / 1000n) / 1000);
      }
    }
    expect(total).toBe(100);
    expect(found).toBe(100);
    lags.sort((x, y) => x - y);
    console.info(
      `[own-oracle] 앵커 gw − 수신 p50 ${quantile(lags, 0.5).toFixed(1)} · p95 ${quantile(lags, 0.95).toFixed(1)} · max ${lags[lags.length - 1]!.toFixed(1)} ms`,
    );
  });
});

describe("웹 경로 — 중복 거르기 skip 을 넘겨도 오라클 그대로(WR-03 · 10/30 픽스처 중복 0)", () => {
  /** `qtyWithoutDuplicates` 와 같은 규칙의 rec → 1 배열(웹 세션 `duplicates` 모양). */
  function skipOf(index: TickIndex, a3: A3Columns): Uint8Array {
    const out = new Uint8Array(index.n);
    const seen = new Set<number>();
    for (let j = 0; j < a3.n; j++) {
      const k = a3.board[j]! * 1e9 + a3.seq[j]!;
      if (seen.has(k)) out[a3.rec[j]!] = 1;
      else seen.add(k);
    }
    return out;
  }

  it.each(TABLE)("%s — 짝 · 근거 · 앵커가 skip 없을 때와 같다", (key, label, isin) => {
    const buf = readTicksZst(`own1030-${label}-${isin}.ticks.zst`);
    const index = buildTickIndex(buf, label);
    const recvOrder = recvOrderOf(index);
    const a3 = a3ColumnsOf(buf, index);
    const skip = skipOf(index, a3);
    expect(skip.reduce((n, v) => n + v, 0)).toBe(0);
    const ins = journal.fills
      .filter((f) => f.key === key)
      .map((f) => ({ gwMs: f.gw_time_ms, px: f.exec_price, qty: f.exec_qty }));
    expect(matchOwnFills(index, a3, ins, skip)).toEqual(matchOwnFills(index, a3, ins));
    const plain = cumIndexOf(a3);
    const skipped = cumIndexOf(a3, skip);
    expect(skipped).toEqual(plain);
    for (const e of journal.events.filter((x) => x.key === key)) {
      const ev = {
        gwMs: e.gw_time_ms,
        evKind: e.ev_kind,
        evPrice: e.ev_price,
        evQtyBefore: e.ev_qty_before,
        evQtyAfter: e.ev_qty_after,
        evTradeQty: e.ev_trade_qty,
      };
      expect(locateEvidence(buf, index, recvOrder, a3, skipped, ev, skip)).toEqual(
        locateEvidence(buf, index, recvOrder, a3, plain, ev),
      );
      expect(anchorOf(skipped, e.cum_volume)).toBe(anchorOf(plain, e.cum_volume));
    }
  });
});
