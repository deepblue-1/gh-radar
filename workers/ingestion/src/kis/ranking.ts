import type { AxiosInstance } from "axios";
import { waitForSlot } from "./rateLimiter";
import type { KisRankingRow } from "@gh-radar/shared";
import type { Market } from "@gh-radar/shared";

const MARKET_CODE_MAP: Record<Market, string> = {
  KOSPI: "J",
  KOSDAQ: "NX",
};

export async function fetchRanking(
  client: AxiosInstance,
  market: Market
): Promise<KisRankingRow[]> {
  await waitForSlot();

  const res = await client.get(
    "/uapi/domestic-stock/v1/ranking/fluctuation",
    {
      headers: { tr_id: "FHPST01700000" },
      params: {
        fid_cond_mrkt_div_code: MARKET_CODE_MAP[market],
        fid_cond_scr_div_code: "20170",
        fid_input_iscd: "",
        fid_rank_sort_cls_code: "0",
        fid_input_cnt_1: "0",
        fid_prc_cls_code: "1",
        fid_input_price_1: "",
        fid_input_price_2: "",
        fid_vol_cnt: "",
        fid_trgt_cls_code: "0",
        fid_trgt_exls_cls_code: "0",
        fid_div_cls_code: "0",
        fid_rsfl_rate1: "",
        fid_rsfl_rate2: "",
      },
    }
  );

  if (res.data.rt_cd !== "0") {
    throw new Error(
      `KIS ranking API error: ${res.data.msg_cd} ${res.data.msg1}`
    );
  }

  return (res.data.output ?? []) as KisRankingRow[];
}

export async function fetchAllRanking(
  client: AxiosInstance
): Promise<{ market: Market; rows: KisRankingRow[] }[]> {
  const kospi = await fetchRanking(client, "KOSPI");
  const kosdaq = await fetchRanking(client, "KOSDAQ");

  return [
    { market: "KOSPI", rows: kospi },
    { market: "KOSDAQ", rows: kosdaq },
  ];
}
