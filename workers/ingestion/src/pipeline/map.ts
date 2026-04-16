import type { Stock, Market, KisRankingRow } from "@gh-radar/shared";
import type { KisInquirePriceRow } from "../kis/inquirePrice";

// 거래대금은 inquirePrice.acml_tr_pbmn 만 사용 (정확한 누적 거래대금).
// KIS 등락률 순위 응답에는 acml_tr_pbmn 이 없고, 근사값은 허용하지 않음.
// inquirePrice 실패 시 tradeAmount=0 → UI 포맷터가 "-" 로 표시.
// 상승률/현재가/거래량 등 ranking 기반 핵심 정보는 priceData 없이도 유지.
export function toStock(
  row: KisRankingRow,
  market: Market,
  priceData?: KisInquirePriceRow
): Stock {
  return {
    code: row.stck_shrn_iscd,
    name: row.hts_kor_isnm,
    market,
    price: Number(row.stck_prpr),
    changeAmount: Number(row.prdy_vrss),
    changeRate: Number(row.prdy_ctrt),
    volume: Number(row.acml_vol),
    tradeAmount: priceData ? Number(priceData.acml_tr_pbmn) : 0,
    // HIGH-2 fix: fallback은 시가(stck_oprc)여야 함. 고가(stck_hgpr)로 잘못 쓰면 open===high로 오염됨.
    // ranking 응답에 stck_oprc 가 비어있을 수 있어 `|| 0` 로 안전한 숫자 반환.
    open: priceData
      ? Number(priceData.stck_oprc)
      : Number(row.stck_oprc) || 0,
    high: Number(row.stck_hgpr),
    low: Number(row.stck_lwpr),
    marketCap: priceData?.hts_avls ? Number(priceData.hts_avls) * 100_000_000 : 0,
    upperLimit: priceData ? Number(priceData.stck_mxpr) : 0,
    lowerLimit: priceData ? Number(priceData.stck_llam) : 0,
    updatedAt: new Date().toISOString(),
  };
}
