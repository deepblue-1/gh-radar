/**
 * D-13: KIS 등락률 순위 API 실증 테스트
 *
 * 사용법:
 *   cd workers/ingestion
 *   npx tsx -r dotenv/config scripts/empirical-test.ts
 *
 * 출력:
 *   .planning/phases/01-data-foundation/kis-response-{날짜}.json
 *
 * 휴장일(주말/공휴일)과 거래일 각 1회 실행하여 응답 차이를 비교한다.
 */
import axios from "axios";
import fs from "fs";
import path from "path";

const KIS_BASE_URL =
  process.env.KIS_BASE_URL ?? "https://openapi.koreainvestment.com:9443";
const APP_KEY = process.env.KIS_APP_KEY;
const APP_SECRET = process.env.KIS_APP_SECRET;

if (!APP_KEY || !APP_SECRET) {
  console.error("KIS_APP_KEY and KIS_APP_SECRET must be set in .env");
  process.exit(1);
}

const OUTPUT_DIR = path.resolve(
  __dirname,
  "../../../.planning/phases/01-data-foundation"
);

async function getToken(): Promise<string> {
  const res = await axios.post(`${KIS_BASE_URL}/oauth2/tokenP`, {
    grant_type: "client_credentials",
    appkey: APP_KEY,
    appsecret: APP_SECRET,
  });
  console.log("Token response keys:", Object.keys(res.data));
  console.log("token_type:", res.data.token_type);
  console.log("expires_in:", res.data.expires_in);
  console.log(
    "access_token_token_expired:",
    res.data.access_token_token_expired
  );
  return res.data.access_token;
}

async function fetchRanking(
  token: string,
  marketCode: string,
  marketName: string
) {
  console.log(`\n--- ${marketName} 등락률 순위 조회 ---`);

  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    appkey: APP_KEY!,
    appsecret: APP_SECRET!,
    "content-type": "application/json; charset=utf-8",
    tr_id: "FHPST01700000",
    custtype: "P",
  };

  const params: Record<string, string> = {
    fid_cond_mrkt_div_code: marketCode,
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
  };

  try {
    const res = await axios.get(
      `${KIS_BASE_URL}/uapi/domestic-stock/v1/ranking/fluctuation`,
      { headers, params }
    );

    const data = res.data;
    console.log("rt_cd:", data.rt_cd);
    console.log("msg_cd:", data.msg_cd);
    console.log("msg1:", data.msg1);

    if (data.output && data.output.length > 0) {
      console.log(`output 행 수: ${data.output.length}`);
      console.log("첫 행 키:", Object.keys(data.output[0]));
      console.log("첫 행 샘플:", JSON.stringify(data.output[0], null, 2));

      if (data.output.length > 1) {
        console.log("2번째 행 샘플:", JSON.stringify(data.output[1], null, 2));
      }
    } else {
      console.log("output이 비어있거나 없음");
      console.log("전체 응답 키:", Object.keys(data));
    }

    return data;
  } catch (err: any) {
    console.error(`${marketName} 조회 실패:`, err.response?.data ?? err.message);
    return { error: err.response?.data ?? err.message };
  }
}

function sanitize(data: any): any {
  const json = JSON.stringify(data);
  const sanitized = json
    .replace(new RegExp(APP_KEY!, "g"), "[APP_KEY]")
    .replace(new RegExp(APP_SECRET!.slice(0, 20), "g"), "[APP_SECRET_PREFIX]");
  return JSON.parse(sanitized);
}

async function main() {
  console.log("=== KIS 등락률 순위 API 실증 테스트 ===");
  console.log(`Base URL: ${KIS_BASE_URL}`);
  console.log(`시각: ${new Date().toISOString()}`);
  console.log(`요일: ${["일", "월", "화", "수", "목", "금", "토"][new Date().getDay()]}요일`);
  console.log();

  const token = await getToken();
  console.log("토큰 발급 성공 (길이:", token.length, ")");

  const kospiData = await fetchRanking(token, "J", "KOSPI");
  const kosdaqData = await fetchRanking(token, "Q", "KOSDAQ");

  const now = new Date();
  const day = now.getDay();
  const dateStr = now.toISOString().slice(0, 10);
  const isWeekend = day === 0 || day === 6;
  const suffix = isWeekend ? "weekend" : "trading-day";
  const filename = `kis-response-${suffix}-${dateStr}.json`;

  const output = sanitize({
    capturedAt: now.toISOString(),
    isWeekend,
    dayOfWeek: ["일", "월", "화", "수", "목", "금", "토"][day],
    baseUrl: KIS_BASE_URL,
    kospi: kospiData,
    kosdaq: kosdaqData,
  });

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outPath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n결과 저장: ${outPath}`);

  console.log("\n=== 요약 ===");
  console.log(`KOSPI 행 수: ${kospiData.output?.length ?? "N/A"}`);
  console.log(`KOSDAQ 행 수: ${kosdaqData.output?.length ?? "N/A"}`);

  if (kospiData.output?.[0]) {
    const row = kospiData.output[0];
    console.log("\n필드 매핑 후보:");
    console.log(`  종목명 → ${row.hts_kor_isnm ?? "?"}`);
    console.log(`  종목코드 → ${row.mksc_shrn_iscd ?? row.stck_shrn_iscd ?? "?"}`);
    console.log(`  현재가 → ${row.stck_prpr ?? "?"}`);
    console.log(`  등락률 → ${row.prdy_ctrt ?? "?"}`);
    console.log(`  거래량 → ${row.acml_vol ?? "?"}`);
    console.log(`  상한가 → ${row.stck_mxpr ?? "?"}`);
    console.log(`  하한가 → ${row.stck_llam ?? "?"}`);
    console.log(`  영업일 → ${row.bsop_date ?? "bsop_date 없음"}`);
  }
}

main().catch((err) => {
  console.error("실증 테스트 실패:", err);
  process.exit(1);
});
