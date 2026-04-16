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

/**
 * KRX 마스터 종목 정보 — stocks 테이블의 메타 컬럼 (Phase 06.1 Plan 02 마이그레이션).
 * ingestion Stock 과는 별도 타입: Stock 은 실시간 시세, StockMaster 는 종목 기본 정보.
 */
export type StockMaster = {
  code: string;
  name: string;
  market: Market;
  sector: string | null;
  kosdaqSegment: string | null;
  securityType: string;
  securityGroup: string;
  englishName: string | null;
  listingDate: string | null;
  parValue: number | null;
  listingShares: number | null;
  isDelisted: boolean;
  updatedAt: string;
};
