import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchKa10027 } from "../src/kiwoom/fetchRanking";
import { resetKiwoomRateLimiter } from "../src/kiwoom/rateLimiter";
import page1 from "./fixtures/ka10027-page1.json";

// 매 테스트마다 rateLimiter 리셋 — fetchKa10027 가 페이지마다 token 소비하므로 idempotent 보장.
beforeEach(() => {
  resetKiwoomRateLimiter();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeClient(responses: Array<{ data: any; headers: any } | { error: any }>) {
  const post = vi.fn();
  for (const r of responses) {
    if ("error" in r) {
      post.mockRejectedValueOnce(r.error);
    } else {
      post.mockResolvedValueOnce(r);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { post } as any;
}

describe("fetchKa10027", () => {
  it("단일 페이지 (cont-yn=N) 응답 → 모든 row 반환", async () => {
    const client = makeClient([{ data: page1, headers: { "cont-yn": "N" } }]);
    const rows = await fetchKa10027(client, "TOKEN");
    expect(rows).toHaveLength(2);
    expect(rows[0].stk_cd).toBe("007460_AL");
  });

  it("request body 가 D-06/D-07 의 정확한 필드 포함", async () => {
    const client = makeClient([{ data: page1, headers: { "cont-yn": "N" } }]);
    await fetchKa10027(client, "TOKEN");
    expect(client.post).toHaveBeenCalledWith(
      "/api/dostk/rkinfo",
      expect.objectContaining({
        mrkt_tp: "000",
        // sort_tp="3": 전체 시장 (음수 포함). "1" 은 상승 종목만 반환 → 약세장 partial response 회귀.
        sort_tp: "3",
        updown_incls: "1",
        // stex_tp: 키움 spec 변경 (2026-05-15 first cycle 에서 1511 필수 누락 발견) — "3"=통합
        stex_tp: "3",
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer TOKEN",
          "api-id": "ka10027",
          "cont-yn": "N",
        }),
      }),
    );
  });

  it("회귀 가드 — sort_tp 는 반드시 '3' (전체 시장). '1' 로 되돌리면 약세장 partial response 회귀", async () => {
    // 2026-06-08 회귀: sort_tp=1 은 spec 상 "상승 종목 + 보합" 만 반환 → 약세장에서
    // 응답 row 수가 시장 상승 종목 수에 비례 → MIN_EXPECTED_ROWS=600 가드 trip → cycle exit(1).
    // sort_tp=3 으로 변경하여 전체 시장 row 안정 확보. 절대 '1' 로 되돌리지 말 것.
    // debug session: .planning/debug/resolved/kiwoom-ka10027-partial-response.md
    const client = makeClient([{ data: page1, headers: { "cont-yn": "N" } }]);
    await fetchKa10027(client, "TOKEN");
    const body = (client.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as {
      sort_tp: string;
    };
    expect(body.sort_tp).toBe("3");
    expect(body.sort_tp).not.toBe("1");
  });

  it("다중 페이지 (cont-yn=Y) → next-key 헤더로 다음 호출", async () => {
    const client = makeClient([
      { data: page1, headers: { "cont-yn": "Y", "next-key": "PAGE2_KEY" } },
      { data: page1, headers: { "cont-yn": "N" } },
    ]);
    const rows = await fetchKa10027(client, "TOKEN");
    expect(rows).toHaveLength(4); // 2 + 2
    expect(client.post).toHaveBeenCalledTimes(2);
    // 2번째 호출에 next-key 헤더 포함 확인
    expect(client.post).toHaveBeenNthCalledWith(
      2,
      "/api/dostk/rkinfo",
      expect.any(Object),
      expect.objectContaining({
        headers: expect.objectContaining({ "next-key": "PAGE2_KEY", "cont-yn": "Y" }),
      }),
    );
  });

  it("401 응답 → throw '키움 401'", async () => {
    const client = makeClient([{ error: { response: { status: 401 } } }]);
    await expect(fetchKa10027(client, "BAD")).rejects.toThrow(/키움 401/);
  });

  it("429 응답 → throw '키움 429'", async () => {
    const client = makeClient([{ error: { response: { status: 429 } } }]);
    await expect(fetchKa10027(client, "TOKEN")).rejects.toThrow(/키움 429/);
  });

  it("return_code != 0 응답 → throw with return_msg", async () => {
    const client = makeClient([
      {
        data: { return_code: 99, return_msg: "권한 없음" },
        headers: { "cont-yn": "N" },
      },
    ]);
    await expect(fetchKa10027(client, "TOKEN")).rejects.toThrow(/return_code=99.*권한 없음/);
  });

  it("hardCap 초과 시 throw", async () => {
    // page1 = 2 row. hardCap=2 면 첫 페이지 push 직후 hard cap 도달.
    const client = makeClient([
      { data: page1, headers: { "cont-yn": "Y", "next-key": "PAGE2" } },
    ]);
    await expect(fetchKa10027(client, "TOKEN", 2)).rejects.toThrow(/hard cap 2 exceeded/);
  });
});
