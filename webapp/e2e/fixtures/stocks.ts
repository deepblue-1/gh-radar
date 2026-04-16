import type { Stock } from '@gh-radar/shared';

/**
 * Phase 6 Wave 0 — E2E/Unit 테스트 공용 픽스처.
 * - 삼성전자(005930): 정상 KOSPI 종목
 * - 가상거래정지종목(999999): price/upperLimit 등 0 케이스 → em-dash 렌더 테스트
 * - INVALID: 서버 regex `^[A-Za-z0-9]{1,10}$` 통과하지만 404 유도
 * - MALFORMED: 클라이언트 regex 실패 → notFound() 경로 유도
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

export const FIXTURE_SK_HYNIX: Stock = {
  ...FIXTURE_SAMSUNG,
  code: '000660',
  name: 'SK하이닉스',
  price: 195000,
  changeAmount: 2500,
  changeRate: 1.3,
};

export const FIXTURE_KAKAO: Stock = {
  ...FIXTURE_SAMSUNG,
  code: '035720',
  name: '카카오',
  price: 55000,
  changeAmount: 500,
  changeRate: 0.91,
};

export const FIXTURE_MASTER_UNIVERSE: Stock[] = [
  FIXTURE_SAMSUNG,
  FIXTURE_SK_HYNIX,
  FIXTURE_KAKAO,
];

export const INVALID_CODE = 'INVALID';
export const MALFORMED_CODE = '!!!';
