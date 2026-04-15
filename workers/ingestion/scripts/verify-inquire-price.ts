import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { loadConfig } from "../src/config";
import { createKisClient } from "../src/kis/client";
import { getKisToken } from "../src/kis/tokenStore";
import { fetchInquirePrice } from "../src/kis/inquirePrice";

async function main() {
  const config = loadConfig();
  const supabase = createClient(
    config.supabaseUrl,
    config.supabaseServiceRoleKey
  );

  const code = process.argv[2] ?? "005930";
  const token = await getKisToken(supabase, config);
  const client = createKisClient(config, token);

  const res = await client.get(
    "/uapi/domestic-stock/v1/quotations/inquire-price",
    {
      headers: { tr_id: "FHKST01010100" },
      params: { fid_cond_mrkt_div_code: "J", fid_input_iscd: code },
    }
  );

  console.log(JSON.stringify({
    rt_cd: res.data.rt_cd,
    msg_cd: res.data.msg_cd,
    msg1: res.data.msg1,
    output_keys: Object.keys(res.data.output ?? {}).sort(),
    output_sample: res.data.output,
  }, null, 2));
}

main().catch((err) => {
  console.error("VERIFY_ERROR", err?.response?.status, err?.response?.data ?? err?.message);
  process.exit(1);
});
