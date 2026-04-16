// KIS 국내주식 등락률 순위 (FHPST01700000) output row.
// HIGH-1 (06.1-REVIEW): 실제 사용되는 필드를 명시적으로 선언.
// - stck_shrn_iscd: 단축종목코드 (6자리) — pipeline primary key
// - acml_hgpr_date: 고가 일자 (YYYYMMDD) — holidayGuard 거래일 판정
// - 나머지는 map/pipeline 에서 사용 또는 empirical 검증에 사용되는 필드
// - 스키마 변화에 완전히 취약하지 않도록 index signature 는 유지
export type KisRankingRow = {
  stck_shrn_iscd: string;
  hts_kor_isnm: string;
  mksc_shrn_iscd: string;
  stck_prpr: string;
  prdy_vrss: string;
  prdy_ctrt: string;
  acml_vol: string;
  stck_oprc: string;
  stck_hgpr: string;
  stck_lwpr: string;
  stck_mxpr: string;
  stck_llam: string;
  mrkt_div_cls_code: string;
  stck_avls: string;
  bsop_date: string;
  acml_hgpr_date: string;
  [key: string]: string;
};

export type KisTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  access_token_token_expired: string;
};
