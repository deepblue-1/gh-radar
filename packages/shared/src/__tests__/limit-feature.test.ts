/**
 * Phase 28 (28-01) — 상한가 특징 85 숫자 함수 골든. WinForms `BuildLimitFeatureCells` · `FormatEok` ·
 * `FormatDuration` (gh-trade LimitChaserForm.cs 3738-3866) 과 글자 하나까지 같아야 한다.
 */
import { describe, expect, it } from "vitest";
import type { RelayLimitFeatureMsg } from "../relay";
import {
  formatClock,
  formatDuration,
  formatEok,
  formatGroup,
  formatRatePct,
  formatManQty,
  limitFeatureCells,
  limitFeatureRowHeads,
  limitFeatureTabSuffix,
  limitFeatureTooltip,
  limitFeatureLogParts,
  limitFeatureOfStrategyEvent,
  parseLimitFeatureMessage,
  roundPctHalfEven,
} from "../limit-feature";
import type { StrategyEventRow } from "../strategy-event";
import {
  STRATEGY_LIMIT_FEATURE_BY_NAME,
  STRATEGY_LIMIT_FEATURE_GOLDEN,
  STRATEGY_LIMIT_FEATURE_ROWS,
} from "../__fixtures__/strategy-day";

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
    lockSellKrw: 600_000_000,
    lockCancelKrw: 460_000_000,
    ...over,
  };
}

/** 툴팁 첫 줄 = 상태 줄(옛 지금 행 세 칸 — quick-261006-ide). */
const statusLine = (msg: RelayLimitFeatureMsg) => limitFeatureTooltip(msg).split("\n")[0];
const cumRow = (msg: RelayLimitFeatureMsg | null) => limitFeatureCells(msg).slice(0, 3);

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

describe("quick-261006-ide 상태 줄(툴팁 첫 줄 — 옛 지금 행, WinForms gp8)", () => {
  it("lock 1 · 43초 · 대기 17.3억 · drain −1 → 「잠김 43초째 · 대기 17.3억 · 소진 —」", () => {
    expect(statusLine(feature())).toBe("잠김 43초째 · 대기 17.3억 · 소진 —");
  });

  it("lock 1 · 경과 63초 · drain 95 → 「잠김 1분 3초째 · 대기 17.3억 · 소진 1분 35초」", () => {
    expect(statusLine(feature({ lockElapsedS: 63, drainS: 95 }))).toBe("잠김 1분 3초째 · 대기 17.3억 · 소진 1분 35초");
  });

  it("lock 2 · 대기 2.1억 · 매도벽 0.9억 잘림 → 「깨짐 · 대기 2.1억 · 매도벽 0.9억+」", () => {
    const msg = feature({ lockState: 2, lockElapsedS: 0, qKrw: 210_000_000, wallKrwVisible: 90_000_000, wallTruncated: true });
    expect(statusLine(msg)).toBe("깨짐 · 대기 2.1억 · 매도벽 0.9억+");
  });

  it("lock 0 · +26.8% · 매도벽 4.2억 잘림 · 상한가 13000 → 「미도달 (+26.8%) · 매도벽 4.2억+ · 상한가 13,000」", () => {
    const msg = feature({ lockState: 0, lockElapsedS: 0, rateBp: 2680, wallKrwVisible: 420_000_000, wallTruncated: true });
    expect(statusLine(msg)).toBe("미도달 (+26.8%) · 매도벽 4.2억+ · 상한가 13,000");
  });

  it("lock 0 · upper 0 → 「상한가 —」 · wall 0 → 「매도벽 0」", () => {
    const msg = feature({ lockState: 0, rateBp: 2680, upperPx: 0, wallKrwVisible: 0, wallTruncated: false });
    expect(statusLine(msg)).toBe("미도달 (+26.8%) · 매도벽 0 · 상한가 —");
  });

  it("단일가 + lock 1 → 「단일가 · 잠김 43초째 · …」 · 단일가 + lock 0 → 「단일가 · 미도달 (+26.8%) · …」", () => {
    expect(statusLine(feature({ auction: true }))).toBe("단일가 · 잠김 43초째 · 대기 17.3억 · 소진 —");
    expect(statusLine(feature({ auction: true, lockState: 0, rateBp: 2680 }))).toMatch(/^단일가 · 미도달 \(\+26\.8%\) · /);
  });

  it("상태는 표 칸에 없다 — 9칸 어디에도 「잠김 43초째」 · 「대기」 가 없다", () => {
    const texts = limitFeatureCells(feature()).map((c) => c.text);
    expect(texts).not.toContain("잠김 43초째");
    expect(texts.some((t) => t.startsWith("대기 "))).toBe(false);
  });

  it("null(85 없음) → 9칸 모두 { text: 「—」, tone: faint } · 굵기 필드 없음", () => {
    const cells = limitFeatureCells(null);
    expect(cells).toHaveLength(9);
    for (const c of cells) expect(c).toEqual({ text: "—", tone: "faint", narrow: null });
  });
});

describe("quick-261006-ide limitFeatureCells — 누적 행 (WinForms f1j 동형)", () => {
  it("lock 1 · 매도 6.0억 · 취소 4.6억 · 대기 17.3억 → 「매도 6.0억」(down) · 「취소 4.6억」(down) · 「위험도 35%」(fg)", () => {
    expect(cumRow(feature())).toEqual([
      { text: "매도 6.0억", tone: "down", narrow: null },
      { text: "취소 4.6억", tone: "down", narrow: null },
      { text: "위험도 35%", tone: "fg", narrow: null },
    ]);
  });
  it("lock 1 · 두 금액 0 → 「매도 0」 · 「취소 0」 · 「위험도 0%」(잠김 중은 0 이어도 숫자)", () => {
    expect(cumRow(feature({ lockSellKrw: 0, lockCancelKrw: 0 })).map((c) => c.text)).toEqual(["매도 0", "취소 0", "위험도 0%"]);
  });
  it("lock 1 · qKrw 0 → 「위험도 —」", () => {
    expect(cumRow(feature({ qKrw: 0 }))[2]).toEqual({ text: "위험도 —", tone: "fg", narrow: null });
  });
  it("lock 2 · qKrw 2.1억 → 「위험도 286%」(100% 초과 그대로)", () => {
    expect(cumRow(feature({ lockState: 2, lockElapsedS: 0, qKrw: 210_000_000 })).map((c) => c.text)).toEqual([
      "매도 6.0억",
      "취소 4.6억",
      "위험도 286%",
    ]);
  });
  it("lock 2 · 두 금액 0 → 「—」 ×3(fg) · lock 0 → 「—」 ×3", () => {
    const dash = { text: "—", tone: "fg", narrow: null };
    expect(cumRow(feature({ lockState: 2, lockSellKrw: 0, lockCancelKrw: 0 }))).toEqual([dash, dash, dash]);
    expect(cumRow(feature({ lockState: 0 }))).toEqual([dash, dash, dash]);
  });
  it("lock 2 · 한쪽만 0 이면 숫자 — 매도 0 · 취소 4.6억", () => {
    expect(cumRow(feature({ lockState: 2, lockSellKrw: 0 })).map((c) => c.text)).toEqual(["매도 0", "취소 4.6억", "위험도 0%"]);
  });
  it("위험도는 짝수 반올림 — 125/1000 → 12% · 135/1000 → 14%", () => {
    expect(cumRow(feature({ lockSellKrw: 125, qKrw: 1000 }))[2]!.text).toBe("위험도 12%");
    expect(cumRow(feature({ lockSellKrw: 135, qKrw: 1000 }))[2]!.text).toBe("위험도 14%");
  });
  it("85 가 있으면 10초 · 창구 행 6칸도 채운다(28-07) — 「—」 자리표시가 남지 않는다", () => {
    const rest = limitFeatureCells(feature()).slice(3);
    expect(rest).toHaveLength(6);
    expect(rest.map((c) => c.text)).not.toContain("—");
  });
});

describe("quick-261006-ide formatClock — WinForms FormatClock(누적 행 머리 경과)", () => {
  it("0 → 「0:00」 · 43 → 「0:43」 · 63 → 「1:03」 · 3920 → 「1:05:20」 · -5 → 「0:00」", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(43)).toBe("0:43");
    expect(formatClock(63)).toBe("1:03");
    expect(formatClock(3920)).toBe("1:05:20");
    expect(formatClock(-5)).toBe("0:00");
  });
  it("3600 → 「1:00:00」 · 3599 → 「59:59」", () => {
    expect(formatClock(3600)).toBe("1:00:00");
    expect(formatClock(3599)).toBe("59:59");
  });
});

describe("quick-261006-ide limitFeatureRowHeads — 누적 행 머리 경과 덮어쓰기", () => {
  it("lock 1 · 43 → [「0:43」 elapsed, 「10초」, 「창구」]", () => {
    expect(limitFeatureRowHeads(feature())).toEqual([
      { text: "0:43", elapsed: true },
      { text: "10초", elapsed: false },
      { text: "창구", elapsed: false },
    ]);
  });
  it("lock 2 · lock 0 · null → 기본 머리 「누적」", () => {
    const base = [
      { text: "누적", elapsed: false },
      { text: "10초", elapsed: false },
      { text: "창구", elapsed: false },
    ];
    expect(limitFeatureRowHeads(feature({ lockState: 2, lockElapsedS: 0 }))).toEqual(base);
    expect(limitFeatureRowHeads(feature({ lockState: 0 }))).toEqual(base);
    expect(limitFeatureRowHeads(null)).toEqual(base);
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
    expect(row10({})[0]).toEqual({ text: "매수 우세 63%", tone: "up", narrow: null });
  });
  it("sell 8,200 · buy 3,000 → 「매도 우세 73%」(down)", () => {
    expect(row10({ sellLed10s: 8200, buyLed10s: 3000 })[0]).toEqual({
      text: "매도 우세 73%",
      tone: "down",
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
      narrow: null,
    });
    expect(row10({ sellLed10s: 0, buyLed10s: 0 })[0]).toEqual({ text: "체결 없음", tone: "fg", narrow: null });
  });

  it("lock 1 → 「잔량 신규 +12,400」 / 폰 「신규 +1.2만」 · 「잔량 취소 -2,300」(down) / 폰 「취소 -2,300」", () => {
    const [, n, c] = row10({});
    expect(n).toEqual({ text: "잔량 신규 +12,400", tone: "fg", narrow: "신규 +1.2만" });
    expect(c).toEqual({ text: "잔량 취소 -2,300", tone: "down", narrow: "취소 -2,300" });
  });
  it("lock 1 · new 0 · cancel 0 → 「잔량 신규 0」 / 「신규 0」 · 「잔량 취소 0」(down) / 「취소 0」", () => {
    const [, n, c] = row10({ new10s: 0, cancel10s: 0 });
    expect(n).toEqual({ text: "잔량 신규 0", tone: "fg", narrow: "신규 0" });
    expect(c).toEqual({ text: "잔량 취소 0", tone: "down", narrow: "취소 0" });
  });
  it("lock 1 · 취소 큰 수 → 폰 「취소 -1.5만」", () => {
    expect(row10({ cancel10s: 15000 })[2]!.narrow).toBe("취소 -1.5만");
  });

  it("lock 0 · lock 2 → 「체결 19,400주」(narrow null) · 「—」(fg)", () => {
    for (const lockState of [0, 2]) {
      const [, n, c] = row10({ lockState, lockElapsedS: 0, sellLed10s: 8200, buyLed10s: 11200 });
      expect(n).toEqual({ text: "체결 19,400주", tone: "fg", narrow: null });
      expect(c).toEqual({ text: "—", tone: "fg", narrow: null });
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
    expect(b).toEqual({ text: "매수 키움증권 +5.2만", tone: "up", narrow: null });
  });
  it("빈 배열 · 전부 빈 회원번호 → 「매수 —」 · 「매도 —」(fg)", () => {
    const [b, s] = rowM({ memberBuy: [], memberSell: [member("", 1000)] });
    expect(b).toEqual({ text: "매수 —", tone: "fg", narrow: null });
    expect(s).toEqual({ text: "매도 —", tone: "fg", narrow: null });
  });
  it("매도 신한증권 +1.8만(down) · 6자리 회원번호 · 미매핑 번호 · 1만 미만", () => {
    expect(rowM({ memberSell: [member("00002", 18000)] })[1]).toEqual({
      text: "매도 신한증권 +1.8만",
      tone: "down",
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
      narrow: null,
    });
    expect(rowM({ modelState: 1, pBreakBp: 0, pHorizonS: 60 })[2]!.text).toBe("깨짐확률 0.0%");
    expect(rowM({ modelState: 1, pBreakBp: 10000, pHorizonS: 60 })[2]!.text).toBe("깨짐확률 100.0%");
  });
  it("model 1 · pBreak −1 · model 0 → 「깨짐확률 관찰 중」(muted)", () => {
    const watching = { text: "깨짐확률 관찰 중", tone: "muted", narrow: null };
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
      "매도 6.0억",
      "취소 4.6억",
      "위험도 —",
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

  it("lock 1 · 확률 적용 → 상태 줄 + 넓은 밴드 문구 3줄 + 「09:46:00 기준 · 깨짐확률은 60초 안」", () => {
    expect(limitFeatureTooltip(full)).toBe(
      "잠김 43초째 · 대기 17.3억 · 소진 —\n" +
        "누적 매도 6.0억 · 취소 4.6억 · 위험도 35%\n" +
        "10초 매수 우세 63% · 잔량 신규 +12,400 · 잔량 취소 -2,300\n" +
        "창구 매수 키움증권 +5.2만 · 매도 신한증권 +1.8만 · 깨짐확률 18.3%\n" +
        "09:46:00 기준 · 깨짐확률은 60초 안",
    );
  });
  it("model 0 → 마지막 줄 「09:46:00 기준」 만 · 밀리초는 잘라낸다", () => {
    const tip = limitFeatureTooltip({ ...full, modelState: 0, pBreakBp: -1, pHorizonS: 0, gwTimeMs: GW_0946_KST + 999 });
    expect(tip.split("\n")).toHaveLength(5);
    expect(tip.endsWith("\n09:46:00 기준")).toBe(true);
    expect(tip).toContain("창구 매수 키움증권 +5.2만 · 매도 신한증권 +1.8만 · 깨짐확률 관찰 중");
  });
  it("lock 0 · 매도벽 0 · 자정 넘김 KST(15:00 UTC → 00:00:05)", () => {
    const tip = limitFeatureTooltip(
      feature({ lockState: 0, rateBp: 2680, wallKrwVisible: 0, gwTimeMs: Date.UTC(2026, 9, 5, 15, 0, 5) }),
    );
    expect(tip.split("\n")[0]).toBe("미도달 (+26.8%) · 매도벽 0 · 상한가 13,000");
    expect(tip.split("\n")[1]).toBe("누적 — · — · —");
    expect(tip.endsWith("\n00:00:05 기준")).toBe(true);
  });
  it("gwTimeMs 0 → 시각 줄 없음 · 확률 적용이면 「깨짐확률은 60초 안」 줄만", () => {
    expect(limitFeatureTooltip({ ...full, gwTimeMs: 0 }).split("\n")[4]).toBe("깨짐확률은 60초 안");
    expect(limitFeatureTooltip({ ...full, gwTimeMs: 0, modelState: 0 }).split("\n")).toHaveLength(4);
  });
  it("pHorizonS 0 이면 확률이 있어도 꼬리 없음", () => {
    expect(limitFeatureTooltip({ ...full, pHorizonS: 0 }).endsWith("\n09:46:00 기준")).toBe(true);
  });
  it("85 없음(null) → 「」", () => {
    expect(limitFeatureTooltip(null)).toBe("");
  });
  it("툴팁 줄 머리는 늘 기본 머리 — 잠김 중에도 「누적」(경과 「0:43」 아님)", () => {
    expect(limitFeatureTooltip(full).split("\n")[1]).toMatch(/^누적 /);
    expect(limitFeatureTooltip(full)).not.toContain("0:43");
  });
  it("폰 문구(narrow)는 툴팁에 쓰지 않는다 — 늘 넓은 밴드 문구", () => {
    expect(limitFeatureTooltip(full)).not.toContain("신규 +1.2만");
  });
});

describe("Phase 28 kind 15 되돌림 · 문장 (28-09 · UI-SPEC ②-2)", () => {
  const lf = (name: string, over: Partial<StrategyEventRow> = {}): StrategyEventRow => ({
    ...STRATEGY_LIMIT_FEATURE_BY_NAME[name]!,
    ...over,
  });

  describe("parseLimitFeatureMessage — total (지어내지 않는다)", () => {
    it("정상 — 매수 3 · 매도 1 · model 0", () => {
      expect(parseLimitFeatureMessage("buy:00047=7407,00046=2222,00048=370;sell:00003=10000|m=0")).toEqual({
        buy: [
          { member: "00047", shareBp: 7407 },
          { member: "00046", shareBp: 2222 },
          { member: "00048", shareBp: 370 },
        ],
        sell: [{ member: "00003", shareBp: 10000 }],
        modelState: 0,
      });
    });

    it("256B 경계에서 잘린 꼬리 원소(= 없음)는 버린다 · |m= 없음 → modelState null", () => {
      expect(parseLimitFeatureMessage("buy:00047=7407,0004")).toEqual({
        buy: [{ member: "00047", shareBp: 7407 }],
        sell: [],
        modelState: null,
      });
    });

    it("「|m」 에 = 이 없으면 modelState null · 앞 갈래는 온전하다", () => {
      expect(parseLimitFeatureMessage("buy:00047=7407;sell:00003=100|m")).toEqual({
        buy: [{ member: "00047", shareBp: 7407 }],
        sell: [{ member: "00003", shareBp: 100 }],
        modelState: null,
      });
    });

    it("종결자 「|」 없이 끝나면 마지막 원소는 숫자가 잘렸을 수 있어 버린다(「=74」 를 1% 로 지어내지 않는다)", () => {
      expect(parseLimitFeatureMessage("buy:00047=7407;sell:00003=74")).toEqual({
        buy: [{ member: "00047", shareBp: 7407 }],
        sell: [],
        modelState: null,
      });
    });

    it("빈 문자열 · 쓰레기 → 빈 결과(throw 없음)", () => {
      const empty = { buy: [], sell: [], modelState: null };
      expect(parseLimitFeatureMessage("")).toEqual(empty);
      expect(parseLimitFeatureMessage("xyz")).toEqual(empty);
      expect(parseLimitFeatureMessage("|m=")).toEqual(empty);
      expect(parseLimitFeatureMessage(";;,,==|m=x")).toEqual(empty);
    });

    it("bp 가 0~10000 정수가 아니거나 = 가 둘 이상 · 회원 없음인 원소는 버린다", () => {
      expect(
        parseLimitFeatureMessage("buy:00047=10001,00046=-5,00045=1.5,00044==3,=500,00043=abc,00042=0;sell:|m=1"),
      ).toEqual({ buy: [{ member: "00042", shareBp: 0 }], sell: [], modelState: 1 });
    });
  });

  describe("limitFeatureOfStrategyEvent — 슬롯 → 85 이름 (특징 사전 ③)", () => {
    it("잠김 행 → RelayLimitFeatureMsg (창구는 dQty 0 · shareBp 만)", () => {
      const row = lf("lfLocked43", { message: "buy:00050=7407;sell:00002=10000|m=0" });
      expect(limitFeatureOfStrategyEvent(row)).toEqual({
        t: "limit.feature",
        i: "KR7005930003",
        x: "KRX",
        gwTimeMs: row.gwTimeMs,
        featureSchema: 1,
        upperPx: 13_000,
        lastPx: 13_000,
        rateBp: 3_000,
        basePx: 0,
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
        memberBuy: [{ memberNo: "00050", dQty: 0, dValue: 0, shareBp: 7407 }],
        memberSell: [{ memberNo: "00002", dQty: 0, dValue: 0, shareBp: 10000 }],
        memberDeltaPartial: false,
        modelState: 0,
        modelSchemaVersion: 0,
        pBreakBp: -1,
        pHorizonS: 0,
        lockSellKrw: 0,
        lockCancelKrw: 0,
      });
    });

    it("modelState = snap_qty 길이(원소 값 무시) · 매도벽 잘림 · 단일가 · 단일가 빠짐", () => {
      const m = limitFeatureOfStrategyEvent(
        lf("lfNotReached", { snapQty: [0], openAtLimit: true, askQtyAtLimit: 15_000, hasRemaining: true, expectedCum: 900 }),
      );
      expect(m).toMatchObject({ modelState: 1, wallTruncated: true, wallQtyHidden: 15_000, auction: true, auctionFill10s: 900 });
    });
  });

  describe("limitFeatureLogParts — lead · body", () => {
    it("잠김 — UI-SPEC ②-2 예문 그대로", () => {
      expect(limitFeatureLogParts(lf("lfLocked43", { message: "buy:00050=7407;sell:00002=10000|m=0" }))).toEqual({
        lead: "잠김 43초",
        body: "잔량 17.3억 · 매도벽 0 · 소진 — · 10초 매수 우세 63% · 신규 +12,400 / 취소 -2,300 · 창구 매수 키움증권 74% / 매도 신한증권 100% · 깨짐확률 관찰 중",
      });
    });

    it("깨짐(lock 2) → lead null · 「깨짐」 이 본문 첫 조각 · 체결 합", () => {
      const p = limitFeatureLogParts(lf("lfBroken"));
      expect(p.lead).toBeNull();
      expect(p.body).toBe(
        "깨짐 · 잔량 2.1억 · 매도벽 0.9억 · 소진 1분 35초 · 10초 매도 우세 74% · 체결 19,400주 · 창구 매수 키움증권 74% / 매도 신한증권 80% · 깨짐확률 18.3%",
      );
    });

    it("미도달(lock 0) → 「미도달 (+26.8%) · 매도벽 4.2억+ · 상한가 13,000 · … · 체결 N주」", () => {
      const p = limitFeatureLogParts(lf("lfNotReached"));
      expect(p.lead).toBeNull();
      expect(p.body).toBe(
        "미도달 (+26.8%) · 매도벽 4.2억+ · 상한가 13,000 · 10초 매수 우세 70% · 체결 4,000주 · 창구 매수 키움증권 60% / 매도 신한증권 100% · 깨짐확률 관찰 중",
      );
    });

    it("미도달 · 상한가 0(미상) → 「상한가 —」", () => {
      expect(limitFeatureLogParts(lf("lfNotReached", { evPrice: 0 })).body).toContain("상한가 — · ");
    });

    it("단일가 — 잠김이면 lead 앞 「단일가 · 」, 미도달이면 본문 맨 앞", () => {
      expect(limitFeatureLogParts(lf("lfLocked43", { hasRemaining: true })).lead).toBe("단일가 · 잠김 43초");
      expect(limitFeatureLogParts(lf("lfNotReached", { hasRemaining: true })).body).toMatch(/^단일가 · 미도달 \(\+26\.8%\) · /);
      expect(limitFeatureLogParts(lf("lfBroken", { hasRemaining: true })).body).toMatch(/^단일가 · 깨짐 · /);
    });

    it("확률 — snap 길이 1 · result 1830 → 「깨짐확률 18.3%」, snap 0 이면 값이 있어도 「관찰 중」", () => {
      expect(limitFeatureLogParts(lf("lfLocked43", { snapQty: [1], resultCode: 1830 })).body).toMatch(/ · 깨짐확률 18\.3%$/);
      expect(limitFeatureLogParts(lf("lfLocked43", { snapQty: [], resultCode: 1830 })).body).toMatch(/ · 깨짐확률 관찰 중$/);
      expect(limitFeatureLogParts(lf("lfLocked43", { snapQty: [1], resultCode: -1 })).body).toMatch(/ · 깨짐확률 관찰 중$/);
    });

    it("창구 한쪽 없음 → 「매수 —」/「매도 —」 · message 없음 → 둘 다 —", () => {
      expect(limitFeatureLogParts(lf("lfLocked43", { message: "buy:00050=7407|m=0" })).body).toContain(
        "창구 매수 키움증권 74% / 매도 —",
      );
      expect(limitFeatureLogParts(lf("lfLocked43", { message: "sell:00002=10000|m=0" })).body).toContain(
        "창구 매수 — / 매도 신한증권 100%",
      );
      expect(limitFeatureLogParts(lf("lfAuctionLocked")).body).toContain("창구 매수 — / 매도 —");
    });

    it("창구 % 는 share_bp ÷ 100 반올림(.5 올림) · 매핑 없는 회원은 번호 그대로", () => {
      expect(limitFeatureLogParts(lf("lfLocked43", { message: "buy:00050=7450;sell:99998=49|m=0" })).body).toContain(
        "창구 매수 키움증권 75% / 매도 99998 0%",
      );
    });

    it("잠김 · 신규/취소 0 → 「신규 0 / 취소 0」, 10초 체결 0 → 「10초 체결 없음」", () => {
      expect(limitFeatureLogParts(lf("lfAuctionLocked")).body).toContain("10초 체결 없음 · 신규 0 / 취소 0 · ");
    });

    it("잘린 message 행 — 매수 상위 1 만 · 매도 —", () => {
      expect(limitFeatureLogParts(lf("lfTruncatedMessage")).body).toContain("창구 매수 키움증권 74% / 매도 —");
    });
  });

  describe("픽스처 한 벌 — STRATEGY_LIMIT_FEATURE_ROWS · GOLDEN", () => {
    it("모든 행이 kind 15 · group 0 · 계좌 · 주문번호 없음 · 시각 오름차순 · 골든 이름과 1:1", () => {
      expect(STRATEGY_LIMIT_FEATURE_ROWS.length).toBe(Object.keys(STRATEGY_LIMIT_FEATURE_GOLDEN).length);
      expect(Object.keys(STRATEGY_LIMIT_FEATURE_BY_NAME).sort()).toEqual(Object.keys(STRATEGY_LIMIT_FEATURE_GOLDEN).sort());
      for (const r of STRATEGY_LIMIT_FEATURE_ROWS) {
        expect(r).toMatchObject({ kind: 15, group: 0, accountNo: "", orderNo: "" });
      }
      const times = STRATEGY_LIMIT_FEATURE_ROWS.map((r) => r.gwTimeMs);
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    });

    it("골든 문장 칸 = lead · body 를 「 · 」 로 이은 것", () => {
      for (const [name, line] of Object.entries(STRATEGY_LIMIT_FEATURE_GOLDEN)) {
        const { lead, body } = limitFeatureLogParts(STRATEGY_LIMIT_FEATURE_BY_NAME[name]!);
        expect(line).toContain(` | ${lead ? `${lead} · ` : ""}${body} | `);
      }
    });
  });
});
