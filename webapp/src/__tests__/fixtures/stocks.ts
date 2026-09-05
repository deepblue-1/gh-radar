import type { StockDetailResponse } from '@gh-radar/shared';

/**
 * Phase 6 — unit 테스트 공용 Stock 픽스처.
 * E2E 픽스처(`webapp/e2e/fixtures/stocks.ts`)와 값 일치 유지. (단위 테스트는
 * src 바깥 경로 import 를 피하기 위해 독립 파일로 둔다.)
 *
 * Phase 15 Plan 13: `/api/stocks/:code` 계약이 `StockDetailResponse`(Stock +
 * upperLimitProximity + isin) 로 좁혀져 픽스처 타입도 함께 좁혔다. `Stock` 의
 * 상위집합이라 `StockHero` · `StockStatsGrid` 등 기존 소비자는 그대로 성립한다.
 */

export const FIXTURE_SAMSUNG: StockDetailResponse = {
  code: '005930',
  name: '삼성전자',
  market: 'KOSPI',
  price: 58700,
  changeAmount: 1200,
  changeRate: 2.09,
  volume: 15_324_000,
  tradeAmount: 900_000_000_000,
  open: 57500,
  high: 59000,
  low: 57200,
  marketCap: 350_400_000_000_000,
  upperLimit: 74750,
  lowerLimit: 40250,
  updatedAt: '2026-04-15T05:30:00.000Z',
  upperLimitProximity: 0.7853,
  // 12자 KRX 표준코드 — 호가창의 DMA 구독 키(D-28).
  isin: 'KR7005930003',
};

export const FIXTURE_NULL_PRICE: StockDetailResponse = {
  ...FIXTURE_SAMSUNG,
  code: '999999',
  name: '가상거래정지종목',
  price: 0,
  open: 0,
  high: 0,
  low: 0,
  marketCap: 0,
  upperLimit: 0,
  lowerLimit: 0,
  upperLimitProximity: 0,
  // 거래정지·게이트웨이 비대상 종목 — 호가창은 권한 없음 게이트를 그린다.
  isin: null,
};
