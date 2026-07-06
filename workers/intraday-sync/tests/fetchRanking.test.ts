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
        // sort_tp 기본값 "1" (상승+보합). caller 가 지정 가능 (index.ts 가 1+3 병합 호출).
        sort_tp: "1",
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

  it("sortTp 미지정 시 기본값 body.sort_tp === '1' (하위호환)", async () => {
    // sort_tp 의미(probe 실측): 1=상승+보합(+30→0), 3=하락+보합(-18.77→0).
    // caller 가 지정 안 하면 기존 호출과 동일하게 "1" 로 동작해야 한다(하위호환).
    const client = makeClient([{ data: page1, headers: { "cont-yn": "N" } }]);
    await fetchKa10027(client, "TOKEN");
    const body = (client.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as {
      sort_tp: string;
    };
    expect(body.sort_tp).toBe("1");
  });

  it("sortTp='3' 전달 시 body.sort_tp === '3' (하락+보합 조회)", async () => {
    // index.ts STEP1 이 하락 전환 종목 일봉 갱신을 위해 sort_tp=3 을 병합 호출한다.
    const client = makeClient([{ data: page1, headers: { "cont-yn": "N" } }]);
    await fetchKa10027(client, "TOKEN", "3");
    const body = (client.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as {
      sort_tp: string;
    };
    expect(body.sort_tp).toBe("3");
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
    await expect(fetchKa10027(client, "TOKEN", "1", 2)).rejects.toThrow(/hard cap 2 exceeded/);
  });
});
