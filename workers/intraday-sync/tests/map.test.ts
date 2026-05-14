import { describe, it, expect } from "vitest";
import { ka10027RowToCloseUpdate } from "../src/pipeline/map";

describe("ka10027RowToCloseUpdate", () => {
  it("정상 row + tradeAmount = volume × price 근사값", () => {
    const row = {
      stk_cd: "007460_AL",
      stk_nm: "에이프로젠",
      cur_prc: "+6760",
      pred_pre: "+100",
      flu_rt: "+1.50",
      now_trde_qty: "1234567",
    };
    const result = ka10027RowToCloseUpdate(row, "2026-05-14");
    expect(result.code).toBe("007460");
    expect(result.price).toBe(6760);
    expect(result.changeAmount).toBe(100);
    expect(result.changeRate).toBe(1.5);
    expect(result.volume).toBe(1234567);
    expect(result.tradeAmount).toBe(Math.round(1234567 * 6760));
    expect(result.name).toBe("에이프로젠");
  });

  it("음수 변동 (하락 종목)", () => {
    const row = {
      stk_cd: "005930_AL",
      cur_prc: "-274250",
      pred_pre: "-5750",
      flu_rt: "-2.05",
      now_trde_qty: "100000",
    };
    const result = ka10027RowToCloseUpdate(row, "2026-05-14");
    expect(result.price).toBe(274250); // 절댓값
    expect(result.changeAmount).toBe(-5750); // 부호 유지
    expect(result.changeRate).toBe(-2.05);
  });

  it("now_trde_qty 누락 → volume=0, tradeAmount=0", () => {
    const row = { stk_cd: "005930_AL", cur_prc: "+70500" };
    const result = ka10027RowToCloseUpdate(row, "2026-05-14");
    expect(result.volume).toBe(0);
    expect(result.tradeAmount).toBe(0);
  });

  it("stk_cd 가 6자 아니면 throw", () => {
    expect(() =>
      ka10027RowToCloseUpdate({ stk_cd: "12345_AL", cur_prc: "+100" }, "2026-05-14"),
    ).toThrow(/Invalid stk_cd/);
    expect(() =>
      ka10027RowToCloseUpdate({ stk_cd: "ABCDEF_AL", cur_prc: "+100" }, "2026-05-14"),
    ).toThrow(/Invalid stk_cd/);
  });
});
