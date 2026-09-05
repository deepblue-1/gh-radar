import type { StockDetailResponse } from '@gh-radar/shared';

/**
 * Phase 6 Wave 0 — E2E/Unit 테스트 공용 픽스처.
 * - 삼성전자(005930): 정상 KOSPI 종목
 * - 가상거래정지종목(999999): price/upperLimit 등 0 케이스 → em-dash 렌더 테스트
 * - INVALID: 서버 regex `^[A-Za-z0-9]{1,10}$` 통과하지만 404 유도
 * - MALFORMED: 클라이언트 regex 실패 → notFound() 경로 유도
 *
 * Phase 15 Plan 14 — 타입을 `StockDetailResponse`(= Stock + upperLimitProximity + isin)로
 * 넓혔다. `isin` 이 없으면 호가창이 **구독 키 없음**으로 판정해 권한 없음 게이트만 타고
 * 연결 경로(인증 → 구독 → 호가 렌더)를 영원히 검증할 수 없다(15-13 deferred 해소, D-28).
 * `StockDetailResponse` 는 `Stock` 의 상위집합이라 기존 소비자는 무변경이다.
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
  upperLimitProximity: 0.785,
  // 삼성전자 KRX 표준코드. relay 구독·주문 키다(D-28).
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
  // 표준코드가 없는 종목 — 호가창은 권한 없음 게이트를 띄운다.
  isin: null,
};

export const FIXTURE_SK_HYNIX: StockDetailResponse = {
  ...FIXTURE_SAMSUNG,
  code: '000660',
  name: 'SK하이닉스',
  price: 195000,
  changeAmount: 2500,
  changeRate: 1.3,
};

export const FIXTURE_KAKAO: StockDetailResponse = {
  ...FIXTURE_SAMSUNG,
  code: '035720',
  name: '카카오',
  price: 55000,
  changeAmount: 500,
  changeRate: 0.91,
};

export const FIXTURE_MASTER_UNIVERSE: StockDetailResponse[] = [
  FIXTURE_SAMSUNG,
  FIXTURE_SK_HYNIX,
  FIXTURE_KAKAO,
];

export const INVALID_CODE = 'INVALID';
export const MALFORMED_CODE = '!!!';
