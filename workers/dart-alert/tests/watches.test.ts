import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DartRow } from "../src/dart/client";
import { EXCHANGE_POLL_MS, RIGHTS_REGULAR_POLL_MS, SLOW_POLL_MS } from "../src/cadence";
import { collectOnce, newLapState, type InsertItem, type LapDeps } from "../src/lap";
import {
  b001Kind,
  buildWatches,
  compactName,
  DEFAULT_B001_KINDS,
  B001_ORIGINAL_ONLY_KINDS,
  I003_KINDS,
  I004_KINDS,
  isCorrection,
  judgeRow,
  matchesKind,
  stripReportTags,
  type JudgeOptions,
  type Watch,
} from "../src/watches";

/**
 * Phase 43-09 — 감시 대상 판정 전수(D-01 · D-03 ~ D-05 · 가정 1).
 *
 * 픽스처 `fixtures/dart/list-b001-000.json` 의 보고서명은 OpenDART 문서 · 공개 사례 표기
 * (RESEARCH 「리서치 확인 7건」 1)를 따른 것이다 — 43-08 survey 결과로 대조(괄호 안 종류명 · 가운뎃점 「ㆍ」 ·
 * 꼬리표 뒤 공백 같은 실제 표기가 다르면 이 픽스처와 단언을 같이 맞춘다).
 */

const B001_FIXTURE = JSON.parse(readFileSync(join(__dirname, "fixtures/dart/list-b001-000.json"), "utf8")) as {
  list: DartRow[];
};

const INCLUDE: JudgeOptions = { b001Corrections: "include" };
const EXCLUDE: JudgeOptions = { b001Corrections: "exclude" };

const ALL = buildWatches({ b001Kinds: DEFAULT_B001_KINDS });
const byId = (id: Watch["id"]) => ALL.find((w) => w.id === id)!;
const TENDER = byId("tender_offer");
const RIGHTS = byId("rights_merger");
const MARKET = byId("market_action");
const EXCHANGE = byId("exchange_disclosure");
const HOLDER = byId("largest_holder_change");
const TRADE_PLAN = byId("insider_trade_plan");
/** DART 실제 표기 — 이름과 괄호 꼬리 사이 공백 14칸 */
const SP14 = " ".repeat(14);

let seq = 0;
function row(over: Partial<DartRow> = {}): DartRow {
  seq += 1;
  return {
    corp_code: "00930001",
    corp_name: "시험상사",
    stock_code: "123456",
    corp_cls: "K",
    report_nm: "공개매수신고서",
    rcept_no: `2026111130${String(seq).padStart(4, "0")}`,
    flr_nm: "시험상사",
    rcept_dt: "20261111",
    rm: "코",
    ...over,
  };
}

function fixtureRow(reportNm: string): DartRow {
  const r = B001_FIXTURE.list.find((x) => x.report_nm === reportNm);
  if (!r) throw new Error(`fixture row missing: ${reportNm}`);
  return r;
}

describe("buildWatches — 여섯 감시 대상(D-03 · 261113-iez · rn7 키 2개 · U-1)", () => {
  it("순서 = 우선순위: D004 p0 · B001 p1(키 1) / I003 p2 · I001 p3 · I004 p4 · D005 p5(키 2) — 간격 · 이름 규칙 · 제출인", () => {
    const ws = buildWatches({ b001Kinds: DEFAULT_B001_KINDS });
    expect(ws.map((w) => [w.id, w.pblntfDetailTy, w.key, w.priority])).toEqual([
      ["tender_offer", "D004", 1, 0],
      ["rights_merger", "B001", 1, 1],
      ["market_action", "I003", 2, 2],
      ["exchange_disclosure", "I001", 2, 3],
      ["largest_holder_change", "I004", 2, 4],
      ["insider_trade_plan", "D005", 2, 5],
    ]);
    expect(ws[0]).toEqual({
      id: "tender_offer",
      key: 1,
      pblntfDetailTy: "D004",
      priority: 0,
      everyMs: null,
      rule: { form: "any" },
      alwaysShowFiler: true,
    });
    expect(ws[1]).toEqual({
      id: "rights_merger",
      key: 1,
      pblntfDetailTy: "B001",
      priority: 1,
      everyMs: RIGHTS_REGULAR_POLL_MS,
      preopenEveryMs: null,
      rule: { form: "b001", kinds: DEFAULT_B001_KINDS, originalOnly: new Set(["자기주식취득결정", "주식교환ㆍ이전결정"]) },
      alwaysShowFiler: false,
    });
    expect(ws[2]).toEqual({
      id: "market_action",
      key: 2,
      pblntfDetailTy: "I003",
      priority: 2,
      everyMs: SLOW_POLL_MS,
      rule: { form: "plain", exact: I003_KINDS, prefix: [] },
      alwaysShowFiler: false,
      hideFiler: true,
    });
    expect(ws[3]).toMatchObject({ id: "exchange_disclosure", everyMs: EXCHANGE_POLL_MS, rule: { form: "plain" }, alwaysShowFiler: false });
    expect(ws[3].hideFiler).toBeUndefined();
    expect(ws[4]).toEqual({
      id: "largest_holder_change",
      key: 2,
      pblntfDetailTy: "I004",
      priority: 4,
      everyMs: SLOW_POLL_MS,
      rule: { form: "plain", exact: I004_KINDS, prefix: [] },
      alwaysShowFiler: false,
    });
    expect(ws[5]).toMatchObject({ id: "insider_trade_plan", everyMs: SLOW_POLL_MS, rule: { form: "plain" }, alwaysShowFiler: true });
    for (const w of ws.slice(1)) expect(w.preopenEveryMs === undefined || w.id === "rights_merger").toBe(true);
    expect(RIGHTS_REGULAR_POLL_MS).toBe(10_000);
    expect(EXCHANGE_POLL_MS).toBe(10_000);
    expect(SLOW_POLL_MS).toBe(30_000);
    expect(B001_ORIGINAL_ONLY_KINDS).toEqual(new Set(["자기주식취득결정", "주식교환ㆍ이전결정"]));
  });

  it("허용 목록 기본값은 6종이다(43-03 설정 기본값과 같은 상수 · 자기주식취득결정 · 주식교환ㆍ이전결정 추가)", () => {
    expect([...DEFAULT_B001_KINDS]).toEqual([
      "유상증자결정",
      "유무상증자결정",
      "회사합병결정",
      "회사분할합병결정",
      "자기주식취득결정",
      "주식교환ㆍ이전결정",
    ]);
  });

  it("b001Kinds 를 바꾸면 그 목록으로 판정한다 — 「무상증자결정」 을 더하면 send · 빼면 kind", () => {
    const wide = buildWatches({ b001Kinds: [...DEFAULT_B001_KINDS, "무상증자결정"] }).find((w) => w.id === "rights_merger")!;
    expect(wide.rule).toMatchObject({ form: "b001", kinds: [...DEFAULT_B001_KINDS, "무상증자결정"] });
    expect(judgeRow(wide, fixtureRow("주요사항보고서(무상증자결정)"), INCLUDE)).toEqual({ send: true });
    const narrow = buildWatches({ b001Kinds: ["회사합병결정"] }).find((w) => w.id === "rights_merger")!;
    expect(narrow.rule).toMatchObject({ form: "b001", kinds: ["회사합병결정"] });
    expect(judgeRow(narrow, fixtureRow("주요사항보고서(유상증자결정)"), INCLUDE)).toMatchObject({ send: false, reason: "near_miss" });
    expect(judgeRow(narrow, fixtureRow("[기재정정]주요사항보고서(회사합병결정)"), INCLUDE)).toEqual({ send: true });
  });
});

describe("보고서명 정리 — 꼬리표 · 정정 · 괄호 종류명(RESEARCH 확인 1)", () => {
  it("stripReportTags 는 맨 앞 대괄호 꼬리표를 반복해서 떼고 공백을 정리한다", () => {
    expect(stripReportTags("주요사항보고서(유상증자결정)")).toBe("주요사항보고서(유상증자결정)");
    expect(stripReportTags("[기재정정]주요사항보고서(회사합병결정)")).toBe("주요사항보고서(회사합병결정)");
    expect(stripReportTags("  [첨부정정][기재정정]   주요사항보고서  (회사분할합병결정) ")).toBe("주요사항보고서 (회사분할합병결정)");
    expect(stripReportTags("[발행조건확정] [기재정정]공개매수신고서")).toBe("공개매수신고서");
  });

  it("isCorrection 은 맨 앞 꼬리표가 있을 때만 true", () => {
    expect(isCorrection("[기재정정]주요사항보고서(회사합병결정)")).toBe(true);
    expect(isCorrection(" [첨부정정]주요사항보고서(유상증자결정)")).toBe(true);
    expect(isCorrection("주요사항보고서(유상증자결정)")).toBe(false);
    expect(isCorrection("주요사항보고서(유상증자결정)[기재정정]")).toBe(false);
  });

  it("b001Kind 는 괄호 안 종류명을 공백 없이 꺼내고, 주요사항보고서 꼴이 아니면 null", () => {
    expect(b001Kind("주요사항보고서(유상증자결정)")).toBe("유상증자결정");
    expect(b001Kind("[첨부정정][기재정정] 주요사항보고서 (회사분할합병결정)")).toBe("회사분할합병결정");
    expect(b001Kind("주요사항보고서( 유무상 증자결정 )")).toBe("유무상증자결정");
    expect(b001Kind("주요사항보고서(주식교환ㆍ이전결정)")).toBe("주식교환ㆍ이전결정");
    expect(b001Kind("주요사항보고서")).toBeNull();
    expect(b001Kind("합병등종료보고서(합병)")).toBeNull();
  });
});

describe("공개매수(D004) — 이름으로 거르지 않는다(D-01)", () => {
  const names = [
    "공개매수신고서",
    "공개매수설명서",
    "[기재정정]공개매수신고서",
    "의견표명서",
    "공개매수결과보고서",
    "공개매수에관한의견표명서(처음보는표기)",
  ];
  it.each(names)("「%s」 → send (정정 스위치 include)", (name) => {
    expect(judgeRow(TENDER, row({ report_nm: name }), INCLUDE)).toEqual({ send: true });
  });

  it("주요사항보고서 정정 스위치가 exclude 여도 공개매수 정정은 send", () => {
    expect(judgeRow(TENDER, row({ report_nm: "[기재정정]공개매수신고서" }), EXCLUDE)).toEqual({ send: true });
    expect(judgeRow(TENDER, row({ report_nm: "[첨부정정][기재정정]공개매수설명서" }), EXCLUDE)).toEqual({ send: true });
  });
});

describe("주요사항보고서(B001) — 허용 목록 완전 일치(D-03 · D-04)", () => {
  const sends = [
    "주요사항보고서(유상증자결정)",
    "주요사항보고서(유무상증자결정)",
    "[기재정정]주요사항보고서(회사합병결정)",
    "[첨부정정][기재정정] 주요사항보고서 (회사분할합병결정)",
    "주요사항보고서(주식교환ㆍ이전결정)",
    "주요사항보고서(자기주식취득결정)",
  ];
  it.each(sends)("「%s」 → send", (name) => {
    expect(judgeRow(RIGHTS, fixtureRow(name), INCLUDE)).toEqual({ send: true });
  });

  const kinds = [
    "주요사항보고서(무상증자결정)",
    "주요사항보고서(회사분할결정)",
    "주요사항보고서(전환사채권발행결정)",
    "주요사항보고서(영업양수결정)",
  ];
  it.each(kinds)("「%s」 → kind (보내지 않음)", (name) => {
    expect(judgeRow(RIGHTS, fixtureRow(name), INCLUDE)).toEqual({ send: false, reason: "kind" });
  });

  it("목록 밖인데 「합병」 · 「증자」 가 든 이름 → near_miss(종류명을 싣는다)", () => {
    expect(judgeRow(RIGHTS, fixtureRow("주요사항보고서(합병종료결정)"), INCLUDE)).toEqual({
      send: false,
      reason: "near_miss",
      kind: "합병종료결정",
    });
    expect(judgeRow(RIGHTS, row({ report_nm: "주요사항보고서(감자및증자결정)" }), INCLUDE)).toEqual({
      send: false,
      reason: "near_miss",
      kind: "감자및증자결정",
    });
    // 괄호 꼴이 아닌 이름은 꼬리표 뗀 이름 전체를 종류명 자리에 싣는다
    expect(judgeRow(RIGHTS, row({ report_nm: "[기재정정]합병관련주요사항보고서" }), INCLUDE)).toEqual({
      send: false,
      reason: "near_miss",
      kind: "합병관련주요사항보고서",
    });
  });

  it("「무상증자결정」 은 「증자」 를 품어도 D-04 가 이름으로 뺀 종류라 near_miss 가 아니라 kind(조용히 제외)", () => {
    expect(judgeRow(RIGHTS, fixtureRow("주요사항보고서(무상증자결정)"), INCLUDE)).toEqual({ send: false, reason: "kind" });
    expect(judgeRow(RIGHTS, row({ report_nm: "[기재정정]주요사항보고서(무상증자결정)" }), INCLUDE)).toEqual({
      send: false,
      reason: "kind",
    });
  });

  it("정정 스위치 exclude 면 정정 B001 → correction · 원본은 그대로 send", () => {
    expect(judgeRow(RIGHTS, fixtureRow("[기재정정]주요사항보고서(회사합병결정)"), EXCLUDE)).toEqual({
      send: false,
      reason: "correction",
    });
    expect(judgeRow(RIGHTS, fixtureRow("[첨부정정][기재정정] 주요사항보고서 (회사분할합병결정)"), EXCLUDE)).toEqual({
      send: false,
      reason: "correction",
    });
    expect(judgeRow(RIGHTS, fixtureRow("주요사항보고서(유상증자결정)"), EXCLUDE)).toEqual({ send: true });
  });
});

describe("주요사항보고서(B001) 새 2종 — 원본만(261113-iez 사용자 결정 ③ · 정정 규칙)", () => {
  it("자기주식취득결정 · 주식교환ㆍ이전결정 원본 → send", () => {
    expect(judgeRow(RIGHTS, row({ report_nm: "주요사항보고서(자기주식취득결정)" }), INCLUDE)).toEqual({ send: true });
    expect(judgeRow(RIGHTS, row({ report_nm: "주요사항보고서(주식교환ㆍ이전결정)" }), INCLUDE)).toEqual({ send: true });
  });

  it("새 2종의 정정은 b001Corrections=include 여도 correction · 기존 4종 정정은 include 면 그대로 send", () => {
    expect(judgeRow(RIGHTS, row({ report_nm: "[기재정정]주요사항보고서(자기주식취득결정)" }), INCLUDE)).toEqual({
      send: false,
      reason: "correction",
    });
    expect(judgeRow(RIGHTS, row({ report_nm: "[첨부정정]주요사항보고서(주식교환ㆍ이전결정)" }), INCLUDE)).toEqual({
      send: false,
      reason: "correction",
    });
    expect(judgeRow(RIGHTS, row({ report_nm: "[기재정정]주요사항보고서(유상증자결정)" }), INCLUDE)).toEqual({ send: true });
  });

  it("자기주식취득신탁계약체결결정은 목록 밖 → kind(near_miss 아님)", () => {
    expect(judgeRow(RIGHTS, row({ report_nm: "주요사항보고서(자기주식취득신탁계약체결결정)" }), INCLUDE)).toEqual({
      send: false,
      reason: "kind",
    });
  });
});

describe("거래소 수시공시(I001) — 원본 6종 + 배당 · 투자유의(261113-iez 사용자 결정 ① · rn7 U-1a)", () => {
  const sends = [
    "현금ㆍ현물배당결정 ",
    "현금ㆍ현물배당결정 (분기배당)",
    `현금ㆍ현물배당결정${SP14}(분기배당)`,
    "현금ㆍ현물배당결정(자회사의 주요경영사항) ",
    "현금ㆍ현물배당결정(자회사의 주요경영사항) (분기배당)",
    "투자유의안내 (관리종목지정 우려 예고)",
    `투자유의안내${SP14}(관리종목지정 우려 예고)`,
    "최대주주변경",
    "최대주주변경을수반하는주식양수도계약체결",
    "경영권변경등에관한계약체결",
    "단일판매ㆍ공급계약체결",
    "단일판매ㆍ공급계약체결(자율공시)",
    "주식소각결정",
    "투자판단관련주요경영사항",
    "투자판단관련주요경영사항              (최대주주 보유주식 가압류)",
    "투자판단관련주요경영사항(임상시험계획변경승인신청)",
  ];
  it.each(sends)("「%s」 → send", (name) => {
    expect(judgeRow(EXCHANGE, row({ report_nm: name, corp_cls: "Y" }), INCLUDE)).toEqual({ send: true });
    expect(judgeRow(EXCHANGE, row({ report_nm: name, corp_cls: "K" }), EXCLUDE)).toEqual({ send: true });
  });

  const kinds = [
    "최대주주변경을수반하는주식담보제공계약체결",
    "최대주주변경을수반하는주식담보제공계약해제ㆍ취소등",
    "주요사항보고서(자기주식취득신탁계약체결결정)(자회사의 주요경영사항)",
    "회사합병결정",
    "유상증자결정",
    "소송등의판결ㆍ결정 ((경영권분쟁소송)소송등의판결ㆍ결정)",
    // U-1a 「넣지 않는다」 — 배당 이름이 들어도 다른 종류
    "현금ㆍ현물배당을위한주주명부폐쇄(기준일)결정",
    "중간(분기)배당을위한주주명부폐쇄(기준일)결정",
    "부동산투자회사금전배당결정",
    "현금ㆍ현물배당을위한주주명부폐쇄(기준일)결정(자회사의 주요경영사항)",
  ];
  it.each(kinds)("「%s」 → kind (보내지 않음 · near_miss 아님)", (name) => {
    expect(judgeRow(EXCHANGE, row({ report_nm: name }), INCLUDE)).toEqual({ send: false, reason: "kind" });
  });

  const corrections = [
    "[기재정정]최대주주변경을수반하는주식양수도계약체결",
    "[첨부추가]최대주주변경",
    "[첨부정정]단일판매ㆍ공급계약체결(자율공시)",
    "[기재정정]현금ㆍ현물배당결정",
  ];
  it.each(corrections)("「%s」 → correction (include · exclude 둘 다)", (name) => {
    expect(judgeRow(EXCHANGE, row({ report_nm: name }), INCLUDE)).toEqual({ send: false, reason: "correction" });
    expect(judgeRow(EXCHANGE, row({ report_nm: name }), EXCLUDE)).toEqual({ send: false, reason: "correction" });
  });
});

describe("임원ㆍ주요주주 거래계획(D005) — 원본 2종(261113-iez 사용자 결정 ②)", () => {
  it("거래계획보고서 · 거래계획철회보고서 → send", () => {
    expect(judgeRow(TRADE_PLAN, row({ report_nm: "임원ㆍ주요주주특정증권등거래계획보고서" }), INCLUDE)).toEqual({ send: true });
    expect(judgeRow(TRADE_PLAN, row({ report_nm: "임원ㆍ주요주주특정증권등거래계획철회보고서" }), INCLUDE)).toEqual({ send: true });
  });

  it("정정 → correction · 소유상황보고서 → kind", () => {
    expect(judgeRow(TRADE_PLAN, row({ report_nm: "[기재정정]임원ㆍ주요주주특정증권등거래계획보고서" }), INCLUDE)).toEqual({
      send: false,
      reason: "correction",
    });
    expect(judgeRow(TRADE_PLAN, row({ report_nm: "임원ㆍ주요주주특정증권등소유상황보고서" }), INCLUDE)).toEqual({
      send: false,
      reason: "kind",
    });
  });
});

describe("거래소 시장조치(I003) — 허용 5종 · 원본만(261113-rn7 U-1b)", () => {
  // 괄호 앞 공백 1칸 표기 · 일부는 DART 실제 표기(공백 14칸)로 한 번씩 더
  const sends = [
    "기타시장안내(관리종목지정우려종목) (시가총액 200억원 미달)",
    `기타시장안내(관리종목지정우려종목)${SP14}(시가총액 200억원 미달)`,
    "기타시장안내(관리종목지정우려종목) (주가 1,000원 미달)",
    "주권매매거래정지 (상장적격성 실질심사 대상 (사유발생))",
    "주권매매거래정지 (주식의 병합, 분할 등 전자등록 변경, 말소)",
    `주권매매거래정지${SP14}(주식의 병합, 분할 등 전자등록 변경, 말소)`,
    "주권매매거래정지기간변경 (개선기간 부여)",
    "주권매매거래정지기간변경 ",
    "주권매매거래정지해제 (액면병합 주권 변경상장)",
    `주권매매거래정지해제${SP14}(액면병합 주권 변경상장)`,
    "불성실공시법인지정 (공시불이행)",
    "불성실공시법인지정 ",
  ];
  it.each(sends)("「%s」 → send", (name) => {
    expect(judgeRow(MARKET, row({ report_nm: name, corp_cls: "K" }), INCLUDE)).toEqual({ send: true });
    expect(judgeRow(MARKET, row({ report_nm: name, corp_cls: "Y" }), EXCLUDE)).toEqual({ send: true });
  });

  const kinds = [
    "기타시장안내 (주가 미달에 따른 상장폐지 우려 관련 안내)",
    `기타시장안내${SP14}(주가 미달에 따른 상장폐지 우려 관련 안내)`,
    "기타시장안내 (상장적격성 실질심사 관련 안내)",
    "기타시장안내(최대주주의의무보유관련) (최대주주의 의무보유 이행 관련)",
    "불성실공시법인지정예고 (공시번복)",
    "불성실공시법인미지정 (공시번복)",
    "기업설명회(IR)개최(안내공시) ",
    "중간(분기)배당락 ",
    "소속부변경 ",
    "전환가액ㆍ신주인수권행사가액ㆍ교환가액의조정(안내공시) ",
  ];
  it.each(kinds)("「%s」 → kind (보내지 않음 · near_miss 아님)", (name) => {
    expect(judgeRow(MARKET, row({ report_nm: name, corp_cls: "K" }), INCLUDE)).toEqual({ send: false, reason: "kind" });
  });

  it.each(["[기재정정]기업설명회(IR)개최(안내공시) ", "[기재정정]주권매매거래정지 (이익소각)"])("「%s」 → correction", (name) => {
    expect(judgeRow(MARKET, row({ report_nm: name }), INCLUDE)).toEqual({ send: false, reason: "correction" });
  });
});

describe("최대주주 소유주식 변동(I004) — 원본만(261113-rn7 U-1c)", () => {
  it("「최대주주등소유주식변동신고서」 → send · 정정 → correction · 코넥스(N) · 비상장(E) → market", () => {
    expect(judgeRow(HOLDER, row({ report_nm: "최대주주등소유주식변동신고서 ", corp_cls: "Y" }), INCLUDE)).toEqual({ send: true });
    expect(judgeRow(HOLDER, row({ report_nm: `최대주주등소유주식변동신고서${SP14}` }), INCLUDE)).toEqual({ send: true });
    expect(judgeRow(HOLDER, row({ report_nm: "[기재정정]최대주주등소유주식변동신고서" }), INCLUDE)).toEqual({ send: false, reason: "correction" });
    expect(judgeRow(HOLDER, row({ report_nm: "최대주주등소유주식변동신고서", corp_cls: "N" }), INCLUDE)).toEqual({ send: false, reason: "market" });
    expect(judgeRow(HOLDER, row({ report_nm: "최대주주등소유주식변동신고서", corp_cls: "E", stock_code: "" }), INCLUDE)).toEqual({
      send: false,
      reason: "market",
    });
  });
});

describe("matchesKind · compactName — 허용 이름 그대로 또는 「허용 이름(」 으로 시작(공백 무시 · 261113-rn7)", () => {
  it("「기타시장안내(관리종목지정우려종목) (…)」 와 「기타시장안내 (…)」 를 구분한다(옛 첫 「(」 자르기는 둘 다 「기타시장안내」)", () => {
    const k = "기타시장안내(관리종목지정우려종목)";
    expect(matchesKind(`기타시장안내(관리종목지정우려종목)${SP14}(시가총액 200억원 미달)`, k)).toBe(true);
    expect(matchesKind(`기타시장안내${SP14}(주가 미달에 따른 상장폐지 우려 관련 안내)`, k)).toBe(false);
    expect(compactName(`기타시장안내(관리종목지정우려종목)${SP14}(시가총액 200억원 미달)`)).toBe("기타시장안내(관리종목지정우려종목)(시가총액200억원미달)");
  });

  it("「주권매매거래정지해제」 는 「주권매매거래정지해제」 에만 맞고 「주권매매거래정지」 에는 안 맞는다", () => {
    const name = `주권매매거래정지해제${SP14}(액면병합 주권 변경상장)`;
    expect(matchesKind(name, "주권매매거래정지")).toBe(false);
    expect(matchesKind(name, "주권매매거래정지해제")).toBe(true);
    expect(matchesKind("주권매매거래정지 (이익소각)", "주권매매거래정지")).toBe(true);
  });

  it("괄호 없는 허용 이름에는 옛 규칙(첫 「(」 앞)과 결과가 같다 — 꼬리표 · 공백 · 끝 괄호", () => {
    expect(matchesKind("투자판단관련주요경영사항              (최대주주 보유주식 가압류)", "투자판단관련주요경영사항")).toBe(true);
    expect(matchesKind("[첨부정정]단일판매ㆍ공급계약체결(자율공시)", "단일판매ㆍ공급계약체결")).toBe(true);
    expect(matchesKind("최대주주변경을수반하는주식담보제공계약체결", "최대주주변경")).toBe(false);
    expect(matchesKind("주요사항보고서(자기주식취득신탁계약체결결정)(자회사의 주요경영사항)", "주요사항보고서")).toBe(true);
    expect(matchesKind("현금ㆍ현물배당을위한주주명부폐쇄(기준일)결정", "현금ㆍ현물배당결정")).toBe(false);
  });
});

describe("시장 거르기(D-05) — 모든 감시 대상 공통", () => {
  it("코넥스(N) · 비상장(E · 빈 종목코드) → market", () => {
    expect(judgeRow(RIGHTS, fixtureRow("주요사항보고서(유상증자결정)"), INCLUDE)).toEqual({ send: true });
    const konex = B001_FIXTURE.list.find((r) => r.corp_cls === "N")!;
    const etc = B001_FIXTURE.list.find((r) => r.corp_cls === "E")!;
    expect(judgeRow(RIGHTS, konex, INCLUDE)).toEqual({ send: false, reason: "market" });
    expect(judgeRow(RIGHTS, etc, INCLUDE)).toEqual({ send: false, reason: "market" });
    expect(judgeRow(TENDER, row({ corp_cls: "N" }), INCLUDE)).toEqual({ send: false, reason: "market" });
  });

  it("거래소 수시공시 · 거래계획 · 시장조치 · 최대주주 변동도 코넥스(N) · 비상장(E) → market", () => {
    for (const [w, name] of [
      [EXCHANGE, "최대주주변경"],
      [TRADE_PLAN, "임원ㆍ주요주주특정증권등거래계획보고서"],
      [MARKET, "주권매매거래정지 (무상증자)"],
      [HOLDER, "최대주주등소유주식변동신고서"],
    ] as const) {
      expect(judgeRow(w, row({ report_nm: name, corp_cls: "N" }), INCLUDE)).toEqual({ send: false, reason: "market" });
      expect(judgeRow(w, row({ report_nm: name, corp_cls: "E", stock_code: "" }), INCLUDE)).toEqual({ send: false, reason: "market" });
    }
  });

  it("종목코드가 없거나 5자리 · 7자리면 market (Y · K 여도)", () => {
    for (const w of [TENDER, RIGHTS]) {
      const base = { report_nm: "주요사항보고서(유상증자결정)" };
      expect(judgeRow(w, row({ ...base, stock_code: "" }), INCLUDE)).toEqual({ send: false, reason: "market" });
      expect(judgeRow(w, row({ ...base, stock_code: "12345" }), INCLUDE)).toEqual({ send: false, reason: "market" });
      expect(judgeRow(w, row({ ...base, stock_code: "1234567" }), INCLUDE)).toEqual({ send: false, reason: "market" });
      expect(judgeRow(w, row({ ...base, corp_cls: "Y", stock_code: "12345" }), INCLUDE)).toEqual({ send: false, reason: "market" });
    }
  });

  it("스팩(K · 이름에 「스팩」) 합병 → send", () => {
    const spac = B001_FIXTURE.list.find((r) => r.corp_name.includes("스팩"))!;
    expect(spac.corp_cls).toBe("K");
    expect(judgeRow(RIGHTS, spac, INCLUDE)).toEqual({ send: true });
  });

  it("시장 판정이 종류 판정보다 먼저 — 코넥스의 목록 밖 종류도 market", () => {
    expect(judgeRow(RIGHTS, row({ corp_cls: "N", report_nm: "주요사항보고서(합병종료결정)" }), INCLUDE)).toEqual({
      send: false,
      reason: "market",
    });
  });

  it("접수번호 14자리 아님 · 회사명 · 보고서명 빔 → invalid", () => {
    expect(judgeRow(RIGHTS, row({ rcept_no: "2026111100001" }), INCLUDE)).toEqual({ send: false, reason: "invalid" });
    expect(judgeRow(RIGHTS, row({ corp_name: " " }), INCLUDE)).toEqual({ send: false, reason: "invalid" });
    expect(judgeRow(RIGHTS, row({ report_nm: "  " }), INCLUDE)).toEqual({ send: false, reason: "invalid" });
    expect(judgeRow(TENDER, row({ report_nm: "" }), INCLUDE)).toEqual({ send: false, reason: "invalid" });
  });
});

describe("collectOnce — 주요사항보고서 바퀴 · 근접 불일치 warn 1번(가정 1)", () => {
  function wire(b001Rows: () => DartRow[]) {
    const warns: { obj: Record<string, unknown>; msg?: string }[] = [];
    const inserts: InsertItem[][] = [];
    const deps: LapDeps = {
      // 키 1 감시 대상 둘(D004 · B001)만 — 이 묶음은 주요사항보고서 판정 · warn 을 잰다
      watches: buildWatches({ b001Kinds: DEFAULT_B001_KINDS }).filter((x) => x.key === 1),
      judge: INCLUDE,
      log: {
        info() {},
        warn(obj, msg) {
          warns.push({ obj: obj as Record<string, unknown>, msg });
        },
        error() {},
      },
      clock: { now: () => Date.parse("2026-11-11T00:30:00Z") },
      sleep: async () => {},
      dart: {
        async list(watch: Watch) {
          return { rows: watch.pblntfDetailTy === "B001" ? b001Rows() : [], calls: 1 };
        },
      },
      db: {
        async insert(items) {
          inserts.push(items);
          return items.map((i) => ({ rcept_no: i.rcept_no, late: i.late }));
        },
        async claim() {
          return [];
        },
        async mark() {
          return true;
        },
      },
      telegram: {
        async send() {
          return { kind: "ok", messageId: 1 } as const;
        },
      },
    };
    return { deps, warns, inserts };
  }
  const lapOpts = { isLate: () => false, seed: false };
  const nearMissWarns = (ws: { msg?: string }[]) => ws.filter((w) => w.msg === "b001 near-miss kind");

  it("픽스처 바퀴 — 보낼 7건만 rights_merger · priority 1 로 넣고 두 감시 대상을 2회 조회한다", async () => {
    const w = wire(() => B001_FIXTURE.list);
    const c = await collectOnce(w.deps, newLapState(), "20261111", lapOpts);
    expect(c.calls).toBe(2);
    expect(c.results.map((r) => [r.watch, r.ok])).toEqual([
      ["tender_offer", true],
      ["rights_merger", true],
    ]);
    expect(w.inserts).toHaveLength(1);
    const items = w.inserts[0];
    expect(items.map((i) => i.report_nm)).toEqual([
      "주요사항보고서(유상증자결정)",
      "주요사항보고서(유무상증자결정)",
      "[기재정정]주요사항보고서(회사합병결정)",
      "[첨부정정][기재정정] 주요사항보고서 (회사분할합병결정)",
      "주요사항보고서(주식교환ㆍ이전결정)",
      "주요사항보고서(자기주식취득결정)",
      "주요사항보고서(회사합병결정)",
    ]);
    expect(items.every((i) => i.watch === "rights_merger" && i.priority === 1 && i.rcept_dt === "2026-11-11")).toBe(true);
    // 표시용 보고서명은 DART 원문 그대로(정리본이 아니다 · D-07)
    expect(items[3].report_nm).toBe("[첨부정정][기재정정] 주요사항보고서 (회사분할합병결정)");
  });

  it("근접 불일치는 종류명마다 실행당 1번만 warn — 같은 바퀴 · 다음 바퀴에 또 와도 반복 없음", async () => {
    let lapNo = 0;
    const w = wire(() => {
      lapNo += 1;
      const base = [
        row({ report_nm: "주요사항보고서(합병종료결정)" }),
        row({ report_nm: "[기재정정]주요사항보고서(합병종료결정)" }),
        row({ report_nm: "주요사항보고서(감자및증자결정)" }),
      ];
      return lapNo === 1 ? base : [...base, row({ report_nm: "주요사항보고서(합병종료결정)" })];
    });
    const state = newLapState();
    await collectOnce(w.deps, state, "20261111", lapOpts);
    const first = nearMissWarns(w.warns);
    expect(first).toHaveLength(2);
    expect(first.map((x) => String(x.obj.kind)).sort()).toEqual(["감자및증자결정", "합병종료결정"].sort());
    expect(first[0].obj).toMatchObject({ watch: "rights_merger" });
    expect(typeof first[0].obj.rceptNo).toBe("string");
    expect(Object.keys(first[0].obj).sort()).toEqual(["kind", "rceptNo", "watch"]);

    await collectOnce(w.deps, state, "20261111", lapOpts);
    await collectOnce(w.deps, state, "20261111", lapOpts);
    expect(nearMissWarns(w.warns)).toHaveLength(2);
    // 근접 불일치는 넣지 않는다
    expect(w.inserts).toHaveLength(0);
  });

  it("새 실행(newLapState)이면 같은 종류명도 다시 1번 warn", async () => {
    const w = wire(() => [row({ report_nm: "주요사항보고서(합병종료결정)" })]);
    await collectOnce(w.deps, newLapState(), "20261111", lapOpts);
    await collectOnce(w.deps, newLapState(), "20261111", lapOpts);
    expect(nearMissWarns(w.warns)).toHaveLength(2);
  });
});
