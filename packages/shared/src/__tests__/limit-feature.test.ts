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
  limitFeatureCells,
  limitFeatureTabSuffix,
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

  it("85 가 있어도 10초 · 창구 행 6칸은 이 플랜에서 「—」(faint) — 28-07 이 채운다", () => {
    const rest = limitFeatureCells(feature()).slice(3);
    expect(rest).toHaveLength(6);
    for (const c of rest) expect(c).toEqual({ text: "—", tone: "faint", strong: false, narrow: null });
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
