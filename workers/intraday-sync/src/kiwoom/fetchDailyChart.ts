import type { AxiosInstance } from "axios";
import { acquireKiwoomRateToken } from "./rateLimiter";

/** ka10081 일봉 1행 — 판정에 쓰는 `dt` 만 명시(나머지 필드는 사용하지 않는다). */
type Ka10081ChartRow = { dt?: string };

/**
 * ka10081 (주식일봉차트조회) 최신 `dt` probe — 1차 거래일 가드 (quick-260817-f1a).
 *
 * 배경: ka10027/ka10001 은 "현재가 스냅샷" 계열이라 데이터 기준일자를 싣지 않는다.
 * 반면 일봉은 봉마다 `dt`(YYYYMMDD)를 주므로, 최신 dt !== 오늘이면 키움이 직전 거래일
 * 데이터를 재방출 중이라고 **결정적으로** 판정할 수 있다(값 비교 휴리스틱과 달리 안 뚫린다).
 *
 * 규약:
 *   - 페이지네이션 금지 (`cont-yn: "N"` 단일 호출). 첫 페이지에 최신 봉이 없으면 null → fail-open.
 *   - 배열 정렬 방향을 가정하지 않고 **문자열 max** 로 최신 dt 를 고른다.
 *   - 응답 전문 로깅 금지(수백 봉) — caller 가 latestDt 만 로깅한다 (T-f1a-04).
 *   - 에러 분류는 fetchRanking.ts 규약 mirror (401 / 429 / return_code).
 */
export async function fetchKa10081LatestDt(
  client: AxiosInstance,
  token: string,
  stkCd: string,
  baseDt: string, // "YYYYMMDD"
): Promise<string | null> {
  const body = {
    stk_cd: stkCd,
    base_dt: baseDt,
    upd_stkpc_tp: "1", // 수정주가 반영
  };
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    "api-id": "ka10081",
    "content-type": "application/json;charset=utf-8",
    "cont-yn": "N",
  };

  // 키움 IP-단위 통합 bucket — ka10027/ka10001 과 동일 limiter 공유 (호출 직전 필수).
  await acquireKiwoomRateToken();

  let res;
  try {
    res = await client.post<{
      stk_dt_pole_chart_qry?: Ka10081ChartRow[];
      return_code?: number;
      return_msg?: string;
    }>("/api/dostk/chart", body, { headers });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    if (err?.response?.status === 401) throw new Error("키움 401 — token/credential 실패");
    if (err?.response?.status === 429) throw new Error("키움 429 — rate limit");
    throw err;
  }

  if (res.data.return_code !== undefined && res.data.return_code !== 0) {
    throw new Error(`ka10081 return_code=${res.data.return_code}: ${res.data.return_msg}`);
  }

  const rows = res.data.stk_dt_pole_chart_qry ?? [];
  let latest: string | null = null;
  for (const row of rows) {
    const dt = row?.dt;
    if (typeof dt !== "string" || !/^\d{8}$/.test(dt)) continue; // 형식 불량 행 무시
    if (latest === null || dt > latest) latest = dt;
  }
  return latest;
}
