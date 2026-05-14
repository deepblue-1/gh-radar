// workers/intraday-sync/src/kiwoom/fetchHotSet.ts
//
// STEP 2 hot set 순차 호출 (token bucket rate-limited).
// RESEARCH Pattern 2 + §2.6 — Promise.allSettled fail-isolation.
//
// 종목별 실패가 cycle 전체 중단 안 함. failed count 만 별도 반환.

import type { AxiosInstance } from "axios";
import type { KiwoomKa10001Row } from "@gh-radar/shared";
import { acquireKiwoomRateToken } from "./rateLimiter";

/**
 * ka10001 hot set 순차 호출.
 *
 * - 각 호출 직전 `acquireKiwoomRateToken()` 호출 → token bucket 강제 (24 req/s default)
 * - Promise.allSettled 로 부분 실패 격리 — 한 종목 실패가 cycle 전체 중단 안 함
 * - return_code != 0 응답 → 해당 종목 실패로 분류 + return_msg 포함 error message
 *
 * @returns successful (정상 응답 row[]) + failed count + failures (code + error message[])
 */
export async function fetchKa10001ForHotSet(
  client: AxiosInstance,
  token: string,
  codes: string[],
): Promise<{
  successful: KiwoomKa10001Row[];
  failed: number;
  failures: Array<{ code: string; error: string }>;
}> {
  const results = await Promise.allSettled(
    codes.map(async (code) => {
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
    }),
  );

  const successful: KiwoomKa10001Row[] = [];
  const failures: Array<{ code: string; error: string }> = [];

  results.forEach((r, idx) => {
    if (r.status === "fulfilled") {
      successful.push(r.value);
    } else {
      failures.push({
        code: codes[idx],
        error: (r.reason as Error).message,
      });
    }
  });

  return { successful, failed: failures.length, failures };
}
