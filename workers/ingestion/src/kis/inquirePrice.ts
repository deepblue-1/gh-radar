import type { AxiosInstance } from "axios";
import { waitForSlot } from "./rateLimiter";

export type KisInquirePriceRow = {
  stck_mxpr: string;
  stck_llam: string;
  stck_oprc: string;
  stck_avls: string;
  acml_tr_pbmn: string;
  [key: string]: string;
};

export async function fetchInquirePrice(
  client: AxiosInstance,
  stockCode: string
): Promise<KisInquirePriceRow> {
  await waitForSlot();

  const res = await client.get(
    "/uapi/domestic-stock/v1/quotations/inquire-price",
    {
      headers: { tr_id: "FHKST01010100" },
      params: {
        fid_cond_mrkt_div_code: "J",
        fid_input_iscd: stockCode,
      },
    }
  );

  if (res.data.rt_cd !== "0") {
    throw new Error(
      `KIS inquire-price error for ${stockCode}: ${res.data.msg_cd} ${res.data.msg1}`
    );
  }

  return res.data.output as KisInquirePriceRow;
}
