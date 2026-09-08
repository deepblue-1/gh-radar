import type { StockRow, StockMasterRow, StockQuoteRow } from "../../src/mappers/stock";

// === 레거시 StockRow (scanner 테스트가 사용) ===

export const samsungRow: StockRow = {
  code: "005930",
  name: "삼성전자",
  market: "KOSPI",
  price: "70000.00",
  change_amount: "1000.00",
  change_rate: "1.4500",
  volume: 12345678,
  trade_amount: 900000000000,
  open: "69500.00",
  high: "70500.00",
  low: "69000.00",
  market_cap: 418000000000000,
  upper_limit: "91000.00",
  lower_limit: "49000.00",
  updated_at: "2026-04-13T10:00:00Z",
};

export const kakaoRow: StockRow = {
  ...samsungRow,
  code: "035720",
  name: "카카오",
  price: "55000.00",
  change_amount: "500.00",
  change_rate: "0.9100",
  volume: 2345678,
  upper_limit: "71500.00",
  lower_limit: "38500.00",
  market_cap: 24000000000000,
};

export const kosdaqRow: StockRow = {
  ...samsungRow,
  code: "091990",
  name: "셀트리온헬스케어",
  market: "KOSDAQ",
  price: "80000.00",
  change_amount: "-1000.00",
  change_rate: "-1.2300",
  volume: 987654,
  upper_limit: "104000.00",
  lower_limit: "56000.00",
  market_cap: 13000000000000,
};

export const allRows = [samsungRow, kakaoRow, kosdaqRow];

// === 마스터 universe DB row (snake_case — Plan 04 라우트 테스트용) ===

// StockMasterRow 에는 security_group 이 없다 — /search 가 MASTER_COLS 로 select 하지 않고
// 필터에만 쓰기 때문이다 (quick-260908-oh6 locked decision 4). 프로덕션 타입을 넓히지 않고
// 테스트 로컬 별칭으로만 확장한다. 프로덕션 stocks.security_group 은 NOT NULL DEFAULT '주권'.
export type MasterFixture = StockMasterRow & { security_group?: string | null };

export const samsungMaster: MasterFixture = {
  code: "005930",
  name: "삼성전자",
  isin: "KR7005930003",   // KRX 표준코드 12자 (D-28) — DMA 구독·주문 키
  market: "KOSPI",
  sector: null,
  security_type: "보통주",
  listing_date: "1975-06-11",
  is_delisted: false,
  security_group: "주권",
  updated_at: "2026-04-15T00:00:00Z",
};

// 마스터에는 있지만 시세 없는 종목 (em-dash 폴백 시나리오)
// isin 미백필 종목 — 그 종목은 DMA 구독·주문이 불가하다 (RESEARCH A9)
export const masterOnly: MasterFixture = {
  code: "999999",
  name: "신규상장종목",
  isin: null,
  market: "KOSDAQ",
  sector: null,
  security_type: "보통주",
  listing_date: null,
  is_delisted: false,
  security_group: "주권",
  updated_at: "2026-04-15T00:00:00Z",
};

export const allMasters: StockMasterRow[] = [samsungMaster, masterOnly];

// === /search ETP·상폐 제외 회귀 픽스처 (quick-260908-oh6) ===
//
// allMasters 는 stock-detail / scanner 테스트가 공유하므로 여기에 ETP 행을 밀어넣지 않는다.
// 회귀 케이스는 전용 export 로 분리해 테스트마다 masters 배열을 직접 조립한다.

export const hynixMaster: MasterFixture = {
  code: "000660",
  name: "SK하이닉스",
  isin: "KR7000660001",
  market: "KOSPI",
  sector: null,
  security_type: "보통주",
  listing_date: "1996-12-26",
  is_delisted: false,
  security_group: "주권",
  updated_at: "2026-09-08T00:00:00Z",
};

// 이름에 '하이닉스' 를 포함한 ETF (운영 실측: q=하이닉스 매치 17건 중 15건이 ETF).
// name-asc 에서 'ACE …' · 'KODEX …' 가 'SK하이닉스' 보다 앞서 결과 앞자리를 점거한다.
// ETP 는 isin 미백필 (RESEARCH A9).
export const hynixEtfMasters: MasterFixture[] = [
  {
    code: "0011E0",
    name: "ACE 하이닉스밸류체인액티브",
    isin: null,
    market: "KOSPI",
    sector: null,
    security_type: "수익증권",
    listing_date: "2024-05-02",
    is_delisted: false,
    security_group: "ETF",
    updated_at: "2026-09-08T00:00:00Z",
  },
  {
    code: "0022F0",
    name: "KODEX 하이닉스레버리지",
    isin: null,
    market: "KOSPI",
    sector: null,
    security_type: "수익증권",
    listing_date: "2025-01-10",
    is_delisted: false,
    security_group: "ETF",
    updated_at: "2026-09-08T00:00:00Z",
  },
  {
    code: "0033G0",
    name: "TIGER 하이닉스소부장",
    isin: null,
    market: "KOSPI",
    sector: null,
    security_type: "수익증권",
    listing_date: "2025-03-14",
    is_delisted: false,
    security_group: "ETF",
    updated_at: "2026-09-08T00:00:00Z",
  },
];

// 상장폐지된 주권 — 이름에 '삼성' 포함. is_delisted=false 필터가 걸러야 한다.
export const delistedSamsungMaster: MasterFixture = {
  code: "425290",
  name: "삼성스팩4호",
  isin: "KR7425290006",
  market: "KOSDAQ",
  sector: null,
  security_type: "보통주",
  listing_date: "2021-10-19",
  is_delisted: true,
  security_group: "주권",
  updated_at: "2026-09-08T00:00:00Z",
};

// 과잉필터 가드 #1 — 부동산투자회사는 실제 상장 주식이라 계속 검색돼야 한다
// (블랙리스트 방식을 화이트리스트로 바꾸면 이 행이 소실된다 — locked decision 2).
export const reitMaster: MasterFixture = {
  code: "448730",
  name: "삼성FN리츠",
  isin: "KR7448730004",
  market: "KOSPI",
  sector: null,
  security_type: "보통주",
  listing_date: "2023-04-10",
  is_delisted: false,
  security_group: "부동산투자회사",
  updated_at: "2026-09-08T00:00:00Z",
};

// 과잉필터 가드 #2 — master-sync 가 아직 신원을 채우지 못한 신규 상장 sentinel.
// 블랙리스트 방식의 의도된 성질로서 '미확인' 도 검색에 통과한다.
export const unknownGroupMaster: MasterFixture = {
  code: "465000",
  name: "삼성머티리얼즈",
  isin: null,
  market: "KOSDAQ",
  sector: null,
  security_type: "보통주",
  listing_date: null,
  is_delisted: false,
  security_group: "미확인",
  updated_at: "2026-09-08T00:00:00Z",
};

// crowd-out 재현용 ELW 군집. '미래…' 는 한글 정렬에서 '삼성전자' 보다 앞서므로
// (localeCompare: 미 < 삼) 필터가 없으면 limit 20 을 ELW 가 통째로 채운다.
// 코드는 실제 ELW 형태를 흉내낸 6자 영숫자 (master-sync 가 ^[0-9A-Z]{6}$ 로 넓힌 대상).
export function makeElwCrowd(n: number): MasterFixture[] {
  return Array.from({ length: n }, (_, i) => ({
    code: `5${String(i + 1).padStart(3, "0")}KE`,
    name: `미래M073삼성전자콜${String(i + 1).padStart(2, "0")}`,
    isin: null,
    market: "KOSPI",
    sector: null,
    security_type: "주식워런트증권",
    listing_date: "2026-07-01",
    is_delisted: false,
    security_group: "ELW",
    updated_at: "2026-09-08T00:00:00Z",
  }));
}

// === stock_quotes DB row (snake_case) ===

export const samsungQuote: StockQuoteRow = {
  code: "005930",
  price: "70000",
  change_amount: "1000",
  change_rate: "1.45",
  volume: 12345678,
  trade_amount: 900000000000,
  open: "69500",
  high: "70500",
  low: "69000",
  market_cap: 418000000000000,
  upper_limit: "91000",
  lower_limit: "49000",
  updated_at: "2026-04-13T10:00:00Z",
};

export const allQuotes: StockQuoteRow[] = [samsungQuote];
