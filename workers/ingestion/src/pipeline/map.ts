import type { Stock, Market, KisRankingRow } from "@gh-radar/shared";
import type { KisInquirePriceRow } from "../kis/inquirePrice";

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
    tradeAmount: Number(row.acml_tr_pbmn),
    open: priceData ? Number(priceData.stck_oprc) : Number(row.stck_hgpr),
    high: Number(row.stck_hgpr),
    low: Number(row.stck_lwpr),
    marketCap: priceData ? Number(priceData.stck_avls) : 0,
    upperLimit: priceData ? Number(priceData.stck_mxpr) : 0,
    lowerLimit: priceData ? Number(priceData.stck_llam) : 0,
    updatedAt: new Date().toISOString(),
  };
}
