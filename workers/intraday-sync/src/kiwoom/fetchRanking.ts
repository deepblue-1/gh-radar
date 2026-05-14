import type { AxiosInstance } from "axios";
import type { KiwoomKa10027Row } from "@gh-radar/shared";

/**
 * ka10027 등락률 순위 페이지네이션 loop.
 * RESEARCH §1.2 + Pattern 1.
 *
 * CONTEXT D-06: mrkt_tp=000 (KOSPI+KOSDAQ 통합), sort_tp=1 (상승률 내림차순)
 * CONTEXT D-07: updown_incls=1 (등락 미발생 포함)
 *
 * 페이지네이션: 응답 헤더 cont-yn=Y/N + next-key 로 추적.
 * Hard cap 으로 무한 loop 방지 (T-09.1-14).
 *
 * 에러 분류 (T-09.1-11, T-09.1-12):
 *   - 401 → "키움 401 — token/credential 실패" throw (caller 가 systemic 처리)
 *   - 429 → "키움 429 — rate limit" throw (caller 가 retry decision)
 *   - return_code != 0 → throw with return_msg
 */
export async function fetchKa10027(
  client: AxiosInstance,
  token: string,
  hardCap = 5000,
): Promise<KiwoomKa10027Row[]> {
  const body = {
    mrkt_tp: "000",
    sort_tp: "1",
    trde_qty_cnd: "0000",
    stk_cnd: "0",
    crd_cnd: "0",
    updown_incls: "1",
    pric_cnd: "0",
    trde_prica_cnd: "0",
  };

  const all: KiwoomKa10027Row[] = [];
  let contYn: "Y" | "N" = "N";
  let nextKey: string | undefined;
  let pageCount = 0;

  do {
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      "api-id": "ka10027",
      "content-type": "application/json;charset=utf-8",
      "cont-yn": contYn,
    };
    if (nextKey) headers["next-key"] = nextKey;

    let res;
    try {
      res = await client.post<{
        pred_pre_flu_rt_upper?: KiwoomKa10027Row[];
        return_code?: number;
        return_msg?: string;
      }>("/api/dostk/rkinfo", body, { headers });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err?.response?.status === 401) throw new Error("키움 401 — token/credential 실패");
      if (err?.response?.status === 429) throw new Error("키움 429 — rate limit");
      throw err;
    }

    if (res.data.return_code !== undefined && res.data.return_code !== 0) {
      throw new Error(
        `ka10027 return_code=${res.data.return_code}: ${res.data.return_msg}`,
      );
    }

    all.push(...(res.data.pred_pre_flu_rt_upper ?? []));
    contYn = res.headers["cont-yn"] === "Y" ? "Y" : "N";
    nextKey = res.headers["next-key"];
    pageCount += 1;

    if (all.length >= hardCap) {
      throw new Error(`pagination hard cap ${hardCap} exceeded (page ${pageCount})`);
    }
  } while (contYn === "Y" && nextKey);

  return all;
}
