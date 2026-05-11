import type { AxiosInstance } from "axios";
import type { BdydTrdRow } from "@gh-radar/shared";

// RESEARCH §1.2 — KRX 응답 wrapper
type KrxResponse = {
  OutBlock_1?: Array<Omit<BdydTrdRow, "market">>;
};

/**
 * KRX bydd_trd — 날짜×시장 단위 단일 호출로 전 종목 OHLCV 수신.
 *
 * URL: https://data-dbg.krx.co.kr/svc/apis/sto/{stk|ksq}_bydd_trd?basDd=YYYYMMDD
 * Headers: AUTH_KEY (config.krxAuthKey)
 *
 * RESEARCH §1.1 — production 검증된 URL = data-dbg.krx.co.kr/svc/apis (master-sync 와 동일).
 * RESEARCH §7 T-09-01 — 401 시 retry 없이 즉시 throw (AUTH_KEY 미승인/만료).
 */
export async function fetchBydd(
  client: AxiosInstance,
  basDd: string, // YYYYMMDD (예: "20260509")
): Promise<BdydTrdRow[]> {
  let kospiRes, kosdaqRes;
  try {
    [kospiRes, kosdaqRes] = await Promise.all([
      client.get<KrxResponse>("/sto/stk_bydd_trd", { params: { basDd } }),
      client.get<KrxResponse>("/sto/ksq_bydd_trd", { params: { basDd } }),
    ]);
  } catch (err: any) {
    // RESEARCH §7 T-09-01: 401 → retry 없이 명확한 에러
    // master-sync fetchBaseInfo.ts:35 패턴 mirror
    if (err?.response?.status === 401) {
      throw new Error(
        `KRX 401 — AUTH_KEY 미승인 또는 잘못된 값. openapi.krx.co.kr 에서 stk_bydd_trd + ksq_bydd_trd 서비스 신청 상태 확인 필요. basDd=${basDd}`,
      );
    }
    throw err;
  }

  const kospi = (kospiRes.data.OutBlock_1 ?? []).map((r) => ({
    ...r,
    market: "KOSPI" as const,
  }));
  const kosdaq = (kosdaqRes.data.OutBlock_1 ?? []).map((r) => ({
    ...r,
    market: "KOSDAQ" as const,
  }));
  return [...kospi, ...kosdaq];
}
