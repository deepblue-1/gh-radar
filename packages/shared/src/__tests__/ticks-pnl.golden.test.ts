/**
 * Phase 37 (D-10 · D-12 · D-20) 팀 평균단가법 손익 골든 — 원본 바이트 → 디코더 → A3Trade → scopeTrades(범위)
 * → classifyKrxOrders → teamFillsOf → teamPnlOf 가 gh-trade `teamflow.team_pnl` · export `payload.pnl` 과 13키 같은지 본다.
 *
 * 픽스처(생성 `bash scripts/tick-oracle/gen-fixtures.sh pnl` · `g4cut` · README):
 *   chunil-1014-a3.ticks.zst · chunil-1014.pnl.json   천일고속 KR7000650002 10/14 — 그 ISIN A3 만 08~15시 · export 두 범위 원문
 *   bigtech-1022-g4.ticks.zst · bigtech-1022-g4.golden.json  빅텍 KR7065450009 10/22 15~17시 — G1 꼬리 + G4 체결(accum 범위 골든)
 *   (선택) bigtech-1022-a3.ticks.zst · bigtech-1022.pnl.json  빅텍 10/22 하루 — 있을 때만
 * 우리(KB · 교보 DMA) 체결을 빼지 않는다 — A3 만으로 계산하므로 export payload.pnl 과 같은 정의다(D-12).
 */
import { existsSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { classifyKrxOrders, scopeTrades, type A3Trade, type TeamScope } from "../ticks/orders-krx";
import {
  buildPnlPrefix,
  fillsUpTo,
  pnlAt,
  roundHalfEven,
  teamFillsOf,
  teamPnlOf,
  type TeamFill,
  type TeamPnl,
} from "../ticks/team-pnl";
import { readA3Trades, readTickJson, tickFixturePath } from "./helpers/tick-digest";

const PNL_KEYS = [
  "buy_val", "buy_qty", "sell_val", "sell_qty", "realized_val", "realized_qty", "unrealized_val", "total_val", "ret",
  "end_qty", "end_cost_val", "unknown_sell_qty", "unknown_sell_val",
] as const;

/** 13키 비교 — ret 만 부동소수(15자리), 나머지는 정수 그대로. */
function expectPnl(got: TeamPnl | null, want: TeamPnl | null): void {
  if (want === null) {
    expect(got).toBeNull();
    return;
  }
  expect(got).not.toBeNull();
  expect(Object.keys(got!)).toEqual([...PNL_KEYS]);
  const { ret: gr, ...gi } = got!;
  const { ret: wr, ...wi } = want;
  expect(gi).toEqual(wi);
  if (wr === null) expect(gr).toBeNull();
  else expect(gr).toBeCloseTo(wr, 15);
}

/** 범위 → (범위 입력, 주문, 팀 체결, last_px). last_px = 범위 입력 마지막 행 px(teamflow.py:259-277 · teamflow_accum.py:479). */
function pipeline(all: readonly A3Trade[], scope: TeamScope) {
  const scoped = scopeTrades(all, scope);
  const { orders, oidOf } = classifyKrxOrders(scoped);
  const fills = teamFillsOf(scoped, (i) => orders[oidOf[i]!]!.team);
  const lastPx = scoped[scoped.length - 1]!.px;
  return { scoped, orders, oidOf, fills, lastPx, pnl: teamPnlOf(fills, lastPx) };
}

// ---------------------------------------------------------------------------
// 합성 · 단위
// ---------------------------------------------------------------------------

describe("roundHalfEven — 파이썬 round(은행가 반올림)", () => {
  it.each([
    [2.5, 2], [3.5, 4], [-2.5, -2], [0.5, 0], [1.4999, 1], [1.5, 2], [-0.5, 0], [-1.5, -2], [2.5000001, 3], [-3.7, -4], [7, 7],
  ])("roundHalfEven(%d) = %d", (x, want) => {
    expect(roundHalfEven(x)).toBe(want);
    expect(Object.is(roundHalfEven(x), -0)).toBe(false);
  });
});

const T0 = 1_760_000_000_000_000_000n;
function fill(rec: number, t: number | null, bs: "1" | "2", px: number, qty: number): TeamFill {
  return { rec, tNs: t === null ? null : T0 + BigInt(t), bs, px, qty };
}

describe("teamPnlOf · 접두 배열", () => {
  const fills: TeamFill[] = [
    fill(0, 10, "2", 1000, 10),
    fill(1, 20, "2", 1010, 5),
    fill(2, 30, "1", 1020, 8),
    fill(3, 40, "1", 1030, 9), // 잔량 7 → 2 초과분은 원가 미상
    fill(4, 50, "2", 1005, 3),
    fill(5, 60, "1", 1001, 1),
  ];

  it("팀 체결이 없으면 null", () => {
    expect(teamPnlOf([], 1000)).toBeNull();
    expect(pnlAt(buildPnlPrefix([]), 0, 1000)).toEqual({ pnl: null, avgPx: null });
  });

  it("평균단가법 — 매도는 잔량만큼만 실현, 초과분은 원가 미상", () => {
    const p = teamPnlOf(fills, 1004)!;
    // 매수 10@1000 + 5@1010 → 평단 1003.333…, 매도 8@1020 실현 133.33…, 매도 9 중 7 실현(1030-1003.33)*7=186.66… · 2주 미상
    expect(p.buy_qty).toBe(18);
    expect(p.buy_val).toBe(10000 + 5050 + 3015);
    expect(p.sell_qty).toBe(18);
    expect(p.unknown_sell_qty).toBe(2);
    expect(p.unknown_sell_val).toBe(2060);
    expect(p.realized_qty).toBe(16);
    expect(p.end_qty).toBe(2);
    expect(p.end_cost_val).toBe(2010);
    expect(p.realized_val).toBe(roundHalfEven(8 * (1020 - 15050 / 15) + 7 * (1030 - 15050 / 15) + (1001 - 1005)));
    expect(p.unrealized_val).toBe(2 * 1004 - 2010);
    expect(p.total_val).toBe(p.realized_val + p.unrealized_val);
    expect(p.ret).toBe(p.total_val / p.buy_val);
  });

  it("마지막 접두값 = 전체 teamPnlOf · 임의 k 의 pnlAt = 앞 k 체결로 다시 계산한 값", () => {
    const prefix = buildPnlPrefix(fills);
    expect(prefix.n).toBe(fills.length);
    expect(prefix.hold.length).toBe(fills.length + 1);
    for (const px of [990, 1004, 1100]) {
      expect(pnlAt(prefix, fills.length, px).pnl).toEqual(teamPnlOf(fills, px));
      for (let k = 0; k <= fills.length; k++) {
        expect(pnlAt(prefix, k, px).pnl).toEqual(teamPnlOf(fills.slice(0, k), px));
      }
    }
    expect(pnlAt(prefix, 2, 1000).avgPx).toBeCloseTo(15050 / 15, 12);
    expect(pnlAt(prefix, 4, 1000).avgPx).toBeNull(); // 잔량 0
  });

  it("fillsUpTo — 시각 T 이하 팀 체결 수(이진 탐색)", () => {
    const prefix = buildPnlPrefix(fills);
    expect(fillsUpTo(prefix, T0 + 5n)).toBe(0);
    expect(fillsUpTo(prefix, T0 + 10n)).toBe(1);
    expect(fillsUpTo(prefix, T0 + 35n)).toBe(3);
    expect(fillsUpTo(prefix, T0 + 1000n)).toBe(6);
  });
});

function trade(rec: number, seq: number, board: string, bs: string, px: number, t: bigint | null, zz = false): A3Trade {
  return { rec, seq, board, bs, px, qty: 10, a1: zz ? 0 : px + 5, b1: zz ? 0 : px - 5, tNs: t, isin: "KR7065450009", exchange: "KRX" };
}

describe("teamFillsOf — 팀 ∧ 연속매매 · 체결 시각 안정 정렬", () => {
  it("같은 tNs 의 매수 · 매도는 입력 순서 유지 · null 시각은 맨 뒤", () => {
    const tr = [
      trade(0, 1, "G1", "2", 100, T0 + 5n),
      trade(1, 2, "G1", "1", 101, T0 + 5n),
      trade(2, 3, "G1", "2", 102, null),
      trade(3, 4, "G1", "0", 103, T0 + 1n), // 단일가 bs — 팀이어도 손익 대상 아님
      trade(4, 5, "G1", "2", 104, T0 + 1n),
    ];
    const f = teamFillsOf(tr, () => true);
    expect(f.map((x) => x.rec)).toEqual([4, 0, 1, 2]);
    expect(teamFillsOf(tr, (i) => i !== 4).map((x) => x.rec)).toEqual([0, 1, 2]);
  });
});

describe("범위 차 합성 — G1 seq 1..5(09:00~09:01) + G4 seq 47..49(16:10)", () => {
  const t9 = (s: number) => T0 + BigInt(s) * 1_000_000_000n;
  const g1 = [1, 2, 3, 4, 5].map((s, i) => trade(i, s, "G1", "2", 100, t9(i * 12)));
  const g4 = [47, 48, 49].map((s, i) => trade(10 + i, s, "G4", "2", 100, t9(7 * 3600 + 600 + i)));
  const all = [...g4, ...g1]; // 입력 순서가 어긋나도 범위 정렬이 바로잡는다

  it("teamflow 는 G4 를 빼고 accum 은 넣는다", () => {
    expect(scopeTrades(all, "teamflow").map((t) => t.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(scopeTrades(all, "accum").map((t) => t.seq)).toEqual([1, 2, 3, 4, 5, 47, 48, 49]);
  });

  it("accum 의 G4 첫 조각은 seq 불연속이라 새 주문", () => {
    const s = scopeTrades(all, "accum");
    const { orders, oidOf } = classifyKrxOrders(s);
    expect(orders.map((o) => [o.firstSeq, o.lastSeq, o.kind])).toEqual([[1, 5, "자전거래방지"], [47, 49, "자전거래방지"]]);
    expect(oidOf[5]).not.toBe(oidOf[4]);
  });

  it("손익 — teamflow 매수 5조각 · accum 매수 8조각", () => {
    const tf = pipeline(all, "teamflow").pnl!;
    const ac = pipeline(all, "accum").pnl!;
    expect(tf.buy_qty).toBe(50);
    expect(ac.buy_qty).toBe(80);
    expect(ac.buy_val).toBeGreaterThan(tf.buy_val);
  });
});

// ---------------------------------------------------------------------------
// 골든
// ---------------------------------------------------------------------------

interface ChunilGolden {
  teamflow: TeamPnl;
  accum: TeamPnl;
  base: number;
  upper: number;
  last_px: { teamflow: number; accum: number };
}

describe("천일고속 KR7000650002 10/14 — export payload.pnl 13키(두 범위)", () => {
  const g = readTickJson<ChunilGolden>("chunil-1014.pnl.json");
  const all = readA3Trades("chunil-1014-a3.ticks.zst", "krx");

  it("export 원문이 RESEARCH 골든 1 과 같다(옛 §5-1 예시 3,401주 아님)", () => {
    expect(g.teamflow).toMatchObject({
      buy_val: 2700694800, buy_qty: 12573, sell_val: 2763228250, sell_qty: 12790, realized_val: 28621939, realized_qty: 9167,
      unrealized_val: 3160411, total_val: 31782350, end_qty: 3406, end_cost_val: 759783589, unknown_sell_qty: 3623,
      unknown_sell_val: 793695100,
    });
    expect(g.teamflow.ret).toBeCloseTo(0.011768212387419711, 15);
  });

  it.each(["teamflow", "accum"] as const)("%s 범위 teamPnlOf = export payload.pnl", (scope) => {
    const r = pipeline(all, scope);
    expect(r.lastPx).toBe(g.last_px[scope]);
    expectPnl(r.pnl, g[scope]);
    // 접두 배열의 마지막 = 전체
    expect(pnlAt(buildPnlPrefix(r.fills), r.fills.length, r.lastPx).pnl).toEqual(r.pnl);
  });
});

interface G4Golden {
  source: { g4_trades: number; hours: string[] };
  accum: { summary: { orders: number; team_orders: number; rows: number; last_px: number }; rows: [number, number, string, number][] };
  teamflow: { summary: { orders: number; team_orders: number; rows: number; last_px: number }; rows: [number, number, string, number][] };
  pnl_accum: TeamPnl | null;
  pnl_teamflow: TeamPnl | null;
}

describe("빅텍 KR7065450009 10/22 15~17시 G4 조각 — accum 범위 커밋 골든", () => {
  const g = readTickJson<G4Golden>("bigtech-1022-g4.golden.json");
  const all = readA3Trades("bigtech-1022-g4.ticks.zst", "krx");
  const ac = pipeline(all, "accum");
  const tf = pipeline(all, "teamflow");

  it("범위 안 G4 체결이 1건 이상(없으면 골든이 아니다)", () => {
    expect(g.source.g4_trades).toBeGreaterThan(0);
    expect(ac.scoped.filter((t) => t.board === "G4").length).toBe(g.source.g4_trades);
  });

  it.each([
    ["accum", () => ac],
    ["teamflow", () => tf],
  ] as const)("%s 범위 — 행마다 [seq, oid, kind, team] 이 오라클과 같다", (scope, get) => {
    const r = get();
    const want = g[scope];
    expect(r.scoped.length).toBe(want.summary.rows);
    expect(r.orders.length).toBe(want.summary.orders);
    expect(r.orders.filter((o) => o.team).length).toBe(want.summary.team_orders);
    expect(r.lastPx).toBe(want.summary.last_px);
    const rows = r.scoped.map((t, i) => {
      const o = r.orders[r.oidOf[i]!]!;
      return [t.seq, o.oid, o.kind, o.team ? 1 : 0];
    });
    expect(rows).toEqual(want.rows);
  });

  it("G1 → G4 경계에서 새 주문이 시작된다(seq 불연속)", () => {
    let boundaries = 0;
    for (let i = 1; i < ac.scoped.length; i++) {
      if (ac.scoped[i - 1]!.board === "G1" && ac.scoped[i]!.board === "G4") {
        boundaries += 1;
        expect(ac.oidOf[i]).not.toBe(ac.oidOf[i - 1]);
      }
    }
    expect(boundaries).toBeGreaterThan(0);
  });

  it("teamPnlOf(accum) · teamPnlOf(teamflow) = 파이썬 team_pnl 13키 · 두 범위 buy_val 이 다르다", () => {
    expectPnl(ac.pnl, g.pnl_accum);
    expectPnl(tf.pnl, g.pnl_teamflow);
    expect(ac.pnl!.buy_val).not.toBe(tf.pnl!.buy_val);
  });
});

const BIGTECH_DAY = existsSync(tickFixturePath("bigtech-1022.pnl.json"));
describe.skipIf(!BIGTECH_DAY)("빅텍 10/22 하루 — 두 범위 export payload.pnl(선택 픽스처)", () => {
  it.each(["teamflow", "accum"] as const)("%s 범위", (scope) => {
    const g = readTickJson<ChunilGolden>("bigtech-1022.pnl.json");
    const r = pipeline(readA3Trades("bigtech-1022-a3.ticks.zst", "krx"), scope);
    expectPnl(r.pnl, g[scope]);
  });
});
