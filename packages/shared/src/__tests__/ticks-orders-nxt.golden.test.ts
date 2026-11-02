/**
 * Phase 37 (D-13 · D-20) NXT 런 판정 골든 — 원본 바이트(컷 13시 KRX · NXT) → 디코더 → NxtRow(A3 · B6, G1) → tagNxtRuns
 * → nxtRunStats · nxtSummaryOf · classifyNxtTeamOrders 가 gh-trade `nxt_runs` · `nxt_fixture` 오라클과 런 · 원 단위로 같은지 본다.
 *
 * 픽스처(생성 `bash scripts/tick-oracle/gen-fixtures.sh runs`):
 *   cut1300-runs.json       — {columns, krx: {summary, runs}, nxt: {summary, runs}} · run 번호는 파이썬 1부터
 *   cut1300-nxt.window.json — NXT 단독 창 13:30:00~13:40:00 팀 주문(AccumNxtFixtures.h kAccumNxt_Expect 와 같은 값)
 */
import { describe, it, expect } from "vitest";
import { iterRecords } from "../ticks/framing";
import { decodeAny } from "../ticks/decode";
import {
  classifyNxtTeamOrders,
  nxtRowOf,
  nxtRunStats,
  nxtSummaryOf,
  tagNxtRuns,
  type NxtRow,
} from "../ticks/orders-nxt";
import { readTicksZst, readTickJson } from "./helpers/tick-digest";

interface RunsSide {
  summary: {
    line: string;
    isins: number;
    a3: number;
    b6: number;
    runs_ge2: number;
    smp: number;
    closing_ok: number;
    runs: number;
    inverted: number;
    inverted_of: number;
    all_late: number;
  };
  runs: (number | string)[][];
}
interface RunsGolden {
  columns: string[];
  krx: RunsSide;
  nxt: RunsSide;
}
interface WindowGolden {
  source: { lo_us: number; hi_us: number };
  summary: { team_orders: number; buy_qty: number; buy_krw: number; sell_qty: number; sell_krw: number };
  orders: [string, number, string, number, number, number, number, number, number, number, number][];
}

const KST_OFFSET_NS = 9n * 3600n * 1_000_000_000n;
const DAY_NS = 86400n * 1_000_000_000n;
/** epoch ns → 당일(KST) µs — nxt_fixture.day_us 와 같은 식. */
function dayUs(tNs: bigint): number {
  return Number(((tNs + KST_OFFSET_NS) % DAY_NS) / 1000n);
}

function nxtRowsOf(fixture: string, label: string): NxtRow[] {
  const bytes = readTicksZst(fixture);
  const out: NxtRow[] = [];
  let rec = 0;
  for (const r of iterRecords(bytes)) {
    const { table, row } = decodeAny(bytes.subarray(r.off, r.off + r.len), r.recvNs, label);
    const x = nxtRowOf(rec, table, row);
    if (x) out.push(x);
    rec += 1;
  }
  return out;
}

const golden = readTickJson<RunsGolden>("cut1300-runs.json");

describe.each([
  ["nxt", "cut1300-nxt.ticks.zst"],
  ["krx", "cut1300-krx.ticks.zst"],
] as const)("NXT 런 규칙 골든 — 컷 13시 %s", (label, fixture) => {
  const want = golden[label];
  const tagged = tagNxtRuns(nxtRowsOf(fixture, label));
  const stats = nxtRunStats(tagged);
  const summary = nxtSummaryOf(label, tagged, stats);

  it(`요약 숫자 = 오라클 summary_line(${label})`, () => {
    const w = want.summary;
    expect(summary).toEqual({
      label,
      isins: w.isins,
      a3: w.a3,
      b6: w.b6,
      runsGe2: w.runs_ge2,
      smp: w.smp,
      closingOk: w.closing_ok,
      runs: w.runs,
      inverted: w.inverted,
      invertedOf: w.inverted_of,
      allLate: w.all_late,
    });
  });

  it("요약 줄 원문이 RESEARCH 골든 3 과 같다", () => {
    const line =
      label === "nxt"
        ? "A3=3219 B6=8255 runs>=2=179 smp=65 closing_b6_ok=2833/2833 inverted=90/179 all_late=38"
        : "A3=3089 B6=8901 runs>=2=182 smp=70 closing_b6_ok=2687/2687 inverted=84/182 all_late=1";
    expect(want.summary.line).toContain(line);
  });

  it("런마다 n · bs · nbs · npx · maxsame · multi_px · zz · seq 양끝 · last_px · 닫는 B6 · 늦은 조각 · all_late 가 같다", () => {
    expect(golden.columns).toEqual([
      "run", "n", "bs", "nbs", "npx", "maxsame", "multi_px", "zz", "first_seq", "last_seq", "last_px",
      "closing_b6_ok", "late_pieces", "all_late",
    ]);
    const got = stats.map((s) => [
      s.run + 1, s.n, s.bs, s.nbs, s.npx, s.maxSame, s.multiPx, s.zz, s.firstSeq, s.lastSeq, s.lastPx,
      s.closingB6Ok ? 1 : 0, s.latePieces, s.allLate ? 1 : 0,
    ]);
    expect(got).toEqual(want.runs);
  });
});

describe("NXT 단독 창 13:30~13:40 팀 주문 — AccumNxtFixtures.h kAccumNxt_Expect", () => {
  const w = readTickJson<WindowGolden>("cut1300-nxt.window.json");
  const tagged = tagNxtRuns(nxtRowsOf("cut1300-nxt.ticks.zst", "nxt"));
  const inWin = classifyNxtTeamOrders(tagged).filter((o) => {
    if (o.tNs === null) return false;
    const us = dayUs(o.tNs);
    return us >= w.source.lo_us && us <= w.source.hi_us;
  });

  it("팀 주문 13 · 매수 7,901주/82,023,350원 · 매도 4,632주/49,348,980원", () => {
    expect(w.summary).toEqual({ team_orders: 13, buy_qty: 7901, buy_krw: 82023350, sell_qty: 4632, sell_krw: 49348980 });
    const buy = inWin.filter((o) => o.side === "2");
    const sell = inWin.filter((o) => o.side === "1");
    expect({
      team_orders: inWin.length,
      buy_qty: buy.reduce((s, o) => s + o.qty, 0),
      buy_krw: buy.reduce((s, o) => s + o.krw, 0),
      sell_qty: sell.reduce((s, o) => s + o.qty, 0),
      sell_krw: sell.reduce((s, o) => s + o.krw, 0),
    }).toEqual(w.summary);
  });

  it("주문마다 시각 · 방향 · 수량 · 금액 · 가격 · 모양 · seq 가 오라클과 같다", () => {
    const got = inWin.map((o) => [
      String(o.tNs), dayUs(o.tNs!), o.side, o.qty, o.krw, o.px, o.maxSame, o.pieces, o.nPx, o.firstSeq, o.lastSeq,
    ]);
    expect(got).toEqual(w.orders);
  });
});

// ---------------------------------------------------------------------------
// 합성 — 런 정의 경계(D-01 · D-02 · D-04 · D-05)
// ---------------------------------------------------------------------------

let recN = 0;
function a(seq: number, bs: string, px: number, qty: number, recv: bigint, zz = false): NxtRow {
  return {
    rec: recN++, k: "A", seq, board: "G1", isin: "KR7000000001", recvNs: recv, bs, px, qty,
    tNs: 1_700_000_000_000_000_000n + BigInt(seq) * 1000n, a1: zz ? 0 : px + 10, b1: zz ? 0 : px - 10,
  };
}
function b(seq: number, recv: bigint): NxtRow {
  return { rec: recN++, k: "B", seq, board: "G1", isin: "KR7000000001", recvNs: recv };
}

describe("NXT 런 합성 케이스", () => {
  it("단일가 bs 런은 한 가격 여러 조각이어도 팀이 아니다(D-05)", () => {
    const t = tagNxtRuns([a(1, "0", 100, 5, 1n), a(2, "0", 100, 5, 2n), a(3, "0", 100, 5, 3n), b(4, 4n)]);
    const s = nxtRunStats(t);
    expect(s.length).toBe(1);
    expect(s[0]!.maxSame).toBe(3);
    expect(classifyNxtTeamOrders(t)).toEqual([]);
  });

  it("한 가격 1조각씩인 스윕 런은 팀이 아니다 — NXT 에 0/0 유형 없음(D-04)", () => {
    const t = tagNxtRuns([a(1, "2", 100, 1, 1n, true), a(2, "2", 101, 1, 2n, true), a(3, "2", 102, 1, 3n, true), b(4, 4n)]);
    expect(nxtRunStats(t)[0]!.npx).toBe(3);
    expect(classifyNxtTeamOrders(t)).toEqual([]);
  });

  it("한 가격 2조각 이상(SMP) 연속매매 런은 팀 — 값 = 조각 합 · 시각 · 가격 = 마지막 조각", () => {
    const rows = [a(1, "2", 100, 3, 1n), a(2, "2", 100, 4, 2n), a(3, "2", 101, 5, 3n), b(4, 4n)];
    const t = tagNxtRuns(rows);
    const o = classifyNxtTeamOrders(t);
    expect(o.length).toBe(1);
    expect(o[0]).toMatchObject({ side: "2", qty: 12, krw: 300 + 400 + 505, px: 101, maxSame: 2, pieces: 3, nPx: 2, firstSeq: 1, lastSeq: 3 });
    expect(o[0]!.tNs).toBe(rows[2]!.tNs);
    expect(o[0]!.recs).toEqual([rows[0]!.rec, rows[1]!.rec, rows[2]!.rec]);
  });

  it("직전 A3(B6 건너뜀)와 seq+1 ∧ 같은 bs 일 때만 같은 런 — 사이에 B6 가 있으면 seq 가 끊겨 새 런", () => {
    const t = tagNxtRuns([a(10, "2", 100, 1, 1n), b(11, 2n), a(12, "2", 100, 1, 3n), a(13, "1", 100, 1, 4n)]);
    const s = nxtRunStats(t);
    expect(s.map((x) => [x.firstSeq, x.lastSeq, x.bs])).toEqual([[10, 10, "2"], [12, 12, "2"], [13, 13, "1"]]);
    expect(s.map((x) => x.closingB6Ok)).toEqual([true, false, false]);
    expect(Array.from(t.runOf)).toEqual([0, -1, 1, 2]);
  });

  it("닫는 B6 가 먼저 도착하면 늦은 조각으로 센다 — 입력이 수신순이어도 seq 순으로 묶는다", () => {
    // 수신 순서: A3 20 → B6 22 → A3 21 (B6 선착)
    const rows = [a(20, "1", 100, 1, 100n), b(22, 200n), a(21, "1", 100, 1, 300n)];
    const t = tagNxtRuns(rows);
    const s = nxtRunStats(t);
    expect(s.length).toBe(1);
    expect(s[0]).toMatchObject({ n: 2, closingB6Ok: true, closingB6RecvNs: 200n, latePieces: 1, allLate: false });
    const sum = nxtSummaryOf("syn", t, s);
    expect(sum).toMatchObject({ a3: 2, b6: 1, runsGe2: 1, smp: 1, inverted: 1, invertedOf: 1, allLate: 0 });
  });

  it("G1 이 아닌 보드는 버린다", () => {
    const t = tagNxtRuns([{ ...a(1, "2", 100, 1, 1n), board: "G2" }, a(2, "2", 100, 1, 2n)]);
    expect(t.sorted.length).toBe(1);
  });
});
