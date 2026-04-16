import type { AxiosInstance } from "axios";

export type KrxBaseInfoRow = {
  ISU_CD?: string;              // 표준코드 KR로 시작 12자
  ISU_SRT_CD?: string;          // 단축코드 6자 — code 필수
  ISU_NM?: string;              // 풀네임
  ISU_ABBRV?: string;           // 약칭 (검색 친화) — name 우선
  ISU_ENG_NM?: string;          // 영문명
  MKT_TP_NM?: string;           // KOSPI/KOSDAQ (응답에 있을 수도)
  SECUGRP_NM?: string;          // 증권그룹 (주권/REIT/투자회사 등) — securityGroup
  SECT_TP_NM?: string;          // KOSDAQ 소속부 (KOSPI 는 빈 문자열) — kosdaqSegment. 업종 아님.
  KIND_STKCERT_TP_NM?: string;  // 종목구분 (보통주/우선주 등) — securityType (C2 정정)
  LIST_DD?: string;             // 상장일 YYYYMMDD
  PARVAL?: string;              // 액면가 (문자열)
  LIST_SHRS?: string;           // 상장주식수 (문자열)
  market: "KOSPI" | "KOSDAQ";
};

type KrxResponse = {
  OutBlock_1?: Array<Omit<KrxBaseInfoRow, "market">>;
};

export async function fetchMasterFromKrx(
  client: AxiosInstance,
  basDd: string,
): Promise<KrxBaseInfoRow[]> {
  let kospiRes, kosdaqRes;
  try {
    [kospiRes, kosdaqRes] = await Promise.all([
      client.get<KrxResponse>("/sto/stk_isu_base_info", { params: { basDd } }),
      client.get<KrxResponse>("/sto/ksq_isu_base_info", { params: { basDd } }),
    ]);
  } catch (err: any) {
    // WARN #9 방어: 401 은 AUTH_KEY 미승인 / 잘못된 값 → retry 없이 즉시 명확한 에러 throw
    if (err?.response?.status === 401) {
      throw new Error(
        `KRX 401 — AUTH_KEY 미승인 또는 잘못된 값. openapi.krx.co.kr 에서 stk_isu_base_info + ksq_isu_base_info 서비스 신청 상태 확인 필요.`,
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
