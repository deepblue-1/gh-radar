import type { AxiosInstance } from "axios";
import type { KiwoomKa10001Row } from "@gh-radar/shared";
import { acquireKiwoomRateToken } from "./rateLimiter.js";

/**
 * server 의 종목 상세 페이지 on-demand 호출 (Phase 09.1 D-17).
 *
 * worker (Plan 05) 의 fetchKa10001ForHotSet 와 동일 endpoint + headers + body.
 * server 는 단일 종목 1회 호출 (사용자 요청 trigger) — Promise.allSettled 불필요.
 *
 * 호출 직전 acquireKiwoomRateToken — token bucket 24 req/s (D-29).
 */
export async function fetchInquirePrice(
  client: AxiosInstance,
  token: string,
  code: string,
): Promise<KiwoomKa10001Row> {
  await acquireKiwoomRateToken();

  const headers = {
    authorization: `Bearer ${token}`,
    "api-id": "ka10001",
    "content-type": "application/json;charset=utf-8",
  };

  const res = await client.post(
    "/api/dostk/stkinfo",
    { stk_cd: code },
    { headers },
  );

  if (res.data.return_code !== 0) {
    throw new Error(
      `ka10001 ${code} return_code=${res.data.return_code}: ${res.data.return_msg}`,
    );
  }

  return res.data as KiwoomKa10001Row;
}
