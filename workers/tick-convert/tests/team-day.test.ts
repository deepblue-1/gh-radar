/**
 * quick 261103-j4d 결정 4 — 격자 팀 값(gridTeamOf). 천일 10/14 실제 격자 → 상세 「팀 거래정보」 끝 틱 값(31,782,350) ·
 * 팀 체결 0 → {0, null, null} · 계산 throw · 이상값 → 셋 다 null + 에러 로그(throw 하지 않음).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { teamDaySummaryOf } from "@gh-radar/shared";
import { logger } from "../src/logger";
import { NO_TEAM, gridTeamOf } from "../src/team-day";

const FIXTURES = path.resolve(__dirname, "../../../packages/shared/src/__fixtures__/ticks");

/** shared 골든 픽스처(.ticks.zst 한 프레임) → 해제 바이트. */
function fixtureRaw(name: string): Uint8Array {
  const b = zlib.zstdDecompressSync(readFileSync(path.join(FIXTURES, name)));
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
}

const CTX = { date: "20261014", isin: "KR7000650002", mode: "nightly" };

afterEach(() => vi.restoreAllMocks());

describe("gridTeamOf — 격자 팀 3칸", () => {
  it("천일 10/14 KRX — team_fills = 요약 fills · net = dayNetVal · pnl = 31,782,350", () => {
    const raw = fixtureRaw("chunil-1014-a3.ticks.zst");
    const s = teamDaySummaryOf(raw, "KRX");
    const { team, ok } = gridTeamOf(raw, "KRX", CTX);
    expect(ok).toBe(true);
    expect(team).toEqual({ team_fills: s.fills, team_day_net_krw: s.dayNetVal, team_day_pnl_krw: 31_782_350 });
    expect(team.team_fills).toBeGreaterThan(0);
  });

  it("컷 NXT — NXT 팀 값이 나온다", () => {
    const { team, ok } = gridTeamOf(fixtureRaw("cut1300-nxt.ticks.zst"), "NXT", { ...CTX, date: "20261016" });
    expect(ok).toBe(true);
    expect(team.team_fills).toBeGreaterThan(0);
    expect(Number.isSafeInteger(team.team_day_net_krw)).toBe(true);
    expect(Number.isSafeInteger(team.team_day_pnl_krw)).toBe(true);
  });

  it("팀 체결 0(빈 격자 · NXT 바이트를 KRX 범위로) → {0, null, null}", () => {
    expect(gridTeamOf(new Uint8Array(0), "KRX", CTX)).toMatchObject({
      ok: true,
      team: { team_fills: 0, team_day_net_krw: null, team_day_pnl_krw: null },
    });
    expect(gridTeamOf(fixtureRaw("cut1300-nxt.ticks.zst"), "KRX", CTX).team).toEqual({
      team_fills: 0,
      team_day_net_krw: null,
      team_day_pnl_krw: null,
    });
  });

  it("계산 throw → 셋 다 null + logger.error(date · ex · isin · mode · err) · throw 하지 않음", () => {
    const spy = vi.spyOn(logger, "error").mockImplementation(() => undefined as never);
    const boom = new Error("boom");
    const r = gridTeamOf(new Uint8Array(4), "NXT", CTX, () => {
      throw boom;
    });
    expect(r.ok).toBe(false);
    expect(r.team).toEqual(NO_TEAM);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toMatchObject({ date: CTX.date, isin: CTX.isin, mode: "nightly", ex: "NXT", err: boom });
  });

  it("정수 아닌 값(NaN · 소수 · pnl null) → 셋 다 null + 에러 로그", () => {
    const spy = vi.spyOn(logger, "error").mockImplementation(() => undefined as never);
    const base = { fills: 3, dayNetVal: 100, dayNetQty: 1, lastPx: 1000 };
    const pnl = (total: number) => ({
      buy_val: 0, buy_qty: 0, sell_val: 0, sell_qty: 0, realized_val: 0, realized_qty: 0, unrealized_val: 0,
      total_val: total, ret: null, end_qty: 0, end_cost_val: 0, unknown_sell_qty: 0, unknown_sell_val: 0,
    });
    expect(gridTeamOf(new Uint8Array(0), "KRX", CTX, () => ({ ...base, dayNetVal: Number.NaN, pnl: pnl(1) })).team).toEqual(NO_TEAM);
    expect(gridTeamOf(new Uint8Array(0), "KRX", CTX, () => ({ ...base, pnl: pnl(1.5) })).team).toEqual(NO_TEAM);
    expect(gridTeamOf(new Uint8Array(0), "KRX", CTX, () => ({ ...base, pnl: null })).team).toEqual(NO_TEAM);
    expect(spy).toHaveBeenCalledTimes(3);
    // 정상 정수는 그대로
    expect(gridTeamOf(new Uint8Array(0), "KRX", CTX, () => ({ ...base, pnl: pnl(-7) })).team).toEqual({
      team_fills: 3,
      team_day_net_krw: 100,
      team_day_pnl_krw: -7,
    });
  });
});
