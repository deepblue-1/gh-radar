import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetRateLimiter } from "../../src/kis/rateLimiter.js";
import { fetchInquirePrice } from "../../src/kis/inquirePrice.js";

describe("fetchInquirePrice (server 측 복제본)", () => {
  beforeEach(() => resetRateLimiter());

  it("rt_cd=0 응답 시 output 반환", async () => {
    const client = {
      get: vi.fn().mockResolvedValue({
        data: {
          rt_cd: "0",
          msg_cd: "MCA00000",
          msg1: "OK",
          output: {
            stck_mxpr: "91000",
            stck_llam: "49000",
            stck_oprc: "70000",
            hts_avls: "4180000",
            acml_tr_pbmn: "900000000000",
            stck_prpr: "70500",
            prdy_vrss: "500",
            prdy_ctrt: "0.71",
            acml_vol: "1234567",
            stck_hgpr: "71000",
            stck_lwpr: "69500",
          },
        },
      }),
    } as any;
    const result = await fetchInquirePrice(client, "005930");
    expect(result.stck_mxpr).toBe("91000");
    expect(client.get).toHaveBeenCalledWith(
      "/uapi/domestic-stock/v1/quotations/inquire-price",
      expect.objectContaining({
        headers: { tr_id: "FHKST01010100" },
        params: { fid_cond_mrkt_div_code: "J", fid_input_iscd: "005930" },
      }),
    );
  });

  it("rt_cd != 0 응답 시 throw", async () => {
    const client = {
      get: vi.fn().mockResolvedValue({
        data: { rt_cd: "1", msg_cd: "EGW00201", msg1: "rate limited" },
      }),
    } as any;
    await expect(fetchInquirePrice(client, "005930")).rejects.toThrow(/EGW00201/);
  });
});
