import { afterEach, describe, expect, it } from "vitest";
import {
  alertText,
  htmlEscape,
  kstLabel,
  outageText,
  plainAlertText,
  recoveredText,
  sameCompany,
  testSendText,
  type AlertFields,
} from "../src/message";

/**
 * Phase 43-09 — 문구 규칙 전수(D-06 · D-07 · D-08 · D-12 · D-15 · D-16).
 * 공개매수 트레이서 문구(43-01)는 tests/tracer.test.ts 가 글자 그대로 잠근다 — 여기서는 바꾸지 않는다는 것만 다시 본다.
 */

const VIEWER = "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=";

function fields(over: Partial<AlertFields> = {}): AlertFields {
  return {
    rcept_no: "20261111200001",
    report_nm: "주요사항보고서(유상증자결정)",
    corp_name: "가온전자",
    stock_code: "100001",
    flr_nm: "가온전자",
    late: false,
    ...over,
  };
}

const B001 = { alwaysShowFiler: false };
const D004 = { alwaysShowFiler: true };
/** 거래소 시장조치(I003) — 제출인을 붙이지 않음(261113-rn7) */
const I003 = { alwaysShowFiler: false, hideFiler: true };

describe("sameCompany — 제출인 · 회사명 비교(공백 · (주) · 주식회사 · ㈜ 무시)", () => {
  it("표기만 다른 같은 회사는 true", () => {
    expect(sameCompany("가온전자", "가온전자")).toBe(true);
    expect(sameCompany("(주)가온전자", "가온전자")).toBe(true);
    expect(sameCompany("가온전자 주식회사", "가온전자")).toBe(true);
    expect(sameCompany("주식회사 가온전자", "가온 전자")).toBe(true);
    expect(sameCompany("㈜가온전자", "가온전자(주)")).toBe(true);
  });

  it("다른 회사 · 빈 이름은 false", () => {
    expect(sameCompany("가람홀딩스", "가온전자")).toBe(false);
    expect(sameCompany("", "")).toBe(false);
    expect(sameCompany("(주)", "주식회사")).toBe(false);
  });
});

describe("alertText — 두 줄 · 제출인 생략 규칙(D-07)", () => {
  it("주요사항보고서 · 제출인이 회사 자신이면 「· 제출인 …」 생략", () => {
    expect(alertText(fields(), B001)).toBe(
      "📢 주요사항보고서(유상증자결정) — 가온전자(100001)\n" +
        `<a href="${VIEWER}20261111200001">DART 원문</a> · 금융감독원 전자공시`,
    );
    expect(alertText(fields({ flr_nm: "(주)가온전자" }), B001)).not.toContain("제출인");
    expect(alertText(fields({ flr_nm: "가온전자 주식회사" }), B001)).not.toContain("제출인");
    expect(alertText(fields({ flr_nm: "㈜ 가온전자" }), B001)).not.toContain("제출인");
  });

  it("거래소 시장조치(hideFiler) · 제출인 「코스닥시장본부」 가 회사와 달라도 붙이지 않는다 — 평문도 같다(261113-rn7)", () => {
    const f = fields({ report_nm: "주권매매거래정지              (주식의 병합, 분할 등 전자등록 변경, 말소)", flr_nm: "코스닥시장본부" });
    const first = "📢 주권매매거래정지 (주식의 병합, 분할 등 전자등록 변경, 말소) — 가온전자(100001)";
    expect(alertText(f, I003).split("\n")[0]).toBe(first);
    expect(plainAlertText(f, I003).split("\n")[0]).toBe(first);
    // hideFiler 가 없으면(같은 행 · 회사와 다름) 지금 규칙대로 붙는다
    expect(alertText(f, B001).split("\n")[0]).toBe(`${first} · 제출인 코스닥시장본부`);
  });

  it("주요사항보고서 · 제출인이 다른 회사면 표기", () => {
    const t = alertText(fields({ flr_nm: "다온홀딩스" }), B001);
    expect(t.split("\n")[0]).toBe("📢 주요사항보고서(유상증자결정) — 가온전자(100001) · 제출인 다온홀딩스");
  });

  it("공개매수는 제출인이 회사와 같아도 항상 표기(트레이서 문구 불변)", () => {
    const t = alertText(
      fields({ report_nm: "공개매수신고서", corp_name: "에스텍", stock_code: "069510", flr_nm: "가람홀딩스", rcept_no: "20261111000001" }),
      D004,
    );
    expect(t).toBe(
      "📢 공개매수신고서 — 에스텍(069510) · 제출인 가람홀딩스\n" +
        `<a href="${VIEWER}20261111000001">DART 원문</a> · 금융감독원 전자공시`,
    );
    expect(alertText(fields({ report_nm: "의견표명서" }), D004).split("\n")[0]).toBe(
      "📢 의견표명서 — 가온전자(100001) · 제출인 가온전자",
    );
  });

  it("제출인이 비어 있으면 어느 감시 대상이든 생략", () => {
    expect(alertText(fields({ flr_nm: " " }), D004)).not.toContain("제출인");
    expect(alertText(fields({ flr_nm: "" }), B001)).not.toContain("제출인");
  });

  it("보고서명은 DART 표기 그대로(정정 꼬리표 · 공백 포함)", () => {
    const t = alertText(fields({ report_nm: "[첨부정정][기재정정] 주요사항보고서 (회사분할합병결정)" }), B001);
    expect(t.split("\n")[0]).toBe("📢 [첨부정정][기재정정] 주요사항보고서 (회사분할합병결정) — 가온전자(100001)");
  });

  it("늦은 알림이면 📢 바로 뒤에 「(늦은 알림)」 이 한 번(D-12)", () => {
    const t = alertText(fields({ late: true }), B001);
    expect(t.startsWith("📢 (늦은 알림) 주요사항보고서(유상증자결정) — 가온전자(100001)\n")).toBe(true);
    expect(t.split("(늦은 알림)")).toHaveLength(2);
    expect(alertText(fields({ late: false }), B001)).not.toContain("늦은 알림");
  });

  it("회사명 · 보고서명 · 제출인의 & < > 는 엔티티(F&F)", () => {
    const t = alertText(fields({ corp_name: "F&F", report_nm: "주요사항보고서(<유상증자결정>)", flr_nm: "A&B>C" }), B001);
    expect(t.split("\n")[0]).toBe("📢 주요사항보고서(&lt;유상증자결정&gt;) — F&amp;F(100001) · 제출인 A&amp;B&gt;C");
    expect(htmlEscape("&lt;")).toBe("&amp;lt;");
  });

  it("정확히 두 줄이고 본문 숫자(가격 · 규모)가 없다 — 목록 필드와 링크뿐(D-06)", () => {
    for (const t of [alertText(fields(), B001), alertText(fields({ late: true, flr_nm: "다온" }), D004)]) {
      expect(t.split("\n")).toHaveLength(2);
      expect(t.split("\n")[1]).toBe(`<a href="${VIEWER}20261111200001">DART 원문</a> · 금융감독원 전자공시`);
    }
  });
});

describe("plainAlertText — 서식 오류 대비 평문(43-06 이 쓴다)", () => {
  it("HTML 태그 없이 원문 주소를 그대로 싣는다", () => {
    expect(plainAlertText(fields(), B001)).toBe(
      "📢 주요사항보고서(유상증자결정) — 가온전자(100001)\n" + `DART 원문 ${VIEWER}20261111200001 · 금융감독원 전자공시`,
    );
  });

  it("평문은 엔티티로 바꾸지 않는다(F&F 그대로) · 제출인 · 늦은 알림 규칙은 같다", () => {
    const t = plainAlertText(fields({ corp_name: "F&F", flr_nm: "다온<홀딩스>", late: true }), D004);
    expect(t.split("\n")[0]).toBe("📢 (늦은 알림) 주요사항보고서(유상증자결정) — F&F(100001) · 제출인 다온<홀딩스>");
    expect(t).not.toContain("<a ");
    expect(t).not.toContain("&amp;");
    expect(t.split("\n")).toHaveLength(2);
  });
});

describe("보고서 이름 연속 공백 — 첫 줄에서 1칸으로(261113-iez · D-07 미리보기)", () => {
  const longGap = "투자판단관련주요경영사항              (최대주주 보유주식 가압류)";
  it("alertText · plainAlertText 첫 줄이 공백 1칸 · 앞뒤 공백 없음", () => {
    const want = "📢 투자판단관련주요경영사항 (최대주주 보유주식 가압류) — 가온전자(100001)";
    expect(alertText(fields({ report_nm: longGap }), B001).split("\n")[0]).toBe(want);
    expect(plainAlertText(fields({ report_nm: ` ${longGap} ` }), B001).split("\n")[0]).toBe(want);
  });
});

describe("kstLabel — 컨테이너 시간대와 무관한 KST", () => {
  const origTz = process.env.TZ;
  afterEach(() => {
    if (origTz === undefined) delete process.env.TZ;
    else process.env.TZ = origTz;
  });

  it("HH:MM · M/D HH:MM (앞자리 0 은 시각만)", () => {
    expect(kstLabel(Date.parse("2026-11-11T01:05:00Z"), false)).toBe("10:05");
    expect(kstLabel(Date.parse("2026-11-10T15:30:00Z"), false)).toBe("00:30");
    expect(kstLabel(Date.parse("2026-11-10T15:30:00Z"), true)).toBe("11/11 00:30");
    expect(kstLabel(Date.parse("2026-01-04T22:07:00Z"), true)).toBe("1/5 07:07");
  });

  it("TZ 가 뉴욕 · UTC 여도 같은 값", () => {
    const ms = Date.parse("2026-11-11T10:59:00Z");
    process.env.TZ = "America/New_York";
    const ny = kstLabel(ms, true);
    process.env.TZ = "UTC";
    const utc = kstLabel(ms, true);
    expect(ny).toBe("11/11 19:59");
    expect(utc).toBe("11/11 19:59");
  });
});

describe("장애 글 2종(D-16 · D-17)", () => {
  it("outageText — 「⚠ 공시 알림이 멈췄습니다 — HH:MM 부터 DART 조회 실패(사유). 복구되면 알려 드립니다.」", () => {
    expect(outageText(Date.parse("2026-11-11T01:05:00Z"), "하루 조회 한도 초과")).toBe(
      "⚠ 공시 알림이 멈췄습니다 — 10:05 부터 DART 조회 실패(하루 조회 한도 초과). 복구되면 알려 드립니다.",
    );
  });

  it("outageText 사유는 HTML 이스케이프 · 한 줄", () => {
    const t = outageText(Date.parse("2026-11-11T01:05:00Z"), "status<020>&x");
    expect(t).toContain("DART 조회 실패(status&lt;020&gt;&amp;x)");
    expect(t.split("\n")).toHaveLength(1);
  });

  it("recoveredText — 같은 KST 날이면 「HH:MM ~ HH:MM 사이 공시는 「(늦은 알림)」 으로 보냅니다.」", () => {
    expect(recoveredText(Date.parse("2026-11-11T01:05:00Z"), Date.parse("2026-11-11T02:12:00Z"))).toBe(
      "✅ 공시 알림 다시 동작 — 10:05 ~ 11:12 사이 공시는 「(늦은 알림)」 으로 보냅니다.",
    );
    // UTC 로는 다른 날이지만 KST 로는 같은 날(00:30 ~ 09:10)
    expect(recoveredText(Date.parse("2026-11-10T15:30:00Z"), Date.parse("2026-11-11T00:10:00Z"))).toBe(
      "✅ 공시 알림 다시 동작 — 00:30 ~ 09:10 사이 공시는 「(늦은 알림)」 으로 보냅니다.",
    );
  });

  it("recoveredText — KST 날이 다르면 「(M/D HH:MM 부터 멈춤) — 오늘 접수된 공시는 …」", () => {
    expect(recoveredText(Date.parse("2026-11-10T10:30:00Z"), Date.parse("2026-11-11T00:10:00Z"))).toBe(
      "✅ 공시 알림 다시 동작(11/10 19:30 부터 멈춤) — 오늘 접수된 공시는 「(늦은 알림)」 으로 보냅니다.",
    );
  });
});

describe("시험 글(D-15)", () => {
  it("testSendText — 두 줄 「🔔 공시 알림 시험 — …」 / 「HH:MM KST · 금융감독원 전자공시」", () => {
    const t = testSendText(Date.parse("2026-11-11T01:05:00Z"));
    expect(t).toBe(
      "🔔 공시 알림 시험 — 공개매수 · 주요사항보고서 · 거래소 시장조치 · 거래소 수시공시 · 최대주주 소유주식 변동 · 임원ㆍ주요주주 거래계획 공시를 이 방으로 보냅니다\n10:05 KST · 금융감독원 전자공시",
    );
    expect(t.split("\n")).toHaveLength(2);
  });
});
