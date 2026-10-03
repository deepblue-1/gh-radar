import { describe, it, expect } from "vitest";
import {
  STRATEGY_EVENT_PUBLIC_COLUMNS,
  compareStrategyEventAsc,
  isMarketStrategyEvent,
  strategyEventKey,
  toStrategyEventRow,
} from "../strategy-event";
import {
  condMetricLabel,
  orderGroupLabel,
  orderGroupOriginText,
  reasonOperator,
  strategyEventSide,
  strategyKindLabel,
} from "../strategy-event-labels";
import { formatKstMs, formatSigned, orderLogLineText, strategyEventParts, timelineStrategyText } from "../strategy-event-text";
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

  it("isMarketStrategyEvent 는 kind 1 · 2 · 10 만 참 (9 는 예약 — 거짓)", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 99].map(isMarketStrategyEvent)).toEqual([
      false, true, true, false, false, false, false, false, false, false, true, false,
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
    expect(strategyEventSide(1, 3)).toBe("buy");
    expect(strategyEventSide(5, 3)).toBe("sell");
    expect(strategyEventSide(0, 3)).toBeNull();
    expect(condMetricLabel(3, "buy")).toBe("단건 체결");
    expect(condMetricLabel(3, "sell")).toBe("단건 매도체결");
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

  it("버스트 상한가(kind 10 · quick-261003-rc4) → 구분 「버스트 상한가」 · tone market · 행위 없음 · 「조각 N · 합계 M주」 · 주문번호 칸 없음", () => {
    const exposed = STRATEGY_DAY_BY_NAME.exposed!;
    const row = { ...exposed, seq: 90, kind: 10, condActual: 3, evTradeQty: 123_456, evPrice: 12_350 };
    expect(strategyEventParts(row, "log")).toEqual({
      badge: "버스트 상한가",
      tone: "market",
      action: null,
      body: "조각 3 · 합계 123,456주",
      cum: "누적 620,000",
    });
    expect(orderLogLineText(row, FIXTURE_STOCK_NAME)).toBe(
      "[09:42:13.215][버스트 상한가] KRX | ○○전자 | 조각 3 · 합계 123,456주 | 누적 620,000",
    );
    expect(timelineStrategyText(row)).toEqual({ action: "버스트 상한가", text: "조각 3 · 합계 123,456주 · 누적 620,000" });
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

describe("골든 — 기획서 하루 흐름 + 갈래 전량 (Phase 25-04 Task 2 · D-09)", () => {
  const ALL: ReadonlyArray<readonly [string, (typeof STRATEGY_DAY_ROWS)[number]]> = [
    ...Object.entries(STRATEGY_DAY_BY_NAME),
    ...Object.entries(STRATEGY_BRANCH_ROWS),
  ];
  const ORDER_EVENTS = ALL.filter(([, row]) => !isMarketStrategyEvent(row.kind));

  it("하루 흐름은 14줄 · seq 1~14 가 시각 순 · 갈래는 12개 · 골든 표 = 두 이름 목록의 합(빠짐 · 남는 키 없음)", () => {
    expect(STRATEGY_DAY_ROWS.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    const times = STRATEGY_DAY_ROWS.map((r) => r.gwTimeMs);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(Object.keys(STRATEGY_DAY_BY_NAME)).toEqual([
      "exposed", "buy12451", "entered1", "queued12451", "fill12451", "buy12452", "queued12452",
      "buy12453", "queued12453", "fill12452", "cancel12453", "sell12454", "sell12455", "reject",
    ]);
    expect(Object.keys(STRATEGY_BRANCH_ROWS)).toEqual([
      "queuedPartial", "queuedFull", "exposedOpen", "enteredShort", "fillNegative", "cancelNoRemaining",
      "cancelOther", "cancelUnknown", "unknownKind", "groupZeroOrder", "sellFillHook", "riseRate",
    ]);
    expect(Object.values(STRATEGY_BRANCH_ROWS).every((r) => r.seq >= 101)).toBe(true);
    expect(Object.keys(STRATEGY_DAY_GOLDEN).sort()).toEqual(ALL.map(([n]) => n).sort());
  });

  it.each(ALL)("%s → 주문로그 탭 F-A 한 줄", (name, row) => {
    expect(orderLogLineText(row, FIXTURE_STOCK_NAME)).toBe(STRATEGY_DAY_GOLDEN[name]!.logLine);
  });

  it.each(ORDER_EVENTS)("%s → 오늘 주문 펼침 { action, text }", (name, row) => {
    const g = STRATEGY_DAY_GOLDEN[name]!;
    expect(g.timelineAction).toBeDefined();
    expect(timelineStrategyText(row)).toEqual({ action: g.timelineAction, text: g.timelineText });
  });

  it("두 표면은 같은 본문을 쓴다 — 펼침 text 는 [그룹 · ]본문 · 누적 (D-09 · R9)", () => {
    for (const [, row] of ORDER_EVENTS) {
      const body = strategyEventParts(row, "log").body;
      expect(strategyEventParts(row, "timeline").body).toBe(body);
      const { text } = timelineStrategyText(row);
      // 그룹 접두 = 그룹 표시명(group 0 = None 이면 접두 없음) · 조건 빈 수동/VI 주문 줄은 본문이 출처를 말해 생략
      const originInBody = row.condMetric === 0 && orderGroupOriginText(row.group) !== null;
      const prefix = (row.kind === 3 || row.kind === 6) && !originInBody ? orderGroupLabel(row.group) : null;
      const expected = [prefix, body, strategyEventParts(row, "log").cum]
        .filter((p): p is string => p !== null && p !== "")
        .join(" · ");
      expect(text).toBe(expected);
    }
  });
});

describe("조립기 — 주문 이벤트 갈래 (Phase 25-04 Task 2)", () => {
  it("대기 세 갈래 — 일반 · 일부 즉시체결 · 전량 즉시체결(행위 즉시체결 · 대기 없음)", () => {
    expect(strategyEventParts(STRATEGY_DAY_BY_NAME.queued12451!, "log")).toMatchObject({
      badge: "선매수",
      tone: "buy",
      action: "대기",
      body: "300주 · 체결예상 930,000 (900,000 + 30,000)",
    });
    expect(strategyEventParts(STRATEGY_BRANCH_ROWS.queuedPartial!, "log").body).toBe(
      "200주 · 100주 즉시체결 · 체결예상 930,000 (900,000 + 30,000)",
    );
    const full = strategyEventParts(STRATEGY_BRANCH_ROWS.queuedFull!, "log");
    expect(full.action).toBe("즉시체결");
    expect(full.body).toBe("300주 · 대기 없음");
  });

  it("첫 체결 — 행위 탭 「체결」 · 펼침 「첫 체결」(R6) · 오차 부호만(+ / U+2212 · R8)", () => {
    const fill = STRATEGY_DAY_BY_NAME.fill12451!;
    expect(strategyEventParts(fill, "log").action).toBe("체결");
    expect(strategyEventParts(fill, "timeline").action).toBe("첫 체결");
    expect(strategyEventParts(fill, "log").body).toBe("오차 +16,000");
    expect(strategyEventParts(STRATEGY_BRANCH_ROWS.fillNegative!, "log").body).toBe("오차 \u22125,000");
    expect(strategyEventParts({ ...fill, errorVolume: 0 }, "log").body).toBe("오차 0");
  });

  it("매도 주문 — tone sell · 매수1 은 bid1_price>0 일 때만 · 방식은 order_condition 표시명(없으면 생략)", () => {
    const sell = STRATEGY_DAY_BY_NAME.sell12454!;
    const parts = strategyEventParts(sell, "log");
    expect(parts.badge).toBe("호가매도");
    expect(parts.tone).toBe("sell");
    expect(parts.action).toBe("주문");
    const noBid = strategyEventParts({ ...sell, bid1Price: 0, bid1Qty: 0 }, "log").body;
    expect(noBid).not.toContain("매수1 12,350");
    expect(strategyEventParts({ ...sell, orderCondition: "" }, "log").body).toContain("12,350×600주 · 접수");
    expect(strategyEventParts({ ...sell, orderCondition: "3" }, "log").body).toContain("12,350×600주 3 · 접수");
  });

  it("근거 — 체결(매도 그룹이면 매도체결) · 체결통보 · 0 은 생략", () => {
    expect(strategyEventParts(STRATEGY_DAY_BY_NAME.sell12455!, "log").body).toContain("근거 체결(12,350 매도체결 18,000주)");
    expect(strategyEventParts(STRATEGY_BRANCH_ROWS.riseRate!, "log").body).toContain("근거 체결(12,350 체결 2,000주)");
    const hook = strategyEventParts(STRATEGY_BRANCH_ROWS.sellFillHook!, "log");
    expect(hook.badge).toBe("체결훅");
    expect(hook.tone).toBe("sell");
    expect(hook.body).toContain("근거 체결통보(12,300 50주)");
    expect(hook.body).not.toContain("조건");
  });

  it("상승률 조건 — bp → 소수 둘째 자리 %", () => {
    expect(strategyEventParts(STRATEGY_BRANCH_ROWS.riseRate!, "log").body).toMatch(/^조건 상승률≥3\.00% \/ 실측 4\.12% · /);
  });

  it("reason_code 가 표와 정확히 같지 않으면 연산자 생략(공백) — 쪼개 읽지 않는다(D-36)", () => {
    const buy = STRATEGY_DAY_BY_NAME.buy12453!;
    const body = strategyEventParts({ ...buy, reasonCode: `${buy.reasonCode} ` }, "log").body;
    expect(body).toMatch(/^조건 매수잔량 100,000 \/ 실측 100,000 · /);
  });

  it("취소 — 남은 거래량은 has_remaining 일 때만 · 예상 누적이 0 이면 C + R · 음수는 U+2212 · tone 은 그룹 방향", () => {
    const cancel = STRATEGY_DAY_BY_NAME.cancel12453!;
    expect(strategyEventParts(cancel, "log").body).toBe("매수1 이탈 · 남은 거래량 12,000 (1,100,000 − 1,088,000)");
    expect(strategyEventParts({ ...cancel, hasRemaining: false }, "log").body).toBe("매수1 이탈");
    expect(strategyEventParts({ ...cancel, expectedCum: 0 }, "log").body).toBe(
      "매수1 이탈 · 남은 거래량 12,000 (1,100,000 − 1,088,000)",
    );
    expect(
      strategyEventParts({ ...cancel, remainingVolume: -3_000, expectedCum: 1_085_000 }, "log").body,
    ).toBe("매수1 이탈 · 남은 거래량 \u22123,000 (1,085,000 − 1,088,000)");
    expect(strategyEventParts(STRATEGY_BRANCH_ROWS.cancelUnknown!, "log")).toMatchObject({
      badge: "호가매도",
      tone: "sell",
      action: "취소",
      body: "42",
    });
  });

  it("거부 — 주문번호 [—] · 사유는 서버 원문 그대로(문구 판정 없음) · 빈 문구면 행위만", () => {
    const reject = STRATEGY_DAY_BY_NAME.reject!;
    expect(orderLogLineText(reject, FIXTURE_STOCK_NAME)).toMatch(/^\[10:12:01\.004\]\[—\]\[후매수\] /);
    const odd = "취소 · 체결 | 상한가노출";
    expect(strategyEventParts({ ...reject, message: odd }, "log").body).toBe(odd);
    const empty = { ...reject, message: "" };
    expect(strategyEventParts(empty, "log").body).toBe("");
    expect(orderLogLineText(empty, FIXTURE_STOCK_NAME)).toBe("[10:12:01.004][—][후매수] KRX | ○○전자 | 거부 | 누적 1,651,200");
    expect(timelineStrategyText(empty)).toEqual({ action: "거부", text: "누적 1,651,200" });
  });

  it("펼침 그룹 접두는 주문 줄(kind 3 · 6)만 — 대기 · 첫 체결 · 취소 · 거부에는 없다(R9)", () => {
    expect(timelineStrategyText(STRATEGY_DAY_BY_NAME.sell12455!).text.startsWith("체결매도 · ")).toBe(true);
    expect(timelineStrategyText(STRATEGY_DAY_BY_NAME.queued12452!).text.startsWith("추가매수")).toBe(false);
    expect(timelineStrategyText(STRATEGY_DAY_BY_NAME.cancel12453!).text.startsWith("후매수")).toBe(false);
  });

  it("시세 이벤트를 펼침에 그리면 행위 = 구분 표시명 · text = 본문 · 누적", () => {
    expect(timelineStrategyText(STRATEGY_DAY_BY_NAME.entered1!)).toEqual({
      action: "상한가진입 1차",
      text: "잔량/누적 즉시 30,000/900,000 · 1초 55,000/903,000 · 3초 72,000/908,000 · 누적 900,000",
    });
  });

  it("formatKstMs — 자정 직후 00:00:00.007 · NaN 은 —", () => {
    expect(formatKstMs(kstMs("2026-09-30", "00:00:00.007"))).toBe("00:00:00.007");
    expect(formatKstMs(Number.NaN)).toBe("—");
  });
});

/**
 * quick-260930-e73 — gh-trade `OrderGroup` 말미 추가 7 Manual(수동) · 8 VITrigger(VI 자동주문).
 * 수동/VI 주문은 조건 필드가 비어 온다(cond_metric 0 · ev_kind 0 · reason_code "") — 조건 자리에 출처 문구를
 * 그리고, 방향은 group + kind 로 정한다. 픽스처는 건드리지 않고 기존 행을 펼쳐 만든다.
 */
const EMPTY_CONDITION = {
  condMetric: 0,
  condThreshold: 0,
  condActual: 0,
  evKind: 0,
  evPrice: 0,
  evQtyBefore: 0,
  evQtyAfter: 0,
  evTradeQty: 0,
  reasonCode: "",
} as const;

const MANUAL_BUY = { ...STRATEGY_DAY_BY_NAME.buy12451!, group: 7, ...EMPTY_CONDITION };

const EXPECTED_MANUAL_BUY_LINE =
  "[09:45:02.861][12451][수동] KRX | ○○전자 | 주문 · 수동 주문 · 12,350×300주 · 접수 +18ms | 누적 861,800";

describe("수동 · VI 주문 (quick-260930-e73)", () => {
  it("수동 매수 주문(조건 빈 값) → F-A 한 줄 · 구분 수동 · tone buy · 조건 자리 「수동 주문」", () => {
    expect(orderLogLineText(MANUAL_BUY, FIXTURE_STOCK_NAME)).toBe(EXPECTED_MANUAL_BUY_LINE);
    const parts = strategyEventParts(MANUAL_BUY, "log");
    expect(parts.badge).toBe("수동");
    expect(parts.tone).toBe("buy");
    expect(parts.action).toBe("주문");
  });

  it("수동 매수의 상한가 매수잔량은 0 일 때만 생략 — 값이 있으면 그린다", () => {
    expect(strategyEventParts(MANUAL_BUY, "log").body).not.toContain("상한가 매수잔량");
    expect(strategyEventParts({ ...MANUAL_BUY, limitBidQty: 152_000 }, "log").body).toContain("상한가 매수잔량 152,000");
  });

  it("상따 매수(group 1)는 상한가 매수잔량 0 을 그대로 그린다 — 기존 골든 바이트 동일", () => {
    const buy = STRATEGY_DAY_BY_NAME.buy12451!;
    expect(buy.limitBidQty).toBe(0);
    expect(orderLogLineText(buy, FIXTURE_STOCK_NAME)).toBe(EXPECTED_BUY_LINE);
  });

  it("펼침 — 조건 빈 수동 주문 줄은 출처를 한 번만 말한다(접두 「수동 · 」 없음)", () => {
    expect(timelineStrategyText(MANUAL_BUY)).toEqual({
      action: "주문",
      text: "수동 주문 · 12,350×300주 · 접수 +18ms · 누적 861,800",
    });
  });

  it("VI 매수 주문(group 8) → 구분 VI · tone buy · 조건 자리 「VI 자동주문」 · 펼침도 접두 없음", () => {
    const vi = { ...MANUAL_BUY, group: 8 };
    expect(orderLogLineText(vi, FIXTURE_STOCK_NAME)).toBe(
      "[09:45:02.861][12451][VI] KRX | ○○전자 | 주문 · VI 자동주문 · 12,350×300주 · 접수 +18ms | 누적 861,800",
    );
    const parts = strategyEventParts(vi, "log");
    expect(parts.badge).toBe("VI");
    expect(parts.tone).toBe("buy");
    expect(timelineStrategyText(vi)).toEqual({
      action: "주문",
      text: "VI 자동주문 · 12,350×300주 · 접수 +18ms · 누적 861,800",
    });
  });

  it("수동 매도 주문(group 7 · kind 6 · bid1 0) → tone sell · 「매수1」 조각 없음 · 조건 자리 「수동 주문」", () => {
    const sell = { ...STRATEGY_DAY_BY_NAME.sell12454!, group: 7, ...EMPTY_CONDITION, bid1Price: 0, bid1Qty: 0 };
    expect(orderLogLineText(sell, FIXTURE_STOCK_NAME)).toBe(
      "[10:11:40.210][12454][수동] KRX | ○○전자 | 주문 · 수동 주문 · 12,350×600주 지정가 · 접수 +16ms | 누적 1,640,000",
    );
    const parts = strategyEventParts(sell, "log");
    expect(parts.badge).toBe("수동");
    expect(parts.tone).toBe("sell");
    expect(parts.body).not.toContain("매수1");
    expect(timelineStrategyText(sell)).toEqual({
      action: "주문",
      text: "수동 주문 · 12,350×600주 지정가 · 접수 +16ms · 누적 1,640,000",
    });
  });

  it("조건이 실린 수동 주문 → 본문은 조건부터 · 출처 문구 없음 · 펼침 접두 「수동 · 」", () => {
    const conditioned = { ...STRATEGY_DAY_BY_NAME.buy12451!, group: 7 };
    const body = strategyEventParts(conditioned, "log").body;
    expect(body.startsWith("조건 매도잔량≤50,000 / 실측 38,200 · ")).toBe(true);
    expect(body).not.toContain("수동 주문");
    expect(timelineStrategyText(conditioned).text.startsWith("수동 · 조건 매도잔량≤50,000")).toBe(true);
  });

  it("수동(7) 대기 · 체결 · 취소 → 구분 수동 · tone buy · 거부 → tone unknown · 본문 = message 원문", () => {
    for (const name of ["queued12452", "fill12451", "cancel12453"] as const) {
      const parts = strategyEventParts({ ...STRATEGY_DAY_BY_NAME[name]!, group: 7 }, "log");
      expect(parts.badge, name).toBe("수동");
      expect(parts.tone, name).toBe("buy");
    }
    const reject = STRATEGY_DAY_BY_NAME.reject!;
    const parts = strategyEventParts({ ...reject, group: 7 }, "log");
    expect(parts.badge).toBe("수동");
    expect(parts.tone).toBe("unknown");
    expect(parts.body).toBe(reject.message);
  });

  it("VI(8) 대기 · 체결 · 취소 · 거부 → 구분 VI · tone buy", () => {
    for (const name of ["queued12452", "fill12451", "cancel12453", "reject"] as const) {
      const parts = strategyEventParts({ ...STRATEGY_DAY_BY_NAME[name]!, group: 8 }, "log");
      expect(parts.badge, name).toBe("VI");
      expect(parts.tone, name).toBe("buy");
    }
  });

  it("모르는 group 9 주문 → 구분 원문 「9」 · tone unknown · 출처 문구 없음 · 0 조각 생략 없음(D-10) · 펼침 접두 「9 · 」", () => {
    const unknown = { ...MANUAL_BUY, group: 9 };
    const parts = strategyEventParts(unknown, "log");
    expect(parts.badge).toBe("9");
    expect(parts.tone).toBe("unknown");
    expect(parts.body).toBe("상한가 매수잔량 0 · 12,350×300주 · 접수 +18ms");
    expect(timelineStrategyText(unknown).text).toBe("9 · 상한가 매수잔량 0 · 12,350×300주 · 접수 +18ms · 누적 861,800");
  });
});
