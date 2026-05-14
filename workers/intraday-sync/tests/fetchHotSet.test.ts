import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchKa10001ForHotSet } from "../src/kiwoom/fetchHotSet";
import { resetKiwoomRateLimiter, configureKiwoomRateLimiter } from "../src/kiwoom/rateLimiter";
import samsung from "./fixtures/ka10001-005930.json";
import kakao from "./fixtures/ka10001-035720.json";

describe("fetchKa10001ForHotSet", () => {
  beforeEach(() => {
    // rate limiter 큰 capacity 로 단위 테스트가 직렬화 대기로 느려지지 않게
    configureKiwoomRateLimiter({ capacity: 1000, refillRatePerSec: 1000 });
    resetKiwoomRateLimiter();
  });

  it("모든 호출 성공 → successful = N, failed = 0", async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce({ data: samsung })
      .mockResolvedValueOnce({ data: kakao });
    const client = { post } as any;

    const out = await fetchKa10001ForHotSet(client, "TOKEN", ["005930", "035720"]);
    expect(out.successful).toHaveLength(2);
    expect(out.failed).toBe(0);
    expect(out.failures).toHaveLength(0);

    // 각 호출이 정확한 stk_cd + headers 로 호출됨
    expect(post).toHaveBeenCalledWith(
      "/api/dostk/stkinfo",
      { stk_cd: "005930" },
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer TOKEN",
          "api-id": "ka10001",
        }),
      }),
    );
  });

  it("일부 호출 실패 → fail-isolation (성공만 successful, 실패는 failures)", async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce({ data: samsung })
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce({ data: kakao });
    const client = { post } as any;

    const out = await fetchKa10001ForHotSet(client, "TOKEN", ["005930", "BAD", "035720"]);
    expect(out.successful).toHaveLength(2);
    expect(out.failed).toBe(1);
    expect(out.failures[0].code).toBe("BAD");
  });

  it("return_code != 0 응답 → 해당 종목 실패로 분류", async () => {
    const post = vi
      .fn()
      .mockResolvedValueOnce({ data: samsung })
      .mockResolvedValueOnce({ data: { return_code: 1700, return_msg: "허용된 요청 개수를 초과" } });
    const client = { post } as any;

    const out = await fetchKa10001ForHotSet(client, "TOKEN", ["005930", "035720"]);
    expect(out.successful).toHaveLength(1);
    expect(out.failed).toBe(1);
    expect(out.failures[0].code).toBe("035720");
    expect(out.failures[0].error).toMatch(/1700.*허용된 요청 개수를 초과/);
  });

  it("빈 codes 입력 → 빈 결과", async () => {
    const post = vi.fn();
    const client = { post } as any;
    const out = await fetchKa10001ForHotSet(client, "TOKEN", []);
    expect(out.successful).toHaveLength(0);
    expect(out.failed).toBe(0);
    expect(post).not.toHaveBeenCalled();
  });
});
