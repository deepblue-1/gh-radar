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

// ============================================================
// Phase 9 — Daily Candle Data (DATA-01)
//
// BdydTrdRow: KRX OpenAPI `stk_bydd_trd` / `ksq_bydd_trd` 응답의 raw row.
//   - 필드명은 RESEARCH §1.2 기준 잠정. Plan 06 Wave 0 prerequisite task 의
//     fixture 캡처(`workers/candle-sync/tests/fixtures/bydd-trd-{kospi,kosdaq}.json`)
//     실측으로 잠금 — 실측 차이 발견 시 본 타입 수정.
//   - market 필드는 호출 엔드포인트 (stk_ vs ksq_) 로 결정 후 태깅
// ============================================================

// Plan 06 Wave 0 prerequisite (2026-05-12) 실측 잠금:
//   - bydd_trd 응답에는 ISU_SRT_CD 없음. ISU_CD 가 6자 단축코드로 옴 ("005930").
//   - isu_base_info 의 ISU_CD (12자 표준코드) 와는 의미가 다름 — 동일 키 다른 endpoint 다른 의미.
export type BdydTrdRow = {
  BAS_DD: string;              // 기준일자 YYYYMMDD
  ISU_CD: string;              // 단축코드 6자 → code 필수 (bydd_trd 실측 잠금)
  ISU_NM?: string;             // 종목명 (참고용 — stocks 마스터에 이미 존재)
  MKT_NM?: string;             // 시장구분 ("KOSPI"/"KOSDAQ")
  SECT_TP_NM?: string;         // 소속부 / 업종 (참고용)
  TDD_OPNPRC: string;          // 당일 시가 → open
  TDD_HGPRC: string;           // 당일 고가 → high
  TDD_LWPRC: string;           // 당일 저가 → low
  TDD_CLSPRC: string;          // 당일 종가 → close
  CMPPREVDD_PRC?: string;      // 전일대비 (절대값) → change_amount
  FLUC_RT?: string;            // 등락률 (%) → change_rate
  ACC_TRDVOL?: string;         // 누적거래량 → volume
  ACC_TRDVAL?: string;         // 누적거래대금 → trade_amount
  MKTCAP?: string;             // 시가총액 (D-05: 저장 X)
  LIST_SHRS?: string;          // 상장주식수 (D-05: 저장 X)
  market: "KOSPI" | "KOSDAQ";  // 호출 엔드포인트로 결정 (Plan 03 fetchBydd 가 태깅)
};

// stock_daily_ohlcv 테이블 row — Plan 03 mapper 의 출력, Plan 03 upsert 의 입력
export type StockDailyOhlcv = {
  code: string;                       // ISU_CD (6자 단축코드)
  date: string;                       // ISO YYYY-MM-DD (BAS_DD → 변환)
  open: number;                       // numeric(20,2)
  high: number;
  low: number;
  close: number;                      // raw close (D-04 — 수정주가 X)
  volume: number;                     // bigint
  tradeAmount: number;                // bigint (KRW)
  changeAmount: number | null;        // 전일대비 (nullable — 신규 상장일 등)
  changeRate: number | null;          // 등락률 % (nullable)
};
