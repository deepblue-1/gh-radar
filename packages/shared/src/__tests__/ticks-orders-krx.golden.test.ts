/**
 * Phase 37 (D-20) KRX 주문 묶기 · 팀 판정 골든 — 원본 바이트(컷 13시 KRX) → 디코더 → A3Trade → scopeTrades('teamflow')
 * → classifyKrxOrders 가 gh-trade `teamflow.prepare_frame`(classify_orders) 와 주문마다 같은지 본다.
 *
 * 픽스처 `cut1300-krx.orders.json` = 오라클 `orders` 부명령 출력(생성 `bash scripts/tick-oracle/gen-fixtures.sh orders`):
 *   에코앤드림 KR7101360006 10/16 13시 컷 · KRX G1 · msg_seq 순 · rows = [msg_seq, oid, kind, team(0/1)].
 */
import { describe, it, expect } from "vitest";
import { classifyKrxOrders, scopeTrades, ORDER_KIND, type A3Trade } from "../ticks/orders-krx";
import { readA3Trades, readTickJson } from "./helpers/tick-digest";

interface OrdersGolden {
  summary: { orders: number; kinds: Record<string, number>; team_orders: number; base: number; upper: number; rows: number };
  rows: [number, number, string, number][];
}

function rowsOf(trades: readonly A3Trade[]): [number, number, string, number][] {
  const { orders, oidOf } = classifyKrxOrders(trades);
  return trades.map((t, i) => {
    const o = orders[oidOf[i]!]!;
    return [t.seq, o.oid, o.kind, o.team ? 1 : 0];
  });
}

/** 결정적 셔플(LCG) — 테스트가 매번 같은 순열을 쓴다. */
function shuffled<T>(xs: readonly T[], seed = 12345): T[] {
  const a = [...xs];
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

describe("KRX classifyKrxOrders 골든 — 컷 13시(teamflow 범위)", () => {
  const golden = readTickJson<OrdersGolden>("cut1300-krx.orders.json");
  const all = readA3Trades("cut1300-krx.ticks.zst", "krx");
  const scoped = scopeTrades(all, "teamflow");
  const { orders } = classifyKrxOrders(scoped);

  it("오라클 요약 — 주문 2,687 · 종류 분포 · 팀 126", () => {
    expect(golden.summary.orders).toBe(2687);
    expect(golden.summary.team_orders).toBe(126);
    expect(golden.summary.kinds).toEqual({ 일반: 2561, 자전거래방지: 70, "0/0 단독": 55, "0/0 스윕 끝": 1 });
    expect(scoped.length).toBe(golden.summary.rows);
    expect(orders.length).toBe(golden.summary.orders);
    expect(orders.filter((o) => o.team).length).toBe(golden.summary.team_orders);
    const kinds: Record<string, number> = {};
    for (const o of orders) kinds[o.kind] = (kinds[o.kind] ?? 0) + 1;
    expect(kinds).toEqual(golden.summary.kinds);
  });

  it("조각마다 [msg_seq, oid, kind, team] 이 오라클과 같다", () => {
    expect(rowsOf(scoped)).toEqual(golden.rows);
  });

  it("주문 집계 — 조각 수 · 수량 · 금액 · seq 양끝이 조각 합과 맞는다", () => {
    let pieces = 0;
    for (const o of orders) {
      const ps = scoped.slice(o.first, o.last + 1);
      pieces += ps.length;
      expect(o.pieces).toBe(ps.length);
      expect(o.qty).toBe(ps.reduce((s, t) => s + t.qty, 0));
      expect(o.val).toBe(ps.reduce((s, t) => s + t.qty * t.px, 0));
      expect(o.firstSeq).toBe(ps[0]!.seq);
      expect(o.lastSeq).toBe(ps[ps.length - 1]!.seq);
    }
    expect(pieces).toBe(scoped.length);
  });

  it("입력 순서와 무관 — 셔플한 입력도 scopeTrades 를 거치면 같은 행이 나온다", () => {
    const again = scopeTrades(shuffled(all), "teamflow");
    expect(rowsOf(again)).toEqual(golden.rows);
  });

  it("teamflow 범위는 KRX G1 만 — 다른 보드 · NXT 행을 버린다", () => {
    const base = scoped[0]!;
    const extra: A3Trade[] = [
      { ...base, rec: -1, board: "G4", seq: 47 },
      { ...base, rec: -2, exchange: "NXT", seq: base.seq + 1 },
    ];
    const s = scopeTrades([...all, ...extra], "teamflow");
    expect(s.length).toBe(scoped.length);
    expect(s.some((t) => t.rec < 0)).toBe(false);
  });

  it("종류 문자열은 teamflow.py KIND_* 와 같다", () => {
    expect(Object.values(ORDER_KIND)).toEqual(["단일가", "자전거래방지", "0/0 단독", "0/0 스윕 끝", "일반"]);
  });
});
