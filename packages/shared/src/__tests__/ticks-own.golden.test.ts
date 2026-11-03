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
 */
import { describe, expect, it } from "vitest";
import { matchOwnFills, type OwnFillMatch } from "../ticks/own-fills";
import { a3ColumnsOf, buildTickIndex, type A3Columns, type TickIndex } from "../ticks/record-index";
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
  events: { key: string }[];
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
