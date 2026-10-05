/**
 * Phase 28 (28-01) — 상한가 특징 85 숫자 함수 골든. WinForms `BuildLimitFeatureCells` · `FormatEok` ·
 * `FormatDuration` (gh-trade LimitChaserForm.cs 3738-3866) 과 글자 하나까지 같아야 한다.
 */
import { describe, expect, it } from "vitest";
import type { RelayLimitFeatureMsg } from "../relay";
import {
  formatDuration,
  formatEok,
  formatGroup,
  formatRatePct,
  formatManQty,
  limitFeatureCells,
  limitFeatureTabSuffix,
  limitFeatureTooltip,
  roundPctHalfEven,
} from "../limit-feature";

/** 잠김 시나리오 기본값(relay 테스트 헬퍼 `buildLimitFeatureFrame` 기본과 같은 값). */
function feature(over: Partial<RelayLimitFeatureMsg> = {}): RelayLimitFeatureMsg {
  return {
    t: "limit.feature",
    i: "KR7005930003",
    x: "KRX",
    gwTimeMs: 1_791_164_130_000,
    featureSchema: 1,
    upperPx: 13000,
    lastPx: 13000,
    rateBp: 3000,
    basePx: 10000,
    qQty: 133_077,
    qKrw: 1_730_000_000,
    wallKrwVisible: 0,
    wallQtyHidden: 0,
    wallTruncated: false,
    sellLed10s: 3_700,
    buyLed10s: 6_300,
    cancel10s: 2_300,
    new10s: 12_400,
    auctionFill10s: 0,
    drainS: -1,
    lockState: 1,
    lockElapsedS: 43,
    burstUpperLimit: false,
    auction: false,
    memberBuy: [],
    memberSell: [],
    memberDeltaPartial: false,
    modelState: 0,
    modelSchemaVersion: 0,
    pBreakBp: -1,
    pHorizonS: 0,
    ...over,
  };
}

const nowRow = (msg: RelayLimitFeatureMsg | null) => limitFeatureCells(msg).slice(0, 3).map((c) => c.text);

describe("Phase 28 formatEok — .NET N1 + 「억」, 0 에서 먼 쪽 반올림", () => {
  it("0 → 「0」", () => {
    expect(formatEok(0)).toBe("0");
  });
  it("17.3억 · 1,234.5억 (천 단위 쉼표)", () => {
    expect(formatEok(1_730_000_000)).toBe("17.3억");
    expect(formatEok(123_450_000_000)).toBe("1,234.5억");
  });
  it("115,000,000 → 「1.2억」 (JS toFixed 는 1.1 — 정수 십분위로 .NET 과 맞춘다)", () => {
    expect(formatEok(115_000_000)).toBe("1.2억");
  });
  it("억 미만도 소수 한 자리 억 — 3,000,000 → 「0.0억」", () => {
    expect(formatEok(3_000_000)).toBe("0.0억");
  });
});

describe("Phase 28 formatDuration — 60초 이상이면 「M분 S초」", () => {
  it("43 → 「43초」 · 63 → 「1분 3초」 · 60 → 「1분 0초」", () => {
    expect(formatDuration(43)).toBe("43초");
    expect(formatDuration(63)).toBe("1분 3초");
    expect(formatDuration(60)).toBe("1분 0초");
  });
});

describe("Phase 28 formatRatePct — .NET \"+0.0;-0.0;0.0\"", () => {
  it("부호 항상 · 소수 1자리", () => {
    expect(formatRatePct(2680)).toBe("+26.8%");
    expect(formatRatePct(-125)).toBe("-1.3%");
  });
  it("반올림 결과 0 이면 세 번째 구역 「0.0%」 (부호 없음)", () => {
    expect(formatRatePct(-4)).toBe("0.0%");
    expect(formatRatePct(4)).toBe("0.0%");
    expect(formatRatePct(0)).toBe("0.0%");
  });
});

describe("Phase 28 formatGroup", () => {
  it("천 단위 쉼표", () => {
    expect(formatGroup(13000)).toBe("13,000");
    expect(formatGroup(0)).toBe("0");
  });
});

describe("Phase 28 limitFeatureCells — 지금 행 (WinForms BuildLimitFeatureCells 동형)", () => {
  it("lock 1 · 43초 · 대기 17.3억 · drain −1 → 「잠김 43초째」(up · strong) · 「대기 17.3억」 · 「소진 —」", () => {
    const cells = limitFeatureCells(feature());
    expect(cells).toHaveLength(9);
    expect(cells.slice(0, 3)).toEqual([
      { text: "잠김 43초째", tone: "up", strong: true, narrow: null },
      { text: "대기 17.3억", tone: "fg", strong: false, narrow: null },
      { text: "소진 —", tone: "fg", strong: false, narrow: null },
    ]);
  });

  it("lock 1 · 경과 63초 · drain 95 → 「잠김 1분 3초째」 · 「소진 1분 35초」", () => {
    expect(nowRow(feature({ lockElapsedS: 63, drainS: 95 }))).toEqual(["잠김 1분 3초째", "대기 17.3억", "소진 1분 35초"]);
  });

  it("lock 2 · 대기 2.1억 · 매도벽 0.9억 잘림 → 「깨짐」 · 「대기 2.1억」 · 「매도벽 0.9억+」", () => {
    const msg = feature({ lockState: 2, lockElapsedS: 0, qKrw: 210_000_000, wallKrwVisible: 90_000_000, wallTruncated: true });
    expect(nowRow(msg)).toEqual(["깨짐", "대기 2.1억", "매도벽 0.9억+"]);
    expect(limitFeatureCells(msg)[0]).toEqual({ text: "깨짐", tone: "fg", strong: false, narrow: null });
  });

  it("lock 0 · +26.8% · 매도벽 4.2억 잘림 · 상한가 13000 → 「미도달 (+26.8%)」 · 「매도벽 4.2억+」 · 「상한가 13,000」", () => {
    const msg = feature({ lockState: 0, lockElapsedS: 0, rateBp: 2680, wallKrwVisible: 420_000_000, wallTruncated: true });
    expect(nowRow(msg)).toEqual(["미도달 (+26.8%)", "매도벽 4.2억+", "상한가 13,000"]);
  });

  it("lock 0 · upper 0 → 「상한가 —」 · wall 0 → 「매도벽 0」", () => {
    const msg = feature({ lockState: 0, rateBp: 2680, upperPx: 0, wallKrwVisible: 0, wallTruncated: false });
    expect(nowRow(msg)).toEqual(["미도달 (+26.8%)", "매도벽 0", "상한가 —"]);
  });

  it("단일가 + lock 1 → 칸 1 「단일가 · 잠김 43초째」(up · strong)", () => {
    expect(limitFeatureCells(feature({ auction: true }))[0]).toEqual({
      text: "단일가 · 잠김 43초째",
      tone: "up",
      strong: true,
      narrow: null,
    });
  });

  it("단일가 + lock 0 → 「단일가 · 미도달 (+26.8%)」", () => {
    expect(nowRow(feature({ auction: true, lockState: 0, rateBp: 2680 }))[0]).toBe("단일가 · 미도달 (+26.8%)");
  });

  it("85 가 있으면 10초 · 창구 행 6칸도 채운다(28-07) — 「—」 자리표시가 남지 않는다", () => {
    const rest = limitFeatureCells(feature()).slice(3);
    expect(rest).toHaveLength(6);
    expect(rest.map((c) => c.text)).not.toContain("—");
  });

  it("null(85 없음) → 9칸 모두 { text: 「—」, tone: faint }", () => {
    const cells = limitFeatureCells(null);
    expect(cells).toHaveLength(9);
    for (const c of cells) expect(c).toEqual({ text: "—", tone: "faint", strong: false, narrow: null });
  });
});

describe("Phase 28 limitFeatureTabSuffix — 탭 제목 접미 (「째」 없음)", () => {
  it("lock 1 · 43 → 「잠김 43초」 up · lock 1 · 63 → 「잠김 1분 3초」", () => {
    expect(limitFeatureTabSuffix(feature())).toEqual({ text: "잠김 43초", tone: "up" });
    expect(limitFeatureTabSuffix(feature({ lockElapsedS: 63 }))).toEqual({ text: "잠김 1분 3초", tone: "up" });
  });
  it("lock 2 → 「깨짐」 fg", () => {
    expect(limitFeatureTabSuffix(feature({ lockState: 2, lockElapsedS: 0 }))).toEqual({ text: "깨짐", tone: "fg" });
  });
  it("lock 0 · null → null", () => {
    expect(limitFeatureTabSuffix(feature({ lockState: 0 }))).toBeNull();
    expect(limitFeatureTabSuffix(null)).toBeNull();
  });
});

// ============================================================
// 28-07 — 9칸 완성 (10초 · 창구 행 · 폰 narrow · 툴팁)
// ============================================================

/** 2026-10-05 09:46:00.000 KST = 00:46:00 UTC. */
const GW_0946_KST = 1_791_161_160_000;

const member = (memberNo: string, dQty: number) => ({ memberNo, dQty, dValue: dQty * 13000, shareBp: 5000 });

describe("Phase 28 9칸 완성 — roundPctHalfEven (.NET Math.Round 기본 = 짝수 반올림)", () => {
  it("12.5 → 12 · 37.5 → 38 · 63 → 63 · 55.6 → 56", () => {
    expect(roundPctHalfEven(1, 8)).toBe(12);
    expect(roundPctHalfEven(3, 8)).toBe(38);
    expect(roundPctHalfEven(6300, 10000)).toBe(63);
    expect(roundPctHalfEven(5, 9)).toBe(56);
  });
  it("50.5 → 50 · 51.5 → 52 · 100 → 100", () => {
    expect(roundPctHalfEven(101, 200)).toBe(50);
    expect(roundPctHalfEven(103, 200)).toBe(52);
    expect(roundPctHalfEven(7, 7)).toBe(100);
  });
});

describe("Phase 28 9칸 완성 — formatManQty (.NET \"+0.0;-0.0\" + 「만」 / \"+#,0;-#,0;0\")", () => {
  it("|q| ≥ 1만 → 소수 1자리 만 · 0 에서 먼 쪽", () => {
    expect(formatManQty(52000)).toBe("+5.2만");
    expect(formatManQty(12400)).toBe("+1.2만");
    expect(formatManQty(12500)).toBe("+1.3만");
    expect(formatManQty(-15000)).toBe("-1.5만");
    expect(formatManQty(-12500)).toBe("-1.3만");
    expect(formatManQty(10000)).toBe("+1.0만");
    expect(formatManQty(123000)).toBe("+12.3만");
  });
  it("|q| < 1만 → 부호 · 천 단위 쉼표 · 0 → 「0」", () => {
    expect(formatManQty(3200)).toBe("+3,200");
    expect(formatManQty(-2300)).toBe("-2,300");
    expect(formatManQty(9999)).toBe("+9,999");
    expect(formatManQty(0)).toBe("0");
  });
});

describe("Phase 28 9칸 완성 — 10초 행", () => {
  const row10 = (over: Partial<RelayLimitFeatureMsg>) => limitFeatureCells(feature(over)).slice(3, 6);

  it("sell 3,700 · buy 6,300 → 「매수 우세 63%」(up)", () => {
    expect(row10({})[0]).toEqual({ text: "매수 우세 63%", tone: "up", strong: false, narrow: null });
  });
  it("sell 8,200 · buy 3,000 → 「매도 우세 73%」(down)", () => {
    expect(row10({ sellLed10s: 8200, buyLed10s: 3000 })[0]).toEqual({
      text: "매도 우세 73%",
      tone: "down",
      strong: false,
      narrow: null,
    });
  });
  it("우세 % 는 짝수 반올림 — sell 1 · buy 7 → 「매수 우세 88%」(87.5) · sell 5 · buy 3 → 「매도 우세 62%」(62.5)", () => {
    expect(row10({ sellLed10s: 1, buyLed10s: 7 })[0]!.text).toBe("매수 우세 88%");
    expect(row10({ sellLed10s: 5, buyLed10s: 3 })[0]!.text).toBe("매도 우세 62%");
  });
  it("같음 → 「매수·매도 반반」(fg) · 둘 다 0 → 「체결 없음」(fg)", () => {
    expect(row10({ sellLed10s: 500, buyLed10s: 500 })[0]).toEqual({
      text: "매수·매도 반반",
      tone: "fg",
      strong: false,
      narrow: null,
    });
    expect(row10({ sellLed10s: 0, buyLed10s: 0 })[0]).toEqual({ text: "체결 없음", tone: "fg", strong: false, narrow: null });
  });

  it("lock 1 → 「잔량 신규 +12,400」 / 폰 「신규 +1.2만」 · 「잔량 취소 -2,300」(down) / 폰 「취소 -2,300」", () => {
    const [, n, c] = row10({});
    expect(n).toEqual({ text: "잔량 신규 +12,400", tone: "fg", strong: false, narrow: "신규 +1.2만" });
    expect(c).toEqual({ text: "잔량 취소 -2,300", tone: "down", strong: false, narrow: "취소 -2,300" });
  });
  it("lock 1 · new 0 · cancel 0 → 「잔량 신규 0」 / 「신규 0」 · 「잔량 취소 0」(down) / 「취소 0」", () => {
    const [, n, c] = row10({ new10s: 0, cancel10s: 0 });
    expect(n).toEqual({ text: "잔량 신규 0", tone: "fg", strong: false, narrow: "신규 0" });
    expect(c).toEqual({ text: "잔량 취소 0", tone: "down", strong: false, narrow: "취소 0" });
  });
  it("lock 1 · 취소 큰 수 → 폰 「취소 -1.5만」", () => {
    expect(row10({ cancel10s: 15000 })[2]!.narrow).toBe("취소 -1.5만");
  });

  it("lock 0 · lock 2 → 「체결 19,400주」(narrow null) · 「—」(fg)", () => {
    for (const lockState of [0, 2]) {
      const [, n, c] = row10({ lockState, lockElapsedS: 0, sellLed10s: 8200, buyLed10s: 11200 });
      expect(n).toEqual({ text: "체결 19,400주", tone: "fg", strong: false, narrow: null });
      expect(c).toEqual({ text: "—", tone: "fg", strong: false, narrow: null });
    }
  });
  it("lock 0 · 체결 0 → 「체결 없음」 · 「체결 0주」", () => {
    expect(row10({ lockState: 0, sellLed10s: 0, buyLed10s: 0 }).map((c) => c.text)).toEqual(["체결 없음", "체결 0주", "—"]);
  });
});

describe("Phase 28 9칸 완성 — 창구 행", () => {
  const rowM = (over: Partial<RelayLimitFeatureMsg>) => limitFeatureCells(feature(over)).slice(6, 9);

  it("FirstMember — 회원번호 빈 원소를 건너뛴다 · 회원사명 전체 이름 · up", () => {
    const [b] = rowM({ memberBuy: [member("", 99000), member("00050", 52000)] });
    expect(b).toEqual({ text: "매수 키움증권 +5.2만", tone: "up", strong: false, narrow: null });
  });
  it("빈 배열 · 전부 빈 회원번호 → 「매수 —」 · 「매도 —」(fg)", () => {
    const [b, s] = rowM({ memberBuy: [], memberSell: [member("", 1000)] });
    expect(b).toEqual({ text: "매수 —", tone: "fg", strong: false, narrow: null });
    expect(s).toEqual({ text: "매도 —", tone: "fg", strong: false, narrow: null });
  });
  it("매도 신한증권 +1.8만(down) · 6자리 회원번호 · 미매핑 번호 · 1만 미만", () => {
    expect(rowM({ memberSell: [member("00002", 18000)] })[1]).toEqual({
      text: "매도 신한증권 +1.8만",
      tone: "down",
      strong: false,
      narrow: null,
    });
    expect(rowM({ memberBuy: [member("000500", 3200)] })[0]!.text).toBe("매수 키움증권 +3,200");
    expect(rowM({ memberBuy: [member("99998", 3200)] })[0]!.text).toBe("매수 99998 +3,200");
    expect(rowM({ memberBuy: [member("00005", 123000)] })[0]!.text).toBe("매수 미래에셋증권 +12.3만");
  });
  it("model 1 · pBreak 1830 → 「깨짐확률 18.3%」(fg) · 0 → 「깨짐확률 0.0%」 · 10000 → 「깨짐확률 100.0%」", () => {
    expect(rowM({ modelState: 1, pBreakBp: 1830, pHorizonS: 60 })[2]).toEqual({
      text: "깨짐확률 18.3%",
      tone: "fg",
      strong: false,
      narrow: null,
    });
    expect(rowM({ modelState: 1, pBreakBp: 0, pHorizonS: 60 })[2]!.text).toBe("깨짐확률 0.0%");
    expect(rowM({ modelState: 1, pBreakBp: 10000, pHorizonS: 60 })[2]!.text).toBe("깨짐확률 100.0%");
  });
  it("model 1 · pBreak −1 · model 0 → 「깨짐확률 관찰 중」(muted)", () => {
    const watching = { text: "깨짐확률 관찰 중", tone: "muted", strong: false, narrow: null };
    expect(rowM({ modelState: 1, pBreakBp: -1 })[2]).toEqual(watching);
    expect(rowM({ modelState: 0, pBreakBp: 1830 })[2]).toEqual(watching);
  });
});

describe("Phase 28 9칸 완성 — 갈래 전체 (WinForms BuildLimitFeatureCells 대조)", () => {
  it("lock 2 · 단일가 · 매도벽 0 · 창구 없음 · 관찰 중", () => {
    const msg = feature({
      lockState: 2,
      lockElapsedS: 0,
      auction: true,
      qKrw: 0,
      wallKrwVisible: 0,
      sellLed10s: 1200,
      buyLed10s: 400,
    });
    expect(limitFeatureCells(msg).map((c) => c.text)).toEqual([
      "단일가 · 깨짐",
      "대기 0",
      "매도벽 0",
      "매도 우세 75%",
      "체결 1,600주",
      "—",
      "매수 —",
      "매도 —",
      "깨짐확률 관찰 중",
    ]);
  });
});

describe("Phase 28 9칸 완성 — limitFeatureTooltip (WinForms ApplyLimitFeatureTable 동형)", () => {
  const full = feature({
    gwTimeMs: GW_0946_KST,
    memberBuy: [member("00050", 52000)],
    memberSell: [member("00002", 18000)],
    modelState: 1,
    pBreakBp: 1830,
    pHorizonS: 60,
  });

  it("lock 1 · 확률 적용 → 넓은 밴드 문구 3줄 + 「09:46:00 기준 · 깨짐확률은 60초 안」", () => {
    expect(limitFeatureTooltip(full)).toBe(
      "지금 잠김 43초째 · 대기 17.3억 · 소진 —\n" +
        "10초 매수 우세 63% · 잔량 신규 +12,400 · 잔량 취소 -2,300\n" +
        "창구 매수 키움증권 +5.2만 · 매도 신한증권 +1.8만 · 깨짐확률 18.3%\n" +
        "09:46:00 기준 · 깨짐확률은 60초 안",
    );
  });
  it("model 0 → 마지막 줄 「09:46:00 기준」 만 · 밀리초는 잘라낸다", () => {
    const tip = limitFeatureTooltip({ ...full, modelState: 0, pBreakBp: -1, pHorizonS: 0, gwTimeMs: GW_0946_KST + 999 });
    expect(tip.split("\n")).toHaveLength(4);
    expect(tip.endsWith("\n09:46:00 기준")).toBe(true);
    expect(tip).toContain("창구 매수 키움증권 +5.2만 · 매도 신한증권 +1.8만 · 깨짐확률 관찰 중");
  });
  it("lock 0 · 매도벽 0 · 자정 넘김 KST(15:00 UTC → 00:00:05)", () => {
    const tip = limitFeatureTooltip(
      feature({ lockState: 0, rateBp: 2680, wallKrwVisible: 0, gwTimeMs: Date.UTC(2026, 9, 5, 15, 0, 5) }),
    );
    expect(tip.split("\n")[0]).toBe("지금 미도달 (+26.8%) · 매도벽 0 · 상한가 13,000");
    expect(tip.endsWith("\n00:00:05 기준")).toBe(true);
  });
  it("gwTimeMs 0 → 시각 줄 없음 · 확률 적용이면 「깨짐확률은 60초 안」 줄만", () => {
    expect(limitFeatureTooltip({ ...full, gwTimeMs: 0 }).split("\n")[3]).toBe("깨짐확률은 60초 안");
    expect(limitFeatureTooltip({ ...full, gwTimeMs: 0, modelState: 0 }).split("\n")).toHaveLength(3);
  });
  it("pHorizonS 0 이면 확률이 있어도 꼬리 없음", () => {
    expect(limitFeatureTooltip({ ...full, pHorizonS: 0 }).endsWith("\n09:46:00 기준")).toBe(true);
  });
  it("85 없음(null) → 「」", () => {
    expect(limitFeatureTooltip(null)).toBe("");
  });
  it("폰 문구(narrow)는 툴팁에 쓰지 않는다 — 늘 넓은 밴드 문구", () => {
    expect(limitFeatureTooltip(full)).not.toContain("신규 +1.2만");
  });
});
