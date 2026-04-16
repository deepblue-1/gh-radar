import type { AxiosInstance } from "axios";

export type KrxBaseInfoRow = {
  ISU_CD?: string;            // 표준코드 KR7XXXXXXXXX
  ISU_SRT_CD?: string;        // 단축코드 (6자) — code 필수
  ISU_NM?: string;            // 풀네임
  ISU_ABBRV?: string;         // 약칭 (검색 친화)
  ISU_ENG_NM?: string;        // 영문명
  MKT_TP_NM?: string;         // KOSPI/KOSDAQ
  SECUGRP_NM?: string;        // 증권그룹 (주권/REIT/투자회사 등) — securityGroup
  SECT_TP_NM?: string;        // KOSDAQ 소속부 (KOSPI 는 빈 문자열) — kosdaqSegment (RESEARCH 의 'sector' 추정 틀림)
  KIND_STKCERT_TP_NM?: string; // 종목구분 (보통주/우선주 등) — securityType
  LIST_DD?: string;           // 상장일 YYYYMMDD
  PARVAL?: string;            // 액면가 (문자열)
  LIST_SHRS?: string;         // 상장주식수 (문자열)
  market: "KOSPI" | "KOSDAQ"; // 호출 엔드포인트로 결정
};

export async function fetchMasterFromKrx(
  client: AxiosInstance,
  basDd: string,
): Promise<KrxBaseInfoRow[]> {
  throw new Error("NOT_IMPLEMENTED — Plan 03");
}
