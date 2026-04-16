export type Market = "KOSPI" | "KOSDAQ";

export type Stock = {
  code: string;
  name: string;
  market: Market;
  price: number;
  changeAmount: number;
  changeRate: number;
  volume: number;
  tradeAmount: number;
  open: number;
  high: number;
  low: number;
  marketCap: number;
  upperLimit: number;
  lowerLimit: number;
  updatedAt: string;
};

export type SecurityType = "보통주" | "우선주" | "ETF" | "ETN" | "REIT" | string;

export type StockMaster = {
  code: string;
  name: string;
  market: Market;
  sector: string | null;           // KRX 응답에 업종 정보 없음 — 현재 NULL, 후속에 KIS bstp_kor_isnm 또는 별도 source 로 보강
  kosdaqSegment: string | null;    // KOSDAQ 소속부(중견기업부/우량기업부/벤처기업부/기술성장기업부/SPAC/관리종목 등). KOSPI 는 NULL.
  securityType: SecurityType;      // 종목구분 (보통주/구형우선주/신형우선주/종류주권) — KRX `KIND_STKCERT_TP_NM`
  securityGroup: string;           // 증권그룹 (주권/부동산투자회사/투자회사/외국주권/주식예탁증권/사회간접자본투융자회사) — KRX `SECUGRP_NM`
  englishName: string | null;      // KRX `ISU_ENG_NM` (선택)
  listingDate: string | null;      // ISO date YYYY-MM-DD
  parValue: number | null;         // KRX `PARVAL` 액면가 (nullable)
  listingShares: number | null;    // KRX `LIST_SHRS` 상장주식수 (nullable)
  isDelisted: boolean;
  updatedAt: string;
};

export type StockQuote = {
  code: string;
  price: number;
  changeAmount: number;
  changeRate: number;
  volume: number;
  tradeAmount: number;
  open: number | null;
  high: number | null;
  low: number | null;
  marketCap: number | null;
  upperLimit: number;
  lowerLimit: number;
  updatedAt: string;
};

// 검색·상세 응답에서 마스터 + 시세 병합 결과 (시세 부재 시 0/em-dash 폴백 — RESEARCH Open Q4 옵션 A)
export type StockWithQuote = StockMaster & {
  price: number;
  changeAmount: number;
  changeRate: number;
  volume: number;
  tradeAmount: number;
  open: number;
  high: number;
  low: number;
  marketCap: number;
  upperLimit: number;
  lowerLimit: number;
  quoteUpdatedAt: string | null; // null 이면 시세 없음 → webapp em-dash
};
