import { describe, it, expect, vi, beforeEach } from "vitest";
import pino from "pino";
import type { AxiosInstance } from "axios";
import type { SupabaseClient } from "@supabase/supabase-js";

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockFetchKa10027 = vi.fn();
vi.mock("../src/kiwoom/fetchRanking", () => ({
  fetchKa10027: (...a: any[]) => mockFetchKa10027(...a),
}));

const mockUpsertClose = vi.fn();
vi.mock("../src/pipeline/upsertClose", () => ({
  intradayUpsertClose: (...a: any[]) => mockUpsertClose(...a),
}));

import { runEodClosePass } from "../src/pipeline/eodClose";

const log = pino({ level: "silent" });

function row(code: string, price: string) {
  return {
    stk_cd: code,
    stk_nm: `종목${code}`,
    cur_prc: price,
    pred_pre: "+500",
    flu_rt: "+0.71",
    now_trde_qty: "10000",
  };
}

function deps() {
  return {
    supabase: {} as unknown as SupabaseClient,
    kiwoom: {} as unknown as AxiosInstance,
    accessToken: "TOK",
    dateIso: "2026-08-20",
    hardCap: 5000,
    log,
  };
}

describe("runEodClosePass", () => {
  beforeEach(() => {
    mockFetchKa10027.mockReset();
    mockUpsertClose.mockReset();
    mockUpsertClose.mockResolvedValue({ count: 0 });
  });

  it("sort_tp 1/3 을 각각 stex_tp='1'(KRX 전용) 로 2회 호출", async () => {
    mockFetchKa10027.mockResolvedValue([]);
    await runEodClosePass(deps());

    expect(mockFetchKa10027).toHaveBeenCalledTimes(2);
    // 시그니처: (client, token, sortTp, hardCap, stexTp)
    expect(mockFetchKa10027.mock.calls[0][2]).toBe("1");
    expect(mockFetchKa10027.mock.calls[0][4]).toBe("1");
    expect(mockFetchKa10027.mock.calls[1][2]).toBe("3");
    expect(mockFetchKa10027.mock.calls[1][4]).toBe("1");
  });

  it("병합 결과를 code 기준 dedupe 후 intradayUpsertClose 만 호출", async () => {
    mockFetchKa10027
      .mockResolvedValueOnce([row("005930", "+70500"), row("000660", "+1500000")])
      .mockResolvedValueOnce([row("005930", "+70500"), row("009150", "-1000")]);
    mockUpsertClose.mockResolvedValue({ count: 3 });

    const out = await runEodClosePass(deps());

    expect(mockUpsertClose).toHaveBeenCalledTimes(1);
    const updates = mockUpsertClose.mock.calls[0][1] as Array<{
      code: string;
      date: string;
      price: number;
    }>;
    expect(updates.map((u) => u.code).sort()).toEqual(["000660", "005930", "009150"]);
    expect(updates.every((u) => u.date === "2026-08-20")).toBe(true);
    expect(updates.find((u) => u.code === "000660")?.price).toBe(1500000);
    expect(out.count).toBe(3);
  });

  it("매핑 실패 row 는 skip 하고 나머지는 계속 처리", async () => {
    mockFetchKa10027
      .mockResolvedValueOnce([row("005930", "+70500"), row("BAD_CODE", "+100")])
      .mockResolvedValueOnce([]);
    mockUpsertClose.mockResolvedValue({ count: 1 });

    await runEodClosePass(deps());

    const updates = mockUpsertClose.mock.calls[0][1] as Array<{ code: string }>;
    expect(updates.map((u) => u.code)).toEqual(["005930"]);
  });

  it("병합 0 row → warn + { count: 0 }, intradayUpsertClose 미호출", async () => {
    mockFetchKa10027.mockResolvedValue([]);
    const out = await runEodClosePass(deps());

    expect(out).toEqual({ count: 0 });
    expect(mockUpsertClose).not.toHaveBeenCalled();
  });
});
