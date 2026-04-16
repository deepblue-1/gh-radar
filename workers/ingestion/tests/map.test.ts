import { describe, it, expect } from "vitest";
import { toStock } from "../src/pipeline/map";
import type { KisRankingRow } from "@gh-radar/shared";
import type { KisInquirePriceRow } from "../src/kis/inquirePrice";

const sampleRankingRow: KisRankingRow = {
  stck_shrn_iscd: "368600",
  data_rank: "1",
  hts_kor_isnm: "아이씨에이치",
  stck_prpr: "1157",
  prdy_vrss: "267",
  prdy_vrss_sign: "1",
  prdy_ctrt: "30.00",
  acml_vol: "655925",
  stck_hgpr: "1157",
  hgpr_hour: "094554",
  acml_hgpr_date: "20260413",
  stck_lwpr: "903",
  lwpr_hour: "090605",
  acml_lwpr_date: "20260413",
  lwpr_vrss_prpr_rate: "28.13",
  dsgt_date_clpr_vrss_prpr_rate: "30.00",
  cnnt_ascn_dynu: "1",
  hgpr_vrss_prpr_rate: "0.00",
  cnnt_down_dynu: "0",
  oprc_vrss_prpr_sign: "2",
  oprc_vrss_prpr: "0",
  oprc_vrss_prpr_rate: "0.00",
  prd_rsfl: "0",
  prd_rsfl_rate: "0.00",
  mksc_shrn_iscd: "",
  stck_oprc: "",
  stck_mxpr: "",
  stck_llam: "",
  mrkt_div_cls_code: "",
  stck_avls: "",
  bsop_date: "",
};

const samplePriceRow: KisInquirePriceRow = {
  stck_mxpr: "1504",
  stck_llam: "624",
  stck_oprc: "920",
  hts_avls: "580", // 억원 단위 (= 58_000_000_000 원)
  acml_tr_pbmn: "759264850",
};

describe("toStock", () => {
  it("순위 + 시세 데이터를 Stock으로 정확히 변환", () => {
    const stock = toStock(sampleRankingRow, "KOSPI", samplePriceRow);

    expect(stock.code).toBe("368600");
    expect(stock.name).toBe("아이씨에이치");
    expect(stock.market).toBe("KOSPI");
    expect(stock.price).toBe(1157);
    expect(stock.changeAmount).toBe(267);
    expect(stock.changeRate).toBe(30.0);
    expect(stock.volume).toBe(655925);
    expect(stock.tradeAmount).toBe(759264850);
    expect(stock.open).toBe(920);
    expect(stock.high).toBe(1157);
    expect(stock.low).toBe(903);
    expect(stock.marketCap).toBe(58_000_000_000); // 580억원 → 원 단위
    expect(stock.upperLimit).toBe(1504);
    expect(stock.lowerLimit).toBe(624);
  });

  it("시세 보충 없이도 동작 (inquirePrice 실패 fallback)", () => {
    const stock = toStock(sampleRankingRow, "KOSDAQ");

    expect(stock.code).toBe("368600");
    // 거래대금은 inquirePrice 전용이므로 priceData 없으면 0 (UI에서 "-" 표시)
    expect(stock.tradeAmount).toBe(0);
    // HIGH-2 fix: fallback 은 ranking.stck_oprc (빈 문자열이면 0).
    // 고가(stck_hgpr)를 open 에 넣으면 open===high 오염 — 허용 안 함.
    expect(stock.open).toBe(0);
    expect(stock.marketCap).toBe(0);
    expect(stock.upperLimit).toBe(0);
    expect(stock.lowerLimit).toBe(0);
  });

  it("시세 보충 없어도 ranking.stck_oprc 존재 시 그 값을 open 으로 사용", () => {
    const rowWithOprc: KisRankingRow = {
      ...sampleRankingRow,
      stck_oprc: "950",
    };
    const stock = toStock(rowWithOprc, "KOSDAQ");
    expect(stock.open).toBe(950);
  });
});
