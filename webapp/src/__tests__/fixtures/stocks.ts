import type { Stock } from '@gh-radar/shared';

/**
 * Phase 6 — unit 테스트 공용 Stock 픽스처.
 * E2E 픽스처(`webapp/e2e/fixtures/stocks.ts`)와 값 일치 유지. (단위 테스트는
 * src 바깥 경로 import 를 피하기 위해 독립 파일로 둔다.)
 */

export const FIXTURE_SAMSUNG: Stock = {
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
};

export const FIXTURE_NULL_PRICE: Stock = {
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
};
