import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * quick-260817-f1a — ka10081 (주식일봉차트) 최신 dt probe.
 *
 * 키움 ka10027/ka10001 은 데이터 기준일자를 싣지 않지만 ka10081 일봉은 봉마다 `dt` 를 준다.
 * 최신 dt !== 오늘이면 "직전 거래일 재방출" 로 결정적으로 판정할 수 있다(1차 가드).
 *
 * 키움은 IP 화이트리스트라 로컬 실호출 불가 → axios instance 스텁 주입 (RESEARCH P1).
 */
const { acquire } = vi.hoisted(() => ({ acquire: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/kiwoom/rateLimiter", () => ({
  acquireKiwoomRateToken: acquire,
  configureKiwoomRateLimiter: vi.fn(),
  resetKiwoomRateLimiter: vi.fn(),
}));

import { fetchKa10081LatestDt } from "../src/kiwoom/fetchDailyChart";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeClient(response: { data: any } | { error: any }) {
  const post = vi.fn();
  if ("error" in response) post.mockRejectedValueOnce(response.error);
  else post.mockResolvedValueOnce({ data: response.data, headers: {} });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { post } as any;
}

beforeEach(() => {
  acquire.mockClear();
});

describe("fetchKa10081LatestDt", () => {
  it("정렬 무관 max(dt) 반환 — 배열 정렬 방향 가정 금지", async () => {
    const client = makeClient({
      data: {
        return_code: 0,
        stk_dt_pole_chart_qry: [{ dt: "20260812" }, { dt: "20260814" }, { dt: "20260813" }],
      },
    });
    await expect(fetchKa10081LatestDt(client, "TOKEN", "005930", "20260817")).resolves.toBe(
      "20260814",
    );
  });

  it("빈 배열 / 필드 없음 → null (fail-open)", async () => {
    const empty = makeClient({ data: { return_code: 0, stk_dt_pole_chart_qry: [] } });
    await expect(fetchKa10081LatestDt(empty, "TOKEN", "005930", "20260817")).resolves.toBeNull();

    const missing = makeClient({ data: { return_code: 0 } });
    await expect(fetchKa10081LatestDt(missing, "TOKEN", "005930", "20260817")).resolves.toBeNull();
  });

  it("dt 형식 불량 행은 무시하고 나머지에서 max", async () => {
    const client = makeClient({
      data: {
        return_code: 0,
        stk_dt_pole_chart_qry: [
          { dt: "" },
          { dt: "2026-08-14" },
          { dt: undefined },
          { dt: "20260813" },
          { dt: "20260814" },
        ],
      },
    });
    await expect(fetchKa10081LatestDt(client, "TOKEN", "005930", "20260817")).resolves.toBe(
      "20260814",
    );
  });

  it("request body/header 규약 — ka10081 / stk_cd / base_dt / cont-yn N 단일 호출", async () => {
    const client = makeClient({
      data: { return_code: 0, stk_dt_pole_chart_qry: [{ dt: "20260814" }] },
    });
    await fetchKa10081LatestDt(client, "TOKEN", "005930", "20260817");
    expect(client.post).toHaveBeenCalledTimes(1);
    expect(client.post).toHaveBeenCalledWith(
      "/api/dostk/chart",
      expect.objectContaining({ stk_cd: "005930", base_dt: "20260817", upd_stkpc_tp: "1" }),
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer TOKEN",
          "api-id": "ka10081",
          "cont-yn": "N",
        }),
      }),
    );
  });

  it("return_code != 0 → throw with return_msg", async () => {
    const client = makeClient({ data: { return_code: 1, return_msg: "권한 없음" } });
    await expect(fetchKa10081LatestDt(client, "TOKEN", "005930", "20260817")).rejects.toThrow(
      /return_code=1.*권한 없음/,
    );
  });

  it("401 → '키움 401' / 429 → '키움 429' throw", async () => {
    const c401 = makeClient({ error: { response: { status: 401 } } });
    await expect(fetchKa10081LatestDt(c401, "BAD", "005930", "20260817")).rejects.toThrow(
      /키움 401/,
    );

    const c429 = makeClient({ error: { response: { status: 429 } } });
    await expect(fetchKa10081LatestDt(c429, "TOKEN", "005930", "20260817")).rejects.toThrow(
      /키움 429/,
    );
  });

  it("호출 직전 acquireKiwoomRateToken 1회 호출", async () => {
    const client = makeClient({
      data: { return_code: 0, stk_dt_pole_chart_qry: [{ dt: "20260814" }] },
    });
    await fetchKa10081LatestDt(client, "TOKEN", "005930", "20260817");
    expect(acquire).toHaveBeenCalledTimes(1);
  });
});
