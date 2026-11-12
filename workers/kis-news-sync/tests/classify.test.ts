import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { newsTitleKey } from "@gh-radar/shared";

import type { KisNewsTitleRow } from "../src/kis/types";
import {
  AUTO_MARKET_NEWS_PATTERNS,
  DERIVATIVE_NOTICE_PATTERN,
  DISCLOSURE_PROVIDERS,
  isAutoMarketNews,
  toIngestRows,
  writtenAtOf,
  type StockMeta,
} from "../src/pipeline/classify";

// ── 2026-11-11 실측 표본(41-06) ─────────────────────────────────────
interface SampleStep {
  params?: Record<string, string>;
  output?: KisNewsTitleRow[];
}
const SAMPLE = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "fixtures/kis-news-title-sample.json"), "utf8"),
) as { steps: Record<string, SampleStep> };

/** 모든 단계의 output 을 일련번호로 모은 고유 행(350). */
function uniqueSampleRows(): KisNewsTitleRow[] {
  const bySrno = new Map<string, KisNewsTitleRow>();
  for (const step of Object.values(SAMPLE.steps)) {
    for (const r of step.output ?? []) bySrno.set(r.cntt_usiq_srno, r);
  }
  return [...bySrno.values()];
}

const SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
function codesOf(r: KisNewsTitleRow): string[] {
  return SLOTS.map((i) => r[`iscd${i}` as keyof KisNewsTitleRow].trim()).filter((c) => c !== "");
}

/** 표본에서 만든 종목 정보 — 코드 → kor_isnm 이름 · 그룹 「주권」. */
function sampleMeta(): Map<string, StockMeta> {
  const meta = new Map<string, StockMeta>();
  for (const r of uniqueSampleRows()) {
    for (const i of SLOTS) {
      const code = r[`iscd${i}` as keyof KisNewsTitleRow].trim();
      if (code) meta.set(code, { name: r[`kor_isnm${i}` as keyof KisNewsTitleRow].trim(), group: "주권" });
    }
  }
  return meta;
}

// ── 합성 행 ─────────────────────────────────────────────────────────
function mkRow(over: Partial<KisNewsTitleRow> = {}): KisNewsTitleRow {
  const base: Record<string, string> = {
    cntt_usiq_srno: "2026111209143512345",
    news_ofer_entp_code: "G",
    data_dt: "20261112",
    data_tm: "091435",
    hts_pbnt_titl_cntt: "(주)가람전자 단일판매ㆍ공급계약체결",
    news_lrdv_code: "01",
    dorg: "코스닥 공시",
  };
  for (const i of SLOTS) {
    base[`iscd${i}`] = "";
    base[`kor_isnm${i}`] = " ";
  }
  base.iscd1 = "012340";
  base.kor_isnm1 = "가람전자";
  return { ...(base as unknown as KisNewsTitleRow), ...over };
}

const META = new Map<string, StockMeta>([
  ["012340", { name: "가람전자", group: "주권" }],
  ["069500", { name: "KODEX 200", group: "ETF" }],
  ["122630", { name: "KODEX 레버리지", group: "주권" }],
  ["439730", { name: "OO스팩1호", group: "주권" }],
  ["0011T0", { name: "신규영문코드", group: "주권" }],
  ["005930", { name: "삼성전자", group: "주권" }],
]);

describe("toIngestRows — 실측 표본(2026-11-11)", () => {
  it("D-07: 고유 350행 중 종목코드가 붙은 글만 행이 된다(140) · 나머지는 unlinked", () => {
    const raw = uniqueSampleRows();
    expect(raw).toHaveLength(350);
    const linkedCount = raw.filter((r) => codesOf(r).length > 0).length;

    const { rows, stats } = toIngestRows(raw, { meta: sampleMeta() });

    expect(linkedCount).toBe(140);
    expect(rows).toHaveLength(linkedCount);
    expect(stats).toEqual({ total: 350, unlinked: 350 - linkedCount, unknownCodes: 0, invalid: 0 });
    expect(rows.every((r) => r.links.length > 0)).toBe(true);
    const noCode = new Set(raw.filter((r) => codesOf(r).length === 0).map((r) => r.cntt_usiq_srno));
    expect(rows.some((r) => noCode.has(r.srno))).toBe(false);
  });

  it("D-11 · Pitfall 2: 005930 종목별 조회 40행은 전부 005930 에 연결되고 iscd1 의 다른 코드도 연결된다", () => {
    const step = SAMPLE.steps.stock_005930;
    expect(step.params).toEqual({ FID_INPUT_ISCD: "005930" });
    const raw = step.output ?? [];
    expect(raw).toHaveLength(40);

    const { rows, stats } = toIngestRows(raw, { queriedCode: "005930", meta: sampleMeta() });

    expect(rows).toHaveLength(40);
    expect(stats.unlinked).toBe(0);
    for (const row of rows) expect(row.links.map((l) => l.code)).toContain("005930");
    const others = raw.filter((r) => r.iscd1.trim() !== "005930");
    expect(others.length).toBe(19);
    for (const r of others) {
      const row = rows.find((x) => x.srno === r.cntt_usiq_srno)!;
      expect(row.links.map((l) => l.code).sort()).toEqual(["005930", r.iscd1.trim()].sort());
    }
  });

  it("공시(F · G) 13건 → kind disclosure · source 「거래소 공시」/「코스닥 공시」", () => {
    const { rows } = toIngestRows(uniqueSampleRows(), { meta: sampleMeta() });
    const disc = rows.filter((r) => r.kind === "disclosure");
    expect(disc).toHaveLength(13);
    expect(disc.filter((r) => r.provider_code === "F").every((r) => r.source === "거래소 공시")).toBe(true);
    expect(disc.filter((r) => r.provider_code === "G").every((r) => r.source === "코스닥 공시")).toBe(true);
    expect(disc.filter((r) => r.provider_code === "F")).toHaveLength(2);
    expect(rows.filter((r) => r.kind === "news").every((r) => r.provider_code !== "F" && r.provider_code !== "G")).toBe(true);
    expect(DISCLOSURE_PROVIDERS).toEqual({ F: "거래소 공시", G: "코스닥 공시" });
  });

  it("시장 조치 「공매도 과열종목 지정」 · 「(정정)단일판매ㆍ공급계약체결」 공시는 숨기지 않는다", () => {
    const { rows } = toIngestRows(uniqueSampleRows(), { meta: sampleMeta() });
    const shortSell = rows.filter((r) => r.title.includes("공매도 과열종목 지정(공매도 거래 금지 적용)"));
    const corrected = rows.filter((r) => r.title.includes("(정정)단일판매ㆍ공급계약체결"));
    expect(shortSell.length).toBe(6);
    expect(corrected.length).toBe(1);
    for (const r of [...shortSell, ...corrected]) {
      expect(r.links.every((l) => l.hidden_reason === null)).toBe(true);
    }
  });

  it("작성 시각: 서울경제 3건은 일련번호 앞 14자리와 달라도 data_dt + data_tm 을 쓴다", () => {
    const raw = uniqueSampleRows();
    const mismatched = raw.filter((r) => r.cntt_usiq_srno.slice(0, 14) !== r.data_dt + r.data_tm);
    expect(mismatched).toHaveLength(3);
    expect(mismatched.every((r) => r.dorg.trim() === "서울경제")).toBe(true);

    const { rows } = toIngestRows(raw, { meta: sampleMeta() });
    const r1 = rows.find((r) => r.srno === "2026111117305105916")!;
    expect(r1.written_at).toBe("2026-11-11T18:41:38+09:00");
    for (const m of mismatched) {
      const row = rows.find((r) => r.srno === m.cntt_usiq_srno)!;
      expect(row.written_at).toBe(writtenAtOf(m.data_dt, m.data_tm));
    }
  });
});

describe("writtenAtOf — data_dt + data_tm (KST)", () => {
  it("20261111 · 210335 → 2026-11-11T21:03:35+09:00", () => {
    expect(writtenAtOf("20261111", "210335")).toBe("2026-11-11T21:03:35+09:00");
    expect(Date.parse(writtenAtOf("20261111", "210335")!)).toBe(Date.parse("2026-11-11T12:03:35Z"));
  });

  it("잘못된 날짜 · 시각은 null", () => {
    expect(writtenAtOf("20261340", "100000")).toBeNull();
    expect(writtenAtOf("20260230", "100000")).toBeNull();
    expect(writtenAtOf("20261111", "250000")).toBeNull();
    expect(writtenAtOf("20261111", "106000")).toBeNull();
    expect(writtenAtOf("", "")).toBeNull();
    expect(writtenAtOf("2026111", "21033")).toBeNull();
    expect(writtenAtOf("abcdefgh", "210335")).toBeNull();
  });

  it("잘못된 날짜의 글은 행에서 빠지고 stats.invalid 로 센다", () => {
    const { rows, stats } = toIngestRows(
      [mkRow({ data_dt: "20261340" }), mkRow({ cntt_usiq_srno: "2026111209143599999" })],
      { meta: META },
    );
    expect(rows.map((r) => r.srno)).toEqual(["2026111209143599999"]);
    expect(stats).toEqual({ total: 2, unlinked: 0, unknownCodes: 0, invalid: 1 });
  });
});

describe("toIngestRows — D-09 숨김 사유", () => {
  it.each([
    ["(주)OO증권 ELW 권리행사 결과", "G"],
    ["(주)OO ETN 신규상장", "F"],
    ["주식선물 상장 안내", "F"],
    ["OO 상장지수펀드 상장폐지 안내", "F"],
    ["주식워런트증권 신규상장", "G"],
  ])("파생 안내 공시 「%s」 → derivative_notice", (title, provider) => {
    const { rows } = toIngestRows([mkRow({ hts_pbnt_titl_cntt: title, news_ofer_entp_code: provider })], { meta: META });
    expect(rows).toHaveLength(1);
    expect(rows[0].links).toEqual([{ code: "012340", hidden_reason: "derivative_notice" }]);
  });

  it("회사 공시 「파생상품거래손실발생」 · 「주식등의대량보유상황보고서」 는 숨기지 않는다", () => {
    const { rows } = toIngestRows(
      [
        mkRow({ cntt_usiq_srno: "1", hts_pbnt_titl_cntt: "(주)가람전자 파생상품거래손실발생" }),
        mkRow({ cntt_usiq_srno: "2", hts_pbnt_titl_cntt: "주식등의대량보유상황보고서(일반)" }),
      ],
      { meta: META },
    );
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.links).toEqual([{ code: "012340", hidden_reason: null }]);
    expect(DERIVATIVE_NOTICE_PATTERN.test("파생상품거래손실발생")).toBe(false);
  });

  it("뉴스(언론사) 제목에는 파생 안내 규칙을 적용하지 않는다", () => {
    const { rows } = toIngestRows(
      [mkRow({ news_ofer_entp_code: "6", dorg: "연합뉴스", hts_pbnt_titl_cntt: "가람전자 ETF 편입 기대에 강세" })],
      { meta: META },
    );
    expect(rows[0].kind).toBe("news");
    expect(rows[0].links).toEqual([{ code: "012340", hidden_reason: null }]);
  });

  it("ETP: 그룹 ETF 종목 · 이름 「KODEX 레버리지」 종목 연결 → etp (shared isEtpProduct)", () => {
    const { rows } = toIngestRows(
      [
        mkRow({ cntt_usiq_srno: "1", news_ofer_entp_code: "6", dorg: "연합뉴스", hts_pbnt_titl_cntt: "코스피 강세", iscd1: "069500" }),
        mkRow({ cntt_usiq_srno: "2", news_ofer_entp_code: "6", dorg: "연합뉴스", hts_pbnt_titl_cntt: "코스피 강세2", iscd1: "122630" }),
      ],
      { meta: META },
    );
    expect(rows.map((r) => r.links)).toEqual([
      [{ code: "069500", hidden_reason: "etp" }],
      [{ code: "122630", hidden_reason: "etp" }],
    ]);
  });

  it("스팩 종목 연결은 숨기지 않는다", () => {
    const { rows } = toIngestRows(
      [mkRow({ news_ofer_entp_code: "6", dorg: "연합뉴스", hts_pbnt_titl_cntt: "OO스팩1호 합병 결의", iscd1: "439730" })],
      { meta: META },
    );
    expect(rows[0].links).toEqual([{ code: "439730", hidden_reason: null }]);
  });

  it("종목별 조회 연결도 연결마다 따로 판정한다(조회 종목 일반 · 표시 종목 ETF)", () => {
    const { rows } = toIngestRows([mkRow({ news_ofer_entp_code: "6", dorg: "연합뉴스", hts_pbnt_titl_cntt: "지수 강세", iscd1: "069500" })], {
      queriedCode: "005930",
      meta: META,
    });
    expect(rows[0].links).toEqual([
      { code: "005930", hidden_reason: null },
      { code: "069500", hidden_reason: "etp" },
    ]);
  });
});

describe("toIngestRows — 재료 없는 자동 기사(auto_market · 2026-11-12 UAT)", () => {
  const news = (title: string, over: Partial<KisNewsTitleRow> = {}): KisNewsTitleRow =>
    mkRow({ news_ofer_entp_code: "4", dorg: "서울경제", hts_pbnt_titl_cntt: title, ...over });

  it.each([
    "<코>비큐AI, 상한가 진입.. +29.90% ↑",
    "<유>티와이홀딩스우, 하한가 이탈.. -27.10% ↓",
    "GST(083450) 소폭 상승세 +3.19%, 외국계 매수 유입, 3거래일 연속 상승",
    "네패스(033640) 상승폭 확대 +6.65%",
    "샘씨엔에스(252990) 급등세 기록중 +20.31%, 3거래일 연속 상승",
    "썸에이지(208640) 상한가 진입, 이틀째 상한가",
    "디아이(003160)  +6.51%, 에프에스티 +5.50%, 테크윙 +4.21%, 케이씨 +3.67%, 티씨케이 +3.65%",
    "TIGER 코스닥액티브(0204S0) - 인포스탁 모닝 브리핑 (2026.11.09)",
    "오후 3:21 현재 코스닥은 55:45으로 매도우위, 매도강세 업종은 출판?매체복제업(0.13%↑)",
    "[개장 시황] 코스피 5,385.94.. 개인과 외국인의 순매수에 상승 출발 (▲10.58, +0.20%)",
    "[마감 시황]  기관 매수 우위.. 코스닥 667.61(▲28.64, +4.48%) 상승 마감",
    "의료정밀업(+6.74%↑)이 강세인 가운데, 코스피도 상승 흐름(+4.36%↑)",
    "기계?장비업(-7.72%↓)이 약세인 가운데, 코스닥도 하락 흐름(-3.22%↓)",
    "증시요약(6) - 특징 상한가 및 급등종목",
    "코스닥 상승률 상위 20종목(직전 30분 기준)",
    "외국계 순매수,도 상위종목(코스닥) 수량기준",
    "1억원 이상 매수체결 상위 20 종목(코스닥)",
    "코스피 외국인 순매수,도 상위20종목",
    "오전장 기술적 분석 특징주 A(코스피)",
    "오전장 특징주★(코스닥)",
    "개장전★주요이슈 점검",
    "변동성완화장치(VI) 발동 종목, 발동시간 기준",
    "전일대비 거래량 급증 종목(코스피)",
    "종가 동시호가 특이 종목(코스피/코스닥)",
    "전일자 주요 지분 변동 공시",
    "[표]11월 11일 52주 신고가 종목 및 최근 동향",
    "오늘의 메모[11월 12일]",
    "기업 공시 [11월 11일]",
    "[장중수급포착] 지니언스, 기관 5일 연속 순매수행진... 주가 +19.60%",
    "[장중수급포착] DB하이텍, 외국인/기관 동시 순매수… 주가 +9.92%",
    "'에스텍' 52주 신고가 경신, 외국인 3일 연속 순매수(1.9만주)",
  ])("「%s」 → auto_market", (title) => {
    expect(isAutoMarketNews(title)).toBe(true);
    const { rows } = toIngestRows([news(title)], { meta: META });
    expect(rows[0].kind).toBe("news");
    expect(rows[0].links).toEqual([{ code: "012340", hidden_reason: "auto_market" }]);
  });

  it.each([
    "비큐AI, 퓨리오사AI 대박에 순익 흑자…\"엔트로픽·오픈AI 저작권 리스크 반사이익\"",
    "비큐AI 주가, 상한가... 이유는?",
    "[특징주] JYP엔터, 스트레이키즈 활약 등 호실적에 장초반 20% 급등",
    "'보안주' 지니언스 20%대 급등…3Q 영업익 253% 급증",
    "'타이거일렉' 52주 신고가 경신, 범상치않은 성장의 시작 - 메리츠증권, BUY(신규)",
    "AI데이터센터 수혜 기대…외국인, 네이버 쓸어담아",
    "후성 수주공시 - 화학 제품 공급 계약 711.9억원 (매출액대비  15.10 %)",
    "인텍플러스, 400.64억원 규모 공급계약(반도체 및 Substrate 검사 장비) 체결",
    "HPSP, 보통주 74,000주(25.49억원) 규모 자사주 처분 결정",
    "[리포트 브리핑]JYP Ent., '저력은 확인했다, 이제는 성장의 확장' 목표가 50,000원 - 삼성증권",
    "[IR일정] 지니언스, 한국투자증권 2026 Corporate Day",
    "대형주도 못 피한 급락장…상장사 844곳 ‘연중 최저가’ [이런국장 저런주식]",
    "삼성전자(005930), 3분기 영업익 12조…시장 기대 웃돌아",
  ])("재료 · 리포트 뉴스 「%s」 는 숨기지 않는다", (title) => {
    expect(isAutoMarketNews(title)).toBe(false);
    const { rows } = toIngestRows([news(title)], { meta: META });
    expect(rows[0].links).toEqual([{ code: "012340", hidden_reason: null }]);
  });

  it("한 글에 붙은 종목 연결은 전부 숨긴다(다른 종목의 상한가 기사가 따라붙는 문제)", () => {
    const { rows } = toIngestRows([news("<코>썸에이지, 상한가 진입.. +30.00% ↑", { iscd2: "005930", iscd3: "0011T0" })], { meta: META });
    expect(rows[0].links).toEqual([
      { code: "012340", hidden_reason: "auto_market" },
      { code: "005930", hidden_reason: "auto_market" },
      { code: "0011T0", hidden_reason: "auto_market" },
    ]);
  });

  it("공시에는 적용하지 않는다 · ETP 종목 연결은 etp 가 먼저다", () => {
    const { rows } = toIngestRows(
      [
        mkRow({ cntt_usiq_srno: "1", hts_pbnt_titl_cntt: "코스닥 상승률 상위 20종목 관련 안내" }),
        news("<유>KODEX 200, 상한가 진입.. +29.90% ↑", { cntt_usiq_srno: "2", iscd1: "069500", iscd2: "012340" }),
      ],
      { meta: META },
    );
    expect(rows[0].kind).toBe("disclosure");
    expect(rows[0].links).toEqual([{ code: "012340", hidden_reason: null }]);
    expect(rows[1].links).toEqual([
      { code: "069500", hidden_reason: "etp" },
      { code: "012340", hidden_reason: "auto_market" },
    ]);
  });

  it("소급 마이그레이션의 정규식 배열이 이 목록과 글자까지 같다(순서 포함)", () => {
    const dir = path.resolve(__dirname, "../../../supabase/migrations");
    // 목록을 바꿀 때마다 소급 마이그레이션을 새로 낸다 — 가장 최근 것과 대조한다.
    const sql = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
      .filter((text) => text.includes("'auto_market'") && text.includes("~ ANY (ARRAY["))
      .at(-1);
    expect(sql).toBeDefined();
    if (sql === undefined) return;
    const body = sql.slice(sql.indexOf("~ ANY (ARRAY[") + "~ ANY (ARRAY[".length, sql.indexOf("\n   ]);"));
    const inSql = body
      .split("\n")
      .map((l) => l.trim().replace(/,$/, ""))
      .filter((l) => l.startsWith("'"))
      .map((l) => l.slice(1, -1));
    expect(inSql).toEqual(AUTO_MARKET_NEWS_PATTERNS.map((p) => p.source));
  });

  it("Postgres 와 다르게 읽히는 문법을 쓰지 않는다", () => {
    for (const p of AUTO_MARKET_NEWS_PATTERNS) {
      expect(p.flags).toBe("");
      expect(p.source).not.toMatch(/\\[dswbDSWB]|\(\?|'|\//);
    }
  });
});

describe("toIngestRows — 코드 · 연결", () => {
  it("kor_isnm1 이 공백 한 칸 · iscd1 이 빈 칸이면 연결 없음 → 행 제외 · unlinked", () => {
    const { rows, stats } = toIngestRows([mkRow({ iscd1: "", kor_isnm1: " " })], { meta: META });
    expect(rows).toEqual([]);
    expect(stats).toEqual({ total: 1, unlinked: 1, unknownCodes: 0, invalid: 0 });
  });

  it("코드는 trim · 대문자 · SHORT_CODE_RE — 모양 위반 · 종목 정보에 없는 코드는 unknownCodes 로 세고 연결 안 함", () => {
    const { rows, stats } = toIngestRows(
      [
        mkRow({ cntt_usiq_srno: "1", iscd1: " 0011t0 " }),
        mkRow({ cntt_usiq_srno: "2", iscd1: "999999" }),
        mkRow({ cntt_usiq_srno: "3", iscd1: "12AB" }),
      ],
      { meta: META },
    );
    expect(rows.map((r) => [r.srno, r.links])).toEqual([["1", [{ code: "0011T0", hidden_reason: null }]]]);
    expect(stats).toEqual({ total: 3, unlinked: 2, unknownCodes: 2, invalid: 0 });
  });

  it("iscd2..10 도 연결하고 조회 코드와 겹치면 한 번만", () => {
    const { rows } = toIngestRows([mkRow({ iscd1: "005930", iscd2: "012340", iscd3: "005930" })], {
      queriedCode: "005930",
      meta: META,
    });
    expect(rows[0].links.map((l) => l.code)).toEqual(["005930", "012340"]);
  });
});

describe("toIngestRows — 행 모양", () => {
  it("행 키 = srno · provider_code · source · kind · category · title · title_key · written_at · links", () => {
    const { rows } = toIngestRows([mkRow({ hts_pbnt_titl_cntt: "  (주)가람전자 단일판매ㆍ공급계약체결  " })], { meta: META });
    expect(Object.keys(rows[0]).sort()).toEqual(
      ["category", "kind", "links", "provider_code", "source", "srno", "title", "title_key", "written_at"].sort(),
    );
    expect(rows[0]).toEqual({
      srno: "2026111209143512345",
      provider_code: "G",
      source: "코스닥 공시",
      kind: "disclosure",
      category: "01",
      title: "(주)가람전자 단일판매ㆍ공급계약체결",
      title_key: newsTitleKey("(주)가람전자 단일판매ㆍ공급계약체결"),
      written_at: "2026-11-12T09:14:35+09:00",
      links: [{ code: "012340", hidden_reason: null }],
    });
  });

  it("빈 제목 · 정규화 키가 빈 제목은 행에서 빠지고 invalid 로 센다", () => {
    const { rows, stats } = toIngestRows(
      [mkRow({ cntt_usiq_srno: "1", hts_pbnt_titl_cntt: "   " }), mkRow({ cntt_usiq_srno: "2", hts_pbnt_titl_cntt: "…!!" })],
      { meta: META },
    );
    expect(rows).toEqual([]);
    expect(stats.invalid).toBe(2);
  });

  it("source: dorg 가 비면 F/G 는 표의 이름 · 그 밖은 제공업체 코드", () => {
    const { rows } = toIngestRows(
      [
        mkRow({ cntt_usiq_srno: "1", news_ofer_entp_code: "F", dorg: " " }),
        mkRow({ cntt_usiq_srno: "2", news_ofer_entp_code: "6", dorg: "", hts_pbnt_titl_cntt: "가람전자 강세" }),
        mkRow({ cntt_usiq_srno: "3", news_ofer_entp_code: "6", dorg: " 연합뉴스 ", hts_pbnt_titl_cntt: "가람전자 강세2" }),
      ],
      { meta: META },
    );
    expect(rows.map((r) => r.source)).toEqual(["거래소 공시", "6", "연합뉴스"]);
  });
});
