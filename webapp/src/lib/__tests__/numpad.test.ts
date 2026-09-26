import { describe, expect, it } from "vitest";

import {
  applyPadChip,
  canConfirmPad,
  formatPadDisplay,
  PAD_CHIPS,
  PAD_MAX_DIGITS,
  padChipDisabled,
  padInit,
  padIssue,
  padKey,
  padValue,
  padWarning,
  priceIssueText,
  stepValue,
  type PadChip,
  type PadCtx,
  type PadState,
  type PadUnit,
} from "../numpad";

/**
 * Phase 20 Plan 02 Task 2 — 자체 키패드 규칙 한 벌 (D-14c · D-15 · D-16 · D-17).
 *
 * 잠그는 명제:
 *  ① 열린 직후(fresh) 첫 키는 값을 통째로 바꾼다 · 첫 키가 ⌫/「00」이면 빈 값
 *  ② 「00」은 빈 값·「0」 뒤에서 무시 · 「0」 다음 숫자는 0 을 대체 · 9자리 초과 무시
 *  ③ 칩은 단위로 고르고(D-17), 누르면 fresh 가 풀리고, 9자리를 넘기면 버퍼를 바꾸지 않는다
 *  ④ 검증 문구는 UI-SPEC 원문이며 값을 보정하지 않는다(D-15)
 *  ⑤ ↑↓ 스텝은 원 = ±1호가, 그 밖 ±1, [0, 999,999,999]
 */

const s = (buf: string, fresh = false): PadState => ({ buf, fresh });
const chip = (unit: PadUnit, label: string): PadChip => {
  const c = PAD_CHIPS[unit].find((x) => x.label === label);
  if (!c) throw new Error(`칩 없음: ${unit} ${label}`);
  return c;
};
const WON: PadCtx = { current: 98_100, upper: 127_400 };
const NONE: PadCtx = { current: 0, upper: 0 };

describe("padInit — 열린 직후는 fresh(전체 선택)", () => {
  it("값이 있으면 그 숫자 문자열 · fresh true", () => {
    expect(padInit(127_400)).toEqual({ buf: "127400", fresh: true });
  });

  it("0 은 '0' · null 은 빈 값", () => {
    expect(padInit(0)).toEqual({ buf: "0", fresh: true });
    expect(padInit(null)).toEqual({ buf: "", fresh: true });
  });
});

describe("padKey — fresh 첫 입력 (D-14c)", () => {
  it("첫 숫자 키는 값을 통째로 바꾼다", () => {
    expect(padKey(s("127400", true), "5")).toEqual({ buf: "5", fresh: false });
  });

  it.each(["back", "00"] as const)("첫 키가 %s 이면 빈 값", (k) => {
    expect(padKey(s("127400", true), k)).toEqual({ buf: "", fresh: false });
  });
});

describe("padKey — 이어 입력 (D-16 · 입력 한도)", () => {
  it.each([
    ["", "00", ""],
    ["0", "00", "0"],
    ["0", "5", "5"],
    ["0", "0", "0"],
    ["12", "back", "1"],
    ["", "back", ""],
    ["12", "00", "1200"],
    ["12", "3", "123"],
    ["123456789", "1", "123456789"],
    ["12345678", "00", "12345678"],
  ] as const)("'%s' + %s → '%s'", (buf, key, want) => {
    expect(padKey(s(buf), key)).toEqual({ buf: want, fresh: false });
  });

  it("상한은 9자리다", () => {
    expect(PAD_MAX_DIGITS).toBe(9);
  });
});

describe("PAD_CHIPS — 단위별 구성 (D-17)", () => {
  it.each([
    ["원", ["−1호가", "+1호가", "현재가", "상한가"]],
    ["주", ["+100", "+1,000", "+10,000", "지우기"]],
    ["%", ["10", "30", "50", "100"]],
    ["만원", ["천만", "오천만", "1억", "지우기"]],
    ["건", ["1", "3", "5", "지우기"]],
    ["회", ["1", "3", "5", "10"]],
  ] as const)("%s 칩 = %j", (unit, labels) => {
    expect(PAD_CHIPS[unit].map((c) => c.label)).toEqual(labels);
  });

  it("접근성 이름 — −1호가 「1호가 내리기」 · +1호가 「1호가 올리기」 · 지우기 「전부 지우기」", () => {
    expect(chip("원", "−1호가").ariaLabel).toBe("1호가 내리기");
    expect(chip("원", "+1호가").ariaLabel).toBe("1호가 올리기");
    for (const u of ["주", "만원", "건"] as const) {
      expect(chip(u, "지우기").ariaLabel).toBe("전부 지우기");
    }
  });

  it("만원 칩 접근성 이름 — 천만 「1,000만원 더하기」 · 오천만 「5,000만원 더하기」 · 1억 「1억원 더하기」 (G-21-R3-3)", () => {
    expect(chip("만원", "천만").ariaLabel).toBe("1,000만원 더하기");
    expect(chip("만원", "오천만").ariaLabel).toBe("5,000만원 더하기");
    expect(chip("만원", "1억").ariaLabel).toBe("1억원 더하기");
  });
});

describe("applyPadChip — 원 (±1호가 · 현재가 · 상한가)", () => {
  it("−1호가 on 2,000 → 1,999 (경계에서 정확)", () => {
    expect(applyPadChip(s("2000"), chip("원", "−1호가"), WON).buf).toBe("1999");
  });

  it("+1호가 on 98,100 → 98,200", () => {
    expect(applyPadChip(s("98100"), chip("원", "+1호가"), WON).buf).toBe("98200");
  });

  it("현재가 → 98,100 · 상한가 → 127,400", () => {
    expect(applyPadChip(s("5"), chip("원", "현재가"), WON).buf).toBe("98100");
    expect(applyPadChip(s("5"), chip("원", "상한가"), WON).buf).toBe("127400");
  });

  it("빈 값에서 +1호가 → 1", () => {
    expect(applyPadChip(s(""), chip("원", "+1호가"), WON).buf).toBe("1");
  });

  it("칩을 누르면 fresh 가 풀리고 현재 값 기준으로 적용된다", () => {
    expect(applyPadChip(s("98100", true), chip("원", "+1호가"), WON)).toEqual({
      buf: "98200",
      fresh: false,
    });
  });

  it("상한 초과로 가는 칩도 값을 보정하지 않는다 (검증이 잠근다)", () => {
    const out = applyPadChip(s("127400"), chip("원", "+1호가"), WON);
    expect(out.buf).toBe("127500");
    expect(padIssue(out, "원", WON)).toBe("상한가 127,400원을 넘을 수 없어요");
  });
});

describe("applyPadChip — 주 · 만원 · % · 건 · 회", () => {
  it("주 +1,000 on 10,000 → 11,000 · 지우기 → 빈 값", () => {
    expect(applyPadChip(s("10000"), chip("주", "+1,000"), NONE).buf).toBe("11000");
    expect(applyPadChip(s("10000"), chip("주", "지우기"), NONE).buf).toBe("");
  });

  it("만원 천만 on 100 → 1100 (만원 단위 +1,000 · G-21-R3-3)", () => {
    expect(applyPadChip(s("100"), chip("만원", "천만"), NONE).buf).toBe("1100");
  });

  it("만원 1억 on 빈 값 → 10000 · 오천만 on 0 → 5000", () => {
    expect(applyPadChip(s(""), chip("만원", "1억"), NONE).buf).toBe("10000");
    expect(applyPadChip(s("0"), chip("만원", "오천만"), NONE).buf).toBe("5000");
  });

  it("만원 오천만 — 999,994,999 → 999,999,999(상한 도달) · 999,995,000 은 9자리 초과라 그대로", () => {
    expect(applyPadChip(s("999994999"), chip("만원", "오천만"), NONE).buf).toBe("999999999");
    expect(applyPadChip(s("999995000"), chip("만원", "오천만"), NONE).buf).toBe("999995000");
  });

  it("% 30 · 건 5 · 회 10 은 값 설정", () => {
    expect(applyPadChip(s("77"), chip("%", "30"), NONE).buf).toBe("30");
    expect(applyPadChip(s("77"), chip("건", "5"), NONE).buf).toBe("5");
    expect(applyPadChip(s("7"), chip("회", "10"), { ...NONE, maxPieces: 10 }).buf).toBe("10");
  });

  it("결과가 9자리를 넘는 칩은 버퍼를 바꾸지 않는다 (999,999,999 + 10,000)", () => {
    expect(applyPadChip(s("999999999"), chip("주", "+10,000"), NONE).buf).toBe("999999999");
  });
});

describe("padChipDisabled — 시세 미수신 · 조각 한도", () => {
  it("current 0 → 현재가 비활성 · upper 0 → 상한가 비활성", () => {
    expect(padChipDisabled(chip("원", "현재가"), { current: 0, upper: 127_400 })).toBe(true);
    expect(padChipDisabled(chip("원", "상한가"), { current: 98_100, upper: 0 })).toBe(true);
    expect(padChipDisabled(chip("원", "현재가"), WON)).toBe(false);
    expect(padChipDisabled(chip("원", "상한가"), WON)).toBe(false);
  });

  it("±1호가 는 시세와 무관하게 활성", () => {
    expect(padChipDisabled(chip("원", "−1호가"), NONE)).toBe(false);
    expect(padChipDisabled(chip("원", "+1호가"), NONE)).toBe(false);
  });

  it("회 maxPieces 5 → 칩 10 비활성 · 5 활성", () => {
    const ctx = { ...NONE, maxPieces: 5 };
    expect(padChipDisabled(chip("회", "10"), ctx)).toBe(true);
    expect(padChipDisabled(chip("회", "5"), ctx)).toBe(false);
  });

  it("비활성 칩은 눌려도 버퍼를 바꾸지 않는다", () => {
    expect(applyPadChip(s("5"), chip("원", "현재가"), NONE).buf).toBe("5");
  });
});

describe("padValue · formatPadDisplay", () => {
  it("빈 값 → null · 숫자 문자열 → 수", () => {
    expect(padValue(s(""))).toBeNull();
    expect(padValue(s("0"))).toBe(0);
    expect(padValue(s("1274000"))).toBe(1_274_000);
  });

  it("ko-KR 천 단위 쉼표 · 빈 값은 빈 문자열", () => {
    expect(formatPadDisplay(s("1274000"))).toBe("1,274,000");
    expect(formatPadDisplay(s("999999999"))).toBe("999,999,999");
    expect(formatPadDisplay(s(""))).toBe("");
  });
});

describe("priceIssueText · padIssue — UI-SPEC 카피 원문 (D-15)", () => {
  it("priceIssueText 두 문구", () => {
    expect(priceIssueText({ kind: "overUpper", upper: 127_400 })).toBe(
      "상한가 127,400원을 넘을 수 없어요",
    );
    expect(priceIssueText({ kind: "offTick", tick: 1_000, lower: 1_274_000, upper: 1_275_000 })).toBe(
      "1,000원 단위로 입력해 주세요 · 가까운 값 1,274,000 / 1,275,000",
    );
  });

  it("원: 98,150 → 단위 문구 · 127,500 → 상한가 문구", () => {
    expect(padIssue(s("98150"), "원", WON)).toBe(
      "100원 단위로 입력해 주세요 · 가까운 값 98,100 / 98,200",
    );
    expect(padIssue(s("127500"), "원", WON)).toBe("상한가 127,400원을 넘을 수 없어요");
  });

  it("원: 빈 값 · 0 은 검증하지 않는다", () => {
    expect(padIssue(s(""), "원", WON)).toBeNull();
    expect(padIssue(s("0"), "원", WON)).toBeNull();
  });

  it("회(maxPieces 5): 0 → 1회 이상 · 7 → 최대 5회 · 3 → 문제 없음", () => {
    const ctx = { ...NONE, maxPieces: 5 };
    expect(padIssue(s("0"), "회", ctx)).toBe("1회 이상 입력해 주세요");
    expect(padIssue(s("7"), "회", ctx)).toBe("최대 5회까지 나눌 수 있어요");
    expect(padIssue(s("3"), "회", ctx)).toBeNull();
    expect(padIssue(s(""), "회", ctx)).toBeNull();
  });

  it("다른 단위는 검증 문구가 없다", () => {
    expect(padIssue(s("98150"), "주", WON)).toBeNull();
  });

  it("검증은 버퍼를 바꾸지 않는다 (자동 보정 없음)", () => {
    const st = s("98150");
    padIssue(st, "원", WON);
    expect(st).toEqual({ buf: "98150", fresh: false });
  });
});

describe("canConfirmPad — 빈 값 · 검증 오류면 잠금", () => {
  it.each([
    ["", "주", false],
    ["0", "주", true],
    ["98150", "원", false],
    ["98100", "원", true],
    ["0", "회", false],
  ] as const)("'%s'(%s) → %s", (buf, unit, want) => {
    expect(canConfirmPad(s(buf), unit, { ...WON, maxPieces: 5 })).toBe(want);
  });
});

describe("stepValue — ↑↓ 스텝", () => {
  it.each([
    [127_400, "원", 1, 127_500],
    [2_000, "원", -1, 1_999],
    [1_999, "원", 1, 2_000],
    [0, "원", -1, 0],
    [0, "주", -1, 0],
    [10, "주", 1, 11],
    [999_999_999, "건", 1, 999_999_999],
    [999_999_999, "원", 1, 999_999_999],
  ] as const)("stepValue(%d, %s, %d) → %d", (v, unit, dir, want) => {
    expect(stepValue(v, unit, dir)).toBe(want);
  });
});

/**
 * 20-REVIEW CR-01 — relay `lc.set` 스키마 범위(매도비율 1~100 · 잔량추적 1~90 · 호가변경 0~255).
 * relay 는 범위 밖 프레임을 받으면 **WebSocket 연결을 끊는다** — 키패드가 그 값을 확인할 수 없어야 한다.
 */
describe("CR-01 — 필드 범위(ctx.min/max)가 확인을 잠그고 범위 밖 set 칩을 끈다", () => {
  const TRACK: PadCtx = { current: 0, upper: 0, min: 1, max: 90 };
  const RATIO: PadCtx = { current: 0, upper: 0, min: 1, max: 100 };
  const TICKS: PadCtx = { current: 0, upper: 0, min: 0, max: 255 };

  it.each([
    ["0", "%", TRACK, "1% 이상 입력해 주세요"],
    ["91", "%", TRACK, "최대 90%까지 입력할 수 있어요"],
    ["101", "%", RATIO, "최대 100%까지 입력할 수 있어요"],
    ["0", "%", RATIO, "1% 이상 입력해 주세요"],
    ["256", "건", TICKS, "최대 255건까지 입력할 수 있어요"],
  ] as const)("'%s'(%s) 범위 밖 → 문구 · 확인 잠금", (buf, unit, ctx, text) => {
    expect(padIssue(s(buf), unit, ctx)).toBe(text);
    expect(canConfirmPad(s(buf), unit, ctx)).toBe(false);
  });

  it.each([
    ["1", "%", TRACK],
    ["90", "%", TRACK],
    ["100", "%", RATIO],
    ["0", "건", TICKS],
    ["255", "건", TICKS],
  ] as const)("'%s'(%s) 경계 안 → 확인 가능", (buf, unit, ctx) => {
    expect(padIssue(s(buf), unit, ctx)).toBeNull();
    expect(canConfirmPad(s(buf), unit, ctx)).toBe(true);
  });

  it("잔량추적(최대 90) 시트의 「100」 칩은 비활성 · 눌러도 버퍼 불변 — 매도비율(최대 100)에서는 쓸 수 있다", () => {
    const chip = (label: string) => PAD_CHIPS["%"].find((c) => c.label === label)!;
    expect(padChipDisabled(chip("100"), TRACK)).toBe(true);
    expect(applyPadChip(s("50"), chip("100"), TRACK)).toEqual(s("50"));
    expect(padChipDisabled(chip("100"), RATIO)).toBe(false);
    for (const label of ["10", "30", "50"]) expect(padChipDisabled(chip(label), TRACK)).toBe(false);
  });

  it("범위가 없으면(가격·수량·금액) 기존 규칙 그대로다", () => {
    expect(padIssue(s("0"), "주", WON)).toBeNull();
    expect(padIssue(s("999999999"), "만원", WON)).toBeNull();
    expect(padIssue(s("98150"), "원", WON)).toBe("100원 단위로 입력해 주세요 · 가까운 값 98,100 / 98,200");
  });
});

/*
  D-15a (20-REVIEW WR-05) — 호가 단위 잠금 강도는 종목 분류가 가른다. 주식이면 잠그고, ETP·분류 불명이면
  경고만 한다. 상한가 초과는 분류와 무관하게 잠근다. 미지정 = 주식(조회 전 · 분류를 넘기지 않는 호출부).
*/
describe("D-15a — 호가 단위 잠금 강도(tickRule)", () => {
  // ETF 25,005원 — ETF 는 5원 단위가 유효할 수 있지만 주식 표로는 50원 구간 위반이다.
  const ETF_PRICE = "25005";
  const SOFT = "주식 호가 단위(50원)와 달라요 · 가까운 값 25,000 / 25,050";
  const LOCK = "50원 단위로 입력해 주세요 · 가까운 값 25,000 / 25,050";

  it("stock(명시) · 미지정 → 잠금(D-15 그대로) · 경고 없음", () => {
    for (const ctx of [{ ...WON, tickRule: "stock" as const }, WON]) {
      expect(padIssue(s(ETF_PRICE), "원", ctx)).toBe(LOCK);
      expect(canConfirmPad(s(ETF_PRICE), "원", ctx)).toBe(false);
      expect(padWarning(s(ETF_PRICE), "원", ctx)).toBeNull();
    }
  });

  it.each(["etp", "unknown"] as const)("%s → 잠그지 않고 경고만(확인 가능)", (tickRule) => {
    const ctx: PadCtx = { ...WON, tickRule };
    expect(padIssue(s(ETF_PRICE), "원", ctx)).toBeNull();
    expect(canConfirmPad(s(ETF_PRICE), "원", ctx)).toBe(true);
    expect(padWarning(s(ETF_PRICE), "원", ctx)).toBe(SOFT);
  });

  it.each(["stock", "etp", "unknown"] as const)("%s → 상한가 초과는 늘 잠근다 · 경고 줄 없음", (tickRule) => {
    const ctx: PadCtx = { ...WON, tickRule };
    expect(padIssue(s("127450"), "원", ctx)).toBe("상한가 127,400원을 넘을 수 없어요");
    expect(canConfirmPad(s("127450"), "원", ctx)).toBe(false);
    expect(padWarning(s("127450"), "원", ctx)).toBeNull();
  });

  it("원 단위가 아니면 경고가 없다 · 빈 값도 없다", () => {
    const ctx: PadCtx = { ...WON, tickRule: "etp" };
    expect(padWarning(s(ETF_PRICE), "주", ctx)).toBeNull();
    expect(padWarning(s(""), "원", ctx)).toBeNull();
  });

  it("priceIssueText — 잠그지 않는 호가 단위 위반은 사실만 말한다(명령형 아님)", () => {
    const off = { kind: "offTick", tick: 50, lower: 25_000, upper: 25_050 } as const;
    expect(priceIssueText(off, "etp")).toBe(SOFT);
    expect(priceIssueText(off, "unknown")).toBe(SOFT);
    expect(priceIssueText(off, "stock")).toBe(LOCK);
    expect(priceIssueText(off)).toBe(LOCK);
  });
});
