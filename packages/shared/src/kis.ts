export type KisRankingRow = {
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
  [key: string]: string;
};

export type KisTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  access_token_token_expired: string;
};
