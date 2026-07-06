import type { AxiosInstance } from "axios";
import type { KiwoomKa10027Row } from "@gh-radar/shared";
import { acquireKiwoomRateToken } from "./rateLimiter";

/**
 * ka10027 등락률 순위 페이지네이션 loop.
 * RESEARCH §1.2 + Pattern 1.
 *
 * CONTEXT D-06: mrkt_tp=000 (KOSPI+KOSDAQ 통합)
 * CONTEXT D-07: updown_incls=1 (등락 미발생 포함)
 *
 * sort_tp 은 caller 가 지정한다 (기본값 "1") — 2026-07-06 재수정.
 *   - sort_tp 의미(probe): 1=상승+보합(+30→0), 3=하락+보합(-18.77→0), 4=하락만.
 *   - index.ts STEP1 이 sort_tp=1(상승+보합) + sort_tp=3(하락+보합) 을 각각 호출 후 병합한다.
 *     이전에는 sort_tp=1 하드코딩이라 하락 전환 종목이 응답에서 사라져 일봉(stock_daily_ohlcv)
 *     갱신이 장 초 값에 동결됐다(009150/000660 등). 1+3 병합으로 상승·하락 전 종목 커버.
 *   - topMovers 는 changeRate>0 필터라 sort_tp=3 하락 종목은 스캐너에 유입되지 않는다(자연 무해).
 *     상승/하락 종목 수는 시장 따라 변동. 휴장일은 병합 length===0 으로 별도 구분(index.ts).
 *     debug session: .planning/debug/resolved/kiwoom-ka10027-partial-response.md 참조.
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
  sortTp = "1",
  hardCap = 5000,
): Promise<KiwoomKa10027Row[]> {
  const body = {
    mrkt_tp: "000",
    // sort_tp: caller 지정 (1=상승+보합, 3=하락+보합). index.ts 가 1+3 병합 호출.
    // 명시 정렬(hotSet/topMovers)은 키움 응답 순서에 의존하지 않기 위해 별도 유지.
    sort_tp: sortTp,
    trde_qty_cnd: "0000",
    stk_cnd: "0",
    crd_cnd: "0",
    updown_incls: "1",
    pric_cnd: "0",
    trde_prica_cnd: "0",
    // stex_tp: 거래소 구분 (키움 spec 변경으로 필수 파라미터로 승격 — 2026-05-15 first cycle 에서 발견).
    //  "1"=KRX, "2"=NXT, "3"=통합. mrkt_tp=000 (KOSPI+KOSDAQ 통합) 의도와 일치하는 "3" 채택.
    stex_tp: "3",
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

    // 키움 IP-단위 통합 bucket 가설 — ka10027 페이지 호출도 ka10001 hot set 과 동일 limiter 공유.
    // 2026-05-26 운영 로그에서 ka10027 페이지 연속 호출이 burst 로 429 받아 cycle exit(1) 다발.
    await acquireKiwoomRateToken();

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
