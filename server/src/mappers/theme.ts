import type {
  Theme,
  ThemeStockSource,
  ThemeStockMember,
  ThemeWithStats,
  Market,
} from "@gh-radar/shared";
import { THEME_STOCK_SOURCES } from "@gh-radar/shared";
import type { StockMasterRow, StockQuoteRow } from "./stock.js";
import { computeTop3Avg } from "../lib/computeTop3.js";

/**
 * Phase 10 — themes / theme_stocks row → camelCase 매핑 (THEME-02).
 *
 * DB(snake_case) → packages/shared 의 camelCase 계약(Theme/ThemeWithStats/ThemeStockMember).
 * scanner.ts(mover⋈master⋈quote) 와 동형 — theme_stocks 멤버 code 를 stock_quotes 와
 * 조인해 등락률 상위 3 평균(D-14)을 server 에서 실시간 계산한다.
 */

/** themes 테이블 row (snake_case). */
export type ThemeRow = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  owner_id: string | null;
  sources: string[] | null;
  top3_avg_change_rate: string | number | null;
  stats_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

/** theme_stocks 테이블 row (snake_case). */
export type ThemeStockRow = {
  theme_id: string;
  stock_code: string;
  source: string;
  confidence: string | number | null;
  reason: string | null;
  effective_from: string;
  effective_to: string | null;
};

/**
 * theme_stocks.source(text) → ThemeStockSource union.
 * 알 수 없는 값(스키마 외)은 보수적으로 'naver' 로 폴백 — 표시 깨짐 방지.
 */
function toSource(s: string): ThemeStockSource {
  return (THEME_STOCK_SOURCES as readonly string[]).includes(s)
    ? (s as ThemeStockSource)
    : "naver";
}

/** ThemeRow → Theme (camelCase). 통계 필드는 themeRowToThemeWithStats 가 채움. */
export function themeRowToTheme(row: ThemeRow): Theme {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isSystem: row.is_system,
    ownerId: row.owner_id,
    sources: (row.sources ?? []).map(toSource),
    top3AvgChangeRate:
      row.top3_avg_change_rate === null
        ? null
        : Number(row.top3_avg_change_rate),
    statsUpdatedAt: row.stats_updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 테마 목록 항목 — Theme + 실시간 통계(상위3평균 + 종목수).
 *
 * top3AvgChangeRate 는 DB precompute 컬럼이 아닌 **stock_quotes 실시간 계산값**으로 덮어쓴다
 * (D-14 권장 A2 — "지금 뜨는 테마"). DB 컬럼은 캐시 폴백용. 시세 없는 종목은 등락률에서 제외.
 *
 * @param row          themes row
 * @param memberCodes  해당 테마 active 소속 종목 code 배열
 * @param quoteByCode  code → stock_quotes row (청크 IN 결과 Map)
 */
export function themeRowToThemeWithStats(
  row: ThemeRow,
  memberCodes: string[],
  quoteByCode: Map<string, StockQuoteRow>,
): ThemeWithStats {
  const base = themeRowToTheme(row);
  // 시세 있는 종목의 등락률만 수집 (시세 부재 종목은 정렬 지표에서 제외 — RESEARCH Pattern 5)
  const rates: number[] = [];
  for (const code of memberCodes) {
    const q = quoteByCode.get(code);
    if (q) rates.push(Number(q.change_rate));
  }
  return {
    ...base,
    top3AvgChangeRate: computeTop3Avg(rates),
    stockCount: memberCodes.length,
  };
}

/**
 * theme_stocks active row → ThemeStockMember (scanner row 와 매핑되는 최소 필드).
 * 종목명/마켓은 stocks 마스터, 현재가/등락률/거래대금은 stock_quotes 에서.
 * 시세 부재 종목은 price/changeRate/tradeAmount = 0 (em-dash 폴백, search.ts 선례).
 *
 * @param ts            theme_stocks row (소속 + source)
 * @param master        stocks 마스터 row (name/market) — 없으면 null
 * @param quote         stock_quotes row — 없으면 null
 */
export function themeStockRowToMember(
  ts: ThemeStockRow,
  master: StockMasterRow | null,
  quote: StockQuoteRow | null,
): ThemeStockMember {
  return {
    code: ts.stock_code,
    name: master?.name ?? ts.stock_code,
    market: (master?.market ?? "KOSPI") as Market,
    price: quote ? Number(quote.price) : 0,
    changeRate: quote ? Number(quote.change_rate) : 0,
    tradeAmount: quote ? quote.trade_amount : 0,
    source: toSource(ts.source),
  };
}
