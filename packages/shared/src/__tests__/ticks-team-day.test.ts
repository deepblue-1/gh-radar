/**
 * quick 261103-j4d (결정 1) 팀 하루 요약 — 해제된 격자 바이트 하나 → 「팀 거래정보」 끝 틱 KPI(팀 체결 수 · 당일 순매수 ·
 * 13키 손익 · 마지막 체결가). 웹 상세 패널(teamKpiAt 끝 틱)과 목록(tick_grids 저장값)이 이 함수 한 벌로 같은 숫자를 낸다 —
 * 웹 쪽 4개 픽스처 일치는 webapp team-model.test 가 잠근다.
 *
 * 깨지면: 목록 「당일순매수 · 당일손익」 이 상세 끝 틱 값과 달라지거나, 천일 10/14 손익이 export payload.pnl 과 어긋난다.
 */
import { describe, it, expect } from "vitest";
import { teamDaySummaryOf } from "../ticks/team-day";
import type { TeamPnl } from "../ticks/team-pnl";
import { readTickJson, readTicksZst } from "./helpers/tick-digest";

const PNL_KEYS = [
  "buy_val", "buy_qty", "sell_val", "sell_qty", "realized_val", "realized_qty", "unrealized_val", "total_val", "ret",
  "end_qty", "end_cost_val", "unknown_sell_qty", "unknown_sell_val",
] as const;

describe("teamDaySummaryOf — 천일고속 10/14 KRX = export payload.pnl(accum) 13키", () => {
  const golden = readTickJson<{ accum: TeamPnl; last_px: { accum: number } }>("chunil-1014.pnl.json");
  const s = teamDaySummaryOf(readTicksZst("chunil-1014-a3.ticks.zst"), "KRX");

  it("13키 · 끝 잔량 3,406 · 합계 31,782,350 · lastPx = 골든 last_px", () => {
    expect(s.fills).toBeGreaterThan(0);
    expect(s.pnl).not.toBeNull();
    expect(Object.keys(s.pnl!)).toEqual([...PNL_KEYS]);
    const { ret: gr, ...gi } = s.pnl!;
    const { ret: wr, ...wi } = golden.accum;
    expect(gi).toEqual(wi);
    expect(gr).toBeCloseTo(wr!, 15);
    expect(s.pnl!.total_val).toBe(31_782_350);
    expect(s.pnl!.end_qty).toBe(3406);
    expect(s.lastPx).toBe(golden.last_px.accum);
  });

  it("당일 순매수 = 매수 − 매도(금액 · 수량)", () => {
    expect(s.dayNetVal).toBe(golden.accum.buy_val - golden.accum.sell_val);
    expect(s.dayNetQty).toBe(golden.accum.buy_qty - golden.accum.sell_qty);
  });
});

describe("teamDaySummaryOf — 컷 13시 NXT(런 규칙 팀만)", () => {
  it("팀 체결이 있고 손익이 나온다", () => {
    const s = teamDaySummaryOf(readTicksZst("cut1300-nxt.ticks.zst"), "NXT");
    expect(s.fills).toBeGreaterThan(0);
    expect(s.pnl).not.toBeNull();
    expect(s.lastPx).not.toBeNull();
    expect(s.dayNetVal).toBe(s.pnl!.buy_val - s.pnl!.sell_val);
  });

  it("같은 바이트를 KRX 규칙으로 보면 팀 체결이 없다(NXT 전문은 KRX 범위에 안 든다 — 합산 안 함)", () => {
    const s = teamDaySummaryOf(readTicksZst("cut1300-nxt.ticks.zst"), "KRX");
    expect(s.fills).toBe(0);
    expect(s.pnl).toBeNull();
  });
});

describe("teamDaySummaryOf — 빈 입력", () => {
  const EMPTY = { fills: 0, dayNetVal: 0, dayNetQty: 0, pnl: null, lastPx: null };
  it("빈 버퍼 → 0 · null", () => {
    expect(teamDaySummaryOf(new Uint8Array(0), "KRX")).toEqual(EMPTY);
    expect(teamDaySummaryOf(new Uint8Array(0), "NXT")).toEqual(EMPTY);
  });
});
