import { describe, it, expect } from "vitest";
import {
  STRATEGY_EVENT_PUBLIC_COLUMNS,
  compareStrategyEventAsc,
  isMarketStrategyEvent,
  strategyEventKey,
  toStrategyEventRow,
} from "../strategy-event";
import { condMetricLabel, orderGroupSide, reasonOperator, strategyKindLabel } from "../strategy-event-labels";
import { formatKstMs, formatSigned, orderLogLineText, strategyEventParts } from "../strategy-event-text";
import {
  FIXTURE_STOCK_NAME,
  STRATEGY_BRANCH_ROWS,
  STRATEGY_DAY_BY_NAME,
  STRATEGY_DAY_DB_ROWS,
  STRATEGY_DAY_GOLDEN,
  STRATEGY_DAY_ROWS,
  kstMs,
} from "../__fixtures__/strategy-day";

/**
 * Phase 25-01 — 전략 이벤트 계약 · 표시명 표 · 조립기(kind 3 갈래) 단위 테스트.
 *
 * 잠그는 것:
 *   ① 공개 컬럼 45 · 매퍼 결과에 주문자(`dmaUserId` / `dma_user_id`) 없음 (T-19-08 · T-25-02).
 *   ② 시각은 KST ms 3자리 · 자정 `00` (h23) — 브라우저 로캘이 달라도 같은 문자열.
 *   ③ BuyOrder 한 건이 D-05 F-A 한 줄로 조립된다 (D-09 조립기 한 곳).
 *   ④ 시세 판정은 kind 로만 한다 (빈 계좌번호로 하지 않는다 · RESEARCH Security).
 */

const EXPECTED_BUY_LINE =
  "[09:45:02.861][12451][선매수] KRX | ○○전자 | 주문 · 조건 매도잔량≤50,000 / 실측 38,200 · 근거 호가(매도1잔량 52,100→38,200) · 상한가 매수잔량 0 · 12,350×300주 · 접수 +18ms | 누적 861,800";

describe("strategy-event 계약 (Phase 25 · T-25-02)", () => {
  it("공개 컬럼은 45개이고 dma_user_id · applied_at 이 없다", () => {
    expect(STRATEGY_EVENT_PUBLIC_COLUMNS).toHaveLength(45);
    expect(new Set(STRATEGY_EVENT_PUBLIC_COLUMNS).size).toBe(45);
    expect(STRATEGY_EVENT_PUBLIC_COLUMNS).not.toContain("dma_user_id" as never);
    expect(STRATEGY_EVENT_PUBLIC_COLUMNS).not.toContain("applied_at" as never);
  });

  it("toStrategyEventRow 는 45키 camelCase 를 내고 dmaUserId 가 없다 · bigint 문자열도 number 로", () => {
    const db = STRATEGY_DAY_DB_ROWS.find((r) => r.seq === 2);
    expect(db).toBeDefined();
    const asStrings = { ...db!, seq: "2", gw_time_ms: String(db!.gw_time_ms), cum_volume: "861800", snap_qty: ["1", "2"] };
    const row = toStrategyEventRow(asStrings as never);
    expect(Object.keys(row)).toHaveLength(45);
    expect(Object.keys(row)).not.toContain("dmaUserId");
    expect(row.seq).toBe(2);
    expect(row.cumVolume).toBe(861_800);
    expect(row.snapQty).toEqual([1, 2]);
  });

  it("isMarketStrategyEvent 는 kind 1 · 2 만 참", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 99].map(isMarketStrategyEvent)).toEqual([
      false, true, true, false, false, false, false, false, false, false,
    ]);
  });

  it("strategyEventKey = gateway|journalEpoch|seq · compareStrategyEventAsc 는 gwTimeMs → gateway → seq", () => {
    const buy = STRATEGY_DAY_BY_NAME.buy12451!;
    expect(strategyEventKey(buy)).toBe("KB|ep-25|2");
    const sorted = [...STRATEGY_DAY_ROWS].reverse().sort(compareStrategyEventAsc);
    expect(sorted.map((r) => r.seq)).toEqual(STRATEGY_DAY_ROWS.map((r) => r.seq));
    const sameMs = { ...buy, gateway: "KYOBO" };
    expect(compareStrategyEventAsc(buy, sameMs)).toBeLessThan(0);
  });
});

describe("표시명 표 (D-10)", () => {
  it("모르는 코드는 원문 숫자 · 연산자는 reason_code 원문 정확 일치로만", () => {
    expect(strategyKindLabel(3)).toBe("주문");
    expect(strategyKindLabel(99)).toBe("99");
    expect(orderGroupSide(1)).toBe("buy");
    expect(orderGroupSide(5)).toBe("sell");
    expect(orderGroupSide(0)).toBeNull();
    expect(condMetricLabel(3, 1)).toBe("단건 체결");
    expect(condMetricLabel(3, 5)).toBe("단건 매도체결");
    expect(reasonOperator("PreBuy B6Buy3 매물소진(매도1호가==감시가 && 잔량<=감시수량)")).toBe("≤");
    expect(reasonOperator("PreBuy B6Buy3")).toBeNull();
    expect(reasonOperator("")).toBeNull();
  });
});

describe("조립기 (D-09 · kind 3 갈래)", () => {
  it("formatKstMs 는 KST HH:MM:SS.mmm · 자정은 00 · 유한하지 않으면 —", () => {
    expect(formatKstMs(kstMs("2026-09-29", "00:00:00.007"))).toBe("00:00:00.007");
    expect(formatKstMs(kstMs("2026-09-29", "09:45:02.861"))).toBe("09:45:02.861");
    expect(formatKstMs(kstMs("2026-09-29", "23:59:59.999"))).toBe("23:59:59.999");
    expect(formatKstMs(Number.NaN)).toBe("—");
  });

  it("formatSigned — 양수 + · 음수 U+2212 · 0", () => {
    expect(formatSigned(16_000)).toBe("+16,000");
    expect(formatSigned(-12_000)).toBe("−12,000");
    expect(formatSigned(0)).toBe("0");
  });

  it("BuyOrder 12451 → F-A 한 줄 (골든)", () => {
    const buy = STRATEGY_DAY_BY_NAME.buy12451!;
    expect(orderLogLineText(buy, FIXTURE_STOCK_NAME)).toBe(EXPECTED_BUY_LINE);
    expect(STRATEGY_DAY_GOLDEN.buy12451?.logLine).toBe(EXPECTED_BUY_LINE);
  });

  it("BuyOrder 조각 — badge 선매수 · tone buy · action 주문 · 접수 0 은 조각 생략", () => {
    const buy = STRATEGY_DAY_BY_NAME.buy12451!;
    const parts = strategyEventParts(buy, "log");
    expect(parts.badge).toBe("선매수");
    expect(parts.tone).toBe("buy");
    expect(parts.action).toBe("주문");
    expect(parts.cum).toBe("누적 861,800");
    const unmeasured = strategyEventParts({ ...buy, acceptLatencyUs: 0 }, "log");
    expect(unmeasured.body).not.toContain("접수");
  });

  it("주문번호 빈 주문 이벤트는 [—] · 시세 이벤트는 주문번호 칸이 없다", () => {
    const buy = STRATEGY_DAY_BY_NAME.buy12451!;
    expect(orderLogLineText({ ...buy, orderNo: "" }, FIXTURE_STOCK_NAME)).toMatch(/^\[09:45:02\.861\]\[—\]\[선매수\] /);
    const exposed = STRATEGY_DAY_BY_NAME.exposed!;
    expect(orderLogLineText(exposed, FIXTURE_STOCK_NAME)).toMatch(/^\[09:42:13\.215\]\[[^\]]+\] KRX \| ○○전자/);
  });
});

describe("조립기 — 시세 이벤트 · 모르는 값 (Phase 25-04 Task 1)", () => {
  const golden = (name: string): string => {
    const g = STRATEGY_DAY_GOLDEN[name];
    if (g === undefined) throw new Error(`골든 없음: ${name}`);
    return g.logLine;
  };

  it("상한가노출 exposed → F-A 골든 · 구분 칸 상한가노출 · tone market · 행위 없음", () => {
    const exposed = STRATEGY_DAY_BY_NAME.exposed!;
    expect(orderLogLineText(exposed, FIXTURE_STOCK_NAME)).toBe(
      "[09:42:13.215][상한가노출] KRX | ○○전자 | 매도잔량 185,400 | 누적 620,000",
    );
    expect(golden("exposed")).toBe(orderLogLineText(exposed, FIXTURE_STOCK_NAME));
    expect(strategyEventParts(exposed, "log")).toEqual({
      badge: "상한가노출",
      tone: "market",
      action: null,
      body: "매도잔량 185,400",
      cum: "누적 620,000",
    });
  });

  it("시초 상한가 exposedOpen → 본문 앞 「시초 상한가 · 」", () => {
    const row = STRATEGY_BRANCH_ROWS.exposedOpen!;
    expect(strategyEventParts(row, "log").body).toBe("시초 상한가 · 매도잔량 42,100");
    expect(orderLogLineText(row, FIXTURE_STOCK_NAME)).toBe(golden("exposedOpen"));
  });

  it("상한가진입 entered1(스냅 3) → 구분 「상한가진입 1차」 · 잔량/누적 즉시 · 1초 · 3초", () => {
    const row = STRATEGY_DAY_BY_NAME.entered1!;
    expect(orderLogLineText(row, FIXTURE_STOCK_NAME)).toBe(
      "[09:45:02.880][상한가진입 1차] KRX | ○○전자 | 잔량/누적 즉시 30,000/900,000 · 1초 55,000/903,000 · 3초 72,000/908,000 | 누적 900,000",
    );
    expect(golden("entered1")).toBe(orderLogLineText(row, FIXTURE_STOCK_NAME));
    const parts = strategyEventParts(row, "log");
    expect(parts.badge).toBe("상한가진입 1차");
    expect(parts.tone).toBe("market");
    expect(parts.action).toBeNull();
  });

  it("상한가진입 스냅 3개 미만 → 있는 것만 + 꼬리 「3초 전 이탈」 · 0개면 본문이 꼬리뿐 · 회차 0 은 「상한가진입」", () => {
    const short = STRATEGY_BRANCH_ROWS.enteredShort!;
    expect(strategyEventParts(short, "log").body).toBe(
      "잔량/누적 즉시 41,000/1,200,000 · 1초 38,000/1,204,000 · 3초 전 이탈",
    );
    expect(orderLogLineText(short, FIXTURE_STOCK_NAME)).toBe(golden("enteredShort"));
    const one = strategyEventParts({ ...short, snapQty: [41_000], snapCum: [1_200_000] }, "log");
    expect(one.body).toBe("잔량/누적 즉시 41,000/1,200,000 · 3초 전 이탈");
    const none = strategyEventParts({ ...short, snapQty: [], snapCum: [] }, "log");
    expect(none.body).toBe("3초 전 이탈");
    expect(strategyEventParts({ ...short, entryRound: 0 }, "log").badge).toBe("상한가진입");
  });

  it("모르는 kind(99 · group 1) → 구분 그룹 표시명 · 행위 원문 숫자 · 본문 없음 · tone unknown", () => {
    const row = STRATEGY_BRANCH_ROWS.unknownKind!;
    const parts = strategyEventParts(row, "log");
    expect(parts.badge).toBe("선매수");
    expect(parts.tone).toBe("unknown");
    expect(parts.action).toBe("99");
    expect(parts.body).toBe("");
    expect(orderLogLineText(row, FIXTURE_STOCK_NAME)).toBe(golden("unknownKind"));
    // 그룹도 없으면 구분 칸은 kind 원문 숫자
    expect(strategyEventParts({ ...row, group: 0 }, "log").badge).toBe("99");
  });

  it("group 0 주문 이벤트 → 구분 칸 원문 「0」 · tone unknown(방향을 지어내지 않는다)", () => {
    const row = STRATEGY_BRANCH_ROWS.groupZeroOrder!;
    const parts = strategyEventParts(row, "log");
    expect(parts.badge).toBe("0");
    expect(parts.tone).toBe("unknown");
    expect(parts.action).toBe("주문");
    expect(orderLogLineText(row, FIXTURE_STOCK_NAME)).toBe(golden("groupZeroOrder"));
  });
});
