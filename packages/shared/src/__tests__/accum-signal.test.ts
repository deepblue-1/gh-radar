/**
 * quick-261018-rfy — kind 16 `AccumSignal`(매집감지) 행 → 이름 풀기.
 * 칸 매핑 정본 = 인박스 `docs/inbox/from-gh-trade/261018-accum-signal.md` 「kind 16 — 43칸 매핑 표」.
 * quick-261025-uf2 — 인박스 261025-accum-day-axis ③ 당일 칸 · message 새 꼴(day= · recent= · warn 삭제 · nxt 2값).
 */
import { describe, it, expect } from "vitest";
import {
  ACCUM_END_REASON_LABELS,
  ACCUM_STATE_LABELS,
  accumSignalOf,
} from "../accum-signal";
import type { StrategyEventRow } from "../strategy-event";

const NOTE_MESSAGE = "since=20261016|reg=101523|st=1|end=0|cyc=2|carry=0|row=1|our=0|th=100000000/30/500000000000|warn=1";
/** 새 꼴(gh-trade Phase 39) — warn= 없음 · day= · recent= · nxt= 수량 2값. */
const DAY_AXIS_MESSAGE =
  "since=20261016|reg=101523|st=1|end=0|cyc=2|carry=0|row=1|our=0|th=100000000/0/500000000000|day=-1200/9800/10400|recent=30/60|nxt=12/34";

/** 43칸이 모두 서로 다른 값인 kind 16 행 — 칸이 뒤섞이면 단언이 잡는다. */
function accumRow(over: Partial<StrategyEventRow> = {}): StrategyEventRow {
  return {
    gateway: "KB120",
    journalEpoch: "ep-34",
    seq: 77,
    tradeDate: "2026-10-18",
    gwTimeMs: 1_792_290_900_000,
    kind: 16,
    group: 0,
    exchange: "KRX",
    isin: "KR7000020008",
    stockCode: "000020",
    cumVolume: 1_234_567,
    accountNo: "",
    orderNo: "",
    price: 10_450,
    qty: 1,
    orderCondition: "",
    reasonCode: "",
    condThreshold: 1_234_000_000,
    condActual: 512,
    condMetric: 4,
    evKind: 2,
    evPrice: 10_120,
    evQtyBefore: 150_000,
    evQtyAfter: 30_000,
    evTradeQty: 120_000,
    limitBidQty: 1_518_000_000,
    bid1Price: 9_980,
    bid1Qty: 284_000_000,
    acceptLatencyUs: 0,
    immediateFillQty: 1_500,
    queueCase: 1,
    baseCum: 321_000_000_000,
    aheadQty: 45,
    expectedCum: 2,
    errorVolume: 312_000_000,
    remainingVolume: 87_000_000,
    hasRemaining: true,
    cancelReason: 0,
    resultCode: 3,
    message: NOTE_MESSAGE,
    entryRound: 0,
    snapQty: [9_900, 10_300],
    snapCum: [100_000_000, 30],
    askQtyAtLimit: 1_600_000_000,
    openAtLimit: false,
    ...over,
  };
}

describe("accumSignalOf — kind 16 43칸 → 이름 (노트 매핑 표)", () => {
  it("노트 예시 행을 모든 칸 이름으로 돌려준다", () => {
    const sig = accumSignalOf(accumRow());
    expect(sig).toEqual({
      isin: "KR7000020008",
      exchange: "KRX",
      stockCode: "000020",
      tradeDate: "2026-10-18",
      gateway: "KB120",
      gwTimeMs: 1_792_290_900_000,
      state: 1,
      endReason: 0,
      cycle: 2,
      carryDays: 0,
      buyQty: 150_000,
      buyKrw: 1_518_000_000,
      sellQty: 30_000,
      sellKrw: 284_000_000,
      netQty: 120_000,
      netKrw: 1_234_000_000,
      nxtBuyKrw: 312_000_000,
      nxtSellKrw: 87_000_000,
      avgPx: 10_120,
      loPx: 9_900,
      hiPx: 10_300,
      regPx: 9_980,
      peakNetKrw: 1_600_000_000,
      sellPhases: 3,
      maxSame: 45,
      mcapKrw: 321_000_000_000,
      ourExcludedQty: 1_500,
      lastPx: 10_450,
      rateBp: 512,
      row: 1,
      sellWarn: true,
      sellWarns: 4,
      sinceDate: "2026-10-16",
      regTime: "10:15:23",
      thNetKrw: 100_000_000,
      thMinSame: 30,
      thMaxMcapKrw: 500_000_000_000,
      dayBuyKrw: null,
      daySellKrw: null,
      dayNetKrw: null,
      dayAvgPx: null,
      dayNetQty: null,
      dayLoPx: null,
      dayHiPx: null,
      thRecentPieces: null,
      thRecentSec: null,
    });
  });

  it("매도중(2) · 청산(3) · 종료 사유 · 이월 · 행 종류 4 를 칸 그대로 옮긴다", () => {
    const sell = accumSignalOf(accumRow({ qty: 2, entryRound: 2, queueCase: 2 }));
    expect(sell?.state).toBe(2);
    expect(sell?.carryDays).toBe(2);
    expect(sell?.row).toBe(2);
    const end = accumSignalOf(accumRow({ qty: 3, cancelReason: 2, queueCase: 4 }));
    expect(end?.state).toBe(3);
    expect(end?.endReason).toBe(2);
    expect(end?.row).toBe(4);
  });

  it("종료 사유 4(매집 종료)도 칸 그대로 — 모르는 값으로 버리지 않는다", () => {
    const end = accumSignalOf(accumRow({ qty: 3, queueCase: 4, cancelReason: 4 }));
    expect(end).not.toBeNull();
    expect(end?.state).toBe(3);
    expect(end?.endReason).toBe(4);
    expect(end?.row).toBe(4);
  });

  it("NXT 칸 — errorVolume = NXT 매수 금액 · remainingVolume = NXT 매도 금액 · message 의 nxt 꼬리는 읽지 않는다", () => {
    const sig = accumSignalOf(
      accumRow({
        errorVolume: 312_000_000,
        remainingVolume: 87_000_000,
        message: `${NOTE_MESSAGE}|nxt=1/2/3/4`,
      }),
    );
    expect(sig?.nxtBuyKrw).toBe(312_000_000);
    expect(sig?.nxtSellKrw).toBe(87_000_000);
    expect(sig?.sinceDate).toBe("2026-10-16");
    expect(sig?.regTime).toBe("10:15:23");
    expect(sig?.thMaxMcapKrw).toBe(500_000_000_000);
  });

  it("옛 행 — 두 칸 0 · 꼬리 없음 → nxtBuyKrw 0 · nxtSellKrw 0 (합산 칸은 그대로)", () => {
    const sig = accumSignalOf(accumRow({ errorVolume: 0, remainingVolume: 0, message: NOTE_MESSAGE }));
    expect(sig?.nxtBuyKrw).toBe(0);
    expect(sig?.nxtSellKrw).toBe(0);
    expect(sig?.buyKrw).toBe(1_518_000_000);
    expect(sig?.sellKrw).toBe(284_000_000);
    expect(sig?.netKrw).toBe(1_234_000_000);
  });

  it("음수 순매수(netKrw) · 음수 등락률(rateBp)을 부호 그대로 둔다", () => {
    const sig = accumSignalOf(accumRow({ condThreshold: -250_000_000, condActual: -130 }));
    expect(sig?.netKrw).toBe(-250_000_000);
    expect(sig?.rateBp).toBe(-130);
  });

  it("kind ≠ 16 · isin 빈 문자열 · state ∉ {1,2,3} → null", () => {
    expect(accumSignalOf(accumRow({ kind: 15 }))).toBeNull();
    expect(accumSignalOf(accumRow({ kind: 1 }))).toBeNull();
    expect(accumSignalOf(accumRow({ isin: "" }))).toBeNull();
    expect(accumSignalOf(accumRow({ qty: 0 }))).toBeNull();
    expect(accumSignalOf(accumRow({ qty: 4 }))).toBeNull();
  });

  it("message 가 비었으면 sinceDate · regTime · thMaxMcapKrw 만 null (나머지 칸은 그대로)", () => {
    const sig = accumSignalOf(accumRow({ message: "" }));
    expect(sig).not.toBeNull();
    expect(sig?.sinceDate).toBeNull();
    expect(sig?.regTime).toBeNull();
    expect(sig?.thMaxMcapKrw).toBeNull();
    expect(sig?.netKrw).toBe(1_234_000_000);
    expect(sig?.thNetKrw).toBe(100_000_000);
    expect(sig?.cycle).toBe(2);
  });

  it("message 키가 깨지면 그 값만 null", () => {
    const bad = accumSignalOf(accumRow({ message: "since=2026-10-16|reg=1015|st=1|th=100000000/30/abc" }));
    expect(bad?.sinceDate).toBeNull();
    expect(bad?.regTime).toBeNull();
    expect(bad?.thMaxMcapKrw).toBeNull();
    const partial = accumSignalOf(accumRow({ message: "since=20261016|reg=xx|th=1/2" }));
    expect(partial?.sinceDate).toBe("2026-10-16");
    expect(partial?.regTime).toBeNull();
    expect(partial?.thMaxMcapKrw).toBeNull();
  });

  it("message 의 st/end/cyc/carry/row/our 는 읽지 않는다 — 칸이 정본", () => {
    const sig = accumSignalOf(
      accumRow({ message: "since=20261016|reg=101523|st=3|end=2|cyc=9|carry=5|row=4|our=999|th=1/2/3" }),
    );
    expect(sig?.state).toBe(1);
    expect(sig?.endReason).toBe(0);
    expect(sig?.cycle).toBe(2);
    expect(sig?.carryDays).toBe(0);
    expect(sig?.row).toBe(1);
    expect(sig?.ourExcludedQty).toBe(1_500);
    expect(sig?.thMaxMcapKrw).toBe(3);
  });

  it("매도 경보 (나) — 행 종류 5 꺼짐 에지도 통과한다 (sellWarn false · sellWarns 누적 유지)", () => {
    const off = accumSignalOf(accumRow({ queueCase: 5, hasRemaining: false, condMetric: 4 }));
    expect(off).not.toBeNull();
    expect(off?.row).toBe(5);
    expect(off?.sellWarn).toBe(false);
    expect(off?.sellWarns).toBe(4);
  });

  it("매도 경보 (나) — 종료 행 4 가 꺼짐을 대신한다 (hasRemaining false → sellWarn false)", () => {
    const end = accumSignalOf(accumRow({ qty: 3, queueCase: 4, hasRemaining: false }));
    expect(end?.state).toBe(3);
    expect(end?.row).toBe(4);
    expect(end?.sellWarn).toBe(false);
  });

  it("매도 경보 (나) — message 의 warn= 키는 읽지 않는다 (칸이 정본)", () => {
    const onKeyOffCell = accumSignalOf(
      accumRow({ hasRemaining: false, message: "since=20261016|reg=101523|st=1|row=1|th=1/2/3|warn=1" }),
    );
    expect(onKeyOffCell?.sellWarn).toBe(false);
    const offKeyOnCell = accumSignalOf(
      accumRow({ hasRemaining: true, message: "since=20261016|reg=101523|st=1|row=1|th=1/2/3|warn=0" }),
    );
    expect(offKeyOnCell?.sellWarn).toBe(true);
  });

  it("매도 경보 (나) — condMetric 255 는 그대로 (상한 자르기는 서버 몫)", () => {
    expect(accumSignalOf(accumRow({ condMetric: 255 }))?.sellWarns).toBe(255);
  });

  it("snapQty / snapCum 길이 < 2 → 빠진 원소 0", () => {
    const sig = accumSignalOf(accumRow({ snapQty: [9_900], snapCum: [] }));
    expect(sig?.loPx).toBe(9_900);
    expect(sig?.hiPx).toBe(0);
    expect(sig?.thNetKrw).toBe(0);
    expect(sig?.thMinSame).toBe(0);
    expect(sig?.dayBuyKrw).toBeNull();
    expect(sig?.daySellKrw).toBeNull();
    expect(sig?.dayNetKrw).toBeNull();
    expect(sig?.dayAvgPx).toBeNull();
  });

  it("상태 · 종료 사유 문구 (gh-trade 클라 동형 — 배지는 「청산」 하나)", () => {
    expect(ACCUM_STATE_LABELS).toEqual({ 1: "매집중", 2: "매도중", 3: "청산" });
    expect(ACCUM_END_REASON_LABELS).toEqual({
      1: "청산 — 순매수 1억 미만(다시 1억 이상이면 같은 사이클로 재등장)",
      2: "서버 재기동 때 복원 안 됨",
      3: "이월 10일 만료",
      4: "매집 종료 — 청산 뒤 순매수가 사이클 최고의 −30% 이하(최고 10억 → −3억)",
    });
  });
});

/** 새 꼴 kind 16 행(snap 길이 3 · acceptLatencyUs = 당일 매수 평단 · 새 message). */
function dayAxisRow(over: Partial<StrategyEventRow> = {}): StrategyEventRow {
  return accumRow({
    snapQty: [9_900, 10_300, 1_234_000_000],
    snapCum: [100_000_000, 0, 456_000_000],
    acceptLatencyUs: 10_250,
    message: DAY_AXIS_MESSAGE,
    ...over,
  });
}

describe("accumSignalOf — 당일 축(quick-261025-uf2 · 인박스 261025-accum-day-axis ③)", () => {
  it("새 행 — 당일 칸 3(snapQty[2] · snapCum[2] · acceptLatencyUs) · day= 3값 · recent= 2값", () => {
    const sig = accumSignalOf(dayAxisRow());
    expect(sig).toMatchObject({
      dayBuyKrw: 1_234_000_000,
      daySellKrw: 456_000_000,
      dayNetKrw: 778_000_000,
      dayAvgPx: 10_250,
      dayNetQty: -1200,
      dayLoPx: 9_800,
      dayHiPx: 10_400,
      thRecentPieces: 30,
      thRecentSec: 60,
      sinceDate: "2026-10-16",
      regTime: "10:15:23",
      thNetKrw: 100_000_000,
      thMinSame: 0,
      thMaxMcapKrw: 500_000_000_000,
      loPx: 9_900,
      hiPx: 10_300,
    });
  });

  it("새 행 warn= 없음 — sellWarn 은 hasRemaining 칸 그대로", () => {
    expect(accumSignalOf(dayAxisRow({ hasRemaining: true }))?.sellWarn).toBe(true);
    expect(accumSignalOf(dayAxisRow({ hasRemaining: false }))?.sellWarn).toBe(false);
  });

  it("당일 매수 없음(길이 3 · 0) → 0 그대로(null 아님)", () => {
    const sig = accumSignalOf(
      dayAxisRow({ snapQty: [9_900, 10_300, 0], snapCum: [100_000_000, 0, 0], acceptLatencyUs: 0 }),
    );
    expect(sig?.dayBuyKrw).toBe(0);
    expect(sig?.daySellKrw).toBe(0);
    expect(sig?.dayNetKrw).toBe(0);
    expect(sig?.dayAvgPx).toBe(0);
  });

  it("길이 섞임(한쪽만 3) → 당일 칸 4개 모두 null", () => {
    for (const over of [
      { snapQty: [9_900, 10_300, 1_234_000_000], snapCum: [100_000_000, 0] },
      { snapQty: [9_900, 10_300], snapCum: [100_000_000, 0, 456_000_000] },
    ]) {
      const sig = accumSignalOf(dayAxisRow(over));
      expect(sig?.dayBuyKrw).toBeNull();
      expect(sig?.daySellKrw).toBeNull();
      expect(sig?.dayNetKrw).toBeNull();
      expect(sig?.dayAvgPx).toBeNull();
      expect(sig?.loPx).toBe(9_900);
    }
  });

  it("day= 깨짐 → dayNetQty · dayLoPx · dayHiPx 셋 다 null(다른 키는 그대로)", () => {
    for (const day of ["1/2", "a/1/2", "1/-2/3", ""]) {
      const sig = accumSignalOf(dayAxisRow({ message: DAY_AXIS_MESSAGE.replace("day=-1200/9800/10400", `day=${day}`) }));
      expect(sig?.dayNetQty).toBeNull();
      expect(sig?.dayLoPx).toBeNull();
      expect(sig?.dayHiPx).toBeNull();
      expect(sig?.thRecentPieces).toBe(30);
      expect(sig?.thRecentSec).toBe(60);
      expect(sig?.sinceDate).toBe("2026-10-16");
      expect(sig?.thMaxMcapKrw).toBe(500_000_000_000);
      expect(sig?.dayBuyKrw).toBe(1_234_000_000);
    }
  });

  it("recent= 깨짐 → thRecentPieces · thRecentSec 둘 다 null(다른 키는 그대로)", () => {
    for (const recent of ["30", "30/x", "-1/60", "30/60/9"]) {
      const sig = accumSignalOf(dayAxisRow({ message: DAY_AXIS_MESSAGE.replace("recent=30/60", `recent=${recent}`) }));
      expect(sig?.thRecentPieces).toBeNull();
      expect(sig?.thRecentSec).toBeNull();
      expect(sig?.dayNetQty).toBe(-1200);
      expect(sig?.regTime).toBe("10:15:23");
    }
  });

  it("message 빈 문자열 → day · recent 5값 null · 당일 칸 4값은 그대로", () => {
    const sig = accumSignalOf(dayAxisRow({ message: "" }));
    expect(sig?.dayNetQty).toBeNull();
    expect(sig?.dayLoPx).toBeNull();
    expect(sig?.dayHiPx).toBeNull();
    expect(sig?.thRecentPieces).toBeNull();
    expect(sig?.thRecentSec).toBeNull();
    expect(sig?.dayBuyKrw).toBe(1_234_000_000);
    expect(sig?.daySellKrw).toBe(456_000_000);
    expect(sig?.dayNetKrw).toBe(778_000_000);
    expect(sig?.dayAvgPx).toBe(10_250);
  });
});
