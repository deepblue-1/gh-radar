import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchInquirePrice } from "../../src/kiwoom/inquirePrice.js";
import {
  configureKiwoomRateLimiter,
  resetKiwoomRateLimiter,
} from "../../src/kiwoom/rateLimiter.js";

describe("fetchInquirePrice (server 측 ka10001)", () => {
  beforeEach(() => {
    // 테스트 직렬화 대기 회피 — 큰 capacity + reset
    configureKiwoomRateLimiter({ capacity: 1000, refillRatePerSec: 1000 });
    resetKiwoomRateLimiter();
  });

  it("return_code=0 응답 → KiwoomKa10001Row 반환 + headers/body 검증", async () => {
    const post = vi.fn().mockResolvedValue({
      data: {
        return_code: 0,
        return_msg: "정상",
        stk_cd: "005930",
        cur_prc: "+70500",
        open_pric: "+70000",
        high_pric: "+71000",
        low_pric: "+69500",
        upl_pric: "91000",
        lst_pric: "49000",
        mac: "4209000",
      },
    });
    const client = { post } as any;
    const row = await fetchInquirePrice(client, "TOKEN", "005930");
    expect(row.stk_cd).toBe("005930");
    expect(row.open_pric).toBe("+70000");
    expect(post).toHaveBeenCalledWith(
      "/api/dostk/stkinfo",
      { stk_cd: "005930" },
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer TOKEN",
          "api-id": "ka10001",
          "content-type": "application/json;charset=utf-8",
        }),
      }),
    );
  });

  it("return_code != 0 → throw with return_msg", async () => {
    const post = vi.fn().mockResolvedValue({
      data: { return_code: 1700, return_msg: "허용된 요청 개수를 초과" },
    });
    const client = { post } as any;
    await expect(
      fetchInquirePrice(client, "T", "005930"),
    ).rejects.toThrow(/1700.*허용된 요청/);
  });

  it("rate limiter 가 acquire 후 호출 (acquireKiwoomRateToken 통과 보장)", async () => {
    // capacity=1000 으로 설정했으므로 즉시 통과해야 함
    const post = vi.fn().mockResolvedValue({
      data: {
        return_code: 0,
        stk_cd: "005930",
        cur_prc: "+70500",
        open_pric: "+70000",
        high_pric: "+71000",
        low_pric: "+69500",
      },
    });
    const client = { post } as any;
    const start = Date.now();
    await fetchInquirePrice(client, "T", "005930");
    const elapsed = Date.now() - start;
    // 큰 capacity 라 ~0ms (50ms tick 미발생) 통과
    expect(elapsed).toBeLessThan(50);
  });
});
