import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRunDaily = vi.fn();
const mockRunBackfill = vi.fn();
const mockRunRecover = vi.fn();

vi.mock("../src/modes/daily", () => ({
  runDaily: (...a: any[]) => mockRunDaily(...a),
}));
vi.mock("../src/modes/backfill", () => ({
  runBackfill: (...a: any[]) => mockRunBackfill(...a),
}));
vi.mock("../src/modes/recover", () => ({
  runRecover: (...a: any[]) => mockRunRecover(...a),
}));

let currentMode: "daily" | "backfill" | "recover" = "daily";

vi.mock("../src/config", () => ({
  loadConfig: () => ({
    supabaseUrl: "u",
    supabaseServiceRoleKey: "k",
    krxAuthKey: "k",
    krxBaseUrl: "u",
    logLevel: "silent",
    appVersion: "t",
    mode: currentMode,
    minExpectedRows: 1400,
    recoverLookback: 10,
    recoverThreshold: 0.9,
    recoverMaxCalls: 20,
  }),
}));

import { dispatch } from "../src/index";

describe("MODE dispatch", () => {
  beforeEach(() => {
    mockRunDaily.mockReset();
    mockRunBackfill.mockReset();
    mockRunRecover.mockReset();
    mockRunDaily.mockResolvedValue({ basDd: "20260509", count: 2800 });
    mockRunBackfill.mockResolvedValue({
      daysProcessed: 5,
      totalRows: 14000,
      daysFailed: 0,
    });
    mockRunRecover.mockResolvedValue({ datesProcessed: 2, totalRows: 5600 });
  });

  it("MODE=daily → runDaily 호출", async () => {
    currentMode = "daily";
    const out = await dispatch();
    expect(out.mode).toBe("daily");
    expect(mockRunDaily).toHaveBeenCalledTimes(1);
    expect(mockRunBackfill).not.toHaveBeenCalled();
    expect(mockRunRecover).not.toHaveBeenCalled();
  });

  it("MODE=backfill → runBackfill 호출", async () => {
    currentMode = "backfill";
    const out = await dispatch();
    expect(out.mode).toBe("backfill");
    expect(mockRunBackfill).toHaveBeenCalledTimes(1);
    expect(mockRunDaily).not.toHaveBeenCalled();
  });

  it("MODE=recover → runRecover 호출", async () => {
    currentMode = "recover";
    const out = await dispatch();
    expect(out.mode).toBe("recover");
    expect(mockRunRecover).toHaveBeenCalledTimes(1);
    expect(mockRunBackfill).not.toHaveBeenCalled();
  });

  it("dispatch 가 mode 별 결과를 wrap 해서 반환", async () => {
    currentMode = "daily";
    const out = await dispatch();
    expect(out.result).toEqual({ basDd: "20260509", count: 2800 });
  });
});
