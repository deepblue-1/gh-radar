import { describe, it, expect, vi } from "vitest";
import type { AxiosInstance } from "axios";
import { createKrxClient } from "../src/krx/client";
import { fetchBydd } from "../src/krx/fetchBydd";

const mkConfig = (over: any = {}) =>
  ({
    krxAuthKey: "test-key",
    krxBaseUrl: "https://example.com",
    supabaseUrl: "x",
    supabaseServiceRoleKey: "x",
    logLevel: "info",
    appVersion: "test",
    mode: "daily",
    recoverLookback: 10,
    recoverThreshold: 0.9,
    recoverMaxCalls: 20,
    minExpectedRows: 1400,
    ...over,
  }) as any;

function mockClient(
  kospiData: unknown,
  kosdaqData: unknown,
  opts?: { status401?: boolean; error500?: boolean },
): AxiosInstance {
  return {
    get: vi.fn((url: string) => {
      if (opts?.status401) {
        const err: any = new Error("Unauthorized");
        err.response = { status: 401 };
        return Promise.reject(err);
      }
      if (opts?.error500) {
        const err: any = new Error("Internal Server Error");
        err.response = { status: 500 };
        return Promise.reject(err);
      }
      if (url === "/sto/stk_bydd_trd") return Promise.resolve({ data: kospiData });
      if (url === "/sto/ksq_bydd_trd") return Promise.resolve({ data: kosdaqData });
      return Promise.reject(new Error(`unknown url: ${url}`));
    }),
  } as unknown as AxiosInstance;
}

describe("createKrxClient", () => {
  it("AUTH_KEY 헤더 + baseURL + 30s timeout 설정", () => {
    const c = createKrxClient(mkConfig());
    expect(c.defaults.headers["AUTH_KEY"]).toBe("test-key");
    expect(c.defaults.baseURL).toBe("https://example.com");
    expect(c.defaults.timeout).toBe(30_000);
  });
});

describe("fetchBydd", () => {
  it("KOSPI + KOSDAQ Promise.all 호출 후 합쳐서 반환 + market 태깅", async () => {
    const client = mockClient(
      {
        OutBlock_1: [
          { BAS_DD: "20260509", ISU_CD: "005930", TDD_CLSPRC: "70000" },
        ],
      },
      {
        OutBlock_1: [
          { BAS_DD: "20260509", ISU_CD: "035720", TDD_CLSPRC: "300000" },
        ],
      },
    );
    const rows = await fetchBydd(client, "20260509");
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.ISU_CD === "005930")?.market).toBe("KOSPI");
    expect(rows.find((r) => r.ISU_CD === "035720")?.market).toBe("KOSDAQ");
    expect(client.get).toHaveBeenCalledWith("/sto/stk_bydd_trd", {
      params: { basDd: "20260509" },
    });
    expect(client.get).toHaveBeenCalledWith("/sto/ksq_bydd_trd", {
      params: { basDd: "20260509" },
    });
  });

  it("OutBlock_1 빈 배열이면 빈 배열 반환 (휴장일 — T-09-02)", async () => {
    const client = mockClient({ OutBlock_1: [] }, { OutBlock_1: [] });
    const rows = await fetchBydd(client, "20260101");
    expect(rows).toEqual([]);
  });

  it("HTTP 401 시 즉시 명확한 에러 throw (T-09-01)", async () => {
    const client = mockClient(null, null, { status401: true });
    await expect(fetchBydd(client, "20260509")).rejects.toThrow(/KRX 401.*AUTH_KEY/);
  });

  it("HTTP 500 시 axios error propagate (호출자 withRetry 가 처리)", async () => {
    const client = mockClient(null, null, { error500: true });
    await expect(fetchBydd(client, "20260509")).rejects.toThrow(
      /Internal Server Error|500/,
    );
  });
});
